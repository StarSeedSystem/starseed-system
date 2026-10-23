/**
 * A qué servidor de IA va cada capacidad según la topología (SOP §2-3 y §6). PURO: sin `node:*`
 * ni `fetch`. Reutiliza el contrato de `tipos.ts` y no adivina hosts: si el inventario (o su
 * oferta) no trae el de una neurona, devuelve `baseUrl: null` con un motivo legible.
 */
import type {
    Capacidad,
    ConfigTopologia,
    EstadoRecursosIa,
    InventarioRecursos,
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

/** La topología vigente: la del plan, pisada por la que guardó el estado con el mismo alcance. */
function topologiaVigente(
    plan: PlanRecursos,
    estado: Pick<EstadoRecursosIa, "asignaciones" | "topologias"> | undefined,
): ConfigTopologia {
    const a = plan.topologia.alcance;
    return estado?.topologias?.[`${a.tipo}:${a.id}`] ?? plan.topologia;
}
