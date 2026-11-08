/**
 * (IDN1108A) Ganchos de identidad para los saludos de los enlaces (nativo/BLE y WebRTC), sin tocar el transporte.
 *
 * `verificarHolaConCertificado(hola)` decide qué hacer con el certificado cuenta→neurona que viaja en un saludo:
 *   · `ok: false`  → el certificado existe y es MALO (firma, caducado, revocado, de otra neurona/aparato): rechazar.
 *   · `ok: true, mismaCuenta: true`  → certificado válido de la PROPIA cuenta: se acepta aunque nunca se hayan vinculado.
 *   · `ok: true, mismaCuenta: false` → sin certificado, o de una cuenta que no se puede juzgar/ajena: se sigue como hasta ahora.
 *
 * La huella (`hola.huella`) tiene que venir ya PROBADA por quien llama: en el saludo nativo es la huella con la que
 * firma el sobre (posesión de la clave del aparato). En WebRTC el saludo no va firmado, por eso `holaWebRtc*`
 * añade una prueba de posesión firmada con la identidad del aparato.
 */

import { crearAnclas, type Anclas } from "./anclas";
import { almacenIdentidad } from "./almacen";
import type { AnclaCuenta, EstadoCertificado } from "./certificado-neurona";
import { verificarCertificadoNeurona } from "./certificado-neurona";
import { crearRevocaciones, type Revocaciones } from "./revocaciones";

export interface HolaConCertificado {
  /** Certificado del saludo (tal cual llegó; se valida su forma). Ausente: saludo sin certificado. */
  certificado?: unknown;
  /** Id de neurona que dice ser el que saluda. */
  neurona: string;
  /** Huella `id:…` del aparato, ya PROBADA (firma del sobre). */
  huella: string;
}

export interface VeredictoHola {
  ok: boolean;
  mismaCuenta: boolean;
  estado: EstadoCertificado | "sin-certificado";
  motivo: string;
  cuenta?: string;
  mfp?: string;
  permisos?: string[];
}

export interface ContextoIdentidad {
  anclas: () => Promise<AnclaCuenta[]>;
  /** Predicado síncrono ya cargado; ver `contextoReal`. */
  estaRevocada: (r: { mfp: string; neuronaId: string; huella: string }) => boolean;
  ahora?: () => number;
}

export async function contextoReal(): Promise<ContextoIdentidad> {
  const almacen = almacenIdentidad();
  const anclas: Anclas = crearAnclas(almacen);
  const rev: Revocaciones = crearRevocaciones(almacen);
  await rev.cargar();
  return { anclas: () => anclas.listar(), estaRevocada: (r) => rev.estaRevocada(r) };
}

let contexto: Promise<ContextoIdentidad> | null = null;

/** Verifica el certificado de un saludo. Nunca lanza. */
export async function verificarHolaConCertificado(hola: HolaConCertificado, ctx?: ContextoIdentidad): Promise<VeredictoHola> {
  try {
    if (hola.certificado === undefined || hola.certificado === null) {
      return { ok: true, mismaCuenta: false, estado: "sin-certificado", motivo: "el saludo no trae certificado de cuenta" };
    }
    const c = ctx ?? (await (contexto ??= contextoReal()));
    const r = await verificarCertificadoNeurona(hola.certificado, await c.anclas(), {
      ahora: c.ahora?.(),
      estaRevocada: c.estaRevocada,
      esperado: { neuronaId: hola.neurona, huella: hola.huella },
    });
    if (r.estado === "invalido") return { ok: false, mismaCuenta: false, estado: "invalido", motivo: r.motivo };
    if (r.estado === "sin-ancla") return { ok: true, mismaCuenta: false, estado: "sin-ancla", motivo: r.motivo, cuenta: r.cuenta, mfp: r.mfp };
    return { ok: true, mismaCuenta: r.nivel === "propia", estado: "valido", motivo: r.motivo, cuenta: r.cuenta, mfp: r.mfp, permisos: r.permisos };
  } catch {
    return { ok: false, mismaCuenta: false, estado: "invalido", motivo: "no se pudo comprobar el certificado" };
  }
}

/* ───────── nativo / Bluetooth: se enchufa en `verificarCertificado` y `certificadoPropio` (CIF1108A) ───────── */

/** Encaja con `VerificadorCertificado` de `sesion-cifrada.ts`: true = no rechazar. */
export async function verificadorCertificadoNativo(c: Record<string, unknown>, ctx: { neurona: string; huella: string }): Promise<boolean> {
  return (await verificarHolaConCertificado({ certificado: c, neurona: ctx.neurona, huella: ctx.huella })).ok;
}

/** Encaja con el gancho `certificadoMismaCuenta` de los motores: true = cuenta propia probada por certificado. */
export async function certificadoDeMismaCuenta(c: Record<string, unknown>, ctx: { neurona: string; huella: string }): Promise<boolean> {
  const v = await verificarHolaConCertificado({ certificado: c, neurona: ctx.neurona, huella: ctx.huella });
  return v.ok && v.mismaCuenta;
}

/** Encaja con `certificadoPropio` de los motores: el certificado de esta neurona, o null. */
export async function certificadoPropioParaHola(): Promise<Record<string, unknown> | null> {
  try {
    const { servicioIdentidad } = await import("./servicio");
    const s = await servicioIdentidad();
    const c = (await s.autoCertificar().catch(() => null)) ?? (await s.certificadoPropio());
    return c ? (c as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* ───────── WebRTC `enl.hola` ───────── */

const VENTANA_PRUEBA_MS = 5 * 60_000;

/** Campos que se añaden al `enl.hola`: el certificado y una prueba de posesión firmada con la clave del aparato. */
export async function camposHolaWebRtc(): Promise<{ certificado?: Record<string, unknown>; pruebaCert?: Record<string, unknown> }> {
  const c = await certificadoPropioParaHola();
  if (!c) return {};
  try {
    const { wrapSigned } = await import("@/ai/astraura/mesh/mesh-identity");
    return { certificado: c, pruebaCert: await wrapSigned({ t: "enl.hola.cert", neurona: c.neuronaId, ts: Date.now() }) };
  } catch {
    return {};
  }
}

/** Verifica el certificado de un `enl.hola` WebRTC: exige la prueba de posesión reciente y de la clave certificada. */
export async function verificarHolaWebRtc(o: Record<string, unknown>, ctx?: ContextoIdentidad): Promise<VeredictoHola> {
  if (o.certificado === undefined || o.certificado === null) return verificarHolaConCertificado({ neurona: "", huella: "" }, ctx);
  try {
    const { unwrapSigned } = await import("@/ai/astraura/mesh/mesh-identity");
    const u = await unwrapSigned(o.pruebaCert);
    const b = u.body as { t?: string; neurona?: string; ts?: number } | null;
    const ahora = ctx?.ahora?.() ?? Date.now();
    if (!u.verified || !u.fp || b?.t !== "enl.hola.cert" || typeof b.ts !== "number" || Math.abs(ahora - b.ts) > VENTANA_PRUEBA_MS || typeof b.neurona !== "string" || (typeof o.neuronDeviceId === "string" && o.neuronDeviceId !== b.neurona)) {
      return { ok: false, mismaCuenta: false, estado: "invalido", motivo: "el certificado no viene con prueba de posesión válida" };
    }
    return verificarHolaConCertificado({ certificado: o.certificado, neurona: b.neurona, huella: u.fp }, ctx);
  } catch {
    return { ok: false, mismaCuenta: false, estado: "invalido", motivo: "no se pudo comprobar el certificado" };
  }
}
