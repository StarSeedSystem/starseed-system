"use client";

/**
 * Guardar, compartir y exportar un diseño o una plantilla de iconos (Ola 1025U · V1b). Solo usa vías que
 * YA existen en el OS:
 *   · Guardar en la Biblioteca → `saveItem` (a través de `guardarEnBiblioteca`).
 *   · Compartir en la Librería → `PublishDialog` abierto en la categoría «Diseños de iconos».
 *   · Exportar → descarga de un archivo JSON (paquete `starseed.iconos`) o SVG (solo un diseño).
 *   · Adjuntar a una publicación → NO hay vía directa (el compositor solo recibe texto por la URL), así que
 *     el botón está apagado y lo dice, con un enlace real al compositor para subir el archivo descargado.
 */

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Download, FileJson, FileImage, Library, Loader2, Paperclip, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublishDialog } from "@/components/library/finder/publish-dialog";
import { readLibrarySnapshot, useMyLibraryDestinations, type SavedItem } from "@/lib/library/entity-library";
import { guardarEnBiblioteca } from "@/lib/dock/iconos/biblioteca";
import {
    AUTOR_DEFECTO,
    LICENCIA_DEFECTO,
    LIMITES,
    normalizarPlantilla,
    type DisenoIcono,
    type PlantillaIconos,
} from "@/lib/dock/iconos/modelo";
import { empaquetarDiseno, empaquetarPlantilla, nombreArchivo, paqueteATexto } from "@/lib/dock/iconos/paquete";
import { disenoASvg } from "@/lib/dock/iconos/render-svg";

export type ContenidoCompartible =
    | { tipo: "diseno"; diseno: DisenoIcono; nombre: string; /** Devuelve el `<svg>` del glifo de Lucide tal como se ve, para el SVG exportado. */ glifoLucideSvg?: () => string | undefined }
    | { tipo: "plantilla"; plantilla: PlantillaIconos };

const LICENCIAS = [LICENCIA_DEFECTO, "CC0 · dominio público", "CC BY 4.0 · con atribución", "Solo uso personal"] as const;
const CLAVE_AUTOR = "starseed.dock.iconos.autor.v1";

function leerAutor(): string {
    try { return window.localStorage.getItem(CLAVE_AUTOR) ?? ""; } catch { return ""; }
}

function descargar(texto: string, nombre: string, mime: string): void {
    const url = URL.createObjectURL(new Blob([texto], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // se suelta en el siguiente ciclo: algunos navegadores cancelan la descarga si se libera antes
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
    contenido: ContenidoCompartible;
    /** Se llama tras guardar con éxito (para refrescar «Mi Biblioteca» en la galería). */
    alGuardar?: () => void;
}

export function AccionesCompartir({ contenido, alGuardar }: Props) {
    const idNombre = useId();
    const idAutor = useId();
    const idLicencia = useId();
    const { destinations } = useMyLibraryDestinations();
    const selfRef = destinations[0]?.ref;

    const nombreInicial = contenido.tipo === "plantilla" ? contenido.plantilla.nombre : contenido.nombre;
    const [nombre, setNombre] = useState(nombreInicial);
    const [autor, setAutor] = useState(() => (contenido.tipo === "plantilla" && contenido.plantilla.autor !== AUTOR_DEFECTO ? contenido.plantilla.autor : leerAutor()));
    const [licencia, setLicencia] = useState<string>(contenido.tipo === "plantilla" ? contenido.plantilla.licencia : LICENCIAS[0]);
    const [ocupado, setOcupado] = useState<"" | "guardar" | "publicar">("");
    const [item, setItem] = useState<SavedItem | null>(null);
    const [publicar, setPublicar] = useState(false);

    /** El contenido con el nombre, autor y licencia que la persona puso aquí. */
    const tipo = contenido.tipo;
    const fuente = contenido.tipo === "plantilla" ? contenido.plantilla : contenido.diseno;
    const final = useMemo(() => {
        const aut = autor.trim() || AUTOR_DEFECTO;
        if (tipo === "plantilla") {
            const base = fuente as PlantillaIconos;
            const p = normalizarPlantilla({ ...base, nombre: nombre || base.nombre, autor: aut, licencia });
            return p ? ({ tipo: "plantilla", plantilla: p } as const) : null;
        }
        const base = fuente as DisenoIcono;
        const nom = (nombre || base.nombre || "Mi icono").slice(0, LIMITES.nombreMax);
        return { tipo: "diseno", diseno: { ...base, nombre: nom }, nombre: nom, autor: aut, licencia } as const;
    }, [tipo, fuente, nombre, autor, licencia]);

    const recordarAutor = () => { try { if (autor.trim()) window.localStorage.setItem(CLAVE_AUTOR, autor.trim()); } catch { /* noop */ } };

    const guardar = async (): Promise<SavedItem | null> => {
        if (!selfRef || !final) { toast.error("Inicia sesión para guardar en tu Biblioteca."); return null; }
        setOcupado("guardar");
        try {
            const r = await guardarEnBiblioteca(selfRef, final);
            if (!r.ok) { toast.error(r.error); return null; }
            recordarAutor();
            setItem(r.item);
            toast.success("Guardado en tu Biblioteca", { description: `«${nombre || nombreInicial}» queda en «Mi Biblioteca» con la etiqueta starseed-iconos.` });
            alGuardar?.();
            return r.item;
        } finally { setOcupado(""); }
    };

    const compartir = async () => {
        if (!selfRef) { toast.error("Inicia sesión para compartir en la Librería."); return; }
        setOcupado("publicar");
        try {
            const it = item ?? (await guardar());
            if (it) setPublicar(true);
        } finally { setOcupado(""); }
    };

    const exportarJson = () => {
        if (!final) return;
        const paquete = final.tipo === "plantilla" ? empaquetarPlantilla(final.plantilla) : empaquetarDiseno(final.diseno, new Date(), { autor: final.autor, licencia: final.licencia });
        descargar(paqueteATexto(paquete), nombreArchivo(nombre || nombreInicial, "json"), "application/json");
        toast.success("Archivo JSON descargado", { description: "Se puede importar desde «Plantillas de iconos»." });
    };

    const exportarSvg = () => {
        if (contenido.tipo !== "diseno") return;
        let lucide: string | undefined;
        try { lucide = contenido.glifoLucideSvg?.(); } catch { lucide = undefined; }
        descargar(disenoASvg(final?.tipo === "diseno" ? final.diseno : contenido.diseno, { glifoLucideSvg: lucide }), nombreArchivo(nombre || nombreInicial, "svg"), "image/svg+xml");
        toast.success("Archivo SVG descargado");
    };

    const sinSesion = !selfRef;
    const enlacePublicar = `/publicar?area=cultura&tipo=archivo&intent=${encodeURIComponent(`Mi diseño de iconos «${nombre || nombreInicial}»`)}`;

    return (
        <div className="space-y-4" data-acciones-compartir="">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={idNombre} className="text-xs">Nombre</Label>
                    <Input id={idNombre} value={nombre} maxLength={LIMITES.nombreMax} onChange={(e) => setNombre(e.target.value)} className="h-11 cursor-text" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor={idAutor} className="text-xs">Autoría</Label>
                    <Input id={idAutor} value={autor} maxLength={LIMITES.autorMax} onChange={(e) => setAutor(e.target.value)} placeholder="Tu nombre o alias" className="h-11 cursor-text" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor={idLicencia} className="text-xs">Licencia</Label>
                    <select
                        id={idLicencia}
                        value={licencia}
                        onChange={(e) => setLicencia(e.target.value)}
                        className="h-11 w-full cursor-pointer rounded-full border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {LICENCIAS.map((l) => <option key={l} value={l}>{l}</option>)}
                        {!(LICENCIAS as readonly string[]).includes(licencia) && <option value={licencia}>{licencia}</option>}
                    </select>
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => void guardar()} disabled={sinSesion || ocupado !== ""} className="cursor-pointer justify-start">
                    {ocupado === "guardar" ? <Loader2 className="animate-spin" aria-hidden /> : <Library aria-hidden />} Guardar en mi Biblioteca
                </Button>
                <Button type="button" onClick={() => void compartir()} disabled={sinSesion || ocupado !== ""} className="cursor-pointer justify-start">
                    {ocupado === "publicar" ? <Loader2 className="animate-spin" aria-hidden /> : <Share2 aria-hidden />} Compartir en la Librería
                </Button>
                <Button type="button" variant="outline" onClick={exportarJson} className="cursor-pointer justify-start">
                    <FileJson aria-hidden /> Exportar como JSON
                </Button>
                <Button type="button" variant="outline" onClick={exportarSvg} disabled={contenido.tipo !== "diseno"} title={contenido.tipo !== "diseno" ? "Una plantilla tiene muchos iconos: expórtala como JSON" : undefined} className="cursor-pointer justify-start">
                    <FileImage aria-hidden /> Exportar como SVG
                </Button>
            </div>

            {sinSesion && (
                <p role="note" className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100/90 ring-1 ring-amber-300/20">
                    Para guardar en tu Biblioteca o compartir en la Librería hace falta iniciar sesión. Exportar el archivo funciona sin cuenta.
                </p>
            )}

            <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                <Button type="button" variant="outline" disabled aria-describedby="iconos-adjuntar-motivo" className="w-full justify-start">
                    <Paperclip aria-hidden /> Adjuntar a una publicación
                </Button>
                <p id="iconos-adjuntar-motivo" className="mt-2 text-xs text-muted-foreground">
                    Todavía no se puede adjuntar desde aquí: el compositor de publicaciones solo recibe texto por el enlace, no archivos. Descarga el JSON o el SVG y súbelo allí como adjunto.
                </p>
                <Link href={enlacePublicar} className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-1 text-xs font-medium text-cyan-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                    <Download className="size-4" aria-hidden /> Abrir el compositor de publicaciones
                </Link>
            </div>

            {publicar && selfRef && item && (
                <PublishDialog mode="item" item={item} open={publicar} onOpenChange={setPublicar} entityRef={selfRef} doc={readLibrarySnapshot(selfRef)} defaultCategory="iconos" />
            )}
        </div>
    );
}
