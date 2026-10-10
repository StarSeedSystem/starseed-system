// Fichas de máquina (`pd_…`): cómo entran el backend de Astraura, el enjambre, la vigía y
// Genesis. En disco solo se guarda la HUELLA sha256 de cada ficha, nunca la ficha; la ficha se
// enseña una sola vez al crearla (y el guion de la Mac la guarda en ~/.starseed/env sin
// imprimirla). Contrato: architecture/puerta-datos-a1.md §4.1.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, renameSync, statSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export const AMBITOS = Object.freeze(["bus", "latidos", "malla", "astraura", "freno", "metricas", "metagenesis", "admin"]);
const NOMBRE = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function huella(texto) {
  return createHash("sha256").update(String(texto), "utf8").digest("hex");
}

export function generarFicha() {
  return `pd_${randomBytes(32).toString("base64url")}`;
}

export function pareceFicha(t) {
  return typeof t === "string" && /^pd_[A-Za-z0-9_-]{40,60}$/.test(t);
}

function normalizar(crudo) {
  const fichas = [];
  for (const f of Array.isArray(crudo?.fichas) ? crudo.fichas : []) {
    if (!f || !NOMBRE.test(String(f.nombre)) || !/^[0-9a-f]{64}$/.test(String(f.huella))) continue;
    const ambitos = (Array.isArray(f.ambitos) ? f.ambitos : []).filter((a) => AMBITOS.includes(a));
    fichas.push({ nombre: f.nombre, huella: f.huella, ambitos, revocada: Boolean(f.revocada), creada: String(f.creada || "") });
  }
  return { fichas };
}

export function leerArchivoFichas(ruta) {
  try {
    return normalizar(JSON.parse(readFileSync(ruta, "utf8")));
  } catch {
    return { fichas: [] };
  }
}

export function escribirArchivoFichas(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(normalizar(datos), null, 1), { mode: 0o640 });
  chmodSync(tmp, 0o640);
  renameSync(tmp, ruta);
}

/** Alta (o cambio de ámbitos) de una ficha; devuelve la ficha EN CLARO, una sola vez. */
export function nuevaFicha(ruta, nombre, ambitos, ahora = Date.now()) {
  if (!NOMBRE.test(nombre)) throw new Error("nombre de ficha no válido (a-z, 0-9 y guiones)");
  const malos = ambitos.filter((a) => !AMBITOS.includes(a));
  if (malos.length || ambitos.length === 0) throw new Error(`ámbitos no válidos: ${malos.join(",") || "(ninguno)"}`);
  const datos = leerArchivoFichas(ruta);
  const ficha = generarFicha();
  const resto = datos.fichas.filter((f) => f.nombre !== nombre);
  resto.push({ nombre, huella: huella(ficha), ambitos: [...new Set(ambitos)], revocada: false, creada: new Date(ahora).toISOString() });
  escribirArchivoFichas(ruta, { fichas: resto });
  return ficha;
}

export function revocarFicha(ruta, nombre) {
  const datos = leerArchivoFichas(ruta);
  let hubo = false;
  for (const f of datos.fichas) if (f.nombre === nombre) { f.revocada = true; hubo = true; }
  if (hubo) escribirArchivoFichas(ruta, datos);
  return hubo;
}

/** Comprobador con recarga del archivo cuando cambia (cada 30 s como mucho). */
export function crearFichero(ruta, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());
  let datos = { fichas: [] };
  let porHuella = new Map();
  let firma = "";
  let mirado = 0;

  function recargar(forzar = false) {
    if (!forzar && ahora() - mirado < 30_000) return;
    mirado = ahora();
    let f = "";
    try {
      const s = statSync(ruta);
      f = `${s.mtimeMs}:${s.size}`;
    } catch {
      f = "sin-archivo";
    }
    if (!forzar && f === firma) return;
    firma = f;
    datos = leerArchivoFichas(ruta);
    porHuella = new Map(datos.fichas.filter((x) => !x.revocada).map((x) => [x.huella, x]));
  }
  recargar(true);

  return {
    recargar,
    /** @returns {{nombre: string, ambitos: string[]} | null} */
    comprobar(ficha) {
      if (!pareceFicha(ficha)) return null;
      recargar();
      const h = huella(ficha);
      const f = porHuella.get(h);
      if (!f) return null;
      const a = Buffer.from(h, "hex");
      const b = Buffer.from(f.huella, "hex");
      return a.length === b.length && timingSafeEqual(a, b) ? { nombre: f.nombre, ambitos: [...f.ambitos] } : null;
    },
    resumen() {
      recargar();
      return datos.fichas.map((f) => ({ nombre: f.nombre, ambitos: f.ambitos, revocada: f.revocada }));
    },
  };
}
