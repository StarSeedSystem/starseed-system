/**
 * Huellas SHA256 de los activos de ArtCraft y Rare (contrato: `architecture/artcraft-y-rare.md` §6).
 * Ningún zip web ni binario se aloja ni se sirve sin comprobar su huella contra el `SHA256SUMS.txt`
 * de su release. Módulo PURO: usa `globalThis.crypto.subtle` (navegador, Node 20 y vitest); sin
 * `node:*`, sin React, sin red. Tope: 64 MB por activo; más que eso se rechaza.
 */

export const APPS_DOTADOS = ["figcraft", "gridcraft", "deckcraft"] as const;
export type AppDotado = (typeof APPS_DOTADOS)[number];

export const FORMATOS_RARE = [
  "arm64.dmg",
  "x86_64.dmg",
  "arm64.AppImage",
  "x86_64.AppImage",
] as const;
export type FormatoRare = (typeof FORMATOS_RARE)[number];

const HEX64 = /^[0-9a-f]{64}$/;
const TOPE_BYTES = 64 * 1024 * 1024;

const PATRONES_ACTIVO: RegExp[] = [
  /^(figcraft|gridcraft|deckcraft)-web-\d[\d.]*\.zip$/,
  /^(figcraft|gridcraft|deckcraft)-cli-\d[\d.]*-macos-universal\.zip$/,
  /^Rare-\d[\d.]*-(arm64\.dmg|x86_64\.dmg|arm64\.AppImage|x86_64\.AppImage)$/,
];

function quitarV(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

export function nombreActivoWeb(app: AppDotado, version: string): string {
  return `${app}-web-${quitarV(version)}.zip`;
}

export function nombreActivoCli(app: AppDotado, version: string): string {
  return `${app}-cli-${version}-macos-universal.zip`;
}

export function nombreActivoRare(version: string, formato: FormatoRare): string {
  return `Rare-${version}-${formato}`;
}

export function esActivoPermitido(nombre: string): boolean {
  if (!nombre || /[/\s]|\.\./.test(nombre)) return false;
  return PATRONES_ACTIVO.some((patron) => patron.test(nombre));
}

/** Parsea un `SHA256SUMS.txt`: `<64 hex> [cdot]<nombre>` con uno o dos espacios. */
export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const limpio = linea.trim();
    if (!limpio || limpio.startsWith("#")) continue;
    const partes = limpio.match(/^([0-9a-fA-F]{64})[ ]+(\*?)(.+)$/);
    if (!partes) continue;
    sumas.set(partes[3].trim(), partes[1].toLowerCase());
  }
  return sumas;
}

/** Huella SHA-256 en hexadecimal en minúsculas. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  const digesto = await globalThis.crypto.subtle.digest("SHA-256", copia);
  return Array.from(new Uint8Array(digesto), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface VeredictoActivo {
  ok: boolean;
  motivo: string;
}

/** Verifica un activo contra el suyo publicado: nombre, tope de 64 MB y huella. */
export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>,
): Promise<VeredictoActivo> {
  if (!esActivoPermitido(nombre)) return { ok: false, motivo: "nombre de activo no permitido" };
  const publicada = sumas.get(nombre);
  if (!publicada) return { ok: false, motivo: `sin huella publicada para «${nombre}»` };
  if (bytes.length > TOPE_BYTES)
    return { ok: false, motivo: "supera el tope de 64 MB por activo" };
  const calculada = await sha256Hex(bytes);
  if (calculada !== publicada.toLowerCase())
    return {
      ok: false,
      motivo: `huella distinta: calculada «${calculada.slice(0, 8)}», publicada «${publicada.slice(0, 8)}»`,
    };
  return { ok: true, motivo: `huella verificada «${calculada.slice(0, 8)}»` };
}

export interface VersionFijada {
  app: AppDotado;
  version: string;
  activo: string;
  sha256: string;
}

/** Fija la versión de una app por el activo web del `SHA256SUMS.txt`; nada sin huella publicada. */
export function fijarVersion(
  app: AppDotado,
  version: string,
  sumas: Map<string, string>,
): VersionFijada | null {
  const activo = nombreActivoWeb(app, version);
  if (!esActivoPermitido(activo)) return null;
  const sha256 = sumas.get(activo);
  if (!sha256 || !HEX64.test(sha256)) return null;
  return { app, version, activo, sha256 };
}
