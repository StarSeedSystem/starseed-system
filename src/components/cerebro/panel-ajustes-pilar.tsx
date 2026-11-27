"use client";

/**
 * Panel lateral común de ajustes por pilar (CER1126A).
 *
 * Un solo sitio para los ajustes de Memorias, Habilidades, Contexto, Neuronas,
 * Personalidades, Conectores y Procesos activos. Las secciones van siempre en el
 * mismo orden (General, Privacidad y permisos, Sincronía, Avanzado), se pueden
 * buscar y cada una se puede volver a lo recomendado por separado, con
 * confirmación. El enlace directo es `?tab=<pilar>&ajustes=<seccion>`.
 *
 * El contenido de cada sección lo aporta el pilar mediante `renderContenido`:
 * así los diálogos actuales se muestran dentro del panel sin perder opciones.
 */

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { RotateCcw, Search, Shield, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { leerAjustes, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import type { Pilar } from "@/components/cerebro/pilares";

export type SeccionAjustesPilar = "general" | "privacidad" | "sincronia" | "avanzado";

export interface InfoSeccionAjustes {
    id: SeccionAjustesPilar;
    titulo: string;
    descripcion: string;
    palabras: string[];
}

/** El orden es el contrato: no se reordena ni se omite ninguna sección. */
export const SECCIONES_AJUSTES_PILAR: readonly InfoSeccionAjustes[] = [
    { id: "general", titulo: "General", descripcion: "Lo básico del pilar: medios, almacenamiento y comportamiento por defecto.", palabras: ["medios", "almacenamiento", "capacidades", "básico"] },
    { id: "privacidad", titulo: "Privacidad y permisos", descripcion: "Quién puede leer o escribir, cifrado local y accesos.", palabras: ["privacidad", "permisos", "cifrado", "acceso", "seguridad"] },
    { id: "sincronia", titulo: "Sincronía", descripcion: "Qué viaja, hacia dónde y si se sincroniza solo.", palabras: ["sincronía", "sync", "destinos", "vinculación", "telepatía"] },
    { id: "avanzado", titulo: "Avanzado", descripcion: "Opciones finas que conviene tocar con cuidado.", palabras: ["avanzado", "experto", "fino"] },
];

const POR_ID = new Map<SeccionAjustesPilar, InfoSeccionAjustes>(SECCIONES_AJUSTES_PILAR.map((s) => [s.id, s]));

const ICONO: Record<SeccionAjustesPilar, ComponentType<{ className?: string }>> = {
    general: SlidersHorizontal,
    privacidad: Shield,
    sincronia: Zap,
    avanzado: Sparkles,
};

function normalizar(texto: string): string {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** El `?ajustes=` de la URL, o null si no es una sección conocida. */
export function seccionDesdeUrl(valor: string | null | undefined): SeccionAjustesPilar | null {
    const limpio = normalizar(String(valor ?? ""));
    if (!limpio) return null;
    const alias: Record<string, SeccionAjustesPilar> = {
        general: "general",
        privacidad: "privacidad",
        permisos: "privacidad",
        sincronia: "sincronia",
        sync: "sincronia",
        avanzado: "avanzado",
        avanzada: "avanzado",
    };
    return alias[limpio] ?? null;
}

/** Enlace directo a una sección de los ajustes de un pilar. */
export function enlaceAjustes(pilar: Pilar | string, seccion: SeccionAjustesPilar): string {
    return `?tab=${encodeURIComponent(pilar)}&ajustes=${seccion}`;
}

/** Reescribe una URL conservando el resto de parámetros y fijando pilar y sección. */
export function urlConAjustes(href: string, pilar: Pilar | string, seccion: SeccionAjustesPilar): string {
    try {
        const url = new URL(href, "http://localhost");
        url.searchParams.set("tab", pilar);
        url.searchParams.set("ajustes", seccion);
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return enlaceAjustes(pilar, seccion);
    }
}

/** Secciones que coinciden con la búsqueda, en el orden del contrato. */
export function seccionesVisibles(consulta: string): SeccionAjustesPilar[] {
    const q = normalizar(consulta);
    if (!q) return SECCIONES_AJUSTES_PILAR.map((s) => s.id);
    return SECCIONES_AJUSTES_PILAR
        .filter((s) => normalizar(`${s.titulo} ${s.descripcion} ${s.palabras.join(" ")}`).includes(q))
        .map((s) => s.id);
}

/** Valores recomendados de una sección, sin tocar lo guardado ni las otras secciones. */
export function valoresRecomendadosDeSeccion(seccion: SeccionAjustesPilar, scope?: string | null): Partial<AjustesObjetivo> {
    const base = leerAjustes({ scope: scope ?? null, config: {} }).cerebro;
    switch (seccion) {
        case "general":
            return { medios: base.medios };
        case "privacidad":
            return { privacidad: base.privacidad, cifradoLocal: base.cifradoLocal, acceso: base.acceso };
        case "sincronia":
            return { sync: base.sync };
        case "avanzado":
            return {};
    }
}

export interface PanelAjustesPilarProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    pilar: Pilar;
    pilarEtiqueta: string;
    /** Sección pedida al abrir; si falta, se lee `?ajustes=`. */
    seccionInicial?: SeccionAjustesPilar | null;
    /** Contenido del pilar para la sección activa. */
    renderContenido?: (seccion: SeccionAjustesPilar) => ReactNode;
    /** «Volver a lo recomendado»: solo la sección indicada, nunca todas. */
    onVolverRecomendado?: (seccion: SeccionAjustesPilar) => void;
    onSeccionChange?: (seccion: SeccionAjustesPilar) => void;
}

export default function PanelAjustesPilar({
    open,
    onOpenChange,
    pilar,
    pilarEtiqueta,
    seccionInicial,
    renderContenido,
    onVolverRecomendado,
    onSeccionChange,
}: PanelAjustesPilarProps) {
    const [seccion, setSeccion] = useState<SeccionAjustesPilar>(seccionInicial ?? "general");
    const [consulta, setConsulta] = useState("");
    const [confirmando, setConfirmando] = useState(false);
    const visibles = useMemo(() => seccionesVisibles(consulta), [consulta]);

    useEffect(() => {
        if (!open) return;
        const desdeUrl = typeof window === "undefined"
            ? null
            : seccionDesdeUrl(new URLSearchParams(window.location.search).get("ajustes"));
        setSeccion(seccionInicial ?? desdeUrl ?? "general");
        setConsulta("");
        setConfirmando(false);
    }, [open, seccionInicial]);

    useEffect(() => {
        if (!open || visibles.length === 0 || visibles.includes(seccion)) return;
        setSeccion(visibles[0]);
    }, [open, visibles, seccion]);

    const elegir = (id: SeccionAjustesPilar) => {
        setSeccion(id);
        setConfirmando(false);
        onSeccionChange?.(id);
        if (typeof window === "undefined") return;
        try {
            window.history.replaceState(null, "", urlConAjustes(window.location.href, pilar, id));
        } catch {
            /* sin historial: el panel sigue funcionando */
        }
    };

    const info = POR_ID.get(seccion) ?? SECCIONES_AJUSTES_PILAR[0];
    const Icono = ICONO[info.id];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                data-testid="panel-ajustes-pilar"
                className="w-full border-white/10 bg-[rgba(10,12,28,0.98)] p-0 sm:max-w-md"
            >
                <SheetHeader className="border-b border-white/10 px-4 py-4 pl-14 text-left">
                    <SheetTitle className="text-base text-white">Ajustes · {pilarEtiqueta}</SheetTitle>
                    <SheetDescription className="text-xs leading-relaxed text-white/55">
                        General, privacidad y permisos, sincronía y avanzado. Todo en el mismo orden y sin perder ninguna opción.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="border-b border-white/10 px-4 py-3">
                        <label htmlFor="buscar-ajustes-pilar" className="sr-only">Buscar en los ajustes</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                            <input
                                id="buscar-ajustes-pilar"
                                type="search"
                                value={consulta}
                                onChange={(e) => setConsulta(e.target.value)}
                                placeholder="Buscar en los ajustes…"
                                className="h-9 w-full rounded-md border border-white/15 bg-black/40 pl-8 pr-2 text-sm text-white placeholder:text-white/35"
                            />
                        </div>
                    </div>

                    <nav aria-label={`Secciones de ajustes de ${pilarEtiqueta}`} className="flex flex-wrap gap-1.5 border-b border-white/10 px-3 py-2">
                        {visibles.length === 0 ? (
                            <p className="px-1 py-1 text-xs text-white/55">No hay ajustes que coincidan.</p>
                        ) : (
                            visibles.map((id) => {
                                const s = POR_ID.get(id);
                                if (!s) return null;
                                const Ic = ICONO[id];
                                const activa = id === seccion;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => elegir(id)}
                                        aria-pressed={activa}
                                        className={cn(
                                            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors whitespace-normal h-auto",
                                            activa
                                                ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                                                : "border-white/10 text-white/70 hover:bg-white/5",
                                        )}
                                    >
                                        <Ic className="h-3.5 w-3.5 shrink-0" /> {s.titulo}
                                    </button>
                                );
                            })
                        )}
                    </nav>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                                <span className="rounded-lg bg-white/[0.06] p-1.5 text-cyan-200"><Icono className="h-4 w-4" /></span>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-white">{info.titulo}</h3>
                                    <p className="text-xs leading-relaxed text-white/55">{info.descripcion}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setConfirmando(true)}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/75 transition-colors hover:bg-white/5 whitespace-normal h-auto"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> Volver a lo recomendado
                            </button>
                        </div>

                        {confirmando && (
                            <div
                                role="alertdialog"
                                aria-label={`Confirmar volver a lo recomendado en ${info.titulo}`}
                                className="mb-3 space-y-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3"
                            >
                                <p className="text-sm font-semibold text-amber-100">¿Volver a lo recomendado en «{info.titulo}»?</p>
                                <p className="text-xs leading-relaxed text-amber-100/80">
                                    Solo cambia esta sección; las demás se quedan como están. Podrás revisarlo antes de guardar.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setConfirmando(false)}
                                        className="h-8 flex-1 cursor-pointer rounded-lg bg-white/[0.08] px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.14]"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onVolverRecomendado?.(seccion);
                                            setConfirmando(false);
                                        }}
                                        className="h-8 flex-1 cursor-pointer rounded-lg bg-amber-400 px-3 text-xs font-semibold text-black transition-opacity hover:opacity-90"
                                    >
                                        Sí, volver
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            {renderContenido ? renderContenido(seccion) : (
                                <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/55">
                                    Este pilar todavía no tiene ajustes propios en esta sección.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
