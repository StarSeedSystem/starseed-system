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
import { spawn, spawnSync } from "node:child_process";
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

// ── Parámetros del OÍDO LOCAL (ASR ternario VibeASR.cpp, Adenda 249) ─────────
// Reconstrucción del motor de voces v2: VibeVoice-ASR-BitNet (ternario 1.58-bit)
// reconoce voz en CPU en tiempo real a través del runtime C++/GGML `asr_infer`.
// Aquí se define dónde vive (VIBEASR_DIR, reutilizando la misma carpeta BASE que
// omnivoice.cpp), cuántos hilos usa y el cupo de la cola FIFO de un solo proceso.
const VIBEASR_DIR = process.env.STARSEED_VIBEASR_DIR || path.join(PATHS.root, "vibeasr.cpp");
const VIBEASR_HILOS = process.env.STARSEED_VIBEASR_HILOS || "3";
const VIBEASR_BIN = "asr_infer";
const VIBEASR_MODEL_VAE = "vibeasr-vae-encoder-i8_s.gguf";
const VIBEASR_MODEL_LM = "vibeasr-lm-i2_s-embed-q6_k.gguf";
const ASR_MAX_BODY_BYTES = 25 * 1024 * 1024; // audio ≤ 25 MB
// 2026-09-06 (Ola 255, oído residente): el presupuesto por reconocimiento ya no
// es un fijo de 120 s: la carga de los modelos (1,7 GB) la paga UNA vez el
// servidor residente, y cada reconocimiento recibe un presupuesto PROPORCIONAL
// a la duración del audio (ver asrTimeoutMs). Se conserva el nombre heredado
// como suelo mínimo para no romper referencias externas.
const ASR_TIMEOUT_MS = 120 * 1000; // suelo mínimo del presupuesto por reconocimiento
const ASR_MAX_QUEUE = 4; // reconocimientos esperando antes de responder 503

// ── Oído RESIDENTE (asr_stream_server, Ola 255) ─────────────────────────────
// En la Mac de 8 GB de Alex (2026-09-06) el binario one-shot `asr_infer`
// tardaba >120 s SOLO en cargar los modelos en cada petición (1,7 GB con la
// RAM al límite) y todo reconocimiento moría por timeout. El hermano
// `asr_stream_server` (mismo build de VibeASR.cpp) carga los modelos UNA vez y
// atiende por stdin/stdout: una ruta de WAV por línea → texto + `---END---`.
// Si ese binario NO existe (instalación vieja), se sigue usando `asr_infer`.
const ASR_STREAM_BIN = "asr_stream_server";
// Plazo para que el residente escriba `---READY---` (bajo presión de memoria
// la carga de 1,7 GB puede tardar minutos): STARSEED_ASR_CARGA_MS, 240 s.
const ASR_CARGA_MS = (() => {
  const bruto = Number.parseInt(process.env.STARSEED_ASR_CARGA_MS, 10);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 240_000;
})();
// Sueño por inactividad: pasados STARSEED_ASR_SUEÑO_MS (5 min) sin peticiones
// se manda EXIT al residente para devolver los 1,7 GB; se relanza en la
// siguiente petición (arranque perezoso).
const ASR_SUENO_MS = (() => {
  const bruto = Number.parseInt(process.env.STARSEED_ASR_SUEÑO_MS || process.env.STARSEED_ASR_SUENO_MS, 10);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 5 * 60_000;
})();
// Umbral de memoria: antes de un reconocimiento (o de cargar el residente), si
// quedan menos de STARSEED_ASR_MEM_MIN_MB disponibles y el pool TTS lleva ≥
// ASR_TTS_INACTIVO_MS sin sintetizar de verdad, se cede su memoria al oído (el
// TTS se relanza solo después).
//
// 2026-09-06 (Ola 255, oído residente): dos cambios de umbral.
//   (a) ASR_MEM_MIN_MB sube de 600 a 1200: `os.freemem()` en macOS cuenta SOLO
//       las páginas libres y en la Mac de 8 GB de Alex raras veces pasa de
//       100 MB, así que con 600 el umbral nunca se alcanzaba. `memDisponible()`
//       suma a freemem una estimación conservadora de las páginas inactivas
//       (recuperables al instante), y 1200 MB es un margen prudente para que el
//       residente (1,7 GB) cargue sin pelear con el pool (~900 MB).
//   (b) ASR_TTS_INACTIVO_MS baja de 60 a 10 s: el oído es una acción EXPLÍCITA
//       del usuario — relanzar el tts-server cuesta 30-40 s en la siguiente
//       locución, pero un reconocimiento que compite por memoria con el pool no
//       termina nunca. Con 10 s, en cuanto no haya síntesis en vuelo se cede.
const ASR_MEM_MIN_MB = (() => {
  const bruto = Number.parseInt(process.env.STARSEED_ASR_MEM_MIN_MB, 10);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 1200;
})();
// Cuánto debe llevar el pool SIN SÍNTESIS REAL para ceder su memoria (ver (b)
// arriba). Configurable con STARSEED_ASR_TTS_INACTIVO_MS.
const ASR_TTS_INACTIVO_MS = (() => {
  const bruto = Number.parseInt(process.env.STARSEED_ASR_TTS_INACTIVO_MS, 10);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 10_000;
})();
const RAM_CACHE_MAX = 16; // WAV cacheados en RAM (se purgan al dormir)
const DISK_CACHE_MAX = 64; // WAV cacheados en disco (cache/)

// ── Parámetros del POOL de servidores tts-server (uno residente por idioma) ──
const SERVER_BASE_PORT = 4500; // base de puertos del pool (el daemon usa 4444)
const SERVER_PORT_RANGE = 1000; // puertos [4500, 5499): de sobra para un pool de 3
const SERVER_POOL_MAX = 3; // nº máx. de servidores tts-server vivos a la vez (LRU)
// (2026-09-06) El plazo para que /health diga "ok" se lee de STARSEED_VOZ_HEALTH_MS:
// en una Mac de 8 GB al límite de memoria (servidor de desarrollo + backend 1.58 +
// Ollama), el modelo de ~900 MB tarda más de 30 s en cargar, y 30 s lo mataba antes
// de que arrancara. Por eso el valor por defecto sube a 90 s (mínimo 15 s). Es solo
// la PRIMERA vuelta de espera: si el proceso sigue vivo, se prolonga en tramos de
// SERVER_HEALTH_EXTEND_MS hasta SERVER_HEALTH_MAX_MS (ver launchServer).
function leerHealthMs() {
  const bruto = Number.parseInt(process.env.STARSEED_VOZ_HEALTH_MS, 10);
  const ms = Number.isFinite(bruto) && bruto > 0 ? bruto : 90_000;
  return Math.max(ms, 15_000); // mínimo 15 s: no permitir límites absurdamente cortos
}
const SERVER_HEALTH_TIMEOUT_MS = leerHealthMs(); // plazo inicial de espera de /health
const SERVER_HEALTH_MAX_MS = (() => {
  const bruto = Number.parseInt(process.env.STARSEED_VOZ_HEALTH_MAX_MS, 10);
  // Máximo total de espera si el proceso sigue vivo, por defecto 4 min.
  return Number.isFinite(bruto) && bruto > 0 ? Math.max(bruto, SERVER_HEALTH_TIMEOUT_MS) : 240_000;
})();
const SERVER_HEALTH_EXTEND_MS = 15 * 1000; // tramo extra de espera si el proceso sigue cargando
const SERVER_HEALTH_POLL_MS = 300; // intervalo de sondeo de /health mientras carga
const PRIMARY_LANG = "Spanish"; // idioma que se precalienta EAGER al arrancar el daemon

// ── Estado en vivo ───────────────────────────────────────────────────────────

const startedAt = Date.now();
let lastReq = Date.now(); // última SÍNTESIS (no cuenta /status)
// 2026-09-06 (Ola 255, oído residente): última SÍNTESIS REAL pedida por un
// CLIENTE (un /tts real), a diferencia de `lastReq` que también lo actualiza
// el precalentado (`/warm` y el arranque EAGER). `cederMemoriaSiHaceFalta`
// mira ESTA variable: el calentamiento inicial del pool NO debe contar como
// uso reciente para decidir si se cede memoria al oído. `lastReq` sigue igual
// para el auto-sleep y `/status.idleMs`.
let ultimaSintesisReal = null;
// "Caliente" YA NO es una bandera manual (Adenda 88) sino un HECHO observable:
// hay al menos un servidor tts-server RESIDENTE con el modelo cargado en GPU
// (ver isWarm() más abajo, derivada de `serverPool`). Arranca FRÍO igual que
// antes (el pool empieza vacío); el arranque EAGER del idioma primario (ver
// "Arranque" al final del fichero) lo pone caliente en cuanto puede.
let inFlight = 0; // síntesis (servidor o CLI) ejecutándose ahora
let queueDepth = 0; // síntesis esperando su turno
const ramCache = new Map(); // hash → Buffer (LRU sencillo)

// ── Estado del OÍDO (ASR VibeASR.cpp, Adenda 249) ─────────────────────────────
// Un ÚNICO proceso `asr_infer` a la vez (un solo uso de CPU/8 GB: el modelo
// ternario ocupa 1,58 GB y no debe convivir con el tts-server ni con otro ASR).
// `asrBusy` marca si el proceso corre AHORA; `asrQueueDepth` cuenta los
// reconocimientos esperando su turno en la cola FIFO. Sin cerrojo separado: la
// cola serializa los trabajos igual que `enqueue` (ver función enqueueAsr).
let asrBusy = false;
let asrQueueDepth = 0;
let asrChain = Promise.resolve();
function enqueueAsr(job) {
  if (asrQueueDepth >= ASR_MAX_QUEUE) return Promise.reject(new Error("cola llena"));
  asrQueueDepth++;
  const run = asrChain.then(async () => {
    asrQueueDepth--;
    asrBusy = true;
    try {
      return await job();
    } finally {
      asrBusy = false;
    }
  });
  // La cadena sigue aunque un trabajo falle (no rompe la cola).
  asrChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── Oído RESIDENTE (asr_stream_server, Ola 255, 2026-09-06) ─────────────────
// Un ÚNICO proceso `asr_stream_server` con los modelos (1,7 GB) cargados UNA
// vez. Protocolo (fuente src/asr_server.cpp de VibeASR.cpp): se lanza con
// `--vae-model <ruta> --lm-model <ruta> -t <hilos> --no-token-stream`; al
// terminar de cargar escribe `---READY---` en stdout; luego acepta por stdin
// UNA RUTA DE WAV POR LÍNEA y responde por stdout con el texto completo
// terminado en la línea `---END---` (los errores llegan como una línea
// `[ERROR]…` seguida de `---END---`; `EXIT` cierra el proceso; los logs del
// servidor van por stderr). Arranque perezoso (primera petición), cola FIFO
// compartida con el camino one-shot (enqueueAsr), y sueño por inactividad
// (ASR_SUENO_MS) para devolver los 1,7 GB: se relanza en la siguiente
// petición. Si el binario no existe (instalación vieja) NO se toca nada de
// esto y se sigue usando `asr_infer` como hasta ahora.
let oidoProc = null; // ChildProcess del residente, o null
let oidoListo = false; // ya escribió ---READY--- y acepta rutas
let oidoCargandoDesde = 0; // Date.now() del inicio de carga (0 = no está cargando)
let oidoCargaPromesa = null; // Promise<boolean> de la carga en curso
let oidoLineaParcial = ""; // resto sin \n del stdout, para el troceado por líneas
let oidoPendiente = null; // { salida, error, timer, resolve, t0 } de la petición en curso
let oidoUltimoUso = 0; // última petición atendida (para el sueño por inactividad)
let oidoPresupuestoMs = 0; // presupuesto del último reconocimiento (para /status)
let oidoSuenoTimer = null; // temporizador del sueño por inactividad
// 2026-09-06 (Ola 255, oído residente): contabilidad de las CESIONES del pool
// TTS al oído. `ultimaCesionEn` es el Date.now() de la última vez que se
// cedió (null si aún no se ha cedido ninguna); `cesiones` cuenta cuántas
// veces se ha cedido el pool desde el arranque. Se exponen en /status.asr.
let ultimaCesionEn = null;
let cesiones = 0;

/**
 * Mata el proceso residente (SIGTERM y, si no muere en 5 s, SIGKILL) y limpia
 * el estado. Si había una petición en curso la resuelve con error para que la
 * cola no se quede colgada. Nunca lanza.
 *
 * 2026-09-06 (Ola 255, riesgos de la revisión de V8):
 *   - `oidoProc = null` se pone SOLO en el manejador `exit`/`close` del proceso
 *     (no aquí arriba): así, si el SIGTERM/EXIT no se materializa aún, la
 *     variable sigue señalando al proceso vivo y una segunda petición no lanza
 *     un `asr_stream_server` duplicado mientras el anterior aún ocupa 1,7 GB.
 *   - En vez de SIGKILL directo (suave=false) o EXIT, se intenta primero
 *     SIGTERM y, a los 5 s, SIGKILL como respaldo — evita dejar procesos
 *     huérfanos sin recurrir solo a la fuerza bruta.
 */
function matarOidoResidente(motivo, suave) {
  const proc = oidoProc;
  if (!proc) return;
  oidoListo = false;
  oidoCargandoDesde = 0;
  oidoCargaPromesa = null;
  oidoLineaParcial = "";
  if (oidoSuenoTimer) {
    clearTimeout(oidoSuenoTimer);
    oidoSuenoTimer = null;
  }
  if (oidoPendiente) {
    const p = oidoPendiente;
    oidoPendiente = null;
    clearTimeout(p.timer);
    p.resolve({ ok: false, error: `el oído residente se detuvo: ${motivo}` });
  }
  log("daemon", `oído residente detenido: ${motivo}`);
  // Limpia `oidoProc` SOLO cuando el proceso de hecho muere (exit/close), no
  // aquí: mantener la referencia durante el apagado evita relanzar a ciegas.
  const liberar = () => {
    if (oidoProc === proc) oidoProc = null;
  };
  try {
    if (suave) {
      // EXIT ordenado; si no muere en 5 s, SIGKILL (no puede quedar un proceso
      // de 1,7 GB zombie por un EXIT ignorado).
      try {
        proc.stdin.write("EXIT\n");
      } catch {
        /* */
      }
      const p2 = proc;
      const t = setTimeout(() => {
        try {
          if (p2.exitCode === null) p2.kill("SIGKILL");
        } catch {
          /* */
        }
      }, 5000);
      if (t.unref) t.unref();
    } else if (!proc.killed && proc.exitCode === null) {
      proc.kill("SIGTERM");
      const p2 = proc;
      const t = setTimeout(() => {
        try {
          if (p2.exitCode === null) p2.kill("SIGKILL");
        } catch {
          /* */
        }
      }, 5000);
      if (t.unref) t.unref();
    }
  } catch {
    /* */
  }
  proc.once("exit", liberar);
  proc.once("close", liberar);
  // Si ya había muerto antes de esta llamada, liberamos ya la referencia.
  if (proc.exitCode !== null || proc.killed) liberar();
}

/** Programa el sueño por inactividad: ASR_SUENO_MS sin peticiones → EXIT. */
function programarSuenoOido() {
  if (oidoSuenoTimer) clearTimeout(oidoSuenoTimer);
  oidoSuenoTimer = setTimeout(() => {
    oidoSuenoTimer = null;
    if (!oidoProc) return;
    if (oidoPendiente || Date.now() - oidoUltimoUso < ASR_SUENO_MS) return; // hubo actividad
    matarOidoResidente(`sueño por inactividad (${Math.round(ASR_SUENO_MS / 60000)} min sin reconocimientos)`, true);
  }, ASR_SUENO_MS);
  if (oidoSuenoTimer.unref) oidoSuenoTimer.unref(); // el timer no debe mantener vivo el daemon
}

/**
 * Troceado por líneas del stdout del residente: alimenta la carga inicial
 * (espera de `---READY---`) y, una vez listo, acumula la respuesta de la
 * petición en curso hasta `---END---`.
 */
function alimentarLineasOido(trozo) {
  oidoLineaParcial += String(trozo);
  let idx;
  while ((idx = oidoLineaParcial.indexOf("\n")) >= 0) {
    const linea = oidoLineaParcial.slice(0, idx).replace(/\r$/, "");
    oidoLineaParcial = oidoLineaParcial.slice(idx + 1);
    if (!oidoListo) continue; // durante la carga sólo importa ---READY--- (se detecta por includes)
    if (!oidoPendiente) continue; // línea suelta sin petición: se ignora
    if (linea.trim() === "---END---") {
      const p = oidoPendiente;
      oidoPendiente = null;
      clearTimeout(p.timer);
      oidoUltimoUso = Date.now();
      if (p.error) {
        p.resolve({ ok: false, error: p.error });
      } else {
        // parsearTranscripcion quita las líneas de protocolo (---ACK--- …) y
        // se queda con el texto (con --no-token-stream llega entero).
        const texto = parsearTranscripcion(p.salida);
        p.resolve({ ok: true, texto, segundos: Math.round((Date.now() - p.t0) / 10) / 100 });
      }
      programarSuenoOido();
    } else if (linea.startsWith("[ERROR]")) {
      oidoPendiente.error = linea.trim();
    } else {
      oidoPendiente.salida += (oidoPendiente.salida ? "\n" : "") + linea;
    }
  }
}

/**
 * Asegura el residente lanzado y listo (arranque perezoso). Devuelve una
 * promesa de boolean (true = listo) que NUNCA rechaza. Espera `---READY---`
 * hasta ASR_CARGA_MS (la carga de 1,7 GB puede tardar minutos con la RAM al
 * límite). Si el binario no existe, devuelve false SIN lanzar nada.
 */
function asegurarOidoResidente() {
  if (oidoProc && oidoListo) return Promise.resolve(true);
  if (oidoCargaPromesa) return oidoCargaPromesa; // una carga en curso, compartida
  const bin = rutaOidoResidente();
  if (!fileOk(bin)) return Promise.resolve(false);
  const p = vibeasrPaths();
  // 2026-09-06 (Ola 255, riesgo de la revisión de V8): guardamos la promesa
  // de carga ANTES de la primera declaración asíncrona del ejecutor. Como
  // `new Promise(resolve => {...})` crea y devuelve la promesa de forma SÍNCRONA
  // y no hay `await` entre la asignación y el registro de `oidoCargaPromesa`,
  // dos peticiones simultáneas leen la MISMA carga en curso (la del primer
  // llamador) en vez de lanzar dos `asr_stream_server` de 1,7 GB.
  oidoCargandoDesde = Date.now();
  const t0 = oidoCargandoDesde;
  // 2026-09-06 (Ola 255, oído residente): la carga de los 1,7 GB es el momento
  // MÁS crítico para la RAM — ceder aquí la memoria del pool TTS (si escasea y
  // no hay síntesis en vuelo) evita que el residente muera por timeout mientras
  // carga. `cederMemoriaSiHaceFalta` es síncrona en efecto (no tiene awaits),
  // así que llamarla sin await se ejecuta ANTES del spawn y no rompe la
  // exclusión de doble carga (ver comentario de oidoCargaPromesa más abajo).
  cederMemoriaSiHaceFalta();
  const promesa = new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, ["--vae-model", p.vae, "--lm-model", p.lm, "-t", VIBEASR_HILOS, "--no-token-stream"], {
        cwd: VIBEASR_DIR,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      log("daemon", `oído residente: no se pudo lanzar: ${e.message}`);
      oidoCargandoDesde = 0;
      oidoCargaPromesa = null;
      return resolve(false);
    }
    oidoProc = proc;
    let resuelto = false;
    const bruto = { buf: "" };
    const cerrarCarga = (ok, motivo) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timer);
      oidoCargandoDesde = 0;
      oidoCargaPromesa = null;
      if (!ok) {
        resolve(false);
        matarOidoResidente(motivo, false);
        return;
      }
      oidoListo = true;
      oidoUltimoUso = Date.now();
      log("daemon", `oído residente listo en ${Date.now() - t0} ms (modelos cargados una vez)`);
      programarSuenoOido();
      resolve(true);
    };
    const timer = setTimeout(() => {
      cerrarCarga(false, `carga más lenta que ${ASR_CARGA_MS} ms (STARSEED_ASR_CARGA_MS)`);
    }, ASR_CARGA_MS);
    proc.stdout?.on("data", (d) => {
      if (!resuelto) {
        // Durante la carga sólo buscamos ---READY--- en el acumulado bruto
        // (puede llegar partido entre trozos); las líneas no se trocean aún.
        bruto.buf += String(d);
        if (bruto.buf.includes("---READY---")) {
          // Lo que venga tras ---READY--- ya es protocolo normal de peticiones.
          oidoLineaParcial = bruto.buf.slice(bruto.buf.indexOf("---READY---") + "---READY---".length);
          cerrarCarga(true);
        }
        return;
      }
      alimentarLineasOido(d);
    });
    // Los logs del servidor van por stderr: sólo se captura una cola corta.
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });
    proc.on("error", (e) => {
      log("daemon", `oído residente: error de proceso: ${e.message}`);
      if (!resuelto) return cerrarCarga(false, `error de proceso: ${e.message}`);
      // Ya estaba listo: lo damos por muerto; la siguiente petición lo relanza.
      matarOidoResidente(`error de proceso: ${e.message}`, true);
    });
    proc.on("exit", (code, signal) => {
      if (!resuelto) {
        return cerrarCarga(false, `el proceso salió durante la carga (code=${code} signal=${signal}): ${stderr.trim().slice(-300)}`);
      }
      if (oidoProc === proc) {
        // Muerte NO pedida (crash) o consecuencia del EXIT de sueño: el estado
        // ya lo limpia matarOidoResidente cuando la orden salió de aquí; esto
        // cubre las muertes espontáneas. Se relanzará en la próxima petición.
        matarOidoResidente(`salida inesperada (code=${code} signal=${signal}): ${stderr.trim().slice(-300)}`, false);
      }
    });
  });
  oidoCargaPromesa = promesa;
  return promesa;
}

/**
 * Memoria disponible de forma CONSERVADORA (2026-09-06, Ola 255).
 * `os.freemem()` en macOS cuenta SÓLO las páginas libres; en la Mac de 8 GB de
 * Alex raras veces pasa de 100 MB, así que un umbral basado en freemem a secas
 * hacía que `cederMemoriaSiHaceFalta` nunca actuara. A freemem le sumamos una
 * estimación conservadora de las páginas INACTIVAS (recuperables al instante
 * sin tocar disco): se leen con `vm_stat` (comando estándar de macOS, sin
 * dependencias y barato de invocar). En otros SO sin esa fuente barata
 * devolvemos sólo `os.freemem()` — explicado aquí para quien lo lea. Devuelve
 * bytes de memoria disponible estimada.
 */
function memDisponible() {
  const libre = os.freemem();
  if (process.platform !== "darwin") return libre; // fuera de macOS no hay vm_stat: solo freemem
  try {
    const r = spawnSync("vm_stat", { encoding: "utf8" });
    if (r.error || r.status !== 0 || !r.stdout) return libre;
    const out = r.stdout;
    const pageMatch = /page size of (\d+)/.exec(out);
    const pageSize = pageMatch ? Number(pageMatch[1]) : 4096;
    const m = /^Pages inactive:\s+(\d+)/m.exec(out);
    if (!m) return libre;
    const inactivas = Number(m[1]);
    if (!Number.isFinite(inactivas) || inactivas < 0) return libre;
    return libre + inactivas * pageSize;
  } catch {
    return libre;
  }
}

/**
 * Cede la memoria del pool TTS al oído si escasea (2026-09-06, Ola 255).
 * El oído residente carga 1,7 GB y en una Mac de 8 GB al límite cada
 * reconocimiento moría por timeout por falta de RAM. Si quedan menos de
 * ASR_MEM_MIN_MB disponibles (memDisponible()), la última SÍNTESIS REAL fue
 * hace ASR_TTS_INACTIVO_MS o más y no hay ninguna síntesis en curso ahora
 * (inFlight === 0), mata todos los servidores tts-server — el TTS se relanza
 * solo en la siguiente locución. NUNCA mata el pool si hay una síntesis en
 * vuelo. El calentamiento inicial NO cuenta como uso reciente (mira
 * `ultimaSintesisReal`, no `lastReq`). Devuelve true si cedió. Síncrona en
 * efecto (no tiene awaits): llamarla sin `await` garantiza que la cesión se
 * complete antes de seguir, p. ej. antes de cargar el residente.
 */
function cederMemoriaSiHaceFalta() {
  const disponibles = memDisponible();
  if (disponibles >= ASR_MEM_MIN_MB * 1024 * 1024) return false;
  if (Date.now() - ultimaSintesisReal < ASR_TTS_INACTIVO_MS) return false;
  if (inFlight > 0) return false; // hay síntesis en curso: no interrumpirla
  if (serverPool.size === 0) return false; // nada que ceder
  const mb = Math.trunc(disponibles / (1024 * 1024));
  killAllServers(`oído: cediendo memoria del pool TTS (${mb} MB disponibles)`);
  cesiones++;
  ultimaCesionEn = Date.now();
  return true;
}

/**
 * Reconoce un WAV con el residente. Devuelve { ok, texto|error, segundos }.
 * El presupuesto es proporcional a la duración del audio (asrTimeoutMs). Si el
 * residente se cuelga, se mata (la siguiente petición lo relanza limpio).
 */
async function reconocerResidente(wavPath, segundosAudio) {
  const okCarga = await asegurarOidoResidente();
  if (!okCarga) return { ok: false, error: "no se pudo dejar listo el oído residente" };
  const presupuesto = asrTimeoutMs(segundosAudio);
  oidoPresupuestoMs = presupuesto;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      oidoPendiente = null;
      matarOidoResidente(`timeout de reconocimiento residente (${presupuesto} ms)`, false);
      resolve({ ok: false, error: `timeout de reconocimiento (${presupuesto} ms)` });
    }, presupuesto);
    oidoPendiente = { salida: "", error: "", timer, resolve, t0: Date.now() };
    try {
      oidoProc.stdin.write(`${wavPath}\n`);
    } catch (e) {
      oidoPendiente = null;
      clearTimeout(timer);
      resolve({ ok: false, error: `no se pudo escribir la ruta al oído residente: ${e.message}` });
    }
  });
}

/** Rutas de los binarios/modelos de VibeASR.cpp (derivadas de VIBEASR_DIR). */
function vibeasrPaths() {
  const buildDir = path.join(VIBEASR_DIR, "build");
  const binName = process.platform === "win32" ? `${VIBEASR_BIN}.exe` : VIBEASR_BIN;
  return {
    bin: path.join(buildDir, "bin", binName),
    vae: path.join(VIBEASR_DIR, "models", VIBEASR_MODEL_VAE),
    lm: path.join(VIBEASR_DIR, "models", VIBEASR_MODEL_LM),
  };
}

/** Ruta del servidor residente `asr_stream_server` (hermano de `asr_infer`). */
function rutaOidoResidente() {
  const p = vibeasrPaths();
  const nombre = process.platform === "win32" ? `${ASR_STREAM_BIN}.exe` : ASR_STREAM_BIN;
  return path.join(path.dirname(p.bin), nombre);
}

/**
 * Presupuesto de reconocimiento proporcional a la duración del audio
 * (2026-09-06, Ola 255): 60 s de base + 20 s por segundo de audio, acotado a
 * [120 s, 360 s]. Si la duración no se pudo leer (NaN), 180 s. Un WAV de 6,3 s
 * obtiene 186 s — de sobra en el residente (modelos ya cargados) y un tope
 * razonable para el one-shot cuando la RAM está al límite.
 */
function asrTimeoutMs(segundosAudio) {
  if (!Number.isFinite(segundosAudio) || segundosAudio < 0) return 180_000;
  const ms = 60_000 + 20_000 * segundosAudio;
  return Math.min(360_000, Math.max(120_000, ms));
}

/**
 * Lee la duración en segundos de un WAV PCM (cabecera RIFF): recorre los
 * chunks hasta `data` y divide sus bytes entre
 * (sampleRate × canales × bitsPorMuestra/8). Devuelve NaN si no se puede leer
 * (el llamador usa entonces 180 s).
 */
function segundosDeWav(ruta) {
  let fd = null;
  try {
    const st = fs.statSync(ruta);
    fd = fs.openSync(ruta, "r");
    const cab = Buffer.alloc(12);
    if (fs.readSync(fd, cab, 0, 12, 0) < 12) return NaN;
    if (cab.toString("ascii", 0, 4) !== "RIFF" || cab.toString("ascii", 8, 12) !== "WAVE") return NaN;
    const cabFmt = Buffer.alloc(24);
    if (fs.readSync(fd, cabFmt, 0, 24, 12) < 24 || cabFmt.toString("ascii", 0, 4) !== "fmt ") return NaN;
    const canales = cabFmt.readUInt16LE(10);
    const sampleRate = cabFmt.readUInt32LE(12);
    const bitsPorMuestra = cabFmt.readUInt16LE(22);
    if (!canales || !sampleRate || !bitsPorMuestra) return NaN;
    const bytesPorMuestra = bitsPorMuestra / 8;
    // Recorre los chunks tras `fmt ` hasta encontrar `data`. No se asume que
    // `data` empiece en el byte 44: ffmpeg puede escribir un chunk LIST antes.
    let pos = 36;
    const cabChunk = Buffer.alloc(8);
    while (pos + 8 <= st.size) {
      if (fs.readSync(fd, cabChunk, 0, 8, pos) < 8) return NaN;
      const nombre = cabChunk.toString("ascii", 0, 4);
      const bytes = cabChunk.readUInt32LE(4);
      if (nombre === "data") return bytes / (sampleRate * canales * bytesPorMuestra);
      pos += 8 + bytes + (bytes % 2); // los chunks se aliñean a 2 bytes
    }
    return NaN;
  } catch {
    return NaN;
  } finally {
    try {
      if (fd !== null) fs.closeSync(fd);
    } catch {
      /* */
    }
  }
}

/** ¿Está instalado VibeASR.cpp (binario + los dos modelos GGUF)? */
function vibeasrStatus() {
  const p = vibeasrPaths();
  return {
    instalado: fileOk(p.bin),
    modelos: fileOk(p.vae) && fileOk(p.lm),
  };
}

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

/**
 * Estado de "despertando" (2026-09-06): true cuando hay servidores en arranque
 * (launching) y NINGUNO listo (active). Sirve al panel Motor del OS para
 * distinguir «apagado» de «despertando»: el demonio está vivo pero el modelo
 * aún no ha terminado de cargar. `despertandoDesdeMs` es el tiempo transcurrido
 * desde el arranque MÁS ANTIGUO (mínimo `startedAt` de las entradas en vuelo),
 * o null si no hay ningún arranque en curso.
 */
function estadoDespertando() {
  let activos = 0;
  let masAntiguo = null;
  for (const [, e] of serverPool) {
    if (e.dead) continue;
    if (e.ready) activos++;
    else if (e.startedAt > 0) masAntiguo = masAntiguo === null ? e.startedAt : Math.min(masAntiguo, e.startedAt);
  }
  const despertando = activos === 0 && masAntiguo !== null;
  return {
    despertando,
    despertandoDesdeMs: despertando && masAntiguo !== null ? Date.now() - masAntiguo : null,
  };
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

    // Sondeo de /health. El socket puede tardar unos segundos en escuchar
    // mientras el modelo se carga en GPU. Plazo inicial = SERVER_HEALTH_TIMEOUT_MS.
    const startedDeadline = Date.now() + SERVER_HEALTH_TIMEOUT_MS;
    const maxDeadline = Date.now() + SERVER_HEALTH_MAX_MS;
    let extended = false; // ya pasamos a la fase de espera prolongada
    const procVivo = () => entry.proc && entry.proc.exitCode === null && !entry.dead;
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
      const now = Date.now();
      // (2026-09-06) Vencido el plazo inicial, NO damos por muerto el servidor si
      // su proceso sigue vivo: en una Mac de 8 GB al límite de RAM el modelo de
      // ~900 MB tarda más de 30 s en cargar, y matarlo aquí era un desperdicio
      // (el CLI tendría que recargarlo entero, aún más caro). Prolongamos la
      // espera en tramos de SERVER_HEALTH_EXTEND_MS hasta SERVER_HEALTH_MAX_MS.
      if (now < maxDeadline && (now < startedDeadline || procVivo())) {
        if (now >= startedDeadline && now - entry.startedAt >= SERVER_HEALTH_TIMEOUT_MS) {
          // Registramos el aviso una vez por cada tramo extra de espera.
          if (!extended) {
            extended = true;
            log("daemon", `tts-server[${entry.lang}] sigue cargando (${now - entry.startedAt} ms) — prolongo la espera hasta ${SERVER_HEALTH_MAX_MS} ms`);
          } else if ((now - startedDeadline) % SERVER_HEALTH_EXTEND_MS < SERVER_HEALTH_POLL_MS) {
            log("daemon", `tts-server[${entry.lang}] sigue cargando (${now - entry.startedAt} ms)`);
          }
        }
        setTimeout(poll, SERVER_HEALTH_POLL_MS);
        return;
      }
      // Se agotó el máximo total, o el proceso murió antes del plazo: lo damos por fallido.
      const motivo = procVivo()
        ? `se agotó el máximo de ${SERVER_HEALTH_MAX_MS} ms`
        : `el proceso terminó antes de estar listo`;
      log("daemon", `tts-server[${entry.lang}]: /health no respondió a tiempo (${motivo})`);
      return resolve(false);
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
  // TONO (Ola 263): post-proceso local con ffmpeg (asetrate+aresample+atempo).
  // Acotado a [0.7, 1.4] para que el factor `atempo=1/pitch` quede dentro de
  // [0.5, 2], el rango que ffmpeg admite. `1` (o un valor fuera de rango que
  // acabe en 1, o no numérico) = tono natural, sin post-proceso.
  const pitch = pitchEfectivo(body.pitch);

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
  // caché (incluye idioma + identidad + instruct + seed). Una petición /tts de
  // un CLIENTE cuenta como síntesis REAL para la cesión de memoria al oído
  // (ver ultimaSintesisReal): a diferencia del /warm, esto SÍ es voz pedida.
  lastReq = Date.now();
  ultimaSintesisReal = Date.now();
  const cfg = state.cfg || {};
  const variantTag = cfg?.variant?.quant || "";
  const key = sha256([text, langName, langBase, refWav, refTextFile, speed, variantTag, instruct, String(seed), String(pitch)].join("|"));

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
    return responderWav(res, cors, ramHit, speed, pitch, extraHeaders, { ...extraHeaders, "X-Astraura-Cache": "ram" });
  }
  // 2) Caché en disco.
  try {
    const dp = diskCachePath(key);
    if (fileOk(dp)) {
      const buf = fs.readFileSync(dp);
      if (isWav(buf)) {
        ramCachePut(key, buf);
        return responderWav(res, cors, buf, speed, pitch, extraHeaders, { ...extraHeaders, "X-Astraura-Cache": "disk" });
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

  // Guarda en cachés (el WAV base, SIN el retimeo de velocidad ni el tono).
  ramCachePut(key, result.buffer);
  try {
    fs.writeFileSync(diskCachePath(key), result.buffer);
    pruneDiskCache();
  } catch {
    /* */
  }
  lastReq = Date.now();
  ultimaSintesisReal = Date.now();
  // (Ola 263) Log con la semilla y el tono EFECTIVOS de cada locución: es lo
  // que hace reproducible «este timbre suena así» en cualquier equipo.
  log("daemon", `síntesis ok (${result.engine}) seed=${seed} pitch=${pitch} speed=${speed} instruct=${instruct}`);
  return responderWav(res, cors, result.buffer, speed, pitch, extraHeaders, { ...extraHeaders, "X-Astraura-Cache": "miss" });
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

/** ¿Hay algo que acotar? No: el valor de `pitch` pedido (número). */
function pitchEfectivo(v) {
  if (!Number.isFinite(v)) return 1;
  const acotado = Math.max(0.7, Math.min(1.4, v));
  return Math.abs(acotado - 1) < 0.001 ? 1 : acotado;
}

/**
 * (Ola 263) Aplica el TONO al WAV con ffmpeg: `asetrate` sube/baja el tono, se
 * vuelve a muestrear a la frecuencia de muestreo original con `aresample` y
 * `atempo` compensa la duración para que NO se acelere la voz (solo cambia el
 * tono). Lee por stdin y escribe por stdout (sin ficheros temporales), con un
 * presupuesto de 20 s. `atempo` solo acepta [0.5, 2]; con pitch acotado a
 * [0.7, 1.4] el factor `1/pitch` queda en [0.71, 1.43], siempre válido.
 * Devuelve { ok, buf } — si ffmpeg falta o falla, `ok` es false y `buf` es el
 * original (el llamador anota `X-Astraura-Ignored: pitch`). Nunca lanza.
 */
function aplicarPitch(buf, pitch) {
  return new Promise((resolve) => {
    if (Math.abs(pitch - 1) < 0.001) return resolve({ ok: true, buf });
    if (!hayFfmpeg()) return resolve({ ok: false, buf });
    let sr = 24000; // salida nativa del motor (ver X-Astraura-SampleRate)
    try {
      const v = buf.readUInt32LE(24);
      if (Number.isFinite(v) && v > 0) sr = v;
    } catch {
      /* sin cabecera legible: usamos 24 kHz, la salida nativa */
    }
    const factor = 1 / pitch;
    const args = [
      "-i", "-",
      "-af", `asetrate=${Math.round(sr * pitch)},aresample=${Math.round(sr)},atempo=${factor.toFixed(6)}`,
      "-f", "wav", "-",
    ];
    let child;
    try {
      // (Ola 263) Ruta absoluta resuelta: bajo launchd el PATH mínimo no trae
      // ffmpeg (Homebrew vive en /opt/homebrew/bin). `hayFfmpeg()` ya lo validó.
      child = spawn(rutaFfmpeg(), args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      return resolve({ ok: false, buf });
    }
    const trozos = [];
    let stderr = "";
    let done = false;
    const finish = (ok, out) => {
      if (done) return;
      done = true;
      clearTimeout(killer);
      resolve(ok ? { ok: true, buf: out } : { ok: false, buf });
    };
    const killer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* */ }
      finish(false);
    }, 20000);
    child.stderr?.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });
    child.stdout?.on("data", (d) => trozos.push(d));
    child.on("error", () => finish(false));
    child.on("close", (code) => {
      if (code !== 0) {
        log("daemon", `ffmpeg (pitch) salió con código ${code}: ${stderr.trim().slice(-300)}`);
        return finish(false);
      }
      const out = Buffer.concat(trozos);
      if (!isWav(out)) {
        log("daemon", "ffmpeg (pitch) no produjo un WAV válido");
        return finish(false);
      }
      finish(true, out);
    });
    try {
      child.stdin.write(buf);
      child.stdin.end();
    } catch (e) {
      finish(false);
    }
  });
}

/**
 * (Ola 263 · 2026-09-07) Duración real en segundos de un WAV a partir de `fmt `
 * (sampleRate, canales, bits) y el tamaño REAL de `data` (el mínimo entre lo
 * declarado y los bytes presentes: el 0xFFFFFFFF de una tubería ffmpeg no
 * cuenta). `null` si no se puede leer. Espejo exacto de
 * `duracionWavSegundos` en src/lib/voces/wav.ts (mismo contrato, mismo
 * recorrido de chunks): si cambias uno, cambia el otro.
 */
function duracionWavSegundos(buf) {
  const rec = recorrerWavChunks(buf);
  if (!rec || !rec.fmt) return null;
  const bytesPresentes = buf.length - rec.offsetData;
  const tamanoReal = Math.min(rec.tamanoData, bytesPresentes);
  if (tamanoReal < 0) return null;
  const bytesPorFotograma = rec.fmt.canales * (rec.fmt.bits / 8);
  if (!(bytesPorFotograma > 0)) return null;
  const seg = tamanoReal / (rec.fmt.sampleRate * bytesPorFotograma);
  return Number.isFinite(seg) && seg >= 0 ? seg : null;
}

/**
 * (Ola 263 · 2026-09-07) ffmpeg no conoce el tamaño final cuando escribe un
 * WAV a stdout (`-f wav -`, el camino de `aplicarPitch`): deja RIFF/data en
 * 0xFFFFFFFF y el archivo «dura» 89 s teniendo 3. Recorre los chunks
 * (`fmt `, `LIST`, `data`…) y, si `data` declara un tamaño mayor que los bytes
 * restantes (o el «desconocido» 0xFFFFFFFF), reescribe dataSize = total −
 * offsetData y riffSize = total − 8 a partir del búfer REAL. Devuelve el MISMO
 * Buffer si la cabecera ya es coherente (permite detectar la reparación con
 * `out !== buf`). Espejo exacto de `repararCabeceraWav` en src/lib/voces/wav.ts.
 */
function repararCabeceraWav(buf) {
  const rec = recorrerWavChunks(buf);
  if (!rec) return buf;
  const bytesPresentes = buf.length - rec.offsetData;
  if (rec.tamanoData <= bytesPresentes && rec.tamanoData !== 0xffffffff) return buf;
  const out = Buffer.from(buf); // copia: nunca mutamos el original (caché)
  out.writeUInt32LE(out.length - 8, 4); // tamaño RIFF
  out.writeUInt32LE(out.length - rec.offsetData, rec.offsetData - 4); // tamaño data
  return out;
}

/**
 * (Ola 263 · 2026-09-07) Recorre los chunks de un WAV RIFF/WAVE hasta `data`
 * (fmt va ANTES de data en un WAV bien formado; ffmpeg puede meter un LIST
 * en medio). Los chunks se alinean a 2 bytes. Devuelve
 * { fmt, offsetData, tamanoData } o null si no es WAV legible / no hay data /
 * un tamaño corrupto se sale del búfer.
 */
function recorrerWavChunks(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const tamano = buf.readUInt32LE(pos + 4);
    const offsetCuerpo = pos + 8;
    if (id === "fmt ") {
      // fmt mínimo: 16 bytes (PCM). WAVE_FORMAT_EXTENSIBLE trae más, pero
      // canales/sampleRate/bits están siempre en estas posiciones.
      if (offsetCuerpo + 16 > buf.length) return null;
      const canales = buf.readUInt16LE(offsetCuerpo + 2);
      const sampleRate = buf.readUInt32LE(offsetCuerpo + 4);
      const bits = buf.readUInt16LE(offsetCuerpo + 14);
      if (sampleRate > 0 && canales > 0 && bits > 0) fmt = { sampleRate, canales, bits };
    }
    if (id === "data") return { fmt, offsetData: offsetCuerpo, tamanoData: tamano };
    if (tamano > buf.length - offsetCuerpo) return null; // tamaño corrupto
    pos = offsetCuerpo + tamano + (tamano % 2);
  }
  return null;
}

/** (Ola 263) Repara la cabecera si miente y lo anota en el log del daemon. */
function repararWavSiHaceFalta(buf) {
  const out = repararCabeceraWav(buf);
  if (out !== buf) {
    const d = duracionWavSegundos(out);
    log("daemon", `cabecera WAV reparada (${out.length} bytes, ${d === null ? "?" : d.toFixed(2)} s)`);
  }
  return out;
}

/** Envía un WAV aplicando velocidad (síncrono) y tono (async), anotando ignorados. */
async function responderWav(res, cors, buf, speed, pitch, extraHeaders, outHeaders) {
  const vel = applySpeed(buf, speed, extraHeaders);
  // (Ola 263) La cabecera se repara AL FINAL, sobre el audio YA post-procesado
  // (velocidad + tono): es el punto único por el que pasa todo WAV que sale.
  // Así ni la respuesta ni la caché ven nunca un 0xFFFFFFFF de ffmpeg.
  const duracion = (seg) => {
    const s = duracionWavSegundos(seg);
    return s === null ? undefined : s.toFixed(2);
  };
  if (pitch !== 1) {
    const r = await aplicarPitch(vel, pitch);
    if (r.ok) {
      const sano = repararWavSiHaceFalta(r.buf);
      const dur = duracion(sano);
      sendWav(res, cors, sano, {
        ...outHeaders,
        "X-Astraura-Pitch": `asetrate/atempo:${pitch}`,
        ...(dur !== undefined ? { "X-Astraura-Duracion": dur } : {}),
      });
    } else {
      // ffmpeg ausente o falló: devolvemos el audio sin tono y lo decimos.
      const sano = repararWavSiHaceFalta(vel);
      const dur = duracion(sano);
      sendWav(res, cors, sano, {
        ...outHeaders,
        "X-Astraura-Ignored": [extraHeaders["X-Astraura-Ignored"], "pitch"].filter(Boolean).join(","),
        ...(dur !== undefined ? { "X-Astraura-Duracion": dur } : {}),
      });
    }
    return;
  }
  const sano = repararWavSiHaceFalta(vel);
  const dur = duracion(sano);
  sendWav(res, cors, sano, { ...outHeaders, ...(dur !== undefined ? { "X-Astraura-Duracion": dur } : {}) });
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
    return sendJson(res, 200, cors, {
      ok: true, warmed: false, warm: true, reason: "ya caliente",
      ...estadoDespertando(),
    });
  }
  sendJson(res, 200, cors, { ok: true, warmed: true, background: true, ...estadoDespertando() });
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

// ── /asr — OÍDO LOCAL (VibeASR.cpp ternario, Adenda 249) ─────────────────────
//
// Reconocimiento de voz TOTALLY local: el cuerpo es `multipart/form-data` con el
// campo `audio` (WAV/WEBM/OGG/M4A, ≤ 25 MB) o JSON `{ audio_base64, mime }`. Se
// guarda en un temporal, se convierte a WAV 16 kHz mono con `ffmpeg` (si no es
// ya un WAV utilizable) y se pasa al binario `asr_infer` de VibeASR.cpp. UN
// proceso a la vez (cola FIFO con cupo); la transcripción se parsea de stdout.
// Los temporales se borran SIEMPRE. Si el binario o los modelos faltan, 503 con
// la instrucción de instalación. Nunca lanza.

/**
 * Devuelve la extensión real del audio según el mime. Por defecto `.wav`: si no
 * sabemos qué es, asumimos WAV (el caso más común: el propio demonio y el
 * frontend envían WAV). 2026-09-06 (Ola 253): el temporal DEBE llevar la extensión
 * correcta porque `asr_infer` la usa para decidir el decodificador.
 */
function extDeAudio(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("webm")) return ".webm";
  if (m.includes("ogg") || m.includes("opus")) return ".ogg";
  if (m.includes("m4a") || m.includes("mp4")) return ".m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  // audio/wav, audio/x-wav, audio/wave, application/octet-stream o vacío → wav.
  return ".wav";
}

/**
 * Ruta ABSOLUTA del binario ffmpeg, o `null` si no hay ninguno utilizable.
 *
 * 2026-09-06 (Ola 263): bajo launchd el agente arranca con el PATH mínimo del
 * sistema (/usr/bin:/bin:/usr/sbin:/sbin), que NO incluye Homebrew — donde
 * vive ffmpeg en macOS. Por eso `spawn("ffmpeg")` fallaba (tono, efectos y
 * conversión a 16 kHz del oído desactivados) aunque `which ffmpeg` en una
 * shell sí lo encontrara. Se resuelve UNA vez y se cachea: 1) la ruta
 * explícita STARSEED_FFMPEG, 2) cada directorio del PATH del proceso,
 * 3) las rutas típicas de macOS/Linux por orden de preferencia (Homebrew de
 * Apple Silicon primero). Sólo cuenta si el fichero existe Y es ejecutable.
 */
let _rutaFfmpeg;
function rutaFfmpeg() {
  if (_rutaFfmpeg !== undefined) return _rutaFfmpeg;
  _rutaFfmpeg = null;
  const candidatas = [];
  const explicita = String(process.env.STARSEED_FFMPEG || "").trim();
  if (explicita) candidatas.push(explicita);
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    if (dir) candidatas.push(path.join(dir, "ffmpeg"));
  }
  // Rutas típicas fuera del PATH mínimo de launchd: Homebrew Apple Silicon,
  // Homebrew Intel, MacPorts y el sistema. El orden importa: priman las
  // instalaciones locales del usuario sobre la del sistema.
  candidatas.push(
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  );
  for (const ruta of candidatas) {
    try {
      fs.accessSync(ruta, fs.constants.X_OK);
      _rutaFfmpeg = ruta;
      break;
    } catch {
      /* esta candidata no existe o no es ejecutable: seguimos buscando */
    }
  }
  return _rutaFfmpeg;
}

/** ¿Hay ffmpeg utilizable? Cacheado sobre `rutaFfmpeg()` (Ola 263). */
let _ffmpeg = null;
function hayFfmpeg() {
  if (_ffmpeg === null) _ffmpeg = rutaFfmpeg() !== null;
  return _ffmpeg;
}

/** Convierte un audio a WAV 16 kHz mono con ffmpeg. Devuelve {ok, error}. */
function convertirAWav(entrada, salida) {
  return new Promise((resolve) => {
    let child;
    try {
      // (Ola 263) Ruta absoluta (launchd no hereda el PATH del usuario).
      child = spawn(rutaFfmpeg(), ["-y", "-i", entrada, "-ac", "1", "-ar", "16000", "-f", "wav", salida], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      return resolve({ ok: false, error: `no se pudo lanzar ffmpeg: ${e.message}` });
    }
    let stderr = "";
    const killer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* */
      }
      resolve({ ok: false, error: "timeout convirtiendo el audio" });
    }, 60000);
    child.stderr?.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
    child.on("close", (code) => {
      clearTimeout(killer);
      if (code !== 0) return resolve({ ok: false, error: `ffmpeg salió con código ${code}: ${stderr.trim().slice(-300)}` });
      resolve({ ok: true });
    });
  });
}

/**
 * Parseo de la salida de `asr_infer`: la transcripción es el texto de stdout
 * tras la última línea que contenga «Transcription» o «Result». Si no aparece,
 * se devuelve la última línea no vacía. Se recorta y se devuelve vacío si no hay.
 */
function parsearTranscripcion(stdout) {
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/Transcription|Result/i.test(lines[i])) idx = i;
  }
  if (idx >= 0 && idx < lines.length - 1) {
    // El texto puede estar en la MISMA línea (p.ej. "Result: hola") o en la siguiente.
    const after = lines[idx];
    const m = after.match(/Transcription|Result[:\s]*/i);
    const resto = m ? after.slice(m.index + m[0].length).trim() : "";
    if (resto) return resto;
    if (idx + 1 < lines.length) return lines[idx + 1];
  }
  if (idx >= 0) {
    const m = lines[idx].match(/Transcription|Result[:\s]*/i);
    const resto = m ? lines[idx].slice(m.index + m[0].length).trim() : "";
    if (resto) return resto;
  }
  return lines.length ? lines[lines.length - 1] : "";
}

/**
 * Devuelve las últimas `n` líneas no vacías de una salida de proceso. En los
 * errores de `asr_infer` solo nos interesa la cola del mensaje (2026-09-06,
 * Ola 253): el volcado completo puede ser enorme y oscurece la causa real.
 */
function ultimasLineas(texto, n) {
  return String(texto)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join("\n");
}

/**
 * Ejecuta `asr_infer` (one-shot) sobre un WAV y devuelve { ok, texto, segundos }.
 * Es el camino de RESPALDO cuando no existe `asr_stream_server` (instalación
 * vieja) o el residente no pudo cargar: recarga 1,7 GB de modelos en CADA
 * llamada. El presupuesto es proporcional a la duración del audio
 * (asrTimeoutMs, Ola 255). NUNCA lanza: los errores van en el objeto.
 */
function runVibeasr(wavPath, segundosAudio) {
  const t0 = Date.now();
  const presupuesto = asrTimeoutMs(segundosAudio);
  oidoPresupuestoMs = presupuesto;
  return new Promise((resolve) => {
    const p = vibeasrPaths();
    const args = [
      "--vae-model", p.vae,
      "--lm-model", p.lm,
      "--audio", wavPath,
      "-t", VIBEASR_HILOS,
    ];
    let child;
    try {
      child = spawn(p.bin, args, { cwd: VIBEASR_DIR, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return resolve({ ok: false, error: `no se pudo lanzar asr_infer: ${e.message}` });
    }
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* */
      }
      resolve({ ok: false, error: `timeout de reconocimiento (${ASR_TIMEOUT_MS} ms)` });
    }, ASR_TIMEOUT_MS);
    child.stdout?.on("data", (d) => {
      stdout += String(d);
      if (stdout.length > 65536) stdout = stdout.slice(-65536);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
    child.on("error", (e) => resolve({ ok: false, error: `error de proceso asr_infer: ${e.message}` }));
    child.on("close", (code) => {
      clearTimeout(killer);
      const segundos = Math.round((Date.now() - t0) / 10) / 100;
      if (code !== 0) {
        // Solo la cola de la salida: las últimas 12 líneas (2026-09-06, Ola 253).
        return resolve({ ok: false, error: `asr_infer salió con código ${code}: ${ultimasLineas(stderr, 12)}` });
      }
      const texto = parsearTranscripcion(stdout);
      resolve({ ok: true, texto, segundos });
    });
  });
}

/** Lee el cuerpo POST crudo hasta `maxBytes`. Devuelve Buffer o null (excedido). */
function readRawBody(req, maxBytes) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > maxBytes) {
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
    req.on("end", () => !aborted && resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

/**
 * Extrae el contenido binario del campo `audio` de un `multipart/form-data` ya
 * recibido como Buffer. Devuelve { buf, nombre, mime } o null si no hay campo.
 * Parser mínimo (un solo campo de fichero): busca la cabecera del campo entre
 * límites. Suficiente para un upload de audio de un navegador (FormData).
 */
function parsearMultipartAudio(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  const boundary = m ? (m[1] || m[2]).trim() : "";
  if (!boundary) return null;
  const delim = Buffer.from(`--${boundary}`);
  // Buscamos la parte que contiene `name="audio"`.
  const headerRe = /content-disposition:[^\r\n]*name="audio"/i;
  const bufStr = body.toString("latin1");
  const parts = bufStr.split(`--${boundary}`);
  for (const part of parts) {
    if (!headerRe.test(part)) continue;
    // Separamos cabeceras del cuerpo binario por la primera CRLFCRLF (o LFLF).
    const mimeMatch = /content-type:\s*([^\r\n;]+)/i.exec(part);
    const mime = mimeMatch ? mimeMatch[1].trim() : "application/octet-stream";
    const idx4 = part.indexOf("\r\n\r\n");
    const idx2 = part.indexOf("\n\n");
    let start = -1;
    if (idx4 >= 0) start = idx4 + 4;
    else if (idx2 >= 0) start = idx2 + 2;
    if (start < 0) continue;
    // El cuerpo termina antes del CRLF final que precede al siguiente límite.
    const raw = part.slice(start);
    let body2 = raw;
    // Quita el CRLF (o LF) final que el multipart añade antes del límite.
    if (body2.endsWith("\r\n")) body2 = body2.slice(0, -2);
    else if (body2.endsWith("\n")) body2 = body2.slice(0, -1);
    return { buf: Buffer.from(body2, "latin1"), mime };
  }
  return null;
}

async function handleAsr(req, res, cors) {
  const est = vibeasrStatus();
  if (!est.instalado || !est.modelos) {
    return sendJson(res, 503, cors, {
      ok: false,
      error: "vibeasr no instalado",
      instalar: "bash native/astraura-voice/install-vibeasr.sh",
    });
  }

  const contentType = (req.headers["content-type"] || "").toLowerCase();
  const raw = await readRawBody(req, ASR_MAX_BODY_BYTES);
  if (raw === null) return sendJson(res, 413, cors, { ok: false, error: "audio demasiado grande (máx. 25 MB)" });

  // Extrae el audio: multipart (campo `audio`) o JSON { audio_base64, mime }.
  let audioBuf = null;
  let mimeHint = "";
  if (contentType.includes("multipart/form-data")) {
    const parsed = parsearMultipartAudio(raw, contentType);
    if (!parsed || !parsed.buf || parsed.buf.length === 0) {
      return sendJson(res, 400, cors, { ok: false, error: "no se encontró el campo 'audio' en el multipart" });
    }
    audioBuf = parsed.buf;
    mimeHint = parsed.mime;
  } else {
    let body;
    try {
      body = JSON.parse(raw.toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, cors, { ok: false, error: "cuerpo inválido: espera multipart con 'audio' o JSON { audio_base64, mime }" });
    }
    if (!body || typeof body.audio_base64 !== "string" || !body.audio_base64) {
      return sendJson(res, 400, cors, { ok: false, error: "falta 'audio_base64'" });
    }
    mimeHint = typeof body.mime === "string" ? body.mime : "audio/wav";
    try {
      audioBuf = Buffer.from(body.audio_base64, "base64");
    } catch {
      return sendJson(res, 400, cors, { ok: false, error: "audio_base64 no es base64 válido" });
    }
  }

  if (!audioBuf || audioBuf.length === 0) {
    return sendJson(res, 400, cors, { ok: false, error: "audio vacío" });
  }

  // Guarda en temporal y SIEMPRE entrega a `asr_infer` un archivo con extensión
  // `.wav` (que es lo único que acepta junto a `.mp3`).
  //
  // 2026-09-06 (Ola 253): ANTES el temporal de entrada se guardaba con extensión
  // `.bin` y, cuando el WAV ya era 16 kHz mono, se pasaba tal cual → `asr_infer`
  // respondía "Unsupported audio format '.bin'". AHORA (1) el temporal lleva la
  // extensión real según el mime; (2) con ffmpeg se produce SIEMPRE un
  // `asr-16k-<id>.wav` normalizado (corrige también un WAV de 24 kHz como el que
  // genera el propio demonio); sin ffmpeg y con entrada ya `.wav` se usa directo,
  // y sin ffmpeg con otro formato se responde 415 con un mensaje claro.
  const extIn = extDeAudio(mimeHint);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpIn = path.join(PATHS.tmpDir, `asr-in-${id}${extIn}`);
  const tmp16k = path.join(PATHS.tmpDir, `asr-16k-${id}.wav`);
  const limpiar = () => {
    for (const f of [tmpIn, tmp16k]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* */
      }
    }
  };

  try {
    fs.writeFileSync(tmpIn, audioBuf);
  } catch (e) {
    limpiar();
    return sendJson(res, 500, cors, { ok: false, error: `no se pudo escribir el temporal: ${e.message}` });
  }

  let wavPath;
  if (hayFfmpeg()) {
    // Con ffmpeg NORMALIZAMOS siempre a WAV 16 kHz mono, aunque la entrada ya lo
    // sea: así un WAV de 24 kHz del propio demonio también llega correcto a
    // `asr_infer`.
    const conv = await convertirAWav(tmpIn, tmp16k);
    if (!conv.ok) {
      limpiar();
      return sendJson(res, 415, cors, { ok: false, error: `no se pudo convertir el audio a WAV 16 kHz mono: ${conv.error}` });
    }
    wavPath = tmp16k;
  } else if (extIn === ".wav") {
    // Sin ffmpeg y la entrada ya es WAV: `asr_infer` la acepta tal cual.
    wavPath = tmpIn;
  } else {
    limpiar();
    return sendJson(res, 415, cors, {
      ok: false,
      error: `formato '${extIn.slice(1)}' no soportado sin ffmpeg: instala ffmpeg o envía WAV`,
    });
  }

  // UN proceso a la vez (cola FIFO con cupo).
  //
  // 2026-09-06 (Ola 255): se lee la duración REAL del WAV 16 kHz (la cabecera
  // RIFF recorre los chunks, no asume `data` en el byte 44) y se cede memoria
  // del pool TTS si escasea antes de reconocer. Se prefiere el RESIDENTE
  // (`asr_stream_server`, modelos cargados una vez); si no existe el binario o
  // no llegó a READY, se cae UNA vez al one-shot `asr_infer`.
  const segundosAudio = segundosDeWav(wavPath);
  let result;
  try {
    result = await enqueueAsr(async () => {
      cederMemoriaSiHaceFalta();
      if (fs.existsSync(rutaOidoResidente())) {
        const r = await reconocerResidente(wavPath, segundosAudio);
        if (r.ok) return { ...r, motor: "vibeasr-1.58-residente" };
        // Si el residente falló por un error de ARRANQUE/carga (no llegó a
        // READY), caemos UNA vez al one-shot; si el error es del propio
        // reconocimiento (p. ej. timeout ya con el modelo cargado), no tiene
        // sentido recargar 1,7 GB otra vez: propagamos el error.
        const esCarga = /listo|ready|cargando|carga|residente/i.test(r.error || "");
        if (!esCarga) return { motor: "vibeasr-1.58-residente", error: r.error };
        log("daemon", `oído residente no quedó listo, caigo a asr_infer (one-shot): ${r.error}`);
      }
      const r2 = runVibeasr(wavPath, segundosAudio);
      return r2.then((x) => ({ ...x, motor: "vibeasr-1.58" }));
    });
  } catch (e) {
    limpiar();
    return sendJson(res, 503, cors, { ok: false, error: `cola llena: ${e.message}` });
  }

  limpiar();
  if (!result.ok) {
    log("daemon", `reconocimiento ASR fallido: ${result.error}`);
    return sendJson(res, 500, cors, { ok: false, error: result.error });
  }
  return sendJson(res, 200, cors, {
    ok: true,
    texto: result.texto,
    segundos: result.segundos,
    idioma: null,
    motor: result.motor,
    modelo: "VibeVoice-ASR-BitNet",
    segundosAudio: Number.isFinite(segundosAudio) ? segundosAudio : null,
    presupuestoMs: oidoPresupuestoMs,
  });
}

// ── /status ──────────────────────────────────────────────────────────────────

function handleStatus(res, cors) {
  const state = readiness();
  const cfg = state.cfg || {};
  // 2026-09-06 (Ola 255): residente = proceso vivo y listo; cargandoDesdeMs =
  // ms desde que empezó a cargar si aún no está listo (null en otro caso).
  const asrResidente = !!oidoProc && oidoListo;
  const asrCargandoDesdeMs = !asrResidente && oidoCargandoDesde > 0 ? Date.now() - oidoCargandoDesde : null;
  const mark = { asrResidente, asrCargandoDesdeMs };
  const payload = {
    ok: true,
    engine: "omnivoice.cpp",
    ready: state.ready,
    model: cfg.modelFile ? path.basename(cfg.modelFile) : null,
    tier: cfg?.variant?.tier || null,
    backend: cfg?.variant?.backend || null,
    quant: cfg?.variant?.quant || null,
    version: DAEMON_VERSION,
    // (Ola 263) Tono post-proceso: disponible solo si hay ffmpeg RESUELTO (ruta
    // absoluta, no el nombre plano: launchd arranca con un PATH mínimo sin
    // Homebrew). Sin él el demonio devuelve el audio con tono natural y
    // `X-Astraura-Ignored: pitch`. `ffmpeg` dice la ruta exacta en uso (o null).
    ffmpeg: rutaFfmpeg(),
    pitchDisponible: hayFfmpeg(),
    efectosDisponibles: hayFfmpeg(),
    // "Caliente" = hay al menos un servidor tts-server residente y listo (ver
    // isWarm()) — ya NO es una bandera manual: es un hecho observable del pool.
    warm: isWarm(),
    serverPool: serverPoolSummary(),
    // "Despertando" (2026-09-06): el demonio está vivo y tiene servidores en
    // arranque, pero ninguno listo todavía. El panel Motor lo usa para no decir
    // "apagado" mientras el modelo de ~900 MB sigue cargando en RAM.
    ...estadoDespertando(),
    memoriaLibreMb: Math.trunc(os.freemem() / (1024 * 1024)),
    uptime: Math.round((Date.now() - startedAt) / 1000),
    sampleRate: 24000,
    idleMs: Date.now() - lastReq, // para el autosync: ¿lleva rato inactivo?
    busy: inFlight > 0,
    inFlight,
    queueDepth,
    cloudFallback: cfg?.capabilities?.cloudFallback || "k2-fsa/OmniVoice",
    // OÍDO (Adenda 249): estado del ASR ternario VibeASR.cpp.
    asr: {
      instalado: vibeasrStatus().instalado,
      modelos: vibeasrStatus().modelos,
      ocupado: asrBusy,
      cola: asrQueueDepth,
      // 2026-09-06 (Ola 255, oído residente): si hay un asr_stream_server vivo
      // y listo, cuánto lleva cargando aún y el presupuesto del último
      // reconocimiento.
      residente: mark.asrResidente,
      cargandoDesdeMs: mark.asrCargandoDesdeMs,
      presupuestoMs: oidoPresupuestoMs,
      // 2026-09-06 (Ola 255, oído residente): últimas CESIONES del pool TTS
      // al oído. `ultimaCesionMs` = ms desde la última cesión (null si aún no
      // se cedió ninguna); `cesiones` = nº de cesiones desde el arranque.
      ultimaCesionMs: ultimaCesionEn === null ? null : Date.now() - ultimaCesionEn,
      cesiones,
    },
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
    if (req.method === "POST" && url === "/asr") {
      return await handleAsr(req, res, cors);
    }

    return sendJson(res, 404, cors, { ok: false, error: "ruta no encontrada", routes: ["GET /status", "POST /tts", "POST /identity", "POST /warm", "POST /asr"] });
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
// (Ola 263) Diagnóstico de ffmpeg al arrancar: bajo launchd el PATH mínimo no
// incluye Homebrew, así que la resolución por ruta absoluta es la que decide si
// el tono, los efectos y la conversión del oído funcionan. Dejarlo en el log
// evita averiguarlo a mano con curl.
log("daemon", `ffmpeg: ${rutaFfmpeg() ?? "no encontrado (tono, efectos y conversión de audio desactivados)"}`);
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
