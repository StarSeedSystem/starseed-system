export interface ZipEntry {
  nombre: string;
  datos: Uint8Array;
}

export interface ZipLeerOptions {
  maxTotal?: number; // máximo tamaño total del ZIP comprimido en bytes
  maxMiembros?: number; // máximo número de entradas en el ZIP
  maxDescomprimido?: number; // máximo tamaño total descomprimido en bytes
}

/* ───────────────────────── CRC-32 ───────────────────────── */
let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (!crcTable) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crcTable = table;
  }
  return crcTable;
}
function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ───────────────────────── Lectura LE ───────────────────────── */
function readU16(view: DataView, offset: number): number { return view.getUint16(offset, true); }
function readU32(view: DataView, offset: number): number { return view.getUint32(offset, true); }

/**
 * Lee un ZIP (métodos 0 y 8) y devuelve las entradas con su nombre y datos descomprimidos.
 * @param bytes - Contenido del ZIP como ArrayBuffer o Uint8Array.
 * @param options - Límites de seguridad.
 * @returns Promesa que se resuelve con un arreglo de entradas { nombre, datos }.
 * @throws Error si el ZIP está cifrado, tiene rutas peligrosas, supera límites o es una bomba.
 */
export async function leerZip(
  bytesInput: ArrayBuffer | Uint8Array,
  options: ZipLeerOptions = {}
): Promise<ZipEntry[]> {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = bytes.length;

  const { maxTotal = Number.POSITIVE_INFINITY, maxMiembros = Number.POSITIVE_INFINITY, maxDescomprimido = Number.POSITIVE_INFINITY } = options;

  // 1. EOCD
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  const startSearch = Math.max(0, length - 22 - 65535);
  for (let i = length - 22; i >= startSearch; i--) {
    if (readU32(view, i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('ZIP inválido: no se encontró el registro EOCD');

  // 2. Registro EOCD
  const totalEntries = readU16(view, eocdOffset + 10);
  const centralOffset = readU32(view, eocdOffset + 16);
  const centralSize = readU32(view, eocdOffset + 12);

  if (totalEntries > maxMiembros) throw new Error(`ZIP tiene demasiados miembros (${totalEntries} > ${maxMiembros})`);
  if (length > maxTotal) throw new Error(`ZIP supera el tamaño máximo permitido (${length} > ${maxTotal})`);

  // 3. Directorio central
  const entries: ZipEntry[] = [];
  let totalDecompressed = 0;
  let cursor = centralOffset;
  const CENTRAL_SIG = 0x02014b50;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > length) throw new Error('ZIP truncado: directorio central excede el tamaño del buffer');
    const sig = readU32(view, cursor);
    if (sig !== CENTRAL_SIG) throw new Error('ZIP inválido: firma de entrada de directorio central incorrecta');

    const gpBitFlag = readU16(view, cursor + 8);
    const compressionMethod = readU16(view, cursor + 10);
    const crc32Stored = readU32(view, cursor + 16);
    const compressedSize = readU32(view, cursor + 20);
    const filenameLength = readU16(view, cursor + 28);
    const extraFieldLength = readU16(view, cursor + 30);
    const fileCommentLength = readU16(view, cursor + 32);
    const relativeOffsetOfLocalHeader = readU32(view, cursor + 42);

    // 4. Validaciones de seguridad
    if (gpBitFlag & 0x0001) throw new Error('ZIP cifrado no soportado');
    if (compressionMethod !== 0 && compressionMethod !== 8) throw new Error(`Método de compresión no soportado: ${compressionMethod}`);

    const filenameStart = cursor + 46;
    const filenameBytes = bytes.slice(filenameStart, filenameStart + filenameLength);
    const filename = new TextDecoder().decode(filenameBytes);
    if (filename.includes('..') || filename.startsWith('/') || /^[a-zA-Z]:\\/.test(filename)) throw new Error(`Nombre de entrada peligroso: ${filename}`);

    // 5. Encabezado local
    const localHeaderOffset = relativeOffsetOfLocalHeader;
    if (localHeaderOffset + 30 > length) throw new Error('ZIP truncado: offset de encabezado local fuera de límites');
    const localSignature = readU32(view, localHeaderOffset);
    if (localSignature !== 0x04034b50) throw new Error('ZIP inválido: firma de encabezado local incorrecta');
    const localFilenameLength = readU16(view, localHeaderOffset + 26);
    const localExtraFieldLength = readU16(view, localHeaderOffset + 28);
    if (localFilenameLength !== filenameLength || localExtraFieldLength !== extraFieldLength) throw new Error('ZIP inválido: longitudes de nombre o campo extra no coinciden entre directorio central y encabezado local');
    const dataOffset = localHeaderOffset + 30 + filenameLength + localExtraFieldLength;
    if (dataOffset + compressedSize > length) throw new Error('ZIP truncado: datos comprimidos exceden el tamaño del buffer');

    // 6. Datos comprimidos
    const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize);

    // 7. Descompresión
    let decompressedData: Uint8Array;
    if (compressionMethod === 0) {
      decompressedData = new Uint8Array(compressedData);
    } else {
      // DEFLATE: usar DecompressionStream (asíncrono)
      decompressedData = await new Promise<Uint8Array>((resolve, reject) => {
        try {
          const stream = new DecompressionStream('deflate-raw');
          const reader = stream.getReader();
          const chunks: Uint8Array[] = [];
          let totalSize = 0;

          const pump = async () => {
            const { done, value } = await reader.read();
            if (done) { resolve(new Uint8Array(totalSize)); return; }
            chunks.push(value);
            totalSize += value.length;
            if (totalSize > maxDescomprimido) { reject(new Error(`Descompresión supera el límite de tamaño descomprimido (${totalSize} > ${maxDescomprimido})`)); reader.cancel(); return; }
            pump();
          };

          pump().catch(err => { reject(err); });
          reader.closed.then(() => {}, err => { reject(err); });
        } catch (err) { reject(err); }
      });
    }

    // 8. CRC-32
    if (crc32(decompressedData) !== crc32Stored) throw new Error(`CRC-32 no coincide para la entrada ${filename}`);

    // 9. Límite descomprimido
    totalDecompressed += decompressedData.length;
    if (totalDecompressed > maxDescomprimido) throw new Error(`Tamaño descomprimido total supera el límite (${totalDecompressed} > ${maxDescomprimido})`);

    // 10. Añadir entrada
    entries.push({ nombre: filename, datos: decompressedData });

    // Siguiente entrada
    cursor += 46 + filenameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}