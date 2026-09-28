"use client";

/**
 * Modo presentador: pantalla completa, flechas/teclado/deslizar para avanzar, puntero láser,
 * notas del orador con la siguiente diapositiva y cronómetro. Con «Presentar a todos», quien
 * presenta difunde su diapositiva (y su láser) y quien sigue la ve a la vez; quien sigue puede
 * soltarse y navegar por su cuenta cuando quiera.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cast, ChevronLeft, ChevronRight, Crosshair, StickyNote, UserRoundCheck, X } from "lucide-react";
import { acquireFullscreenModal } from "@/lib/ui/fullscreen-modal";
import type { EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";
import type { UnidadColab } from "@/lib/vivo/doc-colaborativo/modelo";
import { lienzoEfectivo, textoDeDiapositiva, type Diapositiva, type MetaPresentacion } from "@/lib/vivo/presentacion";
import { VistaDiapositiva } from "./vista-diapositiva";
import styles from "./presentacion.module.css";

export interface PunteroLaser {
    x: number;
    y: number;
}

export interface ModoPresentadorProps {
    unidades: UnidadColab<Diapositiva>[];
    meta: MetaPresentacion;
    estiloBase: EstiloMensaje;
    indice: number;
    /** null = se sigue a otra persona (no se navega por cuenta propia). */
    onIndice: ((i: number) => void) | null;
    onSalir: () => void;
    /** Nombre de quien presenta, si se está siguiendo a alguien. */
    siguiendoA?: string | null;
    onSoltar?: () => void;
    /** Láser de quien presenta (coordenadas 0–1), cuando se sigue. */
    laserRemoto?: PunteroLaser | null;
    /** Presentar a todos: disponible, activo, y cómo cambiarlo. */
    puedeDifundir?: boolean;
    difundiendo?: boolean;
    onDifundir?: (activo: boolean) => void;
    /** El láser propio (0–1) para difundirlo; null = se apagó. */
    onLaser?: (p: PunteroLaser | null) => void;
    /** No pedir pantalla completa (pruebas, incrustado). */
    sinPantallaCompleta?: boolean;
}

function reloj(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ModoPresentador({
    unidades,
    meta,
    estiloBase,
    indice,
    onIndice,
    onSalir,
    siguiendoA,
    onSoltar,
    laserRemoto,
    puedeDifundir,
    difundiendo,
    onDifundir,
    onLaser,
    sinPantallaCompleta,
}: ModoPresentadorProps) {
    const raiz = useRef<HTMLDivElement>(null);
    const reducido = useReducedMotion();
    const [laser, setLaser] = useState(false);
    const [punto, setPunto] = useState<PunteroLaser | null>(null);
    const [notas, setNotas] = useState(false);
    const [controles, setControles] = useState(true);
    const [inicio] = useState(() => Date.now());
    const [ahora, setAhora] = useState(() => Date.now());
    const [direccion, setDireccion] = useState(1);
    const tOcultar = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tLaser = useRef(0);
    const toque = useRef<{ x: number; y: number } | null>(null);
    const estabaCompleta = useRef(false);

    const total = unidades.length;
    const i = Math.max(0, Math.min(total - 1, indice));
    const actual = unidades[i]?.datos ?? null;
    const siguiente = unidades[i + 1]?.datos ?? null;
    const navega = !!onIndice;

    const ir = useCallback(
        (n: number) => {
            if (!onIndice || !total) return;
            const destino = Math.max(0, Math.min(total - 1, n));
            if (destino === i) return;
            setDireccion(destino > i ? 1 : -1);
            onIndice(destino);
        },
        [onIndice, total, i],
    );

    // El dock y los bordes del OS se repliegan; pantalla completa si el navegador la da.
    useEffect(() => acquireFullscreenModal(), []);
    useEffect(() => {
        if (sinPantallaCompleta) return;
        const nodo = raiz.current;
        try {
            void nodo?.requestFullscreen?.().then(
                () => {
                    estabaCompleta.current = true;
                },
                () => {},
            );
        } catch {
            /* sin pantalla completa: sigue como capa */
        }
        const alCambiar = () => {
            if (estabaCompleta.current && !document.fullscreenElement) onSalir();
        };
        document.addEventListener("fullscreenchange", alCambiar);
        return () => {
            document.removeEventListener("fullscreenchange", alCambiar);
            if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
        };
        // Solo al entrar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const mostrarControles = useCallback(() => {
        setControles(true);
        if (tOcultar.current) clearTimeout(tOcultar.current);
        tOcultar.current = setTimeout(() => setControles(false), 3200);
    }, []);
    useEffect(() => {
        mostrarControles();
        return () => {
            if (tOcultar.current) clearTimeout(tOcultar.current);
        };
    }, [mostrarControles]);

    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            const k = e.key;
            if (k === "Escape") {
                e.preventDefault();
                onSalir();
                return;
            }
            if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']")) return;
            if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") {
                e.preventDefault();
                ir(i + 1);
            } else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") {
                e.preventDefault();
                ir(i - 1);
            } else if (k === "Home") {
                e.preventDefault();
                ir(0);
            } else if (k === "End") {
                e.preventDefault();
                ir(total - 1);
            } else if (k.toLowerCase() === "l" && !siguiendoA) {
                setLaser((v) => !v);
            } else if (k.toLowerCase() === "n" && !siguiendoA) {
                setNotas((v) => !v);
            }
            mostrarControles();
        };
        window.addEventListener("keydown", alTeclado);
        return () => window.removeEventListener("keydown", alTeclado);
    }, [i, ir, onSalir, total, siguiendoA, mostrarControles]);

    // Al apagar el láser, que desaparezca también en las pantallas que siguen.
    const laserAntes = useRef(false);
    useEffect(() => {
        if (laserAntes.current && !laser) {
            setPunto(null);
            onLaser?.(null);
        }
        laserAntes.current = laser;
    }, [laser, onLaser]);

    const moverLaser = (e: EventoPuntero<HTMLDivElement>) => {
        mostrarControles();
        if (!laser) return;
        const caja = (e.currentTarget.querySelector("[data-diapositiva] > div") as HTMLElement | null)?.getBoundingClientRect();
        if (!caja || !caja.width) return;
        const p = { x: (e.clientX - caja.left) / caja.width, y: (e.clientY - caja.top) / caja.height };
        const dentro = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
        setPunto(dentro ? p : null);
        const t = Date.now();
        if (t - tLaser.current > 80) {
            tLaser.current = t;
            onLaser?.(dentro ? p : null);
        }
    };

    const alTocar = (e: EventoPuntero<HTMLDivElement>) => {
        if (e.pointerType !== "mouse") toque.current = { x: e.clientX, y: e.clientY };
    };
    const alSoltarToque = (e: EventoPuntero<HTMLDivElement>) => {
        const t = toque.current;
        toque.current = null;
        if (!t) return;
        const dx = e.clientX - t.x;
        const dy = e.clientY - t.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) ir(dx < 0 ? i + 1 : i - 1);
        else mostrarControles();
    };

    const laserVisible = siguiendoA ? laserRemoto : punto;
    const variantes = reducido
        ? { entra: { opacity: 1 }, visible: { opacity: 1 }, sale: { opacity: 1 } }
        : { entra: { opacity: 0, x: 40 * direccion }, visible: { opacity: 1, x: 0 }, sale: { opacity: 0, x: -40 * direccion } };

    return (
        <div ref={raiz} className={styles.presentador} role="dialog" aria-modal="true" aria-label={`Presentación · diapositiva ${i + 1} de ${total}`} data-modo-presentador="">
            {siguiendoA && (
                <div className="flex flex-wrap items-center justify-center gap-3 bg-[#7C5CFF]/15 px-4 py-2 text-[13px] text-white/90 shadow-[inset_0_-1px_0_rgba(124,92,255,.35)]" role="status">
                    <UserRoundCheck className="h-4 w-4 text-[#c4b5fd]" aria-hidden="true" />
                    <span>
                        Siguiendo a <strong className="font-semibold">{siguiendoA}</strong>
                    </span>
                    {onSoltar && (
                        <button type="button" onClick={onSoltar} className="ss-redondo min-h-8 cursor-pointer rounded-full px-3 text-[12.5px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)] hover:bg-white/10">
                            Navegar por mi cuenta
                        </button>
                    )}
                </div>
            )}
            <div className="flex min-h-0 flex-1">
                <div
                    className={cn(styles.escenario, laser && !siguiendoA && styles.sinCursor)}
                    onPointerMove={moverLaser}
                    onPointerDown={alTocar}
                    onPointerUp={alSoltarToque}
                    onPointerLeave={() => laser && (setPunto(null), onLaser?.(null))}
                >
                    <AnimatePresence initial={false} mode="popLayout">
                        {actual ? (
                            <motion.div
                                key={unidades[i].id}
                                className="absolute inset-3"
                                variants={variantes}
                                initial="entra"
                                animate="visible"
                                exit="sale"
                                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                            >
                                <VistaDiapositiva lienzo={lienzoEfectivo(actual, meta)} estiloBase={estiloBase} ajuste="contener" radio={6} etiqueta={textoDeDiapositiva(actual) || `Diapositiva ${i + 1}`}>
                                    {laserVisible && <span className={styles.laser} style={{ left: `${laserVisible.x * 100}%`, top: `${laserVisible.y * 100}%` }} aria-hidden="true" />}
                                </VistaDiapositiva>
                            </motion.div>
                        ) : (
                            <p className="absolute inset-0 grid place-items-center text-white/60">No hay diapositivas.</p>
                        )}
                    </AnimatePresence>
                </div>
                {notas && !siguiendoA && (
                    <aside className="hidden w-[min(380px,34vw)] flex-none flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[rgba(12,14,34,.85)] p-5 md:flex" aria-label="Notas del orador">
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Notas</p>
                            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{actual?.notas?.trim() || "Sin notas en esta diapositiva."}</p>
                        </div>
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Siguiente</p>
                            {siguiente ? <VistaDiapositiva lienzo={lienzoEfectivo(siguiente, meta)} estiloBase={estiloBase} miniatura radio={8} /> : <p className="text-[13px] text-white/55">Es la última.</p>}
                        </div>
                    </aside>
                )}
            </div>

            <div className={cn(styles.controles, "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]", !controles && styles.controlesOcultos)}>
                <div
                    className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-[22px] border border-white/10 bg-[rgba(12,14,34,.78)] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl"
                    onPointerEnter={() => {
                        setControles(true);
                        if (tOcultar.current) clearTimeout(tOcultar.current);
                    }}
                    onFocus={() => setControles(true)}
                >
                    <BotonControl etiqueta="Anterior (←)" onClick={() => ir(i - 1)} disabled={!navega || i === 0}>
                        <ChevronLeft className="h-5 w-5" />
                    </BotonControl>
                    <span className="min-w-[4.5rem] px-2 text-center text-[13.5px] font-semibold tabular-nums text-white/90" aria-live="polite">
                        {total ? i + 1 : 0} / {total}
                    </span>
                    <BotonControl etiqueta="Siguiente (→)" onClick={() => ir(i + 1)} disabled={!navega || i >= total - 1}>
                        <ChevronRight className="h-5 w-5" />
                    </BotonControl>
                    {!siguiendoA && (
                        <>
                            <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
                            <BotonControl etiqueta="Puntero láser (L)" onClick={() => setLaser((v) => !v)} activo={laser}>
                                <Crosshair className="h-[18px] w-[18px]" />
                            </BotonControl>
                            <BotonControl etiqueta="Notas del orador (N)" onClick={() => setNotas((v) => !v)} activo={notas}>
                                <StickyNote className="h-[18px] w-[18px]" />
                            </BotonControl>
                            {puedeDifundir && onDifundir && (
                                <button
                                    type="button"
                                    onClick={() => onDifundir(!difundiendo)}
                                    aria-pressed={!!difundiendo}
                                    className={cn(
                                        "ss-redondo inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-200",
                                        difundiendo ? "bg-[#F43F5E] text-white shadow-[0_4px_16px_#F43F5E66]" : "text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)] hover:bg-white/[0.08]",
                                    )}
                                >
                                    <Cast className="h-4 w-4" aria-hidden="true" />
                                    {difundiendo ? "Presentando a todos" : "Presentar a todos"}
                                </button>
                            )}
                            <span className="px-2 text-[12.5px] tabular-nums text-white/60" title="Tiempo presentando">
                                {reloj(ahora - inicio)}
                            </span>
                        </>
                    )}
                    <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
                    <BotonControl etiqueta="Salir (Esc)" onClick={onSalir}>
                        <X className="h-5 w-5" />
                    </BotonControl>
                </div>
            </div>
        </div>
    );
}

function BotonControl({ etiqueta, onClick, disabled, activo, children }: { etiqueta: string; onClick: () => void; disabled?: boolean; activo?: boolean; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={etiqueta}
            title={etiqueta}
            aria-pressed={activo}
            className={cn(
                "ss-redondo grid h-10 w-10 cursor-pointer place-items-center rounded-full text-white/85 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-35",
                activo && "bg-[#DC143C]/30 text-white shadow-[inset_0_0_0_1px_#DC143C99]",
            )}
        >
            {children}
        </button>
    );
}
