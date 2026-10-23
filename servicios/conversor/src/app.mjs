/** Conversor por la malla — servicio Hono en 4481. */
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { cors } from "hono/cors";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const VERSION = "1.0.0";
export const MAX_BYTES = 500 * 1024 * 1024;
export const TIEMPO_MS = 15 * 60 * 1000;
export const MAX_SIMULTANEAS = 2;
export const DESTINOS_HABITUALES = [
  "pdf", "docx", "png", "jpg", "webp", "txt", "md", "html", "epub",
  "mp4", "webm", "gif", "mp3", "m4a", "wav", "csv", "xlsx", "json",
  "svg", "glb", "zip", "avif", "heic", "pptx",
];

const ID_FORMATO = /^[a-z0-9][a-z0-9+_-]{0,15}$/;
export function formatoDe(entrada) {
  const crudo = String(entrada ?? "").trim().toLowerCase();
  if (!crudo) return "";
  let f = crudo;
  if (f.includes("/") && !f.includes(".")) f = f.split("/").pop() ?? "";
  else if (f.includes(".")) f = f.slice(f.lastIndexOf(".") + 1);
  f = f.replace(/^x-/, "").replace(/\+.*$/, "").replace(/[?#].*$/, "");
  const ALIAS = { jpeg: "jpg", jpe: "jpg", jfif: "jpg", tif: "tiff", htm: "html", markdown: "md", yml: "yaml" };
  f = ALIAS[f] ?? f;
  return ID_FORMATO.test(f) ? f : "";
}
export function esFormatoValido(f) { return ID_FORMATO.test(String(f ?? "")); }
export function etiquetaFormato(f) {
  const esp = { md: "Markdown", txt: "Texto", html: "HTML (web)", pdf: "PDF", docx: "DOCX", png: "PNG", jpg: "JPG" };
  return esp[f] ?? f.toUpperCase();
}
export function nombreDeSalida(nombre, destino) {
  const base = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
  const sinExt = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  const limpio = sinExt.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim() || "archivo";
  return `${limpio}.${formatoDe(destino) || destino}`;
}
let enCurso = 0;
export function crearApp({ token = "", origenes = [] } = {}) {
  const app = new Hono();
  app.use("*", cors({ origin: (o) => (origenes.includes(o) ? o : ""), allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "OPTIONS"] }));
  app.get("/salud", (c) => c.json({ ok: true, servicio: "conversor", version: VERSION, con_token: Boolean(token) }));
  if (token) {
    app.use("/*", bearerAuth({ token }));
  }
  app.get("/formatos", async (c) => {
    const de = c.req.query("de") || "";
    const f = formatoDe(de);
    // Intento de lectura real desde filee (si está en PATH)
    try {
      const bin = "filee";
      const r = await new Promise((res) => {
        execFile(bin, ["formats", f || "md"], { timeout: 5000, maxBuffer: 256 * 1024, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => {
          res({ stdout: stdout || "", stderr: stderr || "", code: err ? (err.code || 1) : 0 });
        });
      });
      // Si no hay filee real, devolvemos una lista de destinos por defecto
      const destinos = f ? DESTINOS_HABITUALES.filter((d) => d !== f) : DESTINOS_HABITUALES.slice(0, 8);
      return c.json({ de: f || "", disponibles: destinos.map((d) => ({ id: d, etiqueta: etiquetaFormato(d) })), fuente: r.code === 0 ? "filee" : "por_defecto" });
    } catch {
      const destinos = f ? DESTINOS_HABITUALES.filter((d) => d !== f) : DESTINOS_HABITUALES.slice(0, 8);
      return c.json({ de: f || "", disponibles: destinos.map((d) => ({ id: d, etiqueta: etiquetaFormato(d) })), fuente: "por_defecto" });
    }
  });
  app.post("/convertir", async (c) => {
    if (enCurso >= MAX_SIMULTANEAS) return c.json({ ok: false, status: 429, motivo: "Ocupado", ms: 0 }, 429);
    try {
      const cuerpo = await c.req.parseBody();
      const archivo = cuerpo.archivo;
      const a = String(cuerpo.a ?? "");
      const calidadRaw = cuerpo.calidad ?? cuerpo["calidad"];
      const calidad = calidadRaw !== undefined ? Number(calidadRaw) : null;
      const fDest = formatoDe(a);
      if (!esFormatoValido(fDest)) return c.json({ ok: false, status: 400, motivo: "Formato destino no válido" }, 400);
      if (!archivo) return c.json({ ok: false, status: 400, motivo: "Falta archivo" }, 400);
      let bytes; let nombreOriginal = "archivo";
      if (archivo && typeof archivo === "object" && archivo.arrayBuffer) { nombreOriginal = archivo.name || "archivo"; bytes = new Uint8Array(await archivo.arrayBuffer()); }
      else if (typeof archivo === "string") { bytes = new Uint8Array(Buffer.from(archivo, "base64")); nombreOriginal = String(cuerpo.nombre ?? "archivo"); }
      else return c.json({ ok: false, status: 400, motivo: "Archivo no reconocido" }, 400);
      if (!bytes || !bytes.byteLength) return c.json({ ok: false, status: 400, motivo: "Archivo vacío" }, 400);
      if (bytes.byteLength > MAX_BYTES) return c.json({ ok: false, status: 413, motivo: `Archivo > ${MAX_BYTES / (1024 * 1024)} MB` }, 413);
      const limpio = (nombreOriginal.split(/[\\/]/).pop() ?? "archivo").replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(-180).trim() || "archivo";
      enCurso++;
      const dirTemp = await fs.mkdtemp(path.join(os.tmpdir(), "starseed-filee-"));
      try {
        await fs.mkdir(path.join(dirTemp, "entrada"), { recursive: true });
        await fs.mkdir(path.join(dirTemp, "salida"), { recursive: true });
        await fs.writeFile(path.join(dirTemp, "entrada", limpio), Buffer.from(bytes));
        const args = ["convert", path.join(dirTemp, "entrada", limpio), "--to", fDest, "-o", path.join(dirTemp, "salida"), "--json", "--overwrite"];
        if (Number.isInteger(calidad) && calidad >= 1 && calidad <= 100) args.push("--quality", String(calidad));
        const r = await new Promise((res) => { execFile("filee", args, { timeout: TIEMPO_MS, maxBuffer: 4 * 1024 * 1024, cwd: dirTemp, env: { ...process.env, NO_COLOR: "1" } }, (e, so, se) => res({ stdout: so || "", stderr: se || "", code: e ? (e.code || 1) : 0 })); });
        const informe = (() => { try { const i = r.stdout.indexOf("{"); return i < 0 ? null : JSON.parse(r.stdout.slice(i)); } catch { return null; } })();
        const fila = informe?.files?.[0];
        if (!informe || !fila) return c.json({ ok: false, status: 422, motivo: r.stderr.trim().split("\n").pop() || "Sin resultado" }, 422);
        if (fila.state !== "done" || !fila.outputs?.length) return c.json({ ok: false, status: 422, motivo: fila.error || "Filee falló" }, 422);
        const raiz = path.resolve(path.join(dirTemp, "salida")) + path.sep;
        const salidas = fila.outputs.map((p) => path.resolve(p)).filter((p) => p.startsWith(raiz));
        if (!salidas.length) return c.json({ ok: false, status: 422, motivo: "Salida fuera de carpeta" }, 422);
        if (salidas.length === 1) {
          const datos = await fs.readFile(salidas[0]);
          const byteSalida = new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
          const final = nombreDeSalida(limpio, path.extname(salidas[0]).slice(1) || fDest);
          return c.json({ ok: true, nombre: final, bytes: Buffer.from(byteSalida).toString("base64"), tipo: "application/octet-stream", salidas: 1 });
        }
        return c.json({ ok: true, salidas: salidas.length, mensaje: "Conversión multi-archivo" });
      } finally {
        enCurso--;
        await fs.rm(dirTemp, { recursive: true, force: true }).catch(() => undefined);
      }
    } catch (e) {
      return c.json({ ok: false, status: 500, motivo: e instanceof Error ? e.message.slice(0, 200) : "Error" }, 500);
    }
  });
  return app;
}
