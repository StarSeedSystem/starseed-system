/**
 * Huellas SHA256 de los activos de ArtCraft y Rare (contrato: `architecture/artcraft-y-rare.md` §6).
 * Ningún zip o binario se aloja ni se sirve como origen aparte sin comparar su huella con el
 * `SHA256SUMS.txt` de su release. Módulo PURO: usa `globalThis.crypto.subtle` (navegador, Node 20,
 * vitest); sin `node:*`, sin React, sin red.
 */

export type AppHuellas = "figcraft" | "gridcraft" | "deckcraft";

export type FormatoRare = "arm64.dmg" | "x86_64.dmg" | "arm64.AppImage" | "x86_64.AppImage";

/** Tope de tamaño por activo: más grande se rechaza. */
export const TOPE_ACTIVO_MB = 64;

const TOPE_BYTES = TOPE_ACTIVO_MB * 1024 * 1024;

const RE_LISTA_PERMITIDA = [
  /^(figcraft|gridcraft|deckcraft)-web-\d+(?:\.\d+)*\.zip$/,
  /^(figcraft|gridcraft|deckcraft)-cli-\d+(?:\.\d+)*-macos-universal\.zip$/,
  /^Rare-\d+(?:\.\d+)*-(?:arm64|x86_64)\.(?:dmg|AppImage)$/,
];

export interface VersionFijada {
  app: AppHuellas;
  version: string;
  activo: string;
  sha256: string;
}

const sinV = (version: string): string => version.replace(/^v/, "");

export function nombreActivoWeb(app: AppHuellas, version: string): string {
  return `${app}-web-${sinV(version)}.zip`;
}

export function nombreActivoCli(app: AppHuellas, version: string): string {
  return `${app}-cli-${sinV(version)}-macos-universal.zip`;
}

export function nombreActivoRare(version: string, formato: FormatoRare): string {
  return `Rare-${version}-${formato}`;
}

/** Solo los nombres de los activos por release: nada con `/`, `..` ni espacios. */
export function esActivoPermitido(nombre: string): boolean {
  if (!nombre || nombre.includes("/") || nombre.includes("..") || nombre.includes(" ")) return false;
  return RE_LISTA_PERMITIDA.some((re) => re.test(nombre));
}

/** Lee `<64 hex> [*]<nombre>` con uno o dos espacios; ignora vacías, `#` y huellas mal formadas. */
export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const limpio = linea.trim();
    if (!limpio || limpio.startsWith("#")) continue;
    const m = /^([0-9a-fA-F]{64})[ ]{1,2}\*?(.+)$/.exec(limpio);
    if (!m) continue;
    sumas.set(m[2].trim(), m[1].toLowerCase());
  }
  return sumas;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const corta = (hex: string): string => `${hex.slice(0, 8)}…`;

/** Verifica un activo contra el `SHA256SUMS.txt`: nombre, tope de tamaño y huella. */
export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array<ArrayBuffer>,
  sumas: Map<string, string>,
): Promise<{ ok: boolean; motivo: string }> {
  if (!esActivoPermitido(nombre)) return { ok: false, motivo: `Nombre de activo no permitido: ${nombre}` };
  if (bytes.byteLength > TOPE_BYTES) {
    return { ok: false, motivo: `${nombre} supera el tope de ${TOPE_ACTIVO_MB} MB por activo` };
  }
  const esperada = sumas.get(nombre);
  if (!esperada) return { ok: false, motivo: `Sin huella publicada para ${nombre} en el SHA256SUMS.txt` };
  const calculada = await sha256Hex(bytes);
  if (calculada !== esperada.toLowerCase()) {
    return { ok: false, motivo: `Huella distinta para ${nombre}: publicada ${corta(esperada)}, calculada ${corta(calculada)}` };
  }
  return { ok: true, motivo: `Huella verificada para ${nombre} (${corta(calculada)})` };
}

/** Fija una versión de una Craft App por su zip web; null si el `SHA256SUMS.txt` no la trae. */
export function fijarVersion(app: AppHuellas, version: string, sumas: Map<string, string>): VersionFijada | null {
  const activo = nombreActivoWeb(app, version);
  const sha256 = sumas.get(activo);
  if (!sha256) return null;
  return { app, version: sinV(version), activo, sha256: sha256.toLowerCase() };
}
