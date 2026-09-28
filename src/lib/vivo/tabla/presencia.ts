/**
 * Presencia en un documento vivo (2026-09-28): quién está dentro y en qué celda.
 *
 * Usa PRESENCE de Supabase Realtime sobre UN canal por documento abierto (`tabla:<id>`): nada de
 * tablas ni sondeos. Cada pestaña anuncia `{ uid, nombre, color, fila, col, editando }`; el
 * movimiento entre celdas se agrupa (una actualización cada 250 ms como mucho) para no saturar
 * el canal. Si la pestaña se oculta se deja de anunciar y, pasado un minuto, se suelta el canal.
 *
 * El canal no es privado: la protección es el id (un uuid imposible de adivinar) y lo que viaja
 * es solo posición, nunca datos de la tabla.
 *
 * `getSnapshot()` devuelve la MISMA lista mientras nadie cambie (requisito de
 * `useSyncExternalStore`).
 */
import { createClient } from "@/utils/supabase/client";
import { RELOJ_REAL, type RelojMotor } from "./motor-colab";

export interface Presente {
    clave: string;
    uid: string;
    nombre: string;
    color: string;
    fila: string | null;
    col: string | null;
    editando: boolean;
}

export interface Posicion {
    fila: string | null;
    col: string | null;
    editando: boolean;
}

export interface YoPresencia {
    uid: string;
    nombre: string;
    color: string;
}

export interface CanalRealtime {
    on(tipo: "presence", filtro: { event: "sync" }, cb: () => void): CanalRealtime;
    subscribe(cb: (estado: string) => void): CanalRealtime;
    track(payload: Record<string, unknown>): Promise<unknown> | unknown;
    untrack(): Promise<unknown> | unknown;
    presenceState(): Record<string, unknown[]>;
}

export interface ClienteRealtime {
    channel(nombre: string, opciones?: { config?: { presence?: { key?: string } } }): CanalRealtime;
    removeChannel(canal: CanalRealtime): unknown;
}

export const COLORES_PERSONAS = ["#7C5CFF", "#007FFF", "#10B981", "#FFBF00", "#EC4899", "#14B8A6", "#F97316", "#DC143C"] as const;

/** Un color estable por cuenta (el mismo para todos los que la ven). */
export function colorDeUsuario(uid: string): string {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return COLORES_PERSONAS[h % COLORES_PERSONAS.length];
}

export function iniciales(nombre: string): string {
    const partes = nombre.trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "")).toUpperCase();
}

const SIN_PRESENTES: readonly Presente[] = Object.freeze([]);
const THROTTLE_MS = 250;
const SOLTAR_TRAS_MS = 60_000;

function aPresente(clave: string, m: unknown): Presente | null {
    if (!m || typeof m !== "object") return null;
    const o = m as Record<string, unknown>;
    if (typeof o.uid !== "string" || !o.uid) return null;
    const color = typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : colorDeUsuario(o.uid);
    return {
        clave,
        uid: o.uid,
        nombre: typeof o.nombre === "string" && o.nombre ? o.nombre.slice(0, 40) : "Alguien",
        color,
        fila: typeof o.fila === "string" ? o.fila : null,
        col: typeof o.col === "string" ? o.col : null,
        editando: o.editando === true,
    };
}

export class PresenciaViva {
    private snap: readonly Presente[] = SIN_PRESENTES;
    private firma = "[]";
    private oyentes = new Set<() => void>();
    private cliente: ClienteRealtime | null = null;
    private canal: CanalRealtime | null = null;
    private suscrito = false;
    private posicion: Posicion = { fila: null, col: null, editando: false };
    private ultimoTrack = 0;
    private timerTrack: unknown = null;
    private timerSoltar: unknown = null;
    private cerrado = false;
    private oculto = false;
    private readonly clave: string;
    private readonly reloj: RelojMotor;
    private readonly obtenerCliente: () => ClienteRealtime;

    constructor(
        private readonly nombreCanal: string,
        private readonly yo: YoPresencia,
        opc: { cliente?: () => ClienteRealtime; reloj?: RelojMotor; clave?: string } = {},
    ) {
        this.reloj = opc.reloj ?? RELOJ_REAL;
        this.clave = opc.clave ?? `t${Math.random().toString(36).slice(2, 9)}`;
        this.obtenerCliente = opc.cliente ?? (() => createClient() as unknown as ClienteRealtime);
    }

    subscribe = (cb: () => void): (() => void) => {
        this.oyentes.add(cb);
        return () => {
            this.oyentes.delete(cb);
        };
    };
    getSnapshot = (): readonly Presente[] => this.snap;
    getServerSnapshot = (): readonly Presente[] => SIN_PRESENTES;

    /** Abre el canal y anuncia a esta pestaña. */
    iniciar(): void {
        if (this.cerrado || this.canal) return;
        try {
            this.cliente = this.obtenerCliente();
            const canal = this.cliente.channel(this.nombreCanal, { config: { presence: { key: this.clave } } });
            this.canal = canal;
            canal.on("presence", { event: "sync" }, () => this.leer());
            canal.subscribe((estado) => {
                if (this.cerrado || this.canal !== canal) return;
                if (estado === "SUBSCRIBED") {
                    this.suscrito = true;
                    this.anunciarYa();
                } else if (estado === "CLOSED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
                    this.suscrito = false;
                }
            });
        } catch {
            this.canal = null;
            this.cliente = null;
        }
    }

    private leer(): void {
        if (!this.canal) return;
        let estado: Record<string, unknown[]> = {};
        try {
            estado = this.canal.presenceState();
        } catch {
            estado = {};
        }
        const lista: Presente[] = [];
        for (const [clave, metas] of Object.entries(estado)) {
            if (clave === this.clave) continue;
            const ultimo = Array.isArray(metas) ? metas[metas.length - 1] : null;
            const p = aPresente(clave, ultimo);
            if (p && p.uid !== this.yo.uid) lista.push(p);
        }
        lista.sort((a, b) => (a.clave < b.clave ? -1 : 1));
        const firma = JSON.stringify(lista);
        if (firma === this.firma) return;
        this.firma = firma;
        this.snap = lista.length ? lista : SIN_PRESENTES;
        for (const cb of [...this.oyentes]) {
            try {
                cb();
            } catch {
                /* un oyente roto no tumba al resto */
            }
        }
    }

    /** Dice dónde está esta persona (agrupado: como mucho una vez cada 250 ms). */
    anunciar(pos: Posicion): void {
        if (this.cerrado) return;
        if (pos.fila === this.posicion.fila && pos.col === this.posicion.col && pos.editando === this.posicion.editando) return;
        this.posicion = pos;
        if (!this.suscrito || this.oculto) return;
        const ahora = this.reloj.ahora();
        const espera = this.ultimoTrack + THROTTLE_MS - ahora;
        if (espera <= 0) {
            this.anunciarYa();
        } else if (this.timerTrack === null) {
            this.timerTrack = this.reloj.poner(() => {
                this.timerTrack = null;
                this.anunciarYa();
            }, espera);
        }
    }

    private anunciarYa(): void {
        if (!this.canal || !this.suscrito || this.cerrado || this.oculto) return;
        this.ultimoTrack = this.reloj.ahora();
        try {
            void Promise.resolve(
                this.canal.track({
                    uid: this.yo.uid,
                    nombre: this.yo.nombre,
                    color: this.yo.color,
                    fila: this.posicion.fila,
                    col: this.posicion.col,
                    editando: this.posicion.editando,
                }),
            ).catch(() => undefined);
        } catch {
            /* best-effort */
        }
    }

    /** Pestaña oculta: deja de anunciarse y, tras un minuto, suelta el canal. */
    ocultar(): void {
        if (this.cerrado || this.oculto) return;
        this.oculto = true;
        try {
            void Promise.resolve(this.canal?.untrack()).catch(() => undefined);
        } catch {
            /* nada */
        }
        this.timerSoltar = this.reloj.poner(() => {
            this.timerSoltar = null;
            if (this.oculto) this.soltar();
        }, SOLTAR_TRAS_MS);
    }

    /** Pestaña visible otra vez: vuelve a anunciarse (y reabre el canal si se había soltado). */
    mostrar(): void {
        if (this.cerrado || !this.oculto) return;
        this.oculto = false;
        if (this.timerSoltar !== null) {
            this.reloj.quitar(this.timerSoltar);
            this.timerSoltar = null;
        }
        if (!this.canal) this.iniciar();
        else this.anunciarYa();
    }

    private soltar(): void {
        if (this.timerTrack !== null) this.reloj.quitar(this.timerTrack);
        this.timerTrack = null;
        try {
            if (this.canal) this.cliente?.removeChannel(this.canal);
        } catch {
            /* nada */
        }
        this.canal = null;
        this.suscrito = false;
        if (this.snap.length) {
            this.snap = SIN_PRESENTES;
            this.firma = "[]";
            for (const cb of [...this.oyentes]) cb();
        }
    }

    destruir(): void {
        if (this.cerrado) return;
        if (this.timerSoltar !== null) this.reloj.quitar(this.timerSoltar);
        this.timerSoltar = null;
        this.soltar();
        this.cerrado = true;
        this.oyentes.clear();
    }
}
