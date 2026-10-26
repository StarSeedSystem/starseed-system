"use client";

/**
 * Elegir una imagen para un icono (Ola 1025U · V1b): del aparato (subida) o de la Biblioteca de la persona.
 * Sirve para el glifo de imagen y para las referencias de la IA. Devuelve un `Blob` ya validado (tipo y
 * tamaño); lo que no se pueda leer (una imagen de otro servidor que no da permiso) se dice, no se finge.
 */

import { useMemo, useRef, useState } from "react";
import { ImagePlus, Library, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readLibrarySnapshot, useMyLibraryDestinations } from "@/lib/library/entity-library";
import { TIPOS_IMAGEN_PERMITIDOS, blobDeUrl, esImagenPermitida } from "@/lib/dock/iconos/imagen";

export interface ImagenElegida { blob: Blob; nombre: string }

interface Props {
    alElegir: (imagen: ImagenElegida) => void | Promise<void>;
    /** Texto del botón de subida. */
    etiqueta?: string;
    ocupado?: boolean;
    className?: string;
}

interface ImagenDeBiblioteca { id: string; titulo: string; src: string }

export function SelectorImagen({ alElegir, etiqueta = "Subir una imagen", ocupado = false, className }: Props) {
    const entrada = useRef<HTMLInputElement>(null);
    const { destinations } = useMyLibraryDestinations();
    const ref = destinations[0]?.ref;
    const [verBiblioteca, setVerBiblioteca] = useState(false);
    const [trayendo, setTrayendo] = useState<string | null>(null);

    const imagenes = useMemo<ImagenDeBiblioteca[]>(() => {
        if (!ref || !verBiblioteca) return [];
        try {
            return readLibrarySnapshot(ref).items
                .filter((it) => (it.mime ?? "").startsWith("image/") && (it.url || it.thumbnail || (it.content ?? "").startsWith("data:image/")))
                .slice(0, 60)
                .map((it) => ({ id: it.id, titulo: it.title, src: it.thumbnail || it.url || it.content || "" }));
        } catch { return []; }
    }, [ref, verBiblioteca]);

    const subir = async (f: File | undefined) => {
        if (!f) return;
        const v = esImagenPermitida(f);
        if (!v.ok) { toast.error(v.motivo ?? "No se puede usar esa imagen."); return; }
        await alElegir({ blob: f, nombre: f.name });
    };

    const delaBiblioteca = async (img: ImagenDeBiblioteca) => {
        setTrayendo(img.id);
        try {
            const blob = await blobDeUrl(img.src);
            if (!blob) {
                toast.error("No pude leer esa imagen", { description: "El servidor donde está no deja usarla desde aquí. Descárgala y súbela desde tu aparato." });
                return;
            }
            await alElegir({ blob, nombre: img.titulo });
        } finally { setTrayendo(null); }
    };

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={ocupado} onClick={() => entrada.current?.click()} className="cursor-pointer">
                    {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />} {etiqueta}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setVerBiblioteca((v) => !v)}
                    aria-expanded={verBiblioteca}
                    disabled={!ref}
                    title={ref ? undefined : "Inicia sesión para usar tu Biblioteca"}
                    className="cursor-pointer"
                >
                    {verBiblioteca ? <X aria-hidden /> : <Library aria-hidden />} {verBiblioteca ? "Cerrar Biblioteca" : "De mi Biblioteca"}
                </Button>
                <input
                    ref={entrada}
                    type="file"
                    accept={TIPOS_IMAGEN_PERMITIDOS.join(",")}
                    className="sr-only"
                    aria-label="Elegir un archivo de imagen"
                    onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = ""; }}
                />
            </div>
            {verBiblioteca && (
                imagenes.length === 0 ? (
                    <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground">
                        No hay imágenes guardadas en tu Biblioteca. Guarda alguna desde la Galería o súbela desde tu aparato.
                    </p>
                ) : (
                    <ul className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6" aria-label="Imágenes de tu Biblioteca">
                        {imagenes.map((img) => (
                            <li key={img.id}>
                                <button
                                    type="button"
                                    onClick={() => void delaBiblioteca(img)}
                                    disabled={trayendo !== null}
                                    title={img.titulo}
                                    aria-label={`Usar ${img.titulo}`}
                                    className="relative grid aspect-square min-h-11 w-full cursor-pointer place-items-center overflow-hidden rounded-xl bg-white/[0.05] ring-1 ring-white/10 transition-transform duration-150 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={img.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                                    {trayendo === img.id && <Loader2 className="absolute size-5 animate-spin text-white" aria-hidden />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )
            )}
        </div>
    );
}
