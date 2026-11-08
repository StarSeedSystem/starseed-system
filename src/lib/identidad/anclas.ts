/**
 * (IDN1108A) Almacén local de ANCLAS de cuenta: huellas de claves maestras en las que esta neurona confía.
 *
 * Niveles (encajan con las «resonancias» de la malla cristalina, `cristal/resonancias.ts`):
 *  · `propia`    — la cuenta de esta neurona (se fija al crear/importar la maestra). Confianza 1.
 *  · `qr`        — la persona la comprobó mirando el QR de la otra. Confianza inicial 0,9.
 *  · `anunciada` — llegó en un anuncio firmado por la malla: prueba que su emisor tiene la clave, NO que
 *                  merezca confianza. Arranca en `CONFIANZA_INICIAL` (0,5) y solo vale para verificar
 *                  certificados cuando sube de 0,6 por eventos (`firma-ok`, `veredicto-confirmado`…).
 */

import { almacenIdentidad, type AlmacenKV } from "./almacen";
import type { AnclaCuenta, Firmante, NivelAncla } from "./certificado-neurona";
import { canonico, deB64url, aB64url, bytesDe, huellaMaestra, pubLimpia, verificarFirma } from "./util";
import { actualizarConfianza, CONFIANZA_INICIAL, type EventoConfianza } from "@/lib/malla/cristal/resonancias";

const CLAVE = "anclas.v1";
export const CONFIANZA_QR = 0.9;

/** Anuncio firmado por una maestra: «esta es mi huella de cuenta». Se difunde por la malla. */
export interface AnuncioCuenta {
  v: 1;
  mfp: string;
  mpub: JsonWebKey;
  cuenta: string;
  emitido: number;
  sig: string;
}

const msgAnuncio = (mfp: string, cuenta: string, emitido: number) => canonico({ t: "ss.anuncio.cuenta.v1", mfp, cuenta, emitido });

export async function crearAnuncioCuenta(firmante: Firmante, cuenta: string, emitido = Date.now()): Promise<AnuncioCuenta | null> {
  const mpub = pubLimpia(firmante.mpub);
  if (!mpub || !cuenta) return null;
  const mfp = await huellaMaestra(mpub);
  const sig = mfp ? await firmante.firmar(msgAnuncio(mfp, cuenta, emitido)) : null;
  return sig ? { v: 1, mfp, mpub, cuenta, emitido, sig } : null;
}

export async function verificarAnuncioCuenta(a: unknown): Promise<boolean> {
  const x = a as Partial<AnuncioCuenta> | null;
  if (!x || x.v !== 1 || !x.mfp || !x.mpub || !x.sig || typeof x.cuenta !== "string" || typeof x.emitido !== "number") return false;
  const mpub = pubLimpia(x.mpub);
  if (!mpub || (await huellaMaestra(mpub)) !== x.mfp) return false;
  return verificarFirma(mpub, x.sig, msgAnuncio(x.mfp, x.cuenta, x.emitido));
}

/** QR de ancla: `ssa1:` + base64url de {mfp, mpub, cuenta, etiqueta}. La huella se recalcula al leerlo. */
export function codificarAnclaQr(d: { mpub: JsonWebKey; mfp: string; cuenta?: string; etiqueta?: string }): string {
  return "ssa1:" + aB64url(bytesDe(JSON.stringify({ mfp: d.mfp, mpub: pubLimpia(d.mpub), cuenta: d.cuenta, etiqueta: d.etiqueta })));
}

export async function decodificarAnclaQr(texto: string): Promise<{ mfp: string; cuenta?: string; etiqueta?: string } | null> {
  try {
    if (!texto.startsWith("ssa1:")) return null;
    const o = JSON.parse(new TextDecoder().decode(deB64url(texto.slice(5)))) as { mfp?: string; mpub?: JsonWebKey; cuenta?: string; etiqueta?: string };
    const mpub = pubLimpia(o.mpub);
    if (!mpub || !o.mfp || (await huellaMaestra(mpub)) !== o.mfp) return null;
    return { mfp: o.mfp, cuenta: typeof o.cuenta === "string" ? o.cuenta : undefined, etiqueta: typeof o.etiqueta === "string" ? o.etiqueta : undefined };
  } catch {
    return null;
  }
}

export function crearAnclas(almacen: AlmacenKV = almacenIdentidad(), ahora: () => number = Date.now) {
  async function todas(): Promise<AnclaCuenta[]> {
    const l = await almacen.leer<AnclaCuenta[]>(CLAVE);
    return Array.isArray(l) ? l : [];
  }
  async function guardar(l: AnclaCuenta[]): Promise<void> {
    await almacen.escribir(CLAVE, l);
  }
  async function poner(a: AnclaCuenta): Promise<AnclaCuenta> {
    const l = (await todas()).filter((x) => x.mfp !== a.mfp);
    l.push(a);
    await guardar(l);
    return a;
  }
  const rango: Record<NivelAncla, number> = { anunciada: 0, qr: 1, propia: 2 };

  return {
    listar: todas,
    async obtener(mfp: string): Promise<AnclaCuenta | undefined> {
      return (await todas()).find((a) => a.mfp === mfp);
    },
    async propia(): Promise<AnclaCuenta | undefined> {
      return (await todas()).find((a) => a.nivel === "propia");
    },
    /** Fija la ancla de ESTA cuenta (al crear o importar la maestra). Sustituye a la propia anterior. */
    async fijarPropia(mfp: string, cuenta?: string, etiqueta?: string): Promise<AnclaCuenta> {
      const l = (await todas()).filter((a) => a.nivel !== "propia" && a.mfp !== mfp);
      const a: AnclaCuenta = { mfp, nivel: "propia", confianza: 1, cuenta, etiqueta, visto: ahora() };
      l.push(a);
      await guardar(l);
      return a;
    },
    /** La persona comprobó el QR de otra cuenta. Nunca baja una ancla propia. */
    async aprenderPorQr(mfp: string, cuenta?: string, etiqueta?: string): Promise<AnclaCuenta> {
      const previa = await this.obtener(mfp);
      if (previa && rango[previa.nivel] >= rango.qr) return previa;
      return poner({ mfp, nivel: "qr", confianza: Math.max(CONFIANZA_QR, previa?.confianza ?? 0), cuenta: cuenta ?? previa?.cuenta, etiqueta, visto: ahora() });
    },
    /** Anuncio firmado de la malla: solo se aprende si la firma cuadra; arranca con la confianza inicial. */
    async aprenderAnuncio(anuncio: unknown): Promise<AnclaCuenta | null> {
      if (!(await verificarAnuncioCuenta(anuncio))) return null;
      const a = anuncio as AnuncioCuenta;
      const previa = await this.obtener(a.mfp);
      if (previa) return previa;
      return poner({ mfp: a.mfp, nivel: "anunciada", confianza: CONFIANZA_INICIAL, cuenta: a.cuenta, visto: ahora() });
    },
    /** Una observación (firma buena/mala, veredicto confirmado/desmentido) mueve la confianza. */
    async registrarEvento(mfp: string, ev: EventoConfianza): Promise<AnclaCuenta | null> {
      const a = await this.obtener(mfp);
      if (!a || a.nivel === "propia") return a ?? null;
      return poner({ ...a, confianza: actualizarConfianza(a.confianza, ev), visto: ahora() });
    },
    async olvidar(mfp: string): Promise<void> {
      await guardar((await todas()).filter((a) => a.mfp !== mfp || a.nivel === "propia"));
    },
  };
}

export type Anclas = ReturnType<typeof crearAnclas>;
