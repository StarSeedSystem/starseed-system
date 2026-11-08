/**
 * inspeccion-archivos — inspección de seguridad de un ENVÍO de archivos antes de aceptarlo (ARC1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Petición de Alex (08-11): en la ventana de un envío, «Inspeccionar con IA» revisa los archivos antes
 * de aceptarlos. Primero heurísticas LOCALES (aquí, puras, sin red ni DOM), después, si la persona
 * quiere, la IA de Astraura con un RESUMEN de los metadatos (`inspeccion-ia.ts`). Nunca acepta sola.
 *
 * Qué mira (con lo que hay antes de aceptar: nombre, tipo declarado, tamaño, los primeros 512 B que
 * trae la oferta y, si es un ZIP, la lista de su contenido; tras recibirlo, lo mismo con los bytes reales):
 *  · tipo REAL por sus bytes mágicos frente a la extensión y al tipo declarado (con familias: un .docx
 *    es un ZIP, un .m4a o un .heic son ISO-BMFF «ftyp», un .wav es RIFF: eso no es sospechoso);
 *  · ejecutables, instaladores y scripts; doble extensión y nombres con trucos (RTLO, espacios);
 *  · comprimidos (lista del ZIP: rutas de escape, ejecutables dentro, macros, cifrado);
 *  · Office con macros (docm/xlsm…, OLE antiguo, `vbaProject.bin`); PDF con JavaScript o acciones;
 *  · SVG/HTML con scripts; tamaños anómalos (vacío, demasiado pequeño para su tipo).
 * Contrato: `architecture/datos-por-la-malla.md` §8.4.
 */

export type NivelInspeccion = "limpio" | "aviso" | "peligro";

export interface Hallazgo {
  nivel: Exclude<NivelInspeccion, "limpio"> | "info";
  texto: string;
}

export interface ResultadoInspeccion {
  nivel: NivelInspeccion;
  hallazgos: Hallazgo[];
  /** Tipo real detectado por sus bytes («PNG», «ZIP», «ISO-BMFF»…), si se pudo. */
  tipoReal: string | null;
  /** true si se inspeccionaron bytes reales (no solo el nombre y el tipo declarado). */
  conBytes: boolean;
}

export interface EntradaInspeccion {
  nombre: string;
  /** Tipo MIME declarado. */
  tipo?: string | null;
  tamano: number;
  /** Primeros bytes (≤ 64 KB). */
  inicio?: Uint8Array | null;
  /** Rutas dentro del comprimido (si es un ZIP y se pudo listar). */
  entradasZip?: readonly EntradaZip[] | null;
  /** De dónde viene la lista del ZIP: la anunció el remitente o se leyó del archivo recibido. */
  zipSegun?: "remitente" | "archivo";
}

export interface EntradaZip {
  ruta: string;
  tamano?: number;
  comprimido?: number;
  cifrado?: boolean;
}

/* ══════════════════════════ Extensiones ══════════════════════════ */

const EJECUTABLES = new Set([
  "exe", "dll", "scr", "com", "msi", "msp", "cpl", "msc", "pif", "lnk", "sys", "drv",
  "apk", "aab", "xapk", "ipa", "dmg", "pkg", "mpkg", "app", "deb", "rpm", "appimage", "run", "bin.exe", "jar",
]);
const SCRIPTS = new Set([
  "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "sh", "bash", "zsh", "command",
  "py", "pl", "rb", "php", "applescript", "scpt", "reg", "inf", "url", "desktop",
]);
const COMPRIMIDOS = new Set(["zip", "7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "zst", "cab", "iso", "img"]);
const OFFICE_MACROS = new Set(["docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppam", "ppsm", "sldm"]);
const OFFICE_OLE = new Set(["doc", "dot", "xls", "xlt", "ppt", "pps", "pot"]);
/** Formatos que por dentro son un ZIP (no es sospechoso que sus bytes digan «ZIP»). */
const BASADOS_EN_ZIP = new Set([
  "zip", "docx", "docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "xlam", "pptx", "pptm", "potx", "ppsx", "ppam",
  "odt", "ods", "odp", "odg", "epub", "jar", "apk", "aab", "xapk", "ipa", "kmz", "3mf", "usdz", "vsdx", "pages", "numbers", "key", "sketch", "whl", "nupkg",
]);
/** ISO-BMFF («ftyp» en el byte 4): vídeo y audio MP4, QuickTime, HEIC/HEIF/AVIF, 3GP. */
const ISO_BMFF = new Set(["mp4", "m4v", "m4a", "m4b", "m4p", "mov", "qt", "heic", "heif", "avif", "3gp", "3g2", "f4v", "cr3"]);
const RIFF = new Set(["wav", "avi", "webp", "ani"]);
const EBML = new Set(["webm", "mkv", "mka", "mk3d"]);
const TEXTO = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "ini", "toml", "srt", "vtt"]);

/** Extensión (minúsculas, sin punto) de un nombre. Puro. */
export function extensionDe(nombre: string): string {
  const base = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i + 1).toLowerCase() : "";
}

/** Familias MIME que encajan con cada extensión común (para «la extensión no coincide con el tipo»). */
const MIME_DE: Record<string, string[]> = {
  png: ["image/png"], jpg: ["image/jpeg", "image/jpg", "image/pjpeg"], jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  gif: ["image/gif"], webp: ["image/webp"], heic: ["image/heic", "image/heif"], heif: ["image/heif", "image/heic"],
  avif: ["image/avif"], svg: ["image/svg+xml"], bmp: ["image/bmp", "image/x-ms-bmp"], ico: ["image/x-icon", "image/vnd.microsoft.icon"],
  tif: ["image/tiff"], tiff: ["image/tiff"],
  mp3: ["audio/mpeg", "audio/mp3"], m4a: ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"], wav: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"],
  ogg: ["audio/ogg", "video/ogg", "application/ogg"], oga: ["audio/ogg"], flac: ["audio/flac", "audio/x-flac"], aac: ["audio/aac", "audio/x-aac"], opus: ["audio/opus", "audio/ogg"],
  mp4: ["video/mp4", "audio/mp4"], m4v: ["video/mp4", "video/x-m4v"], mov: ["video/quicktime"], webm: ["video/webm", "audio/webm"], mkv: ["video/x-matroska"],
  avi: ["video/x-msvideo", "video/avi"],
  pdf: ["application/pdf"], txt: ["text/plain"], md: ["text/markdown", "text/x-markdown", "text/plain"], csv: ["text/csv", "text/plain", "application/vnd.ms-excel"],
  json: ["application/json", "text/json", "text/plain"], xml: ["application/xml", "text/xml"], html: ["text/html"], htm: ["text/html"],
  zip: ["application/zip", "application/x-zip-compressed", "application/x-zip", "multipart/x-zip"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
};

/** Tipos genéricos que no dicen nada (no se comparan). */
function mimeGenerico(t: string): boolean {
  return !t || t === "application/octet-stream" || t === "binary/octet-stream" || t === "application/unknown";
}

/* ══════════════════════════ Bytes mágicos ══════════════════════════ */

function empieza(b: Uint8Array, firma: number[], desde = 0): boolean {
  if (b.length < desde + firma.length) return false;
  for (let i = 0; i < firma.length; i++) if (b[desde + i] !== firma[i]) return false;
  return true;
}

function ascii(b: Uint8Array, max = 65536): string {
  let s = "";
  const n = Math.min(b.length, max);
  for (let i = 0; i < n; i++) s += b[i] < 128 ? String.fromCharCode(b[i]) : " ";
  return s;
}

/** Tipo real por los primeros bytes. Puro. */
export function tipoRealPorBytes(b: Uint8Array | null | undefined): string | null {
  if (!b || b.length < 2) return null;
  if (empieza(b, [0x4d, 0x5a])) return "EJECUTABLE-WINDOWS";
  if (empieza(b, [0x7f, 0x45, 0x4c, 0x46])) return "EJECUTABLE-ELF";
  if (empieza(b, [0xfe, 0xed, 0xfa, 0xce]) || empieza(b, [0xfe, 0xed, 0xfa, 0xcf]) || empieza(b, [0xce, 0xfa, 0xed, 0xfe]) || empieza(b, [0xcf, 0xfa, 0xed, 0xfe])) return "EJECUTABLE-MACHO";
  if (empieza(b, [0xca, 0xfe, 0xba, 0xbe])) return "EJECUTABLE-MACHO";
  if (empieza(b, [0x23, 0x21])) return "SCRIPT";
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47])) return "PNG";
  if (empieza(b, [0xff, 0xd8, 0xff])) return "JPEG";
  if (empieza(b, [0x47, 0x49, 0x46, 0x38])) return "GIF";
  if (empieza(b, [0x25, 0x50, 0x44, 0x46])) return "PDF";
  if (empieza(b, [0x50, 0x4b, 0x03, 0x04]) || empieza(b, [0x50, 0x4b, 0x05, 0x06]) || empieza(b, [0x50, 0x4b, 0x07, 0x08])) return "ZIP";
  if (empieza(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "OLE";
  if (empieza(b, [0x66, 0x74, 0x79, 0x70], 4)) return "ISO-BMFF";
  if (empieza(b, [0x52, 0x49, 0x46, 0x46]) && b.length >= 12) return "RIFF";
  if (empieza(b, [0x1a, 0x45, 0xdf, 0xa3])) return "EBML";
  if (empieza(b, [0x49, 0x44, 0x33]) || empieza(b, [0xff, 0xfb]) || empieza(b, [0xff, 0xf3]) || empieza(b, [0xff, 0xf2])) return "MP3";
  if (empieza(b, [0x4f, 0x67, 0x67, 0x53])) return "OGG";
  if (empieza(b, [0x66, 0x4c, 0x61, 0x43])) return "FLAC";
  if (empieza(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "7Z";
  if (empieza(b, [0x52, 0x61, 0x72, 0x21])) return "RAR";
  if (empieza(b, [0x1f, 0x8b])) return "GZIP";
  return null;
}

/** ¿Encaja el tipo real con la extensión? (familias: ZIP→docx, ISO-BMFF→m4a/heic, RIFF→wav/webp…). Puro. */
function encaja(tipoReal: string, ext: string): boolean {
  switch (tipoReal) {
    case "PNG":
      return ext === "png" || ext === "apng";
    case "JPEG":
      return ext === "jpg" || ext === "jpeg" || ext === "jfif" || ext === "jpe";
    case "GIF":
      return ext === "gif";
    case "PDF":
      return ext === "pdf" || ext === "ai";
    case "ZIP":
      return BASADOS_EN_ZIP.has(ext);
    case "OLE":
      return OFFICE_OLE.has(ext) || ext === "msi" || ext === "msg";
    case "ISO-BMFF":
      return ISO_BMFF.has(ext);
    case "RIFF":
      return RIFF.has(ext);
    case "EBML":
      return EBML.has(ext);
    case "MP3":
      return ext === "mp3";
    case "OGG":
      return ["ogg", "oga", "ogv", "opus", "spx"].includes(ext);
    case "FLAC":
      return ext === "flac";
    case "7Z":
      return ext === "7z";
    case "RAR":
      return ext === "rar";
    case "GZIP":
      return ext === "gz" || ext === "tgz";
    default:
      return true;
  }
}

/* ══════════════════════════ Lista de un ZIP ══════════════════════════ */

/**
 * listarZip — lee el directorio central de un ZIP a partir de sus ÚLTIMOS bytes (los que contienen el
 * registro de fin y el directorio). `final` son los últimos bytes del archivo y `tamanoTotal` el tamaño
 * entero (para situar el directorio). Devuelve null si no se encuentra o no cabe en `final`. Puro.
 */
export function listarZip(final: Uint8Array, tamanoTotal: number, max = 500): EntradaZip[] | null {
  const n = final.length;
  if (n < 22) return null;
  const dv = new DataView(final.buffer, final.byteOffset, final.byteLength);
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const total = dv.getUint16(eocd + 10, true);
  const tamanoCd = dv.getUint32(eocd + 12, true);
  const offsetCd = dv.getUint32(eocd + 16, true);
  // Posición del directorio dentro de `final`.
  const inicioFinal = tamanoTotal - n;
  let p = offsetCd - inicioFinal;
  if (p < 0 || p + tamanoCd > n) return null;
  const out: EntradaZip[] = [];
  const dec = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: false }) : null;
  for (let k = 0; k < total && k < max && p + 46 <= n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const banderas = dv.getUint16(p + 8, true);
    const comprimido = dv.getUint32(p + 20, true);
    const tamano = dv.getUint32(p + 24, true);
    const largoNombre = dv.getUint16(p + 28, true);
    const largoExtra = dv.getUint16(p + 30, true);
    const largoComentario = dv.getUint16(p + 32, true);
    if (p + 46 + largoNombre > n) break;
    const bytesNombre = final.subarray(p + 46, p + 46 + largoNombre);
    const ruta = dec ? dec.decode(bytesNombre) : ascii(bytesNombre);
    out.push({ ruta, tamano, comprimido, cifrado: (banderas & 1) === 1 });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return out;
}

/* ══════════════════════════ Inspección ══════════════════════════ */

function peor(a: NivelInspeccion, b: NivelInspeccion): NivelInspeccion {
  const orden: Record<NivelInspeccion, number> = { limpio: 0, aviso: 1, peligro: 2 };
  return orden[b] > orden[a] ? b : a;
}

/** Inspecciona un archivo con lo que se sabe de él. Pura y determinista. */
export function inspeccionarArchivo(e: EntradaInspeccion): ResultadoInspeccion {
  const hallazgos: Hallazgo[] = [];
  const nombre = String(e.nombre ?? "");
  const ext = extensionDe(nombre);
  const tipo = String(e.tipo ?? "").toLowerCase().split(";")[0].trim();
  const inicio = e.inicio && e.inicio.length ? e.inicio : null;
  const tipoReal = tipoRealPorBytes(inicio);

  // Nombre con trucos: carácter de giro de escritura (RTLO) o espacios para esconder la extensión.
  if (/[‪-‮⁦-⁩]/.test(nombre)) hallazgos.push({ nivel: "peligro", texto: "El nombre esconde su extensión real con caracteres de giro de escritura (RTLO)" });
  if (/\s{4,}\.[A-Za-z0-9]{1,6}$/.test(nombre)) hallazgos.push({ nivel: "aviso", texto: "El nombre separa la extensión con muchos espacios (truco para esconderla)" });

  // Ejecutables, instaladores y scripts.
  if (EJECUTABLES.has(ext)) hallazgos.push({ nivel: "peligro", texto: `Ejecutable o instalador (.${ext}): solo si lo esperabas de esta persona` });
  else if (SCRIPTS.has(ext)) hallazgos.push({ nivel: "aviso", texto: `Script (.${ext}): puede ejecutar órdenes si se abre` });

  // Doble extensión: «factura.pdf.exe».
  const partes = nombre.split(".");
  if (partes.length >= 3) {
    const penultima = partes[partes.length - 2].toLowerCase();
    const comunes = new Set(["pdf", "jpg", "jpeg", "png", "gif", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "mp3", "mp4", "mov", "zip"]);
    if (comunes.has(penultima) && (EJECUTABLES.has(ext) || SCRIPTS.has(ext) || ext === "html" || ext === "htm" || ext === "lnk")) {
      hallazgos.push({ nivel: "peligro", texto: `Doble extensión: parece .${penultima} pero es .${ext}` });
    }
  }

  // Extensión frente al tipo declarado.
  const esperados = MIME_DE[ext];
  if (esperados && tipo && !mimeGenerico(tipo) && !esperados.includes(tipo)) {
    hallazgos.push({ nivel: "aviso", texto: `La extensión .${ext} no coincide con el tipo declarado (${tipo})` });
  }

  // Tipo real (bytes) frente a la extensión.
  if (tipoReal) {
    if (tipoReal.startsWith("EJECUTABLE")) {
      if (!EJECUTABLES.has(ext)) hallazgos.push({ nivel: "peligro", texto: `Por dentro es un programa ejecutable aunque se llame .${ext || "(sin extensión)"}` });
    } else if (tipoReal === "SCRIPT") {
      if (!SCRIPTS.has(ext)) hallazgos.push({ nivel: "aviso", texto: "Empieza como un script (#!) aunque su nombre no lo dice" });
    } else if (ext && !encaja(tipoReal, ext) && !TEXTO.has(ext)) {
      hallazgos.push({ nivel: "aviso", texto: `Sus bytes dicen ${tipoReal} pero la extensión es .${ext}` });
    } else if (ext && TEXTO.has(ext) && ["ZIP", "OLE", "PDF", "PNG", "JPEG", "GIF", "7Z", "RAR"].includes(tipoReal)) {
      hallazgos.push({ nivel: "aviso", texto: `Se llama .${ext} (texto) pero sus bytes dicen ${tipoReal}` });
    }
  }

  // Office con macros.
  if (OFFICE_MACROS.has(ext)) hallazgos.push({ nivel: "aviso", texto: `Documento de Office con macros (.${ext}): no actives las macros si no las esperas` });
  else if (OFFICE_OLE.has(ext) || tipoReal === "OLE") hallazgos.push({ nivel: "aviso", texto: "Formato antiguo de Office: puede llevar macros" });

  // SVG y HTML con scripts; PDF con JavaScript o acciones automáticas.
  const textoInicio = inicio ? ascii(inicio).toLowerCase() : "";
  const esSvg = ext === "svg" || tipo === "image/svg+xml";
  const esHtml = ext === "html" || ext === "htm" || ext === "xhtml" || tipo === "text/html" || tipo === "application/xhtml+xml";
  if (esHtml) hallazgos.push({ nivel: "aviso", texto: "Página web (HTML): al abrirla en un navegador puede ejecutar código" });
  if ((esSvg || esHtml) && textoInicio) {
    if (/<script[\s>]/.test(textoInicio) || /javascript:/.test(textoInicio) || /<[a-z][^>]*\son[a-z]+\s*=/.test(textoInicio) || /<foreignobject[\s>]/.test(textoInicio)) {
      hallazgos.push({ nivel: esSvg ? "peligro" : "aviso", texto: `${esSvg ? "SVG" : "HTML"} con código (script, javascript: o atributos on…=)` });
    }
  }
  if (tipoReal === "PDF" && textoInicio && /\/(javascript|js|openaction|launch|embeddedfile)\b/.test(textoInicio)) {
    hallazgos.push({ nivel: "aviso", texto: "PDF con JavaScript, acciones automáticas o archivos incrustados" });
  }

  // Comprimidos: lo que llevan dentro.
  const esComprimido = COMPRIMIDOS.has(ext) || tipoReal === "ZIP" || tipoReal === "7Z" || tipoReal === "RAR" || tipoReal === "GZIP";
  const entradas = e.entradasZip ?? null;
  if (entradas && entradas.length) {
    const segun = e.zipSegun === "remitente" ? " (según el remitente)" : "";
    const escapes = entradas.filter((x) => x.ruta.includes("..") || /^[\\/]/.test(x.ruta) || /^[A-Za-z]:[\\/]/.test(x.ruta));
    if (escapes.length) hallazgos.push({ nivel: "peligro", texto: `Rutas que salen de la carpeta al descomprimir${segun}: ${escapes.slice(0, 3).map((x) => x.ruta).join(", ")}` });
    const ejecutables = entradas.filter((x) => {
      const ex = extensionDe(x.ruta);
      return EJECUTABLES.has(ex) || SCRIPTS.has(ex);
    });
    if (ejecutables.length) {
      hallazgos.push({ nivel: "aviso", texto: `Lleva programas o scripts dentro${segun}: ${ejecutables.slice(0, 4).map((x) => x.ruta).join(", ")}${ejecutables.length > 4 ? "…" : ""}` });
    }
    if (entradas.some((x) => /(^|\/)vbaproject\.bin$/i.test(x.ruta))) hallazgos.push({ nivel: "aviso", texto: `Lleva macros de Office (vbaProject.bin)${segun}` });
    if (entradas.some((x) => x.cifrado)) hallazgos.push({ nivel: "aviso", texto: `Tiene partes cifradas: no se pueden revisar por dentro${segun}` });
    const bomba = entradas.find((x) => (x.tamano ?? 0) > 100 * 1024 * 1024 && (x.comprimido ?? 0) > 0 && (x.tamano ?? 0) / (x.comprimido as number) > 100);
    if (bomba) hallazgos.push({ nivel: "peligro", texto: `Compresión desmesurada en ${bomba.ruta} (posible «bomba ZIP»)` });
    if (!BASADOS_EN_ZIP.has(ext) || ext === "zip") hallazgos.push({ nivel: "info", texto: `Comprimido con ${entradas.length} elemento${entradas.length === 1 ? "" : "s"}${segun}` });
  } else if (esComprimido && !BASADOS_EN_ZIP.has(ext)) {
    hallazgos.push({ nivel: "info", texto: "Comprimido: su contenido se revisa al recibirlo, antes de abrirlo" });
  } else if (esComprimido && ext === "zip") {
    hallazgos.push({ nivel: "info", texto: "Comprimido: su contenido se revisa al recibirlo, antes de abrirlo" });
  }

  // Tamaños anómalos.
  if (e.tamano === 0) hallazgos.push({ nivel: "aviso", texto: "Archivo vacío (0 bytes)" });
  else if (e.tamano > 0 && e.tamano < 64 && (MIME_DE[ext] ?? []).some((m) => m.startsWith("video/") || m.startsWith("image/") || m === "application/pdf")) {
    hallazgos.push({ nivel: "aviso", texto: `Demasiado pequeño para ser un .${ext} (${e.tamano} B)` });
  }

  let nivel: NivelInspeccion = "limpio";
  for (const h of hallazgos) if (h.nivel !== "info") nivel = peor(nivel, h.nivel);
  return { nivel, hallazgos, tipoReal, conBytes: !!inicio };
}

/** Nivel de todo un envío: el peor de sus archivos. Puro. */
export function nivelDeEnvio(resultados: readonly ResultadoInspeccion[]): NivelInspeccion {
  return resultados.reduce<NivelInspeccion>((n, r) => peor(n, r.nivel), "limpio");
}

/* ══════════════════════════ Para la IA (solo metadatos) ══════════════════════════ */

export interface ArchivoParaIA {
  nombre: string;
  ruta?: string;
  tipo: string;
  tamano: number;
  local: ResultadoInspeccion;
  /** Solo si la persona lo permitió: primeros caracteres de un archivo de texto (≤ 500). */
  fragmento?: string;
}

/**
 * El RESUMEN que se manda a la IA: nombres, rutas, tipos, tamaños y lo que vieron las heurísticas
 * locales. Nunca el contenido, salvo los fragmentos de texto que la persona permitió. Puro.
 */
export function resumenParaIA(p: { origen?: string; via?: string; verificacion?: string; mensaje?: string; archivos: readonly ArchivoParaIA[] }): string {
  const lineas: string[] = [];
  lineas.push(`Remitente: ${p.origen ?? "desconocido"}${p.verificacion ? ` (${p.verificacion})` : ""}`);
  if (p.via) lineas.push(`Llega por: ${p.via}`);
  if (p.mensaje) lineas.push(`Mensaje del envío: ${p.mensaje.slice(0, 300)}`);
  lineas.push(`Archivos (${p.archivos.length}):`);
  p.archivos.slice(0, 200).forEach((a, i) => {
    const hall = a.local.hallazgos.map((h) => `${h.nivel}: ${h.texto}`).join("; ");
    lineas.push(`${i + 1}. ${a.ruta ?? a.nombre} | ${a.tipo || "sin tipo"} | ${a.tamano} B | real: ${a.local.tipoReal ?? "sin leer"} | local: ${a.local.nivel}${hall ? ` (${hall})` : ""}`);
    if (a.fragmento) lineas.push(`   fragmento: ${JSON.stringify(a.fragmento.slice(0, 500))}`);
  });
  return lineas.join("\n");
}

export const INSTRUCCION_IA =
  "Eres el centinela de archivos de StarSeed OS. Te paso el resumen de un envío de archivos que alguien recibe por la malla P2P. " +
  "Evalúa el riesgo de cada archivo SOLO con estos datos (no ves su contenido salvo los fragmentos indicados). " +
  'Responde SOLO con JSON: {"veredicto":"limpio|aviso|peligro","resumen":"una frase","archivos":[{"n":número,"nivel":"limpio|aviso|peligro","motivo":"frase corta"}]}. ' +
  "Sé prudente pero no alarmista: fotos, audio, vídeo, PDF y documentos corrientes sin señales son «limpio». Nunca recomiendes aceptar algo automáticamente.";

export interface VeredictoIA {
  nivel: NivelInspeccion;
  resumen: string;
  /** Por índice (0-based) del archivo en el resumen. */
  porArchivo: Record<number, { nivel: NivelInspeccion; motivo: string }>;
}

function nivelDe(x: unknown): NivelInspeccion | null {
  return x === "limpio" || x === "aviso" || x === "peligro" ? x : null;
}

/** Lee la respuesta de la IA (JSON, quizá dentro de ```), tolerante. Null si no se entiende. Puro. */
export function leerVeredictoIA(texto: string, nArchivos: number): VeredictoIA | null {
  if (typeof texto !== "string") return null;
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: unknown;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const r = o as { veredicto?: unknown; resumen?: unknown; archivos?: unknown };
  const nivel = nivelDe(r.veredicto);
  if (!nivel) return null;
  const porArchivo: VeredictoIA["porArchivo"] = {};
  if (Array.isArray(r.archivos)) {
    for (const a of r.archivos as Array<{ n?: unknown; nivel?: unknown; motivo?: unknown }>) {
      const n = typeof a?.n === "number" ? Math.round(a.n) - 1 : -1;
      const na = nivelDe(a?.nivel);
      if (n >= 0 && n < nArchivos && na) porArchivo[n] = { nivel: na, motivo: typeof a.motivo === "string" ? a.motivo.slice(0, 200) : "" };
    }
  }
  return { nivel, resumen: typeof r.resumen === "string" ? r.resumen.slice(0, 400) : "", porArchivo };
}
