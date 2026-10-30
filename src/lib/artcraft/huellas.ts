/**
 * Huellas SHA256 de los activos de ArtCraft y Rare (contrato: `architecture/artcraft-y-rare.md` §6).
 * Módulo PURO: usa `globalThis.crypto.subtle` (navegador, Node 20 y vitest), sin `node:*`, sin React, sin red.
 */
import type { AppArtcraft } from "./politica-tablas";

export const TAMANO_MAXIMO_BYTES = 64 * 1024 * 1024;

const APPS: readonly AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"];
const FORMATOS_RARE = ["arm64.dmg", "x86_64.dmg", "arm64.AppImage", "x86_64.AppImage"] as const;
export type FormatoRare = (typeof FORMATOS_RARE)[number];

const RE_VERSION = "\\d[0-9A-Za-z.+_-]*";
const RE_SUMAS = /^([0-9a-fA-F]{64}) {1,2}\*?(\S.*)$/;
const RE_WEB = new RegExp(`^(${APPS.join("|")})-web-(${RE_VERSION})\\.zip$`);
const RE_CLI = new RegExp(`^(${APPS.join("|")})-cli-(${RE_VERSION})-macos-universal\\.zip$`);
const RE_RARE = new RegExp(
  `^Rare-(${RE_VERSION})-(arm64\\.dmg|x86_64\\.dmg|arm64\\.AppImage|x86_64\\.AppImage)$`,
);

export interface ResultadoVerificacion {
  ok: boolean;
  motivo: string;
}

export interface VersionFijada {
  app: AppArtcraft;
  version: string;
  activo: string;
  sha256: string;
}

/** Versión sin el prefijo `v` (las releases lo llevan, el nombre del activo no). */
export function sinV(version: string): string {
  return version.replace(/^v/, "");
}

export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (limpia === "" || limpia.startsWith("#")) continue;
    const m = RE_SUMAS.exec(limpia);
    if (!m) continue;
    sumas.set(m[2], m[1].toLowerCase());
  }
  return sumas;
}

export function nombreActivoWeb(app: AppArtcraft, version: string): string {
  return `${app}-web-${sinV(version)}.zip`;
}

export function nombreActivoCli(app: AppArtcraft, version: string): string {
  return `${app}-cli-${sinV(version)}-macos-universal.zip`;
}

export function nombreActivoRare(version: string, formato: FormatoRare): string {
  return `Rare-${sinV(version)}-${formato}`;
}

export function esActivoPermitido(nombre: string): boolean {
  if (nombre === "" || /\s|\/|\\/.test(nombre) || nombre.includes("..")) return false;
  return RE_WEB.test(nombre) || RE_CLI.test(nombre) || RE_RARE.test(nombre);
}

function aHex(buffer: ArrayBuffer): string {
  let salida = "";
  for (const byte of new Uint8Array(buffer)) salida += byte.toString(16).padStart(2, "0");
  return salida;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copia = new Uint8Array(bytes.length);
  copia.set(bytes);
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", copia);
  return aHex(resumen);
}

function primeros(huella: string): string {
  return `${huella.slice(0, 8)}…`;
}

export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>,
): Promise<ResultadoVerificacion> {
  if (!esActivoPermitido(nombre)) {
    return { ok: false, motivo: `nombre de activo no permitido: «${nombre}»` };
  }
  if (bytes.length > TAMANO_MAXIMO_BYTES) {
    const mb = (bytes.length / (1024 * 1024)).toFixed(1);
    return { ok: false, motivo: `activo de ${mb} MB supera el tope de 64 MB` };
  }
  const publicada = sumas.get(nombre);
  if (!publicada) {
    return { ok: false, motivo: `sin huella publicada para «${nombre}»` };
  }
  const obtenida = await sha256Hex(bytes);
  if (obtenida !== publicada.toLowerCase()) {
    return {
      ok: false,
      motivo: `huella distinta: publicada ${primeros(publicada)} y obtenida ${primeros(obtenida)}`,
    };
  }
  return { ok: true, motivo: "huella correcta" };
}

export function fijarVersion(
  app: AppArtcraft,
  version: string,
  sumas: Map<string, string>,
): VersionFijada | null {
  const activo = nombreActivoWeb(app, version);
  const sha256 = sumas.get(activo);
  if (!sha256) return null;
  return { app, version: sinV(version), activo, sha256 };
}
