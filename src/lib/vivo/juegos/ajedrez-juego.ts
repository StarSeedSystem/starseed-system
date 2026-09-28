/**
 * Ajedrez como juego de mesa: pone los asientos (0 = blancas, 1 = negras), las entradas del
 * diario y el resultado sobre el motor de reglas de `ajedrez.ts`.
 *
 * Entradas:
 *   · `jugar`  → `d: { m: "e2e4" }` (notación de coordenadas; coronación con letra: «e7e8q»).
 *   · `tablas` → `d: { a: "ofrecer" | "aceptar" | "rechazar" }`.
 * La rendición la pone la mesa (`rendirse`).
 */
import {
    aSAN,
    aplicarMov,
    enJaque,
    finDePartida,
    movDesdeUci,
    posicionInicial,
    type PosAjedrez,
} from "./ajedrez";
import type { Entrada, Fin, JuegoDeMesa, ResultadoJuego } from "./tipos";

export interface TableroAjedrez {
    pos: PosAjedrez;
    /** Notación de cada movimiento jugado (para la lista de jugadas). */
    san: string[];
    /** Último movimiento, para resaltarlo. */
    ultimo: { de: number; a: number } | null;
    /** ¿El bando que mueve está en jaque? */
    jaque: boolean;
    /** Asiento que ofreció tablas y espera respuesta. */
    oferta: number | null;
}

export function tableroAjedrezInicial(): TableroAjedrez {
    return { pos: posicionInicial(), san: [], ultimo: null, jaque: false, oferta: null };
}

const MOTIVO_TABLAS: Record<string, string> = {
    ahogado: "Rey ahogado",
    repeticion: "Triple repetición",
    cincuenta: "Regla de los 50 movimientos",
    material: "Material insuficiente",
};

export const juegoAjedrez: JuegoDeMesa<TableroAjedrez> = {
    id: "ajedrez",
    nombre: "Ajedrez",
    jugadores: { min: 2, max: 2 },
    autoInicio: true,
    inicial() {
        return tableroAjedrezInicial();
    },
    turno(t) {
        return finDePartida(t.pos) ? null : t.pos.turno;
    },
    aplicar(t, entrada: Entrada, ctx): ResultadoJuego<TableroAjedrez> {
        const mios = ctx.asientosDe(entrada.u);

        if (entrada.k === "tablas") {
            const accion = entrada.d?.a;
            if (accion === "ofrecer") {
                const propio = mios.find((s) => s === 0 || s === 1);
                if (propio === undefined) return { ok: false, motivo: "Solo quien juega puede ofrecer tablas." };
                if (t.oferta !== null && mios.includes(t.oferta)) return { ok: false, motivo: "Ya ofreciste tablas." };
                return { ok: true, tablero: { ...t, oferta: propio }, fin: null };
            }
            if (t.oferta === null) return { ok: false, motivo: "Nadie ha ofrecido tablas." };
            const rival = t.oferta === 0 ? 1 : 0;
            if (!mios.includes(rival)) return { ok: false, motivo: "Solo el rival puede responder a las tablas." };
            if (accion === "aceptar") {
                return {
                    ok: true,
                    tablero: { ...t, oferta: null },
                    fin: { tipo: "tablas", ganador: null, motivo: "Tablas por acuerdo" },
                };
            }
            if (accion === "rechazar") return { ok: true, tablero: { ...t, oferta: null }, fin: null };
            return { ok: false, motivo: "Acción de tablas no válida." };
        }

        if (entrada.k !== "jugar") return { ok: false, motivo: "Eso no se puede hacer en el ajedrez." };
        const uci = entrada.d?.m;
        if (typeof uci !== "string") return { ok: false, motivo: "Falta el movimiento." };
        if (!mios.includes(t.pos.turno)) return { ok: false, motivo: "No es tu turno." };
        const m = movDesdeUci(t.pos, uci);
        if (!m) return { ok: false, motivo: "Movimiento ilegal." };

        const san = aSAN(t.pos, m);
        const pos = aplicarMov(t.pos, m);
        const tablero: TableroAjedrez = {
            pos,
            san: [...t.san, san],
            ultimo: { de: m.de, a: m.a },
            jaque: enJaque(pos),
            oferta: null,
        };
        const final = finDePartida(pos);
        let fin: Fin | null = null;
        if (final?.tipo === "mate") {
            fin = { tipo: "victoria", ganador: final.ganador, motivo: "Jaque mate" };
        } else if (final?.tipo === "tablas") {
            fin = { tipo: "tablas", ganador: null, motivo: MOTIVO_TABLAS[final.motivo] ?? "Tablas" };
        }
        return { ok: true, tablero, fin };
    },
};
