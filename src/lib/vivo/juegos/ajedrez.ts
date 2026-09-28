/**
 * Ajedrez — motor de reglas COMPLETO y compacto (sin motor externo, sin descargas).
 *
 * Reglas: movimiento de todas las piezas, jaque, mate, tablas por rey ahogado, enroque corto y
 * largo (con sus condiciones: derechos vivos, casillas libres, rey no en jaque y sin pasar ni
 * caer en casilla atacada), captura al paso, promoción (dama, torre, alfil, caballo), tablas por
 * triple repetición, por la regla de los 50 movimientos y por material insuficiente.
 *
 * Representación: 64 casillas, `a1 = 0`, `h1 = 7`, `a8 = 56`, `h8 = 63` (casilla = fila*8 + columna,
 * fila 0 = la primera fila de las blancas). Piezas como enteros con signo: blancas positivas,
 * negras negativas — 1 peón, 2 caballo, 3 alfil, 4 torre, 5 dama, 6 rey. Turno 0 = blancas.
 *
 * Todo es PURO y determinista: la misma posición y el mismo movimiento dan siempre el mismo
 * resultado, que es lo que permite validar cada jugada remota con las mismas reglas.
 * `perft` verifica el generador contra los recuentos de referencia de la comunidad.
 */

export const PEON = 1;
export const CABALLO = 2;
export const ALFIL = 3;
export const TORRE = 4;
export const DAMA = 5;
export const REY = 6;

export type Color = 0 | 1;

export interface PosAjedrez {
    /** 64 casillas; 0 = vacía. */
    t: number[];
    turno: Color;
    /** Derechos de enroque en bits: 1 = blancas cortas, 2 = blancas largas, 4 = negras cortas, 8 = negras largas. */
    enroque: number;
    /** Casilla destino de una posible captura al paso, o -1. */
    alPaso: number;
    /** Medios movimientos desde la última captura o movimiento de peón. */
    medio: number;
    /** Número de jugada completa (empieza en 1). */
    num: number;
    /** Claves de las posiciones desde el último movimiento irreversible (incluye la actual). */
    rep: string[];
}

export interface MovAjedrez {
    de: number;
    a: number;
    /** Pieza a la que corona un peón (2 caballo, 3 alfil, 4 torre, 5 dama). */
    promo?: number;
    captura: boolean;
    alPaso?: boolean;
    /** 1 = enroque corto, 2 = enroque largo. */
    enroque?: 1 | 2;
}

export type FinAjedrez =
    | { tipo: "mate"; ganador: Color }
    | { tipo: "tablas"; motivo: "ahogado" | "repeticion" | "cincuenta" | "material" };

export const FEN_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ───────────────────────────── Tablas de geometría ─────────────────────────────

const ARCHIVOS = "abcdefgh";

export function nombreCasilla(sq: number): string {
    return `${ARCHIVOS[sq & 7]}${(sq >> 3) + 1}`;
}

export function casillaDe(nombre: string): number {
    if (!/^[a-h][1-8]$/.test(nombre)) return -1;
    return (nombre.charCodeAt(1) - 49) * 8 + (nombre.charCodeAt(0) - 97);
}

function dentro(f: number, r: number): boolean {
    return f >= 0 && f < 8 && r >= 0 && r < 8;
}

const SALTOS_CABALLO: number[][] = [];
const SALTOS_REY: number[][] = [];
const RAYOS_ORTO: number[][][] = [];
const RAYOS_DIAG: number[][][] = [];

(function precalcular() {
    const cab: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    const orto: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const diag: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let sq = 0; sq < 64; sq++) {
        const f = sq & 7;
        const r = sq >> 3;
        SALTOS_CABALLO[sq] = cab.filter(([df, dr]) => dentro(f + df, r + dr)).map(([df, dr]) => (r + dr) * 8 + f + df);
        SALTOS_REY[sq] = [...orto, ...diag]
            .filter(([df, dr]) => dentro(f + df, r + dr))
            .map(([df, dr]) => (r + dr) * 8 + f + df);
        const rayo = (dirs: [number, number][]) =>
            dirs.map(([df, dr]) => {
                const out: number[] = [];
                let ff = f + df;
                let rr = r + dr;
                while (dentro(ff, rr)) {
                    out.push(rr * 8 + ff);
                    ff += df;
                    rr += dr;
                }
                return out;
            });
        RAYOS_ORTO[sq] = rayo(orto);
        RAYOS_DIAG[sq] = rayo(diag);
    }
})();

/** Signo de un color: 1 blancas, -1 negras. */
function signo(turno: Color): 1 | -1 {
    return turno === 0 ? 1 : -1;
}

// ───────────────────────────── Ataques ─────────────────────────────

/** ¿La casilla `sq` está atacada por alguna pieza del bando `color` (1 blancas, -1 negras)? */
function atacada(t: readonly number[], sq: number, color: 1 | -1): boolean {
    const f = sq & 7;
    const r = sq >> 3;
    // Peones: un peón blanco ataca hacia arriba, así que su atacante está una fila por debajo.
    const rp = r - color;
    if (rp >= 0 && rp < 8) {
        if (f > 0 && t[rp * 8 + f - 1] === color * PEON) return true;
        if (f < 7 && t[rp * 8 + f + 1] === color * PEON) return true;
    }
    for (const s of SALTOS_CABALLO[sq]) if (t[s] === color * CABALLO) return true;
    for (const s of SALTOS_REY[sq]) if (t[s] === color * REY) return true;
    for (const rayo of RAYOS_DIAG[sq]) {
        for (const s of rayo) {
            const p = t[s];
            if (p !== 0) {
                if (p === color * ALFIL || p === color * DAMA) return true;
                break;
            }
        }
    }
    for (const rayo of RAYOS_ORTO[sq]) {
        for (const s of rayo) {
            const p = t[s];
            if (p !== 0) {
                if (p === color * TORRE || p === color * DAMA) return true;
                break;
            }
        }
    }
    return false;
}

function casillaRey(t: readonly number[], color: 1 | -1): number {
    return t.indexOf(color * REY);
}

/** ¿El bando al que le toca está en jaque? */
export function enJaque(pos: PosAjedrez): boolean {
    const c = signo(pos.turno);
    const rey = casillaRey(pos.t, c);
    return rey >= 0 && atacada(pos.t, rey, (c === 1 ? -1 : 1) as 1 | -1);
}

// ───────────────────────────── Generación de movimientos ─────────────────────────────

const PROMOCIONES = [DAMA, TORRE, ALFIL, CABALLO];

function generarPseudo(pos: Pick<PosAjedrez, "t" | "turno" | "enroque" | "alPaso">): MovAjedrez[] {
    const { t } = pos;
    const c = signo(pos.turno);
    const rival = (c === 1 ? -1 : 1) as 1 | -1;
    const out: MovAjedrez[] = [];

    for (let sq = 0; sq < 64; sq++) {
        const p = t[sq];
        if (p === 0 || p * c < 0) continue;
        const tipo = Math.abs(p);
        const f = sq & 7;
        const r = sq >> 3;

        if (tipo === PEON) {
            const rSig = r + c;
            if (rSig < 0 || rSig > 7) continue;
            const promociona = rSig === 0 || rSig === 7;
            const adelante = rSig * 8 + f;
            if (t[adelante] === 0) {
                if (promociona) {
                    for (const pr of PROMOCIONES) out.push({ de: sq, a: adelante, promo: pr, captura: false });
                } else {
                    out.push({ de: sq, a: adelante, captura: false });
                    const inicio = c === 1 ? 1 : 6;
                    if (r === inicio && t[(r + 2 * c) * 8 + f] === 0) {
                        out.push({ de: sq, a: (r + 2 * c) * 8 + f, captura: false });
                    }
                }
            }
            for (const df of [-1, 1]) {
                if (f + df < 0 || f + df > 7) continue;
                const dest = rSig * 8 + f + df;
                const ocupante = t[dest];
                if (ocupante !== 0 && ocupante * c < 0) {
                    if (promociona) {
                        for (const pr of PROMOCIONES) out.push({ de: sq, a: dest, promo: pr, captura: true });
                    } else {
                        out.push({ de: sq, a: dest, captura: true });
                    }
                } else if (ocupante === 0 && dest === pos.alPaso) {
                    out.push({ de: sq, a: dest, captura: true, alPaso: true });
                }
            }
            continue;
        }

        if (tipo === CABALLO) {
            for (const s of SALTOS_CABALLO[sq]) {
                const o = t[s];
                if (o * c <= 0) out.push({ de: sq, a: s, captura: o !== 0 });
            }
            continue;
        }

        if (tipo === REY) {
            for (const s of SALTOS_REY[sq]) {
                const o = t[s];
                if (o * c <= 0) out.push({ de: sq, a: s, captura: o !== 0 });
            }
            // Enroque: derechos vivos, rey y torre en su sitio, casillas libres y sin pasar por jaque.
            const base = c === 1 ? 0 : 56;
            if (sq === base + 4 && !atacada(t, sq, rival)) {
                const corto = c === 1 ? 1 : 4;
                const largo = c === 1 ? 2 : 8;
                if (
                    pos.enroque & corto &&
                    t[base + 7] === c * TORRE &&
                    t[base + 5] === 0 &&
                    t[base + 6] === 0 &&
                    !atacada(t, base + 5, rival) &&
                    !atacada(t, base + 6, rival)
                ) {
                    out.push({ de: sq, a: base + 6, captura: false, enroque: 1 });
                }
                if (
                    pos.enroque & largo &&
                    t[base] === c * TORRE &&
                    t[base + 1] === 0 &&
                    t[base + 2] === 0 &&
                    t[base + 3] === 0 &&
                    !atacada(t, base + 3, rival) &&
                    !atacada(t, base + 2, rival)
                ) {
                    out.push({ de: sq, a: base + 2, captura: false, enroque: 2 });
                }
            }
            continue;
        }

        const rayos: number[][] = [];
        if (tipo === ALFIL || tipo === DAMA) rayos.push(...RAYOS_DIAG[sq]);
        if (tipo === TORRE || tipo === DAMA) rayos.push(...RAYOS_ORTO[sq]);
        for (const rayo of rayos) {
            for (const s of rayo) {
                const o = t[s];
                if (o === 0) {
                    out.push({ de: sq, a: s, captura: false });
                    continue;
                }
                if (o * c < 0) out.push({ de: sq, a: s, captura: true });
                break;
            }
        }
    }
    return out;
}

/** Aplica el movimiento sobre el tablero EN SITIO y devuelve lo necesario para deshacerlo. */
function hacer(t: number[], m: MovAjedrez): { movida: number; capturada: number; casillaCap: number } {
    const movida = t[m.de];
    let casillaCap = m.a;
    if (m.alPaso) casillaCap = m.a + (movida > 0 ? -8 : 8);
    const capturada = t[casillaCap];
    t[casillaCap] = 0;
    t[m.de] = 0;
    t[m.a] = m.promo ? (movida > 0 ? m.promo : -m.promo) : movida;
    if (m.enroque) {
        const base = movida > 0 ? 0 : 56;
        if (m.enroque === 1) {
            t[base + 5] = t[base + 7];
            t[base + 7] = 0;
        } else {
            t[base + 3] = t[base];
            t[base] = 0;
        }
    }
    return { movida, capturada, casillaCap };
}

function deshacer(t: number[], m: MovAjedrez, u: { movida: number; capturada: number; casillaCap: number }): void {
    t[m.a] = 0;
    t[m.de] = u.movida;
    t[u.casillaCap] = u.capturada;
    if (m.enroque) {
        const base = u.movida > 0 ? 0 : 56;
        if (m.enroque === 1) {
            t[base + 7] = t[base + 5];
            t[base + 5] = 0;
        } else {
            t[base] = t[base + 3];
            t[base + 3] = 0;
        }
    }
}

type EntradaLegal = Pick<PosAjedrez, "t" | "turno" | "enroque" | "alPaso">;

/** Movimientos legales de la posición (los que no dejan al propio rey en jaque). */
export function movimientosLegales(pos: EntradaLegal): MovAjedrez[] {
    const c = signo(pos.turno);
    const rival = (c === 1 ? -1 : 1) as 1 | -1;
    const t = pos.t.slice();
    const legales: MovAjedrez[] = [];
    for (const m of generarPseudo(pos)) {
        const u = hacer(t, m);
        const rey = casillaRey(t, c);
        if (rey < 0 || !atacada(t, rey, rival)) legales.push(m);
        deshacer(t, m, u);
    }
    return legales;
}

// ───────────────────────────── Posiciones ─────────────────────────────

const LETRAS_CLAVE = "ABCDEFGHIJKLM";

/** Clave de posición para la repetición: piezas, turno, enroque y captura al paso POSIBLE. */
export function claveRepeticion(pos: Pick<PosAjedrez, "t" | "turno" | "enroque" | "alPaso">): string {
    let s = "";
    for (let i = 0; i < 64; i++) s += LETRAS_CLAVE[pos.t[i] + 6];
    return `${s}${pos.turno}${pos.enroque}${alPasoPosible(pos) ? pos.alPaso : -1}`;
}

/** ¿Hay algún peón del bando que mueve que pueda capturar al paso? */
function alPasoPosible(pos: Pick<PosAjedrez, "t" | "turno" | "alPaso">): boolean {
    if (pos.alPaso < 0) return false;
    const c = signo(pos.turno);
    const f = pos.alPaso & 7;
    const r = (pos.alPaso >> 3) - c;
    if (r < 0 || r > 7) return false;
    for (const df of [-1, 1]) {
        if (f + df >= 0 && f + df < 8 && pos.t[r * 8 + f + df] === c * PEON) return true;
    }
    return false;
}

export function posicionInicial(): PosAjedrez {
    return desdeFEN(FEN_INICIAL);
}

const PIEZA_FEN: Record<string, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };

/** Lee una posición en notación FEN. Lanza `Error` si el FEN no es válido (solo para pruebas y datos propios). */
export function desdeFEN(fen: string): PosAjedrez {
    const partes = fen.trim().split(/\s+/);
    if (partes.length < 4) throw new Error("FEN incompleto");
    const filas = partes[0].split("/");
    if (filas.length !== 8) throw new Error("FEN: se esperaban 8 filas");
    const t: number[] = new Array(64).fill(0);
    filas.forEach((fila, i) => {
        const r = 7 - i;
        let f = 0;
        for (const ch of fila) {
            if (/[1-8]/.test(ch)) {
                f += Number(ch);
            } else {
                const p = PIEZA_FEN[ch.toLowerCase()];
                if (!p || f > 7) throw new Error("FEN: pieza no válida");
                t[r * 8 + f] = ch === ch.toLowerCase() ? -p : p;
                f += 1;
            }
        }
        if (f !== 8) throw new Error("FEN: fila incompleta");
    });
    const turno: Color = partes[1] === "b" ? 1 : 0;
    let enroque = 0;
    if (partes[2].includes("K")) enroque |= 1;
    if (partes[2].includes("Q")) enroque |= 2;
    if (partes[2].includes("k")) enroque |= 4;
    if (partes[2].includes("q")) enroque |= 8;
    const alPaso = partes[3] === "-" ? -1 : casillaDe(partes[3]);
    const medio = Number(partes[4] ?? 0) || 0;
    const num = Number(partes[5] ?? 1) || 1;
    const base = { t, turno, enroque, alPaso };
    return { ...base, medio, num, rep: [claveRepeticion(base)] };
}

const LETRA_FEN = ["", "p", "n", "b", "r", "q", "k"];

export function aFEN(pos: PosAjedrez): string {
    const filas: string[] = [];
    for (let r = 7; r >= 0; r--) {
        let fila = "";
        let vacias = 0;
        for (let f = 0; f < 8; f++) {
            const p = pos.t[r * 8 + f];
            if (p === 0) {
                vacias += 1;
                continue;
            }
            if (vacias) fila += String(vacias);
            vacias = 0;
            const l = LETRA_FEN[Math.abs(p)];
            fila += p > 0 ? l.toUpperCase() : l;
        }
        if (vacias) fila += String(vacias);
        filas.push(fila);
    }
    const d =
        (pos.enroque & 1 ? "K" : "") + (pos.enroque & 2 ? "Q" : "") + (pos.enroque & 4 ? "k" : "") + (pos.enroque & 8 ? "q" : "");
    return `${filas.join("/")} ${pos.turno === 0 ? "w" : "b"} ${d || "-"} ${pos.alPaso >= 0 ? nombreCasilla(pos.alPaso) : "-"} ${pos.medio} ${pos.num}`;
}

// ───────────────────────────── Aplicar un movimiento ─────────────────────────────

/** Nueva posición tras un movimiento (que debe ser legal). No muta la de entrada. */
function siguiente(pos: PosAjedrez, m: MovAjedrez, conClave: boolean): PosAjedrez {
    const t = pos.t.slice();
    const pieza = t[m.de];
    const tipo = Math.abs(pieza);
    hacer(t, m);

    let enroque = pos.enroque;
    // Mover el rey pierde los dos derechos del bando.
    if (tipo === REY) enroque &= pieza > 0 ? ~3 : ~12;
    // Mover una torre desde su esquina, o capturarla allí, pierde ese derecho.
    for (const sq of [m.de, m.a]) {
        if (sq === 7) enroque &= ~1;
        else if (sq === 0) enroque &= ~2;
        else if (sq === 63) enroque &= ~4;
        else if (sq === 56) enroque &= ~8;
    }

    let alPaso = -1;
    if (tipo === PEON && Math.abs(m.a - m.de) === 16) alPaso = (m.a + m.de) >> 1;

    const irreversible = tipo === PEON || m.captura;
    const medio = irreversible ? 0 : pos.medio + 1;
    const turno: Color = pos.turno === 0 ? 1 : 0;
    const num = pos.turno === 1 ? pos.num + 1 : pos.num;
    const base = { t, turno, enroque, alPaso };
    let rep: string[] = [];
    if (conClave) {
        const clave = claveRepeticion(base);
        rep = irreversible ? [clave] : [...pos.rep, clave];
    }
    return { ...base, medio, num, rep };
}

export function aplicarMov(pos: PosAjedrez, m: MovAjedrez): PosAjedrez {
    return siguiente(pos, m, true);
}

// ───────────────────────────── Final de partida ─────────────────────────────

/** ¿Material insuficiente para dar mate (rey solo, rey y una pieza menor, alfiles del mismo color)? */
export function materialInsuficiente(t: readonly number[]): boolean {
    const menores: { tipo: number; color: number; sq: number }[] = [];
    for (let sq = 0; sq < 64; sq++) {
        const p = t[sq];
        const tipo = Math.abs(p);
        if (p === 0 || tipo === REY) continue;
        if (tipo === PEON || tipo === TORRE || tipo === DAMA) return false;
        menores.push({ tipo, color: p > 0 ? 1 : -1, sq });
    }
    if (menores.length <= 1) return true;
    // Solo alfiles, todos en casillas del mismo color.
    if (menores.every((m) => m.tipo === ALFIL)) {
        const color = (m: { sq: number }) => ((m.sq >> 3) + (m.sq & 7)) & 1;
        return menores.every((m) => color(m) === color(menores[0]));
    }
    return false;
}

/** ¿La partida terminó? Comprueba mate, ahogado, repetición, 50 movimientos y material. */
export function finDePartida(pos: PosAjedrez): FinAjedrez | null {
    const legales = movimientosLegales(pos);
    if (legales.length === 0) {
        return enJaque(pos)
            ? { tipo: "mate", ganador: pos.turno === 0 ? 1 : 0 }
            : { tipo: "tablas", motivo: "ahogado" };
    }
    if (materialInsuficiente(pos.t)) return { tipo: "tablas", motivo: "material" };
    const actual = pos.rep[pos.rep.length - 1];
    if (actual !== undefined && pos.rep.filter((k) => k === actual).length >= 3) {
        return { tipo: "tablas", motivo: "repeticion" };
    }
    if (pos.medio >= 100) return { tipo: "tablas", motivo: "cincuenta" };
    return null;
}

// ───────────────────────────── Notación ─────────────────────────────

const LETRA_PROMO: Record<number, string> = { 2: "n", 3: "b", 4: "r", 5: "q" };
const PROMO_DE_LETRA: Record<string, number> = { n: 2, b: 3, r: 4, q: 5 };

/** Notación de coordenadas: «e2e4», «e7e8q». El enroque es el movimiento del rey («e1g1»). */
export function aUci(m: MovAjedrez): string {
    return `${nombreCasilla(m.de)}${nombreCasilla(m.a)}${m.promo ? LETRA_PROMO[m.promo] : ""}`;
}

/** Busca entre los movimientos LEGALES el que describe `uci`; null si no es legal. */
export function movDesdeUci(pos: PosAjedrez, uci: string): MovAjedrez | null {
    if (typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci)) return null;
    const de = casillaDe(uci.slice(0, 2));
    const a = casillaDe(uci.slice(2, 4));
    const promo = uci.length === 5 ? PROMO_DE_LETRA[uci[4]] : undefined;
    for (const m of movimientosLegales(pos)) {
        if (m.de === de && m.a === a && (m.promo ?? undefined) === promo) return m;
    }
    return null;
}

const LETRA_ES: Record<number, string> = { 2: "C", 3: "A", 4: "T", 5: "D", 6: "R" };

/** Notación algebraica en español («Cf3», «exd5», «O-O», «e8=D+», «Dh5#») ANTES de jugar el movimiento. */
export function aSAN(pos: PosAjedrez, m: MovAjedrez): string {
    const pieza = Math.abs(pos.t[m.de]);
    let s: string;
    if (m.enroque) {
        s = m.enroque === 1 ? "O-O" : "O-O-O";
    } else if (pieza === PEON) {
        s = m.captura ? `${ARCHIVOS[m.de & 7]}x${nombreCasilla(m.a)}` : nombreCasilla(m.a);
        if (m.promo) s += `=${LETRA_ES[m.promo]}`;
    } else {
        s = LETRA_ES[pieza];
        const otros = movimientosLegales(pos).filter(
            (o) => o.a === m.a && o.de !== m.de && Math.abs(pos.t[o.de]) === pieza,
        );
        if (otros.length > 0) {
            const mismaColumna = otros.some((o) => (o.de & 7) === (m.de & 7));
            const mismaFila = otros.some((o) => (o.de >> 3) === (m.de >> 3));
            if (!mismaColumna) s += ARCHIVOS[m.de & 7];
            else if (!mismaFila) s += String((m.de >> 3) + 1);
            else s += nombreCasilla(m.de);
        }
        if (m.captura) s += "x";
        s += nombreCasilla(m.a);
    }
    const despues = siguiente(pos, m, false);
    if (enJaque(despues)) s += movimientosLegales(despues).length === 0 ? "#" : "+";
    return s;
}

// ───────────────────────────── Perft ─────────────────────────────

/** Cuenta los nodos hoja a profundidad `profundidad`. Sirve para validar el generador de movimientos. */
export function perft(pos: EntradaLegal & Partial<PosAjedrez>, profundidad: number): number {
    if (profundidad <= 0) return 1;
    const legales = movimientosLegales(pos);
    if (profundidad === 1) return legales.length;
    let nodos = 0;
    const completa: PosAjedrez = {
        t: pos.t,
        turno: pos.turno,
        enroque: pos.enroque,
        alPaso: pos.alPaso,
        medio: pos.medio ?? 0,
        num: pos.num ?? 1,
        rep: [],
    };
    for (const m of legales) nodos += perft(siguiente(completa, m, false), profundidad - 1);
    return nodos;
}
