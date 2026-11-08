/**
 * (IDN1108A) Enrolar una neurona NUEVA sin internet: protocolo puro.
 *
 * Papeles: la neurona NUEVA (N) y una neurona TITULAR (E) que tiene la maestra de la cuenta.
 *
 *  Modo QR (los dos aparatos se ven; el canal visual ya autentica la solicitud):
 *    1. N muestra `solicitud` {neuronaId, nombre, clavePublicaAparato, nonceN}.
 *    2. E la escanea, genera nonceE y calcula el CÓDIGO DE 6 CIFRAS (SAS) a partir de las dos claves
 *       públicas y los dos nonces. E muestra el código; la persona lo compara con el de N.
 *    3. Si coincide, E firma el certificado y muestra `respuesta` {certificado, nonceN, nonceE}.
 *    4. N la lee, recalcula el SAS y lo muestra; la persona confirma; N guarda certificado + ancla.
 *
 *  Modo enlace (LAN/BLE/WebRTC: el canal NO es de fiar): añade un compromiso para que nadie pueda
 *  «moler» claves hasta que el SAS coincida (con 6 cifras serían ~10^6 intentos):
 *    a. N → E: `compromiso` = H(solicitud completa). b. E → N: `oferta` {mpub, nonceE} (queda fijada).
 *    c. N → E: la `solicitud` (se comprueba contra el compromiso). Desde aquí, igual que 2‒4.
 *
 * Nada de esto toca el transporte: los mensajes son objetos JSON pequeños (`codificarMensaje` para QR/texto).
 */

import { emitirCertificadoNeurona, verificarCertificadoNeurona, type CertificadoNeurona, type Firmante, PERMISOS_POR_DEFECTO } from "./certificado-neurona";
import { aB64url, aleatorio, bytesDe, canonico, deB64url, huellaAparato, huellaMaestra, pubLimpia, sha256 } from "./util";

export const CANAL_ENROLAMIENTO = "identidad.enrolar";
/** Una solicitud/respuesta vale 10 minutos. */
export const VIDA_ENROLAMIENTO_MS = 10 * 60_000;

export interface SolicitudEnrolamiento {
  v: 1;
  t: "ss.enrolar.solicitud";
  neuronaId: string;
  nombre: string;
  clavePublicaAparato: JsonWebKey;
  nonceN: string;
  creada: number;
}
export interface OfertaEnrolamiento {
  v: 1;
  t: "ss.enrolar.oferta";
  mpub: JsonWebKey;
  nonceE: string;
  compromiso: string;
}
export interface RespuestaEnrolamiento {
  v: 1;
  t: "ss.enrolar.respuesta";
  certificado: CertificadoNeurona;
  nonceN: string;
  nonceE: string;
}

/* ───────────── mensajes ↔ texto (QR / portapapeles) ───────────── */

export function codificarMensaje(m: SolicitudEnrolamiento | OfertaEnrolamiento | RespuestaEnrolamiento | { t: "ss.enrolar.compromiso"; v: 1; compromiso: string }): string {
  return "sse1:" + aB64url(bytesDe(JSON.stringify(m)));
}
export function decodificarMensaje<T = unknown>(texto: string): T | null {
  try {
    const t = texto.trim();
    if (!t.startsWith("sse1:")) return null;
    return JSON.parse(new TextDecoder().decode(deB64url(t.slice(5)))) as T;
  } catch {
    return null;
  }
}

/* ───────────── primitivas ───────────── */

/** Código de confirmación de 6 cifras derivado de AMBAS claves públicas y los DOS nonces. */
export async function calcularSas(clavePublicaAparato: JsonWebKey, mpub: JsonWebKey, nonceN: string, nonceE: string): Promise<string | null> {
  const a = pubLimpia(clavePublicaAparato);
  const m = pubLimpia(mpub);
  if (!a || !m || !nonceN || !nonceE) return null;
  const h = await sha256(canonico({ t: "ss.enrolar.sas", a, m, nonceN, nonceE }));
  if (!h) return null;
  const n = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export async function compromisoDe(s: SolicitudEnrolamiento): Promise<string | null> {
  const h = await sha256(canonico(s));
  return h ? aB64url(h) : null;
}

/* ───────────── neurona NUEVA ───────────── */

export function crearSolicitud(d: { neuronaId: string; nombre: string; clavePublicaAparato: JsonWebKey }, ahora = Date.now()): SolicitudEnrolamiento | null {
  const k = pubLimpia(d.clavePublicaAparato);
  if (!k || !d.neuronaId) return null;
  return { v: 1, t: "ss.enrolar.solicitud", neuronaId: d.neuronaId, nombre: d.nombre.slice(0, 60), clavePublicaAparato: k, nonceN: aleatorio(16), creada: ahora };
}

export interface EnrolamientoPendiente {
  /** El código de 6 cifras que la persona debe ver IGUAL en los dos aparatos. */
  sas: string;
  certificado: CertificadoNeurona;
  mfp: string;
  cuenta: string;
}

/**
 * La neurona NUEVA procesa la respuesta: comprueba que el certificado es para ELLA (su clave y su id),
 * que la firma cuadra y que el nonce es el suyo; calcula el SAS. NO guarda nada: eso va en `confirmarEnrolamiento`.
 * `oferta` (modo enlace) se exige coherente con el certificado: la mpub y el nonceE comprometidos.
 */
export async function procesarRespuesta(
  mia: SolicitudEnrolamiento,
  r: unknown,
  opts: { oferta?: OfertaEnrolamiento; ahora?: number } = {},
): Promise<{ ok: true; pendiente: EnrolamientoPendiente } | { ok: false; motivo: string }> {
  try {
    const x = r as Partial<RespuestaEnrolamiento> | null;
    const ahora = opts.ahora ?? Date.now();
    if (!x || x.t !== "ss.enrolar.respuesta" || x.v !== 1 || !x.certificado || typeof x.nonceE !== "string") return { ok: false, motivo: "la respuesta no tiene la forma esperada" };
    if (ahora - mia.creada > VIDA_ENROLAMIENTO_MS) return { ok: false, motivo: "la solicitud caducó: empieza de nuevo" };
    if (x.nonceN !== mia.nonceN) return { ok: false, motivo: "la respuesta no es para esta solicitud" };
    const c = x.certificado;
    if (c.neuronaId !== mia.neuronaId) return { ok: false, motivo: "el certificado es de otra neurona" };
    if ((await huellaAparato(c.clavePublicaAparato)) !== (await huellaAparato(mia.clavePublicaAparato))) return { ok: false, motivo: "el certificado es de otro aparato" };
    if (opts.oferta && (opts.oferta.nonceE !== x.nonceE || (await huellaMaestra(opts.oferta.mpub)) !== c.mfp)) return { ok: false, motivo: "la respuesta no es la que se había ofrecido" };
    // La ancla sale del propio certificado: solo se fía si la persona confirma el SAS (TOFU con comprobación humana).
    const v = await verificarCertificadoNeurona(c, [{ mfp: c.mfp, nivel: "propia", confianza: 1 }], { ahora, esperado: { neuronaId: mia.neuronaId } });
    if (!v.ok) return { ok: false, motivo: v.motivo };
    const sas = await calcularSas(mia.clavePublicaAparato, c.mpub, mia.nonceN, x.nonceE);
    if (!sas) return { ok: false, motivo: "no se pudo calcular el código de confirmación" };
    return { ok: true, pendiente: { sas, certificado: c, mfp: c.mfp, cuenta: c.cuenta } };
  } catch {
    return { ok: false, motivo: "no se pudo procesar la respuesta" };
  }
}

export interface DestinosEnrolamiento {
  guardarCertificado(c: CertificadoNeurona): Promise<void>;
  fijarAnclaPropia(mfp: string, cuenta: string): Promise<unknown>;
}

/** La persona confirmó que el código coincide: la neurona guarda su certificado y la ancla de la cuenta. */
export async function confirmarEnrolamiento(p: EnrolamientoPendiente, codigoVisto: string, destinos: DestinosEnrolamiento): Promise<boolean> {
  if (codigoVisto.replace(/\s/g, "") !== p.sas) return false;
  await destinos.fijarAnclaPropia(p.mfp, p.cuenta);
  await destinos.guardarCertificado(p.certificado);
  return true;
}

/* ───────────── neurona TITULAR ───────────── */

export function crearOferta(mpub: JsonWebKey, compromiso: string): OfertaEnrolamiento | null {
  const m = pubLimpia(mpub);
  return m ? { v: 1, t: "ss.enrolar.oferta", mpub: m, nonceE: aleatorio(16), compromiso } : null;
}

export interface EnrolamientoPreparado {
  /** Código que E muestra para que la persona lo compare con el de N. */
  sas: string;
  solicitud: SolicitudEnrolamiento;
  nonceE: string;
  /** Firma el certificado SOLO cuando la persona ya confirmó el código. */
  emitir(): Promise<RespuestaEnrolamiento | null>;
}

/**
 * La titular valida la solicitud y calcula el SAS. En modo enlace pasa `oferta` y `compromiso` (los que ya envió
 * y recibió): se exige que la solicitud case con el compromiso y se reutiliza el `nonceE` comprometido.
 */
export async function prepararEnrolamiento(
  solicitud: unknown,
  firmante: Firmante,
  cuenta: string,
  opts: { oferta?: OfertaEnrolamiento; compromiso?: string; permisos?: readonly string[]; ahora?: number } = {},
): Promise<{ ok: true; preparado: EnrolamientoPreparado } | { ok: false; motivo: string }> {
  try {
    const s = solicitud as Partial<SolicitudEnrolamiento> | null;
    const ahora = opts.ahora ?? Date.now();
    if (!s || s.t !== "ss.enrolar.solicitud" || s.v !== 1 || !s.neuronaId || !s.nonceN || typeof s.creada !== "number" || !pubLimpia(s.clavePublicaAparato)) {
      return { ok: false, motivo: "la solicitud no tiene la forma esperada" };
    }
    const sol = s as SolicitudEnrolamiento;
    if (ahora - sol.creada > VIDA_ENROLAMIENTO_MS || sol.creada > ahora + 60_000) return { ok: false, motivo: "la solicitud caducó: que la neurona nueva empiece de nuevo" };
    if (opts.compromiso !== undefined && (await compromisoDe(sol)) !== opts.compromiso) return { ok: false, motivo: "la solicitud no es la que se había comprometido" };
    const nonceE = opts.oferta?.nonceE ?? aleatorio(16);
    if (opts.oferta && (await huellaMaestra(opts.oferta.mpub)) !== (await huellaMaestra(firmante.mpub))) return { ok: false, motivo: "la oferta no es de esta cuenta" };
    const sas = await calcularSas(sol.clavePublicaAparato, firmante.mpub, sol.nonceN, nonceE);
    if (!sas) return { ok: false, motivo: "no se pudo calcular el código de confirmación" };
    return {
      ok: true,
      preparado: {
        sas,
        solicitud: sol,
        nonceE,
        async emitir() {
          const certificado = await emitirCertificadoNeurona(firmante, {
            cuenta,
            neuronaId: sol.neuronaId,
            clavePublicaAparato: sol.clavePublicaAparato,
            permisos: opts.permisos ?? PERMISOS_POR_DEFECTO,
            emitido: ahora,
          });
          return certificado ? { v: 1, t: "ss.enrolar.respuesta", certificado, nonceN: sol.nonceN, nonceE } : null;
        },
      },
    };
  } catch {
    return { ok: false, motivo: "no se pudo preparar el enrolamiento" };
  }
}
