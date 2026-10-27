// Huellas SHA256 de los activos de ArtCraft y Rare (contrato §6).
// Módulo PURO: sin `node:*`, sin red y sin disco. Usa WebCrypto
// (`globalThis.crypto.subtle`), disponible en navegador, Node 20 y vitest.

export const TAMANO_MAXIMO_ACTIVO = 64 * 1024 * 1024;

export type AppArtCraft = "figcraft" | "gridcraft" | "deckcraft";

export type FormatoRare = "arm64.dmg" | "x86_64.dmg" | "arm64.AppImage" | "x86_64.AppImage";

export interface ActivoFijado {
  app: AppArtCraft;
  version: string;
  activo: string;
  sha256: string;
}

const LINEA_SUMS = /^([0-9a-fA-F]{64}) {1,2}\*?(.+)$/;
const VERSION = "[0-9A-Za-z][0-9A-Za-z.+-]*";
const ACTIVO_WEB = new RegExp(`^(figcraft|gridcraft|deckcraft)-web-${VERSION}\\.zip$`);
const ACTIVO_CLI = new RegExp(
  `^(figcraft|gridcraft|deckcraft)-cli-${VERSION}-macos-universal\\.zip$`,
);
const ACTIVO_RARE = new RegExp(`^Rare-${VERSION}-(?:arm64|x86_64)\\.(?:dmg|AppImage)$`);

export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (limpia === "" || limpia.startsWith("#")) continue;
    const coincidencia = LINEA_SUMS.exec(linea);
    if (!coincidencia) continue;
    const [, huella, nombre] = coincidencia;
    if (nombre.trim() === "") continue;
    sumas.set(nombre, huella.toLowerCase());
  }
  return sumas;
}

function sinV(version: string): string {
  return version.replace(/^[vV]/, "");
}

export function nombreActivoWeb(app: AppArtCraft, version: string): string {
  return `${app}-web-${sinV(version)}.zip`;
}

export function nombreActivoCli(app: AppArtCraft, version: string): string {
  return `${app}-cli-${sinV(version)}-macos-universal.zip`;
}

export function nombreActivoRare(version: string, formato: FormatoRare): string {
  return `Rare-${sinV(version)}-${formato}`;
}

export function esActivoPermitido(nombre: string): boolean {
  if (
    nombre === "" ||
    nombre.includes("/") ||
    nombre.includes("\\") ||
    nombre.includes("..") ||
    /\s/.test(nombre)
  ) {
    return false;
  }
  return ACTIVO_WEB.test(nombre) || ACTIVO_CLI.test(nombre) || ACTIVO_RARE.test(nombre);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copia = new Uint8Array(bytes);
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", copia);
  return Array.from(new Uint8Array(resumen), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>,
): Promise<{ ok: boolean; motivo: string }> {
  if (!esActivoPermitido(nombre)) {
    return { ok: false, motivo: "El activo no está permitido." };
  }
  if (bytes.byteLength > TAMANO_MAXIMO_ACTIVO) {
    return {
      ok: false,
      motivo: `El activo supera el tope de ${TAMANO_MAXIMO_ACTIVO} bytes.`,
    };
  }
  const esperada = sumas.get(nombre);
  if (!esperada) {
    return { ok: false, motivo: "No hay huella publicada para este activo." };
  }
  const obtenida = await sha256Hex(bytes);
  if (obtenida !== esperada.toLowerCase()) {
    return {
      ok: false,
      motivo: `La huella no coincide: esperada ${esperada.slice(0, 8)}…, obtenida ${obtenida.slice(0, 8)}…`,
    };
  }
  return { ok: true, motivo: "Huella verificada." };
}

export function fijarVersion(
  app: AppArtCraft,
  version: string,
  sumas: Map<string, string>,
): ActivoFijado | null {
  const limpia = sinV(version);
  const activo = nombreActivoWeb(app, limpia);
  const sha256 = sumas.get(activo);
  if (!sha256) return null;
  return { app, version: limpia, activo, sha256 };
}
