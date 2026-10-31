// Servidor del servicio «hyperframes» de una neurona (HFR1018P). Escucha SOLO en 127.0.0.1:4490,
// pasa cada petición a las rutas puras y ejecuta el render con la cola. Contrato:
// architecture/video-hyperframes.md §3 y §4. Telemetría de HyperFrames siempre apagada.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { manejar, LIMITE_CUERPO_BYTES } from "./rutas.mjs";
import { crearCola, ENTORNO } from "./cola-render.mjs";
export const HOST = "127.0.0.1";
export const PUERTO = Number(process.env.STARSEED_HYPERFRAMES_PUERTO || 4490);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RUTA_ENTORNO = process.env.STARSEED_HYPERFRAMES_ENTORNO || path.join(AQUI, "..", "entorno");
export const RUTA_PROYECTOS = process.env.STARSEED_HYPERFRAMES_PROYECTOS || path.join(os.tmpdir(), "starseed-hyperframes");
/** Lee un archivo `entorno` (CLAVE=valor, # comentarios, `export` y comillas). Puro. */
export function leerEntorno(texto) {
  const salida = {};
  for (const bruta of String(texto ?? "").split(/\r?\n/)) {
    const linea = bruta.trim();
    if (!linea || linea.startsWith("#")) continue;
    const par = linea.replace(/^export\s+/, ""), i = par.indexOf("=");
    if (i <= 0) continue;
    const clave = par.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clave)) continue;
    let valor = par.slice(i + 1).trim();
    if (valor.length >= 2 && valor[0] === valor.at(-1) && (valor[0] === '"' || valor[0] === "'")) valor = valor.slice(1, -1);
    salida[clave] = valor;
  }
  return salida;
}
/** Entorno del proceso + archivo del servicio; HYPERFRAMES_NO_TELEMETRY manda siempre. */
export const cargarEntorno = (ruta = RUTA_ENTORNO) => { try { return leerEntorno(fs.readFileSync(ruta, "utf8")); } catch { return {}; } };
const entornoProceso = () => ({ ...process.env, ...cargarEntorno(), ...ENTORNO });
const existeNavegador = (entorno) => Boolean(entorno.HYPERFRAMES_BROWSER_PATH && fs.existsSync(entorno.HYPERFRAMES_BROWSER_PATH));
const hayFfmpeg = () => { try { return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; } };
function versionDePaquete() {
  try { return JSON.parse(fs.readFileSync(path.join(AQUI, "..", "package.json"), "utf8")).dependencies?.hyperframes ?? null; }
  catch { return null; }
}
/** Ejecutor de la cola: `npx hyperframes render <proyecto> …` con lista de args, nunca shell. */
export function ejecutar({ proyecto, args, env = {} }, { senal, alProgreso } = {}) {
  return new Promise((resolver) => {
    const rutas = args.map((a, i) => (i > 0 && args[i - 1] === "-o" ? path.join(RUTA_PROYECTOS, a) : a));
    const hijo = spawn("npx", ["hyperframes", "render", path.join(RUTA_PROYECTOS, proyecto), ...rutas], {
      shell: false, stdio: ["ignore", "pipe", "pipe"], cwd: path.join(AQUI, ".."), env: { ...entornoProceso(), ...env } });
    let salida = "", error = "", terminado = false;
    const fin = (resultado) => { if (!terminado) { terminado = true; resolver(resultado); } };
    const leer = (trozo, esError) => {
      const texto = trozo.toString("utf8");
      if (esError) error = (error + texto).slice(-64 * 1024); else salida = (salida + texto).slice(-64 * 1024);
      for (const linea of texto.split(/\r?\n/)) if (linea) alProgreso?.(linea);
    };
    hijo.stdout?.on("data", (t) => leer(t, false));
    hijo.stderr?.on("data", (t) => leer(t, true));
    hijo.on("error", (e) => fin({ codigo: 1, error: e.message }));
    hijo.on("close", (codigo) => fin({ codigo: codigo ?? 1, salida, error }));
    if (senal) {
      const corta = () => { try { hijo.kill("SIGTERM"); } catch { /* ya terminó */ } };
      if (senal.aborted) corta(); else senal.addEventListener("abort", corta, { once: true });
    }
  });
}
const extension = (formato) => String(formato || "mp4").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mp4";

/** Cola adaptada a las rutas: la composición se guarda en `trabajos/<id>/index.html`. */
export function crearServicio({ raiz = RUTA_PROYECTOS, ejecutarRender = ejecutar } = {}) {
  const cola = crearCola({ ejecutar: ejecutarRender, reloj: { obtener: () => Date.now() } });
  const carpetaDe = (id) => path.join(raiz, "trabajos", id);
  return {
    encolar({ composicion, formato } = {}) {
      const id = randomUUID(), proyecto = path.join("trabajos", id), carpeta = path.join(raiz, proyecto);
      fs.mkdirSync(carpeta, { recursive: true });
      fs.writeFileSync(path.join(carpeta, "index.html"), String(composicion), "utf8");
      const salida = path.join(proyecto, "salida." + extension(formato));
      cola.encolar({ id, proyecto, args: ["--format", String(formato || "mp4"), "-o", salida] });
      return id;
    },
    estado: (id) => cola.estado(id),
    cancelar: (id) => cola.cancelar(id),
    listar: () => cola.listar(),
    vista(id) {
      try { return { html: fs.readFileSync(path.join(carpetaDe(id), "index.html"), "utf8") }; } catch { return null; }
    },
  };
}
const responder = (res, estado, cuerpo) => {
  const texto = JSON.stringify(cuerpo ?? {});
  res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(texto) });
  res.end(texto);
};
/** Servidor HTTP local; `deps` permite inyectar rutas y cola en las pruebas. */
export function crearServidor(opciones = {}) {
  const servicio = crearServicio(opciones);
  const deps = { version: versionDePaquete(), navegador: existeNavegador(entornoProceso()), ffmpeg: hayFfmpeg(),
    cola: servicio, vista: servicio.vista, ...opciones.deps };
  return http.createServer((req, res) => {
    let bruto = "";
    req.on("data", (trozo) => {
      bruto += trozo;
      if (Buffer.byteLength(bruto) > LIMITE_CUERPO_BYTES) { responder(res, 413, { error: "el cuerpo pasa de 8 MB" }); req.destroy(); }
    });
    req.on("end", async () => {
      if (res.writableEnded) return;
      let cuerpo;
      if (bruto) { try { cuerpo = JSON.parse(bruto); } catch { return responder(res, 400, { error: "cuerpo mal formado" }); } }
      const r = await manejar({ metodo: req.method, ruta: req.url, cuerpo }, deps);
      responder(res, r.estado, r.cuerpo);
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  crearServidor().listen(PUERTO, HOST, () => console.log(`hyperframes: servicio de vídeo en el puerto ${PUERTO}`));
}
