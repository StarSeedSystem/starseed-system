export function parseSha256Sums(texto: string): Map<string, string> {
  const resultado = new Map<string, string>();
  const lineas = texto.split(/\r?\n/);
  for (const linea of lineas) {
    const limpia = linea.trim();
    if (limpia === "") continue;
    if (limpia.startsWith("#")) continue;
    let sinAsterisco = limpia.replace(/\s+\*\s+/, "  ");
    sinAsterisco = sinAsterisco.replace(/\*\s*/, " ");
    const partes = sinAsterisco.split(/\s+/);
    if (partes.length < 2) continue;
    const hash = partes[0];
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) continue;
    let nombre = partes.slice(1).join(" ");
    nombre = nombre.trim();
    if (nombre === "") continue;
    if (nombre.startsWith("*")) nombre = nombre.slice(1).trim();
    resultado.set(nombre, hash.toLowerCase());
  }
  return resultado;
}

export function nombreActivoWeb(app: "figcraft" | "gridcraft" | "deckcraft", version: string): string {
  const limpia = version.replace(/^v/i, "");
  return `${app}-web-${limpia}.zip`;
}

export function nombreActivoCli(app: "figcraft" | "gridcraft" | "deckcraft", version: string): string {
  const limpia = version.replace(/^v/i, "");
  return `${app}-cli-${limpia}-macos-universal.zip`;
}

export function nombreActivoRare(
  version: string,
  formato: "arm64.dmg" | "x86_64.dmg" | "arm64.AppImage" | "x86_64.AppImage"
): string {
  const limpia = version.replace(/^v/i, "");
  return `Rare-${limpia}-${formato}`;
}

export function esActivoPermitido(nombre: string): boolean {
  if (nombre.includes("/") || nombre.includes("\\")) return false;
  if (nombre.includes("..")) return false;
  if (nombre.includes(" ")) return false;
  if (nombre === "") return false;
  const webCraft = /^(figcraft|gridcraft|deckcraft)-web-[^\s/]+\.zip$/.test(nombre);
  if (webCraft) return true;
  const cliCraft = /^(figcraft|gridcraft|deckcraft)-cli-[^\s/]+-macos-universal\.zip$/.test(nombre);
  if (cliCraft) return true;
  const rare = /^Rare-[^\s/]+-(arm64\.dmg|x86_64\.dmg|arm64\.AppImage|x86_64\.AppImage)$/.test(nombre);
  if (rare) return true;
  return false;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const datos = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", datos);
  const vista = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < vista.length; i++) {
    const h = vista[i].toString(16).padStart(2, "0");
    hex += h;
  }
  return hex;
}

export async function verificarActivo(
  nombre: string,
  bytes: Uint8Array,
  sumas: Map<string, string>
): Promise<{ ok: boolean; motivo: string }> {
  if (!esActivoPermitido(nombre)) {
    return { ok: false, motivo: "activo no permitido" };
  }
  if (bytes.byteLength > 64 * 1024 * 1024) {
    return { ok: false, motivo: "activo demasiado grande" };
  }
  const hashPublicada = sumas.get(nombre);
  if (!hashPublicada) {
    return { ok: false, motivo: "sin huella publicada" };
  }
  const hashCalculada = await sha256Hex(bytes);
  if (hashCalculada !== hashPublicada) {
    return { ok: false, motivo: `huella distinta ${hashCalculada.slice(0, 8)}` };
  }
  return { ok: true, motivo: "ok" };
}

export function fijarVersion(
  app: "figcraft" | "gridcraft" | "deckcraft",
  version: string,
  sumas: Map<string, string>
): { app: string; version: string; activo: string; sha256: string } | null {
  const activo = nombreActivoWeb(app, version);
  const sha256 = sumas.get(activo);
  if (!sha256) {
    return null;
  }
  return { app, version: version.replace(/^v/i, ""), activo, sha256 };
}
