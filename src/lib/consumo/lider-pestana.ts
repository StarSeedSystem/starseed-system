/**
 * Pestaña líder (contrato «consumo», 2026-09-29).
 *
 * Con el OS abierto en Chrome, en la ventana de Genesis y en el panel del navegador de Claude, cada
 * pestaña repetía los mismos sondeos de fondo: tres veces el tráfico por la misma información.
 * Solo UNA pestaña por navegador —la líder— hace sondeos de fondo; las demás esperan su turno.
 *
 * Elección: `navigator.locks` (un cerrojo de origen que el navegador pasa a la siguiente pestaña
 * al cerrarse la líder). Donde no existe (contexto no seguro, navegadores viejos), latidos por
 * BroadcastChannel: la líder late cada 2 s; si nadie late en 5 s, se reclama el puesto y, en caso
 * de empate, gana el identificador menor. Sin ventana (SSR/Node) o sin ningún medio de
 * coordinación, cada contexto es su propio líder.
 *
 * Ojo: al arrancar, el cerrojo tarda unos milisegundos; `esLider()` puede ser false al principio.
 * Quien arranque sondeos debe escuchar `alCambiarLider` (o usar `useEsLider`).
 */
import { useSyncExternalStore } from "react";
import type { CanalConsumo } from "./guardian";

export const NOMBRE_CERROJO_LIDER = "starseed-consumo-lider";
export const CANAL_LIDER = "starseed-consumo-lider";
export const LATIDO_MS = 2_000;
export const CADUCA_MS = 5_000;
export const ESPERA_RECLAMO_MS = 300;
const ESPERA_INICIAL_MS = 600;

export interface CerrojosLike {
    request(nombre: string, opciones: { mode: "exclusive" }, cb: () => Promise<void>): Promise<unknown>;
}

export interface OpcionesLider {
    cerrojos?: CerrojosLike | null;
    crearCanal?: ((nombre: string) => CanalConsumo | null) | null;
    ahora?: () => number;
    id?: string;
}

export interface Lider {
    esLider(): boolean;
    /** Llama `cb(lider)` en cada cambio. Devuelve la función para dejar de escuchar. */
    alCambiar(cb: (lider: boolean) => void): () => void;
    /** Suelta el puesto y los temporizadores (al cerrar la pestaña, o en pruebas). */
    soltar(): void;
}

type Mensaje = { t: "latido" | "reclamo" | "quien" | "adios"; id: string };

function idAleatorio(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function crearLider(op: OpcionesLider = {}): Lider {
    const ahora = op.ahora ?? (() => Date.now());
    const miId = op.id ?? idAleatorio();
    const oyentes = new Set<(lider: boolean) => void>();
    let lider = false;
    let cerrado = false;

    function fijar(nuevo: boolean): void {
        if (lider === nuevo || (cerrado && nuevo)) return;
        lider = nuevo;
        for (const o of Array.from(oyentes)) {
            try {
                o(lider);
            } catch {
                /* un oyente roto no para a los demás */
            }
        }
    }

    // ── Modo cerrojo ──
    let soltarCerrojo: (() => void) | null = null;
    // ── Modo latidos ──
    let canal: CanalConsumo | null = null;
    let intervalo: ReturnType<typeof setInterval> | null = null;
    let temporizadorReclamo: ReturnType<typeof setTimeout> | null = null;
    let temporizadorInicial: ReturnType<typeof setTimeout> | null = null;
    let ultimoLatido = 0;
    let liderConocido: string | null = null;
    let candidato = false;

    function enviar(t: Mensaje["t"]): void {
        try {
            canal?.postMessage({ t, id: miId } satisfies Mensaje);
        } catch {
            /* canal cerrado */
        }
    }

    function reclamar(): void {
        if (candidato || lider || cerrado) return;
        candidato = true;
        enviar("reclamo");
        temporizadorReclamo = setTimeout(() => {
            temporizadorReclamo = null;
            if (!candidato || cerrado) return;
            candidato = false;
            fijar(true);
            enviar("latido");
        }, ESPERA_RECLAMO_MS);
    }

    function revisar(): void {
        if (cerrado) return;
        if (lider) enviar("latido");
        else if (ahora() - ultimoLatido > CADUCA_MS) reclamar();
    }

    function alMensaje(ev: { data: unknown }): void {
        const m = ev?.data as Partial<Mensaje> | null;
        if (!m || typeof m !== "object" || typeof m.id !== "string" || m.id === miId) return;
        switch (m.t) {
            case "latido":
                if (lider) {
                    if (m.id < miId) fijar(false); // dos líderes: gana el id menor
                    else {
                        enviar("latido");
                        return;
                    }
                }
                candidato = false;
                liderConocido = m.id;
                ultimoLatido = ahora();
                return;
            case "reclamo":
                if (lider) enviar("latido");
                else if (candidato && m.id < miId) candidato = false;
                return;
            case "quien":
                if (lider) enviar("latido");
                return;
            case "adios":
                if (m.id === liderConocido) {
                    liderConocido = null;
                    ultimoLatido = 0;
                    reclamar();
                }
                return;
            default:
                return;
        }
    }

    function iniciarLatidos(): boolean {
        try {
            canal = op.crearCanal ? op.crearCanal(CANAL_LIDER) : null;
        } catch {
            canal = null;
        }
        if (!canal) return false;
        canal.onmessage = alMensaje;
        enviar("quien");
        temporizadorInicial = setTimeout(() => {
            temporizadorInicial = null;
            revisar();
        }, ESPERA_INICIAL_MS);
        intervalo = setInterval(revisar, LATIDO_MS);
        return true;
    }

    function iniciarCerrojo(): boolean {
        const cerrojos = op.cerrojos;
        if (!cerrojos || typeof cerrojos.request !== "function") return false;
        try {
            const pedido = cerrojos.request(NOMBRE_CERROJO_LIDER, { mode: "exclusive" }, () =>
                new Promise<void>((liberar) => {
                    if (cerrado) {
                        liberar();
                        return;
                    }
                    soltarCerrojo = () => {
                        soltarCerrojo = null;
                        liberar();
                    };
                    fijar(true);
                }),
            );
            Promise.resolve(pedido).catch(() => {
                // El navegador negó el cerrojo (p. ej. contexto no seguro): latidos.
                if (!cerrado && !lider && !canal && !iniciarLatidos()) fijar(true);
            });
            return true;
        } catch {
            return false;
        }
    }

    if (!iniciarCerrojo() && !iniciarLatidos()) {
        // Sin medio de coordinación: esta pestaña es su propia líder.
        lider = true;
    }

    return {
        esLider: () => lider,
        alCambiar(cb) {
            oyentes.add(cb);
            return () => {
                oyentes.delete(cb);
            };
        },
        soltar() {
            if (cerrado) return;
            const eraLider = lider;
            if (eraLider && canal) enviar("adios");
            cerrado = true;
            candidato = false;
            for (const t of [temporizadorReclamo, temporizadorInicial]) if (t) clearTimeout(t);
            if (intervalo) clearInterval(intervalo);
            temporizadorReclamo = temporizadorInicial = null;
            intervalo = null;
            soltarCerrojo?.();
            try {
                canal?.close();
            } catch {
                /* ya cerrado */
            }
            canal = null;
            fijar(false);
            oyentes.clear();
        },
    };
}

// ── Instancia de la pestaña ─────────────────────────────────────────────────────────────────
let liderPestana: Lider | null = null;

function liderActual(): Lider | null {
    if (liderPestana) return liderPestana;
    if (typeof window === "undefined") return null;
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: CerrojosLike }) : null;
    liderPestana = crearLider({
        cerrojos: nav?.locks ?? null,
        crearCanal: (nombre) => (typeof BroadcastChannel === "function" ? (new BroadcastChannel(nombre) as unknown as CanalConsumo) : null),
    });
    try {
        window.addEventListener("pagehide", (e) => {
            // Si la página va a la caché de atrás/adelante no la soltamos: puede volver.
            if (!(e as PageTransitionEvent).persisted) liderPestana?.soltar();
        });
    } catch {
        /* sin eventos de página */
    }
    return liderPestana;
}

/** ¿Es esta pestaña la que hace los sondeos de fondo? Sin ventana (SSR/Node): true. */
export function esLider(): boolean {
    const l = liderActual();
    return l ? l.esLider() : true;
}

/** Avisa en cada cambio de liderazgo de esta pestaña. */
export function alCambiarLider(cb: (lider: boolean) => void): () => void {
    const l = liderActual();
    return l ? l.alCambiar(cb) : () => undefined;
}

function suscribirLider(oyente: () => void): () => void {
    return alCambiarLider(() => oyente());
}

function liderServidor(): boolean {
    return false;
}

/** Hook: true solo en la pestaña líder (false durante el render de servidor). */
export function useEsLider(): boolean {
    return useSyncExternalStore(suscribirLider, esLider, liderServidor);
}
