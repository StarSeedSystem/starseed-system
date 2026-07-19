"use client";

/*
 * DesignsLibraryPanel — contenido de la pestaña "Diseños" de la Librería.
 * Categorías (temas, paletas, fondos, layouts, skins, estilos) en CARPETAS con
 * los archivos de diseño de todo el sistema y la red, más los diseños que el
 * usuario ha guardado en su Biblioteca. Acciones por archivo (abrir en Estudio,
 * aplicar a perfil/página, descargar, instalar, guardar en carpetas) vía
 * DesignFileCard. Un archivo de diseño se guarda en carpetas como cualquier
 * otro ítem de la Librería (SaveToLibrary → saveItem, mismo almacén real).
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Palette, Wand2, HardDriveDownload, ExternalLink } from "lucide-react";
import { DesignsBrowser } from "@/components/design/designs-browser";
import { DesignFileCard } from "@/components/design/design-file-card";
import { importDesignFile, type DesignFile } from "@/lib/design/design-files";

export function DesignsLibraryPanel() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imported, setImported] = useState<DesignFile | null>(null);

    async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const design = await importDesignFile(file);
        if (!design) { toast.error("Archivo de diseño no válido."); return; }
        setImported(design);
        toast.success(`«${design.nombre}» importado`);
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-primary/10 to-transparent p-4">
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/30 text-primary">
                        <Palette className="h-5 w-5" />
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-white">Diseños</h2>
                        <p className="text-[11px] text-white/50">Temas, paletas, fondos, layouts y skins — del sistema, la red y tu biblioteca.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input ref={fileInputRef} type="file" accept=".json,.ssdesign.json,application/json" className="hidden" onChange={onFilePicked} />
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-8 gap-1.5 border-white/15 text-xs">
                        <HardDriveDownload className="h-3.5 w-3.5" /> Importar archivo
                    </Button>
                    <Link href="/estudio" className="inline-flex items-center gap-1.5 rounded-lg bg-primary/80 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary">
                        <Wand2 className="h-3.5 w-3.5" /> Crear en el Estudio <ExternalLink className="h-3 w-3 opacity-70" />
                    </Link>
                </div>
            </div>

            {imported && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
                    <p className="mb-2 text-[11px] text-white/60">Diseño importado — aplícalo, ábrelo en el Estudio o guárdalo en una carpeta:</p>
                    <div className="max-w-md">
                        <DesignFileCard file={imported} />
                    </div>
                </div>
            )}

            <DesignsBrowser />
        </div>
    );
}

export default DesignsLibraryPanel;
