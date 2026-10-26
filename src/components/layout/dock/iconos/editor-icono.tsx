"use client";

/**
 * Editor del diseño de UN icono del dock (Ola 1025U · V1b). Se abre desde el dock (mantener pulsado →
 * «Diseño del icono», que emite `starseed:dock-diseno-icono`). Vista previa en vivo, deshacer/rehacer,
 * restablecer, variaciones con IA, y guardar / compartir / exportar. Nada se escribe en el dock hasta que
 * se pulsa «Aplicar»; cerrar con cambios pide confirmación.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Redo2, RotateCcw, Sparkles, Undo2, Wand2, Palette, Share2, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DOCK_FALLBACK_ICON, DOCK_ICON_MAP, type DockItemConfig } from "@/components/layout/dock-config";
import { usePerfilIconos } from "@/lib/dock/iconos/almacen";
import {
    crearHistorial,
    deshacer,
    proponer,
    puedeDeshacer,
    puedeRehacer,
    rehacer,
    type Historial,
} from "@/lib/dock/iconos/historial";
import {
    disenoComoPlantilla,
    disenoEfectivo,
    disenoInicialDeItem,
    disenosIguales,
    type DisenoIcono,
} from "@/lib/dock/iconos/modelo";
import { aplicarDisenoAItem, aplicarPlantillaAlPerfil, contarDisenosPropios, itemsDelDock } from "./aplicar-dock";
import { AccionesCompartir } from "./acciones-compartir";
import { ControlesDiseno } from "./controles-diseno";
import type { IconoLucide } from "./glifos-lucide";
import { VistaIcono } from "./icono-dock";
import { PanelVariacionesIA } from "./panel-variaciones-ia";

type Pestana = "diseno" | "ia" | "compartir";

/** Cambios que llegan en ráfaga mientras se arrastra: se funden en un solo paso de «Deshacer». */
const CLAVES_CONTINUAS: ReadonlySet<string> = new Set([
    "fondo-intensidad", "fondo-angulo", "fondo-color", "fondo-desde", "fondo-hasta",
    "color-glifo", "escala", "brillo", "borde-ancho", "borde-color",
]);

const PESTANAS: ReadonlyArray<{ id: Pestana; texto: string; icono: ReactNode }> = [
    { id: "diseno", texto: "Diseño", icono: <Palette className="size-4" aria-hidden /> },
    { id: "ia", texto: "Con IA", icono: <Sparkles className="size-4" aria-hidden /> },
    { id: "compartir", texto: "Guardar y compartir", icono: <Share2 className="size-4" aria-hidden /> },
];

interface Props {
    itemId: string | null;
    abierto: boolean;
    alCerrar: () => void;
}

/** El icono de siempre (sin diseño), para la vista previa cuando no hay ninguno. */
function IconoDeSiempre({ Icono, lado }: { Icono: IconoLucide; lado: number }) {
    return (
        <span
            className="grid place-items-center rounded-full bg-gradient-to-br from-foreground/10 to-foreground/[0.02] text-foreground/80 ring-1 ring-inset ring-white/10"
            style={{ width: lado, height: lado }}
            data-icono-de-siempre=""
        >
            <Icono className="size-1/2" />
        </span>
    );
}

export function EditorIcono(props: Props) {
    // Cada vez que se abre se monta de nuevo (lo decide el montaje con una `key`): el estado arranca limpio.
    return (
        <Dialog open={props.abierto} onOpenChange={(a) => { if (!a) props.alCerrar(); }}>
            <DialogContent className="max-h-[92dvh] max-w-3xl p-4 sm:p-6" aria-describedby="editor-icono-descripcion">
                <ContenidoEditor {...props} />
            </DialogContent>
        </Dialog>
    );
}

function ContenidoEditor({ itemId, alCerrar }: Props) {
    const perfil = usePerfilIconos();
    const [items] = useState<DockItemConfig[]>(() => itemsDelDock());
    const item = items.find((i) => i.id === itemId) ?? null;
    const Propio = (item && DOCK_ICON_MAP[item.iconKey]) || DOCK_FALLBACK_ICON;

    const propioInicial = useMemo(() => (item ? disenoEfectivo({ id: item.id, iconKey: item.iconKey, diseno: item.diseno }, null) : null), [item]);
    const dePlantilla = useMemo(() => (item ? disenoEfectivo({ id: item.id, iconKey: item.iconKey }, perfil) : null), [item, perfil]);

    const [h, setH] = useState<Historial<DisenoIcono | null>>(() => crearHistorial<DisenoIcono | null>(propioInicial));
    const [pestana, setPestana] = useState<Pestana>("diseno");
    const [pidiendoDescartar, setPidiendoDescartar] = useState(false);
    const vistaRef = useRef<HTMLDivElement>(null);

    const cambiado = !disenosIguales(h.presente, propioInicial);
    const trabajo: DisenoIcono | null = item ? (h.presente ?? dePlantilla ?? disenoInicialDeItem(item)) : null;
    const vista = h.presente ?? dePlantilla;

    const alCambiar = useCallback((nuevo: DisenoIcono, clave: string) => {
        // Solo los controles continuos (deslizadores, selector de color) funden sus ráfagas en un paso; una
        // elección con un clic (forma, tipo de fondo, dibujo, variación de la IA) es siempre un paso propio.
        setH((actual) => proponer<DisenoIcono | null>(actual, { ...nuevo, origen: nuevo.origen === "ia" ? "ia" : "usuario" }, { clave: CLAVES_CONTINUAS.has(clave) ? clave : undefined, igual: disenosIguales }));
    }, []);

    const glifoLucideSvg = useCallback(() => vistaRef.current?.querySelector("[data-icono-disenado] svg")?.outerHTML, []);

    const intentarCerrar = () => {
        if (cambiado) setPidiendoDescartar(true);
        else alCerrar();
    };

    if (!item || !trabajo) {
        return (
            <div className="space-y-3 py-2">
                <DialogHeader>
                    <DialogTitle>Diseño del icono</DialogTitle>
                    <DialogDescription id="editor-icono-descripcion">No encuentro ese icono en tu dock. Quizá lo quitaste hace un momento.</DialogDescription>
                </DialogHeader>
                <Button type="button" onClick={alCerrar} className="cursor-pointer">Cerrar</Button>
            </div>
        );
    }

    const aplicar = () => {
        if (!aplicarDisenoAItem(item.id, h.presente)) {
            toast.error("Ese icono ya no está en tu dock.");
            return;
        }
        toast.success(h.presente ? `Diseño aplicado a «${item.label}»` : `«${item.label}» vuelve a ${dePlantilla ? "la plantilla" : "su aspecto de siempre"}`);
        alCerrar();
    };

    const restablecer = () => setH((actual) => proponer<DisenoIcono | null>(actual, null, { igual: disenosIguales }));

    const descripcion = h.presente
        ? `Diseño propio de este icono${cambiado ? " · con cambios sin aplicar" : ""}.`
        : dePlantilla
            ? `Usa el diseño de la plantilla «${perfil.plantilla?.nombre ?? ""}». Cambia algo para hacerlo solo de este icono.`
            : "Ahora se ve el icono de siempre. Cambia algo para empezar a diseñarlo.";

    return (
        <div className="space-y-4" data-editor-icono={item.id}>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-10">
                    <Wand2 className="size-5 text-cyan-300" aria-hidden /> Diseño del icono · {item.label}
                </DialogTitle>
                <DialogDescription id="editor-icono-descripcion">{descripcion}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
                <aside className="space-y-3 md:sticky md:top-0 md:self-start" aria-label="Vista previa">
                    <div ref={vistaRef} data-vista-principal="" className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 ring-1 ring-white/10">
                        {vista ? (
                            <VistaIcono diseno={vista} icono={Propio} iconKey={item.iconKey} lado={112} sobreDock />
                        ) : (
                            <IconoDeSiempre Icono={Propio} lado={112} />
                        )}
                        <div className="flex items-end justify-center gap-3" aria-hidden>
                            {[56, 44, 32].map((l) => (
                                <span key={l} className="flex flex-col items-center gap-1">
                                    {vista ? <VistaIcono diseno={vista} icono={Propio} iconKey={item.iconKey} lado={l} /> : <IconoDeSiempre Icono={Propio} lado={l} />}
                                    <span className="text-[10px] tabular-nums text-muted-foreground">{l}</span>
                                </span>
                            ))}
                        </div>
                        <p className="text-center text-xs text-muted-foreground" data-estado-vista="">
                            {vista ? (h.presente ? (cambiado ? "Vista previa · sin aplicar" : "Así se ve ahora") : "De la plantilla") : "Icono de siempre"}
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => setH(deshacer)} disabled={!puedeDeshacer(h)} aria-label="Deshacer" title="Deshacer" className="cursor-pointer"><Undo2 aria-hidden /></Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => setH(rehacer)} disabled={!puedeRehacer(h)} aria-label="Rehacer" title="Rehacer" className="cursor-pointer"><Redo2 aria-hidden /></Button>
                        <Button type="button" variant="outline" size="icon" onClick={restablecer} disabled={h.presente === null} aria-label={dePlantilla ? "Volver al diseño de la plantilla" : "Quitar el diseño: icono de siempre"} title={dePlantilla ? "Volver al diseño de la plantilla" : "Quitar el diseño: icono de siempre"} className="cursor-pointer"><RotateCcw aria-hidden /></Button>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                        Restablecer {dePlantilla ? "devuelve el icono al diseño de la plantilla del perfil." : "quita el diseño y deja el icono de siempre."} Puedes deshacerlo.
                    </p>
                </aside>

                <section className="min-w-0 space-y-3" aria-label="Opciones de diseño">
                    <div role="tablist" aria-label="Secciones del editor" className="grid grid-cols-3 gap-1 rounded-full bg-black/25 p-1 ring-1 ring-white/10">
                        {PESTANAS.map((p) => (
                            <button
                                key={p.id}
                                id={`tab-${p.id}`}
                                role="tab"
                                type="button"
                                aria-selected={pestana === p.id}
                                aria-controls={`panel-${p.id}`}
                                onClick={() => setPestana(p.id)}
                                className={cn(
                                    "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                                    pestana === p.id ? "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/50" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                                )}
                            >
                                {p.icono}<span className="truncate">{p.texto}</span>
                            </button>
                        ))}
                    </div>

                    <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`}>
                        {pestana === "diseno" && <ControlesDiseno diseno={trabajo} alCambiar={alCambiar} />}
                        {pestana === "ia" && (
                            <PanelVariacionesIA
                                base={trabajo}
                                etiquetaItem={item.label}
                                iconKey={item.iconKey}
                                iconoPropio={Propio}
                                alElegir={(d) => { alCambiar(d, "ia"); setPestana("diseno"); toast.success("Variación llevada al editor", { description: "Ajústala si quieres y pulsa «Aplicar»." }); }}
                            />
                        )}
                        {pestana === "compartir" && (
                            <div className="space-y-5">
                                <AplicarAlPerfil diseno={trabajo} etiqueta={item.label} alAplicar={alCerrar} />
                                <AccionesCompartir contenido={{ tipo: "diseno", diseno: trabajo, nombre: trabajo.nombre ?? item.label, glifoLucideSvg }} />
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {pidiendoDescartar && (
                <div role="alertdialog" aria-label="Cambios sin aplicar" className="flex flex-col gap-2 rounded-xl bg-amber-400/10 p-3 ring-1 ring-amber-300/25 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-amber-50/90">Tienes cambios sin aplicar. Si cierras ahora se pierden.</p>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setPidiendoDescartar(false)} className="cursor-pointer">Seguir editando</Button>
                        <Button type="button" variant="destructive" onClick={alCerrar} className="cursor-pointer">Descartar</Button>
                    </div>
                </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={intentarCerrar} className="cursor-pointer">Cerrar</Button>
                <Button type="button" onClick={aplicar} disabled={!cambiado} className="cursor-pointer"><Check aria-hidden /> {h.presente === null && propioInicial ? "Quitar el diseño" : "Aplicar a este icono"}</Button>
            </div>
        </div>
    );
}

/** «Usar este estilo en todo el perfil»: la forma, el fondo, el color y el brillo para todos, cada uno con su dibujo. */
function AplicarAlPerfil({ diseno, etiqueta, alAplicar }: { diseno: DisenoIcono; etiqueta: string; alAplicar: () => void }) {
    const [confirmar, setConfirmar] = useState(false);
    const [conservar, setConservar] = useState(true);
    const propios = confirmar ? contarDisenosPropios() : 0;

    const aplicar = () => {
        const plantilla = disenoComoPlantilla(diseno, { nombre: `Estilo de ${etiqueta}`, autor: "Yo" });
        if (!plantilla) { toast.error("No se pudo preparar el estilo."); return; }
        const r = aplicarPlantillaAlPerfil(plantilla, { conservarManuales: conservar });
        if (!r.ok) { toast.error(r.motivo ?? "No se pudo aplicar."); return; }
        toast.success("Estilo aplicado a todo tu dock", { description: `Cada icono conserva su dibujo. Puedes quitarlo desde «Plantillas de iconos».` });
        alAplicar();
    };

    return (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200/80"><Layers className="size-4" aria-hidden /> Todo el perfil</p>
            {!confirmar ? (
                <Button type="button" variant="outline" onClick={() => setConfirmar(true)} className="w-full cursor-pointer justify-start">
                    Usar este estilo en todos mis iconos
                </Button>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Todos los iconos tomarán la forma, el fondo, el color y el brillo de este diseño; cada uno conserva su propio dibujo. Viaja con tu cuenta.
                    </p>
                    {propios > 0 && (
                        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 text-xs ring-1 ring-white/10">
                            <span>Conservar los {propios} icono(s) que cambié a mano</span>
                            <Switch checked={conservar} onCheckedChange={setConservar} aria-label="Conservar los iconos que cambié a mano" />
                        </label>
                    )}
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setConfirmar(false)} className="cursor-pointer">Cancelar</Button>
                        <Button type="button" onClick={aplicar} className="cursor-pointer"><Check aria-hidden /> Aplicar a todo el perfil</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
