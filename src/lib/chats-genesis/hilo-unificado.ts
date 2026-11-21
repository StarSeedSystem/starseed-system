/**
 * Hilo único de dirección cross-media (GEN1113 §10).
 *
 * Unifica Telegram (bot Hermes), Astraura › Chat › Genesis y Chat Director
 * con los mismos mensajes/respuestas. Funciones puras, sin red ni React.
 */

import type { MensajeDirector } from "@/lib/mando/chat-director-tipos";

export type FuenteCrossMedia =
    | "direccion"
    | "hermes-avisos"
    | "peticiones"
    | "avisos-directores";

export type TipoUnificado = "mensaje" | "respuesta" | "informe" | "aviso" | "actualizacion" | "uso";

export interface MensajeUnificado {
    id: string;
    t: string;
    texto: string;
    fuente: FuenteCrossMedia;
    origen: string;
    esDeAlex: boolean;
    tipoUnificado: TipoUnificado;
    canal?: string;
    metadata?: Record<string, unknown>;
}

interface MensajeConFuente extends MensajeDirector {
    fuente?: string;
}

function epochDe(t: string): number {
    if (typeof t !== "string" || t.trim() === "") return 0;
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms / 1000 : 0;
}

function fuenteNormalizada(fuente: string | undefined): FuenteCrossMedia {
    if (!fuente) return "direccion";
    if (fuente.startsWith("puente:")) {
        const clave = fuente.slice("puente:".length);
        if (["hermes-avisos", "peticiones", "avisos-directores"].includes(clave)) {
            return clave as FuenteCrossMedia;
        }
    }
    return "direccion";
}

function origenDe(m: MensajeDirector): string {
    return m.de;
}

function esDeAlex(m: MensajeDirector): boolean {
    return m.rol === "alex" || m.de.startsWith("alex") || m.de === "telegram-puente";
}

function tipoUnificadoDe(tipo: string): TipoUnificado {
    const tipos: TipoUnificado[] = ["mensaje", "respuesta", "informe", "aviso", "actualizacion", "uso"];
    return tipos.includes(tipo as TipoUnificado) ? (tipo as TipoUnificado) : "mensaje";
}

export function mensajeAUnificado(m: MensajeConFuente): MensajeUnificado {
    const fuente = fuenteNormalizada(m.fuente);
    return {
        id: m.id,
        t: m.t,
        texto: m.texto,
        fuente,
        origen: origenDe(m),
        esDeAlex: esDeAlex(m),
        tipoUnificado: tipoUnificadoDe(m.tipo),
        canal: m.canal,
        metadata: {
            rol: m.rol,
            modelo: m.modelo,
            respondeA: m.respondeA,
            tarea: m.tarea,
            sintesis: m.sintesis,
            evento: m.evento,
        },
    };
}

export function fusionarMensajes(
    listas: readonly (readonly MensajeDirector[])[]
): MensajeUnificado[] {
    const vistos = new Set<string>();
    const salida: MensajeUnificado[] = [];

    for (const lista of listas) {
        for (const m of lista) {
            if (!m || typeof m.id !== "string" || vistos.has(m.id)) continue;
            vistos.add(m.id);
            salida.push(mensajeAUnificado(m));
        }
    }

    return ordenarPorTiempo(salida);
}

export function ordenarPorTiempo(mensajes: readonly MensajeUnificado[]): MensajeUnificado[] {
    return [...mensajes].sort((a, b) => epochDe(a.t) - epochDe(b.t));
}

export function filtrarPorFuente(
    mensajes: readonly MensajeUnificado[],
    fuente: FuenteCrossMedia,
): MensajeUnificado[] {
    return mensajes.filter((m) => m.fuente === fuente);
}

export function tipoMensajeUnificado(tipo: string): TipoUnificado {
    return tipoUnificadoDe(tipo);
}