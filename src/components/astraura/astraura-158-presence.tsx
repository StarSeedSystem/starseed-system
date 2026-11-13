"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Presencia de Astraura en el resto del OS: la tira «N procesos activos · M agentes vivos · K aprobaciones
 * pendientes» de `/agent` y el punto con el total sobre la orbe.
 * ---------------------------------------------------------------------------
 * (AST1113A · 2026-11-13) Antes estas cifras se contaban aquí, a partir de lo que el backend de Astraura 1.58
 * declaraba de sí mismo (el total de agentes activos de su enjambre, procesos «running», claves que «sonaban» a
 * aprobación), y salían SOLO si ese backend respondía, con 5 s de retraso: la tira llegaba tarde y empujaba la
 * página. Al lado, la cabecera decía «2 agentes» (una lista de demostración). Dos cifras de agentes distintas en
 * la misma pantalla. Alex: «que sean los datos reales».
 *
 * Ahora las tres cifras son las de los medidores de MetaGenesis y aquí no se cuenta nada (ver
 * `src/lib/mando/presencia-real.ts`, que dice de qué pastilla sale cada una):
 *   · procesos activos        ← «En curso» (`/api/mando/medidores?clave=en-curso`, su `cuenta`);
 *   · agentes vivos           ← «Agentes»  (`/api/mando/medidores?clave=agentes`, su `cuenta`);
 *   · aprobaciones pendientes ← fichas de visto bueno (`/api/mando/aprobaciones`).
 * Un sondeo por pestaña (singleton de módulo, ref-contado), al montar y cada 30 s, en pausa con la pestaña
 * oculta. La tira SIEMPRE ocupa su sitio (una línea de alto fijo): mientras mide dice «Midiendo…», y si no puede
 * leer las cifras (web publicada, cuenta sin acceso, sin red) lo dice en vez de pintar un número. Una cifra que
 * no es de ahora lleva su edad.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Clock, Wand2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAstraura158Feed } from "@/lib/astraura/astraura-158-feed";
import {
    CIFRA_VACIA,
    cifraDeAprobaciones,
    cifraDeMedidor,
    motivoSinCifra,
    ORIGEN,
    PAUSA_SIN_ACCESO_MS,
    SONDEO_PRESENCIA_MS,
    totalDePresencia,
    vistaPresencia,
    type EstadoPresencia,
    type Lectura,
    type RespuestaAprobaciones,
    type RespuestaMedidor,
    type VistaPresencia,
} from "@/lib/mando/presencia-real";

/* ─────────────────── enlaces del Studio 1.58 (SOP §5) ─────────────────── */

const ORQUESTACION_HREF = "/agent?tab=astraura-158&sub=orquestacion";
// (Adenda 178) Imaginación Intuitiva tiene página propia.
const IMAGINACION_HREF = "/imaginacion";
const NOTIFICACIONES_HREF = "/agent?tab=astraura-158&sub=notificaciones";
/** Donde viven los medidores de los que salen las cifras. */
const PULSO_HREF = "/metagenesis";

/* ═══════════════════ sondeo de los medidores (singleton de módulo) ═══════════════════ */

const EVENTO = "starseed:presencia-real";
const TOPE_LECTURA_MS = 12_000;

let estado: EstadoPresencia | null = null;
let temporizador = 0;
let enMarcha = false;
let leyendo = false;
let suscriptores = 0;
let ultimaLectura = 0;
/** Las tres lecturas fallaron por algo que no se arregla solo (404, 401, 403): se relee cada 5 min, no cada 30 s. */
let sinAcceso = false;
let quitarVisibilidad: (() => void) | null = null;

async function leer<T>(url: string): Promise<Lectura<T>> {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const reloj = ctrl ? setTimeout(() => ctrl.abort(), TOPE_LECTURA_MS) : null;
    try {
        const r = await fetch(url, { cache: "no-store", signal: ctrl?.signal });
        if (!r.ok) return { ok: false, estado: r.status, leidoMs: Date.now() };
        const cuerpo = (await r.json().catch(() => null)) as T | null;
        // Un 200 que no es JSON (p. ej. la página de la web publicada) no es una cifra.
        if (cuerpo === null || typeof cuerpo !== "object") return { ok: false, estado: 404, leidoMs: Date.now() };
        return { ok: true, cuerpo, leidoMs: Date.now() };
    } catch {
        return { ok: false, estado: null, leidoMs: Date.now() };
    } finally {
        if (reloj) clearTimeout(reloj);
    }
}

function emitir(): void {
    try {
        window.dispatchEvent(new CustomEvent(EVENTO));
    } catch {
        /* la presencia nunca rompe la pantalla que la monta */
    }
}

async function medir(): Promise<void> {
    if (leyendo || typeof window === "undefined") return;
    leyendo = true;
    ultimaLectura = Date.now();
    try {
        const [enCurso, agentes, aprobaciones] = await Promise.all([
            leer<RespuestaMedidor>("/api/mando/medidores?clave=en-curso"),
            leer<RespuestaMedidor>("/api/mando/medidores?clave=agentes"),
            leer<RespuestaAprobaciones>("/api/mando/aprobaciones"),
        ]);
        sinAcceso = [enCurso, agentes, aprobaciones].every((l) => !l.ok && motivoSinCifra(l.estado).definitivo);
        const previo = estado;
        estado = {
            procesos: cifraDeMedidor(enCurso, previo?.procesos ?? CIFRA_VACIA),
            agentes: cifraDeMedidor(agentes, previo?.agentes ?? CIFRA_VACIA),
            aprobaciones: cifraDeAprobaciones(aprobaciones, previo?.aprobaciones ?? CIFRA_VACIA),
        };
        emitir();
    } finally {
        leyendo = false;
    }
}

function arrancar(): void {
    if (typeof window === "undefined" || enMarcha) return;
    enMarcha = true;
    // Sin el retraso de 5 s de antes: la primera lectura sale al montar.
    void medir();
    temporizador = window.setInterval(() => {
        if (document.hidden) return;
        if (sinAcceso && Date.now() - ultimaLectura < PAUSA_SIN_ACCESO_MS) return;
        void medir();
    }, SONDEO_PRESENCIA_MS);
    const alVolver = () => {
        if (!document.hidden && Date.now() - ultimaLectura > (sinAcceso ? PAUSA_SIN_ACCESO_MS : SONDEO_PRESENCIA_MS)) void medir();
    };
    document.addEventListener("visibilitychange", alVolver);
    quitarVisibilidad = () => document.removeEventListener("visibilitychange", alVolver);
}

function parar(): void {
    if (temporizador) window.clearInterval(temporizador);
    temporizador = 0;
    quitarVisibilidad?.();
    quitarVisibilidad = null;
    enMarcha = false;
}

/** Hook compartido por la tira y el punto: una sola lectura para toda la pestaña. */
function usePresenciaReal(): VistaPresencia {
    const [, setTic] = useState(0);
    useEffect(() => {
        suscriptores += 1;
        arrancar();
        const alMedir = () => setTic((n) => n + 1);
        window.addEventListener(EVENTO, alMedir);
        alMedir(); // por si otro consumidor ya había leído antes de este montaje
        // La edad («hace N min») avanza aunque no llegue nada nuevo.
        const reloj = window.setInterval(alMedir, SONDEO_PRESENCIA_MS);
        return () => {
            window.removeEventListener(EVENTO, alMedir);
            window.clearInterval(reloj);
            suscriptores = Math.max(0, suscriptores - 1);
            if (suscriptores === 0) parar();
        };
    }, []);
    return vistaPresencia(estado, Date.now());
}

/** Solo para las pruebas: olvida lo leído y para el sondeo. */
export function __reiniciarPresenciaParaPruebas(): void {
    if (typeof window !== "undefined") parar();
    estado = null;
    leyendo = false;
    suscriptores = 0;
    ultimaLectura = 0;
    sinAcceso = false;
}

/* ═══════════════════ piezas visuales (Crystal Liquid Glass) ═══════════════════ */

type Tono = "emerald" | "cyan" | "amber";

const TONO_PUNTO: Record<Tono | "apagado", string> = {
    emerald: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
    cyan: "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]",
    amber: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
    apagado: "bg-white/25",
};

const TONO_INSIGNIA: Record<Tono, string> = {
    emerald: "border-emerald-300/50 bg-emerald-500/90 text-emerald-950",
    cyan: "border-cyan-300/50 bg-cyan-500/90 text-cyan-950",
    amber: "border-amber-300/50 bg-amber-500/95 text-amber-950",
};

const BOTON =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 h-7 text-[11px] text-white/80 transition-colors duration-200 hover:border-cyan-400/40 hover:text-cyan-100 cursor-pointer max-sm:h-8 max-sm:w-8 max-sm:px-0";

function Punto({ tono, encendido }: { tono: Tono; encendido: boolean }) {
    return <span aria-hidden className={cn("max-sm:hidden inline-block h-1.5 w-1.5 shrink-0 rounded-full", encendido ? TONO_PUNTO[tono] : TONO_PUNTO.apagado)} />;
}

function Cifra({ valor }: { valor: number | null }) {
    return <span className="font-medium tabular-nums text-white/85">{valor === null ? "—" : valor}</span>;
}

const NOMBRE_LARGO = { procesos: "procesos activos", agentes: "agentes vivos", aprobaciones: "aprobaciones pendientes" } as const;

/* ═══════════════════════════════ La tira ═══════════════════════════════ */

/**
 * Una línea de alto fijo bajo la cabecera de `/agent` (no es una notificación). Siempre ocupa su sitio, así que
 * no empuja la página al llegar. Tocar las cifras despliega de dónde sale cada una y lo que falta.
 */
export function Astraura158PresenceBar({ className }: { className?: string }) {
    const feed = useAstraura158Feed();
    const v = usePresenciaReal();
    const [abierta, setAbierta] = useState(false);
    const { procesos, agentes, aprobaciones } = v.figuras;
    const cargando = v.estado === "cargando";
    const sinCifras = v.estado === "sin-cifras";
    const hayAlgoQueMirar = (!!v.faltaLargo && !sinCifras) || v.avisos.length > 0;

    return (
        <div data-testid="tira-presencia" data-estado={v.estado} className={cn("w-full max-w-full", className)}>
            <div className="flex h-9 sm:h-8 w-full max-w-full items-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025] px-2 sm:px-3 text-[11px] text-white/70 backdrop-blur-md">
                <button
                    type="button"
                    data-testid="cifras-presencia"
                    aria-expanded={abierta}
                    aria-label={`${v.resumen} ${abierta ? "Toca para recoger el detalle." : "Toca para ver de dónde sale cada cifra."}`}
                    title={v.resumen}
                    onClick={() => setAbierta((a) => !a)}
                    className="flex h-full min-w-0 flex-1 items-center gap-x-2 sm:gap-x-3 overflow-hidden whitespace-nowrap text-left cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                >
                    {cargando ? (
                        <span aria-hidden className="truncate text-white/50">{v.resumen}</span>
                    ) : sinCifras ? (
                        <span aria-hidden className="truncate text-amber-200/80">
                            Sin cifras reales<span className="max-sm:hidden"> de procesos, agentes ni aprobaciones</span> · {v.faltaCorto}
                        </span>
                    ) : (
                        <span aria-hidden className="flex min-w-0 items-center gap-x-2 sm:gap-x-3 truncate">
                            <span className="inline-flex items-center gap-1.5">
                                <Punto tono="emerald" encendido={(procesos.valor ?? 0) > 0} />
                                <Cifra valor={procesos.valor} /> procesos<span className="max-sm:hidden"> activos</span>
                            </span>
                            <span className="text-white/25">·</span>
                            <span className="inline-flex items-center gap-1.5">
                                <Punto tono="cyan" encendido={(agentes.valor ?? 0) > 0} />
                                <Cifra valor={agentes.valor} /> agentes<span className="max-sm:hidden"> vivos</span>
                            </span>
                            <span className="text-white/25">·</span>
                            <span className="inline-flex items-center gap-1.5">
                                <Punto tono="amber" encendido={(aprobaciones.valor ?? 0) > 0} />
                                <Cifra valor={aprobaciones.valor} /> <span className="sm:hidden">por aprobar</span>
                                <span className="max-sm:hidden">aprobaciones pendientes</span>
                            </span>
                        </span>
                    )}
                    {v.edad && (
                        <span aria-hidden data-testid="edad-presencia" className="inline-flex shrink-0 items-center gap-1 rounded bg-white/[0.06] px-1.5 text-white/55">
                            <Clock className="h-3 w-3" />
                            {v.edad.replace(/^hace /, "")}
                        </span>
                    )}
                    {hayAlgoQueMirar && <span aria-hidden className="shrink-0 font-semibold text-amber-300">!</span>}
                    <ChevronDown aria-hidden className={cn("h-3 w-3 shrink-0 text-white/40 transition-transform", abierta && "rotate-180")} />
                </button>

                <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                    <Link href={ORQUESTACION_HREF} aria-label="Abrir el centro de Orquestación de Astraura 1.58" className={BOTON}>
                        <Workflow className="h-3.5 w-3.5 sm:h-3 sm:w-3" aria-hidden /> <span className="max-sm:hidden">Orquestación</span>
                    </Link>
                    <Link href={IMAGINACION_HREF} aria-label="Abrir Imaginación de Astraura 1.58" className={BOTON}>
                        <Wand2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" aria-hidden /> <span className="max-sm:hidden">Imaginación</span>
                    </Link>
                    <Link
                        href={NOTIFICACIONES_HREF}
                        aria-label={feed.unread > 0 ? `Abrir Notificaciones de Astraura 1.58, ${feed.unread} sin leer` : "Abrir Notificaciones de Astraura 1.58"}
                        className={cn(BOTON, "relative")}
                    >
                        <Bell className="h-3.5 w-3.5 sm:h-3 sm:w-3" aria-hidden /> <span className="max-md:hidden">Notificaciones</span>
                        {feed.unread > 0 && (
                            <span aria-hidden className="ml-0.5 rounded-full bg-rose-500/90 px-1.5 text-[10px] font-semibold text-white max-sm:absolute max-sm:-right-1 max-sm:-top-1 max-sm:ml-0 max-sm:px-1">
                                {feed.unread > 99 ? "99+" : feed.unread}
                            </span>
                        )}
                    </Link>
                </div>
            </div>

            {abierta && (
                <div data-testid="detalle-presencia" className="mt-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-white/70 backdrop-blur-md">
                    <ul className="space-y-0.5">
                        {(["procesos", "agentes", "aprobaciones"] as const).map((c) => (
                            <li key={c}>
                                <span className="font-medium text-white/85">{v.figuras[c].valor ?? "—"}</span> {NOMBRE_LARGO[c]} · de {ORIGEN[c]}
                                {v.figuras[c].edad ? ` · medido ${v.figuras[c].edad}` : v.figuras[c].valor !== null ? " · en vivo" : " · sin leer"}
                            </li>
                        ))}
                    </ul>
                    {v.faltaLargo && <p className="mt-1 text-amber-200/90">{v.faltaLargo}</p>}
                    {v.avisos.map((a) => (
                        <p key={a} className="mt-1 text-amber-200/80">{a}</p>
                    ))}
                    <p className="mt-1">
                        <Link href={PULSO_HREF} className="text-cyan-300 underline-offset-2 hover:underline">Abrir el pulso de MetaGenesis</Link>
                    </p>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════ El punto de la orbe ═══════════════════════════════ */

/**
 * Un punto con el total de las tres cifras sobre la orbe. Va como HERMANO del núcleo visual de `AuroraOrb` y,
 * como esa orbe vive dentro de un `<button>`, usa `role="button"` sobre un `<span>` y detiene sus punteros para
 * no disparar el arrastre ni el menú de la orbe. Sin las tres cifras no pinta nada: una suma a medias mentiría.
 */
export function Astraura158PresenceDot({ className }: { className?: string }) {
    const v = usePresenciaReal();
    const router = useRouter();
    const total = useMemo(() => totalDePresencia(v), [v]);

    const activar = useCallback(
        (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            router.push(ORQUESTACION_HREF);
        },
        [router],
    );

    if (total === null) return null;

    const tono: Tono = (v.figuras.aprobaciones.valor ?? 0) > 0 ? "amber" : (v.figuras.agentes.valor ?? 0) > 0 ? "cyan" : "emerald";
    const etiqueta = `Astraura: ${v.resumen} Toca para abrir Orquestación.`;

    return (
        <span
            role="button"
            tabIndex={0}
            title={etiqueta}
            aria-label={etiqueta}
            onClick={activar}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                    e.preventDefault();
                    activar(e);
                }
            }}
            className={cn(
                "absolute -top-1 -left-1 z-[2] grid h-4 w-4 select-none place-items-center rounded-full border text-[9px] font-semibold leading-none shadow-[0_0_8px_rgba(0,0,0,0.35)] cursor-pointer",
                TONO_INSIGNIA[tono],
                v.edad && "opacity-70",
                className,
            )}
        >
            {total > 9 ? "9+" : total}
        </span>
    );
}
