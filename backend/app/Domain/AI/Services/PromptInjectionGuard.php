<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

class PromptInjectionGuard
{
    /** @var list<string> */
    private const PATTERNS = [
        '/ignore\s+(all\s+|previous\s+|the\s+)?(instructions|rules|prompts)/i',
        '/ignore\s+(suas|todas\s+as|as)\s+(regras|instruc|politicas|comandos)/iu',
        '/desconsidere\s+(as\s+)?(regras|instruc|permisso)/iu',
        '/\bsystem\s+prompt\b/i',
        '/voc[eê]\s+agora\s+[eé]\b/iu',
        '/\balter[ea]\s+(todos\s+)?os\s+pre[cç]os\s+para\b/iu',
        '/\b(drop|truncate|delete\s+from)\s+table\b/i',
        '/<\s*script\b/i',
        '/\breveal\s+(api[_\s]?key|secret|token|credentials|env)\b/i',
        '/\bbypass\s+(permission|security|approval|auth)/i',
    ];

    /**
     * Inspects untrusted input (supplier spreadsheets, PDFs, notes) for prompt-injection attempts.
     *
     * @return array{has_injection: bool, cleaned_text: string, matched_patterns: list<string>}
     */
    public function inspect(string $text, string $sourceLabel = 'untrusted_input'): array
    {
        $matched = [];
        $lines = preg_split('/\r\n|\r|\n/', $text) ?: [$text];
        $safeLines = [];

        foreach ($lines as $line) {
            $lineFlagged = false;
            foreach (self::PATTERNS as $pattern) {
                if (preg_match($pattern, $line) === 1) {
                    $lineFlagged = true;
                    $matched[] = "{$sourceLabel}:{$pattern}";
                }
            }

            if ($lineFlagged) {
                $safeLines[] = '[CONTEÚDO BLOQUEADO POR SEGURANÇA DE DADOS]';
            } else {
                $safeLines[] = $line;
            }
        }

        return [
            'has_injection' => $matched !== [],
            'cleaned_text' => implode("\n", $safeLines),
            'matched_patterns' => array_values(array_unique($matched)),
        ];
    }
}
