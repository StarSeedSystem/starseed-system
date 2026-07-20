#!/usr/bin/env node
// @ts-nocheck
/**
 * StarSeed OS — MOTOR DE VOZ ASTRAURA (paquete NATIVO) · install.mjs
 * ============================================================================
 * INSTALADOR ORQUESTADOR IDEMPOTENTE del motor de voz local. Con SOLO módulos
 * nativos de Node. Hace, en orden:
 *
 *   (a) Sondea el hardware y elige la variante del modelo (probe.mjs).
 *   (b) Clona (o actualiza) omnivoice.cpp con submódulos en ~/.starseed/...
 *   (c) Compila con el script del backend detectado; si falla, cae a buildcpu.
 *   (d) Descarga SOLO la variante asignada (base + tokenizer) por HTTPS, con
 *       reintentos, barra de progreso y verificación de tamaño; guarda ETag/SHA.
 *   (e) Escribe config.json (rutas, variante, puerto 4444, capacidades).
 *   (f) Instala el servicio persistente (launchd en macOS / systemd --user en
 *       Linux, con nohup de respaldo) y explica cómo usarlo.
 *
 * Banderas:  --reinstall   fuerza clon/descarga/compilación desde cero
 *            --cpu-only     ignora la GPU: gama BAJA (Q4_K_M) + buildcpu.sh
 *            --no-service   no instala el servicio del sistema
 *
 * Idempotente: si el repo ya está, hace pull; si el binario/modelos ya están y
 * su tamaño cuadra, no rehace el trabajo (salvo --reinstall). CERO secretos.
 *
 * ⚠️ Requiere RED y un toolchain de compilación (git, cmake/make, y CUDA/Vulkan
 * si aplica). Está pensado para correr en la máquina del usuario (Mac/PC), NO en
 * este contenedor: aquí sólo se comprueba su sintaxis.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { probeHardware, selectModelVariant, MODEL_VARIANTS, OMNIVOICE_REPO, HF_REPO, SAMPLE_RATE } from "./probe.mjs";
import {
  PATHS,
  BIN,
  DAEMON_HOST,
  DAEMON_PORT,
  ensureDirs,
  log,
  writeConfig,
  readVersions,
  writeVersions,
  hfHead,
  hfDownload,
  makeProgressBar,
} from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_JS = path.join(HERE, "daemon.mjs");

const FLAGS = new Set(process.argv.slice(2));
const OPT = {
  reinstall: FLAGS.has("--reinstall"),
  cpuOnly: FLAGS.has("--cpu-only"),
  noService: FLAGS.has("--no-service"),
  uninstall: FLAGS.has("--uninstall"),
};

// ── Salida con estilo StarSeed ───────────────────────────────────────────────
const say = (s = "") => console.log(s);
const step = (n, s) => say(`\n  ▸ [${n}/6] ${s}`);
const ok = (s) => say(`     ✓ ${s}`);
const warn = (s) => say(`     ⚠ ${s}`);
const err = (s) => say(`     ✗ ${s}`);

// ── Ejecuta un comando volcando su salida al log y a la consola ──────────────
function runStreaming(cmd, args, { cwd, logFile, quiet } = {}) {
  return new Promise((resolve) => {
    let child;
    let ls;
    try {
      if (logFile) {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        ls = fs.createWriteStream(logFile, { flags: "a" });
        ls.write(`\n[${new Date().toISOString()}] $ ${cmd} ${args.join(" ")}\n`);
      }
      child = spawn(cmd, args, { cwd });
    } catch (e) {
      return resolve({ code: -1, error: e.message });
    }
    const pipe = (stream) => {
      stream.on("data", (d) => {
        if (!quiet) process.stdout.write(d);
        ls && ls.write(d);
      });
    };
    pipe(child.stdout);
    pipe(child.stderr);
    child.on("error", (e) => resolve({ code: -1, error: e.message }));
    child.on("close", (code) => {
      ls && ls.end();
      resolve({ code });
    });
  });
}

/** ¿Existe un fichero regular no vacío? */
function fileOk(p) {
  try {
    return !!p && fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

// ── (b) Clonar / actualizar omnivoice.cpp ────────────────────────────────────
async function ensureRepo() {
  const buildLog = path.join(PATHS.logsDir, "build.log");
  const gitDir = path.join(PATHS.repoDir, ".git");
  const exists = fs.existsSync(gitDir);

  if (exists && OPT.reinstall) {
    warn("--reinstall: borrando el clon previo de omnivoice.cpp");
    try {
      fs.rmSync(PATHS.repoDir, { recursive: true, force: true });
    } catch (e) {
      warn(`no se pudo borrar (${e.message}); intento continuar`);
    }
  }

  if (fs.existsSync(gitDir) && !OPT.reinstall) {
    say("     · repo presente → git pull + submódulos");
    const r1 = await runStreaming("git", ["-C", PATHS.repoDir, "pull", "--recurse-submodules"], { logFile: buildLog });
    await runStreaming("git", ["-C", PATHS.repoDir, "submodule", "update", "--init", "--recursive"], { logFile: buildLog });
    if (r1.code !== 0) warn("git pull devolvió error (¿sin red?); sigo con lo que hay en disco");
    return fs.existsSync(gitDir);
  }

  say(`     · git clone --recurse-submodules ${OMNIVOICE_REPO}`);
  fs.mkdirSync(path.dirname(PATHS.repoDir), { recursive: true });
  const r = await runStreaming("git", ["clone", "--recurse-submodules", OMNIVOICE_REPO, PATHS.repoDir], { logFile: buildLog });
  if (r.code !== 0) {
    err(`git clone falló (${r.error || "código " + r.code}). ¿Está git instalado y hay red?`);
    return false;
  }
  return true;
}

// ── (c) Compilar ─────────────────────────────────────────────────────────────
async function buildEngine(variant) {
  const buildLog = path.join(PATHS.logsDir, "build.log");
  const ttsBin = path.join(PATHS.buildDir, BIN.tts);
  const codecBin = path.join(PATHS.buildDir, BIN.codec);

  if (fileOk(ttsBin) && fileOk(codecBin) && !OPT.reinstall) {
    ok("binarios ya compilados (omnivoice-tts + omnivoice-codec); omito build (usa --reinstall para rehacer)");
    return true;
  }

  // Da permisos de ejecución a todos los scripts de build del repo.
  for (const s of ["buildcuda.sh", "buildvulkan.sh", "buildcpu.sh", "buildall.sh", "checkpoints.sh"]) {
    try {
      fs.chmodSync(path.join(PATHS.repoDir, s), 0o755);
    } catch {
      /* el script puede no existir en todas las plataformas */
    }
  }

  const scriptName = variant.buildScript.replace(/^\.\//, "");
  say(`     · compilando con ${variant.buildScript} (backend ${variant.backend})…`);
  let r = await runStreaming("bash", [scriptName], { cwd: PATHS.repoDir, logFile: buildLog });

  // Fallback: si el build acelerado falla, probamos CPU (siempre disponible).
  if (r.code !== 0 && scriptName !== "buildcpu.sh") {
    warn(`${variant.buildScript} falló (código ${r.code}); reintento con ./buildcpu.sh`);
    r = await runStreaming("bash", ["buildcpu.sh"], { cwd: PATHS.repoDir, logFile: buildLog });
    if (r.code === 0) {
      variant.backend = "cpu";
      variant.buildScript = "./buildcpu.sh";
      warn("compilado en modo CPU (la aceleración falló; funcionará, más lento)");
    }
  }

  if (r.code !== 0) {
    err(`la compilación falló (código ${r.code}). Revisa ${buildLog}`);
    return false;
  }
  if (!fileOk(ttsBin) || !fileOk(codecBin)) {
    err(`el build terminó pero no aparecen los binarios en ${PATHS.buildDir}`);
    return false;
  }
  ok("compilado: omnivoice-tts + omnivoice-codec");
  return true;
}

// ── (d) Descargar la variante asignada ───────────────────────────────────────
async function downloadModels(variant) {
  fs.mkdirSync(PATHS.modelsDir, { recursive: true });
  const versions = readVersions();
  const files = [variant.modelFile, variant.codecFile];
  let allOk = true;

  for (const file of files) {
    const dest = path.join(PATHS.modelsDir, file);
    const head = await hfHead(file, HF_REPO);
    const expectedSize = head.size || 0;

    // Idempotencia: si ya está con el tamaño esperado (y sin --reinstall), skip.
    if (!OPT.reinstall && fileOk(dest)) {
      const cur = fs.statSync(dest).size;
      if (!expectedSize || cur === expectedSize) {
        ok(`${file} ya presente (${(cur / 1e6).toFixed(1)} MB); omito descarga`);
        versions[file] = { etag: head.etag || versions[file]?.etag || "", size: cur, at: new Date().toISOString() };
        continue;
      }
      warn(`${file} presente pero con tamaño distinto (${cur} ≠ ${expectedSize}); re-descargo`);
    }

    say(`     · descargando ${file}${expectedSize ? ` (${(expectedSize / 1e6).toFixed(1)} MB)` : ""}…`);
    const bar = makeProgressBar(file);
    const res = await hfDownload(file, dest, { repo: HF_REPO, expectedSize, retries: 3, onProgress: bar });
    if (!res.ok) {
      err(`no se pudo descargar ${file}: ${res.error}`);
      allOk = false;
      continue;
    }
    ok(`${file} descargado (${(res.bytes / 1e6).toFixed(1)} MB)`);
    versions[file] = { etag: head.etag || "", sha256: res.sha256, size: res.bytes, at: new Date().toISOString() };
  }

  writeVersions(versions);
  return allOk;
}

// ── (e) Escribir config.json ─────────────────────────────────────────────────
function writeConfigJson(hardware, variant) {
  const cfg = {
    version: 1,
    engine: "omnivoice.cpp",
    host: DAEMON_HOST,
    port: DAEMON_PORT,
    repoDir: PATHS.repoDir,
    paths: {
      buildDir: PATHS.buildDir,
      modelsDir: PATHS.modelsDir,
      tts: path.join(PATHS.buildDir, BIN.tts),
      codec: path.join(PATHS.buildDir, BIN.codec),
    },
    variant: {
      tier: variant.tier,
      quant: variant.quant,
      backend: variant.backend,
      buildScript: variant.buildScript,
    },
    model: { base: variant.modelFile, tokenizer: variant.codecFile },
    modelFile: path.join(PATHS.modelsDir, variant.modelFile),
    codecFile: path.join(PATHS.modelsDir, variant.codecFile),
    capabilities: {
      clone: true, // --ref-wav / --ref-text
      voiceDesign: false, // el CLI omnivoice-tts no expone diseño de voz por texto
      instruct: false, // ni instrucción de entrega (verificar en el Mac)
      sampleRate: SAMPLE_RATE,
      languages: ["Spanish", "English", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese"],
      cloudFallback: "k2-fsa/OmniVoice",
    },
    hf: { repo: HF_REPO },
    hardware,
    installedAt: new Date().toISOString(),
  };
  writeConfig(cfg);
  return cfg;
}

// ── (f) Instalar el servicio persistente ─────────────────────────────────────
function fillTemplate(tpl) {
  return tpl
    .replaceAll("__NODE__", process.execPath)
    .replaceAll("__DAEMON__", DAEMON_JS)
    .replaceAll("__WORKDIR__", HERE)
    .replaceAll("__HOME__", os.homedir())
    .replaceAll("__LOGS__", PATHS.logsDir)
    .replaceAll("__STDOUT_LOG__", path.join(PATHS.logsDir, "daemon.out.log"))
    .replaceAll("__STDERR_LOG__", path.join(PATHS.logsDir, "daemon.err.log"));
}

async function installService() {
  if (OPT.noService) {
    warn("--no-service: no instalo el servicio. Arranca el daemon a mano:");
    say(`        ${process.execPath} ${DAEMON_JS}`);
    return;
  }
  const platform = os.platform();

  if (platform === "darwin") {
    const tplPath = path.join(HERE, "com.starseed.astraura-voice.plist");
    const dest = path.join(os.homedir(), "Library", "LaunchAgents", "com.starseed.astraura-voice.plist");
    try {
      const tpl = fs.readFileSync(tplPath, "utf8");
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, fillTemplate(tpl));
      await runStreaming("launchctl", ["unload", dest], { quiet: true }); // por si ya estaba
      const r = await runStreaming("launchctl", ["load", "-w", dest], { quiet: true });
      if (r.code === 0) {
        ok(`servicio launchd instalado y cargado: ${dest}`);
        say("        (se arranca solo al iniciar sesión; KeepAlive lo mantiene vivo)");
      } else {
        warn(`escribí el plist en ${dest} pero launchctl load devolvió ${r.code}. Cárgalo a mano:`);
        say(`        launchctl load -w ${dest}`);
      }
    } catch (e) {
      err(`no pude instalar el servicio launchd: ${e.message}`);
    }
    return;
  }

  if (platform === "linux") {
    const tplPath = path.join(HERE, "astraura-voice.service");
    const dest = path.join(os.homedir(), ".config", "systemd", "user", "astraura-voice.service");
    try {
      const tpl = fs.readFileSync(tplPath, "utf8");
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, fillTemplate(tpl));
      const reload = await runStreaming("systemctl", ["--user", "daemon-reload"], { quiet: true });
      if (reload.code === 0) {
        const en = await runStreaming("systemctl", ["--user", "enable", "--now", "astraura-voice.service"], { quiet: true });
        if (en.code === 0) {
          ok(`servicio systemd --user instalado y activo: ${dest}`);
          say("        (arranca con tu sesión; `systemctl --user status astraura-voice` para verlo)");
          return;
        }
      }
      warn("systemd --user no disponible; uso nohup como respaldo.");
      await nohupFallback();
    } catch (e) {
      warn(`no pude usar systemd (${e.message}); uso nohup como respaldo.`);
      await nohupFallback();
    }
    return;
  }

  // Windows u otros: sin servicio automático; instrucción manual.
  warn(`Sistema ${platform}: sin instalación de servicio automática.`);
  say(`        Arranca el daemon con:  ${process.execPath} ${DAEMON_JS}`);
  say("        (En Windows puedes crear una Tarea Programada 'Al iniciar sesión'.)");
}

/** Respaldo Linux sin systemd: lanza el daemon con nohup en segundo plano. */
async function nohupFallback() {
  try {
    const out = fs.openSync(path.join(PATHS.logsDir, "daemon.out.log"), "a");
    const child = spawn(process.execPath, [DAEMON_JS], { detached: true, stdio: ["ignore", out, out] });
    child.unref();
    ok(`daemon lanzado con nohup (PID ${child.pid}). Para pararlo: kill ${child.pid}`);
  } catch (e) {
    err(`nohup también falló: ${e.message}. Arráncalo a mano: ${process.execPath} ${DAEMON_JS}`);
  }
}

// ── Orquestación ─────────────────────────────────────────────────────────────
/**
 * DESINSTALACIÓN limpia (--uninstall): descarga el servicio del sistema y
 * borra ~/.starseed/astraura-voice (modelos, caché, logs). No toca nada más.
 */
async function uninstall() {
  say("");
  say("  🌌  ASTRAURA · Desinstalando el Motor de Voz local…");
  try {
    if (process.platform === "darwin") {
      const plist = path.join(
        os.homedir(),
        "Library/LaunchAgents/com.starseed.astraura-voice.plist",
      );
      if (fs.existsSync(plist)) {
        await runStreaming("launchctl", ["unload", plist], { quiet: true });
        fs.rmSync(plist, { force: true });
        ok("servicio launchd retirado");
      }
    } else if (process.platform === "linux") {
      await runStreaming("systemctl", ["--user", "disable", "--now", "astraura-voice.service"], { quiet: true });
      const unit = path.join(os.homedir(), ".config/systemd/user/astraura-voice.service");
      if (fs.existsSync(unit)) fs.rmSync(unit, { force: true });
      ok("servicio systemd retirado");
    }
  } catch {
    warn("no pude retirar el servicio (quizá no estaba instalado); sigo…");
  }
  try {
    fs.rmSync(PATHS.root, { recursive: true, force: true });
    ok(`borrado ${PATHS.root}`);
  } catch (e) {
    err(`no pude borrar ${PATHS.root}: ${e.message}`);
  }
  say("\n  ✓ Motor de voz desinstalado. La web seguirá hablando por la nube gratis.\n");
}

async function main() {
  if (OPT.uninstall) return uninstall();
  say("");
  say("  🌌  ASTRAURA · Instalador del Motor de Voz local (StarSeed OS)");
  say("  ══════════════════════════════════════════════════════════════");
  ensureDirs();

  // (a) Hardware + variante.
  step(1, "Sondeando el hardware y eligiendo variante…");
  const hardware = probeHardware();
  let variant = selectModelVariant(hardware);
  if (OPT.cpuOnly) {
    variant = { ...MODEL_VARIANTS.baja, backend: "cpu", buildScript: "./buildcpu.sh", reason: "--cpu-only forzado" };
  }
  ok(`${hardware.os}/${hardware.arch} · ${hardware.accel} · ${hardware.ramGB} GB RAM`);
  ok(`gama ${variant.tier.toUpperCase()} → ${variant.quant} · build ${variant.buildScript}`);
  say(`        modelo:  ${variant.modelFile}`);
  say(`        codec:   ${variant.codecFile}`);

  // (b) Repo.
  step(2, "Clonando/actualizando omnivoice.cpp…");
  const repoOk = await ensureRepo();
  if (!repoOk) {
    err("sin repo no se puede compilar. Aborto (revisa git/red).");
    process.exitCode = 1;
    return;
  }

  // (c) Build.
  step(3, "Compilando los binarios del motor…");
  const built = await buildEngine(variant);

  // (d) Modelos.
  step(4, "Descargando la variante del modelo asignada…");
  const models = await downloadModels(variant);

  // (e) Config.
  step(5, "Escribiendo config.json…");
  const cfg = writeConfigJson(hardware, variant);
  ok(`config: ${PATHS.configFile}`);

  // (f) Servicio.
  step(6, "Instalando el servicio persistente del daemon…");
  await installService();

  // Cierre.
  say("");
  say("  ──────────────────────────────────────────────────────────────");
  if (built && models) {
    say("  ✓ Instalación COMPLETA. El daemon sirve en:");
    say(`      http://${DAEMON_HOST}:${DAEMON_PORT}   (GET /status · POST /tts)`);
    say("    Pruébalo:");
    say(`      curl -s http://${DAEMON_HOST}:${DAEMON_PORT}/status | ${process.platform === "win32" ? "more" : "jq ."}`);
  } else {
    warn("Instalación PARCIAL:");
    if (!built) say("      · faltan los binarios (revisa logs/build.log).");
    if (!models) say("      · faltan modelos (revisa la red y vuelve a ejecutar: node install.mjs).");
    say("    El daemon responderá /status con ready:false y su motivo hasta completarse.");
  }
  say("  ══════════════════════════════════════════════════════════════\n");
  log("install", `instalación terminada · built=${built} models=${models} variant=${variant.quant}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    err(`error inesperado: ${e?.stack || e}`);
    log("install", `error inesperado: ${e?.stack || e}`);
    process.exitCode = 1;
  });
}

export { main };
