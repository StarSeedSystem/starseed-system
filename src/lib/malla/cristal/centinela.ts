export type Nivel = 'limpio' | 'sospechoso' | 'peligroso';

const dangerousExtensions = new Set([
  '.exe', '.dll', '.scr', '.bat', '.cmd', '.com', '.msi', '.ps1', '.vbs', '.jar', '.apk', '.dmg', '.pkg', '.app'
]);

const isDangerousExtension = (nombre: string): boolean => {
  const dotIndex = nombre.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = nombre.substring(dotIndex).toLowerCase();
  return dangerousExtensions.has(ext);
};

const hasDoubleExtension = (nombre: string): boolean => {
  const dotIndex = nombre.lastIndexOf('.');
  if (dotIndex === -1) return false;
  // Check if there is at least one dot before the last dot
  const secondDotIndex = nombre.lastIndexOf('.', dotIndex - 1);
  if (secondDotIndex === -1) return false;
  const ext = nombre.substring(dotIndex).toLowerCase();
  return dangerousExtensions.has(ext);
};

const isExecutableMagic = (inicio: Uint8Array): boolean => {
  // MZ: 0x4D 0x5A
  if (inicio.length >= 2 && inicio[0] === 0x4D && inicio[1] === 0x5A) return true;
  // Inverse of MZ: 0x5A 0x4D
  if (inicio.length >= 2 && inicio[0] === 0x5A && inicio[1] === 0x4D) return true;

  // ELF: 0x7F 0x45 0x4C 0x46
  if (inicio.length >= 4 && 
      inicio[0] === 0x7F && 
      inicio[1] === 0x45 && 
      inicio[2] === 0x4C && 
      inicio[3] === 0x46) return true;
  // Inverse of ELF: 0x46 0x4C 0x45 0x7F
  if (inicio.length >= 4 && 
      inicio[0] === 0x46 && 
      inicio[1] === 0x4C && 
      inicio[2] === 0x45 && 
      inicio[3] === 0x7F) return true;

  // Mach-O 32-bit: 0xFE 0xED 0xFA 0xCE
  if (inicio.length >= 4 && 
      inicio[0] === 0xFE && 
      inicio[1] === 0xED && 
      inicio[2] === 0xFA && 
      inicio[3] === 0xCE) return true;
  // Inverse: 0xCE 0xFA 0xED 0xFE
  if (inicio.length >= 4 && 
      inicio[0] === 0xCE && 
      inicio[1] === 0xFA && 
      inicio[2] === 0xED && 
      inicio[3] === 0xFE) return true;

  // Mach-O 64-bit: 0xFE 0xED 0xFA 0xCF
  if (inicio.length >= 4 && 
      inicio[0] === 0xFE && 
      inicio[1] === 0xED && 
      inicio[2] === 0xFA && 
      inicio[3] === 0xCF) return true;
  // Inverse: 0xCF 0xFA 0xED 0xFE
  if (inicio.length >= 4 && 
      inicio[0] === 0xCF && 
      inception[1] === 0xFA && 
      inception[2] === 0xED && 
      inception[3] === 0xFE) return true;

  // Mach-O Universal: 0xCA 0xFE 0xBA 0xBE
  if (inicio.length >= 4 && 
      inicio[0] === 0xCA && 
      inicio[1] === 0xFE && 
      inicio[2] === 0xBA && 
      inicio[3] === 0xBE) return true;
  // Inverse: 0xBE 0xBA 0xFE 0xCA
  if (inicio.length >= 4 && 
      inicio[0] === 0xBE && 
      inicio[1] === 0xBA && 
      inicio[2] === 0xFE && 
      inicio[3] === 0xCA) return true;

  return false;
};

const getRealType = (inicio: Uint8Array): string | null => {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (inicio.length >= 8 && 
      inicio[0] === 0x89 && 
      inicio[1] === 0x50 && 
      inicio[2] === 0x4E && 
      inicio[3] === 0x47 && 
      inicio[4] === 0x0D && 
      inicio[5] === 0x0A && 
      inicio[6] === 0x1A && 
      inicio[7] === 0x0A) {
    return 'png';
  }
  // JPEG: FF D8 FF E0..FF D8 FF EF
  if (inicio.length >= 3 && 
      inicio[0] === 0xFF && 
      inicio[1] === 0xD8 && 
      inicio[2] === 0xFF) {
    return 'jpeg';
  }
  // GIF: GIF87a or GIF89a
  if (inicio.length >= 6 && 
      inicio[0] === 0x47 && // G
      inicio[1] === 0x49 && // I
      inicio[2] === 0x46 && // F
      inicio[3] === 0x38 && // 8
      inicio[4] === 0x37 && // 7
      inicio[5] === 0x61) { // a
    return 'gif';
  }
  if (inicio.length >= 6 && 
      inicio[0] === 0x47 && 
      inicio[1] === 0x49 && 
      inicio[2] === 0x46 && 
      inicio[3] === 0x38 && 
      inicio[4] === 0x39 && 
      inicio[5] === 0x61) {
    return 'gif';
  }
  // PDF: %PDF
  if (inicio.length >= 4 && 
      inicio[0] === 0x25 && // %
      inicio[1] === 0x50 && // P
      inicio[2] === 0x44 && // D
      inicio[3] === 0x46) { // F
    return 'pdf';
  }
  // ZIP: local file header 50 4B 03 04
  if (inicio.length >= 4 && 
      inicio[0] === 0x50 && 
      inicio[1] === 0x4B && 
      inicio[2] === 0x03 && 
      inicio[3] === 0x04) {
    return 'zip';
  }
  // MP4: look for 'ftyp' at offset 4
  if (inicio.length >= 8 && 
      inicio[4] === 0x66 && // f
      inicio[5] === 0x74 && // t
      inicio[6] === 0x79 && // y
      inicio[7] === 0x70) { // p
    return 'mp4';
  }
  // WEBP: RIFF header followed by WEBP
  if (inicio.length >= 12 && 
      inicio[0] === 0x52 && // R
      inicio[1] === 0x49 && // I
      inicio[2] === 0x46 && // F
      inicio[3] === 0x46 && // F
      // TODO: variable size, but we assume the WEBP marker is at offset 8
      inicio[8] === 0x57 && // W
      inicio[9] === 0x45 && // E
      inicio[10] === 0x42 && // B
      inicio[11] === 0x50) { // P
    return 'webp';
  }
  // MP3: ID3 tag
  if (inicio.length >= 3 && 
      inicio[0] === 0x49 && // I
      inicio[1] === 0x44 && // D
      inicio[2] === 0x33) { // 3
    return 'mp3';
  }
  return null;
};

const isDangerousZipEntry = (entradasZip: Array<{ruta: string; tamano: number; comprimido: number}>): {boolean: boolean; motivo?: string} => {
  for (const entrada of entradasZip) {
    // Check for path traversal: .. or absolute path
    if (entrada.ruta.includes('..') || entrada.ruta.startsWith('/')) {
      return {boolean: true, motivo: `Entrada de ZIP con ruta peligrosa: ${entrada.ruta}`};
    }
    // Check for vbaProject.bin
    if (entrada.ruta === 'vbaProject.bin') {
      return {boolean: true, motivo: `Entrada de ZIP contiene vbaProject.bin`};
    }
    // Check for compression bomb: ratio > 100 and uncompressed > 10 MB
    if (entrada.tamano > 10 * 1024 * 1024 && entrada.comprimido > 0) {
      const ratio = entrada.tamano / entrada.comprimido;
      if (ratio > 100) {
        return {boolean: true, motivo: `Entrada de ZIP con ratio de compresión sospechosamente alto: ${ratio}`};
      }
    }
  }
  return {boolean: false};
};

export function analizarArchivo(e: {
  nombre: string;
  tipoDeclarado?: string;
  inicio: Uint8Array;
  tamano: number;
    entradasZip?: Array<{ ruta: string; tamano: number; comprimido: number }>
}): {nivel: Nivel; motivos: string[]} {
  const motivos: string[] = [];
  let isPeligroso = false;
  let isSospechoso = false;

  // Check for executable magic bytes
  if (isExecutableMagic(e.inicio)) {
    motivos.push('Archivo ejecutable detectado por bytes mágicos');
    isPeligroso = true;
  }

  // Check for dangerous extension
  if (isDangerousExtension(e.nombre)) {
    motivos.push('Extensión de archivo peligrosa');
    isPeligroso = true;
  }

  // Check for double extension
  if (hasDoubleExtension(e.nombre)) {
    motivos.push('Doble extensión peligrosa detectada');
    isPeligroso = true;
  }

  // Check ZIP entries if provided
  if (e.entradasZip && e.entradasZip.length > 0) {
    const zipResult = isDangerousZipEntry(e.entradasZip);
    if (zipResult.boolean) {
      motivos.push(zipResult.motivo!);
      isPeligroso = true;
    }
  }

  // Check for shebang
  if (e.inicio.length >= 2 && e.inicio[0] === 0x23 && e.inicio[1] === 0x21) {
    motivos.push('Archivo comienza con shebang (#!)');
    isSospechoso = true;
  }

  // Check for real type vs extension and tipoDeclarado
  const realType = getRealType(e.inicio);
  if (realType !== null) {
    const ext = e.nombre.split('.').pop()?.toLowerCase() ?? '';
    const declaredType = e.tipoDeclarado?.toLowerCase() ?? '';

    let extensionMatch = false;
    let typeMatch = false;

    // Check extension match
    switch (realType) {
      case 'png':
        extensionMatch = ext === 'png';
        break;
      case 'jpeg':
        extensionMatch = ext === 'jpg' || ext === 'jpeg';
        break;
      case 'gif':
        extensionMatch = ext === 'gif';
        break;
      case 'pdf':
        extensionMatch = ext === 'pdf';
        break;
      case 'zip':
        extensionMatch = ext === 'zip';
        break;
      case 'mp4':
        extensionMatch = ext === 'mp4';
        break;
      case 'webp':
        extensionMatch = ext === 'webp';
        break;
      case 'mp3':
        extensionMatch = ext === 'mp3';
        break;
      default:
        extensionMatch = false;
    }

    // Check tipoDeclarado match
    switch (realType) {
      case 'png':
        typeMatch = declaredType === 'image/png';
        break;
      case 'jpeg':
        typeMatch = declaredType === 'image/jpeg';
        break;
      case 'gif':
        typeMatch = declaredType === 'image/gif';
        break;
      case 'pdf':
        typeMatch = declaredType === 'application/pdf';
        break;
      case 'zip':
        typeMatch = declaredType === 'application/zip';
        break;
      case 'mp4':
        typeMatch = declaredType === 'video/mp4';
        break;
      case 'webp':
        typeMatch = declaredType === 'image/webp';
        break;
      case 'mp3':
        typeMatch = declaredType === 'audio/mpeg';
        break;
      default:
        typeMatch = false;
    }

    if (!extensionMatch || !typeMatch) {
      motivos.push(`Tipo real (${realType}) no coincide con la extensión (${ext}) o tipo declarado (${declaredType})`);
      isSospechoso = true;
    }
  }

  // Check for HTML/JS dangers in the first 64 KB (we use the entire inicio, assuming it's at least 64 KB or we have the beginning)
  // We'll decode the inicio as UTF-8 and look for dangerous patterns
  if (e.inicio.length > 0) {
    try {
      // We'll use TextDecoder to decode the bytes as UTF-8
      const decoder = new TextDecoder('utf-8');
      const content = decoder.decode(e.inicio);
      // We'll look for the patterns (case-insensitive)
      const lowerContent = content.toLowerCase();
      if (lowerContent.includes('<script') || 
          lowerContent.includes('javascript:') || 
          /on\s*[a-zA-Z]+\s*=/.test(lowerContent)) {
        motivos.push('HTML o SVG con contenido peligroso (script, javascript: o on...)');
        isSospechoso = true;
      }
    } catch (e) {
      // If decoding fails, skip this check
      console.warn('Failed to decode inicio as UTF-8 for HTML/JS check');
    }
  }

  // Check for PDF JavaScript or OpenAction in the inicio
  // We'll decode as Latin-1 to safely get the ASCII characters
  if (e.inicio.length > 0) {
    try {
      const decoder = new TextDecoder('latin-1');
      const content = decoder.decode(e.inicio);
      if (content.includes('/JavaScript') || content.includes('/OpenAction')) {
        motivos.push('PDF contiene JavaScript o OpenAction');
        isSospechoso = true;
      }
    } catch (e) {
      // If decoding fails, skip
      console.warn('Failed to decode inicio as Latin-1 for PDF JS check');
    }
  }

  if (isPeligroso) {
    return {nivel: 'peligroso', motivos};
  }
  if (isSospechoso) {
    return {nivel: 'sospechoso', motivos};
  }
  return {nivel: 'limpio', motivos};
}
