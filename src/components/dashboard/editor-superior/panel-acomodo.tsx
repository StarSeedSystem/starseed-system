"use client";
/**
 * Panel «Acomodo»: herramientas para ordenar el tablero (auto-acomodar con el mismo empaquetador
 * que deriva cada pantalla, compactar, bloquear/desbloquear, cuadrícula visible, restablecer) y
 * las miniaturas de cómo queda en escritorio, tablet y móvil.
 */
import * as React from "react";
import { ArrowUpToLine, Grid3x3, Lock, LockOpen, Monitor, RotateCcw, Smartphone, Tablet, WandSparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { DashboardWidget } from "../dashboard-types";
import { getWidgetFunctionStyle } from "../widget-function-style";
import { COLUMNAS, type PuntoCorte } from "@/lib/dashboard/acomodo-pantalla";
import { autoAcomodar, compactar, conBloqueo, estaBloqueado, mismoAcomodo, vistaPantalla } from "./acomodo";
import { BotonHerramienta, Seccion } from "./ui-editor";

const AZUR = "#007FFF";

export interface PanelAcomodoProps {
    widgets: DashboardWidget[];
    onCambiar: (widgets: DashboardWidget[]) => void;
    cuadricula: boolean;
    onCuadricula: (v: boolean) => void;
    onRestablecer: () => void;
    tactil: boolean;
}

const PANTALLAS: { punto: PuntoCorte; nombre: string; icono: typeof Monitor }[] = [
    { punto: "lg", nombre: "Escritorio", icono: Monitor },
    { punto: "sm", nombre: "Tablet", icono: Tablet },
    { punto: "xxs", nombre: "Móvil", icono: Smartphone },
];

/** Miniatura del acomodo en una pantalla (proporción real de columna/fila: 95 × 65 px). */
export function MiniAcomodo({ widgets, punto, nombre, icono: Icono }: { widgets: DashboardWidget[]; punto: PuntoCorte; nombre: string; icono: typeof Monitor }) {
    const items = React.useMemo(() => vistaPantalla(widgets, punto), [widgets, punto]);
    const tipos = React.useMemo(() => new Map(widgets.map((w) => [w.id, w.widget_type])), [widgets]);
    const cols = COLUMNAS[punto];
    const filas = Math.max(4, items.reduce((m, it) => Math.max(m, it.y + it.h), 0));
    // Ancho de referencia 100 unidades; alto proporcional (una fila ≈ 0,68 columnas).
    const altoRel = (filas / cols) * (65 / 95) * 100;
    return (
        <figure className="min-w-0 space-y-1.5">
            <div
                className={`relative overflow-hidden rounded-xl bg-black/30 ring-1 ring-white/10 ${punto === "xxs" ? "mx-auto w-1/2" : punto === "sm" ? "mx-auto w-3/4" : "w-full"}`}
                style={{ aspectRatio: `100 / ${Math.round(Math.min(220, Math.max(40, altoRel)))}` }}
            >
                {items.map((it) => {
                    const acento = getWidgetFunctionStyle(tipos.get(it.i) ?? "CLOCK_DATE").accent;
                    return (
                        <span
                            key={it.i}
                            className="absolute rounded-[3px]"
                            style={{
                                left: `calc(${(it.x / cols) * 100}% + 1px)`,
                                width: `calc(${(it.w / cols) * 100}% - 2px)`,
                                top: `calc(${(it.y / filas) * 100}% + 1px)`,
                                height: `calc(${(it.h / filas) * 100}% - 2px)`,
                                background: `linear-gradient(160deg, ${acento}aa, ${acento}44)`,
                            }}
                        />
                    );
                })}
            </div>
            <figcaption className="flex items-center gap-1.5 text-[12px] font-medium text-white/65">
                <Icono className="size-3.5" aria-hidden /> {nombre} · {cols} columnas
            </figcaption>
        </figure>
    );
}

export function PanelAcomodo({ widgets, onCambiar, cuadricula, onCuadricula, onRestablecer, tactil }: PanelAcomodoProps) {
    const acomodado = React.useMemo(() => autoAcomodar(widgets), [widgets]);
    const compactado = React.useMemo(() => compactar(widgets), [widgets]);
    const bloqueados = widgets.filter(estaBloqueado).length;

    return (
        <div className="space-y-5">
            <p className="text-[12.5px] text-white/60">
                {widgets.length} widget{widgets.length === 1 ? "" : "s"} · {bloqueados} bloqueado{bloqueados === 1 ? "" : "s"}.{" "}
                {tactil
                    ? "En táctil, cada widget tiene flechas para subir o bajar y un botón de tamaño."
                    : "Arrastra un widget para moverlo y tira de su esquina para cambiarle el tamaño."}
            </p>

            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                <BotonHerramienta
                    icono={WandSparkles}
                    titulo="Auto-acomodar"
                    ayuda={mismoAcomodo(widgets, acomodado) ? "Ya está acomodado: no hay huecos." : "Rellena los huecos en orden de lectura, sin solapes."}
                    acento={AZUR}
                    disabled={widgets.length === 0 || mismoAcomodo(widgets, acomodado)}
                    onClick={() => onCambiar(acomodado)}
                />
                <BotonHerramienta
                    icono={ArrowUpToLine}
                    titulo="Compactar"
                    ayuda={mismoAcomodo(widgets, compactado) ? "Nada que subir." : "Sube cada widget sin cambiarlo de columna."}
                    acento={AZUR}
                    disabled={widgets.length === 0 || mismoAcomodo(widgets, compactado)}
                    onClick={() => onCambiar(compactado)}
                />
                <BotonHerramienta
                    icono={Lock}
                    titulo="Bloquear todos"
                    ayuda="Fija sitio y tamaño; lo nuevo se acomoda alrededor."
                    acento="#FFBF00"
                    disabled={widgets.length === 0 || bloqueados === widgets.length}
                    onClick={() => onCambiar(conBloqueo(widgets, "todos", true))}
                />
                <BotonHerramienta
                    icono={LockOpen}
                    titulo="Desbloquear todos"
                    ayuda={bloqueados ? `Libera ${bloqueados} widget${bloqueados === 1 ? "" : "s"}.` : "No hay ninguno bloqueado."}
                    acento="#FFBF00"
                    disabled={bloqueados === 0}
                    onClick={() => onCambiar(conBloqueo(widgets, "todos", false))}
                />
                <BotonHerramienta
                    icono={RotateCcw}
                    titulo="Restablecer predeterminados"
                    ayuda="Devuelve los tableros de fábrica a su acomodo original. Los tuyos se conservan."
                    peligro
                    onClick={onRestablecer}
                />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl p-3" style={{ background: "rgba(255,255,255,.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }}>
                <span className="flex items-start gap-3">
                    <Grid3x3 className="mt-0.5 size-[18px] shrink-0" style={{ color: AZUR }} aria-hidden />
                    <span>
                        <span className="block text-[14px] font-semibold text-white/90">Cuadrícula visible</span>
                        <span className="block text-[12px] text-white/55">Enseña las celdas de la rejilla mientras editas.</span>
                    </span>
                </span>
                <Switch checked={cuadricula} onCheckedChange={onCuadricula} aria-label="Cuadrícula visible" />
            </label>

            <Seccion titulo="Así se verá en cada pantalla" ayuda="El acomodo de escritorio se adapta solo: lo ancho llena la fila y lo mediano va de dos en dos.">
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
                    {PANTALLAS.map((p) => <MiniAcomodo key={p.punto} widgets={widgets} punto={p.punto} nombre={p.nombre} icono={p.icono} />)}
                </div>
            </Seccion>
        </div>
    );
}
