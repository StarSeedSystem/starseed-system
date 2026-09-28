/**
 * Dibujo-adivina COOPERATIVO — reglas puras del diario.
 *
 * Una persona dibuja en un lienzo que ven todas; las demás adivinan en un chat lateral. Cada
 * persona dibuja `vueltas` veces (por defecto una), por turnos según su asiento. Todas suman al
 * marcador del grupo: quien acierta gana puntos según lo rápido que fue, quien dibuja gana puntos
 * por cada acierto, y si aciertan todas hay un bonus para todo el grupo.
 *
 * Cómo se mantiene la palabra en secreto sin servidor: el dibujante publica un COMPROMISO
 * (hash de la palabra con una sal) al empezar, hace de árbitro de su ronda (compara los intentos
 * con la palabra y avisa de los aciertos) y al terminar REVELA la palabra y la sal; cualquiera
 * comprueba que coinciden con el compromiso. Si no coinciden, o el dibujante desaparece, la ronda
 * se anula. Es un juego entre personas de confianza: no pretende ser a prueba de trampas — el
 * dibujante es el árbitro de su ronda — y así se dice en la interfaz.
 *
 * Los trazos NO van en el diario (son efímeros y numerosos): viajan por difusión y se guardan
 * como una instantánea aparte. Aquí solo está el ritmo de la partida.
 *
 * Entradas:
 *   · `elegir`  → `{ c: <compromiso hex>, l?: <letras> }` (dibujante, en fase «eligiendo»; `l` es la
 *                 pista de cuántas letras tiene la palabra: si al revelar no cuadra, la ronda se anula)
 *   · `acierto` → `{ s: <asiento> }`          (dibujante: avisa de quién acertó)
 *   · `revelar` → `{ p: <palabra>, s: <sal> }` (dibujante: cierra la ronda)
 *   · `saltar`  → `{}`                        (cualquiera, pasado el plazo: anula la ronda)
 *   · `siguiente` → `{}`                      (cualquiera, tras revelar: pasa a la siguiente ronda)
 * `empezar` y `sentar` los pone la mesa.
 */
import { normalizarPalabra } from "./palabras";
import { sha256Hex } from "./sha256";
import type { Datos, Entrada, Fin, JuegoDeMesa, ResultadoJuego } from "./tipos";

export type FaseDibujo = "espera" | "eligiendo" | "dibujando" | "revelada" | "fin";

export interface AciertoDibujo {
    seat: number;
    t: number;
    puntos: number;
}

export interface RondaDibujo {
    dibujante: number;
    palabra: string | null;
    aciertos: number;
    anulada: boolean;
}

export interface TableroDibujo {
    fase: FaseDibujo;
    /** Ronda actual (0…totalRondas-1). */
    ronda: number;
    totalRondas: number;
    /** Asiento que dibuja ahora. */
    dibujante: number | null;
    /** Compromiso (hash) de la palabra de esta ronda. */
    commit: string | null;
    /** Pista pública: cuántas letras tiene la palabra (sin espacios ni signos), o null. */
    largo: number | null;
    /** Cuándo empezó la fase actual (ms, reloj del que la provocó). */
    desde: number;
    /** Plazo para adivinar (ms). */
    hasta: number | null;
    duracionMs: number;
    aciertos: AciertoDibujo[];
    /** La palabra, solo cuando la ronda se revela. */
    palabra: string | null;
    anulada: boolean;
    /** Puntos acumulados por asiento. */
    puntos: number[];
    /** Puntos que ha dado la ronda en curso (para poder anularla). */
    delta: number[];
    rondas: RondaDibujo[];
    /** Asientos que participan, en orden de dibujo. */
    orden: number[];
    vueltas: number;
}

export const SEGUNDOS_POR_DEFECTO = 75;
export const ESPERA_ELEGIR_MS = 30_000;
export const ESPERA_SALTAR_MS = 8_000;
export const GRACIA_ACIERTO_MS = 2_000;
export const BONUS_TODOS = 2;
export const PUNTOS_DIBUJANTE = 2;

/** 5 a 10 puntos según lo pronto que se acierta. Determinista: solo depende de los tiempos. */
export function puntosPorAcierto(restanteMs: number, duracionMs: number): number {
    if (duracionMs <= 0) return 5;
    const r = Math.max(0, Math.min(duracionMs, restanteMs));
    return 5 + Math.floor((5 * r) / duracionMs);
}

/** Compromiso de una palabra: hash de `sal:palabraNormalizada`. */
export function compromisoDePalabra(palabra: string, sal: string): string {
    return sha256Hex(`${sal}:${normalizarPalabra(palabra)}`);
}

export function tableroDibujoInicial(opciones: Datos = {}): TableroDibujo {
    const segundos = typeof opciones.segundos === "number" ? Math.max(20, Math.min(180, Math.round(opciones.segundos))) : SEGUNDOS_POR_DEFECTO;
    const vueltas = typeof opciones.vueltas === "number" ? Math.max(1, Math.min(3, Math.round(opciones.vueltas))) : 1;
    return {
        fase: "espera",
        ronda: 0,
        totalRondas: 0,
        dibujante: null,
        commit: null,
        largo: null,
        desde: 0,
        hasta: null,
        duracionMs: segundos * 1000,
        aciertos: [],
        palabra: null,
        anulada: false,
        puntos: [],
        delta: [],
        rondas: [],
        orden: [],
        vueltas,
    };
}

function largoValido(v: unknown): number | null {
    return typeof v === "number" && Number.isInteger(v) && v >= 2 && v <= 40 ? v : null;
}

function sumar(v: number[], seat: number, n: number): number[] {
    const out = v.slice();
    out[seat] = (out[seat] ?? 0) + n;
    return out;
}

function ganadorPorPuntos(puntos: number[], orden: number[]): number | null {
    let mejor = -1;
    let ganador: number | null = null;
    let empate = false;
    for (const seat of orden) {
        const p = puntos[seat] ?? 0;
        if (p > mejor) {
            mejor = p;
            ganador = seat;
            empate = false;
        } else if (p === mejor) {
            empate = true;
        }
    }
    return empate ? null : ganador;
}

export const juegoDibujo: JuegoDeMesa<TableroDibujo> = {
    id: "dibujo",
    nombre: "Dibujo-adivina",
    jugadores: { min: 2, max: 8 },
    autoInicio: false,
    inicial(opciones) {
        return tableroDibujoInicial(opciones);
    },
    alEmpezar(t, ocupados, ahora) {
        const orden = ocupados.slice();
        const cuantos = (orden.length > 0 ? Math.max(...orden) : -1) + 1;
        return {
            ...t,
            fase: "eligiendo",
            ronda: 0,
            totalRondas: orden.length * t.vueltas,
            dibujante: orden[0] ?? null,
            orden,
            puntos: Array.from({ length: cuantos }, () => 0),
            delta: Array.from({ length: cuantos }, () => 0),
            desde: ahora,
        };
    },
    turno(t) {
        return t.fase === "eligiendo" || t.fase === "dibujando" ? t.dibujante : null;
    },
    aplicar(t, entrada: Entrada, ctx): ResultadoJuego<TableroDibujo> {
        const mios = ctx.asientosDe(entrada.u);
        if (mios.length === 0) return { ok: false, motivo: "Solo quien participa puede hacer esto." };
        const esDibujante = t.dibujante !== null && mios.includes(t.dibujante);

        switch (entrada.k) {
            case "elegir": {
                if (t.fase !== "eligiendo") return { ok: false, motivo: "Ahora no se elige palabra." };
                if (!esDibujante) return { ok: false, motivo: "Elige la palabra quien dibuja." };
                const c = entrada.d?.c;
                if (typeof c !== "string" || !/^[0-9a-f]{64}$/.test(c)) return { ok: false, motivo: "Compromiso no válido." };
                return {
                    ok: true,
                    tablero: {
                        ...t,
                        fase: "dibujando",
                        commit: c,
                        largo: largoValido(entrada.d?.l),
                        desde: entrada.t,
                        hasta: entrada.t + t.duracionMs,
                        aciertos: [],
                        palabra: null,
                        anulada: false,
                        delta: t.puntos.map(() => 0),
                    },
                    fin: null,
                };
            }
            case "acierto": {
                if (t.fase !== "dibujando" || t.hasta === null) return { ok: false, motivo: "No hay ronda en curso." };
                if (!esDibujante) return { ok: false, motivo: "Los aciertos los anota quien dibuja." };
                const s = entrada.d?.s;
                if (typeof s !== "number" || !Number.isInteger(s)) return { ok: false, motivo: "Asiento no válido." };
                if (s === t.dibujante || !t.orden.includes(s) || !ctx.asientos[s]) {
                    return { ok: false, motivo: "Ese asiento no puede acertar." };
                }
                if (t.aciertos.some((a) => a.seat === s)) return { ok: false, motivo: "Ya había acertado." };
                if (entrada.t > t.hasta + GRACIA_ACIERTO_MS) return { ok: false, motivo: "Se acabó el tiempo." };
                const puntos = puntosPorAcierto(t.hasta - entrada.t, t.duracionMs);
                const aciertos = [...t.aciertos, { seat: s, t: entrada.t, puntos }];
                let acum = sumar(t.puntos, s, puntos);
                let delta = sumar(t.delta, s, puntos);
                acum = sumar(acum, t.dibujante as number, PUNTOS_DIBUJANTE);
                delta = sumar(delta, t.dibujante as number, PUNTOS_DIBUJANTE);
                const adivinadores = t.orden.length - 1;
                if (adivinadores >= 2 && aciertos.length === adivinadores) {
                    for (const seat of t.orden) {
                        acum = sumar(acum, seat, BONUS_TODOS);
                        delta = sumar(delta, seat, BONUS_TODOS);
                    }
                }
                return { ok: true, tablero: { ...t, aciertos, puntos: acum, delta }, fin: null };
            }
            case "revelar": {
                if (t.fase !== "dibujando" || t.commit === null) return { ok: false, motivo: "No hay ronda que revelar." };
                if (!esDibujante) return { ok: false, motivo: "La palabra la revela quien dibuja." };
                const p = entrada.d?.p;
                const sal = entrada.d?.s;
                if (typeof p !== "string" || typeof sal !== "string" || p.length === 0 || p.length > 60 || sal.length > 64) {
                    return { ok: false, motivo: "Palabra no válida." };
                }
                const honesta =
                    compromisoDePalabra(p, sal) === t.commit && (t.largo === null || normalizarPalabra(p).length === t.largo);
                return {
                    ok: true,
                    tablero: cerrarRonda(t, honesta ? p : null, !honesta, entrada.t),
                    fin: null,
                };
            }
            case "saltar": {
                if (t.fase === "eligiendo") {
                    if (entrada.t < t.desde + ESPERA_ELEGIR_MS) return { ok: false, motivo: "Aún hay tiempo para elegir." };
                } else if (t.fase === "dibujando" && t.hasta !== null) {
                    if (entrada.t < t.hasta + ESPERA_SALTAR_MS) return { ok: false, motivo: "Aún no ha pasado el plazo." };
                } else {
                    return { ok: false, motivo: "No hay ronda que saltar." };
                }
                return { ok: true, tablero: cerrarRonda(t, null, true, entrada.t), fin: null };
            }
            case "siguiente": {
                if (t.fase !== "revelada") return { ok: false, motivo: "La ronda aún no ha terminado." };
                const ronda = t.ronda + 1;
                if (ronda >= t.totalRondas) {
                    const fin: Fin = {
                        tipo: "terminada",
                        ganador: ganadorPorPuntos(t.puntos, t.orden),
                        motivo: "Fin de las rondas",
                    };
                    return { ok: true, tablero: { ...t, fase: "fin", dibujante: null, desde: entrada.t }, fin };
                }
                return {
                    ok: true,
                    tablero: {
                        ...t,
                        fase: "eligiendo",
                        ronda,
                        dibujante: t.orden[ronda % t.orden.length],
                        commit: null,
                        largo: null,
                        hasta: null,
                        aciertos: [],
                        palabra: null,
                        anulada: false,
                        delta: t.puntos.map(() => 0),
                        desde: entrada.t,
                    },
                    fin: null,
                };
            }
            default:
                return { ok: false, motivo: "Eso no se puede hacer en el Dibujo-adivina." };
        }
    },
};

/** Cierra la ronda: revela (o anula, devolviendo los puntos que dio) y guarda su resumen. */
function cerrarRonda(t: TableroDibujo, palabra: string | null, anulada: boolean, ahora: number): TableroDibujo {
    let puntos = t.puntos;
    if (anulada) puntos = t.puntos.map((p, i) => p - (t.delta[i] ?? 0));
    const ronda: RondaDibujo = {
        dibujante: t.dibujante ?? 0,
        palabra,
        aciertos: anulada ? 0 : t.aciertos.length,
        anulada,
    };
    return {
        ...t,
        fase: "revelada",
        palabra,
        anulada,
        puntos,
        delta: t.puntos.map(() => 0),
        rondas: [...t.rondas, ronda],
        desde: ahora,
    };
}

/** Puntos del grupo: la suma de todos los asientos. */
export function puntosDelGrupo(t: TableroDibujo): number {
    return t.puntos.reduce((a, b) => a + b, 0);
}
