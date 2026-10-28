/** Bots de Astraura · CREACIÓN: Protomolécula y XR (BOT1011T; astraura-bots.md §6 y §12, protomolecula.md §5.1, starseed-xr.md).
 * PRECONDICIÓN: la acción ya pasó `validarAccion` + `decidirAccion` y el bucle. La herramienta `protomolecula` se busca POR
 * NOMBRE en `AURORA_ACTIONS` en cada llamada (si falta, «próximamente»); `xr.intencion` solo da la tarjeta: nada se ejecuta. */
import { AURORA_ACTIONS } from "@/lib/aurora/actions";
import type { Accion, ModoRelativo } from "@/lib/protomolecula/tipos";
import { disponerTrinity, type EntradaEspacio, type NodoEspacial } from "@/lib/xr/espacio-trinity";
import { entenderVoz, tarjetaDe, type ContextoVoz, type ResultadoVoz, type TarjetaConfirmacion } from "@/lib/xr/intenciones-voz";
import { acotar, aGrados, aRadianes, mm, type Vec3 } from "@/lib/xr/tipos";
import { tocaNucleo, type AccionBot, type TipoAccion } from "../acciones";
import { MAX_ORBES_VISIBLES } from "../orbes";
import type { DepsEjecutor, ResultadoEjecucion } from "./ejecutor-acciones";

export const HERRAMIENTA_PROTOMOLECULA = "protomolecula";
export const PROXIMAMENTE_PROTOMOLECULA = "próximamente: herramienta de la Protomolécula";
export const SUBACCIONES_PROTOMOLECULA = ["abrir", "estado", "mover", "dictar", "deshacer", "proponer-codigo",
  "activar", "desactivar", "alternar", "cerrar"] as const;
type Subaccion = (typeof SUBACCIONES_PROTOMOLECULA)[number];
const MODOS: readonly ModoRelativo[] = ["delta", "porcentaje-valor", "porcentaje-rango", "pasos"];
const DONDE = ["orbe", "ventana", "bloque"];
const PATRON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const esId = (v: unknown): v is string => typeof v === "string" && PATRON_ID.test(v);
const esTexto = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const objeto = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const fallo = (motivo: string): ResultadoEjecucion => ({ ok: false, previo: {}, motivo });
/** Solo `Operacion` exacta o relativa (§5.1): alternar y disparo no los pide un bot. */
function operacionDe(v: unknown): Accion | null {
  const o = objeto(v);
  const valor = o.valor;
  const exacto = typeof valor === "boolean" || (typeof valor === "number" && Number.isFinite(valor)) || esTexto(valor, 200);
  if (o.tipo === "exacta" && exacto) return { tipo: "exacta", valor };
  const modo = MODOS.find((x) => x === o.modo);
  return o.tipo === "relativa" && typeof o.cantidad === "number" && Number.isFinite(o.cantidad) && modo ? { tipo: "relativa", cantidad: o.cantidad, modo } : null;
}
/** Args del bot → args de la herramienta. Desconfía de todo: lo que no encaja se dice. */
function argsHerramienta(sub: Subaccion, a: Record<string, unknown>): { args: Record<string, unknown> } | { por: string } {
  switch (sub) {
    case "abrir": {
      const atomos: unknown[] = Array.isArray(a.atomos) ? a.atomos : [];
      const donde = a.donde ?? "orbe";
      if (atomos.length > 16 || !atomos.every(esId)) return { por: "«atomos» debe ser una lista de hasta 16 identificadores." };
      return typeof donde === "string" && DONDE.includes(donde) ? { args: { atomos, donde } } : { por: "«donde» debe ser orbe, ventana o bloque." };
    }
    case "mover": {
      const o = objeto(a.objetivo);
      const operacion = operacionDe(a.operacion);
      if (!esId(o.atomoId) || !esId(o.parametroId)) return { por: "«objetivo» necesita un atomoId y un parametroId válidos." };
      return operacion ? { args: { objetivo: { atomoId: o.atomoId, parametroId: o.parametroId }, operacion } } : { por: "«operacion» debe ser exacta (valor) o relativa (cantidad y modo)." };
    }
    case "dictar": return esTexto(a.frase, 500) ? { args: { frase: a.frase.trim() } } : { por: "«frase» debe ser texto de hasta 500 caracteres." };
    case "proponer-codigo": {
      const destino = a.destino;
      if (!esTexto(a.descripcion, 2000)) return { por: "«descripcion» debe explicar qué candidato crear." };
      if (destino !== undefined && (typeof destino !== "string" || tocaNucleo(destino))) return { por: "El destino es del núcleo intocable: editable sí, ejecutable no." };
      return { args: { descripcion: a.descripcion.trim(), ...(destino ? { destino } : {}) } };
    }
    default: return { args: {} };
  }
}

/** `protomolecula.operar` → herramienta de agente §5.1. Mover y dictar se deshacen con su propio `deshacer`. */
export async function ejecutarProtomolecula(a: AccionBot, dep: DepsEjecutor): Promise<ResultadoEjecucion> {
  if (a.tipo !== "protomolecula.operar") return fallo(`Esta pieza solo traduce «protomolecula.operar», no «${a.tipo}».`);
  const def = AURORA_ACTIONS.find((x) => x.name === HERRAMIENTA_PROTOMOLECULA);
  if (!def) return fallo(PROXIMAMENTE_PROTOMOLECULA);
  const sub = SUBACCIONES_PROTOMOLECULA.find((x) => x === a.args.accion);
  if (!sub) return fallo(`La Protomolécula no tiene la acción «${String(a.args.accion)}»: ${SUBACCIONES_PROTOMOLECULA.join(", ")}.`);
  const t = argsHerramienta(sub, objeto(a.args.args));
  if ("por" in t) return fallo(t.por);
  const molecula = typeof a.args.molecula === "string" ? { molecula: a.args.molecula } : {};
  try {
    const r = await def.handler({ accion: sub, ...molecula, ...t.args, agente: dep.actor ?? "bot:astraura", origen: "agente" }, { router: dep.router, onStatus: dep.onStatus });
    const reversible = r.ok && (sub === "mover" || sub === "dictar");
    return { ok: r.ok, previo: reversible ? { valor: { accion: "deshacer", args: {} } } : {}, motivo: r.message };
  } catch {
    return fallo("No pude operar la Protomolécula: ocurrió un error inesperado.");
  }
}

/** `tarjeta` la confirma la PERSONA (contrato XR); este módulo nunca la ejecuta. */
export interface ResultadoIntencionXR extends ResultadoEjecucion { tarjeta: TarjetaConfirmacion | null; voz: ResultadoVoz }
export const CONTEXTO_VOZ_VACIO: ContextoVoz = { grupos: [], contactos: [], estaciones: [], servidores: [] };
export const TITULO_PROPUESTA_BOT = "Tu bot propone esto. ¿Lo hago?";
/** `xr.intencion` → tarjeta de confirmación. Lo que no sale de la cuenta también lo confirma la persona. */
export function ejecutarIntencionXR(a: AccionBot, ctx: ContextoVoz, dep: Pick<DepsEjecutor, "onStatus"> = {}): ResultadoIntencionXR {
  const voz: ResultadoVoz = a.tipo === "xr.intencion" && typeof a.args.frase === "string" ? entenderVoz(a.args.frase, ctx) : { ok: false, razon: "no-entendido", pregunta: `Esta pieza solo traduce «xr.intencion», no «${a.tipo}».`, sugerencias: [] };
  if (!voz.ok) return { ok: false, previo: {}, motivo: voz.pregunta, tarjeta: null, voz };
  dep.onStatus?.("Esperando tu confirmación…");
  const tarjeta = voz.tarjeta ?? { ...tarjetaDe(voz.pasos), titulo: TITULO_PROPUESTA_BOT };
  return { ok: true, previo: {}, motivo: "Tarjeta lista: no se hace nada hasta que la confirmes.", tarjeta, voz };
}

export interface AnclaBot { id: string; indice: number; posicion: Vec3; yaw: number; anclaje: NodoEspacial["anclaje"]; visible: boolean; fase: number }
export const ESPACIO_POR_DEFECTO: EntradaEspacio = { alturaOjos: 1.6, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo" };
const MARGEN_DEG = 7, FILA_DEG = 8;
/** Fase [0, 1) estable por bot (FNV-1a): las orbes no respiran a la vez. */
const faseDe = (id: string): number => Math.floor(([...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) / 4294967296) * 1000) / 1000;
/** Orbe junto a Zenith (la guía de IA), en el hueco hacia los laterales; del 6.º en adelante, en la ranura de «más». */
export function anclaDeBot(botId: string, indice: number, e: EntradaEspacio = ESPACIO_POR_DEFECTO): AnclaBot {
  const i = Number.isFinite(indice) && indice > 0 ? Math.floor(indice) : 0;
  const ranura = Math.min(i, MAX_ORBES_VISIBLES);
  const z = disponerTrinity(e).nodos.zenith;
  const unaMano = e.postura === "una-mano"; // en una mano, Horizon va del lado dominante: las orbes al otro
  const lado = unaMano ? (e.manoDominante === "derecha" ? -1 : 1) : ranura % 2 === 0 ? 1 : -1;
  const fila = unaMano ? ranura : Math.floor(ranura / 2);
  const az = aRadianes(lado * (aGrados(Math.atan2(z.ancho / 2, z.distancia)) + MARGEN_DEG)) + (e.yawBase ?? 0);
  const el = aRadianes(z.elevacionDeg - 6 - fila * FILA_DEG);
  const ojos = acotar(Number.isFinite(e.alturaOjos) ? e.alturaOjos : 1.6, 0.8, 2.1), d = z.distancia;
  const posicion: Vec3 = [mm(d * Math.cos(el) * Math.sin(az)), mm(ojos + d * Math.sin(el)), mm(-d * Math.cos(el) * Math.cos(az))];
  return { id: `bot:${botId}`, indice: i, posicion, yaw: mm(-az), anclaje: z.anclaje, visible: i < MAX_ORBES_VISIBLES, fase: faseDe(botId) };
}

/** `contextoVoz`: solo lo que ESTE bot puede ver; a un invitado o a un bot de grupo no se le pasan contactos personales. */
export interface DepsCreacion extends DepsEjecutor { contextoVoz?: ContextoVoz }
export type EjecutorCreacion = (a: AccionBot, dep: DepsCreacion) => Promise<ResultadoEjecucion>;
/** Para BOT1011G (`ejecutor-acciones.ts`): añade los dos ejecutores de creación a su mapa por tipo. */
export function registrarEnEjecutor(mapa: Map<TipoAccion, EjecutorCreacion>): Map<TipoAccion, EjecutorCreacion> {
  mapa.set("protomolecula.operar", (a, dep) => ejecutarProtomolecula(a, dep));
  mapa.set("xr.intencion", async (a, dep) => ejecutarIntencionXR(a, dep.contextoVoz ?? CONTEXTO_VOZ_VACIO, dep));
  return mapa;
}
