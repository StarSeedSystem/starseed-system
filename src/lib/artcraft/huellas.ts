// src/lib/artcraft/huellas.ts
// ─────────────────────────────────────────────────────────────────────────────
// HUELLAS SHA256 DE LOS ACTIVOS DE ARTCRAFT Y RARE (artcraft-y-rare.md §6).
//
// Ningún zip web ni binario se aloja ni se sirve como origen aparte sin
// comprobar su huella contra el `SHA256SUMS.txt` de su release. Una versión
// nueva nunca se fija sola: `fijarVersion` devuelve null sin huella publicada.
//
// Módulo PURO: sin `node:*`, sin red, sin disco, sin procesos; el digesto sale
// de `globalThis.crypto.subtle` (navegador, Node 20 y vitest). Los motivos de
// `verificarActivo` nunca repiten una huella completa, solo sus 8 primeros
// caracteres (los registros del OS no deben parecer claves).
// ─────────────────────────────────────────────────────────────────────────────

/** Apps de ArtCraft con build web y CLI. */
export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";
/** Binarios que publica Rare para macOS y Linux. */
export type FormatoRare = "arm64.dmg" | "x86_64.dmg" | "arm64.AppImage" | "x86_64.AppImage";
/** Resultado de verificar un activo contra su SHA256SUMS. */
export type VerificacionActivo = { ok: boolean; motivo: string };
/** Versión fijada para alojarse: el zip web y su huella publicada. */
export type VersionFijada = { app: AppArtcraft; version: string; activo: string; sha256: string };
/** Tope por activo: 64 MB (más = rechazar). */
export const MAX_ACTIVO_BYTES = 64 * 1024 * 1024;

/** Versión sin la «v» inicial de la etiqueta de release (`v0.10.0` → `0.10.0`). */
function sinV(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

/** Nombre del activo web de la release: `<app>-web-<versión sin v>.zip`. */
export function nombreActivoWeb(app: AppArtcraft, version: string): string {
  return `${app}-web-${sinV(version)}.zip`;
}

/** Nombre del CLI de macOS de la release: `<app>-cli-<versión>-macos-universal.zip`. */
export function nombreActivoCli(app: AppArtcraft, version: string): string {
  return `${app}-cli-${sinV(version)}-macos-universal.zip`;
}

/** Nombre de un binario de Rare: `Rare-<versión>-<formato>`. */
export function nombreActivoRare(version: string, formato: FormatoRare): string {
  return `Rare-${version}-${formato}`;
}

// Formato GNU coreutils de `SHA256SUMS.txt`: huella de 64 hex, uno o dos
// espacios, un `*` opcional (modo binario) y el nombre del archivo.
const LINEA_SUMS = /^([0-9a-fA-F]{64})[ ]{1,2}(\*)?(.+)$/;

/** Parsea un `SHA256SUMS.txt`: líneas `<64 hex> [*]<nombre>`. Ignora líneas
 *  vacías, comentarios `#` y huellas mal formadas. La huella se normaliza a
 *  minúsculas; el nombre se deja tal cual. */
export function parseSha256Sums(texto: string): Map<string, string> {
  const sumas = new Map<string, string>();
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const m = LINEA_SUMS.exec(limpia);
    if (!m) continue;
    const nombre = m[3].trim();
    if (nombre) sumas.set(nombre, m[1].toLowerCase());
  }
  return sumas;
}

/** Formas exactas que el OS puede alojar: zip web, CLI de macOS y binario de Rare. */
const RE_ACTIVO =
  /^(figcraft|gridcraft|deckcraft)-web-(v?[0-9][0-9A-Za-z.+-]*)\.zip|(figcraft|gridcraft|deckcraft)-cli-(v?[0-9][0-9A-Za-z.+-]*)-macos-universal\.zip|Rare-(v?[0-9][0-9A-Za-z.+-]*)-(arm64\.dmg|x86_64\.dmg|arm64\.AppImage|x86_64\.AppImage)$/;

/** ¿Este nombre puede alojarse? Solo los activos web/CLI/Rare; nada con `/`,
 *  `..` ni espacios (el nombre nunca construye una ruta de disco). */
export function esActivoPermitido(nombre: string): boolean {
  if (!nombre || /\s/.test(nombre)) return false;
  if (nombre.includes("/") || nombre.includes("\\") || nombre.includes("..")) return false;
  return RE_ACTIVO.test(nombre);
}

/** SHA-256 de unos bytes, en hex minúsculas (webcrypto del medio). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const sutil = globalThis.crypto?.subtle;
  if (!sutil) throw new Error("crypto.subtle no está disponible en este medio");
  const resumen = await sutil.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Primeros 8 caracteres de una huella: lo único de ella que se muestra. */
const resumen8 = (hex: string) => `${hex.slice(0, 8)}…`;

/** Verifica un activo descargado contra el `SHA256SUMS.txt` de su release:
 *  nombre de la lista, tamaño dentro del tope y huella publicada igual a la
 *  calculada. El motivo nunca repite la huella completa. */
export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>,
): Promise<VerificacionActivo> {
  if (!esActivoPermitido(nombre)) return { ok: false, motivo: "nombre de activo no permitido" };
  if (bytes.byteLength > MAX_ACTIVO_BYTES) {
    return { ok: false, motivo: `activo de ${bytes.byteLength} bytes, por encima del tope de ${MAX_ACTIVO_BYTES}` };
  }
  const publicada = sumas.get(nombre);
  if (!publicada) return { ok: false, motivo: "sin huella publicada para este activo en su SHA256SUMS" };
  const calculada = await sha256Hex(bytes);
  if (calculada !== publicada.toLowerCase()) {
    return { ok: false, motivo: `huella distinta de la publicada (calculada ${resumen8(calculada)})` };
  }
  return { ok: true, motivo: `huella verificada contra la publicada (${resumen8(publicada)})` };
}

/** Fija una versión para alojarla: busca la huella del zip web en el
 *  SHA256SUMS de la release. Faltando esa huella devuelve `null`: una versión
 *  nueva nunca se fija sola. */
export function fijarVersion(app: AppArtcraft, version: string, sumas: Map<string, string>): VersionFijada | null {
  const versionNeta = sinV(version);
  const activo = nombreActivoWeb(app, versionNeta);
  const sha256 = sumas.get(activo);
  return sha256 ? { app, version: versionNeta, activo, sha256 } : null;
}
