/**
 * Enrutado de IA · a qué servidor va cada capacidad según la topología (Ola 1023R · RIA1023C).
 *
 * PURO: nada de red, disco ni procesos (SOP `architecture/recursos-ia-neurona.md` §3). Recibe el
 * plan de recursos, las asignaciones guardadas y el inventario visto desde esta neurona y decide el
 * destino de UNA capacidad:
 * - `servidor-propio` → el servidor de IA de la neurona elegida, UNA API compatible con OpenAI en
 *   `http://<host>:4480/v1` (§6). El host sale del inventario/oferta de esa neurona
 *   (`NeuronaConHost`); si no llega, `baseUrl: null` con un motivo que se lee sin adivinar.
 * - `cada-neurona` → esta neurona, por `local`.
 * - `fragmentada` → la neurona asignada a esa capacidad (por capacidad del plan, luego las
 *   asignaciones guardadas, luego la sugerencia del plan; si nada la fija, esta neurona).
 * - `almacen-externo` → los pesos viven fuera y procesa la neurona donde se conecta: esta.
 * - `comunal` → los servidores del grupo o la comunidad (aún sin servidor concreto por capacidad).
 * Por la antena SOLO decisiones (§3): el chat y los pesos nunca van por ahí.
 */
import { claveElemento } from "./asignaciones";
import { PUERTO_SERVIDOR_IA } from "./oferta-desde-asignaciones";
import type {
    Asignacion,
    Capacidad,
    InventarioRecursos,
    NeuronaRecursos,
    PlanRecursos,
    Procesador,
    Via,
} from "./tipos";
import { VIA_REFERENCIA } from "./tipos";

/** A dónde van los pedidos de una capacidad. */
export interface DestinoIA {
    via: Via;
    /** La neurona que procesa (o `null` cuando la topología no fija ninguna). */
    neuronaId: string | null;
    /** Base de la API compatible con OpenAI (`http://<host>:4480/v1`) o `null` si no se conocen los datos. */
    baseUrl: string | null;
    /** Por qué este destino, para leer en la pantalla. */
    motivo: string;
}

/**
 * Host del servidor propio de IA de una neurona, publicado con su oferta/inventario (extra
 * opcional que la oferta puede traer sin romper el contrato de `tipos.ts`). Host desnudo, sin
 * puerto: el puerto lo pone el servidor propio de IA (4480, §6) — el token nunca viaja aquí.
 */
export interface NeuronaConHost {
    host?: string;
}

/* ───────────────────────────── piezas PURAS ───────────────────────────── */

/** Lo que la antena deja pasar: mensajes y decisiones, nunca chat. */
const POR_ANTENA = new Set<Capacidad>(["decision"]);

/** Host desnudo de una neurona: quita esquema, ruta y puerto; `null` si lo que llega no vale. */
export function hostDeNeurona(n: NeuronaRecursos): string | null {
    const crudo = ((n as Partial<NeuronaConHost>).host ?? "").trim();
    const limpio = crudo
        .replace(/^(https?:)?\/\//i, "")
        .split(/[/:]/)[0]
        .trim();
    return limpio && !/\s/.test(limpio) && limpio.length <= 120 ? limpio : null;
}

/** La base de la API del servidor propio de IA de una neurona (§6) a partir de su host. */
export function urlServidorIA(host: string): string {
    return `http://${host}:${PUERTO_SERVIDOR_IA}/v1`;
}

function neuronaDe(inv: InventarioRecursos, id?: string): NeuronaRecursos | null {
    if (!id) return null;
    return inv.neuronas.find((n) => n.id === id) ?? null;
}

function primeraVia(vias: Via[], cap: Capacidad): Via | null {
    const vale = vias.find((v) => v !== "antena" || POR_ANTENA.has(cap));
    return vale ?? null;
}

/**
 * La neurona asignada a una capacidad en topología `fragmentada`: lo fija `porCapacidad` del plan;
 * si no (o es "auto"), la asignación guardada del modelo sugerido; si tampoco, la sugerencia del
 * plan. Devuelve neurona y procesador.
 */
function fragmentoDe(
    inv: InventarioRecursos,
    asignaciones: Record<string, Asignacion>,
    plan: PlanRecursos,
    cap: Capacidad,
): { neuronaId: string | null; procesador: Procesador | null } {
    const procesadorPorId = (id: string): Procesador | null =>
        inv.neuronas.flatMap((n) => n.procesadores).find((p) => p.id === id) ??
        inv.procesadoresSueltos.find((p) => p.id === id) ??
        null;
    const sugerida = plan.sugerencias.find((s) => s.capacidad === cap);
    const fijoSegúnPlan = plan.topologia.porCapacidad?.[cap]?.procesaEn;
    for (const id of [fijoSegúnPlan, ...(sugerida ? [asignaciones[claveElemento("modelo", sugerida.modelo.id)]?.procesaEn] : [])]) {
        const p = id && id !== "auto" ? procesadorPorId(id) : null;
        if (p) return { neuronaId: p.neuronaId, procesador: p };
    }
    return sugerida ? { neuronaId: sugerida.procesador.neuronaId, procesador: sugerida.procesador } : { neuronaId: null, procesador: null };
}

/** Destino cuando nada remoto va (antena y chat, o neurona que no compone el mensaje). */
function quedateAqui(inv: InventarioRecursos, cap: Capacidad, porque: string): DestinoIA {
    return { via: "local", neuronaId: inv.estaNeuronaId, baseUrl: null, motivo: porque };
}

/* ───────────────────────────── destinoDeIA ───────────────────────────── */

/**
 * A qué servidor va una capacidad según la topología del plan. PURO y sin sorpresas: no lanza,
 * cualquier dato raro cae en «esta neurona» con su motivo legible.
 */
export function destinoDeIA(
    plan: PlanRecursos,
    asignaciones: Record<string, Asignacion>,
    inventario: InventarioRecursos,
    cap: Capacidad,
): DestinoIA {
    const t = plan.topologia;
    switch (t.topologia) {
        case "servidor-propio":
            return destinoServidorPropio(plan, inventario, cap);
        case "cada-neurona":
            return destinoCadaNeurona(inventario, cap);
        case "fragmentada":
            return destinoFragmentada(plan, asignaciones, inventario, cap);
        case "almacen-externo":
            return quedateAqui(
                inventario,
                cap,
                `Los pesos de «${cap}» viven en el almacén externo y los lee esta neurona: los pedidos van por local.`,
            );
        case "comunal": {
            const via = primeraVia(t.vias.length ? t.vias : ["local", "malla-local", "red-starseed"], cap) ?? "local";
            return {
                via,
                neuronaId: null,
                baseUrl: null,
                motivo: `En servidores del grupo o la comunidad todavía no hay uno concreto para «${cap}»: sin baseUrl hasta que la topología lo fije.`,
            };
        }
    }
}

function destinoCadaNeurona(inv: InventarioRecursos, cap: Capacidad): DestinoIA {
    return {
        via: "local",
        neuronaId: inv.estaNeuronaId,
        baseUrl: null,
        motivo: `Cada neurona con lo suyo: «${cap}» se procesa en esta neurona, sin servidor de por medio.`,
    };
}

/** `servidor-propio`: la neurona elegida (o esta) sirve toda la cuenta por el puerto 4480 (§6). */
function destinoServidorPropio(plan: PlanRecursos, inv: InventarioRecursos, cap: Capacidad): DestinoIA {
    const idElegida = plan.topologia.servidorNeuronaId ?? inv.estaNeuronaId;
    const servidora = neuronaDe(inv, idElegida);
    if (!servidora) {
        return quedateAqui(inv, cap, `La neurona «${idElegida}» no está en el inventario: «${cap}» queda en esta neurona hasta saber de ella.`);
    }
    const via = primeraVia(servidora.vias.length ? servidora.vias : ["local"], cap);
    if (!via) {
        return quedateAqui(inv, cap, `${servidora.nombre} solo se alcanza por antena y por la antena no va el chat ni los pesos (§3): «${cap}» queda en esta neurona.`);
    }
    if (via === "antena") {
        // Por radio no hay API HTTP (VIA_REFERENCIA.antena): por antena solo van decisiones, sin baseUrl.
        return {
            via,
            neuronaId: servidora.id,
            baseUrl: null,
            motivo: `Por antena solo decisiones (§3): «${cap}» va a ${servidora.nombre} por el reflejo, sin baseUrl.`,
        };
    }
    if (!servidora.online) {
        return {
            via,
            neuronaId: servidora.id,
            baseUrl: null,
            motivo: `${servidora.nombre} está apagada: hasta que vuelva, su servidor de IA (puerto ${PUERTO_SERVIDOR_IA}) no contesta.`,
        };
    }
    const host = hostDeNeurona(servidora);
    if (!host) {
        return {
            via,
            neuronaId: servidora.id,
            baseUrl: null,
            motivo: `El servidor propio de «${cap}» va a ${servidora.nombre} por ${VIA_REFERENCIA[via].nombre.toLowerCase()}, pero su inventario no trae el host: sin baseUrl hasta que la oferta lo publique.`,
        };
    }
    return {
        via,
        neuronaId: servidora.id,
        baseUrl: urlServidorIA(host),
        motivo: `«${cap}» va al servidor propio de IA de ${servidora.nombre} por ${VIA_REFERENCIA[via].nombre.toLowerCase()}.`,
    };
}

/** `fragmentada`: la neurona asignada a esa capacidad fija el destino. */
function destinoFragmentada(
    plan: PlanRecursos,
    asignaciones: Record<string, Asignacion>,
    inv: InventarioRecursos,
    cap: Capacidad,
): DestinoIA {
    const asignada = fragmentoDe(inv, asignaciones, plan, cap);
    if (!asignada.neuronaId) {
        return quedateAqui(inv, cap, `Nadie fija aún dónde procesa «${cap}» en la malla repartida: queda en esta neurona.`);
    }
    if (asignada.neuronaId === inv.estaNeuronaId) {
        return { via: "local", neuronaId: asignada.neuronaId, baseUrl: null, motivo: `«${cap}» está asignada a esta neurona en la malla repartida: por local.` };
    }
    const n = neuronaDe(inv, asignada.neuronaId);
    const proc = asignada.procesador;
    // La vía la sugiere el procesador asignado si es de esa neurona (con la antena fuera salvo
    // decisiones); si no, las vías conocidas de la neurona; un procesador suelto usa la propia.
    const viaPorProcesador =
        proc && proc.neuronaId === asignada.neuronaId && (proc.via !== "antena" || POR_ANTENA.has(cap)) ? proc.via : null;
    const via = viaPorProcesador ?? (n ? primeraVia(n.vias, cap) : (proc && (proc.via !== "antena" || POR_ANTENA.has(cap)) ? proc.via : null));
    if (!via) {
        return quedateAqui(inv, cap, `${asignada.neuronaId} solo se alcanza por antena y por la antena no va el chat ni los pesos (§3): «${cap}» queda en esta neurona.`);
    }
    return {
        via,
        neuronaId: asignada.neuronaId,
        baseUrl: null,
        motivo: `En la malla repartida, «${cap}» procesa en ${n?.nombre ?? asignada.neuronaId} por ${VIA_REFERENCIA[via].nombre.toLowerCase()}.`,
    };
}
