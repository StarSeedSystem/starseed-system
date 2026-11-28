/**
 * Oferta de capacidad de almacenamiento — señal de capa (ALC1125F).
 * Una neurona ofrece su almacén como anuncia sus demás capacidades: CUÁNTO
 * (bytesOfrecidos, con topeBytes), A QUIÉN (privada, grupo, comunidad o
 * pública), CUÁNDO (siempre, ventana o a mano) y con qué TOPE. Nace APAGADA.
 * Módulo puro: sin red, sin disco, sin claves.
 */

export type AmbitoOferta = "privada" | "grupo" | "comunidad" | "publica";
export type CuandoOferta = "siempre" | "ventana" | "a-mano";

export interface OfertaCapacidadAlmacen {
  activa: boolean;
  cuentaId: string;
  ambito: AmbitoOferta;
  grupoId?: string;
  comunidadId?: string;
  bytesOfrecidos: number;
  topeBytes: number;
  cuando: CuandoOferta;
  desdeMs?: number;
  hastaMs?: number;
}

export interface SolicitanteOferta {
  cuentaId: string;
  grupos?: string[];
  comunidades?: string[];
}
export const AMBITOS_OFERTA: readonly AmbitoOferta[] = ["privada", "grupo", "comunidad", "publica"];
export const CUANDOS_OFERTA: readonly CuandoOferta[] = ["siempre", "ventana", "a-mano"];
/** Número de bytes saneado: entero, finito y nunca negativo. */
function bytes(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
export function crearOfertaAlmacen(parcial: Partial<OfertaCapacidadAlmacen> = {}): OfertaCapacidadAlmacen {
  const cuentaId = texto(parcial.cuentaId);
  const pedidos = bytes(parcial.bytesOfrecidos);
  const topeBytes = parcial.topeBytes === undefined ? pedidos : bytes(parcial.topeBytes);
  const bytesOfrecidos = topeBytes > 0 ? Math.min(pedidos, topeBytes) : 0;
  const grupoId = texto(parcial.grupoId);
  const comunidadId = texto(parcial.comunidadId);
  let ambito: AmbitoOferta = AMBITOS_OFERTA.includes(parcial.ambito as AmbitoOferta) ? (parcial.ambito as AmbitoOferta) : "privada";
  // Nunca se amplía el público por accidente: sin identificador se queda en privada.
  if (ambito === "grupo" && !grupoId) ambito = "privada";
  if (ambito === "comunidad" && !comunidadId) ambito = "privada";
  const cuando: CuandoOferta = CUANDOS_OFERTA.includes(parcial.cuando as CuandoOferta) ? (parcial.cuando as CuandoOferta) : "siempre";
  return {
    activa: parcial.activa === true && cuentaId !== "" && bytesOfrecidos > 0,
    cuentaId,
    ambito,
    ...(ambito === "grupo" && grupoId ? { grupoId } : {}),
    ...(ambito === "comunidad" && comunidadId ? { comunidadId } : {}),
    bytesOfrecidos,
    topeBytes,
    cuando,
    ...(cuando === "ventana" ? { desdeMs: bytes(parcial.desdeMs), hastaMs: bytes(parcial.hastaMs) } : {}),
  };
}

/** Sanea una oferta que llega de otra neurona; undefined si no sirve o está apagada. */
export function normalizarOfertaAlmacen(x: unknown): OfertaCapacidadAlmacen | undefined {
  if (!x || typeof x !== "object") return undefined;
  const r = x as Record<string, unknown>;
  if (r.activa !== true) return undefined;
  if (typeof r.ambito !== "string" || !AMBITOS_OFERTA.includes(r.ambito as AmbitoOferta)) return undefined;
  if (typeof r.cuando !== "string" || !CUANDOS_OFERTA.includes(r.cuando as CuandoOferta)) return undefined;
  const oferta = crearOfertaAlmacen(r as Partial<OfertaCapacidadAlmacen>);
  return oferta.activa ? oferta : undefined;
}
export function ofertaVigente(oferta: OfertaCapacidadAlmacen, ahoraMs: number): boolean {
  if (!oferta.activa || oferta.bytesOfrecidos <= 0) return false;
  if (oferta.cuando === "siempre" || oferta.cuando === "a-mano") return true;
  const { desdeMs, hastaMs } = oferta;
  if (typeof desdeMs !== "number" || typeof hastaMs !== "number") return false;
  if (!(desdeMs > 0) || !(hastaMs > desdeMs)) return false;
  return ahoraMs >= desdeMs && ahoraMs <= hastaMs;
}

export function disponibleBytes(oferta: OfertaCapacidadAlmacen, usoBytes = 0): number {
  if (!oferta.activa) return 0;
  const tope = Math.min(oferta.bytesOfrecidos, oferta.topeBytes);
  return Math.max(0, tope - bytes(usoBytes));
}
export function puedeServirOferta(
  oferta: OfertaCapacidadAlmacen,
  solicitante: SolicitanteOferta,
  opciones: { ahoraMs?: number; usoBytes?: number } = {},
): boolean {
  if (!ofertaVigente(oferta, opciones.ahoraMs ?? Date.now())) return false;
  if (disponibleBytes(oferta, opciones.usoBytes) <= 0) return false;
  const cuenta = texto(solicitante?.cuentaId);
  if (cuenta !== "" && cuenta === oferta.cuentaId) return true; // el dueño siempre
  switch (oferta.ambito) {
    case "publica":
      return true;
    case "grupo":
      return !!oferta.grupoId && (solicitante.grupos ?? []).includes(oferta.grupoId);
    case "comunidad":
      return !!oferta.comunidadId && (solicitante.comunidades ?? []).includes(oferta.comunidadId);
    case "privada":
    default:
      return false;
  }
}
const ETIQUETAS_AMBITO: Record<AmbitoOferta, string> = {
  privada: "Privada (solo mi cuenta)",
  grupo: "Grupo",
  comunidad: "Comunidad",
  publica: "Pública",
};

export function etiquetaAmbito(ambito: AmbitoOferta): string {
  return ETIQUETAS_AMBITO[ambito] ?? ETIQUETAS_AMBITO.privada;
}
