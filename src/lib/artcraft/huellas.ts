/**
 * ARTCRAFT · HUELLAS SHA256 DE LOS ACTIVOS (Ola 1025C · ART1025M)
 *
 * Contrato: architecture/artcraft-y-rare.md §6. Ningún zip web ni binario de FigCraft,
 * GridCraft, DeckCraft o Rare se aloja ni se sirve como origen aparte sin comprobar su
 * huella contra el «SHA256SUMS.txt» de su release. Descargar no es cosa de este módulo:
 * es PURO —sin red, sin disco, sin procesos, sin `node:*`— y solo da nombres, parseo y
 * comprobación, calculando SHA-256 con `globalThis.crypto.subtle` (navegador, Node 20
 * y vitest). Nunca lanza excepciones: lo que no cuadra devuelve vacío o «no».
 */

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";
export type FormatoRare = "arm64.dmg" | "x86_64.dmg" | "arm64.AppImage" | "x86_64.AppImage";
export type VeredictoActivo = { ok: boolean; motivo: string };
export type VersionFijada = { app: AppArtcraft; version: string; activo: string; sha256: string };

/** Tope de 64 MB por activo: más que eso se rechaza sin calcular una sola huella. */
export const TOPE_ACTIVO_BYTES = 64 * 1024 * 1024;

/** Deja «v0.10.0» en «0.10.0»: la etiqueta de release lleva la v, el nombre del zip no. */
function versionDe(etiqueta: string): string {
  return etiqueta.startsWith("v") ? etiqueta.slice(1) : etiqueta;
}

/** Activo web/WASM alojable como origen aparte: «gridcraft-web-0.11.1.zip». */
export function nombreActivoWeb(app: AppArtcraft, version: string): string {
  return `${app}-web-${versionDe(version)}.zip`;
}

/** Activo de la CLI para macOS universal: «figcraft-cli-0.10.0-macos-universal.zip». */
export function nombreActivoCli(app: AppArtcraft, version: string): string {
  return `${app}-cli-${versionDe(version)}-macos-universal.zip`;
}

/** Activo de Rare: «Rare-1.12.0.237-arm64.dmg». */
export function nombreActivoRare(version: string, formato: FormatoRare): string {
  return `Rare-${versionDe(version)}-${formato}`;
}
const VERSION = "\\d+(?:\\.\\d+)+";
const PATRONES_ACTIVOS: readonly RegExp[] = [
  new RegExp(`^(figcraft|gridcraft|deckcraft)-web-${VERSION}\\.zip$`),
  new RegExp(`^(figcraft|gridcraft|deckcraft)-cli-${VERSION}-macos-universal\\.zip$`),
  new RegExp(`^Rare-${VERSION}-(?:arm64\\.dmg|x86_64\\.dmg|arm64\\.AppImage|x86_64\\.AppImage)$`),
];

/** Solo los activos que este módulo nombra; nunca nada con `/`, `..` ni espacios. */
export function esActivoPermitido(nombre: string): boolean {
  if (nombre.includes("/") || nombre.includes("..") || nombre.includes(" ")) return false;
  return PATRONES_ACTIVOS.some((patron) => patron.test(nombre));
}
type PiezaSuma = { hash: string; nombre: string };

/** Suelta el hash (ya con mayúsculas aceptadas) y el nombre de una línea de SUMS, o null si no cuadra. */
function piezaDeSuma(linea: string): PiezaSuma | null {
  const limpiada = linea.replace(/\s+$/, "");
  if (limpiada.startsWith("#") || limpiada.indexOf(" ") !== 64) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(limpiada.slice(0, 64))) return null;
  let nombre = limpiada.slice(65);
  if (nombre.startsWith(" ")) nombre = nombre.slice(1);
  if (nombre.startsWith("*")) nombre = nombre.slice(1);
  if (!nombre) return null;
  return { hash: limpiada.slice(0, 64), nombre };
}

/**
 * Lee un «SHA256SUMS.txt»: líneas «64 hex» [*]«nombre» con uno o dos espacios y el
 * asterisco opcional de modo binario. Ignora línea vacía, comentarios con «#» y huellas
 * mal formadas. El nombre queda como venga (las minúsculas no se tocan); la huella se
 * normaliza a minúsculas.
 */
export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const pieza = piezaDeSuma(linea);
    if (pieza) sumas.set(pieza.nombre, pieza.hash.toLowerCase());
  }
  return sumas;
}

/** SHA-256 de unos bytes, en hex minúsculas, con `crypto.subtle` (puro, sin `node:crypto`). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digesto = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digesto), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Fija la versión de una Craft App con la huella publicada de su zip web; null si falta o está mal. */
export function fijarVersion(
  app: AppArtcraft,
  version: string,
  sumas: Map<string, string>,
): VersionFijada | null {
  const activo = nombreActivoWeb(app, version);
  const sha256 = sumas.get(activo);
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  return { app, version: versionDe(version), activo, sha256 };
}

/**
 * Comprueba un activo descargado contra el «SHA256SUMS.txt» de su release. El motivo
 * legible nunca repite una huella entera: solo los 8 primeros caracteres de la punta.
 */
export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>,
): Promise<VeredictoActivo> {
  if (!esActivoPermitido(nombre)) return { ok: false, motivo: "nombre no permitido" };
  if (bytes.byteLength > TOPE_ACTIVO_BYTES)
    return { ok: false, motivo: "tamaño superior al tope de 64 MB por activo" };
  const publicada = sumas.get(nombre);
  if (!publicada) return { ok: false, motivo: "sin huella publicada en SHA256SUMS" };
  const calculada = await sha256Hex(bytes);
  if (calculada !== publicada.toLowerCase())
    return {
      ok: false,
      motivo: `huella distinta (calculada ${calculada.slice(0, 8)}…, publicada ${publicada.slice(0, 8)}…)`,
    };
  return { ok: true, motivo: "" };
}
