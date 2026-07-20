#!/usr/bin/env node
// @ts-nocheck
/**
 * StarSeed OS — MOTOR DE VOZ ASTRAURA (paquete NATIVO) · daemon.mjs
 * ============================================================================
 * EL ASTRAURA DAEMON — un servidor HTTP puro (módulo `http` de Node, cero
 * dependencias) que escucha SÓLO en 127.0.0.1:4444 y ENVUELVE el binario CLI
 * `omnivoice-tts` de omnivoice.cpp (que NO trae servidor propio).
 *
 * Es el puente local del "Motor de Voz Híbrido": el frontend (StarSeed OS en el
 * navegador) le habla en http://127.0.0.1:4444; si el daemon no está listo, el
 * frontend usa la nube (HF Space k2-fsa/OmniVoice) — eso lo decide el frontend,
 * el daemon sólo hace la parte LOCAL (edge).
 *
 * Endpoints:
 *   GET  /status  → handshake JSON { ok, engine, ready, model, tier, backend,
 *                   version, warm, uptime, sampleRate, idleMs, busy, ... }
 *   POST /tts     → { text, lang?, ... } → cuerpo binario audio/wav (24 kHz)
 *   OPTIONS *     → preflight CORS
 *
 * SEGURIDAD: allowlist CORS ESTRICTA (lib.isAllowedOrigin). Un Origin presente y
 * NO permitido recibe 403 sin cuerpo. Sin Origin (curl, apps nativas) se sirve
 * normal (no hay nada que "cross-originar" en loopback).
 *
 * LAZY-LOAD / AUTO-SLEEP (honestidad radical, ver comentario en el temporizador):
 * el CLI es "one-shot" (carga el modelo, sintetiza y muere), así que NO existe un
 * proceso de modelo persistente que "precalentar". Aquí "caliente" = daemon listo
 * + modelos probablemente en la caché de página del SO (tras un uso reciente);
 * "dormido" = tras 10 min sin síntesis purgamos la caché en RAM y sugerimos al SO
 * liberar. El overhead del DAEMON es <500 ms; el coste real de cargar el modelo lo
 * pone el CLI en cada llamada (eso no lo podemos eliminar sin un servidor de modelo).
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
  sha256,
} from "./lib.mjs";

// ── Parámetros de operación ──────────────────────────────────────────────────

const SLEEP_MS = 10 * 60 * 1000; // 10 min sin síntesis → dormir (purgar RAM)
const SYNTH_TIMEOUT_MS = 180 * 1000; // presupuesto por síntesis del CLI
const MAX_BODY_BYTES = 512 * 1024; // límite del cuerpo POST
const MAX_TEXT_CHARS = 8000; // límite de texto por locución
const MAX_QUEUE = 8; // síntesis en cola antes de responder 503
const RAM_CACHE_MAX = 16; // WAV cacheados en RAM (se purgan al dormir)
const DISK_CACHE_MAX = 64; // WAV cacheados en disco (cache/)

// ── Estado en vivo ───────────────────────────────────────────────────────────

const startedAt = Date.now();
let lastReq = Date.now(); // última SÍNTESIS (no cuenta /status)
let warm = true;
let inFlight = 0; // síntesis del CLI ejecutándose ahora
let queueDepth = 0; // síntesis esperando su turno
const ramCache = new Map(); // hash → Buffer (LRU sencillo)

// ── Cola de síntesis (serializa el CLI: 1 carga de modelo a la vez) ──────────
// El CLI carga el modelo entero en CADA llamada; en máquinas modestas dos cargas
// simultáneas podrían agotar la RAM. Serializamos con una cadena de promesas.
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
  const speed = Number.isFinite(body.speed) ? body.speed : 1;

  // Clonación de voz: ref_wav_path (o voice_clone_prompt como ruta a WAV) + ref_text.
  let refWav =
    (typeof body.ref_wav_path === "string" && body.ref_wav_path) ||
    (typeof body.voice_clone_prompt === "string" && body.voice_clone_prompt.endsWith(".wav") && body.voice_clone_prompt) ||
    "";
  let refTextFile = refWav ? resolveRefTextFile(body.ref_text) : "";

  // IDENTIDAD POR PERSONALIDAD (Adenda 87): si el cuerpo trae `personality`
  // ("aurora" · "hermione" · id) y hay una referencia guardada en refs/<id>.wav
  // (subida una vez vía POST /identity), se CLONA automáticamente esa identidad
  // — voz FEMENINA consistente y continua en TODAS las síntesis locales.
  const personality = typeof body.personality === "string"
    ? body.personality.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40)
    : "";
  if (!refWav && personality) {
    const idWav = path.join(PATHS.refsDir, `${personality}.wav`);
    const idTxt = path.join(PATHS.refsDir, `${personality}.txt`);
    try {
      if (fs.existsSync(idWav)) {
        refWav = idWav;
        if (fs.existsSync(idTxt)) refTextFile = idTxt;
      }
    } catch { /* sin identidad guardada: sigue */ }
  }

  // ESTILO real (--instruct) + SEMILLA determinista (--seed) por personalidad:
  // mismo timbre SIEMPRE aunque no haya referencia (el seed fija el muestreo).
  let instruct = typeof body.instruct === "string" ? body.instruct : "";
  // Sin instruct explícito, las voces insignia hablan FEMENINO por defecto
  // (Adenda 87 — en inglés: es el idioma en que el modelo sigue mejor el estilo).
  if (!instruct) {
    if (personality === "hermione") {
      instruct = "young bright female voice, quick, precise and articulate, playful warmth, British accent";
    } else if (personality === "aurora" || !personality) {
      instruct = "young warm female voice, sincere and determined, soft but confident";
    }
  }
  let seed = Number.isFinite(body.seed) ? Number(body.seed) : NaN;
  const seedBasis = personality || "aurora"; // sin personalidad: identidad Aurora
  if (!Number.isFinite(seed) && seedBasis) {
    // Semilla estable derivada del id (determinista entre reinicios).
    let h = 0;
    for (const ch of seedBasis) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    seed = 700000 + (h % 90000);
  }

  // Campos aceptados por compatibilidad pero sin flag en el CLI.
  const ignored = [];
  for (const k of ["voice_design", "normalize", "allow_non_verbal"]) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== "") ignored.push(k);
  }

  // Marca actividad (mantiene "caliente") y clave de caché (incluye identidad).
  lastReq = Date.now();
  warm = true;
  const cfg = state.cfg || {};
  const variantTag = cfg?.variant?.quant || "";
  const key = sha256([text, langName, refWav, refTextFile, speed, variantTag, instruct, String(seed || "")].join("|"));

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

  // 3) Síntesis real (serializada por la cola).
  let result;
  try {
    result = await enqueue(() =>
      runTts({
        ttsBin: state.paths.tts,
        repoDir: state.paths.repoDir,
        modelFile: state.paths.modelFile,
        codecFile: state.paths.codecFile,
        langName,
        text,
        refWav,
        refTextFile,
      }),
    );
  } catch (e) {
    return sendJson(res, 503, cors, { ok: false, error: `daemon ocupado: ${e.message}` });
  }

  if (!result.ok) {
    log("daemon", `síntesis fallida: ${result.error}`);
    return sendJson(res, 500, cors, { ok: false, error: result.error });
  }

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

// ── /identity — guarda la IDENTIDAD de voz de una personalidad (Adenda 87) ──
//
// POST { personality: "aurora", wav_b64: "<base64 WAV ≤ 2 MB>", text: "transcripción" }
// La referencia queda en refs/<id>.wav (+ .txt) y TODAS las síntesis locales de
// esa personalidad la clonan automáticamente → voz femenina consistente y
// continua. Idempotente (sobrescribe). Mismo CORS estricto que /tts.
async function handleIdentity(req, res, cors) {
  const raw = await readBody(req);
  if (raw === null) return sendJson(res, 413, cors, { ok: false, error: "cuerpo demasiado grande" });
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return sendJson(res, 400, cors, { ok: false, error: "JSON inválido" });
  }
  const id = typeof body.personality === "string"
    ? body.personality.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40)
    : "";
  if (!id) return sendJson(res, 400, cors, { ok: false, error: "falta 'personality'" });
  const b64 = typeof body.wav_b64 === "string" ? body.wav_b64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!b64) return sendJson(res, 400, cors, { ok: false, error: "falta 'wav_b64'" });
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return sendJson(res, 400, cors, { ok: false, error: "base64 inválido" });
  }
  if (buf.length < 1000 || buf.length > 2 * 1024 * 1024) {
    return sendJson(res, 400, cors, { ok: false, error: "WAV fuera de rango (1 KB – 2 MB)" });
  }
  if (!isWav(buf)) return sendJson(res, 400, cors, { ok: false, error: "no es un WAV" });
  try {
    fs.mkdirSync(PATHS.refsDir, { recursive: true });
    fs.writeFileSync(path.join(PATHS.refsDir, `${id}.wav`), buf);
    if (typeof body.text === "string" && body.text.trim()) {
      fs.writeFileSync(path.join(PATHS.refsDir, `${id}.txt`), body.text.trim().slice(0, 500));
    }
    log("daemon", `identidad de voz guardada: ${id} (${buf.length} B)`);
    return sendJson(res, 200, cors, { ok: true, personality: id, bytes: buf.length });
  } catch (e) {
    return sendJson(res, 500, cors, { ok: false, error: `no pude guardar: ${e.message}` });
  }
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
    warm,
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
    if (req.method === "POST" && url === "/tts") {
      return await handleTts(req, res, cors);
    }

    return sendJson(res, 404, cors, { ok: false, error: "ruta no encontrada", routes: ["GET /status", "POST /tts", "POST /identity"] });
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
// HONESTIDAD (repetida a propósito): no hay proceso de modelo que dormir. Al
// pasar 10 min sin síntesis: marcamos warm=false, PURGAMOS la caché de WAV en RAM
// (libera memoria) y sugerimos al SO recolectar. La siguiente síntesis vuelve a
// poner warm=true. El coste de cargar el modelo lo sigue pagando el CLI por llamada.
setInterval(() => {
  if (warm && Date.now() - lastReq > SLEEP_MS) {
    warm = false;
    ramCache.clear();
    try {
      if (global.gc) global.gc(); // sólo si se arrancó con --expose-gc
    } catch {
      /* */
    }
    log("daemon", "Durmiendo: 10 min sin síntesis · caché en RAM purgada.");
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

// Cierre limpio.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("daemon", `Señal ${sig}: cerrando.`);
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
