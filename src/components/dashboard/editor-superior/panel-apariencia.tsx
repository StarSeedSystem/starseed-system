"use client";
/**
 * Panel «Apariencia»: marco de los widgets (libre/clásico), densidad, fondo, temas curados,
 * estilo de la barra del editor y vista (cabecera con el nombre del tablero). Escribe en la
 * apariencia de la cuenta (`useAppearance`), la misma que Ajustes → Personalización.
 */
import * as React from "react";
import Link from "next/link";
import { Check, ExternalLink, Rows3, Shapes, SquareDashed, Frame, StretchHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAppearance } from "@/context/appearance-context";
import { curatedPresets } from "@/lib/themes/curated-presets";
import { cn } from "@/lib/utils";
import type { EstiloBarra } from "./tipos";
import { Seccion, Segmentado, pildoraFantasma } from "./ui-editor";

const AMBAR = "#FFBF00";

interface OpcionFondo {
    id: string;
    etiqueta: string;
    colores: string[];
    parche: Record<string, unknown>;
    es: (b: { type?: string; webglVariant?: string; living?: { variant?: string } }) => boolean;
}

/** Fondos rápidos: los mismos tipos que ofrece Ajustes → Personalización → Fondo. */
export const FONDOS_RAPIDOS: readonly OpcionFondo[] = [
    { id: "spline", etiqueta: "Líquido 3D", colores: ["#F15A22", "#0A0E27", "#7C5CFF"], parche: { type: "spline" }, es: (b) => b.type === "spline" },
    { id: "living-aurora", etiqueta: "Aurora viva", colores: ["#10B981", "#22D3EE", "#7C5CFF"], parche: { type: "living", living: { variant: "aurora" } }, es: (b) => b.type === "living" && (b.living?.variant ?? "aurora") === "aurora" },
    { id: "living-starfield", etiqueta: "Campo de estrellas", colores: ["#0B1026", "#9AA7FF", "#FFFFFF"], parche: { type: "living", living: { variant: "starfield" } }, es: (b) => b.type === "living" && b.living?.variant === "starfield" },
    { id: "liquid-aurora", etiqueta: "Aurora líquida", colores: ["#10b981", "#22d3ee", "#a855f7"], parche: { type: "liquid-aurora" }, es: (b) => b.type === "liquid-aurora" },
    { id: "liquid-iris", etiqueta: "Iris cuántica", colores: ["#a855f7", "#ec4899", "#22d3ee"], parche: { type: "liquid-iris" }, es: (b) => b.type === "liquid-iris" },
    { id: "materia-cristal", etiqueta: "Cristal líquido", colores: ["#7fd8e8", "#9aa7ff", "#cdb9ff"], parche: { type: "materia-cristal-liquido" }, es: (b) => b.type === "materia-cristal-liquido" },
    { id: "materia-oro", etiqueta: "Oro vivo", colores: ["#e9c46a", "#f4d58d", "#8be0c9"], parche: { type: "materia-oro-vivo" }, es: (b) => b.type === "materia-oro-vivo" },
    { id: "webgl-nebula", etiqueta: "Nebulosa", colores: ["#1e1b4b", "#7c3aed", "#22d3ee"], parche: { type: "webgl", webglVariant: "nebula" }, es: (b) => b.type === "webgl" && b.webglVariant === "nebula" },
];

export interface PanelAparienciaProps {
    pantallaCompleta: boolean;
    onPantallaCompleta: (v: boolean) => void;
    estiloBarra: EstiloBarra;
    onEstiloBarra: (e: EstiloBarra) => void;
    temasRecientes: string[];
    onAplicarTema: (idONombre: string) => void;
}

export function PanelApariencia({ pantallaCompleta, onPantallaCompleta, estiloBarra, onEstiloBarra, temasRecientes, onAplicarTema }: PanelAparienciaProps) {
    const { config, updateConfig } = useAppearance();
    const marco = config.widgets?.marco === "clasico" ? "clasico" : "libre";
    const densidad = config.widgets?.compact ? "compacta" : "comoda";
    const fondo = (config.background ?? {}) as { type?: string; webglVariant?: string; living?: { variant?: string } };
    const [soloRecientes, setSoloRecientes] = React.useState(false);
    const temas = soloRecientes
        ? curatedPresets.filter((t) => temasRecientes.includes(t.name) || temasRecientes.includes(t.id))
        : curatedPresets;

    return (
        <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
                <Seccion titulo="Marco de los widgets">
                    <Segmentado
                        etiqueta="Marco de los widgets"
                        acento={AMBAR}
                        valor={marco}
                        onCambiar={(v) => updateConfig({ widgets: { marco: v } })}
                        opciones={[
                            { valor: "libre", etiqueta: "Libre", ayuda: "Formas flotantes, sin caja", icono: Shapes },
                            { valor: "clasico", etiqueta: "Clásico", ayuda: "La tarjeta de cristal de siempre", icono: Frame },
                        ]}
                    />
                </Seccion>
                <Seccion titulo="Densidad">
                    <Segmentado
                        etiqueta="Densidad de los widgets"
                        acento={AMBAR}
                        valor={densidad}
                        onCambiar={(v) => updateConfig({ widgets: { compact: v === "compacta" } })}
                        opciones={[
                            { valor: "comoda", etiqueta: "Cómoda", ayuda: "Más aire alrededor del contenido", icono: StretchHorizontal },
                            { valor: "compacta", etiqueta: "Compacta", ayuda: "Más contenido en menos espacio", icono: Rows3 },
                        ]}
                    />
                </Seccion>
                <Seccion
                    titulo="Fondo"
                    accion={(
                        <Link href="/cuenta?section=personalizacion" className="inline-flex items-center gap-1 text-[12px] font-semibold text-white/65 underline-offset-4 hover:text-white hover:underline cursor-pointer">
                            Más fondos y capas <ExternalLink className="size-3.5" aria-hidden />
                        </Link>
                    )}
                >
                    <div role="radiogroup" aria-label="Fondo" className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(112px,1fr))]">
                        {FONDOS_RAPIDOS.map((f) => {
                            const activo = f.es(fondo);
                            return (
                                <button
                                    key={f.id} type="button" role="radio" aria-checked={activo}
                                    onClick={() => updateConfig({ background: f.parche } as Parameters<typeof updateConfig>[0])}
                                    className={cn("group flex flex-col gap-1.5 rounded-2xl p-1.5 text-left cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0")}
                                    style={activo ? pildoraFantasma(AMBAR) : { background: "rgba(255,255,255,.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }}
                                >
                                    <span className="relative block h-12 overflow-hidden rounded-xl" style={{ background: `linear-gradient(135deg, ${f.colores.join(", ")})` }}>
                                        {activo && <Check className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" aria-hidden />}
                                    </span>
                                    <span className="px-1 text-[12px] font-semibold text-white/85">{f.etiqueta}</span>
                                </button>
                            );
                        })}
                    </div>
                </Seccion>
            </div>

            <div className="space-y-5">
                <Seccion
                    titulo="Temas"
                    accion={(
                        <Segmentado
                            etiqueta="Qué temas enseñar"
                            acento={AMBAR}
                            valor={soloRecientes ? "recientes" : "todos"}
                            onCambiar={(v) => setSoloRecientes(v === "recientes")}
                            opciones={[{ valor: "todos", etiqueta: "Todos" }, { valor: "recientes", etiqueta: "Recientes" }]}
                        />
                    )}
                >
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                        {temas.length === 0 && <p className="text-[12.5px] text-white/50">Aún no has aplicado ningún tema en esta sesión.</p>}
                        {temas.map((t) => (
                            <button
                                key={t.id} type="button" onClick={() => onAplicarTema(t.id)}
                                aria-label={`Aplicar el tema ${t.name}`}
                                className="flex flex-col gap-1.5 rounded-2xl p-2 text-left cursor-pointer transition-[background,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.06] motion-reduce:hover:translate-y-0"
                                style={{ background: "rgba(255,255,255,.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }}
                            >
                                <span className="flex h-6 overflow-hidden rounded-lg" aria-hidden>
                                    {t.swatch.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
                                </span>
                                <span className="text-[12.5px] font-semibold leading-tight text-white/90">{t.name}</span>
                                <span className="line-clamp-2 text-[11.5px] leading-snug text-white/50">{t.tagline}</span>
                            </button>
                        ))}
                    </div>
                </Seccion>

                <Seccion titulo="Barra del editor">
                    <Segmentado
                        etiqueta="Estilo de la barra del editor"
                        acento={AMBAR}
                        valor={estiloBarra}
                        onCambiar={onEstiloBarra}
                        opciones={[
                            { valor: "liquid-crystal", etiqueta: "Cristal líquido", ayuda: "Vidrio translúcido" },
                            { valor: "cyber-neon", etiqueta: "Ciber neón", ayuda: "Filo cian brillante" },
                            { valor: "aurora-minimal", etiqueta: "Aurora sutil", ayuda: "Degradado cósmico suave" },
                        ]}
                    />
                </Seccion>

                <Seccion titulo="Vista">
                    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl p-3" style={{ background: "rgba(255,255,255,.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }}>
                        <span className="flex items-start gap-3">
                            <SquareDashed className="mt-0.5 size-[18px] shrink-0" style={{ color: AMBAR }} aria-hidden />
                            <span>
                                <span className="block text-[14px] font-semibold text-white/90">Cabecera con el nombre</span>
                                <span className="block text-[12px] text-white/55">Enseña el título grande del tablero encima de las pestañas.</span>
                            </span>
                        </span>
                        <Switch checked={!pantallaCompleta} onCheckedChange={(v) => onPantallaCompleta(!v)} aria-label="Cabecera con el nombre del tablero" />
                    </label>
                </Seccion>
            </div>
        </div>
    );
}
