/**
 * Conversor de archivos de una neurona, sobre Hono (2026-10-23).
 *
 * La neurona que tiene Filee (KnifeLemon/Filee, MIT; 255 formatos sin conexión) lo expone por
 * la malla a las demás neuronas de la cuenta con `STARSEED_CONVERSOR_TOKEN`. Nada sale de las
 * neuronas de la persona: no hay servicios externos. Mismo patrón que `servicios/servidor-ia`.
 * Argumentos siempre en lista (execFile, nunca shell), carpeta temporal propia que se borra
 * siempre, tope de 500 MB, 15 minutos y 2 conversiones a la vez.
 * Contrato: `architecture/conversion-archivos.md` §3 y §6.
 */
import { execFile } from "node:child_process";
import { promises as fs, constants as fsc } from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";

import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { cors } from "hono/cors";

export const VERSION = "1.0.0";
export const MAX_BYTES = 500 * 1024 * 1024;
export const TIEMPO_MS = 15 * 60 * 1000;
export const MAX_SIMULTANEAS = 2;

const ID_FORMATO = /^[a-z0-9][a-z0-9+_-]{0,15}$/;
const ALIAS = { jpeg: "jpg", jpe: "jpg", jfif: "jpg", tif: "tiff", htm: "html", markdown: "md", yml: "yaml" };

/** «md», «MD», «.md», «nota.MD», «image/png» → «md»/«png». Vacío si no se reconoce. */
export function formatoDe(entrada) {
    const crudo = String(entrada ?? "").trim().toLowerCase();
    if (!crudo) return "";
    let f = crudo;
    if (f.includes("/") && !f.includes(".")) f = f.split("/").pop() ?? "";
    else if (f.includes(".")) f = f.slice(f.lastIndexOf(".") + 1);
    f = f.replace(/^x-/, "").replace(/\+.*$/, "").replace(/[?#].*$/, "");
    f = ALIAS[f] ?? f;
    return ID_FORMATO.test(f) ? f : "";
}

/** ¿Es un id de formato que se puede pasar a `filee convert --to`? */
export function esFormatoValido(f) { return ID_FORMATO.test(String(f ?? "")); }

function lista(linea) {
    return linea.split(",").map((x) => x.trim().toLowerCase()).filter((x) => ID_FORMATO.test(x));
}

/** A qué convierte un formato según `filee formats <f>`. Null si no tiene esa forma. */
export function leerDestinos(texto) {
    const lineas = String(texto ?? "").split(/\r?\n/);
    const i = lineas.findIndex((l) => /converts to:\s*$/i.test(l));
    if (i < 0) return null;
    const cab = lineas[i].match(/^\s*(.+?)\s*\(([^)]*)\)\s*converts to:\s*$/i);
    if (!cab) return null;
    const out = { nombre: cab[1].trim(), ids: lista(cab[2]), destinos: [], conMotor: [] };
    let modo = "destinos";
    for (const l of lineas.slice(i + 1)) {
        if (/^\s*with optional engines/i.test(l)) { modo = "conMotor"; continue; }
        if (/converts to:\s*$/i.test(l)) break;
        if (!/^\s+\S/.test(l)) continue;
        for (const f of lista(l)) if (!out[modo].includes(f)) out[modo].push(f);
    }
    out.conMotor = out.conMotor.filter((f) => !out.destinos.includes(f));
    return out;
}

/** Nombre seguro para el disco: sin rutas, sin caracteres raros, con su extensión. */
export function nombreSeguro(nombre) {
    const base = (String(nombre ?? "").split(/[\\/]/).pop() ?? "").normalize("NFC");
    const limpio = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "").slice(-180).trim();
    return limpio || "archivo";
}

/** «Viaje a Oaxaca.HEIC» + «jpg» → «Viaje a Oaxaca.jpg». */
export function nombreDeSalida(nombre, destino) {
    const base = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
    const sinExt = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
    const limpio = sinExt.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim() || "archivo";
    return `${limpio}.${formatoDe(destino) || destino}`;
}

const TIPOS = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
    svg: "image/svg+xml", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", html: "text/html; charset=utf-8",
    json: "application/json", csv: "text/csv; charset=utf-8", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
    m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", zip: "application/zip", glb: "model/gltf-binary",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    epub: "application/epub+zip",
};

/** Tipo MIME de una salida por su extensión. */
export function tipoDe(nombre) { return TIPOS[formatoDe(nombre)] ?? "application/octet-stream"; }

/** Lee el informe JSON de `filee convert --json`. */
export function leerInforme(stdout) {
    const i = String(stdout ?? "").indexOf("{");
    if (i < 0) return null;
    try { return JSON.parse(String(stdout).slice(i)); } catch { return null; }
}

/** ZIP mínimo (método STORE) con varias salidas; válido para Finder, Windows, unzip y 7-Zip. */
export function zipSimple(entradas, ahora = new Date()) {
    const enc = new TextEncoder();
    const fecha = (((Math.max(1980, ahora.getFullYear()) - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate()) & 0xffff;
    const hora = ((ahora.getHours() << 11) | (ahora.getMinutes() << 5) | Math.floor(ahora.getSeconds() / 2)) & 0xffff;
    const partes = [], centrales = [];
    let offset = 0, tamCentral = 0;
    for (const e of entradas) {
        const datos = typeof e.data === "string" ? enc.encode(e.data) : e.data;
        const nombre = enc.encode(String(e.path).replace(/^\/+/, ""));
        const crc = crc32(datos) >>> 0;
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(10, hora, true);
        local.setUint16(12, fecha, true); local.setUint32(14, crc, true); local.setUint32(18, datos.length, true);
        local.setUint32(22, datos.length, true); local.setUint16(26, nombre.length, true);
        const cen = new DataView(new ArrayBuffer(46));
        cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
        cen.setUint16(12, hora, true); cen.setUint16(14, fecha, true); cen.setUint32(16, crc, true);
        cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true); cen.setUint16(28, nombre.length, true);
        cen.setUint32(42, offset, true);
        partes.push(new Uint8Array(local.buffer), nombre, datos);
        centrales.push(new Uint8Array(cen.buffer), nombre);
        offset += 30 + nombre.length + datos.length;
        tamCentral += 46 + nombre.length;
    }
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, entradas.length, true); fin.setUint16(10, entradas.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
    const todos = [...partes, ...centrales, new Uint8Array(fin.buffer)];
    const out = new Uint8Array(todos.reduce((n, p) => n + p.length, 0));
    let p = 0;
    for (const b of todos) { out.set(b, p); p += b.length; }
    return out;
}

const ejecutarReal = (bin, args, opciones) =>
    new Promise((resolve) => {
        execFile(bin, args, { ...opciones, windowsHide: true, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => {
            const code = err && typeof err.code === "number" ? Number(err.code) : err ? 1 : 0;
            resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code });
        });
    });

let ejecutar = ejecutarReal;
let cacheEstado = null;
const cacheDestinos = new Map();
let enCurso = 0;

/** Solo pruebas: sustituye la ejecución de procesos. */
export function _ponerEjecutor(e) {
    ejecutar = e ?? ejecutarReal;
    cacheEstado = null;
    cacheDestinos.clear();
}

function candidatos() {
    const home = os.homedir();
    const enPath = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, "filee"));
    return [
        process.env.FILEE_BIN?.trim(),
        path.join(home, ".local", "bin", "filee"),
        "/opt/homebrew/bin/filee",
        "/usr/local/bin/filee",
        path.join(home, "Applications", "Filee.app", "Contents", "MacOS", "filee-cli"),
        "/Applications/Filee.app/Contents/MacOS/filee-cli",
        ...enPath,
    ].filter(Boolean);
}

async function rutaFilee() {
    for (const c of candidatos()) {
        try {
            await fs.access(c, fsc.X_OK);
            return c;
        } catch { /* siguiente */ }
    }
    return null;
}

/** ¿Hay Filee en esta neurona? (caché 60 s). */
export async function estadoFilee(fresco = false) {
    if (!fresco && cacheEstado && Date.now() - cacheEstado.t < 60_000) return cacheEstado.v;
    const ruta = await rutaFilee();
    let version = null;
    if (ruta) {
        const r = await ejecutar(ruta, ["version"], { timeout: 15_000, maxBuffer: 64 * 1024 });
        const m = r.stdout.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
        version = r.code === 0 && m ? m[1] : null;
    }
    const v = { instalado: Boolean(ruta && version), version, ruta: ruta && version ? ruta : null };
    cacheEstado = { t: Date.now(), v };
    return v;
}

/** A qué convierte un formato en ESTA neurona (`filee formats <f>`, caché 10 min). */
export async function destinosFilee(formatoOArchivo) {
    const f = formatoDe(formatoOArchivo);
    if (!f) return null;
    const hit = cacheDestinos.get(f);
    if (hit && Date.now() - hit.t < 10 * 60_000) return hit.v;
    const est = await estadoFilee();
    if (!est.ruta) return null;
    const r = await ejecutar(est.ruta, ["formats", f], { timeout: 20_000, maxBuffer: 256 * 1024 });
    const v = r.code === 0 ? leerDestinos(r.stdout) : null;
    cacheDestinos.set(f, { t: Date.now(), v });
    return v;
}

/** Convierte unos bytes con Filee. Nunca lanza: devuelve un resultado honesto. */
export async function convertir({ bytes, nombre, a, calidad } = {}) {
    const t0 = Date.now();
    const destino = formatoDe(a);
    if (!esFormatoValido(destino)) return { ok: false, status: 400, motivo: "Formato de destino no válido." };
    if (!bytes?.byteLength) return { ok: false, status: 400, motivo: "El archivo está vacío." };
    if (bytes.byteLength > MAX_BYTES) return { ok: false, status: 413, motivo: `El archivo pasa de ${MAX_BYTES / 1024 / 1024} MB.` };
    const est = await estadoFilee();
    if (!est.ruta) return { ok: false, status: 503, motivo: "Filee no está instalado en esta neurona." };
    if (enCurso >= MAX_SIMULTANEAS) return { ok: false, status: 429, motivo: "Hay otras conversiones en curso; prueba en unos segundos." };
    enCurso++;
    let dir = null;
    try {
        dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "starseed-conversor-")));
        const limpio = nombreSeguro(nombre);
        const origen = path.join(dir, "entrada", limpio);
        const salida = path.join(dir, "salida");
        await fs.mkdir(path.dirname(origen), { recursive: true });
        await fs.mkdir(salida, { recursive: true });
        await fs.writeFile(origen, bytes);
        const args = ["convert", origen, "--to", destino, "-o", salida, "--json", "--overwrite"];
        const q = Number(calidad);
        if (Number.isInteger(q) && q >= 1 && q <= 100) args.push("--quality", String(q));
        const r = await ejecutar(est.ruta, args, { timeout: TIEMPO_MS, maxBuffer: 4 * 1024 * 1024, cwd: dir });
        const inf = leerInforme(r.stdout);
        const fila = inf?.files?.[0];
        if (!inf || !fila) {
            const tarde = Date.now() - t0 >= TIEMPO_MS - 1000;
            const motivo = tarde ? "La conversión tardó demasiado." : (r.stderr.trim().split("\n").pop() || "Filee no devolvió resultado.");
            return { ok: false, status: tarde ? 504 : 422, motivo, ms: Date.now() - t0 };
        }
        if (fila.state !== "done" || !fila.outputs?.length) {
            return { ok: false, status: 422, motivo: fila.error || "Filee no pudo convertir este archivo.", ms: Date.now() - t0 };
        }
        const raiz = path.resolve(salida) + path.sep;
        const salidas = fila.outputs.map((p) => path.resolve(p)).filter((p) => p.startsWith(raiz));
        if (!salidas.length) return { ok: false, status: 422, motivo: "Filee dejó el resultado fuera de su carpeta.", ms: Date.now() - t0 };
        if (salidas.length === 1) {
            const datos = new Uint8Array(await fs.readFile(salidas[0]));
            const final = nombreDeSalida(nombre, path.extname(salidas[0]).slice(1) || destino);
            return { ok: true, nombre: final, bytes: datos, tipo: tipoDe(final), salidas: 1, ms: Date.now() - t0 };
        }
        const entradas = await Promise.all(
            salidas.map(async (p) => ({ path: path.basename(p), data: new Uint8Array(await fs.readFile(p)) })),
        );
        const nombreZip = nombreDeSalida(nombre, "zip").replace(/\.zip$/, `-${destino}.zip`);
        return { ok: true, nombre: nombreZip, bytes: zipSimple(entradas), tipo: "application/zip", salidas: salidas.length, ms: Date.now() - t0 };
    } catch (e) {
        return { ok: false, status: 500, motivo: e instanceof Error ? e.message.slice(0, 200) : "Error al convertir.", ms: Date.now() - t0 };
    } finally {
        enCurso--;
        if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}

/** Cuerpo HTTP del servicio. Sin token solo debe escucharse en 127.0.0.1 (lo decide bin/). */
export function crearApp({ token = "", origenes = [] } = {}) {
    const app = new Hono();
    app.use("*", cors({ origin: (o) => (origenes.includes(o) ? o : ""), allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "OPTIONS"] }));
    app.get("/salud", async (c) => {
        const est = await estadoFilee();
        return c.json({ ok: true, servicio: "conversor", version: VERSION, con_token: Boolean(token), filee: { instalado: est.instalado, version: est.version } });
    });
    if (token) {
        app.use("/formatos", bearerAuth({ token }));
        app.use("/convertir", bearerAuth({ token }));
    }
    app.get("/formatos", async (c) => {
        const est = await estadoFilee();
        const base = { ok: true, filee: { instalado: est.instalado, version: est.version } };
        const de = c.req.query("de");
        if (!de) return c.json(base);
        const f = formatoDe(de);
        if (!f) return c.json({ ...base, error: "Formato no válido." }, 400);
        const destinos = await destinosFilee(f);
        if (!destinos) {
            return c.json({ ...base, de: f, destinos: null, motivo: est.instalado ? "Filee no conoce ese formato." : "Filee no está instalado en esta neurona." }, est.instalado ? 404 : 503);
        }
        return c.json({ ...base, de: f, ...destinos });
    });
    app.post("/convertir", async (c) => {
        // Se corta antes de leer el cuerpo: un envío gigante no debe llenar la memoria de la neurona.
        const declarado = Number(c.req.header("content-length"));
        if (Number.isFinite(declarado) && declarado > MAX_BYTES + 8 * 1024 * 1024) {
            return c.json({ ok: false, motivo: `El archivo pasa de ${MAX_BYTES / 1024 / 1024} MB.` }, 413);
        }
        let cuerpo;
        try {
            cuerpo = await c.req.parseBody();
        } catch {
            return c.json({ ok: false, motivo: "El cuerpo no es un formulario multipart." }, 400);
        }
        const archivo = cuerpo?.archivo;
        if (!archivo || typeof archivo === "string" || typeof archivo.arrayBuffer !== "function") {
            return c.json({ ok: false, motivo: "Falta el archivo." }, 400);
        }
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        const r = await convertir({ bytes, nombre: archivo.name || "archivo", a: String(cuerpo.a ?? ""), calidad: cuerpo.calidad });
        if (!r.ok) return c.json({ ok: false, motivo: r.motivo, ms: r.ms }, r.status ?? 500);
        return c.body(r.bytes, 200, {
            "Content-Type": r.tipo,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.nombre)}`,
            "X-Conversor-Salidas": String(r.salidas),
            "X-Conversor-Ms": String(r.ms),
        });
    });
    return app;
}
