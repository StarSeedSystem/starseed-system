/**
 * REPARACIÓN DE CABECERA WAV (Ola 263 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * ffmpeg no conoce el tamaño final cuando escribe un WAV a stdout (`-f wav -`)
 * y deja los tamaños RIFF/data en «desconocido» (0xFFFFFFFF). El demonio de voz
 * aplica el tono así (ver `aplicarPitch` en native/astraura-voice/daemon.mjs) y
 * el WAV resultante «dura» 89 s aunque tenga 3: los reproductores estrictos y
 * `<audio>` muestran duración infinita o lo rechazan. Este módulo recalcula
 * ambos tamaños a partir del búfer REAL y sabe leer la duración real.
 *
 * Es un espejo puro (sin DOM, sin Node) de `repararCabeceraWav` del daemon para
 * que el frontend (y los tests) validen/reparen el mismo contrato.
 */

/** "RIFF" + tamaño + "WAVE": lo mínimo para poder recorrer chunks. */
const CABECERA_MINIMA = 12;

/** Tamaño que ffmpeg escribe cuando NO conoce el final (0xFFFFFFFF). */
const TAMANO_DESCONOCIDO = 0xffffffff;

interface FragmentoFmt {
    sampleRate: number;
    canales: number;
    bits: number;
}

interface RecorridoWav {
    /** `fmt ` si apareció antes de `data` (en un WAV bien formado siempre). */
    fmt: FragmentoFmt | null;
    /** Byte donde empiezan las muestras (justo tras la cabecera del chunk). */
    offsetData: number;
    /** Tamaño declarado del chunk `data` tal cual lo escribió el codificador. */
    tamanoDeclarado: number;
}

/** U16 little-endian (WAV es 100% LE). */
function leerU16(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

/** U32 little-endian (WAV es 100% LE). */
function leerU32(bytes: Uint8Array, offset: number): number {
    // `>>> 0` fuerza unsigned: sin él, un tamaño ≥ 2 GB se volvería negativo.
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/** Los cuatro bytes del identificador de un chunk como texto ("RIFF", "fmt "…). */
function textoAscii(bytes: Uint8Array, desde: number, hasta: number): string {
    let salida = "";
    for (let i = desde; i < hasta; i += 1) salida += String.fromCharCode(bytes[i]);
    return salida;
}

/** Escribe un U32 little-endian EN SITIO (el búfer ya es una copia del llamador). */
function escribirU32LE(bytes: Uint8Array, offset: number, valor: number): void {
    bytes[offset] = valor & 0xff;
    bytes[offset + 1] = (valor >>> 8) & 0xff;
    bytes[offset + 2] = (valor >>> 16) & 0xff;
    bytes[offset + 3] = (valor >>> 24) & 0xff;
}

function recorrerChunksWav(bytes: Uint8Array): RecorridoWav | null {
    // Sin RIFF/WAVE no hay nada que recorrer: el llamador trata el búfer tal
    // cual está (lo respetamos; no es labor de este módulo juzgar otros formatos).
    if (bytes.length < CABECERA_MINIMA) return null;
    if (textoAscii(bytes, 0, 4) !== "RIFF" || textoAscii(bytes, 8, 12) !== "WAVE") return null;
    let pos = CABECERA_MINIMA;
    let fmt: FragmentoFmt | null = null;
    // Recorrido con ToC: cada chunk son 8 bytes de cabecera (id + tamaño LE) y
    // el cuerpo alineado a 2 bytes. Nos detenemos en `data` porque lo que va
    // tras las muestras no nos hace falta (suelen ser chunks de cola de ffmpeg).
    while (pos + 8 <= bytes.length) {
        const id = textoAscii(bytes, pos, pos + 4);
        const tamano = leerU32(bytes, pos + 4);
        const offsetCuerpo = pos + 8;
        if (id === "fmt ") {
            // fmt mínimo: 16 bytes (PCM). WAVE_FORMAT_EXTENSIBLE trae más, pero
            // sampleRate/canales/bits están en las mismas posiciones.
            if (offsetCuerpo + 16 > bytes.length) return null;
            const sampleRate = leerU32(bytes, offsetCuerpo + 4);
            const canales = leerU16(bytes, offsetCuerpo + 2);
            const bits = leerU16(bytes, offsetCuerpo + 14);
            if (sampleRate > 0 && canales > 0 && bits > 0) {
                fmt = { sampleRate, canales, bits };
            }
        }
        if (id === "data") {
            return { fmt, offsetData: offsetCuerpo, tamanoDeclarado: tamano };
        }
        // Un tamaño corrupto que se salga del búfer no puede llevarnos a un
        // `data` legítimo: el WAV está roto más allá de una reparación de tamaños.
        if (tamano > bytes.length - offsetCuerpo) return null;
        pos = offsetCuerpo + tamano + (tamano % 2);
    }
    return null;
}

/**
 * Valida `RIFF`/`WAVE`, recorre los chunks (`fmt `, `LIST`, `data`…) y, si el
 * chunk `data` declara un tamaño mayor que los bytes restantes (o el
 * «desconocido» 0xFFFFFFFF de ffmpeg), escribe `dataSize = total − offsetData`
 * y `riffSize = total − 8` (little-endian) devolviendo una copia corregida.
 * Si la cabecera ya es coherente devuelve los mismos bytes, sin copiar.
 */
export function repararCabeceraWav(bytes: Uint8Array): Uint8Array {
    const recorrido = recorrerChunksWav(bytes);
    if (!recorrido) return bytes;
    const { offsetData, tamanoDeclarado } = recorrido;
    const bytesPresentes = bytes.length - offsetData;
    // Solo reparamos si el tamaño declarado miente: el «desconocido» de ffmpeg
    // (0xFFFFFFFF) o cualquier valor mayor que los bytes que quedan.
    if (tamanoDeclarado <= bytesPresentes && tamanoDeclarado !== TAMANO_DESCONOCIDO) {
        // Cabecera coherente: los mismos bytes, sin copiar.
        return bytes;
    }
    // Copia corregida: dataSize = total − offsetData y riffSize = total − 8.
    const copia = new Uint8Array(bytes.length);
    copia.set(bytes);
    escribirU32LE(copia, 4, copia.length - 8);
    escribirU32LE(copia, offsetData - 4, copia.length - offsetData);
    return copia;
}

/**
 * Duración real en segundos a partir de `fmt` (sampleRate, canales, bits) y el
 * tamaño REAL de `data` (el mínimo entre lo declarado y lo que hay en el búfer,
 * para no contar basura final ni el 0xFFFFFFFF de ffmpeg). `null` si no se
 * puede leer (no es WAV, falta `fmt `/`data` o formato sin bytes por muestra).
 */
export function duracionWavSegundos(bytes: Uint8Array): number | null {
    const recorrido = recorrerChunksWav(bytes);
    if (!recorrido?.fmt) return null;
    const { fmt, offsetData, tamanoDeclarado } = recorrido;
    // Tamaño REAL de data: el mínimo entre lo declarado y lo que hay. Con el
    // 0xFFFFFFFF de ffmpeg gana lo real; con un WAV que trae basura tras las
    // muestras gana lo declarado (no contamos la basura como audio).
    const bytesPresentes = bytes.length - offsetData;
    const tamanoReal = Math.min(tamanoDeclarado, bytesPresentes);
    if (tamanoReal < 0) return null;
    const bytesPorMuestra = fmt.bits / 8;
    if (!Number.isFinite(bytesPorMuestra) || bytesPorMuestra <= 0) return null;
    const bytesPorFotograma = fmt.canales * bytesPorMuestra;
    if (bytesPorFotograma <= 0) return null;
    const segundos = tamanoReal / (fmt.sampleRate * bytesPorFotograma);
    return Number.isFinite(segundos) && segundos >= 0 ? segundos : null;
}
