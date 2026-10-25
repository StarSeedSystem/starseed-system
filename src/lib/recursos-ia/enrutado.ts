/**
 * Enrutado de cada capacidad de IA según la topología (SOP `architecture/recursos-ia-neurona.md`).
 * PURO: sin `node:*`, sin `fetch`, sin reloj. En `servidor-propio` devuelve `http://<host>:4480/v1`;
 * si el host no está en el inventario/oferta, `baseUrl: null` (nunca se inventa una URL).
 */
import { claveAlcance } from "./asignaciones";
import type { Capacidad, EstadoRecursosIa, InventarioRecursos, NeuronaRecursos, PlanRecursos, Procesador, Via } from "./tipos";
import { NOMBRE_CAPACIDAD, VIA_REFERENCIA } from "./tipos";
export interface DestinoIA { via: Via; neuronaId: string; baseUrl: string | null; motivo: string }
const PUERTO_IA = 4480;
const HOST_VALIDO = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un host vale si es nombre/IP; al `id` se le exige punto o localhost para no confundir ids. */
function hostDe(valor: unknown, exigirPunto = false): string | null {
    if (typeof valor !== "string" || !valor.trim()) return null;
    let host: string;
    try {
        host = new URL(valor.includes("://") ? valor.trim() : `http://${valor.trim()}`).hostname;
    } catch {
        return null;
    }
    if (!host || UUID.test(host) || !HOST_VALIDO.test(host)) return null;
    return exigirPunto && !host.includes(".") && host !== "localhost" ? null : host;
}
function hostDeNeurona(inv: InventarioRecursos, n: NeuronaRecursos): string | null {
    const propio = (n as NeuronaRecursos & { host?: unknown }).host;
    const deInventario = n.id === inv.estaNeuronaId ? (inv as InventarioRecursos & { host?: unknown }).host : undefined;
    for (const valor of [propio, deInventario, n.id]) {
        const host = hostDe(valor, valor === n.id);
        if (host) return host;
    }
    return null;
}
const neuronaDe = (inv: InventarioRecursos, id?: string) => (id ? inv.neuronas.find((n) => n.id === id) : undefined);
const esEsta = (inv: InventarioRecursos, n?: NeuronaRecursos) => !!n && (n.esEsta || n.id === inv.estaNeuronaId);
const neuronaDeProcesaEn = (inv: InventarioRecursos, id?: string) => neuronaDe(inv, id) ?? neuronaDe(inv, procesadorDe(inv, id)?.neuronaId);
const procesadorDe = (inv: InventarioRecursos, id?: string): Procesador | undefined =>
    id ? inv.neuronas.flatMap((n) => n.procesadores).find((p) => p.id === id) ?? inv.procesadoresSueltos.find((p) => p.id === id) : undefined;
/** La vía real hacia una neurona/procesador; la antena solo se acepta para decisiones (§3). */
function viaDe(inv: InventarioRecursos, n: NeuronaRecursos | undefined, capacidad: Capacidad, p?: Procesador): Via | null {
    if (esEsta(inv, n)) return "local";
    const vias: Via[] = [];
    for (const v of n?.vias ?? []) if (!vias.includes(v)) vias.push(v);
    for (const x of n?.procesadores ?? []) if (!vias.includes(x.via)) vias.push(x.via);
    if (p && !vias.includes(p.via)) vias.push(p.via);
    return vias.find((v) => v !== "antena" || capacidad === "decision") ?? null;
}
const motivoDe = (via: Via, destino: string, capacidad: Capacidad) =>
    `${NOMBRE_CAPACIDAD[capacidad]} se atiende en ${destino} por ${VIA_REFERENCIA[via].nombre.toLowerCase()}.`;
const localDe = (inv: InventarioRecursos, motivo: string): DestinoIA => ({ via: "local", neuronaId: inv.estaNeuronaId, baseUrl: null, motivo });
const antenaNoLlevaChat = (n: NeuronaRecursos) => `«${n.nombre}» solo se alcanza por antena, que no lleva chat; se usa esta neurona.`;
/** A qué neurona y por qué vía va una capacidad; en `servidor-propio`, la URL de su servidor. PURA. */
export function destinoDeIA(
    plan: PlanRecursos,
    asignaciones: EstadoRecursosIa,
    inventario: InventarioRecursos,
    capacidad: Capacidad,
): DestinoIA {
    const top = plan.topologia;
    const guardada = asignaciones.topologias?.[claveAlcance(top.alcance)];
    switch (top.topologia) {
        case "servidor-propio": {
            const n = neuronaDe(inventario, top.servidorNeuronaId);
            if (!n) return localDe(inventario, "No hay una neurona servidor designada en el inventario: falta publicarla para dar la URL.");
            const via = viaDe(inventario, n, capacidad);
            if (!via) return localDe(inventario, antenaNoLlevaChat(n));
            const host = hostDeNeurona(inventario, n);
            return {
                via,
                neuronaId: n.id,
                baseUrl: host ? `http://${host}:${PUERTO_IA}/v1` : null,
                motivo: host
                    ? motivoDe(via, `el servidor propio de «${n.nombre}»`, capacidad)
                    : `Se elige «${n.nombre}», pero su host no está en el inventario: falta publicarlo para dar la URL.`,
            };
        }
        case "fragmentada": {
            const porCap = top.porCapacidad?.[capacidad] ?? guardada?.porCapacidad?.[capacidad];
            const n = neuronaDeProcesaEn(inventario, porCap?.procesaEn);
            if (n) {
                const via = viaDe(inventario, n, capacidad);
                if (!via) return localDe(inventario, antenaNoLlevaChat(n));
                return { via, neuronaId: n.id, baseUrl: null, motivo: motivoDe(via, `«${n.nombre}»`, capacidad) };
            }
            const p = porCap?.procesaEn ? procesadorDe(inventario, porCap.procesaEn) : undefined;
            const viaP = p ? viaDe(inventario, undefined, capacidad, p) : null;
            if (p && viaP) return { via: viaP, neuronaId: p.neuronaId, baseUrl: null, motivo: motivoDe(viaP, `«${p.nombre}»`, capacidad) };
            const sug = plan.sugerencias.find((s) => s.capacidad === capacidad);
            const ns = sug ? neuronaDe(inventario, sug.procesador.neuronaId) : undefined;
            if (ns) {
                const via = viaDe(inventario, ns, capacidad, sug?.procesador) ?? "local";
                return { via, neuronaId: ns.id, baseUrl: null, motivo: motivoDe(via, `«${ns.nombre}»`, capacidad) };
            }
            return localDe(inventario, `Ninguna neurona tiene asignada ${NOMBRE_CAPACIDAD[capacidad].toLowerCase()}: se usa esta neurona.`);
        }
        case "comunal": {
            const sug = plan.sugerencias.find((s) => s.capacidad === capacidad);
            const p = sug?.procesador ?? inventario.procesadoresSueltos.find((x) => x.disponible && (capacidad === "decision" || x.via !== "antena"));
            if (!p) return localDe(inventario, "No hay servidores del grupo o la comunidad disponibles: se usa esta neurona.");
            const via = viaDe(inventario, undefined, capacidad, p);
            if (!via) return localDe(inventario, "El servidor comunal solo se alcanza por antena, que no lleva chat: se usa esta neurona.");
            return { via, neuronaId: p.neuronaId, baseUrl: null, motivo: motivoDe(via, `«${p.nombre}»`, capacidad) };
        }
        case "almacen-externo": {
            const a = [...inventario.neuronas.flatMap((x) => x.almacenes), ...inventario.almacenesSueltos].find((x) => x.id === top.almacenExternoId);
            const n = neuronaDe(inventario, a?.neuronaId) ?? neuronaDe(inventario, inventario.estaNeuronaId);
            const via = n ? viaDe(inventario, n, capacidad) : null;
            if (!n || !via) return localDe(inventario, "El almacén externo no da una neurona alcanzable: se usa esta neurona.");
            return { via, neuronaId: n.id, baseUrl: null, motivo: motivoDe(via, `«${n.nombre}» con «${a?.etiqueta ?? "un almacén externo"}»`, capacidad) };
        }
        default:
            return localDe(inventario, `Cada neurona usa su propia IA local para ${NOMBRE_CAPACIDAD[capacidad].toLowerCase()}.`);
    }
}
