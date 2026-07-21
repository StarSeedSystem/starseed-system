#!/usr/bin/env node
// @ts-nocheck
/**
 * StarSeed OS — MOTOR DE VOZ ASTRAURA (paquete NATIVO) · daemon.mjs
 * ============================================================================
 * EL ASTRAURA DAEMON — un servidor HTTP puro (módulo `http` de Node, cero
 * dependencias) que escucha SÓLO en 127.0.0.1:4444 y habla con el motor
 * omnivoice.cpp de DOS formas (Adenda 89 — pool de tts-server):
 *
 *   1) PRIMARIA — un POOL de servidores `tts-server` (uno POR IDIOMA, en
 *      127.0.0.1:4500+n): cada uno carga el modelo UNA vez (residente en GPU)
 *      y lo mantiene, así que la síntesis siguiente es rápida y fiable. El
 *      daemon los lanza de forma perezosa (EAGER sólo el idioma primario,
 *      español, al arrancar), sondea su `/health` y los reutiliza mientras
 *      estén vivos (LRU acotado a 3 idiomas a la vez; el más inactivo se mata
 *      si hace falta sitio para uno nuevo).
 *   2) RESPALDO — el CLI one-shot `omnivoice-tts` (recarga el modelo entero en
 *      CADA llamada, ~25 s) si el servidor de ese idioma no se pudo lanzar, su
 *      `/health` no respondió a tiempo, o la síntesis por HTTP falló. Nunca
 *      deja al usuario sin voz.
 *
 * El "diseño" de la voz (género/edad/tono/acento) YA NO es texto libre: el
 * servidor sólo admite un VOCABULARIO CERRADO de tokens en `instructions` (ver
 * `VALID_INSTRUCT_TOKENS`) — el daemon SANEA cualquier instruct de entrada
 * contra ese vocabulario y, si no pasa, usa el default válido de la
 * personalidad (`INSTRUCT_BY_PERSONALITY`). El `--seed` sigue siendo estable
 * por personalidad (mismo timbre siempre). El idioma HABLADO no es parte del
 * instruct: lo fija `--lang` al lanzar cada servidor de ese idioma.
 *
 * Es el puente local del "Motor de Voz Híbrido": el frontend (StarSeed OS en el
 * navegador) le habla en http://127.0.0.1:4444; si el daemon no está listo, el
 * frontend usa la nube (HF Space k2-fsa/OmniVoice) — eso lo decide el frontend,
 * el daemon sólo hace la parte LOCAL (edge).
 *
 * Endpoints:
 *   GET  /status  → handshake JSON { ok, engine, ready, model, tier, backend,
 *                   version, warm, serverPool, uptime, sampleRate, idleMs,
 *                   busy, ... }
 *   POST /tts     → { text, lang?, personality?, instruct?, ... } → cuerpo
 *                   binario audio/wav (24 kHz); servidor residente → CLI
 *   POST /identity→ NO-OP honesto (compat): el servidor no clona referencias
 *   POST /warm    → asegura (lanza si hace falta) el servidor del idioma
 *                   primario (Spanish)
 *   OPTIONS *     → preflight CORS
 *
 * SEGURIDAD: allowlist CORS ESTRICTA (lib.isAllowedOrigin). Un Origin presente y
 * NO permitido recibe 403 sin cuerpo. Sin Origin (curl, apps nativas) se sirve
 * normal (no hay nada que "cross-originar" en loopback).
 *
 * "CALIENTE" / AUTO-SLEEP (honestidad radical, ver comentario en el temporizador):
 * ahora SÍ hay procesos de modelo residentes (los `tts-server` del pool), así
 * que "caliente" = al menos uno está lanzado y listo (`isWarm()`, derivada del
 * pool, ya no una bandera manual); "dormido" = tras 10 min sin síntesis MATAMOS
 * todos los servidores del pool (libera GPU/RAM) y purgamos la caché de WAV en
 * RAM. La siguiente síntesis (o un `/warm`) los relanza. El CLI de respaldo
 * sigue pagando su carga en cada llamada — eso es inherente al binario one-shot
 * y no cambia.
 *
 * ROBUSTO: ninguna petición mala tumba el proceso. Todo log a logs/daemon.log.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  PATHS,
  BIN,
  DAEMON_HOST,
  DAEMON_PORT,
  DAEMON_VERSION,
  ensureDirs,
  log,
  readConfig,
  isAllowedOrigin,
  isWav,
  retimeWav,
  resolveLang,
  langBaseOf,
  sha256,
} from "./lib.mjs";

// ── Vocabulario e instruct por personalidad (Adenda 89) ──────────────────────
// DESCUBRIMIENTO CLAVE (leyendo el código fuente de `tts-server`): `instructions`
// NO admite texto libre — sólo acepta estos TOKENS EN INGLÉS separados por
// "coma+espacio". Cualquier otro token (texto libre, español…) hace fallar la
// síntesis con 400. Esto INVALIDA los instructs de texto libre que usaba antes
// este daemon (p.ej. "voz femenina joven, cálida…"): ahora se construyen SOLO
// con tokens de este vocabulario. El idioma HABLADO no se controla aquí — lo
// fija `--lang` al lanzar el servidor de ese idioma (ver el pool más abajo);
// por eso no hay tokens de "acento español": para hablar español basta con
// `--lang Spanish` y el instruct sólo aporta género/edad/tono.
const VALID_INSTRUCT_TOKENS = new Set([
  // género
  "female", "male",
  // edad
  "child", "teenager", "young adult", "middle-aged", "elderly",
  // tono
  "very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch",
  // otros
  "whisper",
  // acentos (sólo tienen sentido si el idioma hablado del servidor es inglés)
  "american accent", "australian accent", "british accent", "canadian accent",
  "chinese accent", "indian accent", "japanese accent", "korean accent",
  "portuguese accent", "russian accent",
]);

/** Instruct por defecto (SIEMPRE tokens válidos) por personalidad. */
const INSTRUCT_BY_PERSONALITY = {
  aurora: "female, young adult, moderate pitch",
  hermione: "female, young adult, british accent",
  default: "female, young adult",
};

/** Nº máximo de tokens que aceptamos en un instruct (blindaje anti-abuso). */
const MAX_INSTRUCT_TOKENS = 8;

/**
 * Sanea un instruct de entrada (p.ej. `body.instruct`, texto libre que puede
 * venir de un ajuste de usuario en el frontend): sólo lo acepta si TODOS sus
 * tokens (separados por coma) están, en minúsculas, en `VALID_INSTRUCT_TOKENS`.
 * Si viene vacío, no es una cadena, no supera el saneo o excede el máximo de
 * tokens, devuelve `null` — el llamador debe entonces usar el default de la
 * personalidad. Nunca lanza.
 */
function sanitizeInstruct(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const tokens = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length || tokens.length > MAX_INSTRUCT_TOKENS) return null;
  if (!tokens.every((t) => VALID_INSTRUCT_TOKENS.has(t))) return null;
  return tokens.join(", ");
}

// ── Parámetros de operación ──────────────────────────────────────────────────

const SLEEP_MS = 10 * 60 * 1000; // 10 min sin síntesis → dormir (matar servidores + purgar RAM)
const SYNTH_TIMEOUT_MS = 180 * 1000; // presupuesto por síntesis del CLI (one-shot, recarga el modelo)
const SERVER_SYNTH_TIMEOUT_MS = 150 * 1000; // presupuesto por síntesis del SERVIDOR. En un M1/8 GB la inferencia es ~6-7× tiempo real: un trozo por frase (~220 car.) puede tardar ~90 s. 60 s abortaba trozos que iban a completar → caía al CLI (aún más lento) → fallo total → el frontend caía a Kokoro. 150 s (< watchdog CLI 180 s) deja que el trozo termine en el servidor residente.
const MAX_BODY_BYTES = 512 * 1024; // límite del cuerpo POST
const MAX_TEXT_CHARS = 8000; // límite de texto por locución
const MAX_QUEUE = 8; // síntesis en cola antes de responder 503
const RAM_CACHE_MAX = 16; // WAV cacheados en RAM (se purgan al dormir)
const DISK_CACHE_MAX = 64; // WAV cacheados en disco (cache/)

// ── Parámetros del POOL de servidores tts-server (uno residente por idioma) ──
const SERVER_BASE_PORT = 4500; // base de puertos del pool (el daemon usa 4444)
const SERVER_PORT_RANGE = 1000; // puertos [4500, 5499): de sobra para un pool de 3
const SERVER_POOL_MAX = 3; // nº máx. de servidores tts-server vivos a la vez (LRU)
const SERVER_HEALTH_TIMEOUT_MS = 30 * 1000; // plazo máx. para que /health diga "ok"
const SERVER_HEALTH_POLL_MS = 300; // intervalo de sondeo de /health mientras carga
const PRIMARY_LANG = "Spanish"; // idioma que se precalienta EAGER al arrancar el daemon

// ── Estado en vivo ───────────────────────────────────────────────────────────

const startedAt = Date.now();
let lastReq = Date.now(); // última SÍNTESIS (no cuenta /status)
// "Caliente" YA NO es una bandera manual (Adenda 88) sino un HECHO observable:
// hay al menos un servidor tts-server RESIDENTE con el modelo cargado en GPU
// (ver isWarm() más abajo, derivada de `serverPool`). Arranca FRÍO igual que
// antes (el pool empieza vacío); el arranque EAGER del idioma primario (ver
// "Arranque" al final del fichero) lo pone caliente en cuanto puede.
let inFlight = 0; // síntesis (servidor o CLI) ejecutándose ahora
let queueDepth = 0; // síntesis esperando su turno
const ramCache = new Map(); // hash → Buffer (LRU sencillo)

// ── Cola de síntesis (serializa TODA síntesis: servidor o CLI) ───────────────
// El CLI carga el modelo entero en CADA llamada; en máquinas modestas dos cargas
// simultáneas podrían agotar la RAM. El servidor residente es más barato, pero
// comparte la MISMA GPU entre idiomas — seguimos serializando por simplicidad y
// seguridad (nunca dos inferencias peleándose por la misma tarjeta). Un único
// trabajo de la cola intenta primero el servidor y, si hace falta, cae al CLI
// (ver handleTts): sigue siendo "una carga/inferencia cara a la vez".
let chain = Promise.resolve();
function enqueue(job) {
  if (queueDepth >= MAX_QUEUE) return Promise.reject(new Error("cola llena"));
  queueDepth++;
  const run = chain.then(async () => {
    queueDepth--;
    inFlight++;
    try {
      return await job();
    } finally {
      inFlight--;
    }
  });
  // La cadena continúa aunque este trabajo falle (no rompe la cola).
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── Resolución de rutas / disponibilidad ─────────────────────────────────────

/** Rutas efectivas (config si existe; si no, las de por defecto del árbol). */
function resolvePaths(cfg) {
  const buildDir = cfg?.paths?.buildDir || PATHS.buildDir;
  return {
    tts: cfg?.paths?.tts || path.join(buildDir, BIN.tts),
    // tts-server (Adenda 89): servidor HTTP hermano del CLI, mismo buildDir —
    // ver cabecera del fichero. `paths.ttsServer` queda disponible para una
    // futura config.json explícita, igual que `tts`/`codec`.
    ttsServer: cfg?.paths?.ttsServer || path.join(buildDir, BIN.ttsServer),
    repoDir: cfg?.repoDir || PATHS.repoDir,
    modelFile: cfg?.modelFile || "",
    codecFile: cfg?.codecFile || "",
  };
}

/** ¿Existe un fichero regular no vacío? */
function fileOk(p) {
  try {
    return !!p && fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

/**
 * readiness — ¿puede el daemon sintetizar ahora? Se recalcula en cada petición
 * para reflejar una instalación que acabe MIENTRAS el daemon corre (sin reiniciar).
 * Devuelve { ready, reasons[], cfg, paths }.
 */
function readiness() {
  const cfg = readConfig();
  const p = resolvePaths(cfg);
  const reasons = [];
  if (!cfg) reasons.push("sin config.json (ejecuta install.mjs para instalar el motor local)");
  if (!fileOk(p.tts)) reasons.push(`falta el binario omnivoice-tts en ${p.tts}`);
  if (!fileOk(p.modelFile)) reasons.push(`falta el modelo GGUF (${p.modelFile || "no configurado"})`);
  if (!fileOk(p.codecFile)) reasons.push(`falta el tokenizer/codec GGUF (${p.codecFile || "no configurado"})`);
  return { ready: reasons.length === 0, reasons, cfg, paths: p };
}

// ── Caché en disco (cache/<hash>.wav) ────────────────────────────────────────

function diskCachePath(hash) {
  return path.join(PATHS.cacheDir, `${hash}.wav`);
}

/** Poda la caché de disco al máximo configurado (borra los WAV más antiguos). */
function pruneDiskCache() {
  try {
    const files = fs
      .readdirSync(PATHS.cacheDir)
      .filter((f) => f.endsWith(".wav"))
      .map((f) => ({ f, t: fs.statSync(path.join(PATHS.cacheDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(DISK_CACHE_MAX)) {
      try {
        fs.unlinkSync(path.join(PATHS.cacheDir, f));
      } catch {
        /* */
      }
    }
  } catch {
    /* */
  }
}

/** Mete un buffer en la LRU de RAM (desaloja el más antiguo si se pasa). */
function ramCachePut(hash, buf) {
  ramCache.set(hash, buf);
  while (ramCache.size > RAM_CACHE_MAX) {
    const oldest = ramCache.keys().next().value;
    ramCache.delete(oldest);
  }
}

// ── Pool de servidores tts-server (uno residente por idioma) ────────────────
// `tts-server` es un servidor HTTP que carga el modelo UNA vez (queda residente
// en GPU) y lo mantiene mientras vive. A diferencia del CLI `omnivoice-tts`
// (one-shot: carga+sintetiza+muere en CADA llamada), aquí pagamos la carga
// SÓLO al lanzar el proceso — las síntesis siguientes son rápidas. Gestionamos
// UN proceso por idioma (el `--lang` de tts-server es fijo para toda su vida),
// en un pool acotado a `SERVER_POOL_MAX` idiomas simultáneos con desalojo LRU.
//
//   serverPool: Map<langName, entry>
//   entry = { lang, port, proc, ready, dead, killedByUs, startedAt, lastUsed,
//             readyPromise }
//
// NUNCA lanza: cualquier fallo (binario ausente, puerto ocupado, timeout de
// /health…) deja `entry.dead = true` y `getReadyServer` devuelve `null` — el
// llamador (handleTts / handleWarm) cae entonces al CLI de respaldo.

const serverPool = new Map();
let nextPortIndex = 0;

/** ¿Hay al menos un servidor tts-server residente y listo? Esto ES "caliente". */
function isWarm() {
  for (const e of serverPool.values()) {
    if (e.ready && !e.dead) return true;
  }
  return false;
}

/** Resumen del pool para /status: idiomas activos, en arranque, cupo y tamaño. */
function serverPoolSummary() {
  const active = [];
  const launching = [];
  for (const [lang, e] of serverPool) {
    if (e.dead) continue;
    (e.ready ? active : launching).push(lang);
  }
  return { active, launching, max: SERVER_POOL_MAX, size: serverPool.size };
}

/** Mata (SIGTERM) el servidor de un idioma y lo saca del pool. Idempotente. */
function killServerEntry(lang, reason) {
  const entry = serverPool.get(lang);
  if (!entry) return;
  serverPool.delete(lang);
  entry.dead = true;
  entry.ready = false;
  entry.killedByUs = true;
  try {
    if (entry.proc && !entry.proc.killed) entry.proc.kill("SIGTERM");
  } catch {
    /* */
  }
  log("daemon", `tts-server[${lang}] detenido (puerto ${entry.port}): ${reason}`);
}

/** Mata TODOS los servidores del pool (SIGTERM/SIGINT del daemon, auto-sleep). */
function killAllServers(reason) {
  for (const lang of [...serverPool.keys()]) killServerEntry(lang, reason);
}

/** Desaloja (mata) el servidor con `lastUsed` más antiguo (política LRU). */
function evictOldestServer() {
  let oldestLang = null;
  let oldestAt = Infinity;
  for (const [lang, e] of serverPool) {
    if (e.lastUsed < oldestAt) {
      oldestAt = e.lastUsed;
      oldestLang = lang;
    }
  }
  if (oldestLang) killServerEntry(oldestLang, "cupo del pool lleno (LRU)");
}

/**
 * Lanza `tts-server` para un idioma y sondea `GET /health` hasta que responda
 * `{status:"ok"}` o venza `SERVER_HEALTH_TIMEOUT_MS`. Actualiza `entry` in situ
 * (`ready`/`dead`). Devuelve una promesa de `boolean` (true = quedó listo) que
 * NUNCA rechaza.
 */
function launchServer(entry, paths) {
  return new Promise((resolve) => {
    if (!fileOk(paths.ttsServer)) {
      entry.dead = true;
      log("daemon", `tts-server[${entry.lang}]: falta el binario en ${paths.ttsServer}`);
      return resolve(false);
    }
    const args = [
      "--model", paths.modelFile,
      "--codec", paths.codecFile,
      "--host", DAEMON_HOST,
      "--port", String(entry.port),
      "--lang", entry.lang,
    ];
    let proc;
    try {
      proc = spawn(paths.ttsServer, args, { cwd: paths.repoDir, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      entry.dead = true;
      log("daemon", `tts-server[${entry.lang}]: no se pudo lanzar: ${e.message}`);
      return resolve(false);
    }
    entry.proc = proc;
    entry.startedAt = Date.now();

    // Cola circular de salida (para diagnosticar un arranque o una muerte
    // inesperada; nunca crece sin límite).
    let outputTail = "";
    const capture = (d) => {
      outputTail += String(d);
      if (outputTail.length > 4096) outputTail = outputTail.slice(-4096);
    };
    proc.stdout?.on("data", capture);
    proc.stderr?.on("data", capture);

    proc.on("error", (e) => {
      entry.dead = true;
      entry.ready = false;
      log("daemon", `tts-server[${entry.lang}] error de proceso: ${e.message}`);
    });
    proc.on("exit", (code, signal) => {
      entry.dead = true;
      entry.ready = false;
      // Si lo matamos nosotros (LRU/auto-sleep/cierre) ya quedó logueado en
      // killServerEntry; sólo alertamos aquí de una muerte NO pedida (crash).
      if (!entry.killedByUs) {
        log(
          "daemon",
          `tts-server[${entry.lang}] (puerto ${entry.port}) salió de forma inesperada` +
            ` (code=${code} signal=${signal}): ${outputTail.trim().slice(-500)}`,
        );
      }
    });

    // Sondeo de /health hasta SERVER_HEALTH_TIMEOUT_MS (el socket puede tardar
    // unos segundos en escuchar mientras el modelo se carga en GPU).
    const deadline = Date.now() + SERVER_HEALTH_TIMEOUT_MS;
    const poll = async () => {
      if (entry.dead) return resolve(false);
      try {
        const r = await fetch(`http://${DAEMON_HOST}:${entry.port}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (r.ok) {
          const j = await r.json().catch(() => null);
          if (j && j.status === "ok") {
            entry.ready = true;
            log("daemon", `tts-server[${entry.lang}] listo en el puerto ${entry.port} (${Date.now() - entry.startedAt} ms)`);
            return resolve(true);
          }
        }
      } catch {
        /* aún no escucha, o el modelo sigue cargando: reintenta */
      }
      if (entry.dead) return resolve(false);
      if (Date.now() >= deadline) {
        log("daemon", `tts-server[${entry.lang}]: /health no respondió a tiempo (${SERVER_HEALTH_TIMEOUT_MS} ms)`);
        return resolve(false);
      }
      setTimeout(poll, SERVER_HEALTH_POLL_MS);
    };
    poll();
  });
}

/**
 * Asegura la ENTRADA del pool para un idioma (la crea y lanza su proceso si
 * hace falta; reutiliza la existente si ya está viva o arrancando). Aplica LRU
 * si el pool está lleno. Síncrona: sin `await` antes de registrar la entrada
 * en `serverPool`, así dos peticiones "simultáneas" para el MISMO idioma nunca
 * lanzan dos procesos (Node es de un solo hilo: no hay carrera posible).
 */
function ensureServerEntry(langName, paths) {
  const existing = serverPool.get(langName);
  if (existing && !existing.dead) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (!serverPool.has(langName) && serverPool.size >= SERVER_POOL_MAX) {
    evictOldestServer();
  }
  const port = SERVER_BASE_PORT + (nextPortIndex++ % SERVER_PORT_RANGE);
  const entry = {
    lang: langName,
    port,
    proc: null,
    ready: false,
    dead: false,
    killedByUs: false,
    startedAt: 0,
    lastUsed: Date.now(),
    readyPromise: null,
  };
  serverPool.set(langName, entry);
  entry.readyPromise = launchServer(entry, paths);
  return entry;
}

/**
 * Punto de entrada del pool: devuelve la `entry` LISTA de un idioma (lanzándola
 * si hace falta y esperando su sondeo de salud), o `null` si no se pudo dejar
 * lista a tiempo. Nunca lanza.
 */
async function getReadyServer(langName, paths) {
  try {
    const entry = ensureServerEntry(langName, paths);
    await entry.readyPromise;
    entry.lastUsed = Date.now();
    return entry.ready && !entry.dead ? entry : null;
  } catch {
    return null;
  }
}

/**
 * Pide la síntesis al SERVIDOR RESIDENTE ya listo de un idioma. Habla el
 * protocolo verificado de `tts-server`: POST /v1/audio/speech con
 * {input, instructions, seed, response_format:"wav"} → 200 audio/wav, o 400
 * {error:{message}} si el instruct no es válido. NO manda ref-wav: el
 * servidor no clona (ver §/identity más abajo). Devuelve {ok, buffer|error}.
 * Nunca lanza.
 */
async function synthViaServer(entry, { text, instructions, seed }) {
  try {
    const r = await fetch(`http://${DAEMON_HOST}:${entry.port}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text, instructions, seed, response_format: "wav" }),
      signal: AbortSignal.timeout(SERVER_SYNTH_TIMEOUT_MS),
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = await r.json();
        if (j?.error?.message) msg = j.error.message;
      } catch {
        /* el cuerpo del error no era JSON */
      }
      return { ok: false, error: `tts-server respondió ${r.status}: ${msg}` };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!isWav(buf)) return { ok: false, error: "tts-server: la respuesta no es un WAV válido" };
    return { ok: true, buffer: buf };
  } catch (e) {
    return { ok: false, error: `fallo al hablar con tts-server: ${e?.message || e}` };
  }
}

// ── Síntesis con el CLI omnivoice-tts ────────────────────────────────────────

/**
 * Ejecuta `omnivoice-tts` (spawn) para producir un WAV. El texto entra por STDIN.
 * Clonación opcional con --ref-wav / --ref-text. Devuelve { ok, buffer|error }.
 * NUNCA lanza (los errores viajan en el objeto de retorno).
 */
function runTts({ ttsBin, repoDir, modelFile, codecFile, langName, text, refWav, refTextFile, instruct, seed }) {
  return new Promise((resolve) => {
    const outWav = path.join(PATHS.tmpDir, `astraura-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`);
    const args = ["--model", modelFile, "--codec", codecFile, "--lang", langName, "-o", outWav];
    // IDENTIDAD (Adenda 87): el CLI real SÍ soporta --instruct (estilo) y
    // --seed (muestreo determinista → mismo timbre siempre). Verificado con
    // omnivoice-tts --help f39cc4a: "--instruct <str>", "--seed <int>".
    if (instruct) args.push("--instruct", String(instruct).slice(0, 300));
    if (Number.isFinite(seed)) args.push("--seed", String(Math.trunc(seed)));
    // CLONACIÓN: el ejemplo del CLI usa `--ref-wav ref.wav --ref-text ref.txt`
    // (ref-text es un FICHERO con la transcripción, no la cadena).
    if (refWav) args.push("--ref-wav", refWav);
    if (refTextFile) args.push("--ref-text", refTextFile);

    let stderr = "";
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(killer);
      // Limpieza del WAV temporal (si lo leímos, ya lo tenemos en buffer).
      try {
        fs.existsSync(outWav) && fs.unlinkSync(outWav);
      } catch {
        /* */
      }
      resolve(result);
    };

    let child;
    try {
      child = spawn(ttsBin, args, { cwd: repoDir, stdio: ["pipe", "ignore", "pipe"] });
    } catch (e) {
      return finish({ ok: false, error: `no se pudo lanzar omnivoice-tts: ${e.message}` });
    }

    const killer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* */
      }
      finish({ ok: false, error: `timeout de síntesis (${SYNTH_TIMEOUT_MS} ms)` });
    }, SYNTH_TIMEOUT_MS);

    child.on("error", (e) => finish({ ok: false, error: `error de proceso: ${e.message}` }));
    child.stderr?.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
    child.on("close", (code) => {
      if (code !== 0) return finish({ ok: false, error: `omnivoice-tts salió con código ${code}: ${stderr.trim().slice(-500)}` });
      let buf;
      try {
        buf = fs.readFileSync(outWav);
      } catch (e) {
        return finish({ ok: false, error: `no se pudo leer el WAV de salida: ${e.message}` });
      }
      if (!isWav(buf)) return finish({ ok: false, error: "la salida no es un WAV válido" });
      finish({ ok: true, buffer: buf });
    });

    // El texto va por STDIN (o `< fichero`); aquí por STDIN.
    try {
      child.stdin.write(text);
      child.stdin.end();
    } catch (e) {
      finish({ ok: false, error: `no se pudo escribir el texto en stdin: ${e.message}` });
    }
  });
}

// ── Manejo de /tts ───────────────────────────────────────────────────────────

/** Lee el cuerpo POST hasta MAX_BODY_BYTES. Devuelve string o null (excedido). */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        resolve(null);
        try {
          req.destroy();
        } catch {
          /* */
        }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => !aborted && resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

/**
 * Deriva el fichero de texto de referencia para clonación. Si `ref_text` es una
 * cadena, la escribe a un .txt temporal y devuelve su ruta; si ya es una ruta a
 * un .txt existente, la devuelve tal cual. Devuelve "" si no hay.
 */
function resolveRefTextFile(refText) {
  if (!refText || typeof refText !== "string") return "";
  try {
    if (refText.endsWith(".txt") && fs.existsSync(refText)) return refText;
  } catch {
    /* */
  }
  try {
    const f = path.join(PATHS.tmpDir, `ref-${sha256(refText).slice(0, 12)}.txt`);
    fs.writeFileSync(f, refText);
    return f;
  } catch {
    return "";
  }
}

async function handleTts(req, res, cors) {
  const state = readiness();
  if (!state.ready) {
    return sendJson(res, 503, cors, { ok: false, ready: false, error: "motor no listo", reasons: state.reasons });
  }

  const raw = await readBody(req);
  if (raw === null) return sendJson(res, 413, cors, { ok: false, error: "cuerpo demasiado grande" });
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return sendJson(res, 400, cors, { ok: false, error: "JSON inválido" });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  if (!text) return sendJson(res, 400, cors, { ok: false, error: "falta 'text'" });

  const langName = resolveLang(body.lang, "Spanish");
  // Idioma BASE (2 letras) de ESTA locución: gobierna qué referencia por
  // idioma clona el CAMINO DE RESPALDO del CLI (ver más abajo; el camino
  // PRIMARIO del servidor no clona nada). Mismo default ("es") que
  // resolveLang/langName.
  const langBase = langBaseOf(body.lang);
  const speed = Number.isFinite(body.speed) ? body.speed : 1;

  // Clonación de voz (SÓLO camino de respaldo del CLI: el servidor NO clona,
  // ver §/identity): ref_wav_path (o voice_clone_prompt como ruta a WAV) + ref_text.
  let refWav =
    (typeof body.ref_wav_path === "string" && body.ref_wav_path) ||
    (typeof body.voice_clone_prompt === "string" && body.voice_clone_prompt.endsWith(".wav") && body.voice_clone_prompt) ||
    "";
  let refTextFile = refWav ? resolveRefTextFile(body.ref_text) : "";

  const personality = typeof body.personality === "string"
    ? body.personality.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40)
    : "";
  // IDENTIDAD POR PERSONALIDAD *Y POR IDIOMA* (Adenda 87): si el cuerpo trae
  // `personality` y hay una referencia guardada en refs/<id>.<langBase>.wav
  // (histórico; /identity ya no escribe ninguna, ver más abajo), el camino de
  // RESPALDO del CLI la clona. Una referencia grabada en OTRO idioma NUNCA se
  // clona para hablar este. Si no existe, no se clona nada: sólo --instruct
  // (vocabulario, ver INSTRUCT_BY_PERSONALITY) + --seed estable.
  if (!refWav && personality) {
    const idWav = path.join(PATHS.refsDir, `${personality}.${langBase}.wav`);
    const idTxt = path.join(PATHS.refsDir, `${personality}.${langBase}.txt`);
    try {
      if (fs.existsSync(idWav)) {
        refWav = idWav;
        if (fs.existsSync(idTxt)) refTextFile = idTxt;
      }
    } catch { /* sin identidad guardada para este idioma: sigue sin clonar */ }
  }

  // Campos aceptados por compatibilidad pero sin flag en el CLI/servidor.
  const ignored = [];
  for (const k of ["voice_design", "normalize", "allow_non_verbal"]) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== "") ignored.push(k);
  }

  // INSTRUCT VÁLIDO (vocabulario cerrado, Adenda 89 — ver VALID_INSTRUCT_TOKENS):
  // si `body.instruct` viene informado se sanea contra el vocabulario; si NO
  // pasa el saneo (texto libre, español, token desconocido…) se IGNORA (se
  // anota en X-Astraura-Ignored) y se usa el default de la personalidad.
  // SIEMPRE saneado: nunca se reenvía texto libre al servidor ni al CLI.
  const personaKey = personality || "aurora"; // sin personalidad: identidad Aurora
  let instruct = sanitizeInstruct(body.instruct);
  if (!instruct) {
    if (typeof body.instruct === "string" && body.instruct.trim()) ignored.push("instruct");
    instruct = INSTRUCT_BY_PERSONALITY[personaKey] || INSTRUCT_BY_PERSONALITY.default;
  }

  // SEMILLA determinista por personalidad (Adenda 87, fórmula intacta): mismo
  // timbre SIEMPRE aunque no haya referencia (el seed fija el muestreo).
  let seed = Number.isFinite(body.seed) ? Math.trunc(Number(body.seed)) : NaN;
  if (!Number.isFinite(seed)) {
    let h = 0;
    for (const ch of personaKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    seed = 700000 + (h % 90000);
  }

  // Marca actividad (cuenta para /status.idleMs y el auto-sleep) y clave de
  // caché (incluye idioma + identidad + instruct + seed).
  lastReq = Date.now();
  const cfg = state.cfg || {};
  const variantTag = cfg?.variant?.quant || "";
  const key = sha256([text, langName, langBase, refWav, refTextFile, speed, variantTag, instruct, String(seed)].join("|"));

  const extraHeaders = {
    "X-Astraura-Engine": "omnivoice.cpp",
    "X-Astraura-SampleRate": "24000",
  };
  if (ignored.length) extraHeaders["X-Astraura-Ignored"] = ignored.join(",");

  // 1) Caché en RAM (instantánea).
  const ramHit = ramCache.get(key);
  if (ramHit) {
    ramCache.delete(key);
    ramCache.set(key, ramHit); // refresca LRU
    return sendWav(res, cors, applySpeed(ramHit, speed, extraHeaders), { ...extraHeaders, "X-Astraura-Cache": "ram" });
  }
  // 2) Caché en disco.
  try {
    const dp = diskCachePath(key);
    if (fileOk(dp)) {
      const buf = fs.readFileSync(dp);
      if (isWav(buf)) {
        ramCachePut(key, buf);
        return sendWav(res, cors, applySpeed(buf, speed, extraHeaders), { ...extraHeaders, "X-Astraura-Cache": "disk" });
      }
    }
  } catch {
    /* */
  }

  // 3) Síntesis real. Preferimos el SERVIDOR RESIDENTE del idioma (modelo ya
  // cargado en GPU: rápido y fiable); si no se puede lanzar, su /health no
  // responde a tiempo, o el POST falla, caemos al CLI one-shot de siempre
  // (más lento, pero nunca deja al usuario sin voz) — con el MISMO instruct
  // válido y la MISMA seed. Un único trabajo de la cola serializa el intento
  // completo (servidor→CLI): sigue siendo "una inferencia cara a la vez".
  const serverEntry = await getReadyServer(langName, state.paths);

  let result;
  try {
    result = await enqueue(async () => {
      if (serverEntry) {
        const r = await synthViaServer(serverEntry, { text, instructions: instruct, seed });
        if (r.ok) return { ...r, engine: "server" };
        log("daemon", `tts-server[${langName}] síntesis fallida, caigo al CLI: ${r.error}`);
      }
      const r2 = await runTts({
        ttsBin: state.paths.tts,
        repoDir: state.paths.repoDir,
        modelFile: state.paths.modelFile,
        codecFile: state.paths.codecFile,
        langName,
        text,
        refWav,
        refTextFile,
        instruct,
        seed,
      });
      return { ...r2, engine: "cli" };
    });
  } catch (e) {
    return sendJson(res, 503, cors, { ok: false, error: `daemon ocupado: ${e.message}` });
  }

  if (!result.ok) {
    log("daemon", `síntesis fallida (servidor+CLI): ${result.error}`);
    return sendJson(res, 500, cors, { ok: false, error: result.error });
  }
  extraHeaders["X-Astraura-Backend"] = result.engine === "server" ? "tts-server" : "omnivoice-tts-cli";

  // Guarda en cachés (el WAV base, SIN el retimeo de velocidad).
  ramCachePut(key, result.buffer);
  try {
    fs.writeFileSync(diskCachePath(key), result.buffer);
    pruneDiskCache();
  } catch {
    /* */
  }
  lastReq = Date.now();
  return sendWav(res, cors, applySpeed(result.buffer, speed, extraHeaders), { ...extraHeaders, "X-Astraura-Cache": "miss" });
}

/** Aplica velocidad por cabecera WAV (si procede) y anota la nota en headers. */
function applySpeed(buf, speed, headers) {
  if (Number.isFinite(speed) && Math.abs(speed - 1) >= 0.01) {
    const out = retimeWav(buf, speed);
    if (out !== buf) headers["X-Astraura-Speed"] = `header-resample:${speed} (afecta al tono)`;
    return out;
  }
  return buf;
}

// ── Respuestas ───────────────────────────────────────────────────────────────

function sendJson(res, status, cors, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, ...cors });
  res.end(body);
}

function sendWav(res, cors, buf, extra) {
  res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": buf.length, ...cors, ...extra });
  res.end(buf);
}

// ── /identity — NO-OP HONESTO (Adenda 89: pool de tts-server) ───────────────
//
// ANTES este endpoint guardaba un WAV de referencia (refs/<id>.<langBase>.wav)
// para que el CLI lo clonara con --ref-wav. El camino PRIMARIO ahora es el
// SERVIDOR residente, que NO clona audio de referencia — sólo diseña la voz
// por VOCABULARIO (`instructions`, ver VALID_INSTRUCT_TOKENS) + `seed`
// determinista (mismo timbre siempre, ver handleTts). Seguir "guardando" el
// WAV serviría ÚNICAMENTE al camino de respaldo del CLI (poco frecuente) a
// costa de que el frontend crea que hay clonación cuando la voz real que oye
// casi siempre viene del servidor sin clonar — mentira por omisión. Así que
// este endpoint es ahora un NO-OP HONESTO: no persiste nada y lo dice.
// Se MANTIENE por compatibilidad (`ensureLocalIdentity` en omnivoice-hybrid.ts
// sólo mira `res.ok` para marcar la identidad como "subida" y no reintentar) —
// responde 200 siempre para no romper ese flujo. Mismo CORS estricto que el
// resto de endpoints; drena el cuerpo respetando el límite de tamaño (puede
// traer un WAV en base64).
async function handleIdentity(req, res, cors) {
  const raw = await readBody(req);
  if (raw === null) return sendJson(res, 413, cors, { ok: false, error: "cuerpo demasiado grande" });
  return sendJson(res, 200, cors, {
    ok: true,
    note: "el motor servidor usa diseño por vocabulario + seed, no clonación de referencia",
  });
}

// ── /warm — asegura el SERVIDOR del idioma primario (Adenda 89) ─────────────
//
// ANTES (CLI one-shot) "precalentar" era lanzar una síntesis mínima descartable
// para dejar el modelo en la caché de página del SO (Adenda 88). AHORA que hay
// un servidor RESIDENTE, "caliente" = ese proceso está lanzado y su /health
// dice "ok" — así que /warm simplemente ASEGURA (lanza si hace falta) el
// servidor del idioma PRIMARIO (Spanish). El frontend llama a /warm de forma
// proactiva (al abrir la app, al empezar un turno, keep-alive cada ~7 min) para
// que la neurona que ELIGIÓ voz local la oiga SIEMPRE.
//
// Responde AL INSTANTE (no bloquea hasta ~30 s de arranque+carga): el
// lanzamiento corre en segundo plano. Idempotente: si ya hay un arranque en
// vuelo para ese idioma, `getReadyServer` lo REUTILIZA (no lanza un 2º proceso).
function handleWarm(req, res, cors) {
  const state = readiness();
  if (!state.ready) {
    return sendJson(res, 503, cors, { ok: false, ready: false, warmed: false, reasons: state.reasons });
  }
  const langName = PRIMARY_LANG;
  const already = serverPool.get(langName);
  // Ya caliente Y con actividad reciente: sólo extiende la ventana (keep-alive)
  // sin tocar el proceso — evita que el auto-sleep lo mate mientras la pestaña
  // siga viva.
  if (already && already.ready && !already.dead && Date.now() - lastReq < SLEEP_MS) {
    lastReq = Date.now();
    return sendJson(res, 200, cors, { ok: true, warmed: false, warm: true, reason: "ya caliente" });
  }
  sendJson(res, 200, cors, { ok: true, warmed: true, background: true });
  const t0 = Date.now();
  getReadyServer(langName, state.paths)
    .then((entry) => {
      if (entry) {
        lastReq = Date.now();
        log("daemon", `precalentado: tts-server[${langName}] listo en ${Date.now() - t0} ms`);
      } else {
        log("daemon", `precalentado: tts-server[${langName}] no quedó listo a tiempo (la síntesis real caerá al CLI de respaldo)`);
      }
    })
    .catch(() => {
      /* un fallo de precalentado no es crítico: la síntesis real lo reintentará */
    });
}

// ── /status ──────────────────────────────────────────────────────────────────

function handleStatus(res, cors) {
  const state = readiness();
  const cfg = state.cfg || {};
  const payload = {
    ok: true,
    engine: "omnivoice.cpp",
    ready: state.ready,
    model: cfg.modelFile ? path.basename(cfg.modelFile) : null,
    tier: cfg?.variant?.tier || null,
    backend: cfg?.variant?.backend || null,
    quant: cfg?.variant?.quant || null,
    version: DAEMON_VERSION,
    // "Caliente" = hay al menos un servidor tts-server residente y listo (ver
    // isWarm()) — ya NO es una bandera manual: es un hecho observable del pool.
    warm: isWarm(),
    serverPool: serverPoolSummary(),
    uptime: Math.round((Date.now() - startedAt) / 1000),
    sampleRate: 24000,
    idleMs: Date.now() - lastReq, // para el autosync: ¿lleva rato inactivo?
    busy: inFlight > 0,
    inFlight,
    queueDepth,
    cloudFallback: cfg?.capabilities?.cloudFallback || "k2-fsa/OmniVoice",
  };
  if (!state.ready) payload.reasons = state.reasons;
  sendJson(res, 200, cors, payload);
}

// ── Servidor HTTP ────────────────────────────────────────────────────────────

function buildCors(origin) {
  // Sólo emitimos ACAO si el Origin casa con la allowlist. Sin Origin: {} (no
  // hay nada que cross-originar; petición local/servidor a servidor).
  if (origin && isAllowedOrigin(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {};
}

const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    // Origin PRESENTE y no permitido → 403 sin cuerpo (regla de seguridad).
    if (origin && !isAllowedOrigin(origin)) {
      res.writeHead(403);
      return res.end();
    }
    const cors = buildCors(origin);

    // Preflight CORS.
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }

    const url = (req.url || "/").split("?")[0];

    if (req.method === "GET" && (url === "/status" || url === "/")) {
      return handleStatus(res, cors);
    }
    if (req.method === "POST" && url === "/identity") {
      return handleIdentity(req, res, cors);
    }
    if ((req.method === "POST" || req.method === "GET") && url === "/warm") {
      return handleWarm(req, res, cors);
    }
    if (req.method === "POST" && url === "/tts") {
      return await handleTts(req, res, cors);
    }

    return sendJson(res, 404, cors, { ok: false, error: "ruta no encontrada", routes: ["GET /status", "POST /tts", "POST /identity", "POST /warm"] });
  } catch (e) {
    // Blindaje total: ninguna petición mala tumba el daemon.
    try {
      log("daemon", `excepción no controlada: ${e?.stack || e}`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "error interno" }));
      } else {
        res.end();
      }
    } catch {
      /* */
    }
  }
});

// EADDRINUSE: ya hay un daemon escuchando (p.ej. el .command se ejecutó 2 veces
// o el servicio ya lo arrancó). Salimos limpiamente en vez de reventar.
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    log("daemon", `El puerto ${DAEMON_PORT} ya está en uso: probablemente el daemon ya corre. Saliendo.`);
    process.exit(0);
  }
  log("daemon", `Error del servidor: ${err?.message || err}`);
  process.exit(1);
});

// ── Temporizador de auto-sleep ───────────────────────────────────────────────
// Ahora SÍ hay procesos de modelo residentes que dormir (Adenda 89): al pasar
// SLEEP_MS sin síntesis, MATAMOS todos los tts-server del pool (libera la GPU/
// RAM que ocupaba el modelo cargado), purgamos la caché de WAV en RAM y
// sugerimos al SO recolectar. La siguiente síntesis (o un /warm) los relanza.
setInterval(() => {
  if (isWarm() && Date.now() - lastReq > SLEEP_MS) {
    killAllServers(`auto-sleep: ${Math.round(SLEEP_MS / 60000)} min sin síntesis`);
    ramCache.clear();
    try {
      if (global.gc) global.gc(); // sólo si se arrancó con --expose-gc
    } catch {
      /* */
    }
    log(
      "daemon",
      `Durmiendo: ${Math.round(SLEEP_MS / 60000)} min sin síntesis · servidores tts-server detenidos · caché en RAM purgada.`,
    );
  }
}, 60 * 1000);

// ── Arranque ─────────────────────────────────────────────────────────────────

ensureDirs();
const state0 = readiness();
server.listen(DAEMON_PORT, DAEMON_HOST, () => {
  log(
    "daemon",
    `Astraura daemon escuchando en http://${DAEMON_HOST}:${DAEMON_PORT}` +
      ` · ready=${state0.ready}` +
      (state0.ready ? ` · modelo=${state0.cfg?.modelFile ? path.basename(state0.cfg.modelFile) : "?"}` : ` · motivo: ${state0.reasons[0]}`),
  );
});

// EAGER (Adenda 89): si el motor está listo, lanza YA el servidor del idioma
// PRIMARIO (Spanish) para que la 1ª petición real no tenga que esperar su
// arranque+carga. Nunca bloquea el arranque del daemon ni lanza: si el
// binario tts-server falta o no queda listo a tiempo, el primer /tts cae al
// CLI de respaldo con normalidad (ver handleTts).
if (state0.ready) {
  getReadyServer(PRIMARY_LANG, state0.paths).catch(() => {
    /* sin urgencia: el primer /tts real reintentará o caerá al CLI */
  });
}

// Cierre limpio: mata TODOS los servidores tts-server hijos antes de salir (si
// no, quedarían huérfanos consumiendo GPU/RAM tras cerrar el daemon).
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("daemon", `Señal ${sig}: cerrando.`);
    killAllServers(`señal ${sig}`);
    try {
      server.close();
    } catch {
      /* */
    }
    process.exit(0);
  });
}
// Una excepción/rechazo suelto NO debe matar el daemon.
process.on("uncaughtException", (e) => log("daemon", `uncaughtException: ${e?.stack || e}`));
process.on("unhandledRejection", (e) => log("daemon", `unhandledRejection: ${e}`));
