// Tarjeta de neurona firmada para NFC (contrato: architecture/nfc-neuronas.md §1 y §7).
// Módulo puro: sin red, disco ni Node. La firma Ed25519 se comprueba con un
// verificador inyectado, así el mismo código sirve en navegador, app y servidor.

export const VERSION_TARJETA = 1;
export const MAX_BYTES_TARJETA = 1024;
export const VALIDEZ_MS = 30_000;
export const TIPO_MIME_NDEF = "application/vnd.starseed.neurona";

export type ModoCuenta = "hash" | "alias" | "nada";
export type TipoTransporte = "ble" | "wifi-direct" | "lan" | "malla";

export interface TarjetaNeurona {
  version: number;
  neuronaId: string;
  clavePublica: string; // Ed25519, hex de 64 caracteres
  cuenta: { modo: ModoCuenta; valor?: string };
  claveEfimera: string; // X25519, hex de 64 caracteres
  nonce: string; // hex, 16 a 64 caracteres
  emitidaEn: number; // ms desde epoch
  ofertas: string[];
  transportes: { tipo: TipoTransporte; direccion: string }[];
  firma: string; // Ed25519, hex de 128 caracteres
}

export type VerificadorFirma = (mensaje: Uint8Array, firmaHex: string, clavePublicaHex: string) => boolean;

export type ResultadoDecodificar =
  | { ok: true; tarjeta: TarjetaNeurona }
  | { ok: false; motivo: string };

export type MotivoRechazo = "firma" | "caducada" | "futura" | "repetida" | "formato";

export type ResultadoVerificar = { ok: true } | { ok: false; motivo: MotivoRechazo };

const HEX = (n: number) => new RegExp(`^[0-9a-f]{${n}}$`);
const TRANSPORTES: readonly string[] = ["ble", "wifi-direct", "lan", "malla"];
const MODOS: readonly string[] = ["hash", "alias", "nada"];

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

/** Bytes que se firman: la tarjeta sin `firma`, con las claves en orden fijo. */
export function bytesAFirmar(t: Omit<TarjetaNeurona, "firma">): Uint8Array {
  const { version, neuronaId, clavePublica, cuenta, claveEfimera, nonce, emitidaEn, ofertas, transportes } = t;
  const canon = { version, neuronaId, clavePublica, cuenta: { modo: cuenta.modo, valor: cuenta.valor ?? null }, claveEfimera, nonce, emitidaEn, ofertas, transportes: transportes.map((x) => ({ tipo: x.tipo, direccion: x.direccion })) };
  return enc.encode(JSON.stringify(canon));
}

function esTexto(v: unknown): v is string {
  return typeof v === "string";
}

/** Valida la forma de un objeto desconocido; devuelve la tarjeta o el motivo. */
export function validarForma(x: unknown): ResultadoDecodificar {
  if (typeof x !== "object" || x === null) return { ok: false, motivo: "no es un objeto" };
  const o = x as Record<string, unknown>;
  if (o.version !== VERSION_TARJETA) return { ok: false, motivo: "versión no soportada" };
  if (!esTexto(o.neuronaId) || o.neuronaId.length === 0 || o.neuronaId.length > 128) return { ok: false, motivo: "id de neurona" };
  if (!esTexto(o.clavePublica) || !HEX(64).test(o.clavePublica)) return { ok: false, motivo: "clave pública" };
  if (!esTexto(o.claveEfimera) || !HEX(64).test(o.claveEfimera)) return { ok: false, motivo: "clave efímera" };
  if (!esTexto(o.firma) || !HEX(128).test(o.firma)) return { ok: false, motivo: "firma" };
  if (!esTexto(o.nonce) || !/^[0-9a-f]{16,64}$/.test(o.nonce)) return { ok: false, motivo: "nonce" };
  if (typeof o.emitidaEn !== "number" || !Number.isFinite(o.emitidaEn)) return { ok: false, motivo: "hora" };
  const c = o.cuenta as Record<string, unknown> | null;
  if (typeof c !== "object" || c === null || !esTexto(c.modo) || !MODOS.includes(c.modo)) return { ok: false, motivo: "cuenta" };
  if (c.modo === "nada" ? c.valor !== undefined && c.valor !== null : !esTexto(c.valor) || c.valor.length === 0) return { ok: false, motivo: "cuenta" };
  if (!Array.isArray(o.ofertas) || !o.ofertas.every(esTexto)) return { ok: false, motivo: "ofertas" };
  if (!Array.isArray(o.transportes)) return { ok: false, motivo: "transportes" };
  for (const t of o.transportes as unknown[]) {
    const r = t as Record<string, unknown> | null;
    if (typeof r !== "object" || r === null || !esTexto(r.tipo) || !TRANSPORTES.includes(r.tipo) || !esTexto(r.direccion)) return { ok: false, motivo: "transportes" };
  }
  const valor = c.modo === "nada" ? undefined : (c.valor as string);
  const tarjeta: TarjetaNeurona = {
    version: VERSION_TARJETA, neuronaId: o.neuronaId, clavePublica: o.clavePublica, claveEfimera: o.claveEfimera,
    firma: o.firma, nonce: o.nonce, emitidaEn: o.emitidaEn, ofertas: o.ofertas as string[],
    cuenta: valor === undefined ? { modo: "nada" } : { modo: c.modo as ModoCuenta, valor },
    transportes: o.transportes as TarjetaNeurona["transportes"],
  };
  return { ok: true, tarjeta };
}

/** Registro NDEF MIME (un solo registro, MB+ME). Corto (SR) si el cuerpo cabe en 255 bytes. */
export function codificar(t: TarjetaNeurona): { ok: true; bytes: Uint8Array } | { ok: false; motivo: string } {
  const cuerpo = enc.encode(JSON.stringify(t));
  const tipo = enc.encode(TIPO_MIME_NDEF);
  const corto = cuerpo.length <= 255;
  const n = cuerpo.length;
  const cabecera = corto ? [0xd2, tipo.length, n] : [0xc2, tipo.length, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const bytes = new Uint8Array(cabecera.length + tipo.length + n);
  bytes.set(cabecera, 0);
  bytes.set(tipo, cabecera.length);
  bytes.set(cuerpo, cabecera.length + tipo.length);
  if (bytes.length > MAX_BYTES_TARJETA) return { ok: false, motivo: `la tarjeta pesa ${bytes.length} bytes (máximo ${MAX_BYTES_TARJETA})` };
  return { ok: true, bytes };
}

export function decodificar(bytes: Uint8Array): ResultadoDecodificar {
  if (bytes.length > MAX_BYTES_TARJETA) return { ok: false, motivo: "tarjeta demasiado grande" };
  if (bytes.length < 3) return { ok: false, motivo: "NDEF incompleto" };
  const flags = bytes[0];
  const corto = (flags & 0x10) !== 0;
  if ((flags & 0x07) !== 0x02 || (flags & 0xc0) !== 0xc0) return { ok: false, motivo: "no es un registro MIME único" };
  const lenTipo = bytes[1];
  const lenCuerpo = corto ? bytes[2] : bytes.length >= 6 ? ((bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5]) >>> 0 : -1;
  const inicioTipo = corto ? 3 : 6;
  if (lenCuerpo < 0 || inicioTipo + lenTipo + lenCuerpo !== bytes.length) return { ok: false, motivo: "longitudes NDEF" };
  try {
    if (dec.decode(bytes.subarray(inicioTipo, inicioTipo + lenTipo)) !== TIPO_MIME_NDEF) return { ok: false, motivo: "tipo NDEF ajeno" };
    return validarForma(JSON.parse(dec.decode(bytes.subarray(inicioTipo + lenTipo))));
  } catch {
    return { ok: false, motivo: "contenido ilegible" };
  }
}

/**
 * Verifica forma, vigencia (30 s, con 2 s de tolerancia de reloj), nonce y firma.
 * `noncesVistos` lo guarda quien llama; esta función no lo modifica.
 */
export function verificar(
  t: TarjetaNeurona,
  ahora: number,
  verificador: VerificadorFirma,
  noncesVistos: ReadonlySet<string>,
): ResultadoVerificar {
  if (!validarForma(t).ok) return { ok: false, motivo: "formato" };
  if (t.emitidaEn > ahora + 2_000) return { ok: false, motivo: "futura" };
  if (ahora - t.emitidaEn > VALIDEZ_MS) return { ok: false, motivo: "caducada" };
  if (noncesVistos.has(t.nonce)) return { ok: false, motivo: "repetida" };
  const { firma, ...sinFirma } = t;
  let valida = false;
  try {
    valida = verificador(bytesAFirmar(sinFirma), firma, t.clavePublica);
  } catch {
    valida = false;
  }
  return valida ? { ok: true } : { ok: false, motivo: "firma" };
}
