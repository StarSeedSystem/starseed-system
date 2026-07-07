/*
 * simple-zip — ZIP mínimo SIN dependencias (método "STORE": sin compresión).
 * ═══════════════════════════════════════════════════════════════════════════
 * El repo no trae ninguna librería de zip (JSZip/fflate…) y añadir una nueva
 * dependencia exige tocar package-lock/instalar paquetes, fuera del alcance
 * de esta tarea ("No git/build"). El formato ZIP con compresión "STORE"
 * (0 = sin comprimir) es un subconjunto simple y bien documentado del
 * estándar: cabecera local + datos crudos + directorio central + EOCD, cada
 * entrada con su CRC-32. Cualquier descompresor real (macOS Finder, Windows,
 * unzip, 7-Zip…) abre estos archivos sin problema — el "no comprimir" solo
 * afecta al tamaño, nunca a la validez del formato.
 *
 * Uso: `buildZipBlob(entries)` para EXPORTAR (Descargar, §16); `listZipEntries`
 * para "ver contenido" de un .zip ya existente (§18) sin descomprimir nada
 * (lee solo el directorio central: nombres + tamaños).
 */

export interface ZipEntryInput {
    /** Ruta dentro del zip (usa "/" como separador; sin barra inicial). */
    path: string;
    data: Uint8Array | string;
}

export interface ZipListedEntry {
    name: string;
    /** Tamaño sin comprimir en bytes (según el directorio central). */
    size: number;
    isDirectory: boolean;
}

const textEncoder = new TextEncoder();

export function textToBytes(s: string): Uint8Array {
    return textEncoder.encode(s);
}

/* ───────────────────────── CRC-32 (tabla precalculada) ───────────────────────── */

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
    if (crcTable) return crcTable;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    crcTable = table;
    return table;
}

function crc32(bytes: Uint8Array): number {
    const table = getCrcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/* ───────────────────────── Fecha/hora en formato DOS (requerido por ZIP) ───────────────────────── */

function dosDateTime(d: Date): { date: number; time: number } {
    const year = Math.max(1980, d.getFullYear());
    const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    return { date: date & 0xffff, time: time & 0xffff };
}

/* ───────────────────────── Escritura de enteros little-endian ───────────────────────── */

function writeUint32LE(view: DataView, offset: number, value: number): void {
    view.setUint32(offset, value >>> 0, true);
}
function writeUint16LE(view: DataView, offset: number, value: number): void {
    view.setUint16(offset, value & 0xffff, true);
}

/**
 * Construye un .zip válido (método STORE, sin compresión) a partir de una
 * lista de entradas {path, data}. Nunca lanza por una entrada individual mal
 * formada (se omite); si TODAS fallan, devuelve un zip vacío pero válido.
 */
export function buildZipBlob(entries: ZipEntryInput[], now: Date = new Date()): Blob {
    const { date, time } = dosDateTime(now);
    const parts: BlobPart[] = [];
    const centralParts: BlobPart[] = [];
    let offset = 0;
    let centralSize = 0;
    let count = 0;

    for (const entry of entries) {
        let bytes: Uint8Array;
        try {
            bytes = typeof entry.data === "string" ? textToBytes(entry.data) : entry.data;
        } catch {
            continue;
        }
        const nameBytes = textToBytes(entry.path.replace(/^\/+/, ""));
        const crc = crc32(bytes);

        // Cabecera local de archivo (30 bytes fijos + nombre).
        const local = new ArrayBuffer(30);
        const lv = new DataView(local);
        writeUint32LE(lv, 0, 0x04034b50); // firma
        writeUint16LE(lv, 4, 20); // versión mínima
        writeUint16LE(lv, 6, 0); // flags
        writeUint16LE(lv, 8, 0); // método: 0 = STORE
        writeUint16LE(lv, 10, time);
        writeUint16LE(lv, 12, date);
        writeUint32LE(lv, 14, crc);
        writeUint32LE(lv, 18, bytes.length); // tamaño comprimido = sin comprimir
        writeUint32LE(lv, 22, bytes.length);
        writeUint16LE(lv, 26, nameBytes.length);
        writeUint16LE(lv, 28, 0); // extra length

        // `new Uint8Array(view)` (un solo argumento ArrayLike) siempre reserva un
        // ArrayBuffer real nuevo → tipo `Uint8Array<ArrayBuffer>`, compatible con
        // `BlobPart` (TS 5.9 distingue ArrayBuffer de ArrayBufferLike/Shared).
        parts.push(local, new Uint8Array(nameBytes), new Uint8Array(bytes));
        const localHeaderSize = 30 + nameBytes.length + bytes.length;

        // Entrada de directorio central (46 bytes fijos + nombre).
        const central = new ArrayBuffer(46);
        const cv = new DataView(central);
        writeUint32LE(cv, 0, 0x02014b50);
        writeUint16LE(cv, 4, 20); // versión que lo creó
        writeUint16LE(cv, 6, 20); // versión mínima
        writeUint16LE(cv, 8, 0);
        writeUint16LE(cv, 10, 0);
        writeUint16LE(cv, 12, time);
        writeUint16LE(cv, 14, date);
        writeUint32LE(cv, 16, crc);
        writeUint32LE(cv, 20, bytes.length);
        writeUint32LE(cv, 24, bytes.length);
        writeUint16LE(cv, 28, nameBytes.length);
        writeUint16LE(cv, 30, 0); // extra
        writeUint16LE(cv, 32, 0); // comment
        writeUint16LE(cv, 34, 0); // disco inicial
        writeUint16LE(cv, 36, 0); // atributos internos
        writeUint32LE(cv, 38, 0); // atributos externos
        writeUint32LE(cv, 42, offset); // offset a la cabecera local

        centralParts.push(central, new Uint8Array(nameBytes));
        centralSize += 46 + nameBytes.length;

        offset += localHeaderSize;
        count++;
    }

    // End Of Central Directory (EOCD, 22 bytes).
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    writeUint32LE(ev, 0, 0x06054b50);
    writeUint16LE(ev, 4, 0);
    writeUint16LE(ev, 6, 0);
    writeUint16LE(ev, 8, count);
    writeUint16LE(ev, 10, count);
    writeUint32LE(ev, 12, centralSize);
    writeUint32LE(ev, 16, offset);
    writeUint16LE(ev, 20, 0); // sin comentario

    return new Blob([...parts, ...centralParts, eocd], { type: "application/zip" });
}

/**
 * Lee SOLO el directorio central de un .zip (nombres + tamaños), sin
 * descomprimir nada — "ver contenido" honesto y barato (§18). Busca la firma
 * EOCD desde el final del buffer (tolera comentarios cortos al final).
 * Devuelve `[]` si el buffer no parece un zip válido (nunca lanza).
 */
export function listZipEntries(buffer: ArrayBuffer, maxEntries = 500): ZipListedEntry[] {
    try {
        const bytes = new Uint8Array(buffer);
        const view = new DataView(buffer);
        const EOCD_SIG = 0x06054b50;
        const searchFrom = Math.max(0, bytes.length - 22 - 65535);
        let eocdOffset = -1;
        for (let i = bytes.length - 22; i >= searchFrom; i--) {
            if (view.getUint32(i, true) === EOCD_SIG) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset < 0) return [];

        const total = view.getUint16(eocdOffset + 10, true);
        const centralOffset = view.getUint32(eocdOffset + 16, true);
        const out: ZipListedEntry[] = [];
        let cursor = centralOffset;
        const CENTRAL_SIG = 0x02014b50;

        for (let i = 0; i < total && i < maxEntries; i++) {
            if (cursor + 46 > bytes.length) break;
            if (view.getUint32(cursor, true) !== CENTRAL_SIG) break;
            const size = view.getUint32(cursor + 24, true);
            const nameLen = view.getUint16(cursor + 28, true);
            const extraLen = view.getUint16(cursor + 30, true);
            const commentLen = view.getUint16(cursor + 32, true);
            const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLen);
            const name = new TextDecoder().decode(nameBytes);
            out.push({ name, size, isDirectory: name.endsWith("/") });
            cursor += 46 + nameLen + extraLen + commentLen;
        }
        return out;
    } catch {
        return [];
    }
}
