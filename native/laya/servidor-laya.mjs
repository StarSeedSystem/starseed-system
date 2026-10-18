import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

// (2026-09-23) Variable PROPIA, no `PORT`: `PORT` es la del servidor que lanza el proceso
// (el Mando corre con PORT=9002), y con ella Laya intentaba escuchar en el puerto del
// Mando y su prueba fallaba al publicar desde el botón.
export const PUERTO = Number(process.env.STARSEED_LAYA_PUERTO || 4470);
export const HOST = "127.0.0.1";
export const MIN_RAM_MB = 2500;
export const INACTIVIDAD_MS = 10 * 60 * 1000;
export const RUTA_CONVERSACION = path.join(os.homedir(), ".starseed", "conversacion.json");
export const LAYA_CACHE = process.env.LAYA_CACHE || path.join(os.homedir(), ".starseed", "laya-cache");

// (2026-10-18) `vm_stat` cuenta en páginas y en Apple Silicon cada página ocupa 16 KB, no 4 KB: con 4096 fijo la
// RAM libre salía 4 veces más pequeña y Laya nunca se cargaba en la Mac. El tamaño se lee de su cabecera.
export function ramLibreDeVmStat(texto) {
  const pagina = Number(texto.match(/page size of (\d+) bytes/)?.[1] || 4096);
  const libre = Number(texto.match(/Pages free:\s+(\d+)\./)?.[1] || 0);
  const inact = Number(texto.match(/Pages inactive:\s+(\d+)\./)?.[1] || 0);
  return Math.round(((libre + inact) * pagina) / (1024 * 1024));
}

export function obtenerRamLibreMb() {
  try {
    if (process.platform === "darwin") {
      return ramLibreDeVmStat(execSync("vm_stat", { encoding: "utf8" }));
    }
    if (process.platform === "linux") {
      const mem = fs.readFileSync("/proc/meminfo", "utf8");
      const libre = Number(mem.match(/MemFree:\s+(\d+)\s+kB/)?.[1] || 0);
      const inact = Number(mem.match(/Inactive:\s+(\d+)\s+kB/)?.[1] || 0);
      return Math.round((libre + inact) / 1024);
    }
  } catch {}
  return Math.round(os.freemem() / (1024 * 1024));
}

export function conversacionEnCurso(ahoraMs = Date.now(), rutaArchivo = RUTA_CONVERSACION) {
  try {
    if (!fs.existsSync(rutaArchivo)) return false;
    const datos = JSON.parse(fs.readFileSync(rutaArchivo, "utf8"));
    const hasta = typeof datos.hasta === "string" ? new Date(datos.hasta).getTime() : Number(datos.hasta || 0);
    return hasta > ahoraMs;
  } catch {
    return false;
  }
}

export function verificarCarga(ramLibreMb, conversacionActiva, esPrioritaria) {
  if (ramLibreMb < MIN_RAM_MB) return { ok: false, motivo: "sin RAM para Laya" };
  if (conversacionActiva && !esPrioritaria) return { ok: false, motivo: "conversación en curso" };
  return { ok: true };
}

let layaInstancia = null;
let cargado = false;
let timerInactividad = null;

export function estaCargado() { return cargado; }

export function descargarLaya() {
  if (layaInstancia) {
    try { layaInstancia.close?.(); } catch {}
    layaInstancia = null;
    cargado = false;
  }
}

export function opcionesCarga(entorno = process.env) {
  const dir = (entorno.LAYA_MODEL_DIR || "").trim();
  return dir ? { modelDir: dir } : { cacheDir: LAYA_CACHE };
}

async function asegurarLaya() {
  if (!layaInstancia) {
    // (2026-10-18) `new Laya({ subfolder: "multilingual" })` de @receptron/laya 0.1.x nunca cargó: el repo
    // receptron/laya-onnx solo publica el checkpoint inglés en la raíz y la configuración salía vacía
    // («Cannot read properties of undefined (reading 'max_len')», comprobado en el A1). Ahora: `Laya.load()` de
    // 0.2.x con el checkpoint publicado, o la exportación propia (p. ej. laya-multilingual) si LAYA_MODEL_DIR la da.
    const { Laya } = await import("@receptron/laya");
    layaInstancia = await Laya.load(opcionesCarga());
    cargado = true;
  }
  if (timerInactividad) clearTimeout(timerInactividad);
  timerInactividad = setTimeout(() => descargarLaya(), INACTIVIDAD_MS);
  if (timerInactividad.unref) timerInactividad.unref();
  return layaInstancia;
}

export function crearManejador() {
  return async (req, res) => {
    const url = req.url || "/";
    const metodo = req.method || "GET";
    const prioHeader = req.headers["x-prioridad"];
    const esPrioritaria = Array.isArray(prioHeader) ? prioHeader.includes("conversacion") : prioHeader === "conversacion";

    // `/health` lo consulta el Mando (src/app/api/mando/jev/route.ts); antes solo existía `/status` y Laya salía caído.
    if (metodo === "GET" && (url === "/status" || url === "/health" || url === "/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ cargado, ramLibreMb: obtenerRamLibreMb(), motivo: cargado ? "ok" : "descargado por inactividad" }));
    }

    if (metodo === "POST" && url === "/v1/systemone") {
      const check = verificarCarga(obtenerRamLibreMb(), conversacionEnCurso(), esPrioritaria);
      if (!check.ok) {
        res.writeHead(503, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ motivo: check.motivo }));
      }
      let bodyStr = "";
      req.on("data", chunk => { bodyStr += chunk; });
      return req.on("end", async () => {
        try {
          const body = JSON.parse(bodyStr || "{}");
          const model = await asegurarLaya();
          const t0 = Date.now();
          const resModel = await model.systemOne(body.state, body.questions);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ answers: resModel.answers || resModel, usage: resModel.usage || { total_tokens: 0 }, ms: Date.now() - t0 }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: err?.message || "error procesando petición" }));
        }
      });
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "no encontrado" }));
  };
}

if (process.env.NODE_ENV !== "test") {
  const server = http.createServer(crearManejador());
  server.listen(PUERTO, HOST, () => console.log(`[Laya] Servidor escuchando en http://${HOST}:${PUERTO}`));
}
