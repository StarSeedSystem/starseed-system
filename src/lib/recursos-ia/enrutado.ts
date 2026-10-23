/**
 * A qué servidor de IA va cada capacidad según la topología (SOP §2-3 y §6). PURO: sin `node:*`
 * ni `fetch`. Reutiliza el contrato de `tipos.ts` y no adivina hosts: si el inventario (o su
 * oferta) no trae el de una neurona, devuelve `baseUrl: null` con un motivo legible.
 */
import type {
    Asignacion,
    Capacidad,
    ConfigTopologia,
    InventarioRecursos,
    MedioAlmacen,
    NeuronaRecursos,
    PlanRecursos,
    Procesador,
    Via,
} from "./tipos";

/** Destino de una capacidad: la vía, quién procesa y, si se conoce, la URL OpenAI-compatible. */
export interface DestinoIA {
    via: Via;
    neuronaId: string;
    baseUrl: string | null;
    motivo: string;
}

/** El servidor propio de IA escucha en este puerto (§6). */
export const PUERTO_SERVIDOR_IA = 4480;

/** La ficha de una neurona puede traer su host; el contrato aún no lo fija y no se inventa. */
type NeuronaConHost = NeuronaRecursos & { host?: unknown };
type InventarioConOfertas = InventarioRecursos & { ofertas?: unknown };

const texto = (x: unknown): string | undefined =>
    typeof x === "string" && x.trim() !== "" ? x.trim() : undefined;

/** Host limpio a partir de un nombre, una IP o una URL: sin esquema, puerto ni ruta. */
function hostLimpio(x: unknown): string | null {
    const t = texto(x);
    if (!t) return null;
    if (t.includes("://")) {
        try {
            return new URL(t).hostname || null;
        } catch {
            return null;
        }
    }
    const sinRuta = t.replace(/^\[/, "").replace(/\]$/, "").split("/")[0];
    const host = sinRuta.split(":")[0];
    return host && !/\s/.test(host) ? host : null;
}

/** Host de una neurona: su ficha, su oferta en el inventario o (si es esta) el bucle local. */
function hostDeNeurona(inv: InventarioRecursos, n: NeuronaRecursos): string | null {
    const directo = hostLimpio((n as NeuronaConHost).host);
    if (directo) return directo;
    const ofertas = (inv as InventarioConOfertas).ofertas;
    if (Array.isArray(ofertas)) {
        for (const o of ofertas) {
            if (!o || typeof o !== "object") continue;
            const fila = o as Record<string, unknown>;
            if (fila.nodoId !== n.id) continue;
            const h = hostLimpio(fila.host ?? fila.hostname ?? fila.ip);
            if (h) return h;
        }
    }
    if (n.esEsta || n.id === inv.estaNeuronaId) return "127.0.0.1";
    return null;
}

/** URL del servidor de IA de una neurona, si su host se conoce. */
function urlServidor(host: string | null): string | null {
    return host ? `http://${host}:${PUERTO_SERVIDOR_IA}/v1` : null;
}

function neuronaDe(inv: InventarioRecursos, id?: string): NeuronaRecursos | undefined {
    return id ? inv.neuronas.find((n) => n.id === id) : undefined;
}

function neuronaLocal(inv: InventarioRecursos): NeuronaRecursos | undefined {
    return neuronaDe(inv, inv.estaNeuronaId) ?? inv.neuronas.find((n) => n.esEsta) ?? inv.neuronas[0];
}

function todosLosProcesadores(inv: InventarioRecursos): Procesador[] {
    return [
        ...inv.neuronas.flatMap((n) => (n.online ? n.procesadores : n.procesadores.map((p) => ({ ...p, disponible: false })))),
        ...inv.procesadoresSueltos,
    ];
}

function todosLosAlmacenes(inv: InventarioRecursos): MedioAlmacen[] {
    return [...inv.neuronas.flatMap((n) => n.almacenes), ...inv.almacenesSueltos];
}

const util = (x: unknown): x is string => typeof x === "string" && x !== "" && x !== "auto";

/** La antena no lleva pesos ni chat: solo mensajes y decisiones (§3). */
function puedeIrPor(capacidad: Capacidad, via: Via): boolean {
    return capacidad === "decision" || via !== "antena";
}

/**
 * Vía efectiva hasta una neurona: la primera de la topología que ella misma declara alcanzable,
 * sin `local` para una remota y sin antena salvo en decisiones.
 */
function elegirVia(inv: InventarioRecursos, n: NeuronaRecursos, topologia: ConfigTopologia, capacidad: Capacidad): Via {
    if (n.esEsta || n.id === inv.estaNeuronaId) return "local";
    const preferidas = topologia.vias.length ? topologia.vias : n.vias;
    const candidatas = preferidas.filter((v) => v !== "local" && puedeIrPor(capacidad, v));
    const declarada = candidatas.find((v) => n.vias.includes(v));
    if (declarada) return declarada;
    if (candidatas.length) return candidatas[0];
    const suya = n.vias.find((v) => puedeIrPor(capacidad, v));
    return suya ?? "internet";
}

/** Procesador de una capacidad: lo fino de la topología, lo asignado al modelo o la sugerencia. */
function procesadorDeCapacidad(
    plan: PlanRecursos,
    asignaciones: Record<string, Asignacion>,
    inv: InventarioRecursos,
    capacidad: Capacidad,
): Procesador | undefined {
    const todos = todosLosProcesadores(inv);
    const porId = (id?: string) => (util(id) ? todos.find((p) => p.id === id) : undefined);
    const fino = plan.topologia.porCapacidad?.[capacidad];
    const elegido = porId(fino?.procesaEn);
    if (elegido) return elegido;

    const sugerencia = plan.sugerencias.find((s) => s.capacidad === capacidad);
    const candidatas: Asignacion[] = [];
    if (sugerencia) {
        const propia = asignaciones[`modelo:${sugerencia.modelo.id}`];
        if (propia) candidatas.push(propia);
        for (const a of Object.values(asignaciones)) {
            if (a.elemento?.tipo === "modelo" && a.elemento.id === sugerencia.modelo.id) candidatas.push(a);
        }
    }
    const deLaCapacidad = asignaciones[`modelo:${capacidad}`];
    if (deLaCapacidad) candidatas.push(deLaCapacidad);

    for (const a of candidatas) {
        const p = porId(a.procesaEn);
        if (p) return p;
    }
    return sugerencia?.procesador;
}

/**
 * A qué servidor de IA va una capacidad. El host sale del inventario o de la oferta de la neurona;
 * si no consta, `baseUrl` es `null` y el motivo lo dice. Con `cada-neurona` se procesa en local;
 * con `fragmentada`, en la neurona asignada a esa capacidad. La antena nunca sirve para chat.
 */
export function destinoDeIA(
    plan: PlanRecursos,
    asignaciones: Record<string, Asignacion>,
    inventario: InventarioRecursos,
    capacidad: Capacidad,
): DestinoIA {
    const topologia = plan.topologia;
    const local = neuronaLocal(inventario);

    switch (topologia.topologia) {
        case "cada-neurona": {
            const n = local;
            return {
                via: "local",
                neuronaId: n?.id ?? inventario.estaNeuronaId,
                baseUrl: null,
                motivo: `Cada neurona usa lo suyo: «${capacidad}» se procesa en «${n?.nombre ?? inventario.estaNeuronaId}» sin pasar por el servidor propio.`,
            };
        }

        case "servidor-propio": {
            const n = neuronaDe(inventario, topologia.servidorNeuronaId) ?? local;
            if (!n) {
                return {
                    via: "local",
                    neuronaId: topologia.servidorNeuronaId ?? inventario.estaNeuronaId,
                    baseUrl: null,
                    motivo: `El servidor propio de «${capacidad}» no tiene neurona en el inventario.`,
                };
            }
            const via = elegirVia(inventario, n, topologia, capacidad);
            const host = hostDeNeurona(inventario, n);
            const baseUrl = urlServidor(host);
            return {
                via,
                neuronaId: n.id,
                baseUrl,
                motivo: baseUrl
                    ? `Servidor propio: «${capacidad}» va al servidor de «${n.nombre}» en ${host}:${PUERTO_SERVIDOR_IA}.`
                    : `Servidor propio: «${capacidad}» va a «${n.nombre}», pero su host no consta en el inventario ni en su oferta; todavía no hay URL.`,
            };
        }

        case "fragmentada": {
            const p = procesadorDeCapacidad(plan, asignaciones, inventario, capacidad);
            const n = (p ? neuronaDe(inventario, p.neuronaId) : undefined) ?? local;
            if (!n) {
                return {
                    via: "local",
                    neuronaId: inventario.estaNeuronaId,
                    baseUrl: null,
                    motivo: `No hay neurona asignada a «${capacidad}» en el inventario.`,
                };
            }
            return {
                via: elegirVia(inventario, n, topologia, capacidad),
                neuronaId: n.id,
                baseUrl: null,
                motivo: p
                    ? `Repartida: «${capacidad}» se procesa en «${n.nombre}» con «${p.nombre}».`
                    : `Repartida: no hay procesador fijado para «${capacidad}»; se queda en «${n.nombre}».`,
            };
        }

        case "almacen-externo": {
            const externo = todosLosAlmacenes(inventario).find((a) => a.id === topologia.almacenExternoId);
            const p = procesadorDeCapacidad(plan, asignaciones, inventario, capacidad);
            const n =
                (externo?.neuronaId ? neuronaDe(inventario, externo.neuronaId) : undefined) ??
                (p ? neuronaDe(inventario, p.neuronaId) : undefined) ??
                local;
            if (!n) {
                return {
                    via: "local",
                    neuronaId: inventario.estaNeuronaId,
                    baseUrl: null,
                    motivo: `El almacén externo de «${capacidad}» no tiene neurona donde conectarse.`,
                };
            }
            return {
                via: elegirVia(inventario, n, topologia, capacidad),
                neuronaId: n.id,
                baseUrl: null,
                motivo: externo
                    ? `Almacén externo «${externo.etiqueta}»: «${capacidad}» se procesa en «${n.nombre}», donde se conecta.`
                    : `No consta el almacén externo «${topologia.almacenExternoId ?? "sin id"}»; «${capacidad}» se procesa en «${n.nombre}».`,
            };
        }

        case "comunal": {
            const p =
                inventario.procesadoresSueltos.find((x) => x.disponible && puedeIrPor(capacidad, x.via)) ??
                inventario.procesadoresSueltos.find((x) => puedeIrPor(capacidad, x.via));
            const n = p ? neuronaDe(inventario, p.neuronaId) : undefined;
            if (p) {
                const via = n ? elegirVia(inventario, n, topologia, capacidad) : p.via;
                return {
                    via,
                    neuronaId: p.neuronaId,
                    baseUrl: null,
                    motivo: `Comunal: «${capacidad}» se procesa en un servidor compartido («${p.nombre}»).`,
                };
            }
            return {
                via: "local",
                neuronaId: local?.id ?? inventario.estaNeuronaId,
                baseUrl: null,
                motivo: `Comunal: no hay servidores compartidos para «${capacidad}»; se usa «${local?.nombre ?? "esta neurona"}».`,
            };
        }
    }
}
