export type NivelRiesgo = 'bajo' | 'medio' | 'alto';

export type TipoSenalRiesgo =
  | 'ejecutable'
  | 'macro'
  | 'script'
  | 'zip-anidado'
  | 'ruta-peligrosa'
  | 'zip-bomba'
  | 'pdf-javascript'
  | 'tipo-discrepante';

export interface SeñalRiesgo {
  tipo: TipoSenalRiesgo;
  descripcion: string;
  severidad: 'alta' | 'media' | 'baja';
}

export interface FirmaEjecutable {
  tipo: 'PE' | 'Mach-O' | 'ELF';
  arquitectura?: string;
}

export interface ResultadoAnalisisSeguridad {
  tipoReal: string;
  extension: string;
  coincideTipoExtension: boolean;
  hashSha256: string;
  firmaEjecutable?: FirmaEjecutable;
  señalesRiesgo: SeñalRiesgo[];
  nivelRiesgo: NivelRiesgo;
  resumen: string;
}

export interface EntradaAnalisis {
  nombre: string;
  tipoDeclarado?: string;
  inicio: Uint8Array;
  tamano: number;
  entradasZip?: Array<{
    ruta: string;
    tamano: number;
    comprimido: number;
  }>;
}

export type TipoAntivirus = 'clamav' | 'xprotect' | 'defender';

export interface ResultadoAntivirus {
  antivirus: TipoAntivirus;
  ejecutado: boolean;
  limpio?: boolean;
  error?: string;
  detalles?: string;
}

function comienzaCon(inicio: Uint8Array, secuencia: number[]): boolean {
  if (inicio.length < secuencia.length) return false;
  for (let i = 0; i < secuencia.length; i++) {
    if (inicio[i] !== secuencia[i]) return false;
  }
  return true;
}

function obtenerExtension(nombre: string): string {
  const partes = nombre.split('.');
  return partes.length > 1 ? partes[partes.length - 1].toLowerCase() : '';
}

function detectarTipoReal(inicio: Uint8Array): string | null {
  if (comienzaCon(inicio, [0x4D, 0x5A])) return 'Ejecutable DOS (MZ)';
  if (comienzaCon(inicio, [0x7F, 0x45, 0x4C, 0x46])) return 'Ejecutable ELF';
  if (
    comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCE]) ||
    comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCF]) ||
    comienzaCon(inicio, [0xCA, 0xFE, 0xBA, 0xBE])
  ) return 'Ejecutable Mach-O (big endian)';
  if (
    comienzaCon(inicio, [0xCE, 0xFA, 0xED, 0xFE]) ||
    comienzaCon(inicio, [0xCF, 0xFA, 0xED, 0xFE]) ||
    comienzaCon(inicio, [0xBE, 0xBA, 0xFE, 0xCA])
  ) return 'Ejecutable Mach-O (little endian)';
  if (comienzaCon(inicio, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'PNG';
  if (inicio.length >= 3 && comienzaCon(inicio, [0xFF, 0xD8, 0xFF])) return 'JPEG';
  if (
    comienzaCon(inicio, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    comienzaCon(inicio, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) return 'GIF';
  if (comienzaCon(inicio, [0x25, 0x50, 0x44, 0x46])) return 'PDF';
  if (
    comienzaCon(inicio, [0x50, 0x4B, 0x03, 0x04]) ||
    comienzaCon(inicio, [0x50, 0x4B, 0x05, 0x06]) ||
    comienzaCon(inicio, [0x50, 0x4B, 0x07, 0x08])
  ) return 'ZIP';
  if (inicio.length >= 8 && inicio[4] === 0x66 && inicio[5] === 0x74 && inicio[6] === 0x79 && inicio[7] === 0x70) return 'MP4';
  if (comienzaCon(inicio, [0x57, 0x45, 0x42, 0x50])) return 'WEBP';
  if (comienzaCon(inicio, [0x49, 0x44, 0x33])) return 'MP3';
  return null;
}

function tipoCoincide(tipoReal: string, extension: string, tipoDeclarado?: string): boolean {
  const mapa: Record<string, string[]> = {
    'PNG': ['png'],
    'JPEG': ['jpg', 'jpeg'],
    'GIF': ['gif'],
    'PDF': ['pdf'],
    'ZIP': ['zip'],
    'MP4': ['mp4', 'm4v'],
    'WEBP': ['webp'],
    'MP3': ['mp3'],
    'Ejecutable DOS (MZ)': ['exe', 'dll', 'scr'],
    'Ejecutable ELF': ['elf', 'so', 'bin'],
    'Ejecutable Mach-O (big endian)': ['dylib', 'bundle', 'app'],
    'Ejecutable Mach-O (little endian)': ['dylib', 'bundle', 'app'],
  };

  const extensionesEsperadas = mapa[tipoReal] || [];
  if (extensionesEsperadas.includes(extension)) return true;

  if (tipoDeclarado) {
    const tipoDeclaradoLower = tipoDeclarado.toLowerCase();
    const mimeMap: Record<string, string[]> = {
      'PNG': ['image/png'],
      'JPEG': ['image/jpeg', 'image/jpg'],
      'GIF': ['image/gif'],
      'PDF': ['application/pdf'],
      'ZIP': ['application/zip', 'application/x-zip-compressed'],
      'MP4': ['video/mp4'],
      'WEBP': ['image/webp'],
      'MP3': ['audio/mpeg'],
      'Ejecutable DOS (MZ)': ['application/x-msdownload', 'application/octet-stream'],
      'Ejecutable ELF': ['application/x-executable', 'application/octet-stream'],
      'Ejecutable Mach-O (big endian)': ['application/octet-stream'],
      'Ejecutable Mach-O (little endian)': ['application/octet-stream'],
    };
    const tiposMimeEsperados = mimeMap[tipoReal] || [];
    return tiposMimeEsperados.some(t => tipoDeclaradoLower.includes(t));
  }

  return false;
}

async function calcularSha256(datos: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', datos.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function detectarFirmaEjecutable(inicio: Uint8Array): FirmaEjecutable | undefined {
  if (comienzaCon(inicio, [0x4D, 0x5A])) {
    if (inicio.length > 64) {
      const peOffset = new DataView(inicio.buffer, inicio.byteOffset + 60, 4).getUint32(0, true);
      if (inicio.length > peOffset + 4) {
        if (
          inicio[peOffset] === 0x50 &&
          inicio[peOffset + 1] === 0x45 &&
          inicio[peOffset + 2] === 0x00 &&
          inicio[peOffset + 3] === 0x00
        ) {
          return { tipo: 'PE', arquitectura: 'Windows' };
        }
      }
    }
    return { tipo: 'PE', arquitectura: 'DOS/Windows' };
  }

  if (
    comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCE]) ||
    comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCF]) ||
    comienzaCon(inicio, [0xCA, 0xFE, 0xBA, 0xBE]) ||
    comienzaCon(inicio, [0xCE, 0xFA, 0xED, 0xFE]) ||
    comienzaCon(inicio, [0xCF, 0xFA, 0xED, 0xFE]) ||
    comienzaCon(inicio, [0xBE, 0xBA, 0xFE, 0xCA])
  ) {
    return { tipo: 'Mach-O', arquitectura: 'macOS/iOS' };
  }

  if (comienzaCon(inicio, [0x7F, 0x45, 0x4C, 0x46])) {
    return { tipo: 'ELF', arquitectura: 'Linux/Unix' };
  }

  return undefined;
}

function detectarSenalesRiesgo(entrada: EntradaAnalisis, tipoReal: string | null): SeñalRiesgo[] {
  const señales: SeñalRiesgo[] = [];
  const extension = obtenerExtension(entrada.nombre);
  const inicio = entrada.inicio;

  if (tipoReal?.startsWith('Ejecutable')) {
    señales.push({
      tipo: 'ejecutable',
      descripcion: `Ejecutable detectado: ${tipoReal}`,
      severidad: 'alta',
    });
  }

  const extensionesPeligrosas = new Set(['exe', 'dll', 'scr', 'bat', 'cmd', 'com', 'msi', 'ps1', 'vbs', 'jar', 'apk', 'dmg', 'pkg', 'app']);
  if (extension && extensionesPeligrosas.has(extension)) {
    señales.push({
      tipo: 'ejecutable',
      descripcion: `Extensión peligrosa: .${extension}`,
      severidad: 'alta',
    });
  }

  if (inicio.length >= 2 && comienzaCon(inicio, [0x23, 0x21])) {
    señales.push({
      tipo: 'script',
      descripcion: 'Shebang (#!) detectado: script ejecutable',
      severidad: 'media',
    });
  }

  if (inicio.length > 0) {
    const inicioUTF8 = new TextDecoder('utf-8', { fatal: false }).decode(inicio.slice(0, Math.min(inicio.length, 64 * 1024)));
    const inicioLower = inicioUTF8.toLowerCase();
    if (inicioLower.includes('<script') || inicioLower.includes('javascript:') || /on\w+\s*=/.test(inicioLower)) {
      señales.push({
        tipo: 'script',
        descripcion: 'Contenido HTML/SVG con JavaScript detectado',
        severidad: 'media',
      });
    }
  }

  if (entrada.entradasZip) {
    for (const entradaZip of entrada.entradasZip) {
      const rutaLower = entradaZip.ruta.toLowerCase();
      if (rutaLower === 'vbaproject.bin') {
        señales.push({
          tipo: 'macro',
          descripcion: 'Macro de Office detectada (vbaProject.bin)',
          severidad: 'media',
        });
      }

      if (rutaLower.endsWith('.zip') || rutaLower.endsWith('.jar') || rutaLower.endsWith('.apk') || rutaLower.endsWith('.docx') || rutaLower.endsWith('.xlsx') || rutaLower.endsWith('.pptx')) {
        señales.push({
          tipo: 'zip-anidado',
          descripcion: `Archivo comprimido anidado: ${entradaZip.ruta}`,
          severidad: 'media',
        });
      }

      if (entradaZip.ruta.includes('..') || /^\/|^[A-Za-z]:\\/.test(entradaZip.ruta)) {
        señales.push({
          tipo: 'ruta-peligrosa',
          descripcion: `Ruta de escape en ZIP: ${entradaZip.ruta}`,
          severidad: 'alta',
        });
      }

      const diezMB = 10 * 1024 * 1024;
      if (entradaZip.tamano > diezMB && entradaZip.comprimido > 0) {
        const ratio = entradaZip.tamano / entradaZip.comprimido;
        if (ratio > 100) {
          señales.push({
            tipo: 'zip-bomba',
            descripcion: `Ratio de compresión excesivo (${ratio.toFixed(1)}:1) - posible zip bomb`,
            severidad: 'alta',
          });
        }
      }
    }
  }

  if (tipoReal === 'PDF') {
    const pdfInicio = new TextDecoder('utf-8', { fatal: false }).decode(inicio.slice(0, Math.min(inicio.length, 1000)));
    if (pdfInicio.includes('/JavaScript') || pdfInicio.includes('/JS') || pdfInicio.includes('/OpenAction')) {
      señales.push({
        tipo: 'pdf-javascript',
        descripcion: 'PDF contiene JavaScript o OpenAction',
        severidad: 'media',
      });
    }
  }

  if (tipoReal && !tipoCoincide(tipoReal, extension, entrada.tipoDeclarado)) {
    señales.push({
      tipo: 'tipo-discrepante',
      descripcion: `Tipo real (${tipoReal}) no coincide con extensión (.${extension})${entrada.tipoDeclarado ? ` ni tipo declarado (${entrada.tipoDeclarado})` : ''}`,
      severidad: 'media',
    });
  }

  return señales;
}

function calcularNivelRiesgo(señales: SeñalRiesgo[]): NivelRiesgo {
  if (señales.some(s => s.severidad === 'alta')) return 'alto';
  if (señales.some(s => s.severidad === 'media')) return 'medio';
  return 'bajo';
}

function generarResumen(resultado: Omit<ResultadoAnalisisSeguridad, 'resumen'>): string {
  const partes: string[] = [];
  partes.push(`Tipo real: ${resultado.tipoReal}`);
  partes.push(`Extensión: .${resultado.extension || 'ninguna'}`);
  partes.push(`Coincide: ${resultado.coincideTipoExtension ? 'Sí' : 'No'}`);
  partes.push(`Hash SHA-256: ${resultado.hashSha256.slice(0, 16)}...`);
  if (resultado.firmaEjecutable) {
    partes.push(`Firma: ${resultado.firmaEjecutable.tipo} (${resultado.firmaEjecutable.arquitectura || 'desconocida'})`);
  }
  if (resultado.señalesRiesgo.length > 0) {
    partes.push(`Señales de riesgo (${resultado.señalesRiesgo.length}): ${resultado.señalesRiesgo.map(s => s.descripcion).join('; ')}`);
  } else {
    partes.push('Sin señales de riesgo detectadas');
  }
  partes.push(`Nivel de riesgo: ${resultado.nivelRiesgo.toUpperCase()}`);
  return partes.join('\n');
}

export async function analizarSeguridad(entrada: EntradaAnalisis): Promise<ResultadoAnalisisSeguridad> {
  const extension = obtenerExtension(entrada.nombre);
  const tipoReal = detectarTipoReal(entrada.inicio) || 'desconocido';
  const coincide = tipoReal !== 'desconocido' ? tipoCoincide(tipoReal, extension, entrada.tipoDeclarado) : false;
  const hashSha256 = await calcularSha256(entrada.inicio);
  const firmaEjecutable = detectarFirmaEjecutable(entrada.inicio);
  const señalesRiesgo = detectarSenalesRiesgo(entrada, tipoReal === 'desconocido' ? null : tipoReal);
  const nivelRiesgo = calcularNivelRiesgo(señalesRiesgo);

  const resultadoBase = {
    tipoReal,
    extension,
    coincideTipoExtension: coincide,
    hashSha256,
    firmaEjecutable,
    señalesRiesgo,
    nivelRiesgo,
  };

  return {
    ...resultadoBase,
    resumen: generarResumen(resultadoBase),
  };
}

export function antivirusDisponibles(): TipoAntivirus[] {
  return ['clamav', 'xprotect', 'defender'];
}

export async function ejecutarAntivirus(
  antivirus: TipoAntivirus,
  _datos: Uint8Array,
  _nombre: string
): Promise<ResultadoAntivirus> {
  switch (antivirus) {
    case 'clamav':
      return {
        antivirus: 'clamav',
        ejecutado: false,
        error: 'ClamAV no disponible en el entorno actual (requiere daemon clamd)',
      };
    case 'xprotect':
      return {
        antivirus: 'xprotect',
        ejecutado: false,
        error: 'XProtect no accesible programáticamente (sistema macOS)',
      };
    case 'defender':
      return {
        antivirus: 'defender',
        ejecutado: false,
        error: 'Windows Defender no disponible en este entorno',
      };
    default:
      return {
        antivirus,
        ejecutado: false,
        error: `Antivirus desconocido: ${antivirus}`,
      };
  }
}

export async function analizarConAntivirus(
  entrada: EntradaAnalisis,
  antivirusPreferidos?: TipoAntivirus[]
): Promise<ResultadoAnalisisSeguridad & { antivirus?: ResultadoAntivirus }> {
  const analisis = await analizarSeguridad(entrada);

  const disponibles = antivirusDisponibles();
  const orden = antivirusPreferidos?.filter(a => disponibles.includes(a)) ?? disponibles;

  for (const av of orden) {
    const resultado = await ejecutarAntivirus(av, entrada.inicio, entrada.nombre);
    if (resultado.ejecutado) {
      return { ...analisis, antivirus: resultado };
    }
  }

  return { ...analisis, antivirus: undefined };
}