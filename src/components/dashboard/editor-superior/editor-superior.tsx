"use client";
/**
 * Editor superior del tablero (2026-09-28).
 *
 * Alex: «mueve el editor que se despliega desde la IZQUIERDA de la pantalla ARRIBA, justo debajo
 * de la barra de pestañas de los dashboards, y mejora cada opción y función».
 *
 * Al entrar en edición, una barra de cristal se acopla bajo las pestañas (altura y opacidad
 * animadas, 250 ms) y EMPUJA el contenido en vez de taparlo; al estar fuera del área que hace
 * scroll, queda fija mientras se desplaza el tablero. Seis grupos (Widgets · Acomodo · Pestaña ·
 * Apariencia · Plantillas · Sistema) abren su panel DEBAJO de la barra; en el móvil la barra es
 * una fila de pastillas icono+texto que se envuelven y los paneles son hojas inferiores.
 * Deshacer/Rehacer (también Ctrl/Cmd+Z y Ctrl/Cmd+Mayús+Z o Ctrl+Y) y un «Listo» bien visible.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Redo2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardWidget, DeviceType } from "../dashboard-types";
import { PanelWidgets, type TallaCatalogo } from "./panel-widgets";
import { aspectoDe } from "../pestanas/temas";
import { PanelAcomodo } from "./panel-acomodo";
import { PanelPestana } from "./panel-pestana";
import { PanelApariencia } from "./panel-apariencia";
import { PanelPlantillas } from "./panel-plantillas";
import { PanelSistema, type PropsSistema } from "./panel-sistema";
import { GRUPOS_EDITOR, type AccionesEditor, type DashboardConAspecto, type EstiloBarra, type GrupoEditor } from "./tipos";
import { CRISTAL, DEF_GRUPOS, HojaInferior, materialBarra, pildoraFantasma, useEsMovil, usePunteroFino, useTransicionEditor } from "./ui-editor";

export interface EditorSuperiorProps {
    dashboard: DashboardConAspecto;
    dashboards: DashboardConAspecto[];
    widgets: DashboardWidget[];
    grupo: GrupoEditor | null;
    onGrupo: (g: GrupoEditor | null) => void;
    acciones: AccionesEditor;
    puedeDeshacer: boolean;
    puedeRehacer: boolean;
    cuadricula: boolean;
    onCuadricula: (v: boolean) => void;
    estiloBarra: EstiloBarra;
    onEstiloBarra: (e: EstiloBarra) => void;
    pantallaCompleta: boolean;
    onPantallaCompleta: (v: boolean) => void;
    faltanTematicas: number;
    currentDevice?: DeviceType;
    temasRecientes: string[];
    onAplicarTema: (idONombre: string) => void;
    sistema: PropsSistema;
    /** (2026-09-29) Su tema tiene un diseño nuevo sin estrenar / sale de una plantilla temática. */
    novedad?: boolean;
    predeterminada?: boolean;
}

/** true si el foco está en un campo de texto (ahí Ctrl+Z es del campo, no del tablero). */
function escribiendo(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable === true;
}

/** Acopla el editor bajo las pestañas: entra y sale animando alto y opacidad (empuja, no tapa). */
export function DockEditorSuperior({ abierto, children }: { abierto: boolean; children: () => React.ReactNode }) {
    const transicion = useTransicionEditor();
    return (
        <AnimatePresence initial={false}>
            {abierto && (
                <motion.div
                    key="editor-superior"
                    data-testid="dock-editor-superior"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={transicion}
                    className="relative z-30 shrink-0 overflow-hidden"
                >
                    <div className="px-1.5 pt-1.5 sm:px-2">{children()}</div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function EditorSuperior(props: EditorSuperiorProps) {
    const { dashboard, dashboards, widgets, grupo, onGrupo, acciones, puedeDeshacer, puedeRehacer } = props;
    const esMovil = useEsMovil();
    const punteroFino = usePunteroFino();
    const transicion = useTransicionEditor();
    const [talla, setTalla] = React.useState<TallaCatalogo>("M");
    const idPanel = React.useId();
    const refChips = React.useRef<HTMLDivElement>(null);

    // Atajos: deshacer/rehacer y Escape cierra el panel abierto.
    React.useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && !escribiendo(document.activeElement)) {
                const k = e.key.toLowerCase();
                if (k === "z" && !e.shiftKey) { if (puedeDeshacer) { e.preventDefault(); acciones.onDeshacer(); } return; }
                if ((k === "z" && e.shiftKey) || k === "y") { if (puedeRehacer) { e.preventDefault(); acciones.onRehacer(); } return; }
            }
            if (e.key === "Escape" && grupo && !esMovil) onGrupo(null);
        };
        window.addEventListener("keydown", alTeclado);
        return () => window.removeEventListener("keydown", alTeclado);
    }, [acciones, puedeDeshacer, puedeRehacer, grupo, onGrupo, esMovil]);

    // Flechas izquierda/derecha entre las pastillas de grupo (barra de herramientas accesible).
    const alTecladoChips = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
        const botones = Array.from(refChips.current?.querySelectorAll<HTMLButtonElement>("[data-chip-grupo]") ?? []);
        const i = botones.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        e.preventDefault();
        const siguiente = e.key === "Home" ? 0 : e.key === "End" ? botones.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + botones.length) % botones.length;
        botones[siguiente]?.focus();
    };

    const indice = dashboards.findIndex((d) => d.id === dashboard.id);
    // (2026-09-29) La identidad que se ve es la de su tema salvo que la persona eligiera otra.
    const aspecto = aspectoDe(dashboard);
    const IconoPestana = aspecto.icono;
    const acentoPestana = aspecto.acento;
    const def = grupo ? DEF_GRUPOS[grupo] : null;

    const contenido = (g: GrupoEditor): React.ReactNode => {
        switch (g) {
            case "widgets":
                return (
                    <PanelWidgets
                        widgets={widgets}
                        nombrePestana={dashboard.name}
                        categoriaPestana={dashboard.plantilla?.cat ?? dashboard.category}
                        talla={talla}
                        onTalla={setTalla}
                        onAnadir={(type, t, dims) => acciones.onAnadirWidget(type, dims ? { talla: t, dims } : { talla: t })}
                        onForjar={acciones.onForjar}
                        onCrearDesdePlantilla={acciones.onCrearDesdePlantilla}
                        arrastrable={punteroFino && !esMovil}
                    />
                );
            case "acomodo":
                return (
                    <PanelAcomodo
                        widgets={widgets}
                        onCambiar={acciones.onCambiarWidgets}
                        cuadricula={props.cuadricula}
                        onCuadricula={props.onCuadricula}
                        onRestablecer={acciones.onRestablecerPredeterminados}
                        tactil={!punteroFino}
                        dispositivo={props.currentDevice}
                    />
                );
            case "pestana":
                return (
                    <PanelPestana
                        dashboard={dashboard}
                        indice={Math.max(0, indice)}
                        total={dashboards.length}
                        faltanTematicas={props.faltanTematicas}
                        currentDevice={props.currentDevice}
                        novedad={props.novedad}
                        predeterminada={props.predeterminada}
                        acciones={acciones}
                    />
                );
            case "apariencia":
                return (
                    <PanelApariencia
                        pantallaCompleta={props.pantallaCompleta}
                        onPantallaCompleta={props.onPantallaCompleta}
                        estiloBarra={props.estiloBarra}
                        onEstiloBarra={props.onEstiloBarra}
                        temasRecientes={props.temasRecientes}
                        onAplicarTema={props.onAplicarTema}
                    />
                );
            case "plantillas":
                return (
                    <PanelPlantillas
                        nombrePestana={dashboard.name}
                        categoriaPestana={dashboard.plantilla?.cat ?? dashboard.category}
                        onAplicar={acciones.onAplicarPlantilla}
                        onCrear={acciones.onCrearDesdePlantilla}
                    />
                );
            case "sistema":
                return <PanelSistema {...props.sistema} />;
        }
    };

    return (
        <div className="space-y-2" data-editor-superior="">
            <div
                role="toolbar"
                aria-label={`Editor del tablero ${dashboard.name}`}
                className="flex flex-wrap items-center gap-2 rounded-[20px] px-2 py-2 sm:px-3"
                style={materialBarra(props.estiloBarra)}
            >
                <div className="hidden items-center gap-2.5 border-r border-white/10 pr-3 md:flex" title={`Editando «${dashboard.name}»`}>
                    <span className="grid size-8 place-items-center rounded-xl" style={pildoraFantasma(acentoPestana)}>
                        {IconoPestana
                            ? <IconoPestana className="size-4" style={{ color: acentoPestana }} aria-hidden />
                            : <span className="size-2 rounded-full" style={{ background: acentoPestana, boxShadow: `0 0 10px ${acentoPestana}` }} aria-hidden />}
                    </span>
                    <span className="leading-tight">
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Editando</span>
                        <span className="block max-w-[18ch] truncate text-[13.5px] font-semibold text-white/90" title={dashboard.name}>{dashboard.name}</span>
                    </span>
                </div>

                <div ref={refChips} onKeyDown={alTecladoChips} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-label="Grupos de herramientas" role="group">
                    {GRUPOS_EDITOR.map((g) => {
                        const d = DEF_GRUPOS[g];
                        const activo = grupo === g;
                        const Icono = d.icono;
                        return (
                            <button
                                key={g}
                                type="button"
                                data-chip-grupo={g}
                                aria-expanded={activo}
                                aria-controls={activo ? idPanel : undefined}
                                onClick={() => onGrupo(activo ? null : g)}
                                className={cn(
                                    "ss-redondo inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold cursor-pointer transition-[background,box-shadow,color] duration-200",
                                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                                    activo ? "text-white" : "text-white/70 hover:bg-white/[0.07] hover:text-white",
                                )}
                                style={activo ? { ...pildoraFantasma(d.acento), boxShadow: `inset 0 0 0 1px ${d.acento}66, 0 0 18px -6px ${d.acento}`, outlineColor: d.acento } : { outlineColor: d.acento }}
                            >
                                <Icono className="size-4" style={{ color: d.acento }} aria-hidden />
                                {d.etiqueta}
                            </button>
                        );
                    })}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <button
                        type="button" onClick={acciones.onDeshacer} disabled={!puedeDeshacer}
                        aria-label="Deshacer" title="Deshacer (Ctrl/Cmd+Z)"
                        className="ss-redondo inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white/75 cursor-pointer transition-colors duration-200 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                        style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                    >
                        <Undo2 className="size-4" aria-hidden /> <span className="max-sm:sr-only">Deshacer</span>
                    </button>
                    <button
                        type="button" onClick={acciones.onRehacer} disabled={!puedeRehacer}
                        aria-label="Rehacer" title="Rehacer (Ctrl/Cmd+Mayús+Z)"
                        className="ss-redondo inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white/75 cursor-pointer transition-colors duration-200 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                        style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                    >
                        <Redo2 className="size-4" aria-hidden /> <span className="max-sm:sr-only">Rehacer</span>
                    </button>
                    <button
                        type="button" onClick={acciones.onListo}
                        aria-label="Listo: terminar la edición"
                        className="ss-redondo inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold text-white cursor-pointer transition-[transform,box-shadow] duration-200 hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:hover:scale-100"
                        style={{ background: "linear-gradient(135deg, #10B981, #0EA5A4)", boxShadow: "0 0 22px -6px #10B981, inset 0 1px 0 rgba(255,255,255,.25)", outlineColor: "#10B981" }}
                    >
                        <Check className="size-4" aria-hidden /> Listo
                    </button>
                </div>
            </div>

            {/* Panel del grupo, DEBAJO de la barra (escritorio/tablet). */}
            {!esMovil && (
                <AnimatePresence initial={false}>
                    {grupo && def && (
                        <motion.div
                            key="panel-editor"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={transicion}
                            className="overflow-hidden"
                        >
                            <section id={idPanel} role="region" aria-label={`Panel ${def.etiqueta}`} className="overflow-hidden rounded-[22px]" style={CRISTAL}>
                                <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={pildoraFantasma(def.acento)}>
                                            <def.icono className="size-[18px]" style={{ color: def.acento }} aria-hidden />
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="text-[15px] font-semibold text-white">{def.etiqueta}</h3>
                                            <p className="text-[12.5px] leading-snug text-white/55">{def.descripcion}</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => onGrupo(null)} aria-label={`Cerrar el panel ${def.etiqueta}`} className="ss-redondo grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/55 transition-colors duration-200 hover:bg-white/10 hover:text-white">
                                        <X className="size-4" />
                                    </button>
                                </header>
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div
                                        key={grupo}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={transicion.duration === 0 ? transicion : { duration: 0.16 }}
                                        className="max-h-[min(46vh,460px)] overflow-y-auto overscroll-contain p-3 sm:p-4 custom-scrollbar"
                                    >
                                        {contenido(grupo)}
                                    </motion.div>
                                </AnimatePresence>
                            </section>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}

            {/* Móvil: el panel es una hoja inferior. */}
            {esMovil && (
                <HojaInferior
                    id={idPanel}
                    abierta={Boolean(grupo && def)}
                    titulo={def?.etiqueta ?? ""}
                    descripcion={def?.descripcion}
                    acento={def?.acento ?? "#7C5CFF"}
                    onCerrar={() => onGrupo(null)}
                >
                    {grupo ? contenido(grupo) : null}
                </HojaInferior>
            )}
        </div>
    );
}
