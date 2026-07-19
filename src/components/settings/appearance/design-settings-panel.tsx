"use client";

/*
 * DesignSettingsPanel — subsección de personalización del perfil basada en el
 * Estudio Universal de Diseño. Tres bloques (requisito literal):
 *   (a) Importar diseño — desde el DISPOSITIVO (archivo .json/.ssdesign.json),
 *       desde la LIBRERÍA (set curado del sistema) o desde la BIBLIOTECA (tus
 *       diseños guardados).
 *   (b) Temas — categorías de diseños organizadas en CARPETAS y archivos; al
 *       abrir uno se abre en el Estudio (/estudio?design=id) para personalizarlo.
 *   (c) Exportar diseño — captura tu personalización ACTUAL a un archivo
 *       descargable (.ssdesign.json) y/o la guarda en tu Biblioteca.
 *
 * Todo reutiliza @/lib/design/design-files.ts (contrato theme-engine) y el
 * almacén real de la Librería. Aditivo: no toca el theming existente.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, HardDriveDownload, Library, BookMarked, Download, Wand2, ExternalLink } from "lucide-react";
import { DesignsBrowser } from "@/components/design/designs-browser";
import { DesignFileCard } from "@/components/design/design-file-card";
import { importDesignFile, captureCurrentDesign, downloadDesignFile, type DesignFile } from "@/lib/design/design-files";

export function DesignSettingsPanel() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imported, setImported] = useState<DesignFile | null>(null);
    const [captured, setCaptured] = useState<DesignFile | null>(null);
    const [pickerOpen, setPickerOpen] = useState<null | "libreria" | "biblioteca">(null);

    async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const design = await importDesignFile(file);
        if (!design) { toast.error("Archivo de diseño no válido."); return; }
        setImported(design);
        toast.success(`«${design.nombre}» importado`, { description: "Aplícalo, ábrelo en el Estudio o guárdalo en tu biblioteca." });
    }

    function exportNow() {
        const d = captureCurrentDesign("Mi personalización");
        downloadDesignFile(d);
        toast.success("Personalización exportada (.ssdesign.json)");
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-white">Estudio Universal de Diseño</h3>
                    <p className="text-[11px] text-white/45">Importa, explora, aplica y exporta diseños de tu perfil.</p>
                </div>
                <Link href="/estudio" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/70 transition-colors hover:bg-white/10">
                    <Wand2 className="h-3.5 w-3.5" /> Abrir Estudio <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
            </div>

            {/* (a) Importar diseño */}
            <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                    <Upload className="h-3.5 w-3.5" /> Importar diseño
                </div>
                <div className="flex flex-wrap gap-2">
                    <input ref={fileInputRef} type="file" accept=".json,.ssdesign.json,application/json" className="hidden" onChange={onFilePicked} />
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-8 gap-1.5 border-white/15 text-xs">
                        <HardDriveDownload className="h-3.5 w-3.5" /> Desde el dispositivo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPickerOpen("libreria")} className="h-8 gap-1.5 border-white/15 text-xs">
                        <Library className="h-3.5 w-3.5" /> Desde la Librería
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPickerOpen("biblioteca")} className="h-8 gap-1.5 border-white/15 text-xs">
                        <BookMarked className="h-3.5 w-3.5" /> Desde la Biblioteca
                    </Button>
                </div>
                {imported && (
                    <div className="pt-1">
                        <p className="mb-2 text-[11px] text-white/45">Diseño importado — elige qué hacer con él:</p>
                        <DesignFileCard file={imported} onApplied={() => { /* mantiene la ficha visible */ }} />
                    </div>
                )}
            </section>

            {/* (b) Temas: categorías en carpetas + archivos */}
            <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                    <Wand2 className="h-3.5 w-3.5" /> Temas y diseños
                </div>
                <p className="text-[11px] text-white/45">Organizados en carpetas por categoría. Abre uno para personalizarlo en el Estudio y aplicarlo donde corresponda.</p>
                <DesignsBrowser maxHeight={460} />
            </section>

            {/* (c) Exportar diseño */}
            <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                    <Download className="h-3.5 w-3.5" /> Exportar diseño
                </div>
                <p className="text-[11px] text-white/45">Empaqueta tu personalización actual como archivo compartible.</p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={exportNow} className="h-8 gap-1.5 bg-primary/80 text-xs text-white hover:bg-primary">
                        <Download className="h-3.5 w-3.5" /> Descargar .ssdesign.json
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCaptured(captureCurrentDesign("Mi personalización"))} className="h-8 gap-1.5 border-white/15 text-xs">
                        <Wand2 className="h-3.5 w-3.5" /> Preparar (guardar / abrir en Estudio)
                    </Button>
                </div>
                {captured && (
                    <div className="pt-1">
                        <DesignFileCard file={captured} />
                    </div>
                )}
            </section>

            <Dialog open={pickerOpen !== null} onOpenChange={(o) => !o && setPickerOpen(null)}>
                <DialogContent className="max-w-4xl border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base">
                            {pickerOpen === "biblioteca" ? "Desde la Biblioteca — tus diseños guardados" : "Desde la Librería — set curado del sistema"}
                        </DialogTitle>
                    </DialogHeader>
                    <DesignsBrowser showCurated={pickerOpen !== "biblioteca"} maxHeight={520} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default DesignSettingsPanel;
