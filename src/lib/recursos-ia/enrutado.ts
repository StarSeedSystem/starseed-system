/**
 * A qué servidor de IA va cada capacidad según la topología (Ola 1023R · RIA1023C).
 * SOP `architecture/recursos-ia-neurona.md` §2-3, §6 (servidor propio de IA, puerto 4480).
 *
 * PURO: sin `node:*` ni `fetch`; lo importa código de cliente. Determinista: el mismo plan,
 * inventario y asignaciones dan el mismo destino (el desempate va por id).
 */
import { claveElemento } from "./asignaciones";
import { PUERTO_SERVIDOR_IA } from "./oferta-desde-asignaciones";
import {
    NOMBRE_CAPACIDAD,
    VIA_REFERENCIA,
    type Asignacion,
    type Capacidad,
    type ConfigTopologia,
    type InventarioRecursos,
    type Via,
} from "./tipos";

/** A dónde va una capacidad: la neurona que la sirve, la vía y el OpenAI-compatible si se conoce. */
export interface DestinoIA {
    via: Via;
    /** Identidad de la neurona (o servidor suelto, «servidor:<id>») que procesa la capacidad. */
    neuronaId: string | null;
    /** `http://<host>:4480/v1` del servidor propio de IA. null si no se conoce la dirección. */
    baseUrl: string | null;
    /** En palabras de la persona: por qué este destino. */
    motivo: string;
}

const texto = (x: string | undefined): x is string => typeof x === "string" && x.trim() !== "";

/** Neurona del inventario por id y, si no está, la marcada `esEsta`. */
function neuronaDe(inv: InventarioRecursos, id: string | undefined) {
    return inv.neuronas.find((n) => n.id === id) ?? inv.neuronas.find((n) => n.esEsta);
}

/** Id de neurona de un procesador: «a1:gpu» → «a1»; «servidor:x» y «a1» tal cual. */
function neuronaDeProcesador(procId: string): string {
    return procId.startsWith("servidor:") ? procId : texto(procId) ? procId.split(":")[0] : "";
}

/** La primera vía alcanzable (§3: la antena solo lleva decisiones; el resto va por la red). */
function viaAlcanzable(vias: readonly Via[], capacidad: Capacidad): Via {
    const lista = capacidad === "decision" ? vias : vias.filter((v) => v !== "antena");
    return lista[0] ?? "red-starseed";
}

/** Dirige el lazo si la servidora es esta neurona (§6: sin token solo escucha en 127.0.0.1). */
function esLaPropia(n: { id: string; esEsta?: boolean }, inv: InventarioRecursos): boolean {
    return n.esEsta === true || (texto(inv.estaNeuronaId) && n.id === inv.estaNeuronaId);
}

export function destinoDeIA(
    plan: ConfigTopologia,
    asignaciones: Record<string, Asignacion>,
    inventario: InventarioRecursos,
    capacidad: Capacidad,
): DestinoIA {
    switch (plan.topologia) {
        case "cada-neurona":
            return cadaNeurona(inventario, capacidad);
        case "servidor-propio":
            return servidorPropio(plan, inventario, capacidad);
        case "fragmentada":
            return fragmentada(plan, asignaciones, inventario, capacidad);
        case "almacen-externo":
            return almacenExterno(plan, inventario, capacidad);
        case "comunal":
            return comunal(inventario, capacidad);
    }
}

/* ───────────────────────────── topologías ───────────────────────────── */

function cadaNeurona(inv: InventarioRecursos, cap: Capacidad): DestinoIA {
    const n = neuronaDe(inv, texto(inv.estaNeuronaId) ? inv.estaNeuronaId : undefined);
    if (!n) {
        return { via: "local", neuronaId: null, baseUrl: null, motivo: "Cada neurona usa lo suyo, pero no hay inventario de esta neurona todavía; cuando se detecte, la IA corre aquí mismo." };
    }
    return { via: "local", neuronaId: n.id, baseUrl: null, motivo: `Cada neurona usa lo suyo: «${NOMBRE_CAPACIDAD[cap]}» corre en la propia ${n.nombre || n.id}.` };
}

function servidorPropio(plan: ConfigTopologia, inv: InventarioRecursos, cap: Capacidad): DestinoIA {
    if (!texto(plan.servidorNeuronaId)) {
        return { via: "local", neuronaId: null, baseUrl: null, motivo: "Elige qué neurona de la cuenta servirá la IA (la topología no la nombra todavía)." };
    }
    const servId = plan.servidorNeuronaId ?? "";
    const n = inv.neuronas.find((x) => x.id === servId);
    if (!n) {
        return {
            via: viaAlcanzable(plan.vias.filter((v) => v !== "local"), cap),
            neuronaId: servId,
            baseUrl: null,
            motivo: `La neurona «${servId}» no aparece en el inventario (apagada o sin datos): se la servirá en cuanto vuelva, pero hoy no hay dirección a la que escribir.`,
        };
    }
    if (esLaPropia(n, inv)) {
        return {
            via: "local",
            neuronaId: n.id,
            baseUrl: `http://127.0.0.1:${PUERTO_SERVIDOR_IA}/v1`,
            motivo: `El servidor propio de IA corre en esta neurona mismo (127.0.0.1, puerto ${PUERTO_SERVIDOR_IA}).`,
        };
    }
    const via = viaAlcanzable(n.vias, cap);
    const soloAntena = cap !== "decision" && n.vias.length > 0 && n.vias.every((v) => v === "antena");
    return {
        via,
        neuronaId: n.id,
        baseUrl: null,
        motivo: soloAntena
            ? `${n.nombre || n.id} solo llega por antena y esta no transporta pesos ni chat: se va por la red de StarSeed y puede tardar.`
            : `${n.nombre || n.id} sirve toda la IA por ${VIA_REFERENCIA[via].nombre.toLowerCase()}; su dirección en la malla llega cuando publique su servidor de IA.`,
    };
}

function fragmentada(plan: ConfigTopologia, asignaciones: Record<string, Asignacion>, inv: InventarioRecursos, cap: Capacidad): DestinoIA {
    const destino = plan.porCapacidad?.[cap];
    // Si la persona asignó a mano el modelo de esta capacidad, manda su asignación sobre el plan.
    const modeloId = texto(destino?.modeloId) ? destino?.modeloId : undefined;
    const deLaPersona = modeloId ? asignaciones[claveElemento("modelo", modeloId)]?.procesaEn : undefined;
    const procId = texto(deLaPersona) && deLaPersona !== "auto" ? deLaPersona : destino?.procesaEn ?? "";
    if (!texto(procId)) {
        const n = neuronaDe(inv, texto(inv.estaNeuronaId) ? inv.estaNeuronaId : undefined);
        return {
            via: "local",
            neuronaId: n?.id ?? null,
            baseUrl: null,
            motivo: `Fragmentada pero nadie se asignó todavía a «${NOMBRE_CAPACIDAD[cap]}»: se queda en esta neurona hasta repartirla.`,
        };
    }
    const neuronaId = neuronaDeProcesador(procId);
    const n = inv.neuronas.find((x) => x.id === neuronaId);
    if (!n) {
        return {
            via: viaAlcanzable(plan.vias, cap),
            neuronaId,
            baseUrl: null,
            motivo: `«${NOMBRE_CAPACIDAD[cap]}» procesa en ${neuronaId} (no está en el inventario), por la vía que pide la topología.`,
        };
    }
    const via = esLaPropia(n, inv) ? "local" : viaAlcanzable(n.vias, cap);
    return {
        via,
        neuronaId: n.id,
        baseUrl: null,
        motivo: `«${NOMBRE_CAPACIDAD[cap]}» procesa en ${n.nombre || n.id} por ${VIA_REFERENCIA[via].nombre.toLowerCase()}; el puerto exacto lo da la ficha del modelo.`,
    };
}

function almacenExterno(plan: ConfigTopologia, inv: InventarioRecursos, cap: Capacidad): DestinoIA {
    const almacen = [...inv.almacenesSueltos, ...inv.neuronas.flatMap((n) => n.almacenes)].find(
        (a) => texto(plan.almacenExternoId) && a.id === plan.almacenExternoId,
    );
    const duena = neuronaDe(inv, almacen?.neuronaId);
    const n = duena ?? neuronaDe(inv, texto(inv.estaNeuronaId) ? inv.estaNeuronaId : undefined);
    if (!n || !almacen) {
        return {
            via: "local",
            neuronaId: n?.id ?? null,
            baseUrl: null,
            motivo: "Los modelos viven en un almacén externo que hoy no llega: revisa la topología o vuelve a detectar los medios.",
        };
    }
    const via = esLaPropia(n, inv) ? "local" : viaAlcanzable(n.vias, cap);
    return {
        via,
        neuronaId: n.id,
        baseUrl: null,
        motivo: `Los modelos viven en «${almacen.etiqueta}»: los procesa ${n.nombre || n.id} por ${VIA_REFERENCIA[via].nombre.toLowerCase()}.`,
    };
}

function comunal(inv: InventarioRecursos, cap: Capacidad): DestinoIA {
    const servidores = inv.procesadoresSueltos
        .filter((p) => p.disponible && p.via !== "antena")
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const serv = servidores[0];
    if (!serv) {
        const n = neuronaDe(inv, texto(inv.estaNeuronaId) ? inv.estaNeuronaId : undefined);
        return {
            via: "local",
            neuronaId: n?.id ?? null,
            baseUrl: null,
            motivo: "No hay servidores comuales disponibles ahora mismo: la «IA» sigue en esta neurona.",
        };
    }
    return {
        via: serv.via,
        neuronaId: serv.neuronaId,
        baseUrl: null,
        motivo: `${serv.nombre} (comunal, ${VIA_REFERENCIA[serv.via].nombre.toLowerCase()}) lleva «${NOMBRE_CAPACIDAD[cap]}» y otras capacidades de la cuenta.`,
    };
}
