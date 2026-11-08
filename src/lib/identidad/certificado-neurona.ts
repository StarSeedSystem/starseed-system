/**
 * (IDN1108A) Certificado cuenta → neurona, API pura.
 *
 * La clave MAESTRA de la cuenta firma `{cuenta, neuronaId, clavePublicaAparato, emitido, caduca, permisos}`.
 * Quien lo recibe lo verifica contra las ANCLAS de cuenta que ya conoce (huellas `acct:…` de claves
 * maestras): sin ancla conocida el certificado no prueba nada (cualquiera puede generarse una maestra).
 * Funciona sin internet y sin servidor: todo cabe en el certificado + el almacén local de anclas.
 *
 * No toca el transporte: `enlace.ts` lo conecta a los saludos. Contrato: red-sin-dependencias.md §5.1.
 */

import { canonico, firmarTexto, huellaMaestra, huellaAparato, pubLimpia, verificarFirma } from "./util";

/** Vida por defecto de un certificado de neurona: 180 días (se renueva al reabrir, mientras haya maestra cerca). */
export const VIDA_CERTIFICADO_MS = 180 * 24 * 60 * 60_000;
/** Tolerancia de reloj hacia el futuro para `emitido`. */
export const SESGO_RELOJ_MS = 24 * 60 * 60_000;
/** Permisos que se conceden por defecto a una neurona de la propia cuenta. */
export const PERMISOS_POR_DEFECTO = ["sincronizar", "mensajes", "archivos", "llamadas"] as const;

export interface CertificadoNeurona {
  v: 1;
  /** Identificador de la cuenta (uuid de Supabase o el que use la cuenta; informativo: la prueba es la ancla). */
  cuenta: string;
  /** Id de la neurona dentro de la malla. */
  neuronaId: string;
  /** Clave pública ECDSA del aparato (la de `mesh-identity`); su huella `id:…` firma los saludos. */
  clavePublicaAparato: JsonWebKey;
  emitido: number;
  caduca: number;
  permisos: string[];
  /** Huella `acct:…` de la maestra que firma y su clave pública (para verificar sin registro). */
  mfp: string;
  mpub: JsonWebKey;
  sig: string;
}

/** Quien puede firmar en nombre de la maestra. Separa la criptografía de dónde viva la clave. */
export interface Firmante {
  mpub: JsonWebKey;
  firmar(mensaje: string): Promise<string | null>;
}

export interface DatosCertificado {
  cuenta: string;
  neuronaId: string;
  clavePublicaAparato: JsonWebKey;
  permisos?: readonly string[];
  /** Epoch ms; por defecto, ahora. */
  emitido?: number;
  /** Epoch ms; por defecto, emitido + `VIDA_CERTIFICADO_MS`. */
  caduca?: number;
}

/** Ancla de cuenta: una huella de clave maestra en la que esta neurona confía, y por qué. */
export type NivelAncla = "propia" | "qr" | "anunciada";
export interface AnclaCuenta {
  mfp: string;
  nivel: NivelAncla;
  /** 0‒1, mismo espíritu que las resonancias (`cristal/resonancias.ts`). */
  confianza: number;
  cuenta?: string;
  etiqueta?: string;
  visto?: number;
}

export type EstadoCertificado = "valido" | "sin-ancla" | "invalido";
export interface ResultadoCertificado {
  ok: boolean;
  estado: EstadoCertificado;
  motivo: string;
  cuenta?: string;
  mfp?: string;
  neuronaId?: string;
  /** Huella `id:…` del aparato certificado. */
  huella?: string;
  nivel?: NivelAncla;
  permisos?: string[];
}

export interface OpcionesVerificar {
  ahora?: number;
  /** Se rechaza el certificado cuya maestra/neurona/huella figure como revocada. */
  estaRevocada?: (r: { mfp: string; neuronaId: string; huella: string }) => boolean;
  /** Si se conoce quién tiene que ser el portador, se exige que coincida. */
  esperado?: { neuronaId?: string; huella?: string };
  /** Confianza mínima de una ancla «anunciada» para valer (por defecto 0,6). */
  umbralAnunciada?: number;
}

/** Texto canónico que firma la maestra. El orden de claves no importa (canónico las ordena). */
export function mensajeCertificado(c: Omit<CertificadoNeurona, "sig">): string {
  return canonico({
    t: "ss.cert.neurona.v1",
    cuenta: c.cuenta,
    neuronaId: c.neuronaId,
    clavePublicaAparato: pubLimpia(c.clavePublicaAparato),
    emitido: c.emitido,
    caduca: c.caduca,
    permisos: [...(c.permisos ?? [])].sort(),
    mfp: c.mfp,
  });
}

/** Emite (firma) un certificado cuenta→neurona. Null si falta algún dato o no hay firma posible. */
export async function emitirCertificadoNeurona(firmante: Firmante, datos: DatosCertificado): Promise<CertificadoNeurona | null> {
  try {
    const aparato = pubLimpia(datos.clavePublicaAparato);
    const mpub = pubLimpia(firmante?.mpub);
    if (!aparato || !mpub || !datos.cuenta || !datos.neuronaId) return null;
    const mfp = await huellaMaestra(mpub);
    if (!mfp) return null;
    const emitido = datos.emitido ?? Date.now();
    const caduca = datos.caduca ?? emitido + VIDA_CERTIFICADO_MS;
    if (!(caduca > emitido)) return null;
    const permisos = [...new Set((datos.permisos ?? PERMISOS_POR_DEFECTO).map(String))].sort();
    const base = { v: 1 as const, cuenta: datos.cuenta, neuronaId: datos.neuronaId, clavePublicaAparato: aparato, emitido, caduca, permisos, mfp, mpub };
    const sig = await firmante.firmar(mensajeCertificado(base));
    return sig ? { ...base, sig } : null;
  } catch {
    return null;
  }
}

function esCert(c: unknown): c is CertificadoNeurona {
  const o = c as Partial<CertificadoNeurona> | null;
  return !!o && typeof o === "object" && o.v === 1 && typeof o.cuenta === "string" && typeof o.neuronaId === "string" &&
    typeof o.mfp === "string" && typeof o.sig === "string" && typeof o.emitido === "number" && typeof o.caduca === "number" &&
    Array.isArray(o.permisos) && !!o.clavePublicaAparato && !!o.mpub;
}

const ko = (estado: EstadoCertificado, motivo: string, extra: Partial<ResultadoCertificado> = {}): ResultadoCertificado => ({ ok: false, estado, motivo, ...extra });

/**
 * Verifica un certificado contra las anclas de cuenta conocidas. Nunca lanza.
 *  · `sin-ancla`: criptográficamente coherente, pero ninguna ancla conocida lo respalda (no se puede juzgar).
 *  · `invalido`: firma mala, caducado, revocado, portador distinto o ancla demasiado poco fiable.
 */
export async function verificarCertificadoNeurona(
  cert: unknown,
  anclasDeCuenta: ReadonlyArray<AnclaCuenta | string>,
  opts: OpcionesVerificar = {},
): Promise<ResultadoCertificado> {
  try {
    if (!esCert(cert)) return ko("invalido", "el certificado no tiene la forma esperada");
    const ahora = opts.ahora ?? Date.now();
    // 1 · Coherencia interna barata antes de criptografía.
    if (!(cert.caduca > cert.emitido)) return ko("invalido", "el certificado tiene fechas incoherentes");
    if (cert.emitido > ahora + SESGO_RELOJ_MS) return ko("invalido", "el certificado está fechado en el futuro");
    if (cert.caduca <= ahora) return ko("invalido", "el certificado ha caducado", { cuenta: cert.cuenta, neuronaId: cert.neuronaId });
    const aparato = pubLimpia(cert.clavePublicaAparato);
    const mpub = pubLimpia(cert.mpub);
    if (!aparato || !mpub) return ko("invalido", "las claves del certificado no son válidas");
    // 2 · La huella declarada tiene que ser la de la maestra incluida.
    if ((await huellaMaestra(mpub)) !== cert.mfp) return ko("invalido", "la huella de la cuenta no corresponde a su clave");
    // 3 · Ancla: sin ella el aval es auto-referente.
    const ancla = anclasDeCuenta.map((a) => (typeof a === "string" ? ({ mfp: a, nivel: "qr", confianza: 1 } as AnclaCuenta) : a)).find((a) => a.mfp === cert.mfp);
    if (!ancla) return ko("sin-ancla", "no conozco la cuenta que firma este certificado", { mfp: cert.mfp, cuenta: cert.cuenta });
    const umbral = opts.umbralAnunciada ?? 0.6;
    if (ancla.nivel === "anunciada" && ancla.confianza < umbral) {
      return ko("sin-ancla", "la cuenta solo se conoce por anuncios y aún no es de fiar", { mfp: cert.mfp, cuenta: cert.cuenta, nivel: ancla.nivel });
    }
    // 4 · Firma.
    if (!(await verificarFirma(mpub, cert.sig, mensajeCertificado({ ...cert, clavePublicaAparato: aparato, mpub })))) {
      return ko("invalido", "la firma del certificado no es válida", { mfp: cert.mfp });
    }
    const huella = await huellaAparato(aparato);
    // 5 · Portador esperado.
    if (opts.esperado?.neuronaId && opts.esperado.neuronaId !== cert.neuronaId) return ko("invalido", "el certificado es de otra neurona", { mfp: cert.mfp });
    if (opts.esperado?.huella && opts.esperado.huella !== huella) return ko("invalido", "el certificado es de otro aparato", { mfp: cert.mfp });
    // 6 · Revocación.
    if (opts.estaRevocada?.({ mfp: cert.mfp, neuronaId: cert.neuronaId, huella })) {
      return ko("invalido", "esa neurona fue revocada por su cuenta", { mfp: cert.mfp, neuronaId: cert.neuronaId, huella });
    }
    return {
      ok: true,
      estado: "valido",
      motivo: "certificado de cuenta válido",
      cuenta: cert.cuenta,
      mfp: cert.mfp,
      neuronaId: cert.neuronaId,
      huella,
      nivel: ancla.nivel,
      permisos: [...cert.permisos],
    };
  } catch {
    return ko("invalido", "no se pudo comprobar el certificado");
  }
}

/** Atajo: firmante a partir de una clave privada WebCrypto (maestra local o de pruebas). */
export function firmanteDeClave(mpub: JsonWebKey, priv: CryptoKey): Firmante {
  return { mpub, firmar: (m) => firmarTexto(priv, m) };
}
