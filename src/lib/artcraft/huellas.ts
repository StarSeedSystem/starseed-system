/**
 * Huellas SHA256 de los activos de ArtCraft y Rare (contrato: `architecture/artcraft-y-rare.md` §6).
 * Ningún zip web ni binario se aloja ni se sirve como origen aparte sin comprobar su huella contra
 * el `SHA256SUMS.txt` de su release. Módulo PURO: usa `globalThis.crypto.subtle`, sin `node:*`, sin React, sin red.
 */

export type AppArtcraftHuella = "figcraft" | "gridcraft" | "deckcraft";

export type FormatoRare = "arm64.dmg" | "x86_64.dmg" | "arm64.AppImage" | "x86_64.AppImage";

export interface VersionFijada {
  app: AppArtcraftHuella;
  version: string;
  activo: string;
  sha256: string;
}

export const TOPE_BYTES_ACTIVO = 64 * 1024 * 1024;

const LINEA_SUMA = /^([0-9a-fA-F]{64}) [ *](\S[^\s]*)$/;

export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const recortada = linea.trim();
    if (recortada === "" || recortada.startsWith("#")) continue;
    const m = LINEA_SUMA.exec(recortada);
    if (!m) continue;
    sumas.set(m[2], m[1].toLowerCase());
  }
  return sumas;
}

function quitarPrefijoV(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

export function nombreActivoWeb(app: AppArtcraftHuella, version: string): string {
  return `${app}-web-${quitarPrefijoV(version)}.zip`;
}

export function nombreActivoCli(app: AppArtcraftHuella, version: string): string {
  return `${app}-cli-${quitarPrefijoV(version)}-macos-universal.zip`;
}

export function nombreActivoRare(version: string, formato: FormatoRare): string {
  return `Rare-${quitarPrefijoV(version)}-${formato}`;
}

const PATRONES_ACTIVO: RegExp[] = [
  /^(figcraft|gridcraft|deckcraft)-web-(v?[0-9][0-9.A-Za-z]*)\.zip$/,
  /^(figcraft|gridcraft|deckcraft)-cli-(v?[0-9][0-9.A-Za-z]*)-macos-universal\.zip$/,
  /^Rare-v?[0-9][0-9.A-Za-z]*-(arm64|x86_64)\.(dmg|AppImage)$/,
];

export function esActivoPermitido(nombre: string): boolean {
  if (nombre.includes("/") || nombre.includes("..") || /\s/.test(nombre)) return false;
  return PATRONES_ACTIVO.some((p) => p.test(nombre));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface VeredictoActivo {
  ok: boolean;
  motivo: string;
}

export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>,
): Promise<VeredictoActivo> {
  if (!esActivoPermitido(nombre)) return { ok: false, motivo: `nombre de activo no permitido: «${nombre}»` };
  if (bytes.length > TOPE_BYTES_ACTIVO)
    return { ok: false, motivo: `activo «${nombre}» supera el tope de 64 MB (${bytes.length} bytes)` };
  const publicada = sumas.get(nombre);
  if (!publicada) return { ok: false, motivo: `sin huella publicada para «${nombre}» en el SHA256SUMS` };
  const calculada = await sha256Hex(bytes);
  if (calculada !== publicada)
    return { ok: false, motivo: `huella distinta: esperada ${publicada.slice(0, 8)}…, calculada ${calculada.slice(0, 8)}…` };
  return { ok: true, motivo: `huella verificada: ${publicada.slice(0, 8)}…` };
}

export async function fijarVersion(
  app: AppArtcraftHuella,
  version: string,
  sumas: Map<string, string>,
): Promise<VersionFijada | null> {
  const activo = nombreActivoWeb(app, version);
  if (!esActivoPermitido(activo)) return null;
  const sha256 = sumas.get(activo);
  if (!sha256) return null;
  return { app, version: quitarPrefijoV(version), activo, sha256 };
}
