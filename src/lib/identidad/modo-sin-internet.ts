/**
 * (IDN1108A) Decisión pura del modo «sin internet» de la sesión.
 *
 * Con internet NADA cambia: sin sesión válida se va a /login como siempre (no se debilita la seguridad en línea).
 * Sin internet (fallo de RED al renovar la sesión, no un rechazo del servidor) y con sesión en caché:
 *  · con certificado de cuenta válido de esta neurona → se queda en la app, etiquetado «sin internet · identidad certificada»;
 *  · sin certificado → se queda igual que ya hace el servidor local de la app nativa (APP1107A), etiquetado «solo sesión guardada»,
 *    salvo que se pida `exigirCertificado` (modo estricto).
 * Sin sesión en caché no hay a quién mantener: /login.
 *
 * Quién la llama: el cliente (IndexedDB no se lee en el middleware del servidor). El middleware ya no echa a nadie por un fallo de red
 * en el servidor local (`utils/supabase/middleware.ts`); esto añade la etiqueta y la exigencia opcional de certificado.
 */

import { verificarCertificadoNeurona, type AnclaCuenta } from "./certificado-neurona";

export type ModoAcceso = "normal" | "sin-internet" | "login";
export interface DecisionAcceso {
  modo: ModoAcceso;
  identidad: "certificada" | "solo-sesion" | "ninguna";
  etiqueta: string;
  motivo: string;
}

export interface EntradaAcceso {
  /** `navigator.onLine` o equivalente; false = sabemos que no hay red. */
  enLinea: boolean;
  /** La renovación de sesión falló por RED (no por rechazo del servidor). */
  fallaRed: boolean;
  /** Hay una sesión guardada en este aparato. */
  sesionEnCache: boolean;
  /** El servidor la dio por buena en esta carga. */
  sesionVerificada: boolean;
  certificado: unknown;
  anclas: readonly AnclaCuenta[];
  estaRevocada?: (r: { mfp: string; neuronaId: string; huella: string }) => boolean;
  /** Identidad del aparato, para exigir que el certificado sea de ESTE aparato. */
  esperado?: { neuronaId?: string; huella?: string };
  exigirCertificado?: boolean;
  ahora?: number;
}

export async function decidirModoAcceso(e: EntradaAcceso): Promise<DecisionAcceso> {
  if (e.sesionVerificada) return { modo: "normal", identidad: "ninguna", etiqueta: "", motivo: "sesión verificada con el servidor" };
  const sinRed = !e.enLinea || e.fallaRed;
  // Con red y sin sesión verificada: comportamiento de siempre.
  if (!sinRed) return { modo: "login", identidad: "ninguna", etiqueta: "", motivo: "no hay sesión válida" };
  if (!e.sesionEnCache) return { modo: "login", identidad: "ninguna", etiqueta: "", motivo: "sin internet y sin sesión guardada en este aparato" };
  const v = e.certificado
    ? await verificarCertificadoNeurona(e.certificado, e.anclas, { ahora: e.ahora, estaRevocada: e.estaRevocada, esperado: e.esperado })
    : null;
  if (v?.ok && v.nivel === "propia") {
    return { modo: "sin-internet", identidad: "certificada", etiqueta: "Sin internet · identidad de cuenta certificada", motivo: "sesión guardada y certificado de cuenta válido" };
  }
  if (e.exigirCertificado) {
    return { modo: "login", identidad: "ninguna", etiqueta: "", motivo: v ? `certificado no válido: ${v.motivo}` : "se exige certificado de cuenta y no hay" };
  }
  return { modo: "sin-internet", identidad: "solo-sesion", etiqueta: "Sin internet · usando la sesión guardada", motivo: v ? `sesión guardada (certificado no válido: ${v.motivo})` : "sesión guardada, sin certificado" };
}
