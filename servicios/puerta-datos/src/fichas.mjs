// Fichas de máquina (`pd_…`): cómo entran el backend de Astraura, el enjambre, la vigía y
// Genesis. En disco solo se guarda la HUELLA sha256 de cada ficha, nunca la ficha; la ficha se
// enseña una sola vez al crearla (y el guion de la Mac la guarda en ~/.starseed/env sin
// imprimirla). Contrato: architecture/puerta-datos-a1.md §4.1.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chownSync, closeSync, fchmodSync, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

export const AMBITOS = Object.freeze(["bus", "latidos", "malla", "astraura", "freno", "metricas", "metagenesis", "admin", "genesis-mac", "genesis-a1"]);

// GEN1114A · qué abre cada ámbito de Genesis en las rutas nuevas (§8.1). Ni `admin` las abre:
//   · `genesis-mac` (la ficha `genesis-chats-mac`): leer las solicitudes de emparejar, avisar del
//     resultado y publicar el catálogo de chats;
//   · `genesis-a1` (la ficha `genesis-chats-a1`): SOLO leer el catálogo (para el /estado del bot B).
export const PERMISOS_GENESIS = Object.freeze({
  "aparatos.solicitudes": "genesis-mac",
  "aparatos.resultado": "genesis-mac",
  "canon.escribir": "genesis-mac",
  "canon.leer": "genesis-a1",
});
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

// GEN1114A · escritura atómica y conservadora (architecture/astraura-chats-identidad-firma.md §8.1,
// hecho de operaciones 1). `ficha nueva` lanzado como root dejaba tokens.json de root:root 640 y el
// usuario de la puerta no podía leerlo: todas las fichas de máquina fallaron 4 min. Ahora:
//   · el temporal va en el MISMO directorio (el `rename` es atómico y nunca cruza discos);
//   · lleva el dueño, el grupo y el modo del archivo que sustituye (si no existe, 0o640 y los del
//     proceso); si no se puede poner ese dueño o grupo, se para sin tocar el archivo;
//   · `fsync` del temporal antes del `rename` y del directorio después: nunca queda a medias.
// `op` solo sirve a las pruebas: inyectar `chownSync`/`fsyncSync` (sin ser root no se puede cambiar
// el dueño de verdad) y `statSync` para simular el archivo de otro usuario.
export const MODO_FICHAS = 0o640;

export function escribirArchivoFichas(ruta, datos, op = {}) {
  const fs = { chownSync, fsyncSync, statSync, ...op };
  const dir = dirname(ruta);
  mkdirSync(dir, { recursive: true });
  let previo = null;
  try {
    const s = fs.statSync(ruta);
    previo = { uid: s.uid, gid: s.gid, modo: s.mode & 0o7777 };
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
  const modo = previo ? previo.modo : MODO_FICHAS;
  const tmp = join(dir, `.${basename(ruta)}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`);
  const texto = JSON.stringify(normalizar(datos), null, 1);
  let fd = null;
  try {
    // `wx`: nunca se reutiliza ni se sigue un temporal que ya existiera.
    fd = openSync(tmp, "wx", 0o600);
    const buf = Buffer.from(texto, "utf8");
    for (let hecho = 0; hecho < buf.length;) hecho += writeSync(fd, buf, hecho, buf.length - hecho);
    if (previo) {
      const t = fstatSync(fd);
      if (t.uid !== previo.uid || t.gid !== previo.gid) fs.chownSync(tmp, previo.uid, previo.gid);
    }
    fchmodSync(fd, modo);
    fs.fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tmp, ruta);
  } catch (e) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* ya cerrado */
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* no llegó a existir o ya se renombró */
    }
    throw e;
  }
  try {
    const d = openSync(dir, "r");
    try {
      fs.fsyncSync(d);
    } finally {
      closeSync(d);
    }
  } catch {
    /* algunos sistemas no dejan fsync de un directorio: el rename ya es atómico */
  }
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
