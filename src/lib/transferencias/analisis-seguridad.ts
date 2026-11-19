// Análisis de seguridad pura de archivos/carpetas recibidos por la malla.
// Contrato:
// - Entrada = { nombre, tipoReal?, inicio:Uint8Array, tamano, entradasZip?, entradasCerebro?, ... }
// - Resultado = { nivel: 'limpio'|'sospechoso'|'peligroso', motivos:string[] }
// - Nunca ejecuta ni ejecuta ni instala sin aprobar; solo lee bytes o los lista.

export type Nivel = 'limpio' | 'sospechoso' | 'peligroso';

export interface AnalisisEntrada {
  nombre: string;
  tipoDeclarado?: string;
  inicio: Uint8Array;
  tamano: number;
  entradasZip?: Array<{ ruta: string; tamano: number; comprimido: number }>;
  entradasCerebro?: Array<{ ruta: string; tamano: number; tipo?: string }>;
  /** Para ejecución o instalación real: bits mágicos, hashes, firmas, etc. */
  potencialmenteEjecutable?: boolean;
}

export interface ResultadoAnalisis {
  nivel: Nivel;
  motivos: string[];
}

/** Comprueba si los bytes iniciales coinciden con una secuencia dada */
function comienzaCon(inicio: Uint8Array, secuencia: number[]): boolean {
  if (inicio.length < secuencia.length) {
    return false;
  }
  for (let i = 0; i < secuencia.length; i++) {
    if (inicio[i] !== secuencia[i]) {
      return false;
    }
  }
  return true;
}

/** Comprueba si los bytes iniciales coinciden con una secuencia dada (inverso) */
function comienzaConInverso(inicio: Uint8Array, secuencia: number[]): boolean {
  if (inicio.length < secuencia.length) {
    return false;
  }
  for (let i = 0; i < secuencia.length; i++) {
    if (inicio[i] !== secuencia[secuencia.length - 1 - i]) {
      return false;
    }
  }
  return true;
}

/** Decodifica los primeros bytes como texto plano (ASCII para buscar patrones) */
function obtenerInicioUTF8(inicio: Uint8Array): string {
  let resultado = '';
  for (let i = 0; i < inicio.length && i < 64 * 1024; i++) {
    if (inicio[i] < 128) {
      resultado += String.fromCharCode(inicio[i]);
    } else {
      resultado += '?';
    }
  }
  return resultado;
}

/** Extrae la extensión del nombre de archivo */
function extension(nombre: string): string {
  const partes = nombre.split('.');
  return partes.length > 1 ? partes.pop()!.toLowerCase() : '';
}

export function analizarArchivo(entrada: AnalisisEntrada): ResultadoAnalisis {
  const motivos: string[] = [];

  // 1) PELIGROSO — bloquear directamente

  // 1.1 Ejecutables por bytes mágicos
  const inicio = entrada.inicio;

  // MZ (EXE DOS)
  if (comienzaCon(inicio, [0x4D, 0x5A])) {
    motivos.push('Ejecutable DOS (MZ) detectado por bytes mágicos');
  }
  // ELF
  if (comienzaCon(inicio, [0x7F, 0x45, 0x4C, 0x46])) {
    motivos.push('Ejecutable ELF detectado por bytes mágicos');
  }
  // Mach-O (big endian)
  if (comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCE]) ||
      comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCF]) ||
      comienzaCon(inicio, [0xCA, 0xFE, 0xBA, 0xBE])) {
    motivos.push('Ejecutable Mach-O (big endian) detectado por bytes mágicos');
  }
  // Mach-O (little endian)
  if (comienzaConInverso(inicio, [0xFE, 0xED, 0xFA, 0xCE]) ||
      comienzaConInverso(inicio, [0xFE, 0xED, 0xFA, 0xCF]) ||
      comienzaConInverso(inicio, [0xCA, 0xFE, 0xBA, 0xBE])) {
    motivos.push('Ejecutable Mach-O (little endian) detectado por bytes mágicos');
  }

  // 1.2 Extensiones peligrosas
  const ext = extension(entrada.nombre);
  const extensionesPeligrosas = new Set([
    'exe', 'dll', 'scr', 'bat', 'cmd', 'com', 'msi', 'ps1', 'vbs', 'jar', 'apk', 'dmg', 'pkg', 'app',
  ]);
  if (extensionesPeligrosas.has(ext)) {
    motivos.push(`Extensión peligrosa: .${ext}`);
  }

  // 1.3 Doble extensión (.jpg.exe, .pdf.scr, etc.)
  const partes = entrada.nombre.split('.');
  if (partes.length >= 3) {
    const ultima = partes[partes.length - 1].toLowerCase();
    const penultima = partes[partes.length - 2].toLowerCase();
    const extensionesComunes = new Set([
      'jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    ]);
    if (extensionesComunes.has(penultima) && extensionesPeligrosas.has(ultima)) {
      motivos.push(`Doble extensión sospechosa: .${penultima}.${ultima}`);
    }
  }

  // 1.4 Rutas de escape en ZIP
  if (entrada.entradasZip) {
    for (const e of entrada.entradasZip) {
      if (e.ruta.includes('..') || /^\/|^[A-Za-z]:\\/.test(e.ruta)) {
        motivos.push(`Entrada de ZIP con ruta de escape: ${e.ruta}`);
        break;
      }
    }
  }

  // 1.5 Compresión excesiva (>100) en entrada >10 MB
  if (entrada.entradasZip) {
    const diezMB = 10 * 1024 * 1024;
    for (const e of entrada.entradasZip) {
      if (e.tamano > diezMB && e.comprimido > 0) {
        const ratio = e.tamano / e.comprimido;
        if (ratio > 100) {
          motivos.push(`Ratio de compresión excesivo: ${ratio.toFixed(2)} en entrada >10 MB`);
          break;
        }
      }
    }
  }

  // Si encontramos cualquier motivo de PELIGROSO, devolvemos inmediatamente
  if (motivos.length > 0) {
    return { nivel: 'peligroso', motivos };
  }

  // 2) SOSPECHOSO — advertir, no bloquear

  // 2.1 Tipo real vs extensión/tipo declarado
  let tipoReal: string | null = null;

  // PNG
  if (comienzaCon(inicio, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) tipoReal = 'PNG';
  // JPEG
  else if (inicio.length >= 3 && comienzaCon(inicio, [0xFF, 0xD8, 0xFF])) tipoReal = 'JPEG';
  // GIF
  else if (comienzaCon(inicio, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
           comienzaCon(inicio, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) tipoReal = 'GIF';
  // PDF
  else if (comienzaCon(inicio, [0x25, 0x50, 0x44, 0x46])) tipoReal = 'PDF';
  // ZIP
  else if (comienzaCon(inicio, [0x50, 0x4B, 0x03, 0x04]) ||
           comienzaCon(inicio, [0x50, 0x4B, 0x05, 0x06]) ||
           comienzaCon(inicio, [0x50, 0x4B, 0x07, 0x08])) tipoReal = 'ZIP';
  // MP4 (ftyp)
  else if (inicio.length >= 8 &&
           inicio[4] === 0x66 && inicio[5] === 0x74 && inicio[6] === 0x79 && inicio[7] === 0x70) tipoReal = 'MP4';
  // WEBP
  else if (comienzaCon(inicio, [0x57, 0x45, 0x42, 0x50])) tipoReal = 'WEBP';
  // MP3 (ID3)
  else if (comienzaCon(inicio, [0x49, 0x44, 0x33])) tipoReal = 'MP3';

  const tipoDeclaradoLower = entrada.tipoDeclarado?.toLowerCase() ?? '';

  const tiposCompatibles: Record<string, string[]> = {
    PNG: ['png'],
    JPEG: ['jpg', 'jpeg'],
    GIF: ['gif'],
    PDF: ['pdf'],
    ZIP: ['zip'],
    MP4: ['mp4', 'm4v'],
    WEBP: ['webp'],
    MP3: ['mp3'],
  };

  const mimeCompatibles: Record<string, string[]> = {
    PNG: ['image/png'],
    JPEG: ['image/jpeg', 'image/jpg'],
    GIF: ['image/gif'],
    PDF: ['application/pdf'],
    ZIP: ['application/zip', 'application/x-zip-compressed'],
    MP4: ['video/mp4'],
    WEBP: ['image/webp'],
    MP3: ['audio/mpeg'],
  };

  function coincide(tipo: string | null): boolean {
    if (!tipo) return true;
    const extOk = (tiposCompatibles[tipo] || []).includes(extension(entrada.nombre));
    const mimeOk = (mimeCompatibles[tipo] || []).some((m) => tipoDeclaradoLower.includes(m));
    return extOk || mimeOk;
  }

  if (tipoReal !== null && !coincide(tipoReal)) {
    motivos.push(`Tipo real (${tipoReal}) no coincide con la extensión (.${extension(entrada.nombre)}) o tipo declarado (${entrada.tipoDeclarado ?? 'ninguno'})`);
  }

  // 2.2 Shebang (#!)
  if (inicio.length >= 2 && comienzaCon(inicio, [0x23, 0x21])) {
    motivos.push('Shebang (#!) detectado al inicio del archivo');
  }

  // 2.3 HTML/SVG con <script, javascript: o on...= en los primeros 64 KB
  const inicioUTF8 = obtenerInicioUTF8(inicio);
  const inicioLower = inicioUTF8.toLowerCase();
  if (inicioLower.includes('<script') ||
      inicioLower.includes('javascript:') ||
      /on\w+\s*=/.test(inicioLower)) {
    motivos.push('Contenido HTML/SVG con JavaScript detectado en los primeros 64 KB');
  }

  // 2.4 vbaProject.bin dentro de un ZIP (Office)
  if (entrada.entradasZip) {
    for (const e of entrada.entradasZip) {
      if (e.ruta.toLowerCase() === 'vbaproject.bin') {
        motivos.push('Archivo vbaProject.bin encontrado dentro de un ZIP (posible macro de Office)');
        break;
      }
    }
  }

  // 2.5 PDF con /JavaScript o /OpenAction
  if (tipoReal === 'PDF') {
    const pdfInicio = obtenerInicioUTF8(inicio, 1000);
    if (pdfInicio.includes('/JavaScript') || pdfInicio.includes('/OpenAction')) {
      motivos.push('PDF contiene JavaScript o OpenAction');
    }
  }

  // 2.6 Entradas de cerebros con tipos sospechosos
  if (entrada.entradasCerebro) {
    for (const e of entrada.entradasCerebro) {
      const tipoEntrada = e.tipo?.toLowerCase();
      if (tipoEntrada === 'script' || tipoEntrada === 'executable' || tipoEntrada === 'run') {
        motivos.push(`Entrada de cerebro con tipo ejecutable sospechoso: ${e.ruta} (${tipoEntrada})`);
      }
    }
  }

  // 2.7 Compactación excesiva de archivos (.zip dentro de .zip)
  if (entrada.entradasZip) {
    for (const e of entrada.entradasZip) {
      if (extension(e.ruta) === 'zip') {
        motivos.push(`Archivo comprimido dentro de otro comprimido: ${e.ruta}`);
      }
    }
  }

  const nivel: Nivel = motivos.length > 0 ? 'sospechoso' : 'limpio';
  return { nivel, motivos };
}