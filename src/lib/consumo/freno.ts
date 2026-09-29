/**
 * Freno REMOTO del proyecto (contrato «consumo», 2026-09-29).
 *
 * El vigía diario de la Mac (G3) escribe la fila `public.os_freno` (id = 1) con la clave de servicio
 * cuando el proyecto pasa su presupuesto del día, y la apaga a las 00:00 UTC. Aquí solo se LEE:
 * una petición al arrancar y cada 10 min, y solo en la pestaña líder; el resultado se comparte con
 * las demás pestañas por BroadcastChannel y se guarda en localStorage (con la hora de lectura, para
 * que una recarga no vuelva a preguntar antes de tiempo).
 *
 * Con el freno activo, el guardián deja pasar solo escrituras y autenticación (ver guardian.ts) y
 * los sondeos de fondo se detienen (`frenoActivo()`, G2).
 *
 * Mientras la migración 20260929090000_os_freno.sql no esté aplicada, la lectura falla, el freno se
 * queda como estaba (inactivo) y se vuelve a probar a los 10 min: sin reintentos en bucle.
 */
import { useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";
import { alCambiarLider as alCambiarLiderPestana, esLider as esLiderPestana } from "./lider-pestana";
import { fijarFrenoRemoto, type AlmacenConsumo, type CanalConsumo } from "./guardian";

export const CLAVE_FRENO = "starseed.supabase.freno.v1";
export const CANAL_FRENO = "starseed-consumo";
export const FRENO_CADA_MS = 10 * 60_000;

export interface EstadoFreno {
    activo: boolean;
    motivo: string | null;
    hasta: string | null;
}

export interface FilaFreno {
    activo?: boolean | null;
    motivo?: string | null;
    hasta?: string | null;
    actualizado?: string | null;
}

export interface OpcionesFreno {
    /** Lee la fila; `null` = no se pudo leer (se conserva lo último conocido). */
    leerFila: () => Promise<FilaFreno | null>;
    esLider: () => boolean;
    alCambiarLider: (cb: (lider: boolean) => void) => () => void;
    crearCanal?: ((nombre: string) => CanalConsumo | null) | null;
    almacen?: AlmacenConsumo | null;
    ahora?: () => number;
    alCambiar?: (estado: EstadoFreno) => void;
}

export interface Freno {
    estado(): EstadoFreno;
    activo(): boolean;
    suscribir(oyente: () => void): () => void;
    iniciar(): void;
    detener(): void;
    /** Lectura inmediata (solo la usa el temporizador de la líder y las pruebas). */
    leerAhora(): Promise<void>;
}

export const FRENO_INACTIVO: EstadoFreno = Object.freeze({ activo: false, motivo: null, hasta: null });

interface Guardado {
    fila: FilaFreno | null;
    leidoEn: number;
}

function texto(x: unknown): string | null {
    return typeof x === "string" && x.trim() ? x.trim().slice(0, 280) : null;
}

function limpiarFila(x: unknown): FilaFreno | null {
    if (!x || typeof x !== "object") return null;
    const f = x as FilaFreno;
    return { activo: f.activo === true, motivo: texto(f.motivo), hasta: texto(f.hasta) };
}

export function crearFreno(op: OpcionesFreno): Freno {
    const ahora = op.ahora ?? (() => Date.now());
    const almacen = op.almacen ?? null;
    const oyentes = new Set<() => void>();

    let fila: FilaFreno | null = null;
    let leidoEn = 0;
    let estado: EstadoFreno = FRENO_INACTIVO;
    let iniciado = false;
    let leyendo = false;
    let canal: CanalConsumo | null = null;
    let temporizadorLectura: ReturnType<typeof setTimeout> | null = null;
    let temporizadorVence: ReturnType<typeof setTimeout> | null = null;
    let soltarLider: (() => void) | null = null;

    function recalcular(): void {
        if (temporizadorVence) {
            clearTimeout(temporizadorVence);
            temporizadorVence = null;
        }
        const t = ahora();
        const hastaMs = fila?.hasta ? Date.parse(fila.hasta) : NaN;
        const vigente = !!fila?.activo && (!Number.isFinite(hastaMs) || hastaMs > t);
        const nuevo: EstadoFreno = vigente
            ? { activo: true, motivo: fila?.motivo ?? null, hasta: fila?.hasta ?? null }
            : FRENO_INACTIVO;
        if (vigente && Number.isFinite(hastaMs)) {
            // Al vencer `hasta`, el freno se suelta solo aunque nadie vuelva a leer la fila.
            temporizadorVence = setTimeout(recalcular, Math.min(hastaMs - t + 50, 2 ** 31 - 1));
        }
        if (nuevo.activo === estado.activo && nuevo.motivo === estado.motivo && nuevo.hasta === estado.hasta) return;
        estado = nuevo.activo ? Object.freeze(nuevo) : FRENO_INACTIVO;
        try {
            op.alCambiar?.(estado);
        } catch {
            /* el guardián no debe tumbar el freno */
        }
        for (const o of Array.from(oyentes)) {
            try {
                o();
            } catch {
                /* un oyente roto no para a los demás */
            }
        }
    }

    function guardar(): void {
        try {
            almacen?.setItem(CLAVE_FRENO, JSON.stringify({ fila, leidoEn } satisfies Guardado));
        } catch {
            /* sin almacenamiento: vale con el canal */
        }
    }

    function programarLectura(): void {
        if (temporizadorLectura) clearTimeout(temporizadorLectura);
        temporizadorLectura = null;
        if (!iniciado || !op.esLider()) return;
        const espera = Math.max(0, leidoEn + FRENO_CADA_MS - ahora());
        temporizadorLectura = setTimeout(() => {
            temporizadorLectura = null;
            if (!iniciado || !op.esLider()) return;
            void leerAhora().then(programarLectura);
        }, espera);
    }

    async function leerAhora(): Promise<void> {
        if (leyendo) return;
        leyendo = true;
        try {
            let nueva: FilaFreno | null = null;
            try {
                nueva = limpiarFila(await op.leerFila());
            } catch {
                nueva = null;
            }
            leidoEn = ahora();
            if (nueva) fila = nueva;
            guardar();
            try {
                canal?.postMessage({ t: "freno", fila, leidoEn });
            } catch {
                /* canal cerrado */
            }
            recalcular();
        } finally {
            leyendo = false;
        }
    }

    return {
        estado: () => estado,
        activo: () => estado.activo,
        suscribir(oyente) {
            oyentes.add(oyente);
            return () => {
                oyentes.delete(oyente);
            };
        },
        iniciar() {
            if (iniciado) return;
            iniciado = true;
            try {
                const crudo = almacen?.getItem(CLAVE_FRENO);
                const g = crudo ? (JSON.parse(crudo) as Partial<Guardado>) : null;
                if (g) {
                    fila = limpiarFila(g.fila);
                    leidoEn = typeof g.leidoEn === "number" && g.leidoEn <= ahora() ? g.leidoEn : 0;
                }
            } catch {
                /* guardado ilegible: empezamos de cero */
            }
            try {
                canal = op.crearCanal ? op.crearCanal(CANAL_FRENO) : null;
            } catch {
                canal = null;
            }
            if (canal) {
                canal.onmessage = (ev) => {
                    const d = ev?.data as { t?: string; fila?: unknown; leidoEn?: unknown } | null;
                    if (!d || typeof d !== "object" || d.t !== "freno") return;
                    fila = limpiarFila(d.fila);
                    if (typeof d.leidoEn === "number") leidoEn = Math.max(leidoEn, d.leidoEn);
                    recalcular();
                    // Otra pestaña acaba de leer: la líder (si soy yo) espera sus 10 min desde ahí.
                    if (op.esLider()) programarLectura();
                };
            }
            recalcular();
            soltarLider = op.alCambiarLider((lider) => {
                if (lider) programarLectura();
                else if (temporizadorLectura) {
                    clearTimeout(temporizadorLectura);
                    temporizadorLectura = null;
                }
            });
            programarLectura();
        },
        detener() {
            iniciado = false;
            for (const t of [temporizadorLectura, temporizadorVence]) if (t) clearTimeout(t);
            temporizadorLectura = temporizadorVence = null;
            soltarLider?.();
            soltarLider = null;
            try {
                canal?.close();
            } catch {
                /* ya cerrado */
            }
            canal = null;
        },
        leerAhora,
    };
}

// ── Instancia de la pestaña ─────────────────────────────────────────────────────────────────
async function leerFilaSupabase(): Promise<FilaFreno | null> {
    try {
        const { data, error } = await createClient()
            .from("os_freno")
            .select("activo, motivo, hasta, actualizado")
            .eq("id", 1)
            .maybeSingle();
        if (error) return null; // tabla aún sin crear, pausa o red: se conserva lo último
        return (data as FilaFreno | null) ?? { activo: false };
    } catch {
        return null;
    }
}

let frenoPestana: Freno | null = null;

function frenoActual(): Freno | null {
    if (frenoPestana) return frenoPestana;
    if (typeof window === "undefined") return null;
    let almacen: AlmacenConsumo | null = null;
    try {
        almacen = window.localStorage;
    } catch {
        almacen = null;
    }
    frenoPestana = crearFreno({
        leerFila: leerFilaSupabase,
        esLider: esLiderPestana,
        alCambiarLider: alCambiarLiderPestana,
        crearCanal: (nombre) => (typeof BroadcastChannel === "function" ? (new BroadcastChannel(nombre) as unknown as CanalConsumo) : null),
        almacen,
        alCambiar: (e) => fijarFrenoRemoto(e.activo),
    });
    frenoPestana.iniciar();
    // El guardián arranca sin freno: si el guardado dice que está activo, que lo sepa ya.
    if (frenoPestana.activo()) fijarFrenoRemoto(true);
    return frenoPestana;
}

/** Arranca la lectura del freno en esta pestaña (idempotente). La llama el montaje global. */
export function iniciarFreno(): void {
    frenoActual();
}

/** ¿Está activo el freno remoto del proyecto? Sin ventana: false. */
export function frenoActivo(): boolean {
    return frenoActual()?.activo() ?? false;
}

export function leerFreno(): EstadoFreno {
    return frenoActual()?.estado() ?? FRENO_INACTIVO;
}

function suscribirFreno(oyente: () => void): () => void {
    return frenoActual()?.suscribir(oyente) ?? (() => undefined);
}

function frenoServidor(): EstadoFreno {
    return FRENO_INACTIVO;
}

/** Hook con el estado del freno remoto. La instantánea es estable mientras nada cambie. */
export function useFreno(): EstadoFreno {
    return useSyncExternalStore(suscribirFreno, leerFreno, frenoServidor);
}
