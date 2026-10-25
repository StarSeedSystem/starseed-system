// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversor por la malla · ZIP mínimo (módulo PURO, en .mjs)
// ----------------------------------------------------------------------------
// El equivalente TS usa `src/lib/files/simple-zip.ts`, que no se puede importar
// desde .mjs. Cuando Filee deja varias salidas (un PDF de 12 páginas a PNG) el
// servicio las empaqueta en un ZIP (almacén, sin compresión: lo importante es
// que cualquier sistema lo abra). Sin red, sin disco, sin `node:*`.
// ════════════════════════════════════════════════════════════════════════════

const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** [{ path, data: Uint8Array }] → ZIP en U8, sin comprimir. PURA. */
export function zipArchivos(entradas) {
    if (!entradas?.length) throw new Error("ZIP sin archivos.");
    const te = new TextEncoder();
    const nombres = entradas.map((e) => te.encode(String(e.path).replace(/[\\/]+/g, "_")));
    const datos = entradas.map((e) => (e.data instanceof Uint8Array ? e.data : new Uint8Array(0)));
    const crcs = datos.map(crc32);
    let locals = 0;
    for (let i = 0; i < datos.length; i++) locals += 30 + nombres[i].length + datos[i].length;
    const centrados = datos.length * 46 + nombres.reduce((a, n) => a + n.length, 0);
    const total = locals + centrados + 22;
    // Comprobación de 4 GB por archivo y de tamaño total antes de tocar nada.
    for (const d of datos) if (d.byteLength > 0xffffffff) throw new Error("Archivo demasiado grande para ZIP.");
    const buf = new Uint8Array(total);
    const dv = new DataView(buf.buffer);
    let off = 0;
    const offsets = [];
    for (let i = 0; i < datos.length; i++) {
        offsets.push(off);
        dv.setUint32(off, 0x04034b50, true);
        dv.setUint16(off + 4, 20, true);
        dv.setUint16(off + 6, 0x800, true); // nombres UTF-8
        dv.setUint16(off + 8, 0, true); // almacén, sin comprimir
        dv.setUint32(off + 14, crcs[i], true);
        dv.setUint32(off + 18, datos[i].length, true);
        dv.setUint32(off + 22, datos[i].length, true);
        dv.setUint16(off + 26, nombres[i].length, true);
        buf.set(nombres[i], off + 30);
        buf.set(datos[i], off + 30 + nombres[i].length);
        off += 30 + nombres[i].length + datos[i].length;
    }
    const inicioCd = off;
    for (let i = 0; i < datos.length; i++) {
        dv.setUint32(off, 0x02014b50, true);
        dv.setUint16(off + 4, 20, true);
        dv.setUint16(off + 6, 20, true);
        dv.setUint16(off + 8, 0x800, true);
        dv.setUint32(off + 16, crcs[i], true);
        dv.setUint32(off + 20, datos[i].length, true);
        dv.setUint32(off + 24, datos[i].length, true);
        dv.setUint16(off + 28, nombres[i].length, true);
        dv.setUint32(off + 42, offsets[i], true);
        buf.set(nombres[i], off + 46);
        off += 46 + nombres[i].length;
    }
    dv.setUint32(off, 0x06054b50, true);
    dv.setUint16(off + 8, datos.length, true);
    dv.setUint16(off + 10, datos.length, true);
    dv.setUint32(off + 12, off - inicioCd, true);
    dv.setUint32(off + 16, inicioCd, true);
    return buf;
}
