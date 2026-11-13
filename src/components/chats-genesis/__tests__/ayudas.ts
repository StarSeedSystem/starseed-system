/**
 * Ayudas de las pruebas de la pestaña Genesis (GEN1113D): un cliente de la puerta de mentira, un feed
 * de ejemplo y el ancho de pantalla simulado (jsdom no mide nada: el ancho lo decide matchMedia).
 */
import { vi } from "vitest";

import type { ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import type { RegistroEspejo } from "@/lib/chats-genesis/tipos";

type RespFeed = Awaited<ReturnType<ClienteChatsGenesis["feed"]>>;
type RespEnviar = Awaited<ReturnType<ClienteChatsGenesis["enviar"]>>;
type RespAcuses = Awaited<ReturnType<ClienteChatsGenesis["acuses"]>>;

/** Simula el ancho de la ventana: `usePantallaAncha` pregunta a matchMedia «(min-width: Npx)». */
export function ponerAncho(px: number): void {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: px });
    window.matchMedia = ((consulta: string) => {
        const min = Number(/min-width:\s*(\d+)px/.exec(consulta)?.[1] ?? 0);
        return {
            matches: px >= min,
            media: consulta,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
}

/**
 * Cliente falso: la primera lectura de cada fuente devuelve `feeds[fuente]`; las siguientes (espera
 * larga) se quedan esperando hasta que se cancelan, como una puerta sin novedades.
 */
export function clienteFalso(op: {
    feeds?: Record<string, RespFeed>;
    enviar?: (e: Parameters<ClienteChatsGenesis["enviar"]>[0]) => Promise<RespEnviar>;
    acuses?: (ids: number[]) => Promise<RespAcuses>;
} = {}) {
    const feed = vi.fn((f: Parameters<ClienteChatsGenesis["feed"]>[0], senal?: AbortSignal): Promise<RespFeed> => {
        if (f.desde === undefined) {
            return Promise.resolve(op.feeds?.[f.fuente] ?? { ok: true, registros: [], cursor: 0, latido: null });
        }
        return new Promise((resolver) => {
            senal?.addEventListener("abort", () => resolver({ ok: false, estado: 0, error: "cancelado" }), { once: true });
        });
    });
    const enviar = vi.fn(op.enviar ?? (async () => ({ ok: true as const, id: 7 })));
    const acuses = vi.fn(op.acuses ?? (async () => ({})));
    const cliente: ClienteChatsGenesis = { feed, enviar, acuses };
    return { cliente, feed, enviar, acuses };
}

let n = 0;
function idMd(): string {
    n += 1;
    return `md-${1763000000000 + n}-${(4096 + n).toString(16).slice(-4)}`;
}

/** Hace `min` minutos, en ISO. */
export function haceMin(min: number): string {
    return new Date(Date.now() - min * 60_000).toISOString();
}

/** Un feed de ejemplo con algo de cada vista (dirección, conversación, informes, enjambre, usos). */
export function feedDeEjemplo(): RegistroEspejo[] {
    const r = (x: Partial<RegistroEspejo>): RegistroEspejo => ({
        id: idMd(), t: haceMin(5), de: "director", rol: "director", tipo: "mensaje", texto: "…", canal: "mando", fuente: "direccion", ...x,
    } as RegistroEspejo);
    const pregunta = r({ de: "alex", rol: "alex", texto: "¿Cómo va la ola?", t: haceMin(50), canales: ["director-presidente"] });
    return [
        pregunta,
        r({ de: "director-presidente", rol: "director", tipo: "respuesta", canal: "director-presidente", texto: "Va bien: dos tareas listas.", t: haceMin(49), respondeA: pregunta.id, sintesis: true }),
        r({ de: "hermes", rol: "director", tipo: "respuesta", texto: "Revisado el despliegue.", t: haceMin(40) }),
        r({ de: "claude-cowork", rol: "director", tipo: "mensaje", texto: "Abro la revisión de seguridad.", t: haceMin(30) }),
        r({ de: "informe", rol: "director", tipo: "informe", texto: "Ola integrada sin novedad.", t: haceMin(300) }),
        r({ de: "vigilante", rol: "agente", tipo: "aviso", texto: "Cola parada 10 min.", t: haceMin(20) }),
        { id: "ev-1-a-commit", t: haceMin(15), de: "enjambre", rol: "agente", tipo: "actualizacion", texto: "commit 1234", canal: "mando", evento: "commit", fuente: "direccion" } as RegistroEspejo,
        { id: "ev-2-b-fallo_tests", t: haceMin(10), de: "enjambre", rol: "agente", tipo: "actualizacion", texto: "fallan pruebas", canal: "mando", evento: "fallo_tests", fuente: "direccion" } as RegistroEspejo,
        r({ de: "uso", rol: "sistema", tipo: "uso", texto: "1200 tokens", t: haceMin(3000) }),
        r({ de: "alex", rol: "alex", texto: "Escrito desde el móvil", t: haceMin(2), via: "genesis" } as Partial<RegistroEspejo>),
    ];
}

/** Respuesta de feed con latido de hace `latidoS` segundos (null = sin latido). */
export function respuestaFeed(registros: RegistroEspejo[], latidoS: number | null): RespFeed {
    return {
        ok: true,
        registros,
        cursor: registros.length,
        latido: latidoS === null ? null : { t: new Date(Date.now() - latidoS * 1000).toISOString(), de: "mac" },
    };
}
