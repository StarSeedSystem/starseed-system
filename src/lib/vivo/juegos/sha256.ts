/**
 * SHA-256 síncrono y puro (FIPS 180-4). Se usa en el «compromiso» del Dibujo-adivina: el
 * dibujante publica el hash de la palabra antes de dibujar y la revela al terminar, así todos
 * pueden comprobar que no la cambió. Las reglas puras del juego no pueden esperar a `crypto.subtle`
 * (es asíncrono), por eso vive aquí.
 */

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotd(x: number, n: number): number {
    return (x >>> n) | (x << (32 - n));
}

/** Codifica una cadena en UTF-8 sin depender de `TextEncoder`. */
function utf8(texto: string): number[] {
    const bytes: number[] = [];
    for (const ch of texto) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp < 0x80) bytes.push(cp);
        else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
        else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return bytes;
}

export function sha256Hex(texto: string): string {
    const msg = utf8(texto);
    const bits = msg.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    const alto = Math.floor(bits / 0x100000000);
    const bajo = bits >>> 0;
    for (const v of [alto, bajo]) msg.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);

    const h = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Uint32Array(64);
    for (let i = 0; i < msg.length; i += 64) {
        for (let j = 0; j < 16; j++) {
            const o = i + j * 4;
            w[j] = ((msg[o] << 24) | (msg[o + 1] << 16) | (msg[o + 2] << 8) | msg[o + 3]) >>> 0;
        }
        for (let j = 16; j < 64; j++) {
            const s0 = rotd(w[j - 15], 7) ^ rotd(w[j - 15], 18) ^ (w[j - 15] >>> 3);
            const s1 = rotd(w[j - 2], 17) ^ rotd(w[j - 2], 19) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let j = 0; j < 64; j++) {
            const S1 = rotd(e, 6) ^ rotd(e, 11) ^ rotd(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K[j] + w[j]) >>> 0;
            const S0 = rotd(a, 2) ^ rotd(a, 13) ^ rotd(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0;
        h[1] = (h[1] + b) >>> 0;
        h[2] = (h[2] + c) >>> 0;
        h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0;
        h[5] = (h[5] + f) >>> 0;
        h[6] = (h[6] + g) >>> 0;
        h[7] = (h[7] + hh) >>> 0;
    }
    return Array.from(h, (v) => v.toString(16).padStart(8, "0")).join("");
}
