/**
 * destinoDeIA — a qué servidor de IA va cada capacidad según la topología (Ola 1023R · RIA1023C).
 *
 * PURA: nada de red, disco ni procesos (SOP `architecture/recursos-ia-neurona.md` §3: la antena
 * nunca lleva pesos ni conversación, solo reflexiones y decisiones). En la topología
 * «servidor-propio» la respuesta lleva la URL del servidor de IA de la neurona elegida
 * (`http://127.0.0.1:4480/v1` si es esta neurona; de otra solo se sabe cuando su oferta traiga la
 * dirección). Reutiliza los tipos de `tipos.ts`: nada nuevo.
 */
import { PUERTO_SERVIDOR_IA } from "./oferta-desde-asignaciones";
import type {
    Asignacion,
    Capacidad,
    ConfigTopologia,
    InventarioRecursos,
    PlanRecursos,
    Procesador,
    Via,
} from "./tipos";

/** A dónde va una capacidad: la vía, la neurona que la sirve, su URL (si se conoce) y el porqué. */
export interface DestinoIA {
    /** La vía elegida; `null` = ahora mismo no hay manera legítima (más abajo está el motivo). */
    via: Via | null;
    neuronaId: string | null;
    /** OpenAI-compatible de un servidor propio de IA; fuera de esta neurona, hasta conocerla. */
    baseUrl: string | null;
    motivo: string;
}

/** El plan puede venir completo (`PlanRecursos`) o solo su configuración (`ConfigTopologia`). */
type PlanIA = Pick<PlanRecursos, "topologia"> | ConfigTopologia;

/** Extrae la configuración tanto de un plan entero como de una configuración a pelo. PURA. */
function configDe(plan: PlanIA): ConfigTopologia | null {
    const t = plan.topologia;
    if (typeof t === "string") return plan as ConfigTopologia;
    return typeof t === "object" && t !== null ? (plan as PlanRecursos).topologia : null;
}

function neuronaDe(inv: InventarioRecursos, id: string | undefined) {
    return id ? inv.neuronas.find((n) => n.id === id) : undefined;
}

/** Un procesador puede estar dentro de una neurona o suelto (servidores de la cuenta). PURA. */
function procesadorDe(inv: InventarioRecursos, id: string): Procesador | undefined {
    for (const n of inv.neuronas) {
        const p = n.procesadores.find((q) => q.id === id);
        if (p) return p;
    }
    return inv.procesadoresSueltos.find((p) => p.id === id);
}

/** La mejor vía para llegar a una neurona: la suya, la del plan o la malla por defecto. PURA. */
function viaHacia(n: { vias: Via[] }, cfg: ConfigTopologia): Via {
    return n.vias[0] ?? cfg.vias[0] ?? "malla-local";
}

/** Nadie conversa por antena (§3): solo mensajes y decisiones tipadas. PURA. */
function sinAntena(d: DestinoIA, capacidad: Capacidad): DestinoIA {
    if (d.via !== "antena" || capacidad === "decision") return d;
    return {
        via: null,
        neuronaId: d.neuronaId,
        baseUrl: null,
        motivo: `La antena no lleva «${capacidad}» (mucho peso, ancho de banda mínimo): solo mensajes y decisiones.`,
    };
}

/** Topología «servidor-propio»: la URL del servidor de IA de la neurona elegida. PURA. */
function servidorPropio(cfg: ConfigTopologia, inv: InventarioRecursos, capacidad: Capacidad): DestinoIA {
    const id = cfg.servidorNeuronaId;
    if (!id) return { via: null, neuronaId: null, baseUrl: null, motivo: "Falta decir qué neurona sirve la IA en esta topología." };
    const n = neuronaDe(inv, id);
    if (!n) return {
        via: cfg.vias[0] ?? "malla-local", neuronaId: id, baseUrl: null,
        motivo: `${id} (la que sirve tu IA) no está en el inventario: su dirección aparecerá cuando la veamos en la malla o en la red.`,
    };
    const via = viaHacia(n, cfg);
    if (!n.online) return { via, neuronaId: n.id, baseUrl: null, motivo: `${n.nombre} sirve tu IA y está apagada: enciéndela para usar su «${capacidad}».` };
    if (n.esEsta) return {
        via: "local", neuronaId: n.id, baseUrl: `http://127.0.0.1:${PUERTO_SERVIDOR_IA}/v1`,
        motivo: `Tu servidor propio de IA vive aquí y sirve la «${capacidad}» en 127.0.0.1:${PUERTO_SERVIDOR_IA}/v1.`,
    };
    return {
        via, neuronaId: n.id, baseUrl: null,
        motivo: `${n.nombre} sirve la «${capacidad}» para toda la cuenta; todavía no conocemos su dirección, la trae su oferta por ${via}.`,
    };
}

type EntradaCapacidad = NonNullable<ConfigTopologia["porCapacidad"]>[Capacidad];

/** ProcesaEn de una capacidad en «fragmentada»: lo dice la topología o la asignación de su modelo. PURA. */
function procesaEnDe(entrada: EntradaCapacidad | undefined, asignaciones: Record<string, Asignacion>): string | undefined {
    if (!entrada) return undefined;
    if (entrada.procesaEn && entrada.procesaEn !== "auto") return entrada.procesaEn;
    if (!entrada.modeloId) return undefined;
    for (const a of Object.values(asignaciones)) {
        if (a.elemento.tipo === "modelo" && a.elemento.id === entrada.modeloId && a.procesaEn && a.procesaEn !== "auto") return a.procesaEn;
    }
    return undefined;
}

/** «fragmentada»: la neurona asignada a esa capacidad; sin asignación, esta neurona en local. PURA. */
function fragmentada(cfg: ConfigTopologia, asignaciones: Record<string, Asignacion>, inv: InventarioRecursos, capacidad: Capacidad): DestinoIA {
    const local: DestinoIA = {
        via: "local", neuronaId: inv.estaNeuronaId, baseUrl: null,
        motivo: `La «${capacidad}» no tiene asignación en la topología fragmentada: la procesa esta neurona.`,
    };
    const procId = procesaEnDe(cfg.porCapacidad?.[capacidad], asignaciones);
    if (!procId) return local;
    const p = procesadorDe(inv, procId);
    if (p) return {
        via: p.via,
        neuronaId: p.neuronaId,
        baseUrl: null,
        motivo: p.disponible
            ? `La «${capacidad}» se procesa en ${p.nombre} (${p.neuronaId}).`
            : `La «${capacidad}» va a ${p.nombre} (${p.neuronaId}), pero ahora no está disponible.`,
    };
    const neuronaId = procId.split(":")[0] || null;
    const n = neuronaDe(inv, neuronaId ?? undefined);
    return {
        via: n ? viaHacia(n, cfg) : cfg.vias[0] ?? "malla-local",
        neuronaId: neuronaId ?? procId,
        baseUrl: null,
        motivo: `La «${capacidad}» se asignó a ${procId}, que ahora no vemos en el inventario.`,
    };
}

/**
 * El destino de una capacidad dado el plan, las asignaciones, el inventario y la capacidad.
 * Determinista: los mismos datos dan el mismo destino (nada ordina por llegada). PURA.
 */
export function destinoDeIA(
    plan: PlanIA,
    asignaciones: Record<string, Asignacion>,
    inventario: InventarioRecursos,
    capacidad: Capacidad,
): DestinoIA {
    const cfg = configDe(plan);
    if (!cfg) return { via: null, neuronaId: null, baseUrl: null, motivo: "Sin topología no hay destino para la IA." };
    const estaId = inventario.estaNeuronaId;
    let d: DestinoIA;
    switch (cfg.topologia) {
        case "servidor-propio":
            d = servidorPropio(cfg, inventario, capacidad);
            break;
        case "fragmentada":
            d = fragmentada(cfg, asignaciones, inventario, capacidad);
            break;
        case "almacen-externo":
            d = {
                via: "local", neuronaId: estaId, baseUrl: null,
                motivo: `Los modelos viven en el almacén externo, pero los carga y procesa esta neurona (${estaId}).`,
            };
            break;
        case "comunal":
            d = {
                via: "internet", neuronaId: null, baseUrl: null,
                motivo: `Los servidores del grupo o la comunidad se eligen al usar la «${capacidad}»; por ahora, por Internet.`,
            };
            break;
        default:
            d = {
                via: "local", neuronaId: estaId, baseUrl: null,
                motivo: `Cada neurona con lo suyo: la «${capacidad}» la procesa esta neurona (${estaId}) en local.`,
            };
    }
    return sinAntena(d, capacidad);
}
