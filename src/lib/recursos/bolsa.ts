// La bolsa de recursos (§4 de architecture/apps-en-la-malla.md): empareja peticiones y ofertas con
// reglas deterministas y su motivo: permisos y privacidad → latencia → energía → capacidad prestable
// → gratis y propio primero → reparto en varias fuentes → suelo (abrir en local o web y qué falta).
import { capacidadPrestable, type OfertaNeurona } from "./oferta";

export type ClaseParte = "computo" | "bytes" | "ventana" | "relevo";
export type NecesidadesParte = { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: number; kbps?: number };
export type PartePeticion = { clase: ClaseParte; necesita: NecesidadesParte; latenciaMaxMs?: number };
export type ContextoPeticion = { tipo: "cuenta" | "grupo" | "comunidad" | "publicacion" | "estacion"; id: string; privado: boolean };
export type PeticionBolsa = { id: string; contexto: ContextoPeticion; partes: PartePeticion[] };
export type EnlacePlan = { nodoId: string; latenciaMs: number };
export type ResultadoParte = { destino: string; fuentes?: string[]; enlace?: EnlacePlan; respaldo?: string; motivo: string };
export type SueloBolsa = { destino: "local" | "nube"; falta: string[]; motivo: string };
export type PlanParte = { parte: PartePeticion; plan: ResultadoParte };
export type PlanBolsa = { porParte: PlanParte[]; suelo?: SueloBolsa };
export type ReglasBolsa = { umbralBateriaPct?: number; maxFuentes?: number };

// `medio: "servidor-cerebro"` marca los servidores del cerebro (A1 y brain_server_links): siempre cuentan como propios.
const SERVIDOR_CEREBRO = "servidor-cerebro", RAM_VENTANA_DEFECTO = 512, UMBRAL_BATERIA_DEFECTO = 20, MAX_FUENTES_DEFECTO = 3;
const DETALLE: Record<ClaseParte, string> = { computo: "MB de RAM prestable", bytes: "MB de espacio por bandas", ventana: "MB prestables y la app en su lista", relevo: "kbps de subida" };
type Candidata = { oferta: OfertaNeurona; latenciaMs?: number; rango: number };

/** Regla 1: lo privado solo en la misma cuenta o los servidores del cerebro; nunca nube compartida ni vecinos públicos. */
function visibleYPermitida(o: OfertaNeurona, c: ContextoPeticion): boolean {
  const mismaCuenta = c.tipo === "cuenta" && o.cuentaId === c.id && o.presta.cuenta, servidor = o.medio === SERVIDOR_CEREBRO;
  const prestadaAlGrupo = c.tipo === "grupo" && o.presta.grupos.includes(c.id);
  const abiertos = c.tipo === "cuenta" || c.tipo === "comunidad" || c.tipo === "publicacion" || c.tipo === "estacion";
  return mismaCuenta || servidor || prestadaAlGrupo || (abiertos && !c.privado && o.presta.publico === true);
}

/** Regla 3: nunca una neurona con batería baja sin cargador, ni una que su dueño está usando a fondo. */
function energiaApta(o: OfertaNeurona, umbral: number): boolean {
  const e = o.energia;
  return !e.enUso && !(e.bateriaPct !== undefined && e.bateriaPct < umbral && !e.cargando);
}

/** Regla 2: latencia mínima medida de la oferta; null si no hay medida o supera el tope de la parte. */
function latenciaCumple(parte: PartePeticion, o: OfertaNeurona): number | null {
  const medidas = Object.values(o.enlaces.latenciaMs ?? {});
  if (medidas.length === 0) return null;
  const mejor = Math.min(...medidas), tope = parte.latenciaMaxMs;
  return tope !== undefined && mejor > tope ? null : mejor;
}

/** Regla 4: cabe en lo PRESTABLE (los topes del préstamo, no lo que la neurona tiene). */
function satisface(parte: PartePeticion, o: OfertaNeurona): boolean {
  const p = capacidadPrestable(o), n = parte.necesita;
  if (parte.clase === "computo") return (n.ramMb ?? 0) <= p.computo.ramLibreMb && (!n.gpu || p.computo.gpu === true) && (!n.motor || p.computo.motores.includes(n.motor));
  if (parte.clase === "bytes") return (n.volumen ?? 0) <= p.almacen.prestaMb;
  if (parte.clase === "ventana") return (n.ramMb ?? RAM_VENTANA_DEFECTO) <= p.computo.ramLibreMb && (!n.appId || o.apps.some((a) => a.id === n.appId));
  return (n.kbps ?? 0) <= (p.enlaces.subidaKbps ?? 0);
}

/** Regla 5: propio < servidores del cerebro < préstamos al grupo < vecinos públicos (§2); empate: nodoId. */
function rango(o: OfertaNeurona, c: ContextoPeticion): number {
  if (c.tipo === "cuenta" && o.cuentaId === c.id) return 0;
  if (o.medio === SERVIDOR_CEREBRO) return 1;
  return c.tipo === "grupo" && o.presta.grupos.includes(c.id) ? 2 : 3;
}

function aporte(c: Candidata, parte: PartePeticion): number {
  const p = capacidadPrestable(c.oferta);
  return parte.clase === "computo" ? p.computo.ramLibreMb : parte.clase === "bytes" ? p.almacen.prestaMb : parte.clase === "relevo" ? p.enlaces.subidaKbps ?? 0 : 0;
}

function demanda(parte: PartePeticion): number {
  if (parte.clase === "relevo") return parte.necesita.kbps ?? 0;
  if (parte.clase === "bytes") return parte.necesita.volumen ?? 0;
  if (parte.clase === "ventana") return parte.necesita.ramMb ?? RAM_VENTANA_DEFECTO;
  return parte.necesita.ramMb ?? 0;
}

function faltaDe(parte: PartePeticion): string {
  const n = parte.necesita;
  if (parte.clase === "computo") return `parte de computo: faltan ${n.ramMb ?? 512} MB de RAM prestable${n.gpu ? " con GPU" : ""}${n.motor ? ` y el motor «${n.motor}»` : ""}`;
  if (parte.clase === "bytes") return `parte de bytes: faltan ${n.volumen ?? 0} MB de espacio prestable por bandas`;
  if (parte.clase === "ventana") return `parte de ventana: falta ${n.appId ? `la app «${n.appId}»` : `${demanda(parte)} MB`} para abrir la ventana`;
  return `parte de relevo: faltan ${n.kbps ?? 0} kbps de subida prestable`;
}

/** Reglas 5 y 6: destino, enlace medido, respaldo en «bytes» y reparto cuando una sola fuente no basta. */
function armarPlan(parte: PartePeticion, cs: Candidata[], maxFuentes: number): ResultadoParte | null {
  const need = demanda(parte), unidad = parte.clase === "relevo" ? "kbps" : "MB";
  const elegidas: Candidata[] = [];
  let suma = 0;
  for (const c of parte.clase === "ventana" ? [cs[0]] : cs.slice(0, maxFuentes)) {
    elegidas.push(c);
    suma += aporte(c, parte);
    if (parte.clase === "ventana" || suma >= need) break;
  }
  if (parte.clase !== "ventana" && suma < need) return null;
  const [primero] = elegidas;
  const plan: ResultadoParte = { destino: primero.oferta.nodoId, motivo: "" };
  if (elegidas.length > 1) {
    plan.fuentes = elegidas.map((c) => c.oferta.nodoId);
    plan.motivo = `Se ramifica en ${elegidas.length} fuentes (${plan.fuentes.join(" + ")}): ${suma} ${unidad} prestables para la parte de ${parte.clase}.`;
  } else {
    plan.motivo = `${primero.oferta.nodoId} presta ${aporte(primero, parte)} ${DETALLE[parte.clase]}; primero lo propio y lo gratuito.`;
  }
  if (primero.latenciaMs !== undefined) plan.enlace = { nodoId: primero.oferta.nodoId, latenciaMs: primero.latenciaMs };
  if (parte.clase === "bytes" && cs[elegidas.length]) plan.respaldo = cs[elegidas.length].oferta.nodoId;
  return plan;
}

/**
 * Empareja una petición con las ofertas: por cada parte un plan (destino, fuentes si se ramifica,
 * enlace, respaldo y motivo); si una parte no cubre nada, el suelo dice de dónde abrirla y qué falta.
 */
export function planificar(peticion: PeticionBolsa, ofertas: OfertaNeurona[], reglas: ReglasBolsa = {}): PlanBolsa {
  const umbral = reglas.umbralBateriaPct ?? UMBRAL_BATERIA_DEFECTO, maxF = reglas.maxFuentes ?? MAX_FUENTES_DEFECTO;
  const falta: string[] = [], porParte: PlanParte[] = [];
  for (const parte of peticion.partes) {
    const cs: Candidata[] = [];
    for (const oferta of ofertas) {
      if (!visibleYPermitida(oferta, peticion.contexto) || !energiaApta(oferta, umbral)) continue;
      const latenciaMs = latenciaCumple(parte, oferta);
      if (parte.latenciaMaxMs !== undefined && latenciaMs === null) continue;
      if (!satisface(parte, oferta)) continue;
      cs.push({ oferta, latenciaMs: latenciaMs ?? undefined, rango: rango(oferta, peticion.contexto) });
    }
    cs.sort((a, b) => a.rango - b.rango || a.oferta.nodoId.localeCompare(b.oferta.nodoId));
    const plan = cs.length > 0 ? armarPlan(parte, cs, maxF) : null;
    if (plan === null) falta.push(faltaDe(parte)); else porParte.push({ parte, plan });
  }
  if (falta.length === 0) return { porParte };
  const privado = peticion.contexto.privado;
  return { porParte, suelo: { destino: privado ? "local" : "nube", falta,
    motivo: privado
      ? "Contexto privado: nada de nube compartida ni vecinos públicos; se abre en «local» mientras no haya recursos de su cuenta."
      : "Sin recursos en la red del contexto: se abre por la web (nube gratuita) mientras no haya ofertas que lo cubran." } };
}
