/**
 * voz-datos/codec — compresión de voz simple y robusta para «voz por enlace de datos» (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro (sin DOM, sin red). Voz a 16 kHz mono en PCM de 16 bits, tramas de 20 ms (320 muestras).
 *  · IMA-ADPCM (4 bits/muestra): 3 bytes de cabecera + 160 = 163 B por trama ≈ 65 kbps. Cada trama
 *    lleva su predictor e índice: perder una trama no estropea las siguientes.
 *  · μ-law (G.711, 8 bits/muestra): 320 B por trama = 128 kbps. Más simple y más pesado; solo si hace falta.
 *  · Opus (WebCodecs) no está aquí: lo envuelve `audio-web.ts` donde `AudioEncoder.isConfigSupported` lo diga.
 * Contrato: architecture/llamadas-telefonia.md § «Voz por enlace de datos (sin red IP)».
 */

export type CodecVoz = "opus" | "adpcm" | "mulaw";

export const FS_VOZ = 16_000;
export const MS_TRAMA = 20;
export const MUESTRAS_TRAMA = (FS_VOZ * MS_TRAMA) / 1000; // 320

export const CODECS_VOZ: readonly CodecVoz[] = ["opus", "adpcm", "mulaw"];

export function esCodecVoz(x: unknown): x is CodecVoz {
  return x === "opus" || x === "adpcm" || x === "mulaw";
}

/** kbps orientativos de cada códec sobre el enlace (sin contar el empaquetado de texto). */
export const KBPS_CODEC: Record<CodecVoz, number> = { opus: 24, adpcm: 65, mulaw: 128 };

/* ─────────────────────────────── conversiones ─────────────────────────────── */

export function aInt16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(-1, Math.min(1, f[i]));
    o[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  }
  return o;
}

export function aFloat32(p: Int16Array): Float32Array {
  const o = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) o[i] = p[i] / 32768;
  return o;
}

/** Remuestreo lineal simple (para micrófonos que no dan 16 kHz). */
export function remuestrear(entrada: Float32Array, deHz: number, aHz: number): Float32Array {
  if (deHz === aHz || entrada.length === 0) return entrada;
  const n = Math.max(1, Math.floor((entrada.length * aHz) / deHz));
  const salida = new Float32Array(n);
  const paso = deHz / aHz;
  for (let i = 0; i < n; i++) {
    const x = i * paso;
    const i0 = Math.floor(x);
    const i1 = Math.min(entrada.length - 1, i0 + 1);
    const f = x - i0;
    salida[i] = entrada[i0] * (1 - f) + entrada[i1] * f;
  }
  return salida;
}

/* ─────────────────────────────── μ-law ─────────────────────────────── */

const BIAS = 0x84;
const CLIP = 32635;

function muLawUna(muestra: number): number {
  let s = muestra;
  const signo = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exp = 7;
  for (let mascara = 0x4000; (s & mascara) === 0 && exp > 0; exp--, mascara >>= 1) {
    /* busca el exponente */
  }
  const mant = (s >> (exp + 3)) & 0x0f;
  return ~(signo | (exp << 4) | mant) & 0xff;
}

function muLawInversa(byte: number): number {
  const b = ~byte & 0xff;
  const signo = b & 0x80;
  const exp = (b >> 4) & 0x07;
  const mant = b & 0x0f;
  const s = (((mant << 3) + BIAS) << exp) - BIAS;
  return signo ? -s : s;
}

export function codificarMuLaw(pcm: Int16Array): Uint8Array {
  const o = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) o[i] = muLawUna(pcm[i]);
  return o;
}

export function decodificarMuLaw(b: Uint8Array): Int16Array {
  const o = new Int16Array(b.length);
  for (let i = 0; i < b.length; i++) o[i] = muLawInversa(b[i]);
  return o;
}

/* ─────────────────────────────── IMA-ADPCM ─────────────────────────────── */

const TABLA_PASO = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253,
  279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026,
  4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const TABLA_INDICE = [-1, -1, -1, -1, 2, 4, 6, 8];

function acotar16(v: number): number {
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v;
}

/**
 * Una trama: [predictor lo, predictor hi, índice, nibbles…]. El predictor inicial es la primera muestra
 * (cabecera), así la trama se decodifica sola. Muestras impares: el último nibble alto queda a cero.
 */
export function codificarAdpcm(pcm: Int16Array): Uint8Array {
  const n = pcm.length;
  if (n === 0) return new Uint8Array(0);
  const salida = new Uint8Array(3 + Math.ceil((n - 1) / 2));
  let pred = pcm[0];
  let idx = 0;
  salida[0] = pred & 0xff;
  salida[1] = (pred >> 8) & 0xff;
  salida[2] = idx;
  let nibbleAlto = false;
  let pos = 3;
  for (let i = 1; i < n; i++) {
    const paso = TABLA_PASO[idx];
    let dif = pcm[i] - pred;
    let codigo = 0;
    if (dif < 0) {
      codigo = 8;
      dif = -dif;
    }
    let delta = paso >> 3;
    if (dif >= paso) {
      codigo |= 4;
      dif -= paso;
      delta += paso;
    }
    if (dif >= paso >> 1) {
      codigo |= 2;
      dif -= paso >> 1;
      delta += paso >> 1;
    }
    if (dif >= paso >> 2) {
      codigo |= 1;
      delta += paso >> 2;
    }
    pred = acotar16(codigo & 8 ? pred - delta : pred + delta);
    idx = Math.max(0, Math.min(88, idx + TABLA_INDICE[codigo & 7]));
    if (!nibbleAlto) salida[pos] = codigo & 0x0f;
    else salida[pos++] |= (codigo & 0x0f) << 4;
    nibbleAlto = !nibbleAlto;
  }
  return salida;
}

/** `muestras`: cuántas muestras tiene la trama (la longitud de bytes no distingue par de impar). */
export function decodificarAdpcm(b: Uint8Array, muestras = 1 + (b.length - 3) * 2): Int16Array {
  if (b.length < 3 || muestras <= 0) return new Int16Array(0);
  const o = new Int16Array(muestras);
  let pred = (((b[1] << 8) | b[0]) << 16) >> 16;
  let idx = Math.max(0, Math.min(88, b[2]));
  o[0] = pred;
  let pos = 3;
  let nibbleAlto = false;
  for (let i = 1; i < muestras; i++) {
    if (pos >= b.length) break;
    const codigo = nibbleAlto ? (b[pos++] >> 4) & 0x0f : b[pos] & 0x0f;
    nibbleAlto = !nibbleAlto;
    const paso = TABLA_PASO[idx];
    let delta = paso >> 3;
    if (codigo & 4) delta += paso;
    if (codigo & 2) delta += paso >> 1;
    if (codigo & 1) delta += paso >> 2;
    pred = acotar16(codigo & 8 ? pred - delta : pred + delta);
    idx = Math.max(0, Math.min(88, idx + TABLA_INDICE[codigo & 7]));
    o[i] = pred;
  }
  return o;
}

/* ─────────────────────────────── API por códec ─────────────────────────────── */

/** Códecs que se codifican sin asincronía (todo menos Opus). */
export function codificarTrama(codec: Exclude<CodecVoz, "opus">, pcm: Int16Array): Uint8Array {
  return codec === "adpcm" ? codificarAdpcm(pcm) : codificarMuLaw(pcm);
}

export function decodificarTrama(codec: Exclude<CodecVoz, "opus">, bytes: Uint8Array, muestras = MUESTRAS_TRAMA): Int16Array {
  return codec === "adpcm" ? decodificarAdpcm(bytes, muestras) : decodificarMuLaw(bytes);
}

/** Relación señal/ruido en dB entre una señal y su versión decodificada (misma longitud). */
export function relacionSenalRuido(original: Int16Array, decodificada: Int16Array): number {
  const n = Math.min(original.length, decodificada.length);
  let sen = 0;
  let ruido = 0;
  for (let i = 0; i < n; i++) {
    sen += original[i] * original[i];
    const e = original[i] - decodificada[i];
    ruido += e * e;
  }
  if (ruido === 0) return Infinity;
  if (sen === 0) return -Infinity;
  return 10 * Math.log10(sen / ruido);
}

/**
 * Códec a usar: el mejor que los dos extremos soporten. Opus solo si ambos lo tienen; si no, ADPCM
 * (mitad de ancho de banda que μ-law); μ-law solo si el otro extremo no entiende ADPCM.
 */
export function elegirCodecComun(mios: readonly CodecVoz[], suyos: readonly CodecVoz[] | null | undefined): CodecVoz {
  const comunes = suyos ? mios.filter((c) => suyos.includes(c)) : [];
  for (const c of ["opus", "adpcm", "mulaw"] as const) if (comunes.includes(c)) return c;
  // Sin saber qué entiende el otro (aún no llegó su saludo): ADPCM, que toda versión de esta función habla.
  return mios.includes("adpcm") ? "adpcm" : "mulaw";
}
