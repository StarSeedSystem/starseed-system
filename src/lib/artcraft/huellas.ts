/**
 * Huellas SHA256 de los activos de ArtCraft y Rare (pura).
 */
export type AppArtCraft = "figcraft" | "gridcraft" | "deckcraft";

export type FormatoRare =
  | "arm64.dmg"
  | "x86_64.dmg"
  | "arm64.AppImage"
  | "x86_64.AppImage";

const MAX_BYTES = 64 * 1024 * 1024;

export function parseSha256Sums(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const lineas = texto.split(/\r?\n/);
  for (const linea of lineas) {
    if (!linea) continue;
    const limpia = linea.trim();
    if (!limpia) continue;
    if (limpia.startsWith("#")) continue;
    const m = limpia.match(/^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/);
    if (!m) continue;
    const hash = m[1].toLowerCase();
    const nombre = m[2].trim();
    if (!nombre) continue;
    mapa.set(nombre, hash);
  }
  return mapa;
}

export function nombreActivoWeb(app: AppArtCraft, version: string): string {
  const v = version.startsWith("v") ? version.slice(1) : version;
  return `${app}-web-${v}.zip`;
}

export function nombreActivoCli(app: AppArtCraft, version: string): string {
  const v = version.startsWith("v") ? version.slice(1) : version;
  return `${app}-cli-${v}-macos-universal.zip`;
}

export function nombreActivoRare(
  version: string,
  formato: FormatoRare
): string {
  const v = version.startsWith("v") ? version.slice(1) : version;
  return `Rare-${v}-${formato}`;
}

export function esActivoPermitido(nombre: string): boolean {
  if (!nombre) return false;
  if (nombre.includes("/") || nombre.includes("\\") || nombre.includes("..")) {
    return false;
  }
  if (/\s/.test(nombre)) return false;
  if (nombre.startsWith(".")) return false;
  if (/^(figcraft|gridcraft|deckcraft)-(web|cli)-[0-9][0-9A-Za-z.+-]*\.(zip)$/.test(nombre)) {
    if (nombre.includes("-cli-")) {
      return /-(cli)-[0-9][0-9A-Za-z.+-]*-macos-universal\.zip$/.test(nombre);
    }
    return true;
  }
  if (/^Rare-[0-9][0-9A-Za-z.+-]*-(arm64\.dmg|x86_64\.dmg|arm64\.AppImage|x86_64\.AppImage)$/.test(nombre)) {
    return true;
  }
  return false;
}

function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).padStart(2, "0");
    hex += h;
  }
  return hex;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("crypto.subtle no disponible");
  }
  // Aseguramos ArrayBuffer copiando si hace falta
  const data = new Uint8Array(bytes);
  const buf = await subtle.digest("SHA-256", data);
  return bytesToHex(buf);
}

export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>
): Promise<{ ok: boolean; motivo: string }> {
  if (!esActivoPermitido(nombre)) {
    return { ok: false, motivo: "activo no permitido" };
  }
  if (bytes.length > MAX_BYTES) {
    return { ok: false, motivo: "tamaño excesivo" };
  }
  const esperada = sumas.get(nombre);
  if (!esperada) {
    return { ok: false, motivo: "sin huella publicada" };
  }
  const calc = await sha256Hex(bytes);
  if (calc !== esperada.toLowerCase()) {
    const pref = calc.slice(0, 8);
    return { ok: false, motivo: `huella distinta (${pref})` };
  }
  return { ok: true, motivo: "ok" };
}

export function fijarVersion(
  app: AppArtCraft,
  version: string,
  sumas: Map<string, string>
): { app: AppArtCraft; version: string; activo: string; sha256: string } | null {
  const activo = nombreActivoWeb(app, version);
  if (!esActivoPermitido(activo)) {
    return null;
  }
  const sha256 = sumas.get(activo);
  if (!sha256) {
    return null;
  }
  return { app, version: version.startsWith("v") ? version.slice(1) : version, activo, sha256: sha256.toLowerCase() };
}




