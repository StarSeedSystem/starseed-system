'use client';

// ════════════════════════════════════════════════════════════════
// OfficialDataWidget — Datos Oficiales en tiempo real (ajustable)
// ----------------------------------------------------------------
// "Ajustable": el usuario elige la fuente (chips segmentados) y
// activa/desactiva el auto-refresco. Muestra SIEMPRE la atribución de
// la fuente (transparencia de origen), "actualizado hace …", un botón
// de refresco manual y estados claros de carga/error (con reintentar).
// Datos REALES vía useDataSource → APIs públicas sin clave.
//
// Adaptabilidad (render-prop `size`):
//   • micro/compact   → selector colapsado a un único Chip + flecha
//                        (ciclo de fuente), lista recortada, sin detalles.
//   • regular         → chips segmentados completos + lista íntegra.
//   • expanded        → añade barra de meta (categoría + nº de métricas).
// Accesibilidad: estados anunciados con role="status"/aria-live; foco
// visible (focus-visible:ring) en todos los controles; aria-pressed en
// los chips de fuente. Cifras en tabular-nums.
// ════════════════════════════════════════════════════════════════

import { Satellite, RefreshCw, RotateCw, Zap, ZapOff, AlertTriangle, ChevronRight } from "lucide-react";
import { WidgetShell } from "../../kit";
import { timeAgo } from "../../kit";
import { useDataSource } from "../../apps/data-sources/use-data-source";
import type { DataPoint } from "../../apps/data-sources/data-source-registry";

const ACCENT = "#38BDF8";

// Anillo de foco coherente con el acento del widget (reutilizado en controles).
const FOCUS_RING =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export function OfficialDataWidget() {
    const {
        sources, sourceId, setSourceId,
        data, loading, error, lastUpdated,
        refresh, auto, setAuto,
    } = useDataSource("open-meteo");

    const active = sources.find((s) => s.id === sourceId);

    // Ciclo de fuente para tamaños pequeños (un solo chip que avanza).
    const cycleSource = () => {
        const idx = sources.findIndex((s) => s.id === sourceId);
        const nextIdx = (idx + 1 + sources.length) % sources.length;
        const next = sources[nextIdx];
        if (next) setSourceId(next.id);
    };

    return (
        <WidgetShell
            title="Datos Oficiales"
            subtitle="Fuentes en tiempo real"
            icon={Satellite}
            accent={ACCENT}
            live={auto}
            connections={[
                { label: "Explorer", href: "/explorer", color: ACCENT },
                { label: "Biblioteca", href: "/library", color: "#FFBF00" },
            ]}
            actions={
                <button
                    type="button"
                    onClick={() => setAuto(!auto)}
                    title={auto ? "Auto-refresco activo · clic para pausar" : "Auto-refresco en pausa · clic para activar"}
                    aria-label={auto ? "Pausar auto-refresco" : "Activar auto-refresco"}
                    aria-pressed={auto}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${FOCUS_RING}`}
                    style={{
                        color: auto ? ACCENT : "hsl(var(--muted-foreground))",
                        borderColor: auto ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : "hsl(var(--border))",
                        background: auto ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : "transparent",
                    }}
                >
                    {auto ? <Zap className="size-3" /> : <ZapOff className="size-3" />}
                    {auto ? "Auto" : "Manual"}
                </button>
            }
            footer={
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/70 min-w-0">
                    <span className="truncate">
                        Fuente: <span className="font-bold text-foreground/80">{active?.attribution ?? "—"}</span>
                        {lastUpdated !== null && (
                            <span className="text-muted-foreground/50"> · hace <span className="tabular-nums">{timeAgo(lastUpdated)}</span></span>
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        title="Refrescar ahora"
                        aria-label="Refrescar ahora"
                        className={`shrink-0 inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${FOCUS_RING}`}
                    >
                        <RotateCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                        Refrescar
                    </button>
                </div>
            }
        >
            {(size) => {
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.tier === "compact";
                const expanded = size.tier === "expanded" || size.vTier === "expanded";
                // Cuántas filas caben según altura disponible (sin desbordar).
                const maxRows = micro ? 2 : compact ? 4 : 8;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* ── Selector de fuente ──────────────────────── */}
                        {micro || compact ? (
                            // Colapsado: un único chip que cicla entre fuentes.
                            <button
                                type="button"
                                onClick={cycleSource}
                                title={`Fuente: ${active?.label ?? "—"} — clic para cambiar`}
                                aria-label={`Cambiar de fuente. Actual: ${active?.label ?? "ninguna"}`}
                                className={`shrink-0 inline-flex items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer hover:-translate-y-px ${FOCUS_RING}`}
                                style={{ color: "#06121e", background: ACCENT, borderColor: ACCENT }}
                            >
                                <span className="truncate">{active?.label ?? "Fuente"}</span>
                                <ChevronRight className="size-3 shrink-0 opacity-80" />
                            </button>
                        ) : (
                            <div className="shrink-0 flex flex-wrap gap-1.5" role="group" aria-label="Seleccionar fuente de datos">
                                {sources.map((s) => {
                                    const activeChip = s.id === sourceId;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setSourceId(s.id)}
                                            title={`${s.label} — ${s.attribution}`}
                                            aria-pressed={activeChip}
                                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer hover:-translate-y-px ${FOCUS_RING}`}
                                            style={
                                                activeChip
                                                    ? { color: "#06121e", background: ACCENT, borderColor: ACCENT }
                                                    : {
                                                        color: "hsl(var(--muted-foreground))",
                                                        borderColor: "hsl(var(--border))",
                                                        background: "transparent",
                                                    }
                                            }
                                        >
                                            {s.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Meta (solo expanded): categoría + nº métricas ─ */}
                        {expanded && !error && data.length > 0 && active && (
                            <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-white/[0.02] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                <span className="truncate">{active.category}</span>
                                <span className="tabular-nums shrink-0">{data.length} métrica{data.length === 1 ? "" : "s"}</span>
                            </div>
                        )}

                        {/* ── Cuerpo: loading / error / datos ──────────── */}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar" aria-busy={loading}>
                            {loading && data.length === 0 ? (
                                <LoadingState rows={Math.min(3, maxRows)} />
                            ) : error ? (
                                <ErrorState onRetry={refresh} loading={loading} />
                            ) : data.length === 0 ? (
                                <EmptyState />
                            ) : (
                                <ul className="space-y-1.5" role="list">
                                    {data.slice(0, maxRows).map((p, i) => (
                                        <DataRow key={`${sourceId}-${i}`} point={p} compact={micro} />
                                    ))}
                                    {data.length > maxRows && (
                                        <li className="px-1 pt-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/45 tabular-nums">
                                            +{data.length - maxRows} más
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>

                        {/* Estado accesible (anunciado a lectores de pantalla, no visible). */}
                        <span role="status" aria-live="polite" className="sr-only">
                            {loading
                                ? "Cargando datos…"
                                : error
                                    ? "Error: fuente no disponible."
                                    : `${data.length} métricas cargadas de ${active?.attribution ?? "la fuente"}.`}
                        </span>
                    </div>
                );
            }}
        </WidgetShell>
    );
}

// ── Filas y estados ──────────────────────────────────────────────
function DataRow({ point, compact }: { point: DataPoint; compact: boolean }) {
    return (
        <li className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5 min-w-0 transition-colors hover:border-border/70 hover:bg-white/[0.04]">
            <div className="min-w-0">
                <div className={`font-semibold truncate ${compact ? "text-[10px]" : "text-[11px] @sm:text-xs"}`}>
                    {point.label}
                </div>
                {point.detail && !compact && (
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 truncate">
                        {point.detail}
                    </div>
                )}
            </div>
            <div className="shrink-0 text-right">
                <span className="font-black tabular-nums" style={{ color: ACCENT }}>
                    {point.value}
                </span>
                {point.unit && (
                    <span className="ml-0.5 text-[9px] font-bold uppercase text-muted-foreground/50">
                        {point.unit}
                    </span>
                )}
            </div>
        </li>
    );
}

function LoadingState({ rows = 3 }: { rows?: number }) {
    return (
        <div className="space-y-1.5" aria-hidden>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-9 rounded-xl bg-muted/15 animate-pulse" />
            ))}
        </div>
    );
}

function ErrorState({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
    return (
        <div className="h-full min-h-[7rem] grid place-items-center text-center px-3">
            <div>
                <AlertTriangle className="mx-auto size-6 text-amber-400/80" />
                <p className="mt-2 text-xs font-bold">Fuente no disponible</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">No se pudo conectar con la fuente oficial.</p>
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={loading}
                    aria-label="Reintentar conexión con la fuente"
                    className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default ${FOCUS_RING}`}
                    style={{ color: ACCENT, borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }}
                >
                    <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Reintentar
                </button>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="h-full min-h-[6rem] grid place-items-center text-center">
            <p className="text-[11px] text-muted-foreground/50">Sin datos para mostrar</p>
        </div>
    );
}
