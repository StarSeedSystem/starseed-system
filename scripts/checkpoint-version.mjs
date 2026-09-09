#!/usr/bin/env node
// scripts/checkpoint-version.mjs — Sella la versión del OS en TODOS los medios
// a la vez (Ola 303 · zV5). Se ejecuta al completar una tarea u ola, ANTES de
// publicar: `node scripts/checkpoint-version.mjs [--version AAAA.MM.DD]
// [--notas "…"] [--seco]`. Es de mantenimiento: NO se importa desde src/ ni
// entra en el paquete de la app. Si un medio falta o no encaja su patrón,
// falla con código 1 y un mensaje claro; jamás deja medios a medias en silencio.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Utilidades de CLI ────────────────────────────────────────────────────
export function parsearArgs(argv) {
  const args = { version: null, notas: null, seco: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seco") args.seco = true;
    else if (a === "--version") args.version = argv[++i];
    else if (a.startsWith("--version=")) args.version = a.slice("--version=".length);
    else if (a === "--notas") args.notas = argv[++i];
    else if (a.startsWith("--notas=")) args.notas = a.slice("--notas=".length);
    else if (a === "--ayuda" || a === "-h") args.ayuda = true;
    else return { ...args, error: `Argumento desconocido: ${a}` };
  }
  return args;
}

/** Fecha de HOY en formato AAAA.MM.DD (hora local de la neurona). */
export function fechaHoy() {
  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}.${mm}.${dd}`;
}

/** Valida el formato AAAA.MM.DD y que sea una fecha real. */
export function esVersionValida(v) {
  if (typeof v !== "string" || !/^\d{4}\.\d{2}\.\d{2}$/.test(v)) return false;
  const [anio, mes, dia] = v.split(".").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

// ── Reemplazos quirúrgicos sobre src/lib/version/os-release.ts ───────────
/** Reescribe UNA constante exportada del módulo os-release.ts por regex. */
export function reemplazarConstante(fuente, nombre, valorNuevo) {
  // Quirúrgico: solo la declaración de ESA constante, nada más. El patrón
  // cubre literales de una línea ("OS_VERSION = "…";") y la OS_NOTAS
  // multilinea (cadena partida que cierra en ";). Escape de comillas y $
  // en el reemplazo para no romper el literal.
  const valor = String(valorNuevo).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "$$$$");
  const patron = new RegExp(`(export const ${nombre} =\\s*(?:"[^"\\n]*(?:\\\\.[^"\\n]*)*)+;)`);
  const coincidencia = fuente.match(patron);
  if (!coincidencia) return null;
  return fuente.replace(patron, `export const ${nombre} = "${valor}";`);
}

// ── package.json ─────────────────────────────────────────────────────────
/** Sube la versión de package.json (AAAA.MM.DD → X.Y.Z creciente) sin reordenar claves. */
export function sellarPackageJson(texto, version) {
  // Se reescribe el JSON con indentación 2 (JSON.stringify(obj, null, 2)
  // preserva el orden de inserción de las claves) y solo se toca "version".
  // El mapeo AAAA.MM.DD → X.Y.Z: patch = nº de días del año de la versión,
  // así cada checkpoint sube monótonamente y el formato sigue semver.
  const datos = JSON.parse(texto);
  const [anio, mes, dia] = version.split(".").map(Number);
  const inicioAnio = Date.UTC(anio, 0, 1);
  const diaDelAnio = Math.round((Date.UTC(anio, mes - 1, dia) - inicioAnio) / 86400000) + 1;
  const menor = String(diaDelAnio).padStart(2, "0");
  return JSON.stringify(datos, null, 2).replace(
    /^(\s*)"version": ".*"$/m,
    `$1"version": "${anio}.${mes - 1 < 10 ? "0" + (mes - 1) : mes - 1}.${menor}"`,
  );
}

/** Sella OS_VERSION, OS_FECHA y OS_NOTAS en os-release.ts (sin regenerarlo). */
export function sellarOsRelease(fuente, version, notas) {
  const yyyy = version.slice(0, 4);
  const mm = version.slice(5, 7);
  const dd = version.slice(8, 10);
  let salida = reemplazarConstante(fuente, "OS_VERSION", version);
  salida = reemplazarConstante(salida, "OS_FECHA", `${yyyy}-${mm}-${dd}`);
  if (notas) salida = reemplazarConstante(salida, "OS_NOTAS", notas);
  return salida;
}

// ── Punto de entrada ─────────────────────────────────────────────────────
function main() {
  // completado en el siguiente trozo
}

main();
