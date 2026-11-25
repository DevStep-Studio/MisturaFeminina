<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProductDocumentProcessor
{
    public function __construct(
        private readonly PromptInjectionGuard $guard,
        private readonly AIProviderService $provider,
    ) {}

    /**
     * Extracts normalized candidate rows and document evidence from spreadsheets (.csv, .xlsx),
     * supplier datasheets (.pdf), images (.jpg, .png, .webp), pasted text or natural-language prompts.
     *
     * @param  list<UploadedFile>  $files
     * @param  array<string, mixed>  $contextParameters
     * @return array{source_type: string, filenames: list<string>, file_hash: string, rows: list<array<string, mixed>>, blocked_injections: list<string>, document_metadata: array<string, mixed>, raw_extracted_text: string}
     */
    public function extract(array $files, ?string $rawText = null, ?string $instruction = null, array $contextParameters = []): array
    {
        $allRows = [];
        $filenames = [];
        $blockedInjections = [];
        $docMeta = [];
        $extractedChunks = [];
        $sourceTypes = [];
        $hashParts = [];

        foreach ($files as $file) {
            $ext = strtolower($file->getClientOriginalExtension() ?: $file->guessExtension() ?: '');
            $origName = $file->getClientOriginalName() ?: "arquivo.{$ext}";
            $filenames[] = $origName;
            $bytes = file_get_contents($file->getRealPath() ?: $file->getPathname()) ?: '';
            $hashParts[] = hash('sha256', $bytes);

            if (in_array($ext, ['csv', 'txt', 'tsv'], true)) {
                $sourceTypes[] = 'csv';
                $guard = $this->guard->inspect($bytes, $origName);
                if ($guard['has_injection']) {
                    array_push($blockedInjections, ...$guard['matched_patterns']);
                }
                $extractedChunks[] = $guard['cleaned_text'];
                array_push($allRows, ...$this->parseTabularString($guard['cleaned_text'], $origName));
            } elseif ($ext === 'xlsx') {
                $sourceTypes[] = 'xlsx';
                $xlsxResult = $this->parseXlsx($file->getRealPath() ?: $file->getPathname(), $origName);
                array_push($blockedInjections, ...$xlsxResult['blocked_injections']);
                array_push($allRows, ...$xlsxResult['rows']);
                if ($xlsxResult['raw_text'] !== '') {
                    $extractedChunks[] = $xlsxResult['raw_text'];
                }
            } elseif ($ext === 'pdf') {
                $sourceTypes[] = 'pdf';
                $pdfResult = $this->parsePdf($bytes, $origName);
                array_push($blockedInjections, ...$pdfResult['blocked_injections']);
                $docMeta = array_merge($docMeta, $pdfResult['metadata']);
                if ($pdfResult['raw_text'] !== '') {
                    $extractedChunks[] = $pdfResult['raw_text'];
                }
                array_push($allRows, ...$pdfResult['rows']);
            } elseif (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true)) {
                $sourceTypes[] = 'image';
                $imgResult = $this->processImage($bytes, $ext, $origName, $instruction);
                array_push($allRows, ...$imgResult['rows']);
                $docMeta['image_analysis'] = $imgResult['meta'];
                if (! empty($imgResult['image_url'])) {
                    $docMeta['uploaded_images'][] = $imgResult['image_url'];
                }
            }
        }

        if ($rawText !== null && trim($rawText) !== '') {
            $hashParts[] = hash('sha256', $rawText);
            $guard = $this->guard->inspect($rawText, 'pasted_text');
            if ($guard['has_injection']) {
                array_push($blockedInjections, ...$guard['matched_patterns']);
            }
            $clean = trim($guard['cleaned_text']);
            $extractedChunks[] = $clean;
            $tabular = $this->parseTabularString($clean, 'texto_colado');
            if ($tabular !== []) {
                $sourceTypes[] = 'spreadsheet';
                array_push($allRows, ...$tabular);
            } else {
                $sourceTypes[] = 'text';
                array_push($allRows, ...$this->parseNaturalLanguageDescription($clean, 'descricao_textual'));
            }
        }

        if ($instruction !== null && trim($instruction) !== '') {
            $hashParts[] = hash('sha256', $instruction);
            $guard = $this->guard->inspect($instruction, 'conversational_instruction');
            if ($guard['has_injection']) {
                array_push($blockedInjections, ...$guard['matched_patterns']);
            }
            $cleanInstr = trim($guard['cleaned_text']);
            $extractedChunks[] = $cleanInstr;
            $nlContext = $this->parseContextDefaultsFromText($cleanInstr);
            $contextParameters = array_merge($nlContext, $contextParameters);

            if ($allRows === []) {
                $sourceTypes[] = 'conversational';
                $nlRows = $this->parseNaturalLanguageDescription($cleanInstr, 'instrucao_conversacional');
                array_push($allRows, ...$nlRows);
            }
        }

        // Apply conversational/context defaults onto extracted rows when a row lacks brand/volume/price/stock
        foreach ($allRows as &$row) {
            if (empty($row['brand']) && ! empty($contextParameters['brand'])) {
                $row['brand'] = (string) $contextParameters['brand'];
                $row['evidence']['brand'] = 'provided_context';
            }
            if (empty($row['volume']) && ! empty($contextParameters['volume'])) {
                $row['volume'] = (string) $contextParameters['volume'];
                $row['evidence']['volume'] = 'provided_context';
            }
            if (($row['sale_price_cents'] ?? null) === null && ! empty($contextParameters['sale_price_cents'])) {
                $row['sale_price_cents'] = (int) $contextParameters['sale_price_cents'];
                $row['evidence']['sale_price'] = 'provided_context';
            }
            if (($row['stock_qty'] ?? null) === null && isset($contextParameters['stock_qty'])) {
                $row['stock_qty'] = (int) $contextParameters['stock_qty'];
                $row['evidence']['stock_qty'] = 'provided_context';
            }
            if (empty($row['ingredients']) && ! empty($docMeta['ingredients'])) {
                $row['ingredients'] = $docMeta['ingredients'];
                $row['evidence']['ingredients'] = 'provided_document';
            }
            if (empty($row['usage_instructions']) && ! empty($docMeta['usage_instructions'])) {
                $row['usage_instructions'] = $docMeta['usage_instructions'];
                $row['evidence']['usage_instructions'] = 'provided_document';
            }
            if (empty($row['manufacturer']) && ! empty($docMeta['manufacturer'])) {
                $row['manufacturer'] = $docMeta['manufacturer'];
                $row['evidence']['manufacturer'] = 'provided_document';
            }
        }
        unset($row);

        $uniqueSources = array_values(array_unique($sourceTypes));
        $finalSourceType = count($uniqueSources) === 1 ? $uniqueSources[0] : ($uniqueSources[0] ?? 'text');

        return [
            'source_type' => $finalSourceType,
            'filenames' => $filenames,
            'file_hash' => hash('sha256', implode('|', $hashParts) ?: Str::random(16)),
            'rows' => $allRows,
            'blocked_injections' => array_values(array_unique($blockedInjections)),
            'document_metadata' => $docMeta,
            'raw_extracted_text' => implode("\n---\n", $extractedChunks),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function parseTabularString(string $content, string $origin): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($content)) ?: [];
        if (count($lines) === 0) {
            return [];
        }

        $firstLine = $lines[0];
        $delimiter = str_contains($firstLine, "\t") ? "\t" : (str_contains($firstLine, ';') ? ';' : ',');
        if (substr_count($firstLine, $delimiter) === 0) {
            return [];
        }

        $matrix = [];
        foreach ($lines as $line) {
            if (trim($line) === '') {
                continue;
            }
            $matrix[] = array_map(fn (string $c): string => trim($c), str_getcsv($line, $delimiter));
        }

        return $this->mapMatrixToRows($matrix, $origin);
    }

    /**
     * Native XLSX parser using ZipArchive + SimpleXML so `.xlsx` supplier spreadsheets work without extra binaries.
     *
     * @return array{rows: list<array<string, mixed>>, blocked_injections: list<string>, raw_text: string}
     */
    private function parseXlsx(string $path, string $origin): array
    {
        if (! class_exists(\ZipArchive::class)) {
            return ['rows' => [], 'blocked_injections' => [], 'raw_text' => ''];
        }

        $zip = new \ZipArchive;
        if ($zip->open($path) !== true) {
            return ['rows' => [], 'blocked_injections' => [], 'raw_text' => ''];
        }

        $sharedStrings = [];
        $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
        if (is_string($sharedXml)) {
            $sx = @simplexml_load_string($sharedXml);
            if ($sx !== false) {
                foreach ($sx->si as $si) {
                    if (isset($si->t)) {
                        $sharedStrings[] = (string) $si->t;
                    } elseif (isset($si->r)) {
                        $buf = '';
                        foreach ($si->r as $r) {
                            $buf .= (string) ($r->t ?? '');
                        }
                        $sharedStrings[] = $buf;
                    }
                }
            }
        }

        $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();

        if (! is_string($sheetXml)) {
            return ['rows' => [], 'blocked_injections' => [], 'raw_text' => ''];
        }

        $sx = @simplexml_load_string($sheetXml);
        if ($sx === false || ! isset($sx->sheetData->row)) {
            return ['rows' => [], 'blocked_injections' => [], 'raw_text' => ''];
        }

        $matrix = [];
        $blocked = [];
        $rawLines = [];

        foreach ($sx->sheetData->row as $xmlRow) {
            $rowCells = [];
            foreach ($xmlRow->c as $cell) {
                $ref = (string) ($cell['r'] ?? '');
                $colIdx = $this->excelColumnToIndex($ref);
                $type = (string) ($cell['t'] ?? '');
                $val = '';
                if ($type === 's') {
                    $val = $sharedStrings[(int) $cell->v] ?? '';
                } elseif ($type === 'inlineStr') {
                    $val = (string) ($cell->is->t ?? '');
                } else {
                    $val = (string) ($cell->v ?? '');
                }

                $guard = $this->guard->inspect($val, $origin);
                if ($guard['has_injection']) {
                    array_push($blocked, ...$guard['matched_patterns']);
                }
                while (count($rowCells) < $colIdx) {
                    $rowCells[] = '';
                }
                $rowCells[$colIdx] = trim($guard['cleaned_text']);
            }
            if (array_filter($rowCells, fn (string $v): bool => $v !== '') !== []) {
                $matrix[] = $rowCells;
                $rawLines[] = implode(' | ', $rowCells);
            }
        }

        return [
            'rows' => $this->mapMatrixToRows($matrix, $origin),
            'blocked_injections' => array_values(array_unique($blocked)),
            'raw_text' => implode("\n", $rawLines),
        ];
    }

    /** @return array{rows: list<array<string, mixed>>, blocked_injections: list<string>, metadata: array<string, mixed>, raw_text: string} */
    private function parsePdf(string $bytes, string $origin): array
    {
        $text = '';
        if (preg_match_all('/\(([^\)]{2,250})\)\s*Tj/s', $bytes, $matches)) {
            $text = implode("\n", array_map(fn (string $s): string => stripcslashes($s), $matches[1]));
        }
        if (trim($text) === '') {
            // Fallback: extract printable UTF-8/ASCII text blocks inside PDF streams
            $ascii = preg_replace('/[^\PC\s]/u', ' ', $bytes) ?? '';
            if (preg_match_all('/[A-Za-zÀ-ÿ0-9.,:;\/\-\+\(\)%\s]{10,}/u', $ascii, $chunks)) {
                $filtered = array_filter($chunks[0], fn (string $c): bool => ! preg_match('/^(obj|endobj|stream|endstream|xref|trailer)/', trim($c)));
                $text = implode("\n", array_slice(array_values($filtered), 0, 80));
            }
        }

        $guard = $this->guard->inspect($text, $origin);
        $clean = $guard['cleaned_text'];

        $metadata = [];
        if (preg_match('/(?:composi[cç][aã]o|ingredientes?)\s*:\s*([^\n]+)/iu', $clean, $m)) {
            $metadata['ingredients'] = trim($m[1]);
        }
        if (preg_match('/(?:modo\s+de\s+uso|instru[cç][õo]es\s+de\s+uso)\s*:\s*([^\n]+)/iu', $clean, $m)) {
            $metadata['usage_instructions'] = trim($m[1]);
        }
        if (preg_match('/(?:advert[eê]ncias?|precau[cç][õo]es?)\s*:\s*([^\n]+)/iu', $clean, $m)) {
            $metadata['warnings'] = trim($m[1]);
        }
        if (preg_match('/(?:fabricante|importador)\s*:\s*([^\n]+)/iu', $clean, $m)) {
            $metadata['manufacturer'] = trim($m[1]);
        }
        if (preg_match('/(?:anvisa|processo|registro)\s*[:nº°]*\s*([0-9.\-\/]+)/iu', $clean, $m)) {
            $metadata['regulatory_id'] = trim($m[1]);
        }

        $rows = [];
        if (preg_match('/(?:produto|nome)\s*:\s*([^\n]+)/iu', $clean, $prodMatch)) {
            preg_match('/(?:marca)\s*:\s*([^\n]+)/iu', $clean, $brandMatch);
            preg_match('/(\d+(?:[.,]\d+)?\s*(?:ml|g|l|kg|un|w))\b/iu', $clean, $volMatch);
            preg_match('/(?:sku|refer[eê]ncia|ref)\s*:\s*([A-Za-z0-9\-_]+)/iu', $clean, $skuMatch);
            $rows[] = [
                'row_index' => 0,
                'origin_file' => $origin,
                'origin_detail' => 'PDF página 1',
                'product_name' => trim($prodMatch[1]),
                'brand' => isset($brandMatch[1]) ? trim($brandMatch[1]) : null,
                'category' => null,
                'variant_name' => 'Padrão',
                'shade_code' => null,
                'color_family' => null,
                'color_hex' => null,
                'volume' => isset($volMatch[1]) ? trim($volMatch[1]) : null,
                'sku' => isset($skuMatch[1]) ? strtoupper(trim($skuMatch[1])) : null,
                'gtin' => null,
                'cost_price_cents' => null,
                'sale_price_cents' => null,
                'promo_price_cents' => null,
                'stock_qty' => null,
                'ingredients' => $metadata['ingredients'] ?? null,
                'usage_instructions' => $metadata['usage_instructions'] ?? null,
                'manufacturer' => $metadata['manufacturer'] ?? null,
                'warnings' => $metadata['warnings'] ?? null,
                'regulatory_id' => $metadata['regulatory_id'] ?? null,
                'description_raw' => mb_substr($clean, 0, 1200),
                'evidence' => [
                    'product_name' => 'provided_document',
                    'ingredients' => ! empty($metadata['ingredients']) ? 'provided_document' : 'missing',
                    'usage_instructions' => ! empty($metadata['usage_instructions']) ? 'provided_document' : 'missing',
                ],
            ];
        } else {
            $rows = $this->parseNaturalLanguageDescription($clean, $origin);
        }

        return [
            'rows' => $rows,
            'blocked_injections' => $guard['matched_patterns'],
            'metadata' => $metadata,
            'raw_text' => $clean,
        ];
    }

    /** @return array{rows: list<array<string, mixed>>, meta: array<string, mixed>, image_url?: string} */
    private function processImage(string $bytes, string $ext, string $origin, ?string $instruction = null): array
    {
        $conn = $this->provider->connectionStatus();
        $mime = $ext === 'jpg' ? 'jpeg' : $ext;
        $dataUrl = "data:image/{$mime};base64,".base64_encode($bytes);

        $safeExt = $ext === 'jpeg' ? 'jpg' : $ext;
        $relPath = 'ai-imports/'.now()->format('Y/m').'/'.Str::random(16).'.'.$safeExt;
        Storage::disk('public')->put($relPath, $bytes);
        $imageUrl = '/storage/'.$relPath;

        $combinedHint = mb_strtolower($origin.' '.($instruction ?? ''));
        $looksLikeEquipment = preg_match('/\b(cabine|luminaria|luminária|motor|micromotor|lixa eletrica|secador|estufa|aspirador|autoclave)\b/iu', $combinedHint) === 1;

        if ($conn['has_api_key']) {
            $resp = $this->provider->chatStructured(
                'catalog',
                'Extraia SOMENTE informações visíveis na embalagem ou etiqueta do produto. '
                .'Se não conseguir ler com segurança (especialmente potência em Watts W de equipamentos, volume ou código), retorne vazio ou "Informação não identificada — revisar". '
                .'NUNCA invente potência elétrica, ingredientes, composição química ou registro ANVISA.',
                'Leia os dados visíveis nesta imagem de produto.',
                [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['product_name', 'brand', 'volume', 'variant_name', 'reference'],
                    'properties' => [
                        'product_name' => ['type' => 'string'],
                        'brand' => ['type' => 'string'],
                        'volume' => ['type' => 'string'],
                        'variant_name' => ['type' => 'string'],
                        'reference' => ['type' => 'string'],
                        'power_watts' => ['type' => ['integer', 'null']],
                    ],
                ],
                [$dataUrl]
            );

            $c = is_array($resp['content'] ?? null) ? $resp['content'] : null;
            if ($c !== null) {
                $pName = (string) ($c['product_name'] ?? 'Informação não identificada — revisar');
                $isEquip = $looksLikeEquipment || preg_match('/\b(cabine|luminaria|luminária|motor|micromotor|secador|estufa|aspirador)\b/iu', $pName) === 1;
                $powerWatts = isset($c['power_watts']) && is_numeric($c['power_watts']) && (int) $c['power_watts'] > 0
                    ? (int) $c['power_watts']
                    : null;

                return [
                    'image_url' => $imageUrl,
                    'meta' => ['vision_used' => true, 'status' => 'extracted', 'image_url' => $imageUrl],
                    'rows' => [[
                        'row_index' => 0,
                        'origin_file' => $origin,
                        'origin_detail' => 'Imagem analisada via visão IA',
                        'product_name' => $pName,
                        'brand' => (string) ($c['brand'] ?? '') ?: null,
                        'category' => null,
                        'variant_name' => (string) ($c['variant_name'] ?? 'Padrão'),
                        'shade_code' => null,
                        'color_family' => null,
                        'color_hex' => null,
                        'volume' => (string) ($c['volume'] ?? '') ?: null,
                        'sku' => (string) ($c['reference'] ?? '') ?: null,
                        'supplier_code' => null,
                        'gtin' => null,
                        'power_watts' => $powerWatts,
                        'is_equipment' => $isEquip,
                        'cost_price_cents' => null,
                        'sale_price_cents' => null,
                        'promo_price_cents' => null,
                        'stock_qty' => null,
                        'ingredients' => null,
                        'usage_instructions' => null,
                        'manufacturer' => null,
                        'description_raw' => null,
                        'evidence' => [
                            'source' => 'image_vision',
                            'image_url' => $imageUrl,
                            'image_path' => $relPath,
                            'ingredients' => 'missing',
                            'power_watts' => $powerWatts ? 'provided_vision' : ($isEquip ? 'missing_illegible' : 'not_applicable'),
                        ],
                    ]],
                ];
            }
        }

        // Without connected multimodal LLM vision, never hallucinate label text or technical wattage
        return [
            'image_url' => $imageUrl,
            'meta' => ['vision_used' => false, 'status' => 'Informação não identificada — revisar', 'image_url' => $imageUrl],
            'rows' => [[
                'row_index' => 0,
                'origin_file' => $origin,
                'origin_detail' => "Imagem {$origin} (leitura visual requer conferência manual ou provedor de visão ativo)",
                'product_name' => pathinfo($origin, PATHINFO_FILENAME).' — Informação não identificada — revisar',
                'brand' => null,
                'category' => null,
                'variant_name' => 'Padrão',
                'shade_code' => null,
                'color_family' => null,
                'color_hex' => null,
                'volume' => null,
                'sku' => null,
                'supplier_code' => null,
                'gtin' => null,
                'power_watts' => null,
                'is_equipment' => $looksLikeEquipment,
                'cost_price_cents' => null,
                'sale_price_cents' => null,
                'promo_price_cents' => null,
                'stock_qty' => null,
                'ingredients' => null,
                'usage_instructions' => null,
                'manufacturer' => null,
                'description_raw' => null,
                'evidence' => [
                    'product_name' => 'missing',
                    'image' => 'provided_file',
                    'image_url' => $imageUrl,
                    'image_path' => $relPath,
                    'power_watts' => $looksLikeEquipment ? 'missing_illegible' : 'not_applicable',
                ],
            ]],
        ];
    }

    /**
     * Converts flexible spreadsheet matrices (handling supplier headers like Referência, Qtd., Tom, Custo, EAN)
     * into normalized structured candidate rows.
     *
     * @param  list<list<string>>  $matrix
     * @return list<array<string, mixed>>
     */
    private function mapMatrixToRows(array $matrix, string $origin): array
    {
        if ($matrix === []) {
            return [];
        }

        $headers = array_map(fn (string $h): string => Str::ascii(mb_strtolower(trim($h))), $matrix[0]);
        $hasHeader = collect($headers)->contains(
            fn (string $h): bool => preg_match('/\b(nome|produto|sku|referencia|ref|preco|custo|valor|estoque|qtd|cor|tom|tonalidade|marca|categoria|ean|gtin)\b/', $h) === 1
        );

        $colMap = ['product_name', 'sku', 'sale_price_cents', 'stock_qty', 'variant_name'];
        $startRow = 0;

        if ($hasHeader) {
            $startRow = 1;
            $colMap = array_map(function (string $h): string {
                return match (true) {
                    str_contains($h, 'forn') && (str_contains($h, 'cod') || str_contains($h, 'ref')) => 'supplier_code',
                    str_contains($h, 'sku') || str_contains($h, 'referencia') || $h === 'ref' || str_contains($h, 'ref.') => 'sku',
                    str_contains($h, 'ean') || str_contains($h, 'gtin') || str_contains($h, 'barras') => 'gtin',
                    str_contains($h, 'custo') => 'cost_price_cents',
                    str_contains($h, 'promo') => 'promo_price_cents',
                    str_contains($h, 'preco') || str_contains($h, 'valor') => 'sale_price_cents',
                    str_contains($h, 'estoq') || str_contains($h, 'qtd') || str_contains($h, 'quant') || str_contains($h, 'saldo') => 'stock_qty',
                    str_contains($h, 'marca') => 'brand',
                    str_contains($h, 'linha') => 'product_line',
                    str_contains($h, 'categ') => 'category',
                    str_contains($h, 'potenc') || str_contains($h, 'watts') => 'power_watts',
                    str_contains($h, 'envio') || str_contains($h, 'frete') || str_contains($h, 'bruto') => 'shipping_weight_grams',
                    str_contains($h, 'volume') || str_contains($h, 'peso') || str_contains($h, 'tamanho') => 'volume',
                    str_contains($h, 'numero') || (str_contains($h, 'cod') && str_contains($h, 'cor')) => 'shade_code',
                    str_contains($h, 'famil') => 'color_family',
                    str_contains($h, 'hex') => 'color_hex',
                    $h === 'tom' || str_contains($h, 'tonal') || str_contains($h, 'variac') || $h === 'cor' => 'variant_name',
                    str_contains($h, 'desc') => 'description_raw',
                    default => 'product_name',
                };
            }, $headers);
        }

        $rows = [];
        for ($r = $startRow; $r < count($matrix); $r++) {
            $cells = $matrix[$r];
            $item = [
                'row_index' => count($rows),
                'origin_file' => $origin,
                'origin_detail' => 'Linha '.($r + 1),
                'product_name' => '',
                'product_line' => null,
                'brand' => null,
                'category' => null,
                'variant_name' => null,
                'shade_code' => null,
                'color_family' => null,
                'color_hex' => null,
                'volume' => null,
                'sku' => null,
                'supplier_code' => null,
                'gtin' => null,
                'power_watts' => null,
                'shipping_weight_grams' => null,
                'cost_price_cents' => null,
                'sale_price_cents' => null,
                'promo_price_cents' => null,
                'stock_qty' => null,
                'ingredients' => null,
                'usage_instructions' => null,
                'manufacturer' => null,
                'description_raw' => null,
                'evidence' => [
                    'source_columns' => $hasHeader ? $matrix[0] : [],
                    'raw_snippet' => implode(' | ', $cells),
                ],
            ];

            foreach ($cells as $cIdx => $cell) {
                $field = $colMap[$cIdx] ?? null;
                $val = trim($cell);
                if ($field === null || $val === '') {
                    continue;
                }

                if ($field === 'sale_price_cents' || $field === 'cost_price_cents' || $field === 'promo_price_cents') {
                    $item[$field] = $this->parseMoneyToCents($val);
                } elseif ($field === 'stock_qty') {
                    $cleanInt = preg_replace('/[^\d-]/', '', $val) ?? '';
                    $item['stock_qty'] = $cleanInt !== '' ? (int) $cleanInt : -1;
                } elseif ($field === 'power_watts') {
                    $cleanInt = preg_replace('/[^\d]/', '', $val) ?? '';
                    $item['power_watts'] = $cleanInt !== '' && (int) $cleanInt > 0 ? (int) $cleanInt : null;
                } elseif ($field === 'shipping_weight_grams') {
                    $cleanInt = preg_replace('/[^\d]/', '', $val) ?? '';
                    $item['shipping_weight_grams'] = $cleanInt !== '' && (int) $cleanInt > 0 ? (int) $cleanInt : null;
                } elseif ($field === 'sku') {
                    $item['sku'] = strtoupper($val);
                } elseif ($field === 'gtin' || $field === 'supplier_code') {
                    // Always preserve as exact string so leading zeros never disappear
                    $item[$field] = (string) $val;
                } elseif ($field === 'product_name' && $item['product_name'] !== '') {
                    // Append secondary name token instead of overwriting when unmapped column hits
                    $item['product_name'] .= ' '.$val;
                } else {
                    $item[$field] = $val;
                }
            }

            if ($item['product_name'] === '' && ! empty($item['variant_name'])) {
                $item['product_name'] = (string) $item['variant_name'];
            }
            if ($item['product_name'] === '' && empty($item['sku'])) {
                continue;
            }

            $rows[] = $item;
        }

        return $rows;
    }

    /**
     * Parses free-form Portuguese catalog requests such as:
     * "Cadastre a linha de esmaltes em gel da marca X, 15 ml, nas cores Nude 017, Nude 018, Rosa 042 e Vermelho 005. Todos custam R$ 19,90 e possuem estoque inicial de 10 unidades."
     *
     * @return list<array<string, mixed>>
     */
    private function parseNaturalLanguageDescription(string $text, string $origin): array
    {
        $defaults = $this->parseContextDefaultsFromText($text);
        $baseProduct = $defaults['product_line'] ?? null;

        // Check multi-line supplier/catalog pasted list (e.g. "- Gel 15 g - R$ 12,50 | SKU: GEL01")
        $lines = array_values(array_filter(array_map('trim', preg_split('/\r\n|\r|\n/', $text) ?: []), fn (string $l): bool => $l !== ''));
        $isSupplierCostList = preg_match('/\b(lista\s+de\s+custo|tabela\s+(?:do\s+)?fornecedor|pre[cç]o\s+de\s+custo|custo\s+fornecedor|fornecedor)\b/iu', $text) === 1;

        if (count($lines) >= 2 && preg_match('/(?:cores|tonalidades)\s*:/iu', $text) !== 1) {
            $multiRows = [];
            foreach ($lines as $idx => $line) {
                $cleanLine = ltrim($line, "-•* \t");
                if ($cleanLine === '' || (count($lines) > 1 && $idx === 0 && preg_match('/\b(lista|tabela|fornecedor|custo)\b/iu', $cleanLine) === 1 && ! preg_match('/r\$\s*\d+/iu', $cleanLine))) {
                    continue;
                }
                $linePrice = null;
                if (preg_match('/r\$\s*(\d{1,5}(?:[.,]\d{2})?)/iu', $cleanLine, $pm)) {
                    $linePrice = $this->parseMoneyToCents($pm[1]);
                }
                $lineVol = null;
                if (preg_match('/\b(\d+(?:[.,]\d+)?\s*(?:ml|g|l|kg))\b/iu', $cleanLine, $vm)) {
                    $lineVol = preg_replace('/\s+/', ' ', strtolower(trim($vm[1])));
                }
                $lineSku = null;
                if (preg_match('/(?:sku|ref\.?|c[oó]digo)\s*[:#]?\s*([A-Za-z0-9\-_]+)/iu', $cleanLine, $sm)) {
                    $lineSku = strtoupper($sm[1]);
                }
                $lineName = trim(preg_replace(['/r\$\s*\d{1,5}(?:[.,]\d{2})?/iu', '/(?:sku|ref\.?|c[oó]digo)\s*[:#]?\s*[A-Za-z0-9\-_]+/iu'], '', $cleanLine) ?? $cleanLine, " -|:\t");
                if ($lineName === '') {
                    continue;
                }

                $isEquip = preg_match('/\b(cabine|luminaria|luminária|motor|micromotor|secador|estufa|aspirador)\b/iu', $lineName) === 1;
                $watts = null;
                if (preg_match('/\b(\d{2,4})\s*(?:w|watts)\b/iu', $cleanLine, $wm)) {
                    $watts = (int) $wm[1];
                }

                $multiRows[] = [
                    'row_index' => count($multiRows),
                    'origin_file' => $origin,
                    'origin_detail' => 'Linha '.($idx + 1).' da lista',
                    'product_name' => $lineName,
                    'product_line' => $defaults['product_line'] ?? null,
                    'brand' => $defaults['brand'] ?? null,
                    'category' => null,
                    'variant_name' => 'Padrão',
                    'shade_code' => null,
                    'color_family' => null,
                    'color_hex' => null,
                    'volume' => $lineVol ?? ($defaults['volume'] ?? null),
                    'sku' => $lineSku,
                    'supplier_code' => null,
                    'gtin' => null,
                    'power_watts' => $watts,
                    'is_equipment' => $isEquip,
                    'shipping_weight_grams' => null,
                    'cost_price_cents' => $isSupplierCostList ? $linePrice : null,
                    'sale_price_cents' => $isSupplierCostList ? null : ($linePrice ?? ($defaults['sale_price_cents'] ?? null)),
                    'promo_price_cents' => null,
                    'stock_qty' => $defaults['stock_qty'] ?? null,
                    'ingredients' => null,
                    'usage_instructions' => null,
                    'manufacturer' => null,
                    'description_raw' => $line,
                    'evidence' => [
                        'product_name' => 'provided_text',
                        'raw_snippet' => $line,
                        'price' => $isSupplierCostList ? 'supplier_cost_requires_retail_confirmation' : ($linePrice ? 'provided_text' : 'missing'),
                        'power_watts' => $watts ? 'provided_text' : ($isEquip ? 'missing_illegible' : 'not_applicable'),
                    ],
                ];
            }
            if ($multiRows !== []) {
                return $multiRows;
            }
        }

        // Extract list of colors after "cores" / "tonalidades"
        $shades = [];
        if (preg_match('/(?:cores|tonalidades)\s*[:\-]?\s*([^\.\n;]+)/iu', $text, $m)) {
            $rawShades = preg_split('/\s*,\s*|\s+e\s+/iu', trim($m[1])) ?: [];
            foreach ($rawShades as $s) {
                $s = trim($s, " .;\t\n\r");
                if ($s !== '' && mb_strlen($s) <= 80) {
                    $shades[] = $s;
                }
            }
        }

        if ($shades === [] && $baseProduct === null) {
            return [];
        }

        if ($shades === []) {
            $shades = ['Padrão'];
        }

        $isEquip = preg_match('/\b(cabine|luminaria|luminária|motor|micromotor|secador|estufa|aspirador)\b/iu', $text) === 1;
        $watts = null;
        if (preg_match('/\b(\d{2,4})\s*(?:w|watts)\b/iu', $text, $wm)) {
            $watts = (int) $wm[1];
        }

        $rows = [];
        foreach ($shades as $idx => $shade) {
            preg_match('/\b(\d{2,4})\b/', $shade, $codeMatch);
            $rows[] = [
                'row_index' => $idx,
                'origin_file' => $origin,
                'origin_detail' => 'Texto descritivo',
                'product_name' => $baseProduct ?: 'Produto para Revisão',
                'product_line' => $defaults['product_line'] ?? null,
                'brand' => $defaults['brand'] ?? null,
                'category' => null,
                'variant_name' => $shade,
                'shade_code' => $codeMatch[1] ?? null,
                'color_family' => null,
                'color_hex' => null,
                'volume' => $defaults['volume'] ?? null,
                'sku' => null,
                'supplier_code' => null,
                'gtin' => null,
                'power_watts' => $watts,
                'is_equipment' => $isEquip,
                'shipping_weight_grams' => null,
                'cost_price_cents' => $isSupplierCostList ? ($defaults['cost_price_cents'] ?? null) : null,
                'sale_price_cents' => $isSupplierCostList ? null : ($defaults['sale_price_cents'] ?? null),
                'promo_price_cents' => null,
                'stock_qty' => $defaults['stock_qty'] ?? null,
                'ingredients' => null,
                'usage_instructions' => null,
                'manufacturer' => null,
                'description_raw' => $text,
                'evidence' => [
                    'product_name' => 'provided_text',
                    'variant_name' => 'provided_text',
                    'raw_snippet' => mb_substr($text, 0, 400),
                    'ingredients' => 'missing',
                    'power_watts' => $watts ? 'provided_text' : ($isEquip ? 'missing_illegible' : 'not_applicable'),
                ],
            ];
        }

        return $rows;
    }

    /** @return array<string, mixed> */
    public function parseContextDefaultsFromText(string $text): array
    {
        $out = [];

        if (preg_match('/(?:linha\s+de\s+|cole[cç][aã]o\s+de\s+)([^,.\n]+?)(?=\s+da\s+marca|\s+marca\b|,|\.|$)/iu', $text, $m)) {
            $out['product_line'] = trim($m[1]);
        }
        if (preg_match('/(?:da\s+marca|[Aa]\s+marca\s+[eé]|marca)\s+([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ\s&\-\.]{0,40}?)(?=,|\.|\s+(?:volume|com|nas\s+cores|e\s+todas|todos|\d+\s*ml)|\n|$)/iu', $text, $m)) {
            $out['brand'] = trim($m[1]);
        }
        if (preg_match('/\b(\d+(?:[.,]\d+)?\s*(?:ml|g|l|kg|un|w))\b/iu', $text, $m)) {
            $out['volume'] = preg_replace('/\s+/', ' ', strtolower(trim($m[1])));
        }
        $isExplicitSupplierCost = preg_match('/\b(lista\s+de\s+custo|tabela\s+(?:do\s+)?fornecedor|pre[cç]o\s+de\s+custo|custo\s+fornecedor)\b/iu', $text) === 1;
        if (preg_match('/(?:r\$|custam|pre[cç]o)\s*(?:r\$\s*)?(\d{1,4}(?:[.,]\d{2})?)/iu', $text, $m)) {
            $cents = $this->parseMoneyToCents($m[1]);
            if ($cents !== null && $cents > 0) {
                if ($isExplicitSupplierCost) {
                    $out['cost_price_cents'] = $cents;
                } else {
                    $out['sale_price_cents'] = $cents;
                }
            }
        }
        if (preg_match('/(?:estoque(?:\s+inicial)?(?:\s+de)?|qtd\.?)\s*(\d{1,5})\s*(?:unidade|un)?/iu', $text, $m)) {
            $out['stock_qty'] = (int) $m[1];
        }

        return $out;
    }

    public function parseMoneyToCents(string $raw): ?int
    {
        $clean = trim(str_ireplace('R$', '', $raw));
        $clean = preg_replace('/[^0-9,.-]/', '', $clean) ?? '';
        if ($clean === '' || str_starts_with($clean, '-')) {
            return null;
        }
        if (str_contains($clean, ',')) {
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        }
        if (! is_numeric($clean)) {
            return null;
        }

        $cents = (int) round(((float) $clean) * 100);

        return $cents > 0 ? $cents : null;
    }

    private function excelColumnToIndex(string $cellRef): int
    {
        $letters = preg_replace('/[^A-Z]/i', '', strtoupper($cellRef)) ?? 'A';
        $idx = 0;
        for ($i = 0; $i < strlen($letters); $i++) {
            $idx = ($idx * 26) + (ord($letters[$i]) - ord('A') + 1);
        }

        return max(0, $idx - 1);
    }
}
