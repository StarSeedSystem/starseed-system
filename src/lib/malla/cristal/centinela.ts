export type Nivel = 'limpio' | 'sospechoso' | 'peligroso';

export interface ArchivoEntrada {
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

export interface ResultadoAnalisis {
  nivel: Nivel;
  motivos: string[];
}

/**
 * Comprueba si los bytes iniciales coinciden con una secuencia dada
 */
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

/**
 * Comprueba si los bytes iniciales coinciden con una secuencia dada (inverso)
 */
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

/**
 * Decodifica los primeros bytes como UTF-8 (máximo 64 KB)
 */
function obtenerInicioUTF8(inicio: Uint8Array, maxLongitud: number = 64 * 1024): string {
  const longitud = Math.min(inicio.length, maxLongitud);
  // Nota: En un entorno real, usaríamos TextDecoder, pero para evitar dependencias de node:*
  // asumimos que podemos construir una cadena desde los bytes UTF-8 válidos.
  // Para simplificar, usamos una aproximación que funcione para ASCII y UTF-8 básico.
  let resultado = '';
  for (let i = 0; i < longitud; i++) {
    // Esto solo funciona para ASCII (0-127). Para UTF-8 completo necesitaríamos más lógica.
    // Pero como estamos buscando patrones específicos (<script, javascript:, on...=) que son ASCII,
    // podemos usar esto.
    if (inicio[i] < 128) {
      resultado += String.fromCharCode(inicio[i]);
    } else {
      // Para bytes no ASCII, los ignoramos en la búsqueda de patrones ASCII.
      // Esto es seguro porque los patrones que buscamos son ASCII.
      resultado += '?';
    }
  }
  return resultado;
}

export function analizarArchivo(e: ArchivoEntrada): ResultadoAnalisis {
  const motivos: string[] = [];

  // 1. Comprobar condiciones de PELIGROSO

  // 1.1 Ejecutables por bytes mágicos
  const inicio = e.inicio;

  // MZ (DOS executable)
  if (comienzaCon(inicio, [0x4D, 0x5A])) {
    motivos.push('Ejecutable DOS (MZ) detectado por bytes mágicos');
  }

  // ELF (7F 45 4C 46)
  if (comienzaCon(inicio, [0x7F, 0x45, 0x4C, 0x46])) {
    motivos.push('Ejecutable ELF detectado por bytes mágicos');
  }

  // Mach-O (big endian: FE ED FA CE, FE ED FA CF, CA FE BA BE)
  if (comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCE]) ||
      comienzaCon(inicio, [0xFE, 0xED, 0xFA, 0xCF]) ||
      comienzaCon(inicio, [0xCA, 0xFE, 0xBA, 0xBE])) {
    motivos.push('Ejecutable Mach-O (big endian) detectado por bytes mágicos');
  }

  // Mach-O (little endian: inverso de los anteriores)
  if (comienzaConInverso(inicio, [0xFE, 0xED, 0xFA, 0xCE]) ||
      comienzaConInverso(inicio, [0xFE, 0xED, 0xFA, 0xCF]) ||
      comienzaConInverso(inicio, [0xCA, 0xFE, 0xBA, 0xBE])) {
    motivos.push('Ejecutable Mach-O (little endian) detectado por bytes mágicos');
  }

  // 1.2 Extensiones peligrosas
  const extension = e.nombre.split('.').pop()?.toLowerCase();
  const extensionesPeligrosas = new Set([
    'exe', 'dll', 'scr', 'bat', 'cmd', 'com', 'msi', 'ps1', 'vbs', 'jar', 'apk', 'dmg', 'pkg', 'app'
  ]);
  if (extension && extensionesPeligrosas.has(extension)) {
    motivos.push(`Extensión peligrosa: .${extension}`);
  }

  // 1.3 Doble extensión
  const partes = e.nombre.split('.');
  if (partes.length >= 3) {
    // Últimas dos extensiones
    const ultima = partes[partes.length - 1].toLowerCase();
    const penultima = partes[partes.length - 2].toLowerCase();
    // Si la penultima es una extensión común de archivo y la ultima es peligrosa
    const extensionesComunes = new Set(['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
    if (extensionesComunes.has(penultima) && extensionesPeligrosas.has(ultima)) {
      motivos.push(`Doble extensión sospechosa: .${penultima}.${ultima}`);
    }
  }

  // 1.4 Entradas de ZIP con .. o rutas absolutas
  if (e.entradasZip) {
    for (const entrada of e.entradasZip) {
      if (entrada.ruta.includes('..') || /^\/|^[A-Za-z]:\\/.test(entrada.ruta)) {
        motivos.push(`Entrada de ZIP con ruta de escape: ${entrada.ruta}`);
        break; // Solo necesitamos uno para marcar como peligroso
      }
    }
  }

  // 1.5 Ratio de compresión > 100 en una entrada de > 10 MB
  if (e.entradasZip) {
    for (const entrada of e.entradasZip) {
      const diezMB = 10 * 1024 * 1024; // 10 MB en bytes
      if (entrada.tamano > diezMB && entrada.comprimido > 0) {
        const ratio = entrada.tamano / entrada.comprimido;
        if (ratio > 100) {
          motivos.push(`Ratio de compresión excesivo: ${ratio.toFixed(2)} en entrada > 10 MB`);
          break;
        }
      }
    }
  }

  // Si encontramos algún motivo de peligroso, devolvemos inmediatamente
  if (motivos.length > 0) {
    return {
      nivel: 'peligroso',
      motivos
    };
  }

  // 2. Comprobar condiciones de SOSPECHOSO

  // 2.1 Tipo real no coincide con extensión o tipoDeclarado
  // Vamos a detectar el tipo real por bytes mágicos
  let tipoReal: string | null = null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (comienzaCon(inicio, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    tipoReal = 'PNG';
  }
  // JPEG: FF D8 FF
  else if (inicio.length >= 3 && comienzaCon(inicio, [0xFF, 0xD8, 0xFF])) {
    tipoReal = 'JPEG';
  }
  // GIF: 47 49 46 38 37 61 o 47 49 46 38 39 61
  else if (comienzaCon(inicio, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
           comienzaCon(inicio, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    tipoReal = 'GIF';
  }
  // PDF: 25 50 44 46 (%PDF)
  else if (comienzaCon(inicio, [0x25, 0x50, 0x44, 0x46])) {
    tipoReal = 'PDF';
  }
  // ZIP: 50 4B 03 04 o 50 4B 05 06 o 50 4B 07 08
  else if (comienzaCon(inicio, [0x50, 0x4B, 0x03, 0x04]) ||
           comienzaCon(inicio, [0x50, 0x4B, 0x05, 0x06]) ||
           comienzaCon(inicio, [0x50, 0x4B, 0x07, 0x08])) {
    tipoReal = 'ZIP';
  }
  // MP4: ftyp en los primeros 8 bytes (isobmp4)
  else if (inicio.length >= 8 && 
           inicio[4] === 0x66 && inicio[5] === 0x74 && inicio[6] === 0x79 && inicio[7] === 0x70) { // "ftyp"
    tipoReal = 'MP4';
  }
  // WEBP: 57 45 42 50 ("WEBP") seguido de más bytes
  else if (comienzaCon(inicio, [0x57, 0x45, 0x42, 0x50])) {
    tipoReal = 'WEBP';
  }
  // MP3 ID3: 49 44 33
  else if (comienzaCon(inicio, [0x49, 0x44, 0x33])) {
    tipoReal = 'MP3';
  }

  const extensionLower = e.nombre.split('.').pop()?.toLowerCase() ?? '';
  const tipoDeclaradoLower = e.tipoDeclarado?.toLowerCase() ?? '';

  // Función para verificar si el tipo real coincide con la extensión o tipo declarado
  function tipoCoincide(tipoReal: string): boolean {
    // Mapeo de tipos reales a extensiones esperadas
    const mapa: Record<string, string[]> = {
      'PNG': ['png'],
      'JPEG': ['jpg', 'jpeg'],
      'GIF': ['gif'],
      'PDF': ['pdf'],
      'ZIP': ['zip'],
      'MP4': ['mp4', 'm4v'],
      'WEBP': ['webp'],
      'MP3': ['mp3']
    };

    const extensionesEsperadas = mapa[tipoReal] || [];
    if (extensionesEsperadas.includes(extensionLower)) {
      return true;
    }

    // Verificar tipo declarado (puede ser MIME type)
    const mimeMap: Record<string, string[]> = {
      'PNG': ['image/png'],
      'JPEG': ['image/jpeg', 'image/jpg'],
      'GIF': ['image/gif'],
      'PDF': ['application/pdf'],
      'ZIP': ['application/zip', 'application/x-zip-compressed'],
      'MP4': ['video/mp4'],
      'WEBP': ['image/webp'],
      'MP3': ['audio/mpeg']
    };

    const tiposMimeEsperados = mimeMap[tipoReal] || [];
    return tiposMimeEsperados.some(tipo => tipoDeclaradoLower.includes(tipo));
  }

  if (tipoReal !== null && !tipoCoincide(tipoReal)) {
    motivos.push(`Tipo real (${tipoReal}) no coincide con la extensión (.${extensionLower}) o tipo declarado (${e.tipoDeclarado ?? 'ninguno'})`);
  }

  // 2.2 '#!' al inicio (shebang)
  if (inicio.length >= 2 && comienzaCon(inicio, [0x23, 0x21])) { // '#!'
    motivos.push('Shebang (#!) detectado al inicio del archivo');
  }

  // 2.3 HTML o SVG con <script, javascript: o on...= en los primeros 64 KB
  const inicioUTF8 = obtenerInicioUTF8(inicio);
  const inicioLower = inicioUTF8.toLowerCase();
  if (inicioLower.includes('<script') ||
      inicioLower.includes('javascript:') ||
      /on\w+\s*=/.test(inicioLower)) { // Coincide con on...=
    motivos.push('Contenido HTML/SVG con JavaScript detectado en los primeros 64 KB');
  }

  // 2.4 vbaProject.bin dentro de un ZIP de Office
  if (e.entradasZip) {
    for (const entrada of e.entradasZip) {
      if (entrada.ruta.toLowerCase() === 'vbaproject.bin') {
        motivos.push('Archivo vbaProject.bin encontrado dentro de un ZIP (posible macro de Office)');
        break;
      }
    }
  }

  // 2.5 PDF con '/JavaScript' o '/OpenAction'
  // Ya hemos detectado PDF arriba, ahora buscamos en el inicio
  if (tipoReal === 'PDF') {
    // Convertimos el inicio a string para buscar (asumiendo que es ASCII/UTF-8)
    const pdfInicio = obtenerInicioUTF8(inicio, 1000); // Primeros 1000 bytes deberían ser suficientes para estos marcadores
    if (pdfInicio.includes('/JavaScript') || pdfInicio.includes('/OpenAction')) {
      motivos.push('PDF contiene JavaScript o OpenAction');
    }
  }

  // Devolver resultado
  if (motivos.length > 0) {
    return {
      nivel: 'sospechoso',
      motivos
    };
  }

  // 3. Si nada de lo anterior, es limpio
  return {
    nivel: 'limpio',
    motivos: []
  };
}