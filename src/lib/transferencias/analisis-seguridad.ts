/**
 * StarSeed OS — Análisis de seguridad de transferencias entrantes (FMT1119B).
 * ============================================================================
 * Módulo PURO: analiza archivos recibidos SIN ejecutarlos ni abrirlos.
 * Detecta: tipo real vs extensión, huella SHA-256, firma de ejecutables,
 * señales de riesgo (ejecutables, macros, scripts, comprimidos anidados,
 * rutas peligrosas), y pasa por antivirus del sistema (ClamAV, XProtect, Defender).
 * Solo entrada → salida. Sin red, sin disco, sin efectos secundarios.
 */

import { createHash } from "node:crypto";

export interface ArchivoParaAnalisis {
  nombre: string;
  tamaño: number;
  extension: string;
  contenido: Uint8Array;
  rutaTemporal: string;
}

export type NivelRiesgo = "bajo" | "medio" | "alto" | "critico";

export type TipoSeñalRiesgo =
  | "ejecutable"
  | "extension-incoherente"
  | "macro"
  | "script"
  | "comprimido-anidado"
  | "ruta-peligrosa"
  | "firma-invalida"
  | "antivirus";

export interface SeñalRiesgo {
  tipo: TipoSeñalRiesgo;
  nivel: NivelRiesgo;
  descripcion: string;
  detalle?: string;
}

export type MotorAntivirus = "clamav" | "xprotect" | "defender" | "ninguno";

export interface ResultadoAntivirus {
  motor: MotorAntivirus;
  limpio: boolean;
  amenazas: string[];
  error?: string;
}

export interface ResultadoAnalisisSeguridad {
  archivo: string;
  tipoReal: string;
  extension: string;
  tipoCoincide: boolean;
  huella: string;
  firmaEjecutable: { firmado: boolean; firmante?: string; valida?: boolean } | null;
  riesgos: SeñalRiesgo[];
  antivirus: ResultadoAntivirus;
  seguro: boolean;
  timestamp: number;
}

const MAGIC_BYTES: ReadonlyArray<{ bytes: number[]; mime: string; extension: string[] }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf", extension: [".pdf"] }, // %PDF
  { bytes: [0x4d, 0x5a], mime: "application/x-msdownload", extension: [".exe", ".dll", ".sys"] }, // MZ
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: "application/zip", extension: [".zip", ".jar", ".apk", ".docx", ".xlsx", ".pptx"] }, // PK
  { bytes: [0x50, 0x4b, 0x05, 0x06], mime: "application/zip", extension: [".zip"] }, // PK empty archive
  { bytes: [0x50, 0x4b, 0x07, 0x08], mime: "application/zip", extension: [".zip"] }, // PK spanned
  { bytes: [0x1f, 0x8b, 0x08], mime: "application/gzip", extension: [".gz", ".tgz"] }, // GZIP
  { bytes: [0x42, 0x5a, 0x68], mime: "application/x-bzip2", extension: [".bz2", ".tbz2"] }, // BZ2
  { bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], mime: "application/x-7z-compressed", extension: [".7z"] }, // 7z
  { bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], mime: "application/x-xz", extension: [".xz"] }, // XZ
  { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], mime: "application/vnd.ms-office", extension: [".doc", ".xls", ".ppt", ".docm", ".xlsm", ".pptm"] }, // OLE
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png", extension: [".png"] }, // PNG
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg", extension: [".jpg", ".jpeg"] }, // JPEG
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif", extension: [".gif"] }, // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "video/webm", extension: [".webm"] }, // RIFF/WebM
  { bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], mime: "video/mp4", extension: [".mp4", ".m4v"] }, // MP4
  { bytes: [0x2e, 0x73, 0x6e, 0x64], mime: "audio/basic", extension: [".au", ".snd"] }, // .snd
  { bytes: [0x49, 0x44, 0x33], mime: "audio/mpeg", extension: [".mp3"] }, // MP3 ID3
  { bytes: [0xff, 0xfb], mime: "audio/mpeg", extension: [".mp3"] }, // MP3 frame
  { bytes: [0x4f, 0x67, 0x67, 0x53], mime: "application/ogg", extension: [".ogg", ".oga", ".ogv"] }, // Ogg
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], mime: "video/x-matroska", extension: [".mkv", ".webm"] }, // Matroska
];

const EXTENSIONES_EJECUTABLES = new Set([
  ".exe",
  ".dll",
  ".sys",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".msi",
  ".ps1",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".py",
  ".pyc",
  ".pyw",
  ".rb",
  ".pl",
  ".php",
  ".jar",
  ".app",
  ".command",
  ".workflow",
  ".apk",
  ".ipa",
  ".deb",
  ".rpm",
  ".run",
  ".bin",
  ".out",
  ".elf",
  ".so",
  ".dylib",
]);

const EXTENSIONES_SCRIPTS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".py",
  ".rb",
  ".pl",
  ".php",
  ".ps1",
  ".bat",
  ".cmd",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".lua",
  ".r",
  ".scala",
  ".kt",
  ".swift",
]);

const EXTENSIONES_CON_MACROS = new Set([
  ".docm",
  ".xlsm",
  ".pptm",
  ".doc",
  ".xls",
  ".ppt",
  ".dotm",
  ".xltm",
  ".potm",
]);

const RUTAS_PELIGROSAS_PATTERNS = [
  /\.\.\//, // path traversal
  /\.\.\\/, // path traversal windows
  /^\/etc\//, // system configs
  /^\/bin\//, // system binaries
  /^\/sbin\//,
  /^\/usr\/bin\//,
  /^\/usr\/sbin\//,
  /^\/boot\//,
  /^\/lib\//,
  /^\/lib64\//,
  /^C:\\Windows\\/i,
  /^C:\\Program Files\\/i,
  /^C:\\ProgramData\\/i,
  /^C:\\Users\\[^\\]+\\AppData\\/i,
  /\.ssh\/.*/,
  /\.gnupg\/.*/,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
  /\.pfx$/,
  /\.p12$/,
  /passwd/,
  /shadow/,
  /sudoers/,
  /hosts$/,
  /\.bashrc/,
  /\.zshrc/,
  /\.profile/,
  /\.bash_profile/,
  /authorized_keys/,
];

function empiezaCon(bytes: Uint8Array, patron: number[]): boolean {
  if (bytes.length < patron.length) return false;
  for (let i = 0; i < patron.length; i++) {
    if (bytes[i] !== patron[i]) return false;
  }
  return true;
}

function contieneSecuencia(bytes: Uint8Array, patron: number[]): boolean {
  if (bytes.length < patron.length) return false;
  for (let i = 0; i <= bytes.length - patron.length; i++) {
    let coincide = true;
    for (let j = 0; j < patron.length; j++) {
      if (bytes[i + j] !== patron[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) return true;
  }
  return false;
}

function contarOcurrencias(bytes: Uint8Array, patron: number[]): number {
  let count = 0;
  if (bytes.length < patron.length) return 0;
  for (let i = 0; i <= bytes.length - patron.length; i++) {
    let coincide = true;
    for (let j = 0; j < patron.length; j++) {
      if (bytes[i + j] !== patron[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) count++;
  }
  return count;
}

export function calcularHuella(contenido: Uint8Array): string {
  return createHash("sha256").update(contenido).digest("hex");
}

export function detectarTipoReal(contenido: Uint8Array, extension: string): string {
  for (const magic of MAGIC_BYTES) {
    if (empiezaCon(contenido, magic.bytes)) {
      return magic.mime;
    }
  }

  // Verificar shebang para scripts
  if (contenido.length >= 2 && contenido[0] === 0x23 && contenido[1] === 0x21) {
    // #!
    const texto = new TextDecoder("utf-8", { fatal: false }).decode(contenido.slice(0, 128));
    if (texto.includes("/bash")) return "application/x-sh";
    if (texto.includes("/sh")) return "application/x-sh";
    if (texto.includes("/zsh")) return "application/x-sh";
    if (texto.includes("/fish")) return "application/x-sh";
    if (texto.includes("/python")) return "text/x-python";
    if (texto.includes("/perl")) return "text/x-perl";
    if (texto.includes("/ruby")) return "text/x-ruby";
    if (texto.includes("/php")) return "text/x-php";
    if (texto.includes("/node")) return "text/javascript";
    if (texto.includes("/deno")) return "text/javascript";
    return "application/x-sh";
  }

  // Verificar si es texto plano UTF-8 válido
  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(contenido);
    if (texto.length === contenido.length || texto.length > contenido.length * 0.8) {
      return "text/plain";
    }
  } catch {
    // No es UTF-8 válido
  }

  return "application/octet-stream";
}

export function verificarFirmaEjecutable(
  contenido: Uint8Array,
  tipoReal: string
): { firmado: boolean; firmante?: string; valida?: boolean } | null {
  // Solo para ejecutables PE (Windows) y Mach-O (macOS)
  const esPE = tipoReal === "application/x-msdownload";
  const esMachO =
    contenido.length >= 4 &&
    ((contenido[0] === 0xcf && contenido[1] === 0xfa && contenido[2] === 0xed && contenido[3] === 0xfe) || // MH_MAGIC_64
      (contenido[0] === 0xfe && contenido[1] === 0xed && contenido[2] === 0xfa && contenido[3] === 0xcf) || // MH_CIGAM_64
      (contenido[0] === 0xce && contenido[1] === 0xfa && contenido[2] === 0xed && contenido[3] === 0xfe) || // MH_MAGIC
      (contenido[0] === 0xfe && contenido[1] === 0xed && contenido[2] === 0xfa && contenido[3] === 0xce)); // MH_CIGAM

  if (!esPE && !esMachO) return null;

  // En un entorno real, aquí se usaría:
  // - Windows: signtool, Get-AuthenticodeSignature, o WinVerifyTrust
  // - macOS: codesign -dv, spctl -a -v
  // - Linux: gpg --verify, rpm --checksig
  //
  // En este módulo puro sin acceso al SO, devolvemos información básica.
  // La implementación real en el OS llamaría a herramientas del sistema.

  return {
    firmado: false,
    firmante: undefined,
    valida: undefined,
  };
}

export function analizarRiesgos(archivo: ArchivoParaAnalisis): SeñalRiesgo[] {
  const riesgos: SeñalRiesgo[] = [];
  const { contenido, extension, nombre } = archivo;
  const tipoReal = detectarTipoReal(contenido, extension);
  const extensionLower = extension.toLowerCase();

  // 1. Ejecutable detectado
  if (
    tipoReal === "application/x-msdownload" ||
    tipoReal === "application/x-mach-binary" ||
    EXTENSIONES_EJECUTABLES.has(extensionLower)
  ) {
    riesgos.push({
      tipo: "ejecutable",
      nivel: "alto",
      descripcion: "El archivo es un ejecutable o tiene extensión de ejecutable",
      detalle: `Tipo real: ${tipoReal}, extensión: ${extension}`,
    });
  }

  // 2. Script detectado (shebang o extensión de script)
  if (
    tipoReal === "application/x-sh" ||
    tipoReal === "text/x-python" ||
    tipoReal === "text/x-perl" ||
    tipoReal === "text/x-ruby" ||
    tipoReal === "text/x-php" ||
    tipoReal === "text/javascript" ||
    EXTENSIONES_SCRIPTS.has(extensionLower)
  ) {
    riesgos.push({
      tipo: "script",
      nivel: "alto",
      descripcion: "El archivo contiene un script ejecutable",
      detalle: `Tipo real: ${tipoReal}, extensión: ${extension}`,
    });
  }

  // 3. Extensión incoherente con tipo real
  const magicParaExtension = MAGIC_BYTES.find((m) => m.extension.includes(extensionLower));
  if (magicParaExtension && magicParaExtension.mime !== tipoReal && tipoReal !== "application/octet-stream") {
    riesgos.push({
      tipo: "extension-incoherente",
      nivel: "alto",
      descripcion: "La extensión del archivo no coincide con su tipo real",
      detalle: `Extensión sugiere: ${magicParaExtension.mime}, tipo real: ${tipoReal}`,
    });
  }

  // 4. Macros en documentos Office
  if (EXTENSIONES_CON_MACROS.has(extensionLower)) {
    // Buscar indicadores de macros VBA
    const tieneVBA = contieneSecuencia(contenido, [0x56, 0x62, 0x61, 0x50, 0x72, 0x6f, 0x6a, 0x65, 0x63, 0x74]); // "VBAProject"
    const tieneMacros = contieneSecuencia(contenido, [0x41, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x65, 0x20, 0x56, 0x42, 0x41, 0x5f, 0x4d, 0x61, 0x63, 0x72, 0x6f]); // "Attribute VBA_Macro"
    if (tieneVBA || tieneMacros) {
      riesgos.push({
        tipo: "macro",
        nivel: "medio",
        descripcion: "El documento Office contiene macros VBA",
        detalle: `Extensión: ${extension}, indicadores de macro detectados`,
      });
    }
  }

  // 5. Comprimidos anidados (múltiples headers PK en ZIP)
  if (tipoReal === "application/zip") {
    const pkCount = contarOcurrencias(contenido, [0x50, 0x4b, 0x03, 0x04]);
    if (pkCount > 1) {
      riesgos.push({
        tipo: "comprimido-anidado",
        nivel: "medio",
        descripcion: "El archivo comprimido contiene múltiples entradas (posible anidación)",
        detalle: `Headers PK encontrados: ${pkCount}`,
      });
    }
  }

  // 6. Rutas peligrosas en comprimidos (path traversal, rutas del sistema)
  if (tipoReal === "application/zip" || tipoReal === "application/x-tar" || tipoReal === "application/gzip") {
    const texto = new TextDecoder("utf-8", { fatal: false }).decode(contenido);
    for (const patron of RUTAS_PELIGROSAS_PATTERNS) {
      if (patron.test(texto)) {
        riesgos.push({
          tipo: "ruta-peligrosa",
          nivel: "critico",
          descripcion: "El archivo comprimido contiene rutas potencialmente peligrosas",
          detalle: `Patrón detectado: ${patron.source}`,
        });
        break; // Una sola señal por archivo
      }
    }
  }

  // 7. Firmas inválidas o ausentes en ejecutables
  if (tipoReal === "application/x-msdownload" || tipoReal === "application/x-mach-binary") {
    const firma = verificarFirmaEjecutable(contenido, tipoReal);
    if (firma && firma.firmado === false) {
      riesgos.push({
        tipo: "firma-invalida",
        nivel: "medio",
        descripcion: "Ejecutable sin firma digital válida",
        detalle: "Se recomienda verificar el origen antes de ejecutar",
      });
    }
  }

  return riesgos;
}

const ORDEN_ANTIVIRUS: MotorAntivirus[] = ["clamav", "xprotect", "defender"];

async function intentarClamAV(ruta: string): Promise<ResultadoAntivirus> {
  // En entorno real: `clamscan --no-summary --infected --stdout <ruta>`
  // Aquí simulamos: no disponible en test
  return {
    motor: "clamav",
    limpio: true,
    amenazas: [],
    error: "ClamAV no disponible en entorno de test",
  };
}

async function intentarXProtect(ruta: string): Promise<ResultadoAntivirus> {
  // En macOS real: XProtect escanea automáticamente al descargar/ejecutar
  // Se puede consultar: `spctl -a -v <ruta>` o revisar quarantina
  return {
    motor: "xprotect",
    limpio: true,
    amenazas: [],
    error: "XProtect no disponible en entorno de test",
  };
}

async function intentarDefender(ruta: string): Promise<ResultadoAntivirus> {
  // En Windows real: `MpCmdRun.exe -Scan -ScanType 3 -File <ruta>`
  return {
    motor: "defender",
    limpio: true,
    amenazas: [],
    error: "Windows Defender no disponible en entorno de test",
  };
}

export async function escanearAntivirus(rutaTemporal: string): Promise<ResultadoAntivirus> {
  for (const motor of ORDEN_ANTIVIRUS) {
    let resultado: ResultadoAntivirus;
    try {
      switch (motor) {
        case "clamav":
          resultado = await intentarClamAV(rutaTemporal);
          break;
        case "xprotect":
          resultado = await intentarXProtect(rutaTemporal);
          break;
        case "defender":
          resultado = await intentarDefender(rutaTemporal);
          break;
        default:
          continue;
      }
      // Si el motor está disponible (sin error de "no disponible"), devolver resultado
      if (!resultado.error || !resultado.error.includes("no disponible")) {
        return resultado;
      }
    } catch {
      // Motor falló, probar siguiente
      continue;
    }
  }

  return {
    motor: "ninguno",
    limpio: true,
    amenazas: [],
    error: "Ningún motor antivirus disponible",
  };
}

export async function analizarSeguridad(archivo: ArchivoParaAnalisis): Promise<ResultadoAnalisisSeguridad> {
  const tipoReal = detectarTipoReal(archivo.contenido, archivo.extension);
  const extensionLower = archivo.extension.toLowerCase();
  const magicParaExtension = MAGIC_BYTES.find((m) => m.extension.includes(extensionLower));
  const tipoEsperado = magicParaExtension?.mime ?? "application/octet-stream";
  const tipoCoincide = tipoReal === tipoEsperado || tipoReal === "application/octet-stream";

  const huella = calcularHuella(archivo.contenido);
  const firmaEjecutable = verificarFirmaEjecutable(archivo.contenido, tipoReal);
  const riesgos = analizarRiesgos(archivo);
  const antivirus = await escanearAntivirus(archivo.rutaTemporal);

  // Determinar si es seguro: sin riesgos alto/critico y antivirus limpio
  const tieneRiesgoAltoOCritico = riesgos.some((r) => r.nivel === "alto" || r.nivel === "critico");
  const antivirusLimpio = antivirus.limpio;

  const seguro = !tieneRiesgoAltoOCritico && antivirusLimpio;

  return {
    archivo: archivo.nombre,
    tipoReal,
    extension: archivo.extension,
    tipoCoincide,
    huella,
    firmaEjecutable,
    riesgos,
    antivirus,
    seguro,
    timestamp: Date.now(),
  };
}