/**
 * Control entre mis neuronas · UNA sesión por neurona controlada, compartida por quien la use en ESTE aparato
 * (CTL1117A · S1/S2/S4).
 *
 * Antes cada uso (la ventana de control, el banco de llamadas, un reintento) mandaba su propio `abrir-sesion` y su
 * propio `cerrar-sesion`: dos aperturas en vuelo a la vez (el aparato rechazaba la segunda), y al cerrarse la ventana
 * vieja se cerraba la sesión de la nueva. Aquí:
 *   · una sola apertura en vuelo por neurona: quien llega mientras otra abre espera ESA respuesta (no manda otra);
 *   · una sesión viva y usada hace poco se reutiliza (el aparato ya trata abrir de nuevo como la misma sesión);
 *   · cada quien que abre «toma» la sesión y la «suelta» al terminar; `cerrar-sesion` solo sale cuando suelta el
 *     último. Los usuarios «débiles» (el banco de llamadas) la reutilizan pero no impiden que se cierre.
 *
 * Nada aquí concede nada ni firma nada: solo decide CUÁNDO se manda una orden que de todos modos pasa por la puerta
 * del aparato controlado, que sigue decidiendo.
 */

import type { Args } from "./niveles";

type Nivel = "ver" | "controlar";
import { rangoNivel } from "./niveles";
import type { RespuestaOrden } from "./orden";
import { MOTIVOS_TERMINALES } from "./palabras";

/** Cómo se manda una orden a la neurona de este registro (la firma y el canal los pone quien lo construye). */
export type MandarSesion = (nombre: string, args: Args, o: { nivel: Nivel; sesion?: string | null; esperaMs?: number }) => Promise<RespuestaOrden>;

/** Una sesión que no se ha usado en este tiempo ya no se da por viva (el aparato la cierra a los 2 min sin órdenes). */
export const REUSO_MAX_MS = 75_000;

interface Viva {
    token: string;
    nivel: Nivel;
    ultima: number;
    fuertes: number;
}

export interface SesionSaliente {
    para: string;
    token: string;
    nivel: Nivel;
    ultima: number;
    fuertes: number;
}

export interface OpcionesAbrir {
    nivel?: Nivel;
    /** Manda otra `abrir-sesion` aunque haya una viva (el aparato la trata como la misma si lo es). Tras un «sin-sesion». */
    forzar?: boolean;
    /** Si el aparato dice «nivel», reintenta con «ver» (la ventana de pantalla sí lo quiere). */
    bajarSiNivel?: boolean;
    /** No cuenta como dueño: reutiliza la sesión pero no impide que la cierre quien sí lo es. */
    debil?: boolean;
    /** Lo pide un reintento automático (no una persona): tras un rechazo terminal espera con retroceso en vez de insistir. */
    auto?: boolean;
}

/** CTL1117A · S3: tras un rechazo terminal no se vuelve a pedir solo hasta pasado esto (30 s, el doble cada vez, tope 5 min). */
export const ESPERA_TERMINAL_MS = 30_000;
export const ESPERA_TERMINAL_MAX_MS = 5 * 60_000;

function resultadoDe(v: Viva): RespuestaOrden {
    return { tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: v.token, nivel: v.nivel, reutilizada: true } };
}

/** Motivos transitorios de transporte que admiten un reintento automático único al abrir sesión. */
const MOTIVOS_TRANSPORTE_REINTENTABLES = new Set(["sin-respuesta", "sin-enlace", "tiempo-agotado"]);

export class RegistroSesiones {
    private vivas = new Map<string, Viva>();
    private abriendo = new Map<string, Promise<RespuestaOrden>>();
    private terminal = new Map<string, { motivo: string; hasta: number; n: number }>();
    private oyentes = new Set<() => void>();
    private instantanea: readonly SesionSaliente[] = [];

    constructor(
        private readonly ahora: () => number = () => Date.now(),
        private readonly esperar: (ms: number) => Promise<void> = (ms) => new Promise((res) => setTimeout(res, ms)),
    ) {}

    private avisar(): void {
        this.instantanea = [...this.vivas.entries()].map(([para, v]) => ({
            para,
            token: v.token,
            nivel: v.nivel,
            ultima: v.ultima,
            fuertes: v.fuertes,
        }));
        for (const f of this.oyentes) {
            try {
                f();
            } catch {
                /* un oyente que falla no rompe el registro */
            }
        }
    }

    /** Se suscribe a los cambios en las sesiones salientes activas. */
    suscribir(cb: () => void): () => void {
        this.oyentes.add(cb);
        return () => void this.oyentes.delete(cb);
    }

    /** Instantánea estable de sesiones salientes activas hacia otras neuronas. */
    sesionesSalientes(): readonly SesionSaliente[] {
        return this.instantanea;
    }

    /**
     * CTL1118F: UN carril de órdenes por neurona para todos los que comparten esta sesión (ventana, banco…). Cada destino firmaba y mandaba por el
     * suyo: dos carriles reservaban `seq` seguidos y los mandaban por caminos distintos (canal de datos y canal de control); el que llegaba antes
     * dejaba `repetida` al otro. El carril es una cola de promesas: `cola` es el final de lo ya puesto en ella.
     */
    private carriles = new Map<string, { cola: Promise<unknown> }>();
    carrilDe(para: string): { cola: Promise<unknown> } {
        const k = para.toLowerCase();
        let c = this.carriles.get(k);
        if (!c) {
            c = { cola: Promise.resolve() };
            this.carriles.set(k, c);
        }
        return c;
    }

    /** El token de la sesión viva de esa neurona, si lo hay (para pruebas y para la ventana). */
    tokenDe(para: string): string | null {
        return this.vivas.get(para.toLowerCase())?.token ?? null;
    }

    /**
     * CTL1117E: la sesión viva MÁS NUEVA que `usada` (la que la ventana intentó y el aparato dio por caducada): si hay una apertura en
     * vuelo la espera (acaba en décimas de segundo) y devuelve el token vigente si es distinto del usado; si no, null.
     */
    async masNuevaQue(para: string, usada: string | null): Promise<string | null> {
        const k = para.toLowerCase();
        const en = this.abriendo.get(k);
        if (en) await en.catch(() => undefined);
        const t = this.tokenDe(para);
        return t && t !== usada ? t : null;
    }

    /** Alguien acaba de usar la sesión con éxito: sigue viva (el aparato cuenta su propia inactividad desde ahí). */
    usada(para: string): void {
        const v = this.vivas.get(para.toLowerCase());
        if (v) v.ultima = this.ahora();
    }

    /** El aparato dijo que esa sesión ya no existe (sin-sesion, caducada, parada): se olvida para no reutilizarla. */
    olvidar(para: string, token?: string | null): void {
        const k = para.toLowerCase();
        const v = this.vivas.get(k);
        if (v && (!token || v.token === token)) {
            this.vivas.delete(k);
            this.avisar();
        }
    }

    /** Algo cambió (p. ej. el dueño aceptó a este aparato): la espera por un rechazo terminal ya no vale. */
    liberar(para: string): void {
        this.terminal.delete(para.toLowerCase());
    }

    /** Hasta cuándo no se pide otra vez (ms epoch) y por qué; null si se puede pedir. */
    enEspera(para: string): { motivo: string; hasta: number } | null {
        const e = this.terminal.get(para.toLowerCase());
        return e && e.hasta > this.ahora() ? { motivo: e.motivo, hasta: e.hasta } : null;
    }

    /**
     * Abre (o reutiliza) la sesión hacia `para`. Devuelve la respuesta del aparato (o una `ok` sintética si se reutilizó).
     * Quien recibe `ok` la ha «tomado» y debe llamar a `soltar` cuando acabe.
     */
    async abrir(para: string, mandar: MandarSesion, o: OpcionesAbrir = {}): Promise<RespuestaOrden> {
        const k = para.toLowerCase();
        const nivel: Nivel = o.nivel ?? "controlar";
        const v = this.vivas.get(k);
        const espera = this.terminal.get(k);
        if (o.auto && espera && espera.hasta > this.ahora()) {
            return { tipo: "respuesta", nonce: "", ok: false, motivo: espera.motivo, resultado: { espera: espera.hasta - this.ahora() } };
        }
        if (!o.forzar && v && this.ahora() - v.ultima < REUSO_MAX_MS && rangoNivel(v.nivel) >= rangoNivel(nivel)) {
            if (!o.debil) {
                v.fuertes += 1;
                this.avisar();
            }
            return resultadoDe(v);
        }
        const en = this.abriendo.get(k);
        if (en) {
            const r = await en; // la apertura en vuelo de otro: se espera ESA respuesta, no se manda otra
            if (!r.ok) return r;
            const w = this.vivas.get(k);
            if (w && rangoNivel(w.nivel) >= rangoNivel(nivel)) {
                if (!o.debil) {
                    w.fuertes += 1;
                    this.avisar();
                }
                return resultadoDe(w);
            }
            // Abrió con menos nivel del que éste pide: se abre de nuevo (ya sin otra en vuelo).
            return this.abrir(para, mandar, { ...o, forzar: true });
        }
        const p = (async (): Promise<RespuestaOrden> => {
            let r = await mandar("abrir-sesion", {}, { nivel });
            if (!r.ok && MOTIVOS_TRANSPORTE_REINTENTABLES.has(r.motivo)) {
                await this.esperar(450);
                r = await mandar("abrir-sesion", {}, { nivel });
            }
            if (!r.ok && r.motivo === "nivel" && o.bajarSiNivel && nivel === "controlar") {
                r = await mandar("abrir-sesion", {}, { nivel: "ver" });
                if (!r.ok && MOTIVOS_TRANSPORTE_REINTENTABLES.has(r.motivo)) {
                    await this.esperar(450);
                    r = await mandar("abrir-sesion", {}, { nivel: "ver" });
                }
            }
            const s = r.resultado as { sesion?: string; nivel?: string } | undefined;
            if (r.ok && typeof s?.sesion === "string") {
                const previo = this.vivas.get(k);
                const mismo = previo?.token === s.sesion;
                this.vivas.set(k, { token: s.sesion, nivel: s.nivel === "controlar" ? "controlar" : "ver", ultima: this.ahora(), fuertes: mismo ? previo.fuertes : 0 });
                this.terminal.delete(k);
                this.avisar();
            } else if (!r.ok) {
                const borrada = this.vivas.delete(k);
                if (MOTIVOS_TERMINALES.has(r.motivo)) {
                    const n = (this.terminal.get(k)?.n ?? 0) + 1;
                    this.terminal.set(k, { motivo: r.motivo, n, hasta: this.ahora() + Math.min(ESPERA_TERMINAL_MAX_MS, ESPERA_TERMINAL_MS * 2 ** (n - 1)) });
                }
                if (borrada) this.avisar();
            }
            return r;
        })();
        this.abriendo.set(k, p);
        try {
            const r = await p;
            const w = this.vivas.get(k);
            if (r.ok && w && !o.debil) {
                w.fuertes += 1;
                this.avisar();
            }
            return r;
        } finally {
            if (this.abriendo.get(k) === p) this.abriendo.delete(k);
        }
    }

    /**
     * Quien tomó la sesión la suelta. Si era el último dueño, manda `cerrar-sesion` (con ESE token: el aparato comprueba
     * que es la suya). `fuerte=false`: un usuario débil; solo cierra si no queda ningún dueño.
     */
    async soltar(para: string, token: string | null, mandar: MandarSesion, fuerte = true): Promise<void> {
        const k = para.toLowerCase();
        const v = this.vivas.get(k);
        if (!token) return;
        if (!v || v.token !== token) {
            // Otra sesión más nueva ocupa el sitio (o ya se olvidó): lo que cierra este token es suyo y nada más.
            return void (await mandar("cerrar-sesion", {}, { nivel: "ver", sesion: token, esperaMs: 3000 }).catch(() => undefined));
        }
        if (fuerte && v.fuertes > 0) v.fuertes -= 1;
        if (v.fuertes > 0) {
            this.avisar();
            return; // alguien más la sigue usando
        }
        if (!fuerte && this.abriendo.has(k)) return;
        this.vivas.delete(k);
        this.avisar();
        await mandar("cerrar-sesion", {}, { nivel: "ver", sesion: token, esperaMs: 3000 }).catch(() => undefined);
    }

    /**
     * CTL1124B · Termina directamente una sesión saliente hacia `para` (aunque `fuertes > 1`) parando su pantalla
     * y mandando `cerrar-sesion`, sin revocar ningún permiso.
     */
    async terminar(para: string, mandar: MandarSesion): Promise<boolean> {
        const k = para.toLowerCase();
        const v = this.vivas.get(k);
        if (!v) return false;
        this.vivas.delete(k);
        this.avisar();
        await mandar("pantalla-parar", {}, { nivel: "ver", sesion: v.token, esperaMs: 2500 }).catch(() => undefined);
        await mandar("cerrar-sesion", {}, { nivel: v.nivel, sesion: v.token, esperaMs: 4000 }).catch(() => undefined);
        return true;
    }
}

/** El registro de la app (un aparato, una sesión por neurona). */
export const registroGlobal = new RegistroSesiones();
