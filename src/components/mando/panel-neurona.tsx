"use client";

/**
 * Panel «Neurona» del Centro de Mando (Ola 258 · 2026-09-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * Salud en vivo de esta máquina: memoria y swap, el demonio de voz (con el
 * oído residente y sus cesiones de memoria), el llama-server BitNet y Ollama.
 * Lee `GET /api/mando/neurona` (solo local; 404 en producción) y se refresca
 * cada 20 s, con el mismo patrón que el estado de la cabecera: la primera
 * lectura es forzada aunque la pestaña esté oculta y, después, el refresco
 * periódico se salta mientras `document.hidden` sea `true`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    BrainCircuit,
    CircleDashed,
    ClipboardCheck,
    Cpu,
    Ear,
    Gauge,
    HardDrive,
    Mic,
    RefreshCw,
    Server,
} from "lucide-react";

import type { SaludNeurona, VerificacionNeurona } from "@/lib/mando/neurona";

/** Máximo de regresiones/mejoras que se muestran antes de «+N más». */
const MAX_LISTA_VERIFICACION = 5;

/** Formatea un número de MB a «1.5 GB» cuando conviene, si no «824 MB». */
function formatoMb(mb: number | null | undefined): string {
    if (mb === null || mb === undefined || !Number.isFinite(mb)) return "—";
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
}

/** Formatea una latencia en ms («1.2 s» si pasa del segundo). */
function formatoLatencia(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.round(ms)} ms`;
}

/** Hace cuánto pasó algo en ms («hace 2 min»). */
function haceMs(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
    const segundos = Math.round((Date.now() - ms) / 1000);
    if (segundos < 0) return "ahora";
    if (segundos < 60) return `hace ${segundos} s`;
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `hace ${minutos} min`;
    return `hace ${Math.floor(minutos / 60)} h`;
}

/** Texto legible del estado de BitNet. */
const TEXTO_BITNET: Record<SaludNeurona["bitnet"]["estado"], string> = {
    vivo: "Vivo",
    cargando: "Cargando",
    apagado: "Apagado",
};

/** Color del punto de estado de BitNet. */
const COLOR_BITNET: Record<SaludNeurona["bitnet"]["estado"], string> = {
    vivo: "bg-emerald-400",
    cargando: "bg-amber-400",
    apagado: "bg-zinc-500",
};

/** Una fila «etiqueta: valor» dentro de una tarjeta. */
function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
    return (
        <li className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-white/50">{etiqueta}</span>
            <span className="font-mono text-white/80">{valor}</span>
        </li>
    );
}

/** Barra horizontal simple de proporción (para memoria y swap). */
function Barra({ porcentaje, tono }: { porcentaje: number; tono: "ok" | "aviso" | "peligro" }) {
    const pct = Math.max(0, Math.min(100, porcentaje));
    const clase = tono === "peligro" ? "bg-red-400" : tono === "aviso" ? "bg-amber-400" : "bg-emerald-400";
    return (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className={`h-full rounded-full ${clase}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Marco común de una tarjeta del panel. */
function Tarjeta({
    titulo,
    icono,
    children,
    testId,
}: {
    titulo: string;
    icono: React.ReactNode;
    children: React.ReactNode;
    testId?: string;
}) {
    return (
        <article data-testid={testId} className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="mb-3 flex items-center gap-2">
                {icono}
                <h3 className="text-sm font-semibold text-white">{titulo}</h3>
            </header>
            {children}
        </article>
    );
}

/**
 * Tarjeta «Última verificación» (Ola 269 · 2026-09-07).
 * Lee `salud.verificacion` (la escribe `scripts/verificar-neurona.mjs` en
 * `starseed_memory_root/verificaciones/ultimo.json`): puntuación con tono,
 * chips de fallos/avisos, listas acotadas de regresiones y mejoras y pie
 * con el commit corto y el «hace cuánto». Si todavía no se ha lanzado la
 * batería (`verificacion === null`), enseña el comando para hacerlo.
 */
function TarjetaVerificacion({ verificacion }: { verificacion: VerificacionNeurona | null }) {
    if (!verificacion) {
        // Estado vacío: el usuario necesita saber cómo generar la primera
        // verificación, así que se le da el comando listo para copiar.
        return (
            <Tarjeta
                titulo="Última verificación"
                testId="tarjeta-verificacion"
                icono={<ClipboardCheck className="h-4 w-4 text-white/70" aria-hidden />}
            >
                <p className="text-xs text-white/60">Sin verificaciones todavía.</p>
                <code className="mt-2 block rounded-md bg-white/5 px-2 py-1.5 font-mono text-[11px] text-white/80">
                    node scripts/verificar-neurona.mjs --voz --bitnet
                </code>
                <p className="mt-2 text-[11px] text-white/40">
                    Lánzala en la raíz del repositorio: mide voz y BitNet y deja aquí la puntuación.
                </p>
            </Tarjeta>
        );
    }

    const v = verificacion;
    // Tono de la puntuación: ≥ 90 es verde, ≥ 70 ámbar, por debajo rojo.
    const tono = v.puntuacion >= 90 ? "ok" : v.puntuacion >= 70 ? "aviso" : "peligro";
    const clasePuntuacion =
        tono === "ok" ? "text-emerald-300" : tono === "aviso" ? "text-amber-300" : "text-red-300";

    const ms = Date.parse(v.t);
    const hace = Number.isFinite(ms) ? haceMs(ms) : "—";
    // Commit corto estilo git (7 caracteres) o «—» si el JSON no lo trae.
    const commitCorto = v.commit ? v.commit.slice(0, 7) : "—";

    const regresiones = v.regresiones.slice(0, MAX_LISTA_VERIFICACION);
    const mejoras = v.mejoras.slice(0, MAX_LISTA_VERIFICACION);

    return (
        <Tarjeta
            titulo="Última verificación"
            testId="tarjeta-verificacion"
            icono={<ClipboardCheck className="h-4 w-4 text-white/70" aria-hidden />}
        >
            <div className="flex items-baseline gap-3">
                <span className={`font-mono text-2xl font-semibold ${clasePuntuacion}`} data-testid="puntuacion-verificacion">
                    {v.puntuacion}
                </span>
                <div className="flex gap-1.5">
                    <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                            v.fallos > 0
                                ? "border border-red-400/30 bg-red-500/10 text-red-200"
                                : "border border-white/10 bg-white/5 text-white/50"
                        }`}
                    >
                        {v.fallos} fallos
                    </span>
                    <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                            v.avisos > 0
                                ? "border border-amber-400/30 bg-amber-500/10 text-amber-200"
                                : "border border-white/10 bg-white/5 text-white/50"
                        }`}
                    >
                        {v.avisos} avisos
                    </span>
                </div>
            </div>

            {v.regresiones.length > 0 && (
                <ul className="mt-3 space-y-1">
                    {regresiones.map((regresion) => (
                        <li key={regresion} className="text-xs text-red-300/90">
                            · {regresion}
                        </li>
                    ))}
                    {v.regresiones.length > MAX_LISTA_VERIFICACION && (
                        <li className="text-[11px] text-red-300/60">+{v.regresiones.length - MAX_LISTA_VERIFICACION} más</li>
                    )}
                </ul>
            )}

            {v.mejoras.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {mejoras.map((mejora) => (
                        <li key={mejora} className="text-xs text-emerald-300/90">
                            · {mejora}
                        </li>
                    ))}
                    {v.mejoras.length > MAX_LISTA_VERIFICACION && (
                        <li className="text-[11px] text-emerald-300/60">+{v.mejoras.length - MAX_LISTA_VERIFICACION} más</li>
                    )}
                </ul>
            )}

            <p className="mt-3 border-t border-white/10 pt-2 font-mono text-[11px] text-white/40">
                commit {commitCorto} · {hace}
            </p>
        </Tarjeta>
    );
}

/** Tarjeta de Memoria: libre / inactiva / comprimida / total con barra. */
function TarjetaMemoria({ salud }: { salud: SaludNeurona }) {
    const m = salud.memoria;
    // Lo «disponible de verdad» es lo libre más lo inactivo, que el sistema aún
    // puede recuperar: sobre ese total se pinta la barra de presión de memoria.
    const disponible = (m.libreMb ?? 0) + (m.inactivaMb ?? 0);
    const usada = Math.max(0, (m.totalMb ?? 0) - disponible);
    const porcentaje = m.totalMb ? Math.round((usada / m.totalMb) * 100) : 0;
    const tono = disponible < 800 ? "peligro" : disponible < 1500 ? "aviso" : "ok";

    return (
        <Tarjeta titulo="Memoria" icono={<Cpu className="h-4 w-4 text-white/70" aria-hidden />}>
            <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="text-white/50">Disponible</span>
                <span className="font-mono text-white/80">{formatoMb(disponible)}</span>
            </div>
            <Barra porcentaje={porcentaje} tono={tono} />
            <ul className="mt-3 space-y-1">
                <Fila etiqueta="Libre" valor={formatoMb(m.libreMb)} />
                <Fila etiqueta="Inactiva" valor={formatoMb(m.inactivaMb)} />
                <Fila etiqueta="Comprimida" valor={formatoMb(m.comprimidaMb)} />
                <Fila etiqueta="Total" valor={formatoMb(m.totalMb)} />
            </ul>
        </Tarjeta>
    );
}

/** Tarjeta de Swap: usado de total. */
function TarjetaSwap({ salud }: { salud: SaludNeurona }) {
    const m = salud.memoria;
    const usado = m.swapUsadoMb ?? 0;
    const total = m.swapTotalMb ?? 0;
    const porcentaje = total ? Math.round((usado / total) * 100) : 0;

    return (
        <Tarjeta titulo="Swap" icono={<HardDrive className="h-4 w-4 text-white/70" aria-hidden />}>
            <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="text-white/50">Usado</span>
                <span className="font-mono text-white/80">{formatoMb(usado)}</span>
            </div>
            <Barra porcentaje={porcentaje} tono={porcentaje > 70 ? "peligro" : porcentaje > 40 ? "aviso" : "ok"} />
            <ul className="mt-3 space-y-1">
                <Fila etiqueta="Total" valor={formatoMb(m.swapTotalMb)} />
            </ul>
        </Tarjeta>
    );
}

/** Tarjeta de Voz: el demonio y, debajo, el oído residente. */
function TarjetaVoz({ salud }: { salud: SaludNeurona }) {
    const v = salud.voz;
    const estado = v.vivo ? (v.despertando ? "despertando" : v.ready ? "listo" : "vivo") : "apagado";
    const textoEstado =
        estado === "listo" ? "Listo" : estado === "despertando" ? "Despertando" : estado === "vivo" ? "Vivo" : "Apagado";
    const color =
        estado === "listo" ? "bg-emerald-400" : estado === "apagado" ? "bg-zinc-500" : "bg-amber-400";

    const o = v.oido;
    const oidoTexto = !o
        ? "—"
        : !o.instalado
          ? "No instalado"
          : o.cargandoDesdeMs !== null
            ? `Cargando (${Math.round((Date.now() - o.cargandoDesdeMs) / 1000)} s)`
            : o.residente
              ? o.ocupado
                  ? "Residente · ocupado"
                  : "Residente · dormido"
              : "Residente no listo";

    return (
        <Tarjeta titulo="Voz" icono={<Mic className="h-4 w-4 text-white/70" aria-hidden />}>
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />
                <span className="text-xs text-white/70">{textoEstado}</span>
                <span className="text-xs text-white/40">· {formatoLatencia(v.latenciaMs)}</span>
            </div>
            <ul className="mt-3 space-y-1">
                <Fila etiqueta="Memoria del demonio" valor={formatoMb(v.memoriaLibreMb)} />
            </ul>

            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                    <Ear className="h-3.5 w-3.5" aria-hidden />
                    Oído residente
                </div>
                <p className="mt-1 text-xs text-white/60">{oidoTexto}</p>
                {o && (
                    <ul className="mt-2 space-y-1">
                        <Fila etiqueta="Cola" valor={String(o.cola)} />
                        <Fila etiqueta="Cesiones" valor={String(o.cesiones)} />
                        <Fila etiqueta="Última cesión" valor={haceMs(o.ultimaCesionMs)} />
                    </ul>
                )}
            </div>
        </Tarjeta>
    );
}

/** Tarjeta de BitNet 1.58: estado, latencia, crashes y el último. */
function TarjetaBitNet({ salud }: { salud: SaludNeurona }) {
    const b = salud.bitnet;
    return (
        <Tarjeta titulo="BitNet 1.58" icono={<BrainCircuit className="h-4 w-4 text-white/70" aria-hidden />}>
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_BITNET[b.estado]}`} aria-hidden />
                <span className="text-xs text-white/70">{TEXTO_BITNET[b.estado]}</span>
                <span className="text-xs text-white/40">· {formatoLatencia(b.latenciaMs)}</span>
            </div>
            <ul className="mt-3 space-y-1">
                <Fila etiqueta="Puerto" valor={String(b.puerto)} />
                <Fila etiqueta="Crashes 24 h" valor={b.crashes24h === null ? "—" : String(b.crashes24h)} />
                <Fila etiqueta="Último crash" valor={b.ultimoCrash ?? "—"} />
            </ul>
        </Tarjeta>
    );
}

/** Tarjeta de Ollama: vivo y modelos cargados con MB y caducidad. */
function TarjetaOllama({ salud }: { salud: SaludNeurona }) {
    const o = salud.ollama;
    return (
        <Tarjeta titulo="Ollama" icono={<Server className="h-4 w-4 text-white/70" aria-hidden />}>
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${o.vivo ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
                <span className="text-xs text-white/70">{o.vivo ? "Vivo" : "Apagado"}</span>
            </div>
            {o.modelos.length === 0 ? (
                <p className="mt-3 text-xs text-white/50">Sin modelos cargados.</p>
            ) : (
                <ul className="mt-3 space-y-1.5">
                    {o.modelos.map((modelo) => (
                        <li key={modelo.nombre} className="text-xs">
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-mono text-white/80">{modelo.nombre}</span>
                                <span className="shrink-0 text-white/50">{formatoMb(modelo.tamanoMb)}</span>
                            </div>
                            {modelo.expira && (
                                <div className="text-[11px] text-white/40">
                                    expira {new Date(modelo.expira).toLocaleTimeString()}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Tarjeta>
    );
}

/** Panel principal de la salud de la neurona. */
export function PanelNeurona() {
    const [salud, setSalud] = useState<SaludNeurona | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);

    // `forzar`: la primera lectura (y la vuelta a la pestaña) siempre se hacen;
    // el refresco periódico se salta mientras la pestaña está oculta, igual que
    // la cabecera del Mando, para no gastar el proceso con la consola de fondo.
    const cargar = useCallback(async (forzar = false) => {
        if (!forzar && document.visibilityState === "hidden") return;
        if (forzar) setCargando(true);
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/neurona", { cache: "no-store" });
            if (!respuesta.ok) {
                setError(
                    respuesta.status === 404
                        ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                        : respuesta.status === 401
                          ? "Necesitas iniciar sesión para ver la neurona."
                          : `No se pudo medir la neurona (HTTP ${respuesta.status}).`,
                );
                setSalud(null);
                return;
            }
            setSalud((await respuesta.json()) as SaludNeurona);
        } catch {
            setError("No se pudo medir la salud de la neurona.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        let enCurso = false;
        const conForzado = async (forzar = false) => {
            if (enCurso) return;
            enCurso = true;
            try {
                // Re-implementa la lógica de `cargar` respetando `vivo` para no
                // actualizar estado tras desmontar el panel.
                if (forzar || document.visibilityState !== "hidden") {
                    if (forzar) setCargando(true);
                    setError(null);
                    try {
                        const respuesta = await fetch("/api/mando/neurona", { cache: "no-store" });
                        if (!vivo) return;
                        if (!respuesta.ok) {
                            setError(
                                respuesta.status === 404
                                    ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                                    : respuesta.status === 401
                                      ? "Necesitas iniciar sesión para ver la neurona."
                                      : `No se pudo medir la neurona (HTTP ${respuesta.status}).`,
                            );
                            setSalud(null);
                            return;
                        }
                        setSalud((await respuesta.json()) as SaludNeurona);
                    } catch {
                        if (vivo) setError("No se pudo medir la salud de la neurona.");
                    } finally {
                        if (vivo) setCargando(false);
                    }
                }
            } finally {
                enCurso = false;
            }
        };
        void conForzado(true);
        const cada = window.setInterval(() => void conForzado(), 20_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void conForzado(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    if (cargando && !salud) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Midiendo la salud de la neurona…
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error}
                <button
                    type="button"
                    onClick={() => void cargar(true)}
                    className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Reintentar
                </button>
            </div>
        );
    }

    if (!salud) return null;

    return (
        <section data-testid="panel-neurona" className="space-y-4">
            <header className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-white/60">
                    <Gauge className="h-4 w-4" aria-hidden />
                    Se refresca solo cada 20 segundos · medido {new Date(salud.t).toLocaleTimeString()}.
                </p>
                <button
                    type="button"
                    onClick={() => void cargar(true)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                    disabled={cargando}
                >
                    <RefreshCw className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                    Medir ahora
                </button>
            </header>

            {salud.avisos.length > 0 && (
                <div className="space-y-1.5">
                    {salud.avisos.map((aviso) => (
                        <p
                            key={aviso}
                            className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                        >
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                            {aviso}
                        </p>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <TarjetaVerificacion verificacion={salud.verificacion} />
                <TarjetaMemoria salud={salud} />
                <TarjetaSwap salud={salud} />
                <TarjetaVoz salud={salud} />
                <TarjetaBitNet salud={salud} />
                <TarjetaOllama salud={salud} />
            </div>
        </section>
    );
}