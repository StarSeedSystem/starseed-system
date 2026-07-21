// @ts-nocheck
/**
 * StarSeed OS — MOTOR DE VOZ ASTRAURA (paquete NATIVO) · lib.mjs
 * ============================================================================
 * SALA DE MÁQUINAS compartida por install.mjs, daemon.mjs y autosync.mjs.
 * Todo con módulos NATIVOS de Node (http, https, fs, os, crypto, path) — cero
 * paquetes externos, para que corra tal cual en el Mac/PC del usuario.
 *
 * Contiene: rutas del árbol `~/.starseed/astraura-voice/`, logging a fichero,
 * lectura/escritura de config.json y versions.json, cliente HTTPS con
 * seguimiento de redirecciones (HEAD/GET a HuggingFace), descarga con barra de
 * progreso y reintentos, verificación de allowlist CORS, utilidades WAV y el
 * mapa de idiomas. Nada aquí lanza sin querer: los helpers son defensivos.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import crypto from "node:crypto";
import { HF_REPO } from "./probe.mjs";

// ── Árbol de ficheros en disco (fuera del repo; datos del usuario) ───────────

/** Raíz de datos del motor: `~/.starseed/astraura-voice`. */
export const ROOT = path.join(os.homedir(), ".starseed", "astraura-voice");
export const PATHS = {
  root: ROOT,
  repoDir: path.join(ROOT, "omnivoice.cpp"), // clon de omnivoice.cpp
  modelsDir: path.join(ROOT, "omnivoice.cpp", "models"), // GGUF descargados
  buildDir: path.join(ROOT, "omnivoice.cpp", "build"), // binarios compilados
  logsDir: path.join(ROOT, "logs"),
  cacheDir: path.join(ROOT, "cache"), // WAV cacheados por hash
  tmpDir: path.join(ROOT, "tmp"), // WAV temporales de síntesis
  refsDir: path.join(ROOT, "refs"), // identidades de voz por personalidad (Adenda 87)
  configFile: path.join(ROOT, "config.json"),
  versionsFile: path.join(ROOT, "versions.json"), // ETag/SHA de cada GGUF
  lockFile: path.join(ROOT, "autosync.lock"), // lock del autosync
};

/** Nombre de los dos binarios CLI que produce el build en `build/`. */
export const BIN = {
  tts: process.platform === "win32" ? "omnivoice-tts.exe" : "omnivoice-tts",
  codec: process.platform === "win32" ? "omnivoice-codec.exe" : "omnivoice-codec",
};

/** Puerto y host del daemon (loopback: nunca escucha en la red). */
export const DAEMON_HOST = "127.0.0.1";
export const DAEMON_PORT = 4444;

/** Versión del paquete nativo (independiente de la versión de los pesos). */
export const DAEMON_VERSION = "1.0.0";

/** Crea (idempotente) todo el árbol de directorios de datos. Nunca lanza. */
export function ensureDirs() {
  for (const d of [PATHS.root, PATHS.logsDir, PATHS.cacheDir, PATHS.tmpDir]) {
    try {
      fs.mkdirSync(d, { recursive: true });
    } catch {
      /* permisos / carrera → seguimos */
    }
  }
}

// ── Logging a fichero (append, con marca de tiempo) ──────────────────────────

/**
 * Registra una línea en `logs/<name>.log` (y también por consola). Nunca lanza:
 * un fallo de disco jamás debe tumbar el daemon.
 */
export function log(name, ...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
  try {
    fs.mkdirSync(PATHS.logsDir, { recursive: true });
    fs.appendFileSync(path.join(PATHS.logsDir, `${name}.log`), line + "\n");
  } catch {
    /* */
  }
  return line;
}

// ── config.json / versions.json ──────────────────────────────────────────────

/** Lee config.json (o null si no existe / está corrupto). Nunca lanza. */
export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.configFile, "utf8"));
  } catch {
    return null;
  }
}

/** Escribe config.json de forma atómica (tmp + rename). Devuelve true/false. */
export function writeConfig(cfg) {
  return writeJsonAtomic(PATHS.configFile, cfg);
}

/** Lee versions.json (mapa fichero→{etag,size,sha256,at}). {} si no hay. */
export function readVersions() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.versionsFile, "utf8"));
  } catch {
    return {};
  }
}

/** Escribe versions.json de forma atómica. */
export function writeVersions(v) {
  return writeJsonAtomic(PATHS.versionsFile, v);
}

/** Escritura JSON atómica genérica (tmp en el mismo dir + rename). */
export function writeJsonAtomic(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

// ── Cliente HTTPS con seguimiento de redirecciones ───────────────────────────

/** URL de descarga directa de un fichero del repo GGUF en HuggingFace. */
export function hfResolveUrl(file, repo = HF_REPO) {
  return `https://huggingface.co/${repo}/resolve/main/${file}`;
}

/**
 * Petición HTTP(S) de bajo nivel que SIGUE redirecciones (301/302/303/307/308).
 * Entrega la respuesta viva (stream) al callback junto con la lista de saltos.
 * `method` 'HEAD' o 'GET'. NUNCA lanza: los errores llegan por el callback.
 *
 * Nota: los GGUF de HuggingFace viven en Git-LFS. Un HEAD a la URL `resolve`
 * responde 302 hacia el CDN y YA trae en esa 302 los headers `X-Linked-Etag`
 * (SHA-256 del blob LFS) y `X-Linked-Size` (bytes) — por eso HEAD no necesita
 * seguir el salto. El GET sí lo sigue hasta el binario en el CDN.
 */
function request(url, { method = "GET", headers = {}, maxRedirects = 6, timeout = 30000 } = {}, cb) {
  let redirects = 0;
  const hops = [];
  const go = (u) => {
    let parsed;
    try {
      parsed = new URL(u);
    } catch (e) {
      return cb(new Error(`URL inválida: ${u}`));
    }
    const mod = parsed.protocol === "http:" ? http : https;
    const req = mod.request(
      parsed,
      { method, headers: { "User-Agent": "StarSeed-Astraura-Voice/1.0", ...headers } },
      (res) => {
        const status = res.statusCode || 0;
        hops.push({ url: u, status });
        // Redirección: para HEAD la aprovechamos (headers ya vienen); pero si el
        // llamador quiere seguir (GET), reintentamos contra Location.
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && method !== "HEAD") {
          res.resume(); // drena el cuerpo del redirect
          if (redirects++ >= maxRedirects) return cb(new Error("Demasiadas redirecciones"));
          const next = new URL(res.headers.location, parsed).href;
          return go(next);
        }
        cb(null, res, { hops, finalUrl: u });
      },
    );
    req.setTimeout(timeout, () => {
      req.destroy(new Error("Timeout de red"));
    });
    req.on("error", (err) => cb(err));
    req.end();
  };
  go(url);
}

/**
 * hfHead — HEAD a la URL `resolve` de un fichero. Devuelve
 *   { ok, status, etag, size } — `etag` = X-Linked-Etag (SHA-256 del blob LFS)
 * con respaldo al ETag normal; `size` = X-Linked-Size con respaldo a
 * Content-Length. Promesa que NUNCA rechaza (ok:false ante cualquier fallo).
 */
export function hfHead(file, repo = HF_REPO) {
  return new Promise((resolve) => {
    request(hfResolveUrl(file, repo), { method: "HEAD", timeout: 20000 }, (err, res) => {
      if (err || !res) return resolve({ ok: false, status: 0, etag: "", size: 0, error: err?.message });
      const h = res.headers;
      const etag = String(h["x-linked-etag"] || h["etag"] || "").replace(/"/g, "");
      const size = parseInt(String(h["x-linked-size"] || h["content-length"] || "0"), 10) || 0;
      res.resume();
      resolve({ ok: (res.statusCode || 0) < 400 || res.statusCode === 302, status: res.statusCode || 0, etag, size });
    });
  });
}

/**
 * hfDownload — descarga un fichero GGUF a `destPath` con barra de progreso y
 * reintentos. Verifica que el tamaño final no es cero (y coincide con el
 * esperado si se conoce). Calcula el SHA-256 del contenido al vuelo. Devuelve
 * { ok, bytes, sha256, error }. Promesa que NUNCA rechaza.
 *
 * Escribe a `destPath.part` y sólo renombra a `destPath` al terminar bien
 * (descarga "todo o nada": nunca deja un GGUF a medias que el motor cargaría).
 */
export function hfDownload(file, destPath, { repo = HF_REPO, expectedSize = 0, retries = 3, onProgress } = {}) {
  const attempt = (n) =>
    new Promise((resolve) => {
      const part = `${destPath}.part`;
      let received = 0;
      let total = expectedSize;
      const hash = crypto.createHash("sha256");
      let out;
      try {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        out = fs.createWriteStream(part);
      } catch (e) {
        return resolve({ ok: false, error: `No se pudo abrir ${part}: ${e.message}` });
      }
      const fail = (msg) => {
        try {
          out.destroy();
        } catch {
          /* */
        }
        try {
          fs.unlinkSync(part);
        } catch {
          /* */
        }
        resolve({ ok: false, error: msg });
      };

      request(hfResolveUrl(file, repo), { method: "GET", timeout: 60000 }, (err, res) => {
        if (err || !res) return fail(err?.message || "sin respuesta");
        if ((res.statusCode || 0) >= 400) {
          res.resume();
          return fail(`HTTP ${res.statusCode}`);
        }
        if (!total) total = parseInt(String(res.headers["content-length"] || "0"), 10) || 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          hash.update(chunk);
          if (onProgress) onProgress(received, total);
        });
        res.on("error", (e) => fail(e.message));
        res.pipe(out);
        out.on("error", (e) => fail(e.message));
        out.on("finish", () => {
          if (received === 0) return fail("descarga vacía (0 bytes)");
          if (total && received !== total) return fail(`tamaño ${received} ≠ esperado ${total}`);
          try {
            fs.renameSync(part, destPath);
          } catch (e) {
            return fail(`rename falló: ${e.message}`);
          }
          resolve({ ok: true, bytes: received, sha256: hash.digest("hex") });
        });
      });
    });

  return (async () => {
    let last = { ok: false, error: "sin intentos" };
    for (let n = 1; n <= retries; n++) {
      last = await attempt(n);
      if (last.ok) return last;
      log("install", `Descarga de ${file} falló (intento ${n}/${retries}): ${last.error}`);
      await new Promise((r) => setTimeout(r, 1000 * n)); // backoff lineal
    }
    return last;
  })();
}

/** Barra de progreso simple para stdout TTY (o porcentaje por línea si no hay TTY). */
export function makeProgressBar(label) {
  let lastPct = -1;
  return (received, total) => {
    if (!total) return;
    const pct = Math.floor((received / total) * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    const mb = (b) => (b / 1024 / 1024).toFixed(1);
    if (process.stdout.isTTY) {
      const width = 24;
      const filled = Math.round((pct / 100) * width);
      const bar = "█".repeat(filled) + "░".repeat(width - filled);
      process.stdout.write(`\r  ${label} [${bar}] ${pct}%  ${mb(received)}/${mb(total)} MB   `);
      if (pct >= 100) process.stdout.write("\n");
    } else if (pct % 20 === 0) {
      process.stdout.write(`  ${label}: ${pct}% (${mb(received)}/${mb(total)} MB)\n`);
    }
  };
}

// ── Allowlist CORS (verificación estricta de Origin) ─────────────────────────

/**
 * isAllowedOrigin — ¿este Origin puede hablar con el daemon? Estricto:
 *   · https://starseed-os.vercel.app                         (producción OS)
 *   · https://*.starseed-os.com  (y el ápice starseed-os.com) (dominio propio)
 *   · https://*-alexbordongarrigos-projects.vercel.app        (previews Vercel)
 *   · http://localhost:*  ·  http://127.0.0.1:*  ·  http://[::1]:* (desarrollo)
 * Cualquier otro Origin → false (el daemon responde 403 sin cuerpo).
 * Se parsea con la API URL (más robusto que un regex sobre la cadena cruda).
 */
export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const proto = u.protocol;
  // Loopback de desarrollo: sólo http, cualquier puerto.
  if (proto === "http:" && (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]")) {
    return true;
  }
  // Todo lo demás, exclusivamente https.
  if (proto === "https:") {
    if (host === "starseed-os.vercel.app") return true;
    if (host === "starseed-os.com" || host.endsWith(".starseed-os.com")) return true;
    if (host.endsWith("-alexbordongarrigos-projects.vercel.app")) return true;
  }
  return false;
}

// ── Utilidades WAV (mono 24 kHz 16-bit PCM, salida de omnivoice-tts) ─────────

/** ¿Este buffer parece un WAV RIFF/WAVE válido? */
export function isWav(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length > 44 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  );
}

/**
 * retimeWav — cambia la VELOCIDAD reescribiendo la frecuencia de muestreo en la
 * cabecera WAV (fmt chunk: sampleRate en bytes 24-27, byteRate en 28-31).
 *
 * HONESTIDAD: esto es un remuestreo "por cabecera" (barato, sin tocar las
 * muestras) y por tanto TAMBIÉN desplaza el tono (efecto ardilla). Es la opción
 * "si es simple" del brief; el daemon sólo la aplica bajo un flag y lo anuncia
 * en una cabecera de respuesta. Para un cambio de velocidad sin alterar el tono
 * haría falta un remuestreo real (fuera del alcance de esta versión).
 *
 * `speed` > 1 acelera; < 1 ralentiza. Devuelve un Buffer NUEVO (no muta).
 */
export function retimeWav(buf, speed) {
  if (!isWav(buf) || !Number.isFinite(speed) || speed <= 0 || Math.abs(speed - 1) < 0.01) return buf;
  const clamped = Math.max(0.5, Math.min(2, speed));
  const out = Buffer.from(buf); // copia
  try {
    const baseRate = out.readUInt32LE(24);
    const blockAlign = out.readUInt16LE(32);
    const newRate = Math.round(baseRate * clamped);
    out.writeUInt32LE(newRate, 24); // SampleRate
    out.writeUInt32LE(newRate * blockAlign, 28); // ByteRate = SampleRate * BlockAlign
    return out;
  } catch {
    return buf;
  }
}

// ── Mapa de idiomas (código → nombre en inglés que espera `--lang`) ──────────

/**
 * El CLI omnivoice-tts recibe el idioma por su NOMBRE en inglés (ej. `--lang
 * English`, `--lang Spanish`). Traducimos códigos ISO / etiquetas comunes.
 * Por defecto Spanish (la sociedad StarSeed habla español).
 */
export const LANG_MAP = {
  es: "Spanish",
  "es-es": "Spanish",
  "es-mx": "Spanish",
  spanish: "Spanish",
  en: "English",
  "en-us": "English",
  "en-gb": "English",
  english: "English",
  fr: "French",
  french: "French",
  de: "German",
  german: "German",
  it: "Italian",
  italian: "Italian",
  pt: "Portuguese",
  "pt-br": "Portuguese",
  portuguese: "Portuguese",
  zh: "Chinese",
  chinese: "Chinese",
  ja: "Japanese",
  japanese: "Japanese",
  ko: "Korean",
  korean: "Korean",
  ru: "Russian",
  russian: "Russian",
  ar: "Arabic",
  arabic: "Arabic",
  hi: "Hindi",
  hindi: "Hindi",
  nl: "Dutch",
  dutch: "Dutch",
  pl: "Polish",
  polish: "Polish",
  tr: "Turkish",
  turkish: "Turkish",
};

/** Traduce un código/nombre de idioma al nombre en inglés del CLI. */
export function resolveLang(lang, fallback = "Spanish") {
  if (!lang || typeof lang !== "string") return fallback;
  const key = lang.trim().toLowerCase();
  return LANG_MAP[key] || LANG_MAP[key.slice(0, 2)] || fallback;
}

/**
 * Nombre en inglés (tal como lo devuelve `resolveLang`, en minúsculas) →
 * código ISO corto. DERIVADO de `LANG_MAP` (no mantenemos dos listas
 * paralelas): invierte solo sus claves de 2 letras, así variantes regionales
 * como "es-mx" no entran como código.
 */
const LANG_NAME_TO_BASE = Object.keys(LANG_MAP).reduce((acc, key) => {
  if (key.length === 2) acc[LANG_MAP[key].toLowerCase()] = key;
  return acc;
}, {});

/**
 * Código de idioma BASE (2 letras, minúsculas) a partir de lo que mandó el
 * frontend — un código ISO ("es", "es-ES", "en-US"…) O el NOMBRE EN INGLÉS que
 * ya devuelve `resolveLang` ("Spanish", "German"…), según quién llame: el
 * híbrido OmniVoice (`omnivoice-hybrid.ts::synthLocal`) manda el NOMBRE en
 * `body.lang` (vía `mapLangToSpace`), mientras que otros llamadores (p.ej. la
 * semilla local de `openvoice2.ts::designSeedViaLocalDaemon`) mandan el
 * CÓDIGO. Probar el nombre primero evita el bug de cortar por las dos
 * primeras letras de un nombre ("german".slice(0,2) → "ge", que NO es "de")
 * — así `langBase` SIEMPRE concuerda con el `--lang` que calcula `resolveLang`
 * para el MISMO `lang` de entrada. Mismo default ("es") que `resolveLang`. Lo
 * usan las referencias POR IDIOMA (refs/<personalidad>.<langBase>.wav) y el
 * instruct por idioma del daemon (fix del acento importado, 2026-07-21).
 * Nunca lanza.
 */
export function langBaseOf(lang, fallback = "es") {
  if (!lang || typeof lang !== "string") return fallback;
  const key = lang.trim().toLowerCase();
  if (LANG_NAME_TO_BASE[key]) return LANG_NAME_TO_BASE[key];
  const base = key.slice(0, 2);
  // Solo aceptamos el código corto si `resolveLang` también lo reconocería —
  // así un `lang` irreconocible cae al MISMO fallback en los dos (nunca un
  // langName="Spanish" emparejado con un langBase de otra cosa).
  return LANG_MAP[base] ? base : fallback;
}

/** SHA-256 hex de una cadena (para claves de caché). */
export function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}
