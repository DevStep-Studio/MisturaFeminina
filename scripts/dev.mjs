import { spawn } from "node:child_process";
import { readFile, writeFile, copyFile, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(root, "backend");
const frontend = resolve(root, "frontend");
const windows = process.platform === "win32";
const runtimeEnv = { ...process.env, PAO_DISABLE: "1" };
const owned = new Set();
let stopping = false;

export function parseFlags(args) {
  const allowed = new Set(["--help", "--check", "--no-services"]);
  for (const arg of args)
    if (!allowed.has(arg))
      throw new Error(`Opção desconhecida: ${arg}. Use --help.`);
  return {
    help: args.includes("--help"),
    check: args.includes("--check"),
    services: !args.includes("--no-services"),
  };
}
export function isLocalHost(host) {
  return (
    typeof host === "string" &&
    ["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase())
  );
}
export function freshLocalEnvironment(source) {
  const defaults = {
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_USERNAME: "root",
    DB_PASSWORD: "",
    CACHE_STORE: "database",
    QUEUE_CONNECTION: "database",
    REDIS_HOST: "127.0.0.1",
    MAIL_MAILER: "log",
  };
  for (const [key, value] of Object.entries(defaults)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    source = pattern.test(source)
      ? source.replace(pattern, `${key}=${value}`)
      : `${source}\n${key}=${value}\n`;
  }
  return source;
}
export function developmentEnvironment(source, override) {
  const match = source.match(
    /^\s*(?:export\s+)?APP_ENV\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]*))/m,
  );
  const value =
    override ??
    (match ? (match[1] ?? match[2] ?? match[3]).trim() : "production");
  return ["local", "development"].includes(value);
}
async function developmentGuard() {
  const path = (await exists(resolve(backend, ".env")))
    ? ".env"
    : ".env.example";
  if (
    !developmentEnvironment(
      await readFile(resolve(backend, path), "utf8"),
      process.env.APP_ENV,
    )
  ) {
    throw new Error(
      "Inicializador permitido somente com APP_ENV=local ou development; nenhum serviço será preparado.",
    );
  }
}
function start(
  command,
  args,
  { cwd = root, capture = false, managed = false } = {},
) {
  // On Windows only fixed tool names/arguments pass through cmd (npm/composer are batch launchers).
  const batch = windows && ["npm", "composer"].includes(command);
  const child = spawn(
    batch ? "cmd.exe" : command,
    batch
      ? [
          "/d",
          "/s",
          "/c",
          `${command} ${args.map((arg) => `"${arg}"`).join(" ")}`,
        ]
      : args,
    {
      cwd,
      env: runtimeEnv,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      detached: managed && !windows,
    },
  );
  if (managed) owned.add(child);
  return child;
}
async function command(command, args, options = {}) {
  return await new Promise((resolveResult, reject) => {
    const child = start(command, args, options);
    let output = "",
      errors = "";
    child.stdout?.on("data", (data) => {
      output += data;
    });
    child.stderr?.on("data", (data) => {
      errors += data;
    });
    child.once("error", () =>
      reject(
        new Error(
          `Não foi possível executar ${command}. Verifique a instalação e o PATH.`,
        ),
      ),
    );
    child.once("close", (code) =>
      resolveResult({ code: code ?? 1, output, errors }),
    );
  });
}
async function required(commandName, args, options) {
  const result = await command(commandName, args, options);
  if (result.code !== 0)
    throw new Error(
      `Falhou: ${commandName} ${args.join(" ")}. Revise a mensagem acima.`,
    );
  return result;
}
async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function backendAction(action) {
  const result = await command("php", ["../scripts/dev-backend.php", action], {
    cwd: backend,
    capture: true,
  });
  let data;
  try {
    data = JSON.parse(result.output);
  } catch {
    throw new Error(
      "Não foi possível carregar o backend. Confira PHP, Composer, extensões e backend/.env. Execute composer install na pasta backend para detalhes.",
    );
  }
  return { ...data, code: result.code };
}
function ensure(result) {
  if (result.code !== 0) throw new Error(result.message);
  return result;
}
async function requirements() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw new Error("Use Node.js 22.12 ou superior.");
  const php = await required(
    "php",
    ["-r", "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;"],
    { capture: true },
  );
  const [phpMajor, phpMinor] = php.output.trim().split(".").map(Number);
  if (phpMajor < 8 || (phpMajor === 8 && phpMinor < 3))
    throw new Error("Use PHP 8.3 ou superior.");
  await required("composer", ["--version"], { capture: true });
  await required("npm", ["--version"], { capture: true });
}
async function portFree(port, host) {
  return await new Promise((resolveResult, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolveResult(false);
      else if (["EADDRNOTAVAIL", "EAFNOSUPPORT"].includes(error.code))
        resolveResult(true);
      else reject(error);
    });
    server.listen({ port, host, exclusive: true }, () =>
      server.close(() => resolveResult(true)),
    );
  });
}
async function ports() {
  for (const port of [8000, 3000])
    for (const host of ["127.0.0.1", "::1"]) {
      if (!(await portFree(port, host)))
        throw new Error(
          `Porta ${port} já está em uso. Encerre a instância anterior antes de iniciar novamente.`,
        );
    }
}
async function environments() {
  if (!(await exists(resolve(backend, ".env")))) {
    await writeFile(
      resolve(backend, ".env"),
      freshLocalEnvironment(
        await readFile(resolve(backend, ".env.example"), "utf8"),
      ),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      "backend/.env criado para MySQL local (root sem senha). Ajuste DB_USERNAME/DB_PASSWORD se necessário.",
    );
  }
  if (!(await exists(resolve(frontend, ".env"))))
    await copyFile(
      resolve(frontend, ".env.example"),
      resolve(frontend, ".env"),
      constants.COPYFILE_EXCL,
    );
}
async function dependencies() {
  let state = {};
  const statePath = resolve(root, ".devstep", "dependencies.json");
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    /* First launch. */
  }
  const hash = async (path) =>
    createHash("sha256")
      .update(await readFile(path))
      .update(process.platform)
      .digest("hex");
  const composerHash = await hash(resolve(backend, "composer.lock"));
  const npmHash = await hash(resolve(frontend, "package-lock.json"));
  if (
    !(await exists(resolve(backend, "vendor/autoload.php"))) ||
    composerHash !== state.composer
  ) {
    console.log("Preparando dependências PHP…");
    const args = ["install", "--no-interaction", "--prefer-dist"];
    if (windows) {
      args.push(
        "--ignore-platform-req=ext-pcntl",
        "--ignore-platform-req=ext-posix",
      );
      console.log(
        "Windows nativo: extensões Unix de Horizon serão ignoradas; Horizon requer Linux/WSL.",
      );
    }
    await required("composer", args, { cwd: backend });
  }
  if (
    !(await exists(resolve(frontend, "node_modules/.package-lock.json"))) ||
    npmHash !== state.npm
  ) {
    console.log("Preparando dependências do frontend…");
    await required("npm", ["ci", "--no-fund"], { cwd: frontend });
  }
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    JSON.stringify({ composer: composerHash, npm: npmHash }),
  );
}
async function startService(kind, config) {
  const host = kind === "mysql" ? config.databaseHost : config.redisHost;
  const port = kind === "mysql" ? config.databasePort : config.redisPort;
  if (!isLocalHost(host) || port !== (kind === "mysql" ? 3306 : 6379))
    throw new Error(
      `${kind} indisponível em host/porta personalizados. Inicie esse servidor e revise backend/.env; o script só inicia serviços locais nas portas padrão.`,
    );
  console.log(`Tentando iniciar serviço local ${kind}…`);
  if (windows) {
    const expression =
      kind === "mysql" ? "^(MySQL|MariaDB)" : "^(Redis|Memurai)";
    const envName =
      kind === "mysql" ? "DEVSTEP_MYSQL_SERVICE" : "DEVSTEP_REDIS_SERVICE";
    const script = `$ErrorActionPreference='Stop'; $custom=[Environment]::GetEnvironmentVariable('${envName}'); if($custom){$s=Get-Service -Name $custom}else{$s=Get-Service | Where-Object {$_.Name -match '${expression}' -and $_.Status -eq 'Stopped'} | Sort-Object Name | Select-Object -First 1}; if(!$s){Write-Error 'Servico nao encontrado. Inicie pelo painel do MySQL/XAMPP ou configure o nome do servico.'}; Start-Service -InputObject $s`;
    const result = await command("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    if (result.code !== 0)
      throw new Error(
        `Não foi possível iniciar ${kind}. Use um terminal como Administrador ou inicie pelo painel do MySQL/XAMPP.`,
      );
  } else {
    const custom =
      process.env[
        kind === "mysql" ? "DEVSTEP_MYSQL_SERVICE" : "DEVSTEP_REDIS_SERVICE"
      ];
    if (custom && !/^[a-zA-Z0-9_.@-]+$/.test(custom))
      throw new Error("Nome de serviço inválido.");
    const candidates = custom
      ? [custom]
      : kind === "mysql"
        ? ["mysqld", "mysql", "mariadb"]
        : ["redis", "redis-server"];
    let service;
    for (const candidate of candidates) {
      const probe = await command(
        "systemctl",
        ["show", "--property=LoadState", "--value", candidate],
        { capture: true },
      );
      if (probe.code === 0 && probe.output.trim() === "loaded") {
        service = candidate;
        break;
      }
    }
    if (!service)
      throw new Error(
        `Serviço ${kind} não encontrado no systemd. Instale/inicie o servidor manualmente e tente novamente.`,
      );
    let result = await command("systemctl", ["start", service]);
    if (result.code !== 0 && process.getuid?.() !== 0) {
      console.log(
        `O serviço ${service} pode exigir sua senha de administrador no terminal.`,
      );
      result = await command("sudo", ["systemctl", "start", service]);
    }
    if (result.code !== 0)
      throw new Error(`Não foi possível iniciar o serviço ${service}.`);
  }
}
async function waitForService(action, accepted) {
  let result;
  for (let attempt = 0; attempt < 15; attempt++) {
    result = await backendAction(action);
    if (accepted.includes(result.code)) return result;
    if (![21, 24].includes(result.code)) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error(result.message);
}
async function prepare(services) {
  // Refuse non-development environments before generating keys or running migrations.
  ensure(await backendAction("inspect"));
  await required("php", ["artisan", "config:clear", "--no-interaction"], {
    cwd: backend,
  });
  const config = ensure(await backendAction("inspect"));
  let database = await backendAction("probe");
  if (database.code === 21 && services) {
    await startService("mysql", config);
    database = await waitForService("probe", [0, 20]);
  }
  if (![0, 20].includes(database.code)) throw new Error(database.message);
  console.log(ensure(await backendAction("prepare")).message);
  if (config.keyMissing)
    await required("php", ["artisan", "key:generate", "--no-interaction"], {
      cwd: backend,
    });
  await required("php", ["artisan", "migrate", "--no-interaction"], {
    cwd: backend,
  });
  if (config.redisRequired) {
    let redis = await backendAction("redis");
    if (redis.code === 24 && services) {
      await startService("redis", config);
      redis = await waitForService("redis", [0]);
    }
    ensure(redis);
  }
}
function stopChildren() {
  for (const child of owned) {
    if (!child.pid) continue;
    if (windows)
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already exited. */
      }
    }
  }
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null || child.signalCode)
      throw new Error(`O servidor encerrou antes de ficar pronto: ${url}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* Starting. */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Tempo esgotado ao iniciar ${url}.`);
}
async function serve() {
  start(
    "php",
    ["artisan", "queue:work", "--sleep=1", "--tries=5", "--timeout=60"],
    { cwd: backend, managed: true },
  );
  start("php", ["artisan", "schedule:work"], { cwd: backend, managed: true });
  const backendChild = start(
    "php",
    ["artisan", "serve", "--host=127.0.0.1", "--port=8000", "--tries=1"],
    { cwd: backend, managed: true },
  );
  const frontendChild = start("npm", ["run", "dev", "--", "--host=127.0.0.1"], {
    cwd: frontend,
    managed: true,
  });
  for (const child of owned)
    child.on("error", (error) => {
      console.error(error.message);
      stopChildren();
    });
  await Promise.all([
    ready("http://127.0.0.1:8000/up", backendChild),
    ready("http://127.0.0.1:3000", frontendChild),
  ]);
  for (const child of owned) {
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(
        "Um dos processos de desenvolvimento encerrou antes de ficar pronto.",
      );
    }
  }
  console.log(
    "\nFrontend: http://localhost:3000\nBackend:  http://localhost:8000\nCtrl+C encerra servidores, fila e agendador. MySQL/Redis continuam ativos.\n",
  );
  await new Promise((resolveStop, reject) => {
    for (const child of owned)
      child.once("exit", (code) => {
        if (!stopping) {
          stopping = true;
          stopChildren();
          if (code && code !== 0)
            reject(new Error(`Um servidor encerrou com código ${code}.`));
          else resolveStop();
        }
      });
  });
}
export async function main(args = process.argv.slice(2)) {
  const flags = parseFlags(args);
  if (flags.help) {
    console.log(
      "Uso: ./iniciar.sh [--check] [--no-services]\nWindows: iniciar.bat [--check] [--no-services]\n\n--check: diagnóstico sem instalar, criar banco, migrar ou iniciar serviços.\n--no-services: não tentar iniciar serviços MySQL/Redis automaticamente.\nRequer Node 22.12+, PHP 8.3+, Composer e MySQL instalado.\nCredenciais vêm de backend/.env; o banco é criado apenas se ausente.\nDependências e APP_KEY são preparadas quando necessário. Nunca usa migrate:fresh.",
    );
    return;
  }
  await requirements();
  await developmentGuard();
  if (flags.check) {
    for (const file of [
      "backend/.env",
      "frontend/.env",
      "backend/vendor/autoload.php",
      "frontend/node_modules/.package-lock.json",
    ])
      if (!(await exists(resolve(root, file))))
        throw new Error(
          `Ausente: ${file}. Execute o inicializador sem --check para preparar.`,
        );
    const config = ensure(await backendAction("inspect"));
    ensure(await backendAction("probe"));
    if (config.redisRequired) ensure(await backendAction("redis"));
    if (config.keyMissing)
      throw new Error("APP_KEY está vazia. Execute sem --check para gerar.");
    await ports();
    console.log(
      "Diagnóstico OK: dependências, MySQL, configuração e portas disponíveis.",
    );
    return;
  }
  await ports();
  await environments();
  await dependencies();
  await prepare(flags.services);
  await serve();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      stopping = true;
      stopChildren();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  main().catch((error) => {
    console.error(`\n[DevStep] ${error.message}`);
    stopChildren();
    process.exitCode = 1;
  });
}
