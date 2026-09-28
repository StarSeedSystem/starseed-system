/**
 * La MESA: asientos, inicio, rendición y resultado, comunes a todos los juegos. Envuelve las
 * reglas puras de cada juego (`JuegoDeMesa`) y las convierte en un `Motor` del diario compartido.
 *
 *   base    → `{ juego, creador, semilla, opciones }`
 *   entradas comunes → `sentar`, `levantar`, `empezar`, `rendirse`
 *   el resto        → se delega en las reglas del juego
 *
 * Todo lo que llega (de este dispositivo o de otro) pasa por `aplicar`: una entrada inválida —
 * que mueve quien no es su turno, un movimiento ilegal, un asiento ya ocupado — se rechaza igual
 * en todos los clientes. Es la única «autoridad» de la partida.
 */
import { juegoAjedrez } from "./ajedrez-juego";
import { juegoConecta4 } from "./conecta4";
import { juegoDibujo } from "./dibujo";
import { juegoTresEnRaya } from "./tres-en-raya";
import {
    esIdJuego,
    type Asiento,
    type ContextoMesa,
    type Datos,
    type Entrada,
    type Fin,
    type IdJuego,
    type JuegoDeMesa,
    type Motor,
    type MotorCualquiera,
    type Registro,
    type ResumenPartida,
} from "./tipos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JuegoCualquiera = JuegoDeMesa<any>;

export const JUEGOS: Record<IdJuego, JuegoCualquiera> = {
    "tres-en-raya": juegoTresEnRaya,
    "conecta-4": juegoConecta4,
    ajedrez: juegoAjedrez,
    dibujo: juegoDibujo,
};

export interface EstadoMesa<T = unknown> {
    juego: IdJuego;
    creador: string;
    asientos: (Asiento | null)[];
    iniciada: boolean;
    tablero: T;
    fin: Fin | null;
    /** Asiento al que le toca mover (si el juego lo tiene). */
    turno: number | null;
    /** Entradas aplicadas. */
    n: number;
    /** Marca de tiempo de la última entrada aplicada. */
    ultimaT: number;
}

export function juegoDe(id: string): JuegoCualquiera | null {
    return esIdJuego(id) ? JUEGOS[id] : null;
}

function contexto(asientos: (Asiento | null)[]): ContextoMesa {
    return {
        asientos,
        asientosDe(uid: string) {
            const out: number[] = [];
            asientos.forEach((a, i) => {
                if (a && a.uid === uid) out.push(i);
            });
            return out;
        },
    };
}

function nombreSeguro(v: unknown): string {
    const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
    return (t || "Jugador").slice(0, 40);
}

function ocupados(asientos: (Asiento | null)[]): number[] {
    const out: number[] = [];
    asientos.forEach((a, i) => {
        if (a) out.push(i);
    });
    return out;
}

/**
 * Base de una partida nueva. `sentados` (opcional) deja a esas personas ya sentadas: así una
 * revancha empieza al instante con los mismos asientos (y, en juegos de dos, con los colores
 * cambiados) sin que cada persona tenga que volver a sentarse.
 */
export function baseDePartida(
    juego: IdJuego,
    creador: string,
    semilla: number,
    opciones: Datos = {},
    sentados?: (Asiento | null)[],
): Datos {
    const base: Datos = { juego, creador, semilla, opciones };
    if (sentados && sentados.some((a) => a !== null)) {
        base.sentados = sentados.map((a) => (a ? { uid: a.uid, nombre: a.nombre } : null));
    }
    return base;
}

/** Asientos de partida guardados en la base (validados: nunca se fía de lo que llega). */
function sentadosDeBase(base: Datos, max: number, permiteDoble: boolean): (Asiento | null)[] {
    const vacios = Array.from({ length: max }, () => null as Asiento | null);
    const bruto = base.sentados;
    if (!Array.isArray(bruto)) return vacios;
    const usos = new Map<string, number>();
    for (let i = 0; i < Math.min(max, bruto.length); i++) {
        const x = bruto[i];
        if (!x || typeof x !== "object" || Array.isArray(x)) continue;
        const uid = (x as { uid?: unknown }).uid;
        if (typeof uid !== "string" || uid.length === 0 || uid.length > 80) continue;
        const veces = usos.get(uid) ?? 0;
        if (veces >= (permiteDoble ? 2 : 1)) continue;
        usos.set(uid, veces + 1);
        vacios[i] = { uid, nombre: nombreSeguro((x as { nombre?: unknown }).nombre) };
    }
    return vacios;
}

export const motorMesa: Motor<EstadoMesa> = {
    inicial(base) {
        const juego = juegoDe(String(base.juego));
        if (!juego) throw new Error(`Juego desconocido: ${String(base.juego)}`);
        const opciones = (base.opciones && typeof base.opciones === "object" && !Array.isArray(base.opciones) ? base.opciones : {}) as Datos;
        const semilla = typeof base.semilla === "number" ? base.semilla : 0;
        const tablero = juego.inicial(opciones, semilla);
        const asientos = sentadosDeBase(base, juego.jugadores.max, juego.jugadores.max === 2 && juego.autoInicio);
        const iniciada = juego.autoInicio && asientos.every((a) => a !== null);
        return {
            juego: juego.id,
            creador: typeof base.creador === "string" ? base.creador : "",
            asientos,
            iniciada,
            tablero,
            fin: null,
            turno: iniciada ? juego.turno(tablero) : null,
            n: 0,
            ultimaT: 0,
        };
    },

    aplicar(e, entrada: Entrada) {
        const juego = JUEGOS[e.juego];
        if (typeof entrada.u !== "string" || entrada.u.length === 0) {
            return { ok: false, motivo: "Hace falta una cuenta para jugar." };
        }
        const ctx = contexto(e.asientos);
        const avanzar = (parcial: Partial<EstadoMesa>): EstadoMesa => {
            const siguiente: EstadoMesa = { ...e, ...parcial, n: e.n + 1, ultimaT: entrada.t };
            if (siguiente.iniciada && !siguiente.fin) siguiente.turno = juego.turno(siguiente.tablero);
            else siguiente.turno = null;
            return siguiente;
        };

        switch (entrada.k) {
            case "sentar": {
                if (e.fin) return { ok: false, motivo: "La partida ya terminó." };
                if (e.iniciada) return { ok: false, motivo: "La partida ya empezó: puedes mirar." };
                const mios = ctx.asientosDe(entrada.u);
                const doble = entrada.d?.doble === true;
                if (mios.length > 0 && !doble) return { ok: false, motivo: "Ya tienes asiento." };
                if (doble && (juego.jugadores.max !== 2 || !juego.autoInicio)) {
                    return { ok: false, motivo: "Este juego no se puede jugar por los dos lados." };
                }
                if (mios.length >= 2) return { ok: false, motivo: "Ya juegas por los dos lados." };
                let lado = entrada.d?.lado;
                if (lado === undefined || lado === null) {
                    lado = e.asientos.findIndex((a) => a === null);
                } else if (typeof lado !== "number" || !Number.isInteger(lado) || lado < 0 || lado >= e.asientos.length) {
                    return { ok: false, motivo: "Ese asiento no existe." };
                }
                if (lado < 0 || e.asientos[lado as number] !== null) return { ok: false, motivo: "Ese asiento ya está ocupado." };
                const asientos = e.asientos.slice();
                asientos[lado as number] = { uid: entrada.u, nombre: nombreSeguro(entrada.d?.nombre) };
                const iniciada = juego.autoInicio && asientos.every((a) => a !== null);
                return { ok: true, estado: avanzar({ asientos, iniciada }) };
            }
            case "levantar": {
                if (e.iniciada || e.fin) return { ok: false, motivo: "Ya no puedes levantarte de la mesa." };
                const lado = entrada.d?.lado;
                if (typeof lado !== "number" || !Number.isInteger(lado) || !e.asientos[lado]) {
                    return { ok: false, motivo: "Ese asiento está libre." };
                }
                if (e.asientos[lado]?.uid !== entrada.u) return { ok: false, motivo: "Ese no es tu asiento." };
                const asientos = e.asientos.slice();
                asientos[lado] = null;
                return { ok: true, estado: avanzar({ asientos }) };
            }
            case "empezar": {
                if (juego.autoInicio) return { ok: false, motivo: "Este juego empieza solo al llenarse la mesa." };
                if (e.iniciada) return { ok: false, motivo: "La partida ya empezó." };
                if (ctx.asientosDe(entrada.u).length === 0) return { ok: false, motivo: "Siéntate para empezar." };
                const sentados = ocupados(e.asientos);
                if (sentados.length < juego.jugadores.min) {
                    return { ok: false, motivo: `Hacen falta al menos ${juego.jugadores.min} personas.` };
                }
                const tablero = juego.alEmpezar ? juego.alEmpezar(e.tablero, sentados, entrada.t) : e.tablero;
                return { ok: true, estado: avanzar({ iniciada: true, tablero }) };
            }
            case "rendirse": {
                if (!e.iniciada || e.fin) return { ok: false, motivo: "No hay partida en curso." };
                if (juego.jugadores.max !== 2) return { ok: false, motivo: "En este juego no hay rendición." };
                const mios = ctx.asientosDe(entrada.u);
                if (mios.length === 0) return { ok: false, motivo: "Solo quien juega puede rendirse." };
                let lado = entrada.d?.lado;
                if (typeof lado !== "number") lado = mios.length === 1 ? mios[0] : (e.turno ?? mios[0]);
                if (!mios.includes(lado as number)) return { ok: false, motivo: "Ese no es tu lado." };
                const ganador = lado === 0 ? 1 : 0;
                return {
                    ok: true,
                    estado: avanzar({ fin: { tipo: "rendicion", ganador, motivo: "Rendición" } }),
                };
            }
            default: {
                if (!e.iniciada) return { ok: false, motivo: "La partida aún no ha empezado." };
                if (e.fin) return { ok: false, motivo: "La partida ya terminó." };
                const r = juego.aplicar(e.tablero, entrada, ctx);
                if (!r.ok) return { ok: false, motivo: r.motivo };
                return { ok: true, estado: avanzar({ tablero: r.tablero, fin: r.fin ?? null }) };
            }
        }
    },

    resumen(e, registro: Registro): ResumenPartida | null {
        if (!e.fin) return null;
        const sentados = e.asientos.map((a) => a?.nombre ?? "");
        const puntos = e.juego === "dibujo" ? ((e.tablero as { puntos?: number[] }).puntos ?? []) : undefined;
        return {
            id: registro.id,
            juego: e.juego,
            gen: registro.gen,
            t: e.ultimaT,
            nombres: sentados,
            uids: e.asientos.map((a) => a?.uid ?? ""),
            ganador: e.fin.ganador,
            motivo: e.fin.motivo,
            ...(puntos ? { puntos } : {}),
        };
    },
};

/** Qué motor interpreta cada tipo de registro de una sala de juegos (todos los juegos comparten la mesa). */
export function buscarMotorMesa(tipo: string): MotorCualquiera | null {
    return esIdJuego(tipo) ? motorMesa : null;
}
