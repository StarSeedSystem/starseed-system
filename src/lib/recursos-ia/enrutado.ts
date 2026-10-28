/**
 * Destino de cada capacidad de IA según la topología (SOP `architecture/recursos-ia-neurona.md`
 * §2-3). PURO: sin `node:*` ni `fetch`; solo ordena los datos del plan y del inventario.
 */
import {
    NOMBRE_CAPACIDAD,
    type Asignacion,
    type Capacidad,
    type ConfigTopologia,
    type EstadoRecursosIa,
    type InventarioRecursos,
    type NeuronaRecursos,
    type PlanRecursos,
    type Procesador,
    type Via,
} from "./tipos";

export const PUERTO_SERVIDOR_IA = 4480;

export interface DestinoIA {
    via: Via;
    neuronaId: string;
    baseUrl: string | null;
    motivo: string;
}

type PlanEntrada = PlanRecursos | ConfigTopologia;
type AsignacionesEntrada = EstadoRecursosIa | Record<string, Asignacion> | undefined;

function esPlan(x: PlanEntrada): x is PlanRecursos {
    return Array.isArray((x as PlanRecursos).sugerencias);
}

function configDe(plan: PlanEntrada): ConfigTopologia {
    return esPlan(plan) ? plan.topologia : plan;
}

function valores(asignaciones: AsignacionesEntrada): Asignacion[] {
    if (!asignaciones || typeof asignaciones !== "object") return [];
    const dentro = (asignaciones as EstadoRecursosIa).asignaciones;
    const mapa = dentro && typeof dentro === "object" ? dentro : (asignaciones as Record<string, Asignacion>);
    return Object.values(mapa).filter((a): a is Asignacion => !!a && typeof a === "object" && !!a.elemento);
}

function neurona(inv: InventarioRecursos, id?: string): NeuronaRecursos | undefined {
    return id ? inv.neuronas.find((n) => n.id === id) : undefined;
}

function neuronaEsta(inv: InventarioRecursos): string {
    return neurona(inv, inv.estaNeuronaId)?.id ?? inv.neuronas.find((n) => n.esEsta)?.id ?? inv.estaNeuronaId;
}

function procesadorDe(inv: InventarioRecursos, id?: string): Procesador | undefined {
    if (!id) return undefined;
    return [...inv.neuronas.flatMap((n) => n.procesadores), ...inv.procesadoresSueltos].find((p) => p.id === id);
}

function neuronaDelDestino(inv: InventarioRecursos, id?: string): string {
    if (id && neurona(inv, id)) return id;
    return procesadorDe(inv, id)?.neuronaId ?? neuronaEsta(inv);
}

function sugerencia(plan: PlanEntrada, capacidad: Capacidad) {
    return esPlan(plan) ? plan.sugerencias.find((s) => s.capacidad === capacidad) : undefined;
}

function procesaAsignado(plan: PlanEntrada, vals: Asignacion[], capacidad: Capacidad): string | undefined {
    const config = configDe(plan);
    const porCapacidad = config.porCapacidad?.[capacidad]?.procesaEn;
    if (porCapacidad && porCapacidad !== "auto") return porCapacidad;
    const modeloId = config.porCapacidad?.[capacidad]?.modeloId ?? sugerencia(plan, capacidad)?.modelo.id;
    const a = vals.find((x) => x.elemento.tipo === "modelo" && x.elemento.id === modeloId);
    return a?.procesaEn && a.procesaEn !== "auto" ? a.procesaEn : undefined;
}

const esChat = (capacidad: Capacidad): boolean => capacidad !== "decision";

function elegirVia(preferidas: Via[], disponibles: Via[], capacidad: Capacidad): Via | null {
    const hay = new Set(disponibles.length ? disponibles : preferidas);
    for (const via of [...preferidas, ...disponibles]) {
        if (via === "antena" && esChat(capacidad)) continue;
        if (hay.has(via)) return via;
    }
    return null;
}

function hostDeValor(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    let s = valor.trim();
    if (!s) return null;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
        try {
            const u = new URL(s);
            const h = u.hostname.replace(/^\[|\]$/g, "");
            return h && !/^(0\.0\.0\.0|::|unknown)$/i.test(h) ? h : null;
        } catch {
            return null;
        }
    }
    s = s.split(/[/?#]/)[0].replace(/^[^@]*@/, "");
    if (s.startsWith("[")) {
        const fin = s.indexOf("]");
        return fin > 1 ? s.slice(1, fin) : null;
    }
    if ((s.match(/:/g) ?? []).length > 1) return s; // IPv6 sin corchetes
    const dos = s.indexOf(":");
    if (dos >= 0) s = s.slice(0, dos);
    return s && !/\s/.test(s) && !/^(0\.0\.0\.0|::|unknown)$/i.test(s) ? s : null;
}

function hostDeNeurona(n?: NeuronaRecursos): string | null {
    if (!n) return null;
    const r = n as NeuronaRecursos & { host?: unknown; hostname?: unknown; baseUrl?: unknown; url?: unknown; endpoint?: unknown };
    for (const v of [r.host, r.hostname, r.baseUrl, r.url, r.endpoint]) {
        const host = hostDeValor(v);
        if (host) return host;
    }
    return null;
}

function urlServidor(host: string): string {
    const h = host.includes(":") ? `[${host}]` : host;
    return `http://${h}:${PUERTO_SERVIDOR_IA}/v1`;
}

export function destinoDeIA(
    plan: PlanEntrada,
    asignaciones: AsignacionesEntrada,
    inventario: InventarioRecursos,
    capacidad: Capacidad,
): DestinoIA {
    const top = configDe(plan);
    const vals = valores(asignaciones);
    const nombre = NOMBRE_CAPACIDAD[capacidad];

    if (top.topologia === "cada-neurona") {
        return { via: "local", neuronaId: neuronaEsta(inventario), baseUrl: null, motivo: `«${nombre}» se ejecuta en esta neurona con sus motores locales.` };
    }

    if (top.topologia === "servidor-propio") {
        const id = top.servidorNeuronaId;
        if (!id) return { via: "local", neuronaId: neuronaEsta(inventario), baseUrl: null, motivo: "No hay neurona servidora elegida para «servidor propio»." };
        const n = neurona(inventario, id);
        if (!n) return { via: "local", neuronaId: neuronaEsta(inventario), baseUrl: null, motivo: `La neurona servidora ${id} no está en el inventario: no se conoce su host.` };
        if (id === neuronaEsta(inventario)) {
            const host = hostDeNeurona(n);
            return { via: "local", neuronaId: id, baseUrl: host ? urlServidor(host) : null, motivo: host ? `Esta neurona es el servidor propio de IA: ${urlServidor(host)}.` : "Esta neurona es el servidor propio de IA, pero no se conoce su host." };
        }
        const vias = top.vias.length ? top.vias : n.vias;
        const via = elegirVia(vias, n.vias, capacidad);
        if (!via) return { via: "local", neuronaId: neuronaEsta(inventario), baseUrl: null, motivo: `«${n.nombre}» solo se alcanza por antena, que no transporta ${capacidad === "decision" ? "la decisión" : "chat"}: el destino se queda en esta neurona.` };
        if (!n.online) return { via, neuronaId: id, baseUrl: null, motivo: `El servidor propio «${n.nombre}» está apagado: no se puede usar ahora.` };
        const host = hostDeNeurona(n);
        if (!host) return { via, neuronaId: id, baseUrl: null, motivo: `El servidor propio es «${n.nombre}» por ${via}, pero su host no está en el inventario: falta http://<host>:${PUERTO_SERVIDOR_IA}/v1.` };
        return { via, neuronaId: id, baseUrl: urlServidor(host), motivo: `El servidor propio de IA es «${n.nombre}» por ${via}: ${urlServidor(host)}.` };
    }

    if (top.topologia === "fragmentada") {
        const asignado = procesaAsignado(plan, vals, capacidad) ?? sugerencia(plan, capacidad)?.procesador.id;
        const id = neuronaDelDestino(inventario, asignado);
        if (id === neuronaEsta(inventario)) return { via: "local", neuronaId: id, baseUrl: null, motivo: `«${nombre}» se queda en esta neurona; no hay otra asignada.` };
        const n = neurona(inventario, id);
        const via = elegirVia(top.vias, n?.vias ?? [], capacidad);
        if (!via) return { via: "local", neuronaId: neuronaEsta(inventario), baseUrl: null, motivo: `La neurona asignada a «${nombre}» solo se alcanza por antena; se queda en esta neurona.` };
        return { via, neuronaId: id, baseUrl: null, motivo: `«${nombre}» va a «${n?.nombre ?? id}»${asignado ? ` (${asignado})` : ""} por ${via}.` };
    }

    if (top.topologia === "almacen-externo") {
        const almacen = [...inventario.neuronas.flatMap((n) => n.almacenes), ...inventario.almacenesSueltos].find((a) => a.id === top.almacenExternoId);
        const id = almacen?.neuronaId ?? neuronaEsta(inventario);
        if (id === neuronaEsta(inventario)) return { via: "local", neuronaId: id, baseUrl: null, motivo: `Los pesos están en «${almacen?.etiqueta ?? top.almacenExternoId ?? "el almacén externo"}» y se procesan en esta neurona.` };
        const n = neurona(inventario, id);
        const via = elegirVia(top.vias, n?.vias ?? [], capacidad);
        if (!via) return { via: "local", neuronaId: neuronaEsta(inventario), baseUrl: null, motivo: `El almacén externo solo se alcanza por antena; «${nombre}» se queda en esta neurona.` };
        return { via, neuronaId: id, baseUrl: null, motivo: `«${nombre}» se procesa donde se conecta «${almacen?.etiqueta ?? top.almacenExternoId}»: «${n?.nombre ?? id}» por ${via}.` };
    }

    const asignado = procesaAsignado(plan, vals, capacidad) ?? sugerencia(plan, capacidad)?.procesador.id;
    const candidatos = inventario.procesadoresSueltos.filter((p) => p.disponible && (!esChat(capacidad) || p.via !== "antena"));
    const p = candidatos.find((x) => x.id === asignado) ?? candidatos[0];
    if (!p) return { via: "local", neuronaId: neuronaEsta(inventario), baseUrl: null, motivo: `No hay servidores comunales disponibles para «${nombre}»: se queda en esta neurona.` };
    return { via: p.via, neuronaId: p.neuronaId, baseUrl: null, motivo: `«${nombre}» va al servidor comunal «${p.nombre}» por ${p.via}.` };
}
