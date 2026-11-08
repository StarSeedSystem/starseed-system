/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108A · 2026-11-08) Canal de pruebas de las apps nativas — lógica PURA de la web.
 * Contrato: architecture/centro-versiones-1105.md §9.
 *
 * Una app instalada está en el canal de pruebas si su versión lleva «-prueba.» (0.5.1-prueba.23). Esa
 * app mira la prerelease fija `canal-pruebas` (latest-prueba.json / latest-prueba-android.json) Y lo
 * oficial, y se queda con lo más nuevo por semver: 0.5.0 < 0.5.1-prueba.23 < 0.5.1. Una app oficial
 * nunca ve el canal de pruebas. Lo mismo decide Rust (canal_actualizacion_logica.rs).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { esVersionMasNueva, esVersionSemver } from "@/lib/version/os-release";

export const MARCA_PRUEBA = "-prueba.";
export const ETIQUETA_PRUEBAS = "canal-pruebas";
const BASE = "https://github.com/StarSeedSystem/starseed-system/releases/download";
export const URL_MANIFIESTO_PRUEBAS = `${BASE}/${ETIQUETA_PRUEBAS}/latest-prueba.json`;
export const URL_MANIFIESTO_PRUEBAS_ANDROID = `${BASE}/${ETIQUETA_PRUEBAS}/latest-prueba-android.json`;
/** Solo se aceptan APK de los Releases del repositorio (lo mismo que comprueban Rust y Kotlin). */
export const PREFIJO_DESCARGAS = `${BASE}/`;

export type Canal = "oficial" | "pruebas";

/** El APK del canal de pruebas (latest-prueba-android.json, saneado). */
export interface ApkPruebas {
  version: string;
  versionCode: number;
  apk: string;
  sha256: string;
  bytes: number | null;
  notas: string;
}

/** Lo que `/api/os/versiones` cuenta del canal de pruebas (`canalPruebas`). */
export interface CanalPruebas {
  /** Versión de escritorio (latest-prueba.json); null si aún no hay. */
  version: string | null;
  fecha: string;
  notas: string;
  android: ApkPruebas | null;
}

/** ¿Es una versión del canal de pruebas? Pura. */
export function esVersionDePrueba(v: string | null | undefined): boolean {
  const s = String(v ?? "").trim().replace(/^v/i, "");
  return s.includes(MARCA_PRUEBA) && esVersionSemver(s);
}

/** Canal de una versión instalada. Pura. */
export function canalDe(v: string | null | undefined): Canal {
  return esVersionDePrueba(v) ? "pruebas" : "oficial";
}

/** «Canal de pruebas · 0.5.1-prueba.23» (null si no es de pruebas). Pura. */
export function etiquetaCanal(v: string | null | undefined): string | null {
  if (!esVersionDePrueba(v)) return null;
  return `Canal de pruebas · ${String(v).trim().replace(/^v/i, "")}`;
}

const texto = (x: unknown, max = 4000): string => (typeof x === "string" ? x.trim().slice(0, max) : "");

/** latest-prueba-android.json → ApkPruebas, o null si no vale. Pura. */
export function sanearApkPruebas(x: unknown): ApkPruebas | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const version = texto(o.version, 80).replace(/^v/i, "");
  const versionCode = typeof o.versionCode === "number" && Number.isInteger(o.versionCode) && o.versionCode > 0 ? o.versionCode : null;
  const apk = texto(o.apk, 600);
  const sha256 = texto(o.sha256, 80).toLowerCase();
  if (!esVersionSemver(version) || versionCode === null || !apk.startsWith(PREFIJO_DESCARGAS) || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  const bytes = typeof o.bytes === "number" && o.bytes > 0 ? o.bytes : null;
  return { version, versionCode, apk, sha256, bytes, notas: texto(o.notas) };
}

/** latest-prueba.json (+ el de Android) → CanalPruebas, o null si no hay nada que valga. Pura. */
export function sanearCanalPruebas(escritorio: unknown, android: unknown): CanalPruebas | null {
  const e = escritorio && typeof escritorio === "object" && !Array.isArray(escritorio) ? (escritorio as Record<string, unknown>) : null;
  const vE = texto(e?.version, 80).replace(/^v/i, "");
  const version = esVersionSemver(vE) ? vE : null;
  const apk = sanearApkPruebas(android);
  if (!version && !apk) return null;
  const fecha = texto(e?.pub_date, 40).slice(0, 10);
  return { version, fecha, notas: version ? texto(e?.notes) : (apk?.notas ?? ""), android: apk };
}

/** `canalPruebas` tal como lo devuelve `/api/os/versiones` (ya saneado allí) → CanalPruebas. Pura. */
export function canalPruebasDesdeApi(x: unknown): CanalPruebas | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const v = typeof o.version === "string" ? o.version : null;
  return sanearCanalPruebas(v ? { version: v, pub_date: o.fecha, notes: o.notas } : null, o.android);
}

/** Lo que se ofrecería a ESTA app (la versión nueva y de qué canal), sin decidir aún la ventana. */
export interface Elegida {
  version: string | null;
  canal: Canal;
  fecha: string;
  notas: string;
  /** Android: el .apk de esa versión (null si no hay o no es Android). */
  apk: string | null;
}

export interface EntradaElegir {
  medio: "escritorio" | "android" | string;
  instalada: string;
  oficial: { version: string; fecha: string; notas: string; apk: string | null } | null;
  pruebas: CanalPruebas | null;
}

/**
 * ¿Qué versión publicada cuenta para esta app? Una app oficial: la oficial. Una de pruebas: la mayor
 * (por semver) entre la oficial y la de su canal (en Android, la del APK de pruebas). Pura.
 */
export function elegirPublicada(e: EntradaElegir): Elegida {
  const oficial: Elegida = e.oficial
    ? { version: e.oficial.version.replace(/^v/i, ""), canal: "oficial", fecha: e.oficial.fecha, notas: e.oficial.notas, apk: e.oficial.apk }
    : { version: null, canal: "oficial", fecha: "", notas: "", apk: null };
  if (!esVersionDePrueba(e.instalada) || !e.pruebas) return oficial;
  const p = e.pruebas;
  const deAndroid = e.medio === "android";
  const vP = deAndroid ? (p.android?.version ?? null) : p.version;
  if (!vP || !esVersionSemver(vP)) return oficial;
  const gana = !oficial.version || !esVersionSemver(oficial.version) || esVersionMasNueva(vP, oficial.version);
  if (!gana) return oficial;
  return {
    version: vP,
    canal: "pruebas",
    fecha: p.fecha,
    notas: deAndroid ? (p.android?.notas || p.notas) : p.notas,
    apk: deAndroid ? (p.android?.apk ?? null) : null,
  };
}
