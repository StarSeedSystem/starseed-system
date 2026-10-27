export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";
export type FormatoRare =
  | "arm64.dmg"
  | "x86_64.dmg"
  | "arm64.AppImage"
  | "x86_64.AppImage";

export const TOPE_BYTES = 64 * 1024 * 1024;

export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const recortada = linea.trim();
    if (!recortada || recortada.startsWith("#")) continue;
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(recortada);
    if (!m || !m[2].trim()) continue;
    const huella = m[1].toLowerCase();
    const nombre = m[2].trim();
    if (!sumas.has(nombre)) sumas.set(nombre, huella);
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
  return `Rare-${version}-${formato}`;
}

export function esActivoPermitido(nombre: string): boolean {
  if (nombre.includes("/") || nombre.includes("..") || nombre.includes(" ")) return false;
  if (/^Rare-\d+\.\d+\.\d+\.\d+-(arm64|x86_64)\.(dmg|AppImage)$/.test(nombre)) return true;
  return /^(figcraft|gridcraft|deckcraft)-(web|cli)-\d+\.\d+\.\d+(?:-macos-universal)?\.zip$/.test(nombre);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>,
): Promise<{ ok: boolean; motivo: string }> {
  if (bytes.length > TOPE_BYTES) return { ok: false, motivo: `supera el tope de 64 MB (${bytes.length} bytes)` };
  if (!esActivoPermitido(nombre)) return { ok: false, motivo: `nombre de activo no permitido: ${nombre}` };
  const publicada = sumas.get(nombre);
  if (!publicada) return { ok: false, motivo: `sin huella publicada en SHA256SUMS para ${nombre}` };
  const real = await sha256Hex(bytes);
  if (real !== publicada) {
    return { ok: false, motivo: `huella distinta (${real.slice(0, 8)}…, publicada ${publicada.slice(0, 8)}…)` };
  }
  return { ok: true, motivo: "" };
}

export interface Fijada {
  app: AppArtcraft;
  version: string;
  activo: string;
  sha256: string;
}

export function fijarVersion(
  app: AppArtcraft,
  version: string,
  sumas: Map<string, string>,
): Fijada | null {
  const activo = nombreActivoWeb(app, version);
  const sha256 = sumas.get(activo);
  if (!sha256) return null;
  return { app, version: sinV(version), activo, sha256 };
}

function sinV(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}
