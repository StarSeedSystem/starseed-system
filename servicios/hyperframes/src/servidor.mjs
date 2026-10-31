// Servicio «hyperframes» de una neurona (127.0.0.1:4490) · servidor (HFR1018P).
// Contrato: architecture/video-hyperframes.md §3 y §4. Escucha SOLO en 127.0.0.1; pasa cada
// petición a `manejar()` de rutas.mjs con la cola de render. Los hijos se lanzan con lista de
// argumentos, NUNCA con shell, y la telemetría de HyperFrames va siempre apagada.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { manejar } from "./rutas.mjs";
import { crearCola } from "./cola-render.mjs";

export const HOST = "127.0.0.1";
export const PUERTO = Number(process.env.STARSEED_HYPERFRAMES_PUERTO || 4490);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const SERVICIO = path.resolve(AQUI, "..");
export const RUTA_ENTORNO = process.env.STARSEED_HYPERFRAMES_ENTORNO || path.join(SERVICIO, "entorno");
export const RUTA_VERSION = path.join(SERVICIO, "package.json");
const TELEMETRIA = "1";
process.env.HYPERFRAMES_NO_TELEMETRY = TELEMETRIA;
const FORMATOS = new Set(["mp4", "webm", "mov", "gif", "png-sequence", "hls"]);

/** Clave=valor del archivo `entorno`; ignora comentarios y claves raras. */
export function leerEntorno(texto) {
  const salida = {};
  for (const linea of String(texto ?? "").split(/\r?\n/)) {
    const limpia = linea.trim();
    const i = limpia.indexOf("=");
    if (!limpia || limpia.startsWith("#") || i <= 0) continue;
    const clave = limpia.slice(0, i).trim();
    if (/^[A-Z][A-Z0-9_]{1,63}$/.test(clave)) salida[clave] = limpia.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return salida;
}

/** Entorno del hijo: el del servicio, lo del archivo `entorno` y la telemetría apagada. */
export function entornoHijo(base, texto) {
  const env = { ...base, ...leerEntorno(texto), HYPERFRAMES_NO_TELEMETRY: TELEMETRIA };
  if (env.HYPERFRAMES_BROWSER_PATH) env.PRODUCER_HEADLESS_SHELL_PATH ||= env.HYPERFRAMES_BROWSER_PATH;
  return env;
}

/** `ejecutar` de la cola: `npx hyperframes render <proyecto> …`, sin shell. */
export function crearEjecutor({ raiz, entorno }) {
  return (trabajo, { senal, alProgreso } = {}) => new Promise((resolver) => {
    const hijo = spawn("npx", ["hyperframes", "render", trabajo.proyecto, ...trabajo.args], {
      cwd: raiz, shell: false, env: { ...entorno, ...trabajo.env }, stdio: ["ignore", "pipe", "pipe"],
    });
    let salida = "", error = "";
    hijo.stdout.on("data", (b) => { salida += b; alProgreso?.(String(b)); });
    hijo.stderr.on("data", (b) => { error += b; });
    senal?.addEventListener("abort", () => hijo.kill("SIGTERM"), { once: true });
    hijo.on("error", (e) => resolver({ codigo: 1, error: e.message }));
    hijo.on("close", (codigo) => resolver({ codigo: codigo ?? 1, salida, error }));
  });
}

/** Cola de render con su adaptador HTTP: composición → proyecto temporal → trabajo. */
export function crearColaDeRender({ ejecutar, reloj, raizTrabajos }) {
  const cola = crearCola({ ejecutar, reloj, maxSimultaneos: 1, maxSegundos: 900 });
  return {
    encolar({ composicion, formato = "mp4" }) {
      const id = crypto.randomUUID();
      fs.mkdirSync(path.join(raizTrabajos, id), { recursive: true });
      fs.writeFileSync(path.join(raizTrabajos, id, "index.html"), String(composicion));
      const limpio = FORMATOS.has(formato) ? formato : "mp4";
      const salida = path.join("trabajos", id, `salida.${limpio}`);
      cola.encolar({ id, proyecto: path.join("trabajos", id), args: ["--format", limpio, "-o", salida] });
      return id;
    },
    estado: (id) => cola.estado(id),
    cancelar: (id) => cola.cancelar(id),
    listar: () => cola.listar(),
  };
}

/** Dependencias que espera `manejar()` en rutas.mjs. */
export function crearDependencias({ entorno = process.env, raiz = SERVICIO } = {}) {
  let archivo = "";
  try { archivo = fs.readFileSync(RUTA_ENTORNO, "utf8"); } catch { /* sin archivo entorno */ }
  const env = entornoHijo(entorno, archivo);
  let version = null;
  try { version = JSON.parse(fs.readFileSync(RUTA_VERSION, "utf8")).version ?? null; } catch { /* sin package */ }
  return {
    version, navegador: Boolean(env.HYPERFRAMES_BROWSER_PATH && fs.existsSync(env.HYPERFRAMES_BROWSER_PATH)),
    ffmpeg: spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0,
    cola: crearColaDeRender({ ejecutar: crearEjecutor({ raiz, entorno: env }), reloj: { obtener: () => Date.now() }, raizTrabajos: path.join(raiz, "trabajos") }),
  };
}

/** Manejador HTTP: cuerpo JSON acotado → `manejar()` → respuesta JSON. */
export function crearManejador(deps) {
  return async (req, res) => {
    const trozos = [];
    let total = 0;
    for await (const t of req) { total += t.length; if (total > 8 * 1024 * 1024) { res.writeHead(413); return res.end(); } trozos.push(t); }
    let cuerpo;
    if (trozos.length) { try { cuerpo = JSON.parse(Buffer.concat(trozos).toString("utf8")); } catch { cuerpo = undefined; } }
    const r = await manejar({ metodo: req.method, ruta: req.url, cuerpo }, deps);
    res.writeHead(r.estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(r.cuerpo));
  };
}

/** Arranca el servidor. Solo 127.0.0.1; devuelve el `http.Server`. */
export function arrancar({ puerto = PUERTO, host = HOST, deps = crearDependencias() } = {}) {
  const servidor = http.createServer(crearManejador(deps));
  servidor.listen(puerto, host, () => console.log("[hyperframes] servicio de vídeo escuchando"));
  return servidor;
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal && process.env.NODE_ENV !== "test") {
  const servidor = arrancar();
  const apagar = () => servidor.close(() => process.exit(0));
  process.on("SIGTERM", apagar);
  process.on("SIGINT", apagar);
}
