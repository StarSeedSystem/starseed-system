/**
 * NFC de las neuronas · Tarjeta de neurona firmada (NFC1126A · §1)
 * Formato ≤ 1 KB, codificación NDEF binaria compacta, verificación Ed25519.
 * Módulo PURO: sin red, sin disco, sin procesos.
 */

export const VERSION_TARJETA = 1;
export const VALIDEZ_SEGUNDOS = 30;
export const MAX_TARJETA_BYTES = 1024;

export type IdentidadPrivacidad =
    | { tipo: "hash"; valor: string }
    | { tipo: "alias"; valor: string }
    | { tipo: "nada" };

export type TipoOferta = "capacidad" | "capa" | "almacenamiento" | "senal" | "internet";

export interface OfertaNeurona {
    tipo: TipoOferta;
    nombre: string;
    habilitada: boolean;
    bytes?: number;
}

export type TipoTransporte = "ble" | "wifi-direct" | "malla";

export interface TransporteNeurona {
    tipo: TipoTransporte;
    direccion: string;
}

export interface TarjetaNeurona {
    v: number;
    neuronaId: string;
    identidad: IdentidadPrivacidad;
    claveEfimera: Uint8Array;
    firma: Uint8Array;
    nonce: Uint8Array;
    timestamp: number;
    ofertas: OfertaNeurona[];
    transportes: TransporteNeurona[];
}

export interface ResultadoVerificacion {
    ok: boolean;
    motivo?: "formato" | "firma" | "caducada" | "nonce_repetido";
    tarjeta?: TarjetaNeurona;
}

const TIPO_OFERTA_ID: Record<TipoOferta, number> = {
    capacidad: 0,
    capa: 1,
    almacenamiento: 2,
    senal: 3,
    internet: 4,
};

const ID_TIPO_OFERTA: Record<number, TipoOferta> = {
    0: "capacidad",
    1: "capa",
    2: "almacenamiento",
    3: "senal",
    4: "internet",
};

const TIPO_TRANSPORTE_ID: Record<TipoTransporte, number> = {
    ble: 0,
    "wifi-direct": 1,
    malla: 2,
};

const ID_TIPO_TRANSPORTE: Record<number, TipoTransporte> = {
    0: "ble",
    1: "wifi-direct",
    2: "malla",
};

const IDENTIDAD_TIPO_ID: Record<IdentidadPrivacidad["tipo"], number> = {
    hash: 0,
    alias: 1,
    nada: 2,
};

const ID_IDENTIDAD_TIPO: Record<number, IdentidadPrivacidad["tipo"]> = {
    0: "hash",
    1: "alias",
    2: "nada",
};

function escribirUint16(view: DataView, offset: number, value: number): number {
    view.setUint16(offset, value, true);
    return offset + 2;
}

function leerUint16(view: DataView, offset: number): { value: number; offset: number } {
    const value = view.getUint16(offset, true);
    return { value, offset: offset + 2 };
}

function escribirString(view: DataView, offset: number, str: string): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    view.setUint8(offset, bytes.length);
    offset++;
    new Uint8Array(view.buffer, offset, bytes.length).set(bytes);
    return offset + bytes.length;
}

function leerString(view: DataView, offset: number): { value: string; offset: number } {
    const len = view.getUint8(offset);
    offset++;
    const decoder = new TextDecoder();
    const value = decoder.decode(new Uint8Array(view.buffer, offset, len));
    return { value, offset: offset + len };
}

function escribirUint8Array(view: DataView, offset: number, arr: Uint8Array): number {
    view.setUint8(offset, arr.length);
    offset++;
    new Uint8Array(view.buffer, offset, arr.length).set(arr);
    return offset + arr.length;
}

function leerUint8Array(view: DataView, offset: number): { value: Uint8Array; offset: number } {
    const len = view.getUint8(offset);
    offset++;
    const value = new Uint8Array(view.buffer, offset, len);
    return { value, offset: offset + len };
}

export function codificarTarjeta(t: TarjetaNeurona): Uint8Array {
    const partes: Uint8Array[] = [];

    const push = (bytes: Uint8Array) => partes.push(bytes);

    push(new Uint8Array([t.v]));
    push(new Uint8Array([t.neuronaId.length, ...new TextEncoder().encode(t.neuronaId)]));

    const idTipo = IDENTIDAD_TIPO_ID[t.identidad.tipo];
    push(new Uint8Array([idTipo]));
    if (t.identidad.tipo !== "nada") {
        push(new Uint8Array([t.identidad.valor.length, ...new TextEncoder().encode(t.identidad.valor)]));
    }

    push(new Uint8Array([t.claveEfimera.length, ...t.claveEfimera]));
    push(new Uint8Array([t.firma.length, ...t.firma]));
    push(new Uint8Array([t.nonce.length, ...t.nonce]));

    const tsBytes = new Uint8Array(8);
    const dvTs = new DataView(tsBytes.buffer);
    dvTs.setBigUint64(0, BigInt(t.timestamp), true);
    push(tsBytes);

    push(new Uint8Array([t.ofertas.length]));
    for (const o of t.ofertas) {
        push(new Uint8Array([TIPO_OFERTA_ID[o.tipo]]));
        push(new Uint8Array([o.nombre.length, ...new TextEncoder().encode(o.nombre)]));
        push(new Uint8Array([o.habilitada ? 1 : 0]));
        if (o.bytes !== undefined) {
            const b = new Uint8Array(4);
            new DataView(b.buffer).setUint32(0, o.bytes, true);
            push(new Uint8Array([1, ...b]));
        } else {
            push(new Uint8Array([0]));
        }
    }

    push(new Uint8Array([t.transportes.length]));
    for (const tr of t.transportes) {
        push(new Uint8Array([TIPO_TRANSPORTE_ID[tr.tipo]]));
        push(new Uint8Array([tr.direccion.length, ...new TextEncoder().encode(tr.direccion)]));
    }

    let total = 0;
    for (const p of partes) total += p.length;
    if (total > MAX_TARJETA_BYTES) {
        throw new Error(`Tarjeta supera ${MAX_TARJETA_BYTES} bytes: ${total}`);
    }

    const resultado = new Uint8Array(total);
    let offset = 0;
    for (const p of partes) {
        resultado.set(p, offset);
        offset += p.length;
    }
    return resultado;
}

export function decodificarTarjeta(bytes: Uint8Array): TarjetaNeurona | null {
    if (bytes.length === 0 || bytes.length > MAX_TARJETA_BYTES) return null;

    let offset = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    try {
        const v = view.getUint8(offset++);
        if (v !== VERSION_TARJETA) return null;

        const neuronaIdLen = view.getUint8(offset++);
        const neuronaId = new TextDecoder().decode(new Uint8Array(view.buffer, offset, neuronaIdLen));
        offset += neuronaIdLen;

        const idTipoNum = view.getUint8(offset++);
        const idTipo = ID_IDENTIDAD_TIPO[idTipoNum];
        if (!idTipo) return null;

        let identidad: IdentidadPrivacidad;
        if (idTipo === "nada") {
            identidad = { tipo: "nada" };
        } else {
            const valorLen = view.getUint8(offset++);
            const valor = new TextDecoder().decode(new Uint8Array(view.buffer, offset, valorLen));
            offset += valorLen;
            identidad = { tipo: idTipo, valor };
        }

        const claveEfimeraLen = view.getUint8(offset++);
        const claveEfimera = new Uint8Array(view.buffer, offset, claveEfimeraLen);
        offset += claveEfimeraLen;

        const firmaLen = view.getUint8(offset++);
        const firma = new Uint8Array(view.buffer, offset, firmaLen);
        offset += firmaLen;

        const nonceLen = view.getUint8(offset++);
        const nonce = new Uint8Array(view.buffer, offset, nonceLen);
        offset += nonceLen;

        const timestamp = Number(view.getBigUint64(offset, true));
        offset += 8;

        const ofertasLen = view.getUint8(offset++);
        const ofertas: OfertaNeurona[] = [];
        for (let i = 0; i < ofertasLen; i++) {
            const tipoNum = view.getUint8(offset++);
            const tipo = ID_TIPO_OFERTA[tipoNum];
            if (!tipo) return null;

            const nombreLen = view.getUint8(offset++);
            const nombre = new TextDecoder().decode(new Uint8Array(view.buffer, offset, nombreLen));
            offset += nombreLen;

            const habilitada = view.getUint8(offset++) === 1;

            const tieneBytes = view.getUint8(offset++) === 1;
            let bytesOferta: number | undefined;
            if (tieneBytes) {
                bytesOferta = view.getUint32(offset, true);
                offset += 4;
            }

            ofertas.push({ tipo, nombre, habilitada, ...(bytesOferta !== undefined ? { bytes: bytesOferta } : {}) });
        }

        const transportesLen = view.getUint8(offset++);
        const transportes: TransporteNeurona[] = [];
        for (let i = 0; i < transportesLen; i++) {
            const tipoNum = view.getUint8(offset++);
            const tipo = ID_TIPO_TRANSPORTE[tipoNum];
            if (!tipo) return null;

            const dirLen = view.getUint8(offset++);
            const direccion = new TextDecoder().decode(new Uint8Array(view.buffer, offset, dirLen));
            offset += dirLen;

            transportes.push({ tipo, direccion });
        }

        return {
            v,
            neuronaId,
            identidad,
            claveEfimera,
            firma,
            nonce,
            timestamp,
            ofertas,
            transportes,
        };
    } catch {
        return null;
    }
}

function datosParaFirma(t: TarjetaNeurona): Uint8Array {
    const partes: Uint8Array[] = [];
    partes.push(new Uint8Array([t.v]));
    partes.push(new TextEncoder().encode(t.neuronaId));
    if (t.identidad.tipo !== "nada") {
        partes.push(new TextEncoder().encode(t.identidad.valor));
    }
    partes.push(t.claveEfimera);
    partes.push(t.nonce);
    const ts = new Uint8Array(8);
    new DataView(ts.buffer).setBigUint64(0, BigInt(t.timestamp), true);
    partes.push(ts);
    for (const o of t.ofertas) {
        partes.push(new TextEncoder().encode(`${o.tipo}:${o.nombre}:${o.habilitada}:${o.bytes ?? 0}`));
    }
    for (const tr of t.transportes) {
        partes.push(new TextEncoder().encode(`${tr.tipo}:${tr.direccion}`));
    }
    let total = 0;
    for (const p of partes) total += p.length;
    const resultado = new Uint8Array(total);
    let offset = 0;
    for (const p of partes) {
        resultado.set(p, offset);
        offset += p.length;
    }
    return resultado;
}

async function verificarFirmaEd25519(
    clavePublica: Uint8Array,
    firma: Uint8Array,
    datos: Uint8Array,
): Promise<boolean> {
    try {
        const crypto = globalThis.crypto?.subtle;
        if (!crypto) return false;
        const key = await crypto.importKey(
            "raw",
            clavePublica,
            { name: "Ed25519" },
            false,
            ["verify"],
        );
        return await crypto.verify("Ed25519", key, firma, datos);
    } catch {
        return false;
    }
}

export async function verificarTarjeta(
    bytes: Uint8Array,
    noncesVistos: Set<string>,
): Promise<ResultadoVerificacion> {
    const tarjeta = decodificarTarjeta(bytes);
    if (!tarjeta) return { ok: false, motivo: "formato" };

    const ahora = Date.now();
    if (Math.abs(ahora - tarjeta.timestamp) > VALIDEZ_SEGUNDOS * 1000) {
        return { ok: false, motivo: "caducada" };
    }

    const nonceKey = Array.from(tarjeta.nonce).join(",");
    if (noncesVistos.has(nonceKey)) {
        return { ok: false, motivo: "nonce_repetido" };
    }

    const datos = datosParaFirma(tarjeta);
    const firmaValida = await verificarFirmaEd25519(tarjeta.claveEfimera, tarjeta.firma, datos);
    if (!firmaValida) {
        return { ok: false, motivo: "firma" };
    }

    noncesVistos.add(nonceKey);
    return { ok: true, tarjeta };
}