import { ed25519 } from "@noble/curves/ed25519";
import { x25519 } from "@noble/curves/ed25519";

export type IdentidadCuenta =
    | { tipo: "hash"; valor: string }
    | { tipo: "alias"; valor: string }
    | { tipo: "nada" };

export type OfertaNeurona =
    | { tipo: "capacidad"; valor: string; datos: Record<string, unknown> }
    | { tipo: "capa"; valor: string; datos: Record<string, unknown> }
    | { tipo: "senal"; valor: string; datos: Record<string, unknown> }
    | { tipo: "almacenamiento"; valor: string; datos: Record<string, unknown> }
    | { tipo: "internet"; valor: string; datos: Record<string, unknown> };

export type TransporteNeurona =
    | { tipo: "ble"; direccion: string }
    | { tipo: "wifi-direct"; direccion: string }
    | { tipo: "malla"; direccion: string };

export interface TarjetaNeurona {
    version: number;
    neuronaId: string;
    identidadCuenta: IdentidadCuenta;
    claveEfimeraPublica: Uint8Array;
    firma: Uint8Array;
    nonce: Uint8Array;
    timestamp: number;
    ofertas: OfertaNeurona[];
    transportes: TransporteNeurona[];
}

const VERSION_TARJETA = 1;
const VALIDEZ_SEGUNDOS = 30;
const MAX_NDEF_BYTES = 1024;

function codificarUint16(valor: number): Uint8Array {
    return new Uint8Array([(valor >> 8) & 0xff, valor & 0xff]);
}

function decodificarUint16(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function codificarUint32(valor: number): Uint8Array {
    return new Uint8Array([
        (valor >> 24) & 0xff,
        (valor >> 16) & 0xff,
        (valor >> 8) & 0xff,
        valor & 0xff,
    ]);
}

function decodificarUint32(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
    );
}

function codificarString(str: string): Uint8Array {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const longitud = codificarUint16(bytes.length);
    return new Uint8Array([...longitud, ...bytes]);
}

function decodificarString(bytes: Uint8Array, offset: number): { valor: string; nuevoOffset: number } {
    const longitud = decodificarUint16(bytes, offset);
    const strBytes = bytes.slice(offset + 2, offset + 2 + longitud);
    const decoder = new TextDecoder();
    return { valor: decoder.decode(strBytes), nuevoOffset: offset + 2 + longitud };
}

function codificarIdentidadCuenta(id: IdentidadCuenta): Uint8Array {
    const partes: number[] = [];
    if (id.tipo === "hash") {
        partes.push(0x01);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(id.valor);
        partes.push(...codificarUint16(bytes.length), ...bytes);
    } else if (id.tipo === "alias") {
        partes.push(0x02);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(id.valor);
        partes.push(...codificarUint16(bytes.length), ...bytes);
    } else {
        partes.push(0x00);
    }
    return new Uint8Array(partes);
}

function decodificarIdentidadCuenta(bytes: Uint8Array, offset: number): { valor: IdentidadCuenta; nuevoOffset: number } {
    const tipo = bytes[offset];
    if (tipo === 0x00) {
        return { valor: { tipo: "nada" }, nuevoOffset: offset + 1 };
    }
    if (tipo === 0x01) {
        const { valor, nuevoOffset } = decodificarString(bytes, offset + 1);
        return { valor: { tipo: "hash", valor }, nuevoOffset };
    }
    if (tipo === 0x02) {
        const { valor, nuevoOffset } = decodificarString(bytes, offset + 1);
        return { valor: { tipo: "alias", valor }, nuevoOffset };
    }
    throw new Error(`Tipo de identidad de cuenta desconocido: ${tipo}`);
}

function codificarOferta(oferta: OfertaNeurona): Uint8Array {
    const partes: number[] = [];
    const tiposOferta: Record<string, number> = {
        capacidad: 0x01,
        capa: 0x02,
        senal: 0x03,
        almacenamiento: 0x04,
        internet: 0x05,
    };
    partes.push(tiposOferta[oferta.tipo]);
    const encoder = new TextEncoder();
    const valorBytes = encoder.encode(oferta.valor);
    partes.push(...codificarUint16(valorBytes.length), ...valorBytes);
    const datosStr = JSON.stringify(oferta.datos);
    const datosBytes = encoder.encode(datosStr);
    partes.push(...codificarUint16(datosBytes.length), ...datosBytes);
    return new Uint8Array(partes);
}

function decodificarOferta(bytes: Uint8Array, offset: number): { valor: OfertaNeurona; nuevoOffset: number } {
    const tipoByte = bytes[offset];
    let tipo: OfertaNeurona["tipo"];
    switch (tipoByte) {
        case 0x01:
            tipo = "capacidad";
            break;
        case 0x02:
            tipo = "capa";
            break;
        case 0x03:
            tipo = "senal";
            break;
        case 0x04:
            tipo = "almacenamiento";
            break;
        case 0x05:
            tipo = "internet";
            break;
        default:
            throw new Error(`Tipo de oferta desconocido: ${tipoByte}`);
    }
    const { valor, nuevoOffset: offsetValor } = decodificarString(bytes, offset + 1);
    const { valor: datosStr, nuevoOffset } = decodificarString(bytes, offsetValor);
    const datos = JSON.parse(datosStr) as Record<string, unknown>;
    return { valor: { tipo, valor, datos }, nuevoOffset };
}

function codificarTransporte(transporte: TransporteNeurona): Uint8Array {
    const partes: number[] = [];
    const tiposTransporte: Record<string, number> = {
        ble: 0x01,
        "wifi-direct": 0x02,
        malla: 0x03,
    };
    partes.push(tiposTransporte[transporte.tipo]);
    const encoder = new TextEncoder();
    const dirBytes = encoder.encode(transporte.direccion);
    partes.push(...codificarUint16(dirBytes.length), ...dirBytes);
    return new Uint8Array(partes);
}

function decodificarTransporte(bytes: Uint8Array, offset: number): { valor: TransporteNeurona; nuevoOffset: number } {
    const tipoByte = bytes[offset];
    let tipo: TransporteNeurona["tipo"];
    switch (tipoByte) {
        case 0x01:
            tipo = "ble";
            break;
        case 0x02:
            tipo = "wifi-direct";
            break;
        case 0x03:
            tipo = "malla";
            break;
        default:
            throw new Error(`Tipo de transporte desconocido: ${tipoByte}`);
    }
    const { valor, nuevoOffset } = decodificarString(bytes, offset + 1);
    return { valor: { tipo, direccion: valor }, nuevoOffset };
}

export function crearTarjetaNeurona(
    datos: Omit<TarjetaNeurona, "firma" | "version"> & { version?: number },
    clavePrivada: Uint8Array
): TarjetaNeurona {
    const version = datos.version ?? VERSION_TARJETA;
    const payload = serializarPayloadParaFirma({
        version,
        neuronaId: datos.neuronaId,
        identidadCuenta: datos.identidadCuenta,
        claveEfimeraPublica: datos.claveEfimeraPublica,
        nonce: datos.nonce,
        timestamp: datos.timestamp,
        ofertas: datos.ofertas,
        transportes: datos.transportes,
    });
    const firma = ed25519.sign(payload, clavePrivada);
    return {
        version,
        neuronaId: datos.neuronaId,
        identidadCuenta: datos.identidadCuenta,
        claveEfimeraPublica: datos.claveEfimeraPublica,
        firma,
        nonce: datos.nonce,
        timestamp: datos.timestamp,
        ofertas: datos.ofertas,
        transportes: datos.transportes,
    };
}

function serializarPayloadParaFirma(tarjeta: Omit<TarjetaNeurona, "firma">): Uint8Array {
    const partes: Uint8Array[] = [];
    partes.push(codificarUint16(tarjeta.version));
    partes.push(codificarString(tarjeta.neuronaId));
    partes.push(codificarIdentidadCuenta(tarjeta.identidadCuenta));
    partes.push(new Uint8Array([tarjeta.claveEfimeraPublica.length, ...tarjeta.claveEfimeraPublica]));
    partes.push(new Uint8Array([tarjeta.nonce.length, ...tarjeta.nonce]));
    partes.push(codificarUint32(tarjeta.timestamp));
    partes.push(codificarUint16(tarjeta.ofertas.length));
    for (const oferta of tarjeta.ofertas) {
        partes.push(codificarOferta(oferta));
    }
    partes.push(codificarUint16(tarjeta.transportes.length));
    for (const transporte of tarjeta.transportes) {
        partes.push(codificarTransporte(transporte));
    }
    const totalLength = partes.reduce((sum, p) => sum + p.length, 0);
    const resultado = new Uint8Array(totalLength);
    let offset = 0;
    for (const parte of partes) {
        resultado.set(parte, offset);
        offset += parte.length;
    }
    return resultado;
}

export function codificarTarjeta(tarjeta: TarjetaNeurona): Uint8Array {
    const partes: Uint8Array[] = [];
    partes.push(codificarUint16(tarjeta.version));
    partes.push(codificarString(tarjeta.neuronaId));
    partes.push(codificarIdentidadCuenta(tarjeta.identidadCuenta));
    partes.push(new Uint8Array([tarjeta.claveEfimeraPublica.length, ...tarjeta.claveEfimeraPublica]));
    partes.push(new Uint8Array([tarjeta.firma.length, ...tarjeta.firma]));
    partes.push(new Uint8Array([tarjeta.nonce.length, ...tarjeta.nonce]));
    partes.push(codificarUint32(tarjeta.timestamp));
    partes.push(codificarUint16(tarjeta.ofertas.length));
    for (const oferta of tarjeta.ofertas) {
        partes.push(codificarOferta(oferta));
    }
    partes.push(codificarUint16(tarjeta.transportes.length));
    for (const transporte of tarjeta.transportes) {
        partes.push(codificarTransporte(transporte));
    }
    const totalLength = partes.reduce((sum, p) => sum + p.length, 0);
    if (totalLength > MAX_NDEF_BYTES) {
        throw new Error(`Tarjeta excede ${MAX_NDEF_BYTES} bytes: ${totalLength}`);
    }
    const resultado = new Uint8Array(totalLength);
    let offset = 0;
    for (const parte of partes) {
        resultado.set(parte, offset);
        offset += parte.length;
    }
    return resultado;
}

export function decodificarTarjeta(bytes: Uint8Array): TarjetaNeurona {
    if (bytes.length < 4) {
        throw new Error("Datos NDEF demasiado cortos para ser una tarjeta válida");
    }
    let offset = 0;
    const version = decodificarUint16(bytes, offset);
    offset += 2;
    if (version !== VERSION_TARJETA) {
        throw new Error(`Versión de tarjeta no soportada: ${version}`);
    }
    const { valor: neuronaId, nuevoOffset: offsetNeurona } = decodificarString(bytes, offset);
    offset = offsetNeurona;
    const { valor: identidadCuenta, nuevoOffset: offsetIdentidad } = decodificarIdentidadCuenta(bytes, offset);
    offset = offsetIdentidad;
    const claveEfimeraLen = bytes[offset];
    offset += 1;
    const claveEfimeraPublica = bytes.slice(offset, offset + claveEfimeraLen);
    offset += claveEfimeraLen;
    const firmaLen = bytes[offset];
    offset += 1;
    const firma = bytes.slice(offset, offset + firmaLen);
    offset += firmaLen;
    const nonceLen = bytes[offset];
    offset += 1;
    const nonce = bytes.slice(offset, offset + nonceLen);
    offset += nonceLen;
    const timestamp = decodificarUint32(bytes, offset);
    offset += 4;
    const ofertasCount = decodificarUint16(bytes, offset);
    offset += 2;
    const ofertas: OfertaNeurona[] = [];
    for (let i = 0; i < ofertasCount; i++) {
        const { valor, nuevoOffset } = decodificarOferta(bytes, offset);
        ofertas.push(valor);
        offset = nuevoOffset;
    }
    const transportesCount = decodificarUint16(bytes, offset);
    offset += 2;
    const transportes: TransporteNeurona[] = [];
    for (let i = 0; i < transportesCount; i++) {
        const { valor, nuevoOffset } = decodificarTransporte(bytes, offset);
        transportes.push(valor);
        offset = nuevoOffset;
    }
    return {
        version,
        neuronaId,
        identidadCuenta,
        claveEfimeraPublica,
        firma,
        nonce,
        timestamp,
        ofertas,
        transportes,
    };
}

export interface VerificacionResultado {
    ok: boolean;
    error?: string;
}

export function verificarTarjeta(
    tarjeta: TarjetaNeurona,
    clavePublicaNeurona: Uint8Array,
    noncesVistos: Set<string>
): VerificacionResultado {
    const ahora = Date.now();
    if (ahora - tarjeta.timestamp > VALIDEZ_SEGUNDOS * 1000) {
        return { ok: false, error: "Tarjeta caducada (timestamp > 30s)" };
    }
    const nonceHex = Buffer.from(tarjeta.nonce).toString("hex");
    if (noncesVistos.has(nonceHex)) {
        return { ok: false, error: "Nonce repetido (posible replay)" };
    }
    const payload = serializarPayloadParaFirma({
        version: tarjeta.version,
        neuronaId: tarjeta.neuronaId,
        identidadCuenta: tarjeta.identidadCuenta,
        claveEfimeraPublica: tarjeta.claveEfimeraPublica,
        nonce: tarjeta.nonce,
        timestamp: tarjeta.timestamp,
        ofertas: tarjeta.ofertas,
        transportes: tarjeta.transportes,
    });
    try {
        const firmaValida = ed25519.verify(tarjeta.firma, payload, clavePublicaNeurona);
        if (!firmaValida) {
            return { ok: false, error: "Firma Ed25519 inválida" };
        }
    } catch {
        return { ok: false, error: "Error verificando firma" };
    }
    noncesVistos.add(nonceHex);
    return { ok: true };
}

export function generarClaveEfimera(): { privada: Uint8Array; publica: Uint8Array } {
    const privada = ed25519.utils.randomPrivateKey();
    const publica = x25519.getPublicKey(privada);
    return { privada, publica };
}

export function generarNonce(): Uint8Array {
    const nonce = new Uint8Array(16);
    crypto.getRandomValues(nonce);
    return nonce;
}