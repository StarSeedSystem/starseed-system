"use client";

// ════════════════════════════════════════════════════════════════════════════
// «Convertir a…» en el clic derecho de cualquier archivo (Filee).
// ----------------------------------------------------------------------------
// Hook para los menús contextuales: dado el archivo sobre el que se abrió el
// menú, pregunta a la neurona a qué formatos sale (`/api/conversion?de=`) y
// devuelve lo que pinta el submenú y cómo convertir. Guardar el resultado lo
// decide quien llama (la Biblioteca lo añade junto al original; otras
// superficies pueden descargarlo). Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { normalizeAttachments } from "@/lib/aurora/attachments";
import { consultarDestinos, convertirBlob, convertirDesdeUrl, enlaceConversor, type Convertido } from "@/lib/conversion/cliente";
import { destinosParaMenu, etiquetaFormato, formatoDe } from "@/lib/conversion/formatos";

/** Lo que necesita el submenú «Convertir a…». */
export interface ConversionMenu {
    estado: "cargando" | "listo" | "no-disponible";
    /** Destinos en orden de uso (los habituales primero). */
    principales: string[];
    /** Cuántos más hay en «Más formatos…». */
    resto: number;
    motivo?: string;
    etiqueta: (f: string) => string;
    onConvertir: (a: string) => void;
    /** Abre /convertir con este archivo (todos los formatos, calidad, descargar). */
    onMas: () => void;
}

/** Un archivo convertible: por URL o por su contenido de texto. */
export interface ArchivoConvertible {
    nombre: string;
    url?: string;
    contenido?: string;
    tipoMime?: string;
    /** Carpeta de la Biblioteca donde está (para guardar el resultado al lado). */
    carpetaId?: string | null;
}

/**
 * El primer adjunto de un mensaje que se puede convertir (tiene URL real:
 * subida, data URL o ruta de la Biblioteca). `null` si el mensaje no lleva
 * ningún archivo convertible. Los adjuntos antiguos sin URL se ignoran.
 */
export function archivoDeAdjuntos(raw: unknown[] | null | undefined): ArchivoConvertible | null {
    const a = normalizeAttachments(raw).find((x) => !!x.url);
    return a?.url ? { nombre: a.name || "adjunto", url: a.url, tipoMime: a.mime } : null;
}

/** Nombre con extensión: el título si la trae; si no, la de la URL o la del tipo. */
export function nombreConExtension(a: ArchivoConvertible): string {
    const titulo = (a.nombre || "archivo").trim();
    if (formatoDe(titulo) && titulo.includes(".")) return titulo;
    const deUrl = a.url ? formatoDe(new URL(a.url, "http://x").pathname) : "";
    const deMime = a.tipoMime ? formatoDe(a.tipoMime) : "";
    const ext = deUrl || deMime || (a.contenido !== undefined ? "md" : "");
    return ext ? `${titulo}.${ext}` : titulo;
}

export function useConversionMenu(
    archivo: ArchivoConvertible | null,
    guardar: (c: Convertido, original: ArchivoConvertible) => Promise<string | null>,
): ConversionMenu | undefined {
    const [estado, setEstado] = useState<{ clave: string; principales: string[]; resto: number; motivo?: string; listo: boolean; ok: boolean } | null>(null);
    const nombre = archivo ? nombreConExtension(archivo) : "";
    const clave = archivo ? `${nombre}|${archivo.url ?? ""}` : "";

    useEffect(() => {
        if (!archivo || !formatoDe(nombre)) {
            setEstado(null);
            return;
        }
        let vivo = true;
        setEstado({ clave, principales: [], resto: 0, listo: false, ok: false });
        void consultarDestinos(nombre).then((c) => {
            if (!vivo) return;
            const m = destinosParaMenu(c.destinos, nombre);
            setEstado({ clave, principales: m.principales, resto: m.resto, motivo: c.motivo, listo: true, ok: c.disponible && m.principales.length > 0 });
        });
        return () => {
            vivo = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave]);

    const onConvertir = useCallback(
        (a: string) => {
            if (!archivo) return;
            const id = toast.loading(`Convirtiendo «${nombre}» a ${etiquetaFormato(a)} con Filee…`);
            void (async () => {
                try {
                    const c = archivo.url
                        ? await convertirDesdeUrl(archivo.url, nombre, a)
                        : await convertirBlob(new Blob([archivo.contenido ?? ""], { type: "text/markdown" }), nombre, a);
                    const donde = await guardar(c, archivo);
                    const extra = c.salidas > 1 ? ` (${c.salidas} archivos en un ZIP)` : "";
                    toast.success(`Listo: «${c.nombre}»${extra}${donde ? ` · ${donde}` : ""}`, { id });
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : "No se pudo convertir.", {
                        id,
                        action: { label: "Abrir conversor", onClick: () => window.location.assign(enlaceConversor({ url: archivo.url, nombre, a })) },
                    });
                }
            })();
        },
        [archivo, nombre, guardar],
    );

    const onMas = useCallback(() => {
        if (!archivo) return;
        window.location.assign(enlaceConversor({ url: archivo.url, nombre }));
    }, [archivo, nombre]);

    if (!archivo || !estado || estado.clave !== clave) return undefined;
    return {
        estado: !estado.listo ? "cargando" : estado.ok ? "listo" : "no-disponible",
        principales: estado.principales,
        resto: estado.resto,
        motivo: estado.motivo,
        etiqueta: etiquetaFormato,
        onConvertir,
        onMas,
    };
}
