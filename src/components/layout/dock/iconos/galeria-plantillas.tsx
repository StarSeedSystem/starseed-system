"use client";

/**
 * Galería de plantillas de iconos (Ola 1025U · V1b). Se abre desde el dock (`starseed:dock-plantillas`).
 * Tres orígenes, un solo gesto: las de serie, las que la persona guardó en su Biblioteca y las que la
 * comunidad publicó en la Librería («Diseños de iconos»). Aplicar una plantilla la pone en TODO el perfil
 * (viaja con la cuenta); lo que cada icono tuviera cambiado a mano se limpia o se conserva, a elegir.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, FileUp, Layers, Library, Loader2, Package, RotateCcw, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DOCK_FALLBACK_ICON, DOCK_ICON_MAP } from "@/components/layout/dock-config";
import { useMyLibraryDestinations } from "@/lib/library/entity-library";
import { usePerfilIconos } from "@/lib/dock/iconos/almacen";
import { listarGuardados, listarPublicos, type ElementoIconos, type ListaElementos } from "@/lib/dock/iconos/biblioteca";
import {
    AUTOR_DEFECTO,
    disenoComoPlantilla,
    disenoEfectivo,
    plantillaDesdeDock,
    type PlantillaIconos,
} from "@/lib/dock/iconos/modelo";
import { MAX_PAQUETE_CARACTERES, leerPaquete } from "@/lib/dock/iconos/paquete";
import { PLANTILLAS_SERIE } from "@/lib/dock/iconos/plantillas-serie";
import { AccionesCompartir } from "./acciones-compartir";
import { aplicarPlantillaAlPerfil, contarDisenosPropios, itemsDelDock, quitarPlantilla } from "./aplicar-dock";
import { VistaIcono } from "./icono-dock";

type Origen = "serie" | "biblioteca" | "libreria";

/** Los iconos con los que se enseña cada plantilla en su tarjeta. */
const MUESTRA = ["MessagesSquare", "Bell", "Users", "Settings", "Library", "Sparkles"] as const;

interface Props {
    abierto: boolean;
    alCerrar: () => void;
}

export function GaleriaPlantillas({ abierto, alCerrar }: Props) {
    return (
        <Dialog open={abierto} onOpenChange={(a) => { if (!a) alCerrar(); }}>
            <DialogContent className="max-h-[92dvh] max-w-4xl p-4 sm:p-6" aria-describedby="galeria-iconos-descripcion">
                <ContenidoGaleria alCerrar={alCerrar} />
            </DialogContent>
        </Dialog>
    );
}

/** El texto de un archivo. `Blob.text()` no existe en navegadores antiguos: ahí se lee con `FileReader`. */
function leerTexto(f: Blob): Promise<string> {
    if (typeof f.text === "function") return f.text();
    return new Promise((ok, mal) => {
        const lector = new FileReader();
        lector.onload = () => ok(String(lector.result ?? ""));
        lector.onerror = () => mal(lector.error ?? new Error("lectura"));
        lector.readAsText(f);
    });
}

function aPlantilla(e: ElementoIconos): PlantillaIconos | null {
    if (e.plantilla) return e.plantilla;
    if (e.diseno) return disenoComoPlantilla(e.diseno, { nombre: e.nombre, autor: e.autor, licencia: e.licencia });
    return null;
}

function Muestra({ plantilla }: { plantilla: PlantillaIconos }) {
    const perfil = useMemo(() => ({ v: 1 as const, plantilla, actualizado: 0 }), [plantilla]);
    return (
        <div className="flex items-center justify-between gap-1.5 rounded-xl bg-black/25 p-2" aria-hidden>
            {MUESTRA.map((k) => {
                const d = disenoEfectivo({ id: k, iconKey: k }, perfil);
                const Icono = DOCK_ICON_MAP[k] ?? DOCK_FALLBACK_ICON;
                return d ? <VistaIcono key={k} diseno={d} icono={Icono} iconKey={k} lado={36} /> : null;
            })}
        </div>
    );
}

interface TarjetaProps {
    plantilla: PlantillaIconos;
    aplicada: boolean;
    subtitulo?: string;
    alAplicar: () => void;
    extra?: ReactNode;
}

function Tarjeta({ plantilla, aplicada, subtitulo, alAplicar, extra }: TarjetaProps) {
    return (
        <li className={cn("flex flex-col gap-2.5 rounded-2xl border bg-white/[0.04] p-3 transition-colors duration-150 motion-reduce:transition-none", aplicada ? "border-cyan-300/50 bg-cyan-400/[0.06]" : "border-white/10")} data-plantilla={plantilla.id}>
            <Muestra plantilla={plantilla} />
            <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{plantilla.nombre}</span>
                    {aplicada && <span className="shrink-0 rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-medium text-cyan-100">En uso</span>}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{plantilla.autor} · {plantilla.licencia}</p>
                {subtitulo && <p className="text-[11px] text-muted-foreground">{subtitulo}</p>}
                {plantilla.descripcion && <p className="mt-1 line-clamp-2 text-xs text-foreground/75">{plantilla.descripcion}</p>}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
                <Button type="button" onClick={alAplicar} disabled={aplicada} aria-label={`Aplicar ${plantilla.nombre} a todo el perfil`} className="cursor-pointer">
                    <Check aria-hidden /> {aplicada ? "Aplicada" : "Aplicar a todo el perfil"}
                </Button>
                {extra}
            </div>
        </li>
    );
}

function ContenidoGaleria({ alCerrar }: { alCerrar: () => void }) {
    const perfil = usePerfilIconos();
    const { destinations, loading: cargandoDestinos } = useMyLibraryDestinations();
    const selfRef = destinations[0]?.ref;
    const idNombre = useId();
    const entradaArchivo = useRef<HTMLInputElement>(null);

    const [origen, setOrigen] = useState<Origen>("serie");
    const [guardados, setGuardados] = useState<ListaElementos | null>(null);
    const [publicos, setPublicos] = useState<ListaElementos | null>(null);
    const [pendiente, setPendiente] = useState<PlantillaIconos | null>(null);
    const [conservar, setConservar] = useState(true);
    const [importada, setImportada] = useState<PlantillaIconos | null>(null);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [nombreNueva, setNombreNueva] = useState("Mi dock");
    const [nueva, setNueva] = useState<PlantillaIconos | null>(null);
    const [confirmaQuitar, setConfirmaQuitar] = useState(false);

    const propios = useMemo(() => contarDisenosPropios(itemsDelDock()), []);

    const cargarGuardados = useCallback(async () => {
        if (!selfRef) { setGuardados({ elementos: [], descartados: 0 }); return; }
        setGuardados(null);
        setGuardados(await listarGuardados(selfRef));
    }, [selfRef]);

    useEffect(() => {
        if (origen === "biblioteca" && guardados === null && !cargandoDestinos) void cargarGuardados();
    }, [origen, guardados, cargandoDestinos, cargarGuardados]);

    useEffect(() => {
        if (origen !== "libreria" || publicos !== null) return;
        let vivo = true;
        listarPublicos().then((l) => { if (vivo) setPublicos(l); });
        return () => { vivo = false; };
    }, [origen, publicos]);

    const aplicarYa = (p: PlantillaIconos, conservarManuales: boolean) => {
        const r = aplicarPlantillaAlPerfil(p, { conservarManuales });
        if (!r.ok) { toast.error(r.motivo ?? "No se pudo aplicar la plantilla."); return; }
        setPendiente(null);
        toast.success(`«${p.nombre}» aplicada a todo tu perfil`, {
            description: r.limpiados ? `${r.limpiados} icono(s) que habías cambiado a mano ahora siguen la plantilla.` : r.conservados ? `${r.conservados} icono(s) cambiados a mano se conservan.` : "Los iconos nuevos que añadas también la usarán.",
        });
    };

    const pedirAplicar = (p: PlantillaIconos) => {
        if (propios > 0) { setPendiente(p); setConservar(true); } else aplicarYa(p, false);
    };

    const importar = async (f: File | undefined) => {
        if (!f) return;
        setAvisos([]);
        if (f.size > MAX_PAQUETE_CARACTERES) { setAvisos(["El archivo es demasiado grande para ser un diseño de iconos."]); return; }
        let texto = "";
        try { texto = await leerTexto(f); } catch { setAvisos(["No pude leer el archivo."]); return; }
        const l = leerPaquete(texto);
        if (!l.ok) { setAvisos(l.motivos); return; }
        const p = l.plantilla ?? (l.diseno ? disenoComoPlantilla(l.diseno, { nombre: l.diseno.nombre ?? f.name.replace(/\.json$/i, ""), autor: l.autor, licencia: l.licencia }) : null);
        if (!p) { setAvisos(["El archivo no trae nada que se pueda aplicar."]); return; }
        setImportada(p);
        setAvisos(l.motivos);
        toast.success(`«${p.nombre}» importada`, { description: "Revísala abajo y aplícala si te gusta." });
    };

    const crearDesdeDock = () => {
        const p = plantillaDesdeDock(itemsDelDock(), perfil, { nombre: nombreNueva.trim() || "Mi dock", autor: AUTOR_DEFECTO });
        if (!p) { toast.info("Tu dock todavía no tiene diseños", { description: "Aplica una plantilla o diseña algún icono y vuelve aquí." }); return; }
        setNueva(p);
    };

    const quitar = (todo: boolean) => {
        const r = quitarPlantilla({ tambienManuales: todo });
        setConfirmaQuitar(false);
        toast.success(todo ? "Todos los iconos vuelven a su aspecto de siempre" : "Plantilla quitada", { description: todo && r.quitadosManuales ? `${r.quitadosManuales} diseño(s) sueltos también se quitaron.` : "Los iconos que cambiaste a mano se quedan como estaban." });
    };

    const idAplicada = perfil.plantilla?.id;
    const lista = (l: ElementoIconos[]) =>
        l.map((e) => {
            const p = aPlantilla(e);
            if (!p) return null;
            return <Tarjeta key={`${e.origen}-${e.id}`} plantilla={p} aplicada={idAplicada === p.id} subtitulo={e.tipo === "diseno" ? "Un solo diseño: se usa como estilo para todos" : undefined} alAplicar={() => pedirAplicar(p)} />;
        });

    return (
        <div className="space-y-4" data-galeria-plantillas="">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-10"><Layers className="size-5 text-cyan-300" aria-hidden /> Plantillas de iconos</DialogTitle>
                <DialogDescription id="galeria-iconos-descripcion">
                    Cambia el aspecto de todos los iconos del dock de una vez. Se aplica a tu perfil y viaja con tu cuenta; cada icono sigue pudiéndose retocar por separado.
                </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
                <p className="text-xs">
                    {perfil.plantilla
                        ? <>Plantilla del perfil: <strong className="font-semibold">{perfil.plantilla.nombre}</strong> <span className="text-muted-foreground">· {perfil.plantilla.autor}</span></>
                        : <span className="text-muted-foreground">Ninguna plantilla aplicada: los iconos se ven como siempre.</span>}
                </p>
                {(perfil.plantilla || propios > 0) && !confirmaQuitar && (
                    <Button type="button" variant="outline" onClick={() => setConfirmaQuitar(true)} className="cursor-pointer"><RotateCcw aria-hidden /> Quitar diseños…</Button>
                )}
                {confirmaQuitar && (
                    <div className="flex flex-wrap gap-2">
                        {perfil.plantilla && <Button type="button" variant="outline" onClick={() => quitar(false)} className="cursor-pointer">Quitar la plantilla</Button>}
                        <Button type="button" variant="destructive" onClick={() => quitar(true)} className="cursor-pointer">Todo como de fábrica</Button>
                        <Button type="button" variant="ghost" onClick={() => setConfirmaQuitar(false)} className="cursor-pointer">Cancelar</Button>
                    </div>
                )}
            </div>

            {pendiente && (
                <div role="alertdialog" aria-label={`Aplicar ${pendiente.nombre}`} className="space-y-3 rounded-2xl bg-cyan-400/10 p-3 ring-1 ring-cyan-300/30">
                    <p className="text-sm">Vas a aplicar <strong>«{pendiente.nombre}»</strong> a todos tus iconos.</p>
                    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-black/20 px-3 text-xs">
                        <span>Conservar los {propios} icono(s) que cambié a mano</span>
                        <Switch checked={conservar} onCheckedChange={setConservar} aria-label="Conservar los iconos que cambié a mano" />
                    </label>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setPendiente(null)} className="cursor-pointer">Cancelar</Button>
                        <Button type="button" onClick={() => aplicarYa(pendiente, conservar)} className="cursor-pointer"><Check aria-hidden /> Aplicar</Button>
                    </div>
                </div>
            )}

            <div role="tablist" aria-label="De dónde vienen las plantillas" className="grid grid-cols-3 gap-1 rounded-full bg-black/25 p-1 ring-1 ring-white/10">
                {([["serie", "De serie", <Sparkles key="s" className="size-4" aria-hidden />], ["biblioteca", "Mi Biblioteca", <Library key="b" className="size-4" aria-hidden />], ["libreria", "Librería", <Users key="l" className="size-4" aria-hidden />]] as const).map(([id, texto, icono]) => (
                    <button
                        key={id}
                        role="tab"
                        type="button"
                        aria-selected={origen === id}
                        onClick={() => setOrigen(id)}
                        className={cn(
                            "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                            origen === id ? "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/50" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                        )}
                    >
                        {icono}<span className="truncate">{texto}</span>
                    </button>
                ))}
            </div>

            <div role="tabpanel" aria-label={origen === "serie" ? "Plantillas de serie" : origen === "biblioteca" ? "Plantillas de tu Biblioteca" : "Plantillas de la Librería"}>
                {origen === "serie" && (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {PLANTILLAS_SERIE.map((p) => <Tarjeta key={p.id} plantilla={p} aplicada={idAplicada === p.id} alAplicar={() => pedirAplicar(p)} />)}
                    </ul>
                )}

                {origen === "biblioteca" && (
                    cargandoDestinos || guardados === null ? <Cargando texto="Buscando en tu Biblioteca…" /> :
                    !selfRef ? <Vacio icono={<Library className="size-5" aria-hidden />} titulo="Inicia sesión para ver tu Biblioteca" texto="Las plantillas que guardes quedan en «Mi Biblioteca», con la etiqueta starseed-iconos." /> :
                    guardados.elementos.length === 0 ? <Vacio icono={<Library className="size-5" aria-hidden />} titulo="Aún no guardaste ninguna" texto="Diseña un icono y pulsa «Guardar en mi Biblioteca» en su pestaña «Guardar y compartir», o convierte tu dock en una plantilla aquí abajo." /> :
                    <>
                        {guardados.soloLocal && <p className="mb-2 text-[11px] text-amber-200/80">No pude consultar la nube: se muestran las guardadas en este aparato.</p>}
                        <ul className="grid gap-3 sm:grid-cols-2">{lista(guardados.elementos)}</ul>
                        {guardados.descartados > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{guardados.descartados} elemento(s) con la etiqueta de iconos no se pudieron leer (formato roto o no seguro) y no se muestran.</p>}
                    </>
                )}

                {origen === "libreria" && (
                    publicos === null ? <Cargando texto="Buscando en la Librería…" /> :
                    publicos.elementos.length === 0 ? <Vacio icono={<Users className="size-5" aria-hidden />} titulo="No hay diseños publicados todavía" texto="Puede que nadie haya publicado aún en «Diseños de iconos» o que no haya conexión con la Librería. Puedes ser la primera persona: comparte el tuyo desde el editor de un icono." /> :
                    <>
                        <ul className="grid gap-3 sm:grid-cols-2">{lista(publicos.elementos)}</ul>
                        {publicos.descartados > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{publicos.descartados} publicación(es) no se muestran: su contenido no es un diseño válido o no pasó el filtro de seguridad.</p>}
                    </>
                )}
            </div>

            <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3" aria-label="Importar y crear">
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => entradaArchivo.current?.click()} className="cursor-pointer"><FileUp aria-hidden /> Importar archivo JSON</Button>
                    <input ref={entradaArchivo} type="file" accept="application/json,.json" className="sr-only" aria-label="Elegir un archivo de iconos" onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = ""; }} />
                    <span className="text-[11px] text-muted-foreground">Archivos exportados desde el editor o descargados de la Librería.</span>
                </div>
                {avisos.length > 0 && <ul role="status" className="space-y-0.5 text-xs text-amber-100/90">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
                {importada && (
                    <ul className="grid gap-3 sm:grid-cols-2"><Tarjeta plantilla={importada} aplicada={idAplicada === importada.id} subtitulo="Importada de un archivo" alAplicar={() => pedirAplicar(importada)} extra={<Button type="button" variant="ghost" onClick={() => setImportada(null)} className="cursor-pointer">Descartar</Button>} /></ul>
                )}

                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1">
                        <Label htmlFor={idNombre} className="text-xs">Mi dock como plantilla</Label>
                        <Input id={idNombre} value={nombreNueva} maxLength={60} onChange={(e) => setNombreNueva(e.target.value)} className="h-11 cursor-text" />
                    </div>
                    <Button type="button" variant="outline" onClick={crearDesdeDock} className="cursor-pointer"><Package aria-hidden /> Crear desde mi dock</Button>
                </div>
                {nueva && (
                    <div className="space-y-3 rounded-xl bg-black/20 p-3">
                        <Muestra plantilla={nueva} />
                        <AccionesCompartir contenido={{ tipo: "plantilla", plantilla: nueva }} alGuardar={() => setGuardados(null)} />
                    </div>
                )}
            </section>

            <div className="flex justify-end border-t border-white/10 pt-3">
                <Button type="button" variant="ghost" onClick={alCerrar} className="cursor-pointer">Cerrar</Button>
            </div>
        </div>
    );
}

function Cargando({ texto }: { texto: string }) {
    return <p role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> {texto}</p>;
}

function Vacio({ icono, titulo, texto }: { icono: ReactNode; titulo: string; texto: string }) {
    return (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center">
            <span className="text-cyan-200/80">{icono}</span>
            <p className="text-sm font-medium">{titulo}</p>
            <p className="max-w-md text-xs text-muted-foreground">{texto}</p>
        </div>
    );
}
