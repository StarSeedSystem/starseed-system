/**
 * El generador de los sueños sobre el enrutador económico de Astraura (Ola 1025U · U4): `astrauraChat`
 * (`src/ai/astraura/router.ts`), gratis primero y local primero (BitNet 1.58, Needle y Jev antes que la nube), con
 * `agentId` para que apliquen las capas y el sistema primario de la ficha del agente.
 *
 * Tres cosas que este módulo hace para que un sueño sea honesto y barato:
 *  · SIN PAGO: si hay una fuente de pago conectada y permitida por la cuenta, pero la ficha del agente no la permite,
 *    se fija la mejor fuente que NO sea de pago (`rankCandidates` con el pago apagado). Y si aun así la ruta resultara de
 *    pago, el texto se descarta.
 *  · SIN PLANTILLAS: cuando ninguna fuente responde, el router contesta con una plantilla local («Aurora (respuesta
 *    local)», `route.local`). Eso NO es IA: aquí se devuelve como «sin IA», nunca como un turno del sueño.
 *  · SIN MEZCLAR LO PERSONAL: pasa `soloAgente`, para que ni la personalidad activa de la cuenta, ni su contexto personal
 *    (perfiles, mensajes, archivos), ni el contexto de Aurora (secciones del OS, pantalla, voz, habilidades) entren en un
 *    texto que leerán otros agentes.
 * El enrutador se carga a demanda (`import()`): es pesado y no hace falta para pintar el mundo.
 */
import type { ChatMessage } from "@/ai/providers/types";
import type { SourceAvailability } from "@/ai/astraura/availability";
import type { IntelligenceSettings, AstrauraChatRequest, RouteRecord, RouteCandidate, TaskProfile } from "@/ai/astraura/router";
import type { GeneradorIA, PeticionIA, RespuestaIA } from "./ejecutor";

/** Lo que se necesita del enrutador; se puede sustituir en las pruebas. */
export interface ModuloRouter {
  astrauraChat: (req: AstrauraChatRequest) => Promise<{ text: string; route?: RouteRecord }>;
  getIntelligenceSettings: () => IntelligenceSettings;
  classifyTask: (messages: ChatMessage[], hint?: TaskProfile["kind"]) => TaskProfile;
  rankCandidates: (profile: TaskProfile, avail: SourceAvailability[], prefs: IntelligenceSettings) => RouteCandidate[];
}

export interface DepsGeneradorRouter {
  cargarRouter?: () => Promise<ModuloRouter>;
  disponibilidad?: () => Promise<SourceAvailability[]>;
}

export const MOTIVO_MODO_MANUAL =
  "Tu ajuste de Inteligencia está en «manual»: los sueños usan el enrutador económico (gratis primero) y no el proveedor que elegiste a mano. Cámbialo a «automático» en Ajustes → Inteligencia para soñar.";
export const MOTIVO_SIN_IA = "No hay una IA gratuita disponible ahora mismo: no se inventa el sueño. Revisa tu conexión o enciende Astraura 1.58 en esta neurona.";

async function cargarRouterReal(): Promise<ModuloRouter> {
  const m = await import("@/ai/astraura/router");
  return {
    astrauraChat: m.astrauraChat,
    getIntelligenceSettings: m.getIntelligenceSettings,
    classifyTask: m.classifyTask,
    rankCandidates: m.rankCandidates,
  };
}

async function disponibilidadReal(): Promise<SourceAvailability[]> {
  const { detectAvailabilitySafe } = await import("@/ai/astraura/availability");
  return detectAvailabilitySafe();
}

export function crearGeneradorRouter(deps: DepsGeneradorRouter = {}): GeneradorIA {
  const cargar = deps.cargarRouter ?? cargarRouterReal;
  const disponibilidad = deps.disponibilidad ?? disponibilidadReal;

  return async (p: PeticionIA): Promise<RespuestaIA> => {
    let router: ModuloRouter;
    try {
      router = await cargar();
    } catch {
      return { ok: false, motivo: "No se pudo cargar el enrutador de IA." };
    }

    let prefs: IntelligenceSettings;
    try {
      prefs = router.getIntelligenceSettings();
    } catch {
      return { ok: false, motivo: "No se pudieron leer tus ajustes de Inteligencia." };
    }
    if (prefs.mode === "manual") return { ok: false, motivo: MOTIVO_MODO_MANUAL };

    // Sin permiso de pago en la ficha: si el router PODRÍA elegir una fuente de pago, se fija la mejor que no lo sea.
    let forceSource: AstrauraChatRequest["forceSource"];
    if (!p.permitirPago && prefs.allowConfiguredPaid) {
      try {
        const avail = await disponibilidad();
        const hayPago = avail.some((a) => a.ready && a.source.tier === "paid" && !!a.userConfig);
        if (hayPago) {
          const perfil = router.classifyTask(p.mensajes, "creative");
          const mejor = router.rankCandidates(perfil, avail, { ...prefs, allowConfiguredPaid: false }).find((c) => c.source.tier !== "paid");
          if (!mejor) return { ok: false, motivo: MOTIVO_SIN_IA };
          forceSource = { sourceId: mejor.source.id, modelId: mejor.model.id };
        }
      } catch {
        // Sin saber qué hay conectado no se arriesga el gasto: no se llama.
        return { ok: false, motivo: "No se pudo comprobar qué fuentes de IA hay conectadas, y sin eso no se arriesga un gasto." };
      }
    }

    if (p.signal.aborted) return { ok: false, motivo: "Cancelado." };
    let res: { text: string; route?: RouteRecord };
    try {
      res = await router.astrauraChat({
        messages: p.mensajes,
        agentId: p.agenteId,
        maxTokens: p.maxTokens,
        temperature: p.temperature,
        taskHint: "creative",
        signal: p.signal,
        soloAgente: true,
        ...(forceSource ? { forceSource } : {}),
      });
    } catch (e) {
      return { ok: false, motivo: e instanceof Error && e.message ? `La IA falló: ${e.message}` : "La IA falló." };
    }

    const ruta = res.route;
    const texto = typeof res.text === "string" ? res.text.trim() : "";
    // La respuesta local honesta del enrutador es una plantilla («ninguna fuente respondió»), no un turno de sueño.
    if (!ruta || ruta.local === true || ruta.ok === false || !texto) return { ok: false, motivo: MOTIVO_SIN_IA };
    if (ruta.free === false && !p.permitirPago) {
      return { ok: false, motivo: "La ruta eligió una fuente de pago y la ficha del agente no lo permite: se descartó ese turno." };
    }
    return { ok: true, texto, fuente: ruta.sourceLabel, gratis: ruta.free };
  };
}
