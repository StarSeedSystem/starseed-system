/** Módulo puro de huellas SHA256 para activos ArtCraft y Rare (art §6). */
import type { Map } from "";

export function parseSha256Sums(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linea of texto.split("\n")) {
    if (!linea.trim() || linea.startsWith("#")) continue;
    const match = linea.match(/^([0-9a-f]{64})[ ]{1,2}(.+)$/i);
    if (!match) continue;
    const hash = match[1].toLowerCase();
    const nombre = match[2].trim();
    mapa.set(nombre, hash);
  }
  return mapa;
}

export function nombreActivoWeb(app: "figcraft" | "gridcraft" | "deckcraft", version: string): string {
  const ver = version.startsWith("v") ? version.slice(1) : version;
  return `${app}-web-${ver}.zip`;
}

export function nombreActivoCli(app: string, version: string): string {
  const ver = version.startsWith("v") ? version.slice(1) : version;
  return `${app}-cli-${ver}-macos-universal.zip`;
}

export function nombreActivoRare(
  version: string,
  formato: "arm64.dmg" | "x86_64.dmg" | "arm64.AppImage" | "x86_64.AppImage"
): string {
  return `Rare-${version}-${formato}`;
}

export function esActivoPermitido(nombre: string): boolean {
  if (nombre.includes("/") || nombre.includes("..") || nombre.includes(" ")) return false;
  const permitidos = [
    "figcraft-web-",
    "gridcraft-web-",
    "deckcraft-web-",
    "figcraft-cli-",
    "gridcraft-cli-",
    "deckcraft-cli-",
    "Rare-",
  ];
  return permitidos.some((p) => nombre.startsWith(p));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(buffer));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>
): Promise<{ ok: boolean; motivo: string }> {
  if (!esActivoPermitido(nombre)) {
    const h = await sha256Hex(bytes);
    return { ok: false, motivo: `nombre no permitido: ${h.slice(0, 8)}` };
  }
  const hash = await sha256Hex(bytes);
  const esperado = sumas.get(nombre);
  if (!esperado) {
    return { ok: false, motivo: `sin huella publicada: ${hash.slice(0, 8)}` };
  }
  if (hash !== esperado) {
    return { ok: false, motivo: `huella distinta: ${hash.slice(0, 8)}` };
  }
  return { ok: true, motivo: "" };
}

export function fijarVersion(
  app: "figcraft" | "gridcraft" | "deckcraft",
  version: string,
  sumas: Map<string, string>
): { app: string; version: string; activo: string; sha256: string } | null {
  const activo = nombreActivoWeb(app, version);
  const sha = sumas.get(activo);
  if (!sha) return null;
  return { app, version, activo, sha256: sha };
}