"use client";

/**
 * Tarjetas de almacenamiento de la Neurona (Ola 273 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Disco libre + regenerables limpiables, espejo del memory root en Google Drive
 * y swap honesto con «Aliviar memoria». Consumen `GET/POST /api/mando/almacenamiento`.
 * Solo el TIPO viaja al cliente: `almacenamiento.ts` es código de servidor (lanza
 * `df`/`rsync`/sondas) y un import de valor metería `node:child_process` al bundle.
 *
 * `Tarjeta`/`Barra`/`Fila`/`formatoMb`/`haceMs` se replican aquí (no se exportan
 * desde `panel-neurona.tsx`): mismo marco, barra y tonos del Mando para que las
 * tarjetas nuevas se vean idénticas a las de memoria/swap.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    Check,
    Cloud,
    CircleDashed,
    HardDrive,
    Trash2,
    X,
} from "lucide-react";

import type { EstadoAlmacenamiento, Regenerable } from "@/lib/mando/almacenamiento";

/** Resultado del POST «espejar» («en segundo plano, sin borrar nada»). */
interface ResultadoEspejar {
    ok: boolean;
    pid?: number | null;
    detalle?: string;
}

/** Resultado del POST «limpiar» (ids limpiados / rechazados). */
interface ResultadoLimpiar {
    ok: boolean;
    limpiados?: string[];
    detalle?: string;
}

/** Un paso de «aliviar» (✓/✗ según `ok`) y el informe de memoria liberada. */
interface ResultadoAliviar {
    antesMb?: number;
    despuesMb?: number;
    liberadoMb?: number;
    pasos?: Array<{ que: string; ok: boolean; detalle: string }>;
}

/** Formatea MB a «1.5 GB» o «824 MB». */
function formatoMb(mb: number | null | undefined): string {
    if (mb === null || mb === undefined || !Number.isFinite(mb)) return "—";
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
}

/** «hace 2 min» desde un timestamp en ms. */
function haceMs(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
    const segundos = Math.round((Date.now() - ms) / 1000);
    if (segundos < 0) return "ahora";
    if (segundos < 60) return `hace ${segundos} s`;
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `hace ${minutos} min`;
    return `hace ${Math.floor(minutos / 60)} h`;
}

/** Barra horizontal de proporción (mismo aspecto que `panel-neurona.tsx`). */
function Barra({ porcentaje, tono }: { porcentaje: number; tono: "ok" | "aviso" | "peligro" }) {
    const pct = Math.max(0, Math.min(100, porcentaje));
    const clase = tono === "peligro" ? "bg-red-400" : tono === "aviso" ? "bg-amber-400" : "bg-emerald-400";
    return (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className={`h-full rounded-full ${clase}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Marco común de tarjeta (ídem `panel-neurona.tsx`). */
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
 * Tarjeta «Almacenamiento»: disco usado/total con barra (peligro < 4 GB libres,
 * aviso < 8 GB) y la lista de regenerables (casillas solo en los `seguro`; los
 * no seguros en gris). «Limpiar seleccionados» pide confirmación con cuántos MB
 * se liberarán y deja el resultado en línea.
 */
export function TarjetaAlmacenamiento({ estado }: { estado: EstadoAlmacenamiento }) {
    const disco = estado.disco;
    const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
    const [limpiando, setLimpiando] = useState(false);
    const [resultado, setResultado] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Regenerables por MB descendente (lo grande primero, para decidir rápido).
    const ordenados = useMemo(
        () => [...estado.regenerables].sort((a, b) => b.mb - a.mb),
        [estado.regenerables],
    );

    // Si el estado cambia (tras una limpieza), se resetea la selección.
    useEffect(() => {
        setSeleccion({});
        setResultado(null);
        setError(null);
        setLimpiando(false);
    }, [estado]);

    const seleccionados = ordenados.filter((r) => r.seguro && seleccion[r.id]);
    const mbASeleccionar = seleccionados.reduce((acc, r) => acc + r.mb, 0);
    // Tono por umbrales compartido con la cabecera (`tonoDiscoLibre`).
    const tonoDisco = tonoDiscoLibre(disco?.libreMb ?? null);

    const alternar = useCallback((id: string) => {
        setSeleccion((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const limpiar = useCallback(async () => {
        if (limpiando || seleccionados.length === 0) return;
        // Confirmación honesta: el usuario ve cuántos MB (y cuántos elementos)
        // va a borrar antes de lanzar una acción destructiva.
        if (!window.confirm(`¿Limpiar ${seleccionados.length} elementos (~${formatoMb(mbASeleccionar)})? Se regeneran en la próxima build.`)) return;
        setLimpiando(true);
        setError(null);
        setResultado(null);
        try {
            const respuesta = await fetch("/api/mando/almacenamiento", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "limpiar", ids: seleccionados.map((r) => r.id) }),
            });
            const cuerpo = (await respuesta.json()) as ResultadoLimpiar;
            if (!respuesta.ok || !cuerpo.ok) throw new Error(cuerpo.detalle ?? `HTTP ${respuesta.status}`);
            setResultado(cuerpo.detalle ?? `Limpiado (${cuerpo.limpiados?.length ?? 0}).`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo limpiar.");
        } finally {
            setLimpiando(false);
        }
    }, [limpiando, seleccionados, mbASeleccionar]);

    return (
        <Tarjeta titulo="Almacenamiento" icono={<HardDrive className="h-4 w-4 text-white/70" aria-hidden />} testId="tarjeta-almacenamiento">
            {disco ? (
                <>
                    <div className="mb-2 flex items-baseline justify-between text-xs">
                        <span className="text-white/50">Libre</span>
                        <span className="font-mono text-white/80">{formatoMb(disco.libreMb)}</span>
                    </div>
                    <Barra porcentaje={disco.usadoPct} tono={tonoDisco} />
                    <p className="mt-2 text-[11px] text-white/40">
                        {formatoMb(disco.totalMb)} en total · {disco.usadoPct} % usado
                    </p>
                </>
            ) : (
                <p className="text-xs text-white/50">No se pudo medir el disco.</p>
            )}

            {ordenados.length === 0 ? (
                <p className="mt-3 text-xs text-white/50">Nada regenerable que limpiar.</p>
            ) : (
                <ul className="mt-3 space-y-1.5">
                    {ordenados.map((regenerable) => (
                        <li key={regenerable.id} className="text-xs">
                            <label
                                className={`flex items-start gap-2 ${regenerable.seguro ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}
                            >
                                {regenerable.seguro ? (
                                    <input
                                        type="checkbox"
                                        checked={Boolean(seleccion[regenerable.id])}
                                        onChange={() => alternar(regenerable.id)}
                                        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-amber-400"
                                        aria-label={`Seleccionar ${regenerable.id}`}
                                    />
                                ) : (
                                    <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-white/20 bg-white/5" aria-hidden />
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-white/80">{regenerable.id}</span>
                                        <span className="shrink-0 font-mono text-white/50">{formatoMb(regenerable.mb)}</span>
                                    </span>
                                    <span className="text-[11px] text-white/40">{regenerable.descripcion}</span>
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
            )}

            <button
                type="button"
                onClick={() => void limpiar()}
                disabled={limpiando || seleccionados.length === 0}
                className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {limpiando ? <CircleDashed className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
                Limpiar seleccionados{mbASeleccionar > 0 ? ` (~${formatoMb(mbASeleccionar)})` : ""}
            </button>

            {resultado ? <p className="mt-2 text-xs text-emerald-300/90">{resultado}</p> : null}
            {error ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-red-300/90">
                    <X className="h-3 w-3 shrink-0" aria-hidden />
                    {error}
                </p>
            ) : null}
        </Tarjeta>
    );
}

/**
 * Tarjeta «Google Drive»: espejo del memory root. Si Drive no está montado,
 * enseña cómo instalarlo; si lo está, muestra la ruta corta (`~`), el último
 * espejo (hace cuánto y cuántos MB) y «Espejar ahora» (rsync desacoplado que
 * sube sin borrar nada).
 */
export function TarjetaDrive({ estado }: { estado: EstadoAlmacenamiento }) {
    const drive = estado.drive;
    const [espejando, setEspejando] = useState(false);
    const [resultado, setResultado] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setResultado(null);
        setError(null);
    }, [estado]);

    const espejar = useCallback(async () => {
        if (espejando) return;
        setEspejando(true);
        setError(null);
        setResultado(null);
        try {
            const respuesta = await fetch("/api/mando/almacenamiento", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "espejar" }),
            });
            const cuerpo = (await respuesta.json()) as ResultadoEspejar;
            if (!respuesta.ok || !cuerpo.ok) throw new Error(cuerpo.detalle ?? `HTTP ${respuesta.status}`);
            setResultado(cuerpo.detalle ?? "Espejo lanzado.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo espejar.");
        } finally {
            setEspejando(false);
        }
    }, [espejando]);

    if (!drive.montado) {
        return (
            <Tarjeta titulo="Google Drive" icono={<Cloud className="h-4 w-4 text-white/70" aria-hidden />} testId="tarjeta-drive">
                <p className="text-xs text-white/60">Instala Google Drive para escritorio para usarlo como espejo.</p>
            </Tarjeta>
        );
    }

    const espejo = drive.espejo;
    const ultimoMs = espejo?.ultimoEspejo ? Date.parse(espejo.ultimoEspejo) : null;

    return (
        <Tarjeta titulo="Google Drive" icono={<Cloud className="h-4 w-4 text-white/70" aria-hidden />} testId="tarjeta-drive">
            <p className="text-xs text-white/70">Montado en <span className="font-mono">{drive.ruta}</span></p>

            {espejo ? (
                <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2">
                    <p className="truncate font-mono text-[11px] text-white/60">{espejo.ruta}</p>
                    <div className="mt-1 flex items-baseline justify-between text-xs">
                        <span className="text-white/50">Último espejo</span>
                        <span className="font-mono text-white/80">
                            {espejo.ultimoEspejo ? `${haceMs(ultimoMs)} (${formatoMb(espejo.mb)})` : `nunca (${formatoMb(espejo.mb)})`}
                        </span>
                    </div>
                </div>
            ) : (
                <p className="mt-2 text-xs text-white/50">Sin espejo todavía: lanza «Espejar ahora».</p>
            )}

            <button
                type="button"
                onClick={() => void espejar()}
                disabled={espejando}
                className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {espejando ? <CircleDashed className="h-3 w-3 animate-spin" aria-hidden /> : <Cloud className="h-3 w-3" aria-hidden />}
                Espejar ahora
            </button>
            <p className="mt-1.5 text-[11px] text-white/40">En segundo plano, sin borrar nada.</p>

            {resultado ? <p className="mt-2 text-xs text-emerald-300/90">{resultado}</p> : null}
            {error ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-red-300/90">
                    <X className="h-3 w-3 shrink-0" aria-hidden />
                    {error}
                </p>
            ) : null}
        </Tarjeta>
    );
}

/** Tono del disco según los MB libres (compartido por el `DatoPulso` de la cabecera). */
export function tonoDiscoLibre(libreMb: number | null): "ok" | "aviso" | "peligro" {
    if (libreMb === null) return "ok";
    if (libreMb < 4096) return "peligro";
    if (libreMb < 8192) return "aviso";
    return "ok";
}

/** MB libres formateados cortos para la cabecera («12.4 GB») — `null` si no hay disco. */
export function discoLibreTexto(libreMb: number | null): string {
    if (libreMb === null) return "—";
    if (libreMb >= 1024) return `${(libreMb / 1024).toFixed(1)} GB`;
    return `${libreMb} MB`;
}

/**
 * Tarjeta «Swap» honesta: la misma barra que la antigua `TarjetaSwap`, pero sin
 * vender humo — debajo va `swap.explicacion` (que aclara por qué Google Drive no
 * baja el swap) y «Aliviar memoria» (duerme el BitNet + cede el pool de voz). Se
 * deshabilita 30 s tras cada alivio y, con swap > 3000 MB, sugiere reiniciar.
 */
export function TarjetaSwapHonesta({ estado }: { estado: EstadoAlmacenamiento }) {
    const swap = estado.swap;
    const [aliviando, setAliviando] = useState(false);
    const [resultado, setResultado] = useState<ResultadoAliviar | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Marca de la última vez que se alivió: el botón queda 30 s en enfriamiento.
    const [ultimoAlivioMs, setUltimoAlivioMs] = useState<number | null>(null);
    const [ahora, setAhora] = useState(Date.now());

    const porcentaje = swap.totalMb ? Math.round((swap.usadoMb / swap.totalMb) * 100) : 0;

    // Un reloj barato (1 s) solo mientras está en enfriamiento, para que el botón
    // se vuelva a habilitar sin recargar ni esperar al sondeo de 60 s.
    const enEnfriamiento = ultimoAlivioMs !== null && ahora - ultimoAlivioMs < 30_000;
    useEffect(() => {
        if (ultimoAlivioMs === null) return;
        const cada = window.setInterval(() => setAhora(Date.now()), 1000);
        return () => window.clearInterval(cada);
    }, [ultimoAlivioMs]);

    const aliviar = useCallback(async () => {
        if (aliviando || enEnfriamiento) return;
        setAliviando(true);
        setError(null);
        setResultado(null);
        try {
            const respuesta = await fetch("/api/mando/almacenamiento", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "aliviar" }),
            });
            const cuerpo = (await respuesta.json()) as ResultadoAliviar;
            if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
            setResultado(cuerpo);
            setUltimoAlivioMs(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo aliviar la memoria.");
        } finally {
            setAliviando(false);
        }
    }, [aliviando, enEnfriamiento]);

    return (
        <Tarjeta titulo="Swap" icono={<HardDrive className="h-4 w-4 text-white/70" aria-hidden />}>
            <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="text-white/50">Usado</span>
                <span className="font-mono text-white/80">{formatoMb(swap.usadoMb)}</span>
            </div>
            <Barra porcentaje={porcentaje} tono={porcentaje > 70 ? "peligro" : porcentaje > 40 ? "aviso" : "ok"} />
            <p className="mt-3 text-xs leading-relaxed text-white/60">{swap.explicacion}</p>

            <button
                type="button"
                onClick={() => void aliviar()}
                disabled={aliviando || enEnfriamiento}
                data-testid="boton-aliviar"
                className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {aliviando ? <CircleDashed className="h-3 w-3 animate-spin" aria-hidden /> : <HardDrive className="h-3 w-3" aria-hidden />}
                {enEnfriamiento ? `Aliviar memoria (${30 - Math.round((ahora - (ultimoAlivioMs ?? ahora)) / 1000)} s)` : "Aliviar memoria"}
            </button>

            {resultado ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2">
                    <ul className="space-y-1">
                        {resultado.pasos?.map((paso) => (
                            <li key={paso.que} className="flex items-start gap-1.5 text-xs">
                                {paso.ok ? (
                                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" aria-hidden />
                                ) : (
                                    <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" aria-hidden />
                                )}
                                <span className="text-white/70">
                                    {paso.que}
                                    {paso.detalle ? <span className="text-white/40"> · {paso.detalle}</span> : null}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 border-t border-white/10 pt-1.5 text-xs font-medium text-emerald-300/90">
                        Liberados {(resultado.liberadoMb ?? 0) >= 0 ? `${resultado.liberadoMb ?? 0} MB` : "—"}
                    </p>
                </div>
            ) : null}

            {error ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-red-300/90">
                    <X className="h-3 w-3 shrink-0" aria-hidden />
                    {error}
                </p>
            ) : null}

            {swap.usadoMb > 3000 ? (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    El swap sigue muy alto: si «Aliviar memoria» no basta, reinicia la máquina.
                </p>
            ) : null}
        </Tarjeta>
    );
}