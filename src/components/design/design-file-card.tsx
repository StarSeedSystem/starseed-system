"use client";

/*
 * DesignFileCard — ficha reutilizable de un archivo de diseño (.ssdesign.json)
 * con TODAS las acciones que pide el sistema: abrir en el Estudio, aplicar al
 * perfil o a una página/grupo que administras, descargar, instalar (= aplicar
 * + guardar) y guardar en una carpeta de la Biblioteca (reusa SaveToLibrary).
 *
 * No reinventa nada: todas las acciones llaman a los helpers de
 * `@/lib/design/design-files.ts`, que a su vez usan el contrato theme-engine y
 * el almacén real de la Librería.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { useMyLibraryDestinations } from "@/lib/library/entity-library";
import { Download, Wand2, Sparkles, MoreHorizontal, Globe, User, Loader2, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    type DesignFile, DESIGN_TYPE_LABEL, applyDesignToProfile, applyDesignToEntity,
    downloadDesignFile, saveDesignToLibrary, designToSaveInput, stashDesignForStudio, studioHref,
} from "@/lib/design/design-files";

export interface DesignFileCardProps {
    file: DesignFile;
    onApplied?: () => void;
    /** Oculta la descripción y compacta la ficha (para grids densos). */
    compact?: boolean;
    className?: string;
}

export function DesignFileCard({ file, onApplied, compact, className }: DesignFileCardProps) {
    const router = useRouter();
    const { destinations } = useMyLibraryDestinations();
    const [busy, setBusy] = useState(false);

    const pageTargets = useMemo(
        () => destinations.filter((d) => d.ref.kind === "page" || d.ref.kind === "group"),
        [destinations],
    );
    const myRef = destinations[0]?.ref ?? null;

    const swatches = file.preview.colors.slice(0, 4);

    function openInStudio() {
        stashDesignForStudio(file);
        router.push(studioHref(file.id));
    }

    function applyProfile() {
        const ok = applyDesignToProfile(file);
        if (ok) toast.success(`«${file.nombre}» aplicado a tu perfil.`, { description: "Cambia el aspecto de tu StarSeed. Revertible desde Ajustes → Apariencia." });
        else toast.error("No se pudo aplicar el diseño.");
        onApplied?.();
    }

    async function applyEntity(refKey: string, label: string) {
        const dest = destinations.find((d) => `${d.ref.kind}:${d.ref.id}` === refKey);
        if (!dest) return;
        setBusy(true);
        try {
            await applyDesignToEntity(file, dest.ref);
            toast.success(`«${file.nombre}» aplicado a ${label}.`, { description: "Se ve al abrir esa entidad." });
            onApplied?.();
        } catch {
            toast.error("No se pudo aplicar a la entidad.");
        } finally {
            setBusy(false);
        }
    }

    async function install() {
        setBusy(true);
        try {
            applyDesignToProfile(file);
            if (myRef) await saveDesignToLibrary(myRef, file);
            toast.success(`«${file.nombre}» instalado`, { description: "Aplicado a tu perfil y guardado en tu biblioteca." });
            onApplied?.();
        } catch {
            toast.error("No se pudo instalar el diseño.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={cn("group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]", className)}>
            <button type="button" onClick={openInStudio} className="flex items-start gap-3 text-left cursor-pointer" title="Abrir en el Estudio Universal de Diseño">
                <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10">
                    <div className="absolute inset-0 flex">
                        {(swatches.length ? swatches : ["#8B5CF6", "#06B6D4"]).map((c, i) => (
                            <span key={i} style={{ background: c }} className="h-full flex-1" />
                        ))}
                    </div>
                    {file.preview.emoji && <span className="relative text-xl drop-shadow">{file.preview.emoji}</span>}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{file.nombre}</p>
                    <p className="text-[10px] uppercase tracking-wide text-primary/80">{DESIGN_TYPE_LABEL[file.tipo]}{file.estilo ? ` · ${file.estilo}` : ""}</p>
                    {!compact && file.descripcion && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/50">{file.descripcion}</p>
                    )}
                </div>
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={openInStudio} className="h-7 gap-1 border-white/15 text-[11px]">
                    <Wand2 className="h-3 w-3" /> Estudio
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" disabled={busy} className="h-7 gap-1 bg-primary/80 text-[11px] text-white hover:bg-primary">
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Aplicar a…
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="border-white/10 bg-black/90 text-white backdrop-blur-xl">
                        <DropdownMenuLabel className="text-[11px] text-white/50">Aplicar diseño</DropdownMenuLabel>
                        <DropdownMenuItem onClick={applyProfile} className="cursor-pointer gap-2 text-xs">
                            <User className="h-3.5 w-3.5" /> Perfil actual (tu StarSeed)
                        </DropdownMenuItem>
                        {pageTargets.length > 0 && <DropdownMenuSeparator className="bg-white/10" />}
                        {pageTargets.map((d) => (
                            <DropdownMenuItem key={`${d.ref.kind}:${d.ref.id}`} onClick={() => void applyEntity(`${d.ref.kind}:${d.ref.id}`, d.label)} className="cursor-pointer gap-2 text-xs">
                                <Globe className="h-3.5 w-3.5" /> {d.label}{d.hint ? ` · ${d.hint}` : ""}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <SaveToLibrary item={designToSaveInput(file)} variant="icon" className="h-7 w-7" />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-white/60 hover:text-white" title="Más acciones">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="border-white/10 bg-black/90 text-white backdrop-blur-xl">
                        <DropdownMenuItem onClick={() => void install()} className="cursor-pointer gap-2 text-xs">
                            <Sparkles className="h-3.5 w-3.5" /> Instalar (aplicar + guardar)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { downloadDesignFile(file); toast.success("Descargado .ssdesign.json"); }} className="cursor-pointer gap-2 text-xs">
                            <Download className="h-3.5 w-3.5" /> Descargar archivo
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={openInStudio} className="cursor-pointer gap-2 text-xs">
                            <FolderInput className="h-3.5 w-3.5" /> Abrir en el Estudio
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

export default DesignFileCard;
