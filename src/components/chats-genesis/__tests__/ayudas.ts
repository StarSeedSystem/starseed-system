/**
 * Ayudas de las pruebas de la pestaña Genesis (GEN1113D): un cliente de la puerta de mentira, un feed
 * de ejemplo y el ancho de pantalla simulado (jsdom no mide nada: el ancho lo decide matchMedia).
 */
import { vi } from "vitest";

import type { ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import type { RegistroEspejo } from "@/lib/chats-genesis/tipos";
import type { CatalogoCanon } from "@/lib/chats-genesis/canon";
import type { AparatoLocal } from "@/lib/chats-genesis/firma-aparato";

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
    enviar?: (e: Parameters<ClienteChatsGenesis["enviar"]>[0], chat?: Parameters<ClienteChatsGenesis["enviar"]>[1]) => Promise<RespEnviar>;
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
    // GEN1114F: `enviar` recibe también el chat que se ve (segundo argumento).
    const enviar = vi.fn(op.enviar ?? (async (_e: Parameters<ClienteChatsGenesis["enviar"]>[0], _chat?: Parameters<ClienteChatsGenesis["enviar"]>[1]): Promise<RespEnviar> => ({ ok: true as const, id: 7 })));
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

/**
 * GEN1114F · aparatos y catálogo de ejemplo para las pruebas de la interfaz (contrato GEN1114 §5.1 y §8.4).
 * Los nombres de los puentes son inventados («Hermes StarSeed»…): sirven para comprobar que con
 * catálogo no aparece ninguna etiqueta de GEN1113.
 */
export const APARATO_COMPLETO: AparatoLocal = {
    huella: "17a3b6ff31fccb5586b758b98e5cfcc2c4c4b68aa103288765360cfd0f64d80c",
    codigo: "7ETY-DGGK-DY2F",
    cuenta: "00000000-0000-4000-8000-000000000001",
    nombre: "iPhone de prueba",
    creado: "2026-11-13T01:00:00.000Z",
    seq: 3,
    nivel: "completo",
    estado: "emparejado",
    desde: "2026-11-13T01:05:00.000Z",
};
export const APARATO_TEXTO: AparatoLocal = { ...APARATO_COMPLETO, nivel: "texto" };

const MEDIO_WEB = { medio: "genesis-web" as const, nombreEnMedio: null, estadoNombre: "sin-comprobar" as const, comprobado: null, huella: null };

export function catalogoDeEjemplo(): CatalogoCanon {
    const base = { v: 2 as const, nombreProvisional: false, version: 4, actualizado: "2026-11-13T01:00:00.000Z" };
    return {
        v: 2,
        version: 4,
        t: "2026-11-13T01:00:00.000Z",
        chats: [
            { ...base, id: "genesis", nombre: "GENESIS · StarSeed OS", tipo: "direccion", fuente: "direccion", alias: ["direccion", "mando"], medios: [MEDIO_WEB] },
            { ...base, id: "genesis.canal.director-presidente", nombre: "Director presidente", tipo: "canal-director", padre: "genesis", fuente: null, alias: [], medios: [MEDIO_WEB] },
            {
                ...base, id: "telegram.hermes_starseed_bot", nombre: "Hermes StarSeed", tipo: "puente-telegram", fuente: "puente:hermes-avisos",
                alias: ["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"],
                medios: [
                    { medio: "telegram", nombreEnMedio: "Hermes del grupo", estadoNombre: "distinto", comprobado: "2026-11-13T01:00:00.000Z", huella: "a1b2c3d4", usuario: "@hermes_starseed_bot" },
                    MEDIO_WEB,
                ],
            },
            { ...base, id: "telegram.sintesis_starseed_bot", nombre: "Síntesis StarSeed", tipo: "puente-telegram", fuente: "puente:peticiones", alias: ["puente:peticiones", "peticiones", "Peticiones y encargos"], medios: [MEDIO_WEB] },
            { ...base, id: "telegram.avisos_starseed_bot", nombre: "Avisos StarSeed", tipo: "puente-telegram", fuente: "puente:avisos-directores", alias: ["puente:avisos-directores", "avisos-directores", "Avisos de los directores"], medios: [MEDIO_WEB] },
        ],
    } as CatalogoCanon;
}

/** Las tres etiquetas de GEN1113 que, con catálogo, no deben verse en ninguna pantalla (§7.3). */
export const ETIQUETAS_GEN1113 = ["Hermes y avisos", "Peticiones y encargos", "Avisos de los directores"];
