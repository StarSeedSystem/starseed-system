'use client';

// ════════════════════════════════════════════════════════════════
// MarcoWidget — el cascarón común de estados de todo widget (Ola 305 · zW3)
// ----------------------------------------------------------------
// Un solo marco con los cuatro estados honestos (cargando, vacío,
// error, listo) para que los 93 widgets del dashboard los adopten
// sin reinventar cada uno su esqueleto. La precedencia es la del
// contrato de calidad: error > cargando > vacío > listo.
//
// Reutiliza (no duplica):
//   · `mensajeVacio`/`mensajeError` de `../calidad-widget`.
//   · `WidgetSkeleton`/`WidgetEmptyState` del kit (`./primitives`).
//   · Tokens de `@/lib/design/movimiento` para transiciones 150-300 ms.
// ════════════════════════════════════════════════════════════════

import type { ReactNode } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { mensajeVacio, mensajeError, type EstadoWidget } from "../calidad-widget";
import { WidgetSkeleton, WidgetEmptyState } from "./primitives";
import { tokensDe, cssDe } from "@/lib/design/movimiento";
import { cn } from "@/lib/utils";

export interface MarcoWidgetProps {
    /** Título visible del widget (también aria-label de la región). */
    titulo: string;
    /** Categoría del widget (id de `widget-categories`): elige el mensaje de vacío. */
    categoria: string;
    /** Icono lucide del widget (opcional). */
    icono?: ReactNode;
    /** El widget está esperando datos. */
    cargando?: boolean;
    /** Fallo real de la fuente (prevalece sobre todo lo demás). */
    error?: unknown;
    /** El widget no tiene contenido real que mostrar. */
    vacio?: boolean;
    /** Acción de reintento (solo se ofrece si el error es reintentable). */
    onReintentar?: () => void;
    /** Controles de cabecera (derecha del título). */
    acciones?: ReactNode;
    /** Contenido real: se pinta tal cual en estado «listo». */
    children: ReactNode;
}

/** Estado resuelto del marco a partir de las props. */
export function estadoDeMarco(p: MarcoWidgetProps): EstadoWidget {
    if (p.error !== undefined && p.error !== null) return "error";
    if (p.cargando) return "cargando";
    if (p.vacio) return "vacio";
    return "listo";
}

/**
 * Clase base común a todos los estados: cristal tenue del OS con la
 * transición de hover en la voz única del movimiento (150-300 ms).
 */
const CLASE_BASE = "bg-card/[var(--w-glass,0.5)] backdrop-blur-2xl";

/** Cabecera compacta: icono + título + acciones (nada de emojis). */
function Cabecera({ titulo, icono, acciones }: { titulo: string; icono?: ReactNode; acciones?: ReactNode }) {
    return (
        <header className="flex shrink-0 items-center gap-2 border-b border-border/20 px-3 pt-2.5 pb-2">
            {icono && (
                <span aria-hidden className="grid size-6 shrink-0 place-items-center text-muted-foreground/80 [&>svg]:size-4">
                    {icono}
                </span>
            )}
            <h3 className="min-w-0 flex-1 truncate font-headline text-xs font-black tracking-tight text-foreground/90">
                {titulo}
            </h3>
            {acciones && <div className="flex shrink-0 items-center gap-1">{acciones}</div>}
        </header>
    );
}

export function MarcoWidget(p: MarcoWidgetProps) {
    const reducido = useReducedMotion() ?? false;
    const tHover = tokensDe("hover", reducido);
    const estado = estadoDeMarco(p);

    // ── Cuerpo por estado ──────────────────────────────────────────
    // cargando: esqueleto con la forma del contenido (no un spinner suelto)
    // y `aria-busy` para lectores de pantalla.
    if (estado === "cargando") {
        return (
            <div
                data-testid="marco-widget"
                data-estado={estado}
                role="region"
                aria-label={p.titulo}
                aria-busy="true"
                className={cn("flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/40", CLASE_BASE)}
            >
                <Cabecera titulo={p.titulo} icono={p.icono} acciones={p.acciones} />
                <div className="min-h-0 flex-1 p-3">
                    <WidgetSkeleton rows={3} variant="list" />
                </div>
            </div>
        );
    }

    // vacío: mensaje de la categoría (título + ayuda) con hueco para la
    // acción sugerida del propio contenido.
    if (estado === "vacio") {
        const vacioMsg = mensajeVacio(p.categoria);
        return (
            <div
                data-testid="marco-widget"
                data-estado={estado}
                role="region"
                aria-label={p.titulo}
                className={cn("flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/40", CLASE_BASE)}
            >
                <Cabecera titulo={p.titulo} icono={p.icono} acciones={p.acciones} />
                <div className="min-h-0 flex-1">
                    <WidgetEmptyState icon={Sparkles} title={vacioMsg.titulo} message={vacioMsg.ayuda} />
                </div>
            </div>
        );
    }

    // error: mensaje honesto de `mensajeError`; el botón Reintentar SOLO
    // se pinta si el error es reintentable Y hay callback — ofrecer un
    // botón que no puede funcionar es mentir. `role="status"` para que
    // el lector de pantalla anuncie el fallo sin interrumpir.
    if (estado === "error") {
        const err = mensajeError(p.error);
        const reintentarVisible = err.reintentable && typeof p.onReintentar === "function";
        return (
            <div
                data-testid="marco-widget"
                data-estado={estado}
                role="region"
                aria-label={p.titulo}
                className={cn("flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/40", CLASE_BASE)}
            >
                <Cabecera titulo={p.titulo} icono={p.icono} acciones={p.acciones} />
                <div role="status" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-3 text-center">
                    <p className="text-sm font-bold text-foreground/90">{err.titulo}</p>
                    <p className="text-[11px] text-muted-foreground/70">{err.detalle}</p>
                    {reintentarVisible && (
                        <button
                            type="button"
                            onClick={p.onReintentar}
                            style={{ transition: cssDe(tHover) }}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/20"
                        >
                            <RotateCw className="size-3" aria-hidden /> Reintentar
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // listo: el contenido se pinta tal cual, sin envolturas que estorben
    // el layout del widget (la cabecera sí es parte del marco).
    return (
        <div
            data-testid="marco-widget"
            data-estado={estado}
            role="region"
            aria-label={p.titulo}
            className={cn("flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/40", CLASE_BASE)}
        >
            <Cabecera titulo={p.titulo} icono={p.icono} acciones={p.acciones} />
            <div className="min-h-0 flex-1">{p.children}</div>
        </div>
    );
}
