"use client";

/**
 * Bots/dots de Astraura · Ejecutor de acciones tipadas (BOT1011G).
 *
 * PRECONDICIÓN (no negociable): la acción ya pasó por `validarAccion` +
 * `decidirAccion` y por el bucle (`avanzar` de `bucle.ts`) en fase `actuando`;
 * aquí jamás se vuelve a decidir el permiso, solo se traduce al ejecutor real:
 *   navegar/abrir-app → `navegar`/`ir_app` de `AURORA_ACTIONS` (buscados por nombre)
 *   widget.añadir     → `agregar_widget` de `AURORA_ACTIONS`
 *   capa-pantalla     → `normalizarCapa` + apilar (máx. 8 por bot) en el panel de capas
 *                       (evento `EVENTO_CAPA_BOT`, lo pinta `CapaPantallaBot` con BOT1011V)
 *   ajuste.proponer   → `validarAccionUi` + aplicador con bitácora deshacible
 *   notificar         → `notifyFromApp`
 *   codigo.proponer   → solo se guarda el CANDIDATO en `starseed.astraura.bots.candidatos.v1`; jamás se ejecuta
 *   el resto          → «próximamente: …» con la tarea que lo trae.
 * Devuelve el `previo` que `deshacer` (acciones.ts) necesita para el camino de vuelta.
 */
import { AURORA_ACTIONS, type AuroraActionContext, type AuroraRouter } from "@/lib/aurora/actions";
import { validarAccionUi, type TipoAccionUi } from "@/lib/astraura/ui-acciones";
import { aplicarAccion, type EntradaBitacora } from "@/lib/astraura/ui-aplicador";
import { notifyFromApp } from "@/lib/notifications/app-notify";
import type { AppearanceConfig } from "../../../context/appearance-context";
import type { AccionBot, Previo, TipoAccion } from "../acciones";
import { apilar, esCapaValida, normalizarCapa, retirar, type CapaActiva } from "../capa-pantalla";
import { ejecutar, type OpcionesComputadora } from "./computadora-cliente";
import { registrarEnEjecutor, type DepsCreacion, type EjecutorCreacion } from "./acciones-creacion";

/** Dependencias que inyecta quien llama DESDE el bucle (nada se lee de globales salvo DOM). */
export interface DepsEjecutor {
  router: AuroraRouter;
  onStatus?: (estado: string) => void;
  /** Quién actúa, p. ej. `bot:cafe-personal` (queda en la bitácora de ajustes). */
  actor?: string;
  /** Presente solo si en este contexto se puede aplicar un ajuste de apariencia. */
  apariencia?: {
    actual: AppearanceConfig;
    aplicar: (siguiente: AppearanceConfig, entrada: EntradaBitacora) => void;
  };
}

export interface ResultadoEjecucion {
  ok: boolean;
  previo: Previo;
  motivo: string;
}

export const CLAVE_CANDIDATOS = "starseed.astraura.bots.candidatos.v1";
const creationActionsMap = registrarEnEjecutor(new Map<TipoAccion, EjecutorCreacion>());

/* ── Panel de capas (BOT1011V) ─────────────────────────────────────────────
 * El ejecutor apila aquí las capas validadas y lo Avisa con un evento:
 * el anfitrión que pinta `CapaPantallaBot` deja de suscribirse al montar. */
export const EVENTO_CAPA_BOT = "starseed:astraura-bot-capa";
export interface DetalleCapaBot { capas: readonly CapaActiva[] }

let capasPanel: readonly CapaActiva[] = [];
/** Copia inmutable de las capas del panel ahora mismo (para quien pinta). */
export const capasPanelAhora = (): readonly CapaActiva[] => capasPanel;

function emitirCapas(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_CAPA_BOT, { detail: { capas: [...capasPanel] } }));
  } catch {
    /* sin observadores no pasa nada */
  }
}

/** Retira una capa del panel (el «Quitar» del componente o el deshacer `{retirar: id}`). */
export function retirarCapaPanel(id: string): void {
  capasPanel = retirar(capasPanel, id);
  emitirCapas();
}

/**
 * Puro: normaliza los argumentos de `capa-pantalla` con `normalizarCapa` y quita la capa
 * anotada (id, bot y `previo: {idEnviado}` para que `deshacer` devuelva `{retirar: id}`).
 */
export function prepararCapa(
  args: unknown, id: string, botId: string, nombreBot: string,
): { capa: CapaActiva; previo: Previo } | { problemas: string[] } {
  const r = normalizarCapa(args);
  if (!esCapaValida(r)) return r;
  return { capa: { ...r, id, botId, nombreBot }, previo: { idEnviado: id } };
}

const f = (motivo: string): ResultadoEjecucion => ({ ok: false, previo: {}, motivo });
const enCliente = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

/** Busca una acción de Aurora POR NOMBRE; si no existe, se dice (nunca se improvisa). */
function buscarAurora(nombre: string) {
  return AURORA_ACTIONS.find((a) => a.name === nombre);
}

async function viaAurora(nombre: string, args: Record<string, unknown>, dep: DepsEjecutor, extra?: Previo): Promise<ResultadoEjecucion> {
  const def = buscarAurora(nombre);
  if (!def) return f(`próximamente: el ejecutor «${nombre}» de Aurora no está instalado.`);
  const ctx: AuroraActionContext = { router: dep.router, onStatus: dep.onStatus };
  const r = await def.handler(args, ctx);
  return { ok: r.ok, previo: extra ?? {}, motivo: r.message };
}

/** Guarda un candidato de código (nunca lo ejecuta: editable sí, ejecutable no). */
function guardarCandidato(args: AccionBot["args"]): ResultadoEjecucion {
  if (!enCliente()) return f("próximamente: sin navegador no hay dónde guardar el candidato.");
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `cand-${Date.now()}`;
  const entrada = { id, at: new Date().toISOString(), destino: args.destino, lenguaje: args.lenguaje ?? null, codigo: args.codigo, motivo: args.motivo ?? null };
  try {
    const previas = JSON.parse(window.localStorage.getItem(CLAVE_CANDIDATOS) ?? "[]") as unknown[];
    window.localStorage.setItem(CLAVE_CANDIDATOS, JSON.stringify([entrada, ...previas].slice(0, 50)));
  } catch {
    return f("No pude guardar el candidato (almacenamiento lleno o bloqueado).");
  }
  return { ok: true, previo: { idCreado: id }, motivo: "Candidato guardado para revisión humana; no se ejecutó ningún código." };
}

/**
 * Capa sobre la pantalla (BOT1011V): normaliza, apila (máx. 8 por bot, lo hace `apilar`)
 * y avisa con `EVENTO_CAPA_BOT`; la pinta `CapaPantallaBot`, que también ofrece «Quitar».
 */
const CAPA_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
function capaPantalla(args: AccionBot["args"], dep: DepsEjecutor): ResultadoEjecucion {
  if (!enCliente()) return f("No hay pantalla donde pintar la capa.");
  const botId = dep.actor ?? "bot:astraura";
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `capa-${Date.now()}`;
  const preparado = prepararCapa(args, CAPA_ID.test(id) ? id : `capa-panel`, botId, botId.replace(/^bot:/, ""));
  if ("problemas" in preparado) return f(`Capa rechazada: ${preparado.problemas.join(" ")}`);
  capasPanel = apilar(capasPanel, preparado.capa);
  emitirCapas();
  return { ok: true, previo: preparado.previo, motivo: `Capa ${preparado.capa.forma} puesta sobre la pantalla.` };
}

function ajusteProponer(args: AccionBot["args"], dep: DepsEjecutor): ResultadoEjecucion {
  if (!dep.apariencia) return f("No tengo la apariencia a mano en este contexto.");
  const accionUi = validarAccionUi({
    tipo: args.campo as TipoAccionUi, ambito: "cuenta",
    parche: typeof args.valor === "object" && args.valor !== null ? args.valor : {},
    motivo: typeof args.motivo === "string" ? args.motivo : "Ajuste propuesto por tu bot.",
    actor: dep.actor ?? "bot:astraura",
  });
  if (!accionUi) return f("Ese campo no es un ajuste de apariencia que pueda proponer.");
  const { siguiente, entrada } = aplicarAccion(dep.apariencia.actual, accionUi);
  dep.apariencia.aplicar(siguiente, entrada);
  return { ok: true, previo: { valor: entrada.inverso as object }, motivo: `Ajuste aplicado y anotado en la bitácora: ${entrada.resumen}.` };
}

/** Tareas que traerán cada ejecutor que aquí se honesta como «próximamente: …». */
const PROXIMAMENTE: Partial<Record<TipoAccion, string>> = {
   "pagina.editar": "próximamente: editar páginas llega con BOT1011J1.",
   "tarea.crear": "próximamente: crear tareas llega con BOT1011W.",
   "mensaje.enviar": "próximamente: se conectará con la mensajería existente tras tu confirmación.",
   "widget.mover": "próximamente: mover widgets llega con el cableado del tablero.",
   "widget.quitar": "próximamente: quitar widgets llega con el cableado del tablero.",
};

/** Traduce una acción YA autorizada por el bucle al ejecutor real del OS. Nunca lanza. */
export async function ejecutarAccion(accion: AccionBot, dep: DepsEjecutor): Promise<ResultadoEjecucion> {
   try {
      switch (accion.tipo) {
         case "navegar": {
            const rutaPrevia = enCliente() ? window.location.pathname : undefined;
            return viaAurora("navegar", accion.args, dep, rutaPrevia ? { ruta: rutaPrevia } : {});
         }
         case "abrir-app":
            return viaAurora("ir_app", { sistema: accion.args.app }, dep);
         case "widget.añadir": {
            const r = await viaAurora("agregar_widget", accion.args, dep);
            return r;
         }
         case "capa-pantalla":
            return capaPantalla(accion.args, dep);
         case "ajuste.proponer":
            return ajusteProponer(accion.args, dep);
         case "codigo.proponer":
            return guardarCandidato(accion.args);
         case "computadora.ejecutar": {
            const botId = dep.actor ?? "bot:astraura";
            const orden = accion.args.orden as string;
            const resultado = await ejecutar(botId, orden, {});
            if (resultado.ok) {
               return { ok: true, previo: {}, motivo: `Orden ejecutada: ${resultado.datos.salida}` };
            } else {
               return { ok: false, previo: {}, motivo: resultado.motivo };
            }
         }
         case "protomolecula.operar":
         case "xr.intencion": {
            const executor = creationActionsMap.get(accion.tipo);
            if (executor) {
               return await executor(accion, dep);
            } else {
               return f(`No se encontró el ejecutor para «${accion.tipo}»`);
            }
         }
         case "notificar": {
            const r = notifyFromApp({
               appId: typeof accion.args.a === "string" ? accion.args.a : "astraura-bots",
               title: "Aviso de tu bot", body: String(accion.args.texto), dedupeKey: `bot:${String(accion.args.texto)}`,
            });
            return { ok: r.ok, previo: {}, motivo: r.ok ? "Notificación mostrada." : `No se pudo notificar (${r.reason ?? "error"}).` };
         }
         default:
            return f(PROXIMAMENTE[accion.tipo] ?? `próximamente: «${accion.tipo}» aún no tiene ejecutor.`);
      }
   } catch {
      return f(`No pude ejecutar «${accion.tipo}»: ocurrió un error inesperado.`);
   }
}
