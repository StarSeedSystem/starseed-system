/**
 * radar-publico — qué ven las demás cuentas de ti en el radar público, y qué ves tú de ellas (2026-10-10).
 * ════════════════════════════════════════════════════════════════════════════════════════════════════
 * Todo se rige por la privacidad de la malla (`starseed.mesh.privacy.v1`, `src/ai/astraura/mesh/privacy.ts`).
 * Este módulo solo TRADUCE esa configuración a frases claras y a las reglas de qué viaja en el faro:
 * no escribe nada ni lee el navegador (se le pasa la configuración).
 *
 *   publicRadar = "off"        → no emites faro: invisible entre cuentas.
 *   publicRadar = "anonymous"  → emites faro SIN nombre, foto, aparato ni posición (valor por defecto).
 *   publicRadar = "visible"    → emites faro con lo que tú marques: nombre, foto, aparato, posición.
 *
 * Además el faro solo sale si la sesión pública está encendida (`publicInternet`) y la visibilidad no es
 * «private». Puro: sin React, sin red, sin `node:*`.
 */

import type { MeshPrivacySettings } from "@/ai/astraura/mesh/privacy";
import type { Dato } from "./tipos-vivo";

export type EmisionRadar = "no-emite" | "anonima" | "publica";

export interface LineaRadar {
  etiqueta: string;
  /** true = viaja a las demás cuentas. */
  visible: boolean;
  valor: string;
}

export interface ResumenRadarPublico {
  emision: EmisionRadar;
  titulo: string;
  /** Por qué no emite (cuando no emite). */
  motivo: string | null;
  lineas: LineaRadar[];
}

export interface EntradaRadar {
  privacidad: MeshPrivacySettings;
  /** `getConnectivitySettings().publicInternet`: la sesión pública está encendida. */
  internetPublico: boolean;
  /** Hay foto de perfil que pudiera viajar. */
  hayFoto: boolean;
}

/** La misma regla que `emitBeaconDetallado`, en una función pura para poder probarla. */
export function emisionDeRadar(p: MeshPrivacySettings, internetPublico: boolean): { emision: EmisionRadar; motivo: string | null } {
  if (p.visibility === "private") return { emision: "no-emite", motivo: "tu neurona está en privado: no publica nada a la federación ni al radar" };
  if (!internetPublico) return { emision: "no-emite", motivo: "la sesión pública está apagada (Internet privado): no te anuncias al radar público" };
  if (p.publicRadar === "off") return { emision: "no-emite", motivo: "elegiste no aparecer en el radar público" };
  return { emision: p.publicRadar === "visible" ? "publica" : "anonima", motivo: null };
}

export function describirRadarPublico(e: EntradaRadar): ResumenRadarPublico {
  const { emision, motivo } = emisionDeRadar(e.privacidad, e.internetPublico);
  const p = e.privacidad;
  if (emision === "no-emite") {
    return { emision, titulo: "Invisible en el radar público", motivo, lineas: [] };
  }
  const publica = emision === "publica";
  const lineas: LineaRadar[] = [
    { etiqueta: "Nombre de la neurona", visible: publica && p.shareName, valor: publica ? (p.shareName ? "se ve" : "oculto (elegiste no compartir nombres)") : "oculto (modo anónimo)" },
    { etiqueta: "Foto del perfil", visible: publica && p.shareAvatar && e.hayFoto, valor: !publica ? "oculta (modo anónimo)" : !p.shareAvatar ? "oculta (no la compartes)" : e.hayFoto ? "se ve" : "no hay foto que mostrar" },
    { etiqueta: "Tipo de aparato", visible: publica && p.shareDevice, valor: !publica ? "oculto (modo anónimo)" : p.shareDevice ? "se ve" : "oculto" },
    { etiqueta: "Posición GPS", visible: publica && p.sharePosition, valor: !publica ? "oculta (modo anónimo)" : p.sharePosition ? "se ve (aproximada)" : "oculta" },
    { etiqueta: "Región LoRa y nodos que ves", visible: true, valor: "se ven siempre que emitas faro (no identifican a la persona)" },
  ];
  return {
    emision,
    titulo: publica ? "Visible en el radar público, con lo que marcas" : "Anónima en el radar público",
    motivo: null,
    lineas,
  };
}

/** Los datos del resumen como filas de ficha (cada valor con su fuente). */
export function datosDeRadar(r: ResumenRadarPublico): Dato[] {
  const fuente = "tu configuración de privacidad de la malla (starseed.mesh.privacy.v1)";
  if (r.emision === "no-emite") {
    return [{ etiqueta: "Radar público", valor: "no emites faro", fuente, estado: "declarado", nota: r.motivo ?? undefined }];
  }
  return [
    { etiqueta: "Radar público", valor: r.emision === "publica" ? "visible" : "anónimo", fuente, estado: "declarado" },
    ...r.lineas.map((l): Dato => ({ etiqueta: l.etiqueta, valor: l.valor, fuente, estado: "declarado" })),
  ];
}

/** Lo que el faro lleva de ti, en el campo `pub` de su carga. `null` = no lleva nada público. */
export interface CargaPublicaFaro {
  /** Foto del perfil (https). */
  a?: string;
  /** Tipo de aparato (mobile, tablet, laptop, desktop, server, other). */
  d?: string;
}

/**
 * Qué cuelga del faro. Solo en modo «visible» hay carga pública (aunque vacía: la presencia de `pub` es
 * justo lo que dice «esta cuenta decidió mostrarse»). Anónimo u oculto: null, y el faro no lleva nada.
 */
export function cargaPublicaFaro(p: MeshPrivacySettings, foto: string | null, tipoAparato: string | null): CargaPublicaFaro | null {
  if (p.publicRadar !== "visible") return null;
  return {
    ...(p.shareAvatar && foto ? { a: foto } : {}),
    ...(p.shareDevice && tipoAparato ? { d: tipoAparato } : {}),
  };
}

/** Lo que se lee de un faro ajeno: si es público y qué trae. Tolera cualquier forma de carga. */
export function leerCargaPublica(payload: unknown, validarFoto: (u: unknown) => string | null): { publico: boolean; avatarUrl?: string; tipoAparato?: string } {
  const pub = payload && typeof payload === "object" ? (payload as { pub?: unknown }).pub : undefined;
  if (!pub || typeof pub !== "object") return { publico: false };
  const o = pub as { a?: unknown; d?: unknown };
  const foto = validarFoto(o.a);
  const tipo = typeof o.d === "string" && /^(mobile|tablet|laptop|desktop|server|other)$/.test(o.d) ? o.d : undefined;
  return { publico: true, ...(foto ? { avatarUrl: foto } : {}), ...(tipo ? { tipoAparato: tipo } : {}) };
}

/**
 * Tipo de aparato que ESTE navegador declara de sí mismo. Un navegador no distingue un portátil de un
 * equipo de escritorio, así que nunca dice «portátil» por su cuenta: la misma regla que el registro de
 * neuronas (`detectPlatform`), sin importarlo para que el relé no dependa de él.
 */
export function tipoAparatoDesdeAgente(agente: string, tactil: boolean): "mobile" | "tablet" | "desktop" {
  if (/android|iphone|ipod/i.test(agente)) return "mobile";
  if (/ipad/i.test(agente)) return "tablet";
  return tactil ? "tablet" : "desktop";
}
