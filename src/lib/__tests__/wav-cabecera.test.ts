import { describe, expect, it } from "vitest";
import { duracionWavSegundos, repararCabeceraWav } from "@/lib/voces/wav";

// Tests de la reparación de cabecera WAV (2026-09-07, Ola 263). ffmpeg escribe
// tamaños «desconocidos» (0xFFFFFFFF) cuando genera WAV a stdout (`-f wav -`)
// y `repararCabeceraWav` debe reescribirlos con los valores reales del búfer.

/** El «desconocido» de ffmpeg: -1 como U32 little-endian. */
const DESCONOCIDO = 0xffffffff;

/** Layout del WAV de prueba: RIFF(12) + fmt(8+16) [+ LIST(8+4)] + data(8) + muestras. */
const FIN_FMT = 12 + 8 + 16; // 36: byte justo tras el chunk `fmt `
const OFFSET_DATA_SIN_LIST = FIN_FMT + 8; // 44: cuerpo de `data` (cabecera en 36)
const BYTES_LIST = 8 + 4; // 12: cabecera LIST + cuerpo "INFO" (par, sin relleno)
const OFFSET_DATA_CON_LIST = OFFSET_DATA_SIN_LIST + BYTES_LIST; // 56

/** Escribe un U32 little-endian en el búfer (WAV es 100% LE). */
function u32LE(buf: Uint8Array, offset: number, valor: number): void {
    buf[offset] = valor & 0xff;
    buf[offset + 1] = (valor >>> 8) & 0xff;
    buf[offset + 2] = (valor >>> 16) & 0xff;
    buf[offset + 3] = (valor >>> 24) & 0xff;
}

/** Lee un U32 little-endian del búfer. */
function leerU32(buf: Uint8Array, offset: number): number {
    return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}

/** Escribe texto ASCII en el búfer ("RIFF", "fmt "…). */
function ascii(buf: Uint8Array, offset: number, texto: string): void {
    for (let i = 0; i < texto.length; i += 1) buf[offset + i] = texto.charCodeAt(i);
}

/**
 * Construye en memoria un WAV PCM mínimo: `RIFF` + `fmt ` + [`LIST`] + `data`.
 * Los tamaños RIFF/data se inyectan tal cual (nos permite fabricar el estado
 * «desconocido» que deja ffmpeg al escribir a stdout) y las muestras son un
 * patrón determinista: 1 s = 48.000 bytes a 24 kHz mono 16 bits.
 */
function wavEnMemoria(opciones: { conList?: boolean; riff?: number; data?: number; muestras?: number }): Uint8Array {
    const conList = opciones.conList === true;
    const riff = opciones.riff ?? DESCONOCIDO;
    const data = opciones.data ?? DESCONOCIDO;
    const muestras = opciones.muestras ?? 48000;
    const offsetData = conList ? OFFSET_DATA_CON_LIST : OFFSET_DATA_SIN_LIST;
    const total = offsetData + muestras;
    const buf = new Uint8Array(total);
    // "RIFF" + tamaño RIFF + "WAVE".
    ascii(buf, 0, "RIFF");
    u32LE(buf, 4, riff);
    ascii(buf, 8, "WAVE");
    // "fmt ": PCM (1) mono (1) 16 bits a 24 kHz → byteRate 48.000, block 2.
    // El cuerpo de fmt empieza en 20 (12 de RIFF + 8 de cabecera del chunk).
    ascii(buf, 12, "fmt ");
    u32LE(buf, 16, 16); // tamaño del cuerpo de fmt
    buf[20] = 0x01; // audioFormat = PCM
    buf[22] = 0x01; // canales = 1
    u32LE(buf, 24, 24000); // sampleRate
    u32LE(buf, 28, 48000); // byteRate
    buf[32] = 2; // blockAlign
    buf[34] = 16; // bits
    if (conList) {
        // "LIST" se cuela entre `fmt ` y `data` (metadatos tipo INFO): su cuerpo
        // "INFO" es par, así que el recorrido no consume byte de relleno.
        ascii(buf, FIN_FMT, "LIST");
        u32LE(buf, FIN_FMT + 4, 4);
        ascii(buf, FIN_FMT + 8, "INFO");
    }
    // "data" + tamaño declarado + muestras con patrón repetido.
    ascii(buf, offsetData - 8, "data");
    u32LE(buf, offsetData - 4, data);
    for (let i = offsetData; i < total; i += 1) buf[i] = (i * 7) & 0xff;
    return buf;
}

describe("repararCabeceraWav (Ola 263)", () => {
    it("corrige un WAV de 1 s con data y RIFF en 0xFFFFFFFF", () => {
        const original = wavEnMemoria({}); // tamaños «desconocidos» de ffmpeg
        const reparado = repararCabeceraWav(original);
        // Debe ser una COPIA corregida, no los mismos bytes.
        expect(reparado).not.toBe(original);
        expect(reparado.length).toBe(original.length);
        const offsetData = OFFSET_DATA_SIN_LIST;
        expect(leerU32(reparado, 4)).toBe(reparado.length - 8);
        expect(leerU32(reparado, offsetData - 4)).toBe(reparado.length - offsetData);
        // Tras reparar, la duración leída es la real: 48.000 bytes de muestras
        // a 24.000 Hz × 1 canal × 2 bytes/muestra = 1 s.
        expect(duracionWavSegundos(reparado)).toBeCloseTo(1.0, 5);
    });

    it("devuelve idéntico (misma referencia) un WAV ya coherente", () => {
        const muestras = 48000;
        const offsetData = OFFSET_DATA_SIN_LIST;
        const correcto = wavEnMemoria({ riff: offsetData + muestras - 8, data: muestras });
        const resultado = repararCabeceraWav(correcto);
        expect(resultado).toBe(correcto);
        // Y la duración también se entiende sin reparar nada.
        expect(duracionWavSegundos(correcto)).toBeCloseTo(1.0, 5);
    });

    it("repara también un WAV con un chunk LIST antes de data", () => {
        const original = wavEnMemoria({ conList: true });
        const reparado = repararCabeceraWav(original);
        expect(reparado).not.toBe(original);
        const offsetData = OFFSET_DATA_CON_LIST;
        expect(leerU32(reparado, 4)).toBe(reparado.length - 8);
        expect(leerU32(reparado, offsetData - 4)).toBe(reparado.length - offsetData);
        expect(duracionWavSegundos(reparado)).toBeCloseTo(1.0, 5);
    });

    it("devuelve los mismos bytes si no es un WAV (sin RIFF/WAVE)", () => {
        const basura = new Uint8Array(64).fill(0x00);
        expect(repararCabeceraWav(basura)).toBe(basura);
        expect(duracionWavSegundos(basura)).toBeNull();
    });
});

describe("duracionWavSegundos (Ola 263)", () => {
    it("lee la duración real aunque el tamaño declarado mienta (0xFFFFFFFF)", () => {
        // El 0xFFFFFFFF de ffmpeg NO engaña a la lectura: se usa el mínimo
        // entre lo declarado y los bytes presentes del búfer.
        const roto = wavEnMemoria({ muestras: 96000 }); // 2 s de audio
        expect(duracionWavSegundos(roto)).toBeCloseTo(2.0, 5);
    });

    it("devuelve null en un WAV sin fmt legible antes de data", () => {
        const roto = wavEnMemoria({});
        // Degradamos el búfer: queda «RIFF…WAVE» + un data sin fmt previo.
        const sinFmt = new Uint8Array(roto.length);
        sinFmt.set(roto.subarray(0, 12), 0);
        ascii(sinFmt, 12, "data");
        u32LE(sinFmt, 16, roto.length - 20);
        expect(duracionWavSegundos(sinFmt)).toBeNull();
    });
});
