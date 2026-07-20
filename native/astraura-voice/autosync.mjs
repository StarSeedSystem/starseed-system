#!/usr/bin/env node
// @ts-nocheck
/**
 * StarSeed OS — MOTOR DE VOZ ASTRAURA (paquete NATIVO) · autosync.mjs
 * ============================================================================
 * SINCRONIZACIÓN EN SEGUNDO PLANO de los pesos GGUF. Cada 7 días (temporizador
 * propio con --loop, o invocado por cron/launchd para una comprobación única):
 *
 *   1. HEAD a la URL `resolve` de cada GGUF de la variante instalada.
 *   2. Compara el X-Linked-Etag (SHA-256 del blob LFS) con versions.json.
 *   3. Si cambió → descarga a `<fichero>.new`, valida el tamaño y hace un
 *      reemplazo ATÓMICO (fs.rename) SIN interrumpir peticiones en curso.
 *
 * COORDINACIÓN con el daemon (evitar pisar una síntesis):
 *   · Consulta GET /status. Si el sistema está ACTIVO (peticiones en los últimos
 *     10 min → idleMs < 10 min), POSPONE (el brief: descargar sólo si inactivo).
 *   · Antes del rename espera a que no haya síntesis en vuelo (busy=false). Como
 *     el CLI abre el modelo de nuevo en cada llamada, sustituir el fichero ENTRE
 *     llamadas es seguro.
 *   · Un LOCK de fichero simple evita dos autosyncs solapados.
 *
 * Sólo módulos nativos. Log a logs/autosync.log. NUNCA lanza sin control.
 *
 * Uso:  node autosync.mjs         → una comprobación y salir (cron/launchd)
 *       node autosync.mjs --loop  → residente, se re-ejecuta cada 7 días
 *       node autosync.mjs --force → ignora el estado "activo" y comprueba ya
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MODEL_VARIANTS, HF_REPO } from "./probe.mjs";
import {
  PATHS,
  DAEMON_HOST,
  DAEMON_PORT,
  ensureDirs,
  log,
  readConfig,
  readVersions,
  writeVersions,
  hfHead,
  hfDownload,
  makeProgressBar,
} from "./lib.mjs";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const IDLE_REQUIRED_MS = 10 * 60 * 1000; // "inactivo" = sin síntesis 10 min
const LOCK_STALE_MS = 60 * 60 * 1000; // un lock de más de 1 h se considera huérfano
const FLAGS = new Set(process.argv.slice(2));

const alog = (...p) => log("autosync", ...p);

// ── Lock de fichero (un autosync a la vez) ───────────────────────────────────
function acquireLock() {
  try {
    fs.mkdirSync(path.dirname(PATHS.lockFile), { recursive: true });
    // Roba el lock si es huérfano (proceso muerto sin liberar).
    try {
      const st = fs.statSync(PATHS.lockFile);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(PATHS.lockFile);
    } catch {
      /* no existe → adelante */
    }
    const fd = fs.openSync(PATHS.lockFile, "wx"); // falla si ya existe
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}
function releaseLock() {
  try {
    fs.unlinkSync(PATHS.lockFile);
  } catch {
    /* */
  }
}

// ── Estado del daemon (para coordinar) ───────────────────────────────────────
function getStatus(timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get({ host: DAEMON_HOST, port: DAEMON_PORT, path: "/status", timeout }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null)); // daemon apagado → null
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/** Espera a que el daemon no tenga síntesis en vuelo (o no responda). */
async function waitUntilIdle(maxWaitMs = 5 * 60 * 1000) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const st = await getStatus();
    if (!st || !st.busy) return true; // apagado o libre → seguro para renombrar
    if (Date.now() > deadline) return false;
    await sleep(5000);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Una pasada de comprobación + actualización ───────────────────────────────
async function checkOnce() {
  ensureDirs();
  const cfg = readConfig();
  if (!cfg) {
    alog("sin config.json: el motor no está instalado. Nada que sincronizar.");
    return { changed: 0, skipped: true };
  }

  // Coordinación: si el sistema está ACTIVO, posponer (salvo --force).
  const st = await getStatus();
  if (st && typeof st.idleMs === "number" && st.idleMs < IDLE_REQUIRED_MS && !FLAGS.has("--force")) {
    alog(`sistema activo (idle ${Math.round(st.idleMs / 1000)}s < 600s): pospongo la sincronización.`);
    return { changed: 0, deferred: true };
  }

  const versions = readVersions();
  // Ficheros de la variante instalada (de config; con respaldo a la matriz).
  const tierFiles = MODEL_VARIANTS[cfg?.variant?.tier || "baja"] || MODEL_VARIANTS.baja;
  const files = [cfg?.model?.base || tierFiles.modelFile, cfg?.model?.tokenizer || tierFiles.codecFile].filter(Boolean);

  let changed = 0;
  for (const file of files) {
    const head = await hfHead(file, HF_REPO);
    if (!head.ok) {
      alog(`HEAD de ${file} falló (${head.error || head.status}); lo dejo para la próxima.`);
      continue;
    }
    const known = versions[file] || {};
    const sameEtag = head.etag && known.etag && head.etag === known.etag;
    const sameSize = head.size && known.size && head.size === known.size;
    // Sin cambios si el ETag coincide (o, a falta de ETag, si el tamaño coincide).
    if (sameEtag || (!head.etag && sameSize)) {
      alog(`${file}: sin cambios (etag ${head.etag ? head.etag.slice(0, 12) : "n/d"}).`);
      continue;
    }

    alog(`${file}: cambio detectado → descargando versión nueva…`);
    const dest = path.join(PATHS.modelsDir, file);
    const tmp = `${dest}.new`;
    const bar = makeProgressBar(`${file} (nuevo)`);
    // Descargamos a un nombre .new.download (hfDownload usa .part internamente y
    // renombra a su `dest`; le pasamos `tmp` como destino intermedio).
    const res = await hfDownload(file, tmp, { repo: HF_REPO, expectedSize: head.size || 0, retries: 3, onProgress: bar });
    if (!res.ok) {
      alog(`descarga de ${file} falló: ${res.error}. Conservo la versión actual.`);
      try {
        fs.existsSync(tmp) && fs.unlinkSync(tmp);
      } catch {
        /* */
      }
      continue;
    }

    // Espera a que no haya síntesis en vuelo, luego reemplazo ATÓMICO.
    const idle = await waitUntilIdle();
    if (!idle) {
      alog(`${file}: el daemon sigue ocupado; aplazo el reemplazo (dejo ${path.basename(tmp)} listo).`);
      continue;
    }
    try {
      fs.renameSync(tmp, dest); // atómico: sustituye el fichero en su sitio
      versions[file] = { etag: head.etag || "", sha256: res.sha256, size: res.bytes, at: new Date().toISOString() };
      writeVersions(versions);
      changed++;
      alog(`${file}: actualizado (${(res.bytes / 1e6).toFixed(1)} MB, etag ${head.etag ? head.etag.slice(0, 12) : "n/d"}).`);
    } catch (e) {
      alog(`no pude renombrar ${tmp} → ${dest}: ${e.message}. Conservo la actual.`);
      try {
        fs.existsSync(tmp) && fs.unlinkSync(tmp);
      } catch {
        /* */
      }
    }
  }

  alog(`comprobación terminada · ${changed} fichero(s) actualizado(s).`);
  return { changed };
}

// ── Punto de entrada ─────────────────────────────────────────────────────────
async function run() {
  if (!acquireLock()) {
    alog("otro autosync ya está en marcha (lock presente). Salgo.");
    return;
  }
  try {
    await checkOnce();
    if (FLAGS.has("--loop")) {
      alog("modo --loop: próxima comprobación en 7 días.");
      // Temporizador propio (residente). Se mantiene vivo por el interval.
      setInterval(() => {
        checkOnce().catch((e) => alog(`error en comprobación periódica: ${e?.message || e}`));
      }, WEEK_MS);
      // No liberamos el lock en modo loop hasta que el proceso muera.
      const cleanup = () => {
        releaseLock();
        process.exit(0);
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
      return; // deja el proceso vivo
    }
  } catch (e) {
    alog(`error inesperado: ${e?.stack || e}`);
  } finally {
    if (!FLAGS.has("--loop")) releaseLock();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch((e) => alog(`fallo en run(): ${e?.stack || e}`));
}

export { checkOnce };
