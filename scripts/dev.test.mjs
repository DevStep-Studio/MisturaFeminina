import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  parseFlags,
  freshLocalEnvironment,
  isLocalHost,
  developmentEnvironment,
  root,
} from "./dev.mjs";

test("flags default to normal startup, and reject unknown arguments", () => {
  assert.deepEqual(parseFlags([]), {
    help: false,
    check: false,
    services: true,
  });
  assert.deepEqual(parseFlags(["--check", "--no-services"]), {
    help: false,
    check: true,
    services: false,
  });
  assert.throws(() => parseFlags(["--fresh"]), /desconhecida/);
});
test("service startup is restricted to explicit loopback hosts", () => {
  for (const host of ["localhost", "127.0.0.1", "::1"])
    assert.equal(isLocalHost(host), true);
  for (const host of [
    "mysql",
    "db.example.com",
    "localhost.example.com",
    "127.0.0.1; command",
    ["localhost"],
  ])
    assert.equal(isLocalHost(host), false);
});
test("new local env uses database drivers without changing unrelated example values", () => {
  const env = freshLocalEnvironment(
    'APP_NAME="Meu projeto"\nAPP_KEY=\nDB_HOST=mysql\nDB_USERNAME=devstep\nDB_PASSWORD=example\nCACHE_STORE=redis\nQUEUE_CONNECTION=redis\n',
  );
  for (const line of [
    'APP_NAME="Meu projeto"',
    "APP_KEY=",
    "DB_HOST=127.0.0.1",
    "DB_USERNAME=root",
    "DB_PASSWORD=",
    "CACHE_STORE=database",
    "QUEUE_CONNECTION=database",
    "MAIL_MAILER=log",
  ])
    assert.ok(env.split("\n").includes(line));
});
test("help executes without preparing dependencies or touching env", () => {
  const before = readFileSync(`${root}/backend/.env`);
  const output = execFileSync(
    process.execPath,
    [`${root}/scripts/dev.mjs`, "--help"],
    { encoding: "utf8" },
  );
  assert.match(output, /--check/);
  assert.match(output, /Nunca usa migrate:fresh/);
  assert.deepEqual(readFileSync(`${root}/backend/.env`), before);
});
test(
  "database helper rejects production before any DB operation",
  { skip: !existsSync(`${root}/backend/vendor/autoload.php`) },
  () => {
    try {
      execFileSync("php", [`${root}/scripts/dev-backend.php`, "prepare"], {
        env: { ...process.env, APP_ENV: "production", PAO_DISABLE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      assert.fail("production must not start");
    } catch (error) {
      assert.equal(error.status, 40);
      assert.match(error.stdout.toString(), /somente com APP_ENV/);
    }
  },
);
test("entrypoints exist and preserve the script directory", () => {
  assert.match(readFileSync(`${root}/iniciar.sh`, "utf8"), /BASH_SOURCE/);
  assert.match(readFileSync(`${root}/iniciar.bat`, "utf8"), /cd \/d "%~dp0"/);
});

test("development guard handles quoted env values and rejects production overrides", () => {
  assert.equal(developmentEnvironment('APP_ENV="local" # ambiente'), true);
  assert.equal(developmentEnvironment("APP_ENV='development'"), true);
  assert.equal(developmentEnvironment("APP_ENV=production"), false);
  assert.equal(developmentEnvironment("APP_ENV=local", "production"), false);
  assert.equal(developmentEnvironment("APP_NAME=exemplo"), false);
});

test(
  "MySQL setup creates only a missing database and repeated migrations preserve data",
  { skip: !process.env.DEVSTEP_TEST_MYSQL_PORT },
  () => {
    const name = `devstep_launcher_test_${process.pid}_${Date.now()}`;
    const port = process.env.DEVSTEP_TEST_MYSQL_PORT;
    const env = {
      ...process.env,
      APP_ENV: "local",
      PAO_DISABLE: "1",
      DB_CONNECTION: "mysql",
      DB_URL: "",
      DB_HOST: "127.0.0.1",
      DB_PORT: port,
      DB_DATABASE: name,
      DB_USERNAME: "root",
      DB_PASSWORD: "",
      CACHE_STORE: "array",
      SESSION_DRIVER: "array",
      QUEUE_CONNECTION: "sync",
    };
    const mysql = (sql) =>
      execFileSync(
        "mysql",
        [
          "--host=127.0.0.1",
          `--port=${port}`,
          "--user=root",
          "--batch",
          "--skip-column-names",
          "-e",
          sql,
        ],
        { encoding: "utf8" },
      );
    const helper = (action) =>
      execFileSync("php", [`${root}/scripts/dev-backend.php`, action], {
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    try {
      assert.throws(
        () => helper("probe"),
        (error) => error.status === 20,
      );
      assert.match(helper("prepare"), /Banco criado/);
      execFileSync("php", ["artisan", "migrate", "--no-interaction"], {
        cwd: `${root}/backend`,
        env,
        stdio: "pipe",
      });
      mysql(
        `CREATE TABLE \`${name}\`.launcher_probe (id INT PRIMARY KEY); INSERT INTO \`${name}\`.launcher_probe VALUES (7)`,
      );
      assert.match(helper("prepare"), /MySQL conectado/);
      execFileSync("php", ["artisan", "migrate", "--no-interaction"], {
        cwd: `${root}/backend`,
        env,
        stdio: "pipe",
      });
      assert.equal(
        mysql(`SELECT id FROM \`${name}\`.launcher_probe`).trim(),
        "7",
      );
    } finally {
      mysql(`DROP DATABASE IF EXISTS \`${name}\``);
    }
  },
);

test(
  "launcher prepares services and stops both owned process trees on Ctrl+C",
  {
    skip: process.platform === "win32" || !process.env.DEVSTEP_TEST_LAUNCHER,
    timeout: 20000,
  },
  async () => {
    const { mkdtemp, mkdir, writeFile, chmod, rm } =
      await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { createServer } = await import("node:net");
    const { spawn } = await import("node:child_process");
    const freePort = () =>
      new Promise((resolvePort) => {
        const server = createServer();
        server.listen(0, "127.0.0.1", () => {
          const port = server.address().port;
          server.close(() => resolvePort(port));
        });
      });
    const apiPort = await freePort(),
      webPort = await freePort();
    const fixture = await mkdtemp(`${tmpdir()}/devstep-launcher-`);
    let child;
    try {
      for (const directory of ["scripts", "backend", "frontend", "bin"])
        await mkdir(`${fixture}/${directory}`);
      let source = readFileSync(`${root}/scripts/dev.mjs`, "utf8")
        .replaceAll("8000", String(apiPort))
        .replaceAll("3000", String(webPort));
      await writeFile(`${fixture}/scripts/dev.mjs`, source);
      await writeFile(
        `${fixture}/backend/.env`,
        `APP_ENV=local\nAPP_KEY=\nDB_PASSWORD=preserve_this\n`,
      );
      await writeFile(`${fixture}/frontend/.env`, "VITE_APP_NAME=Example\n");
      await writeFile(`${fixture}/backend/composer.lock`, "{}");
      await writeFile(`${fixture}/frontend/package-lock.json`, "{}");
      await writeFile(
        `${fixture}/server.mjs`,
        "import {createServer} from 'node:http'; createServer((q,s)=>s.end('ok')).listen(Number(process.argv[2]),'127.0.0.1');",
      );
      const stub = String.raw`#!/usr/bin/env node
const fs=require('fs'), path=require('path'), cp=require('child_process');
const dir=process.env.DEVSTEP_FIXTURE, tool=path.basename(process.argv[1]), args=process.argv.slice(2);
if(args.includes('--version')){console.log('10.0.0');process.exit(0)}
if(tool==='systemctl'){if(args[0]==='show')console.log('loaded');else fs.writeFileSync(dir+'/service-started','yes');process.exit(0)}
if(tool==='composer'){fs.mkdirSync(dir+'/backend/vendor');fs.writeFileSync(dir+'/backend/vendor/autoload.php','ok');process.exit(0)}
if(tool==='php'&&args[0]==='-r'){console.log('8.3');process.exit(0)}
if(tool==='php'&&args[0].includes('dev-backend.php')){
 const action=args[1]; let code=0,data={message:'OK'};
 if(action==='inspect')data={keyMissing:!fs.existsSync(dir+'/key-generated'),databaseHost:'127.0.0.1',databasePort:3306,redisRequired:false};
 if(action==='probe'&&!fs.existsSync(dir+'/service-started')){code=21;data={message:'stopped'}}
 else if(action==='probe'&&!fs.existsSync(dir+'/database-created')){code=20;data={message:'missing'}}
 if(action==='prepare')fs.writeFileSync(dir+'/database-created','yes');
 console.log(JSON.stringify(data));process.exit(code)
}
if(tool==='php'&&args[1]==='key:generate'){fs.writeFileSync(dir+'/key-generated','yes');process.exit(0)}
if(tool==='php'&&args[1]==='migrate'){fs.writeFileSync(dir+'/migrated','yes');process.exit(0)}
if(tool==='npm'&&args[0]==='ci'){fs.mkdirSync(dir+'/frontend/node_modules');fs.writeFileSync(dir+'/frontend/node_modules/.package-lock.json','{}');process.exit(0)}
if(tool==='php'&&['queue:work','schedule:work'].includes(args[1])){fs.writeFileSync(dir+'/'+args[1].split(':')[0]+'-pid',String(process.pid));setInterval(()=>{},1000);}
if((tool==='php'&&args[1]==='serve')||(tool==='npm'&&args[0]==='run')){
 const port=tool==='php'?args.find(x=>x.startsWith('--port=')).split('=')[1]:process.env.DEVSTEP_WEB_PORT;
 const server=cp.spawn(process.execPath,[dir+'/server.mjs',port],{stdio:'inherit'});server.on('exit',()=>process.exit(0));
}
`;
      for (const tool of ["php", "composer", "npm", "systemctl"]) {
        await writeFile(`${fixture}/bin/${tool}`, stub);
        await chmod(`${fixture}/bin/${tool}`, 0o755);
      }
      child = spawn(process.execPath, [`${fixture}/scripts/dev.mjs`], {
        env: {
          ...process.env,
          APP_ENV: "local",
          PATH: `${fixture}/bin:${process.env.PATH}`,
          DEVSTEP_FIXTURE: fixture,
          DEVSTEP_WEB_PORT: String(webPort),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      const readyBy = Date.now() + 12000;
      while (!output.includes("Ctrl+C encerra")) {
        if (child.exitCode !== null) throw new Error(output);
        if (Date.now() > readyBy) throw new Error(`Launch timeout: ${output}`);
        await new Promise((r) => setTimeout(r, 50));
      }
      for (const marker of [
        "service-started",
        "database-created",
        "key-generated",
        "migrated",
        "queue-pid",
        "schedule-pid",
      ])
        assert.ok(existsSync(`${fixture}/${marker}`));
      assert.match(
        readFileSync(`${fixture}/backend/.env`, "utf8"),
        /DB_PASSWORD=preserve_this/,
      );
      assert.equal((await fetch(`http://127.0.0.1:${apiPort}/up`)).status, 200);
      assert.equal((await fetch(`http://127.0.0.1:${webPort}`)).status, 200);
      const closed = new Promise((resolveClose) =>
        child.once("close", resolveClose),
      );
      child.kill("SIGINT");
      await closed;
      await new Promise((r) => setTimeout(r, 200));
      for (const marker of ["queue-pid", "schedule-pid"]) {
        const workerPid = Number(readFileSync(`${fixture}/${marker}`, "utf8"));
        assert.throws(() => process.kill(workerPid, 0));
      }
      await assert.rejects(
        fetch(`http://127.0.0.1:${apiPort}/up`, {
          signal: AbortSignal.timeout(1000),
        }),
      );
      await assert.rejects(
        fetch(`http://127.0.0.1:${webPort}`, {
          signal: AbortSignal.timeout(1000),
        }),
      );
    } finally {
      if (child && child.exitCode === null) child.kill("SIGINT");
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
