"use client";

// ════════════════════════════════════════════════════════════════
// DocumentsWidget — «Archivos»: tus archivos REALES del OS (Ola 0929 · D)
// ----------------------------------------------------------------
// Los archivos que subiste a la Biblioteca (`os_files`, los mismos de
// /library y del explorador de neuronas; columnas justas, nunca `*`), no
// la tabla `documents`, que ningún módulo del OS escribe. Cada archivo es
// una hoja del color de su formato (imagen, vídeo, audio, PDF, texto,
// código, 3D, app…) con su miniatura si es una imagen, su tamaño, si es
// público o privado y desde qué neurona llegó. Búsqueda, tipo y
// rejilla/lista en l/xl; subir y abrir en tu Biblioteca a un toque.
// Lectura compartida cada ≥ 10 min, solo a la vista.
//
// micro = cuántos · s = composición por formato + el último · m = las
// cuatro últimas hojas · torre = columna · l = explorador · xl =
// composición + explorador · panorámico = composición + hojas en fila.
// Estados: cargando (rejilla), sin sesión, vacío con «Subir archivo»,
// error con reintento.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import {
    AppWindow, Box, File as FileIcon, FileCode2, FileText, FileType2, Film, FolderOpen, Image as ImageIcon, Link2, Music, Upload,
} from "lucide-react";
import { detectFormat, type FileFormat } from "@/components/files/file-preview";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { listMyFiles, type OsFile } from "@/lib/files/os-files";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { useEnPantalla, useFuenteCompartida } from "./_social-d/fuente-compartida";
import { BotonActualizar, BotonIcono } from "./_social-d/piezas";
import { useExplorador, type ArchivoVista, type TipoArchivo } from "./_social-d/archivos-piezas";
import { DisposicionArchivos } from "./_social-d/disposicion-archivos";
import { msDe, plural } from "./_social-d/formato";

const ACENTO = "#e0a43a";
const INTERVALO = 10 * 60_000;

const FORMATO: Record<FileFormat, TipoArchivo> = {
    image: { id: "image", etiqueta: "Imagen", icono: ImageIcon, color: "#ec4899" },
    video: { id: "video", etiqueta: "Vídeo", icono: Film, color: "#a855f7" },
    audio: { id: "audio", etiqueta: "Audio", icono: Music, color: "#22d3ee" },
    pdf: { id: "pdf", etiqueta: "PDF", icono: FileText, color: "#f87171" },
    markdown: { id: "markdown", etiqueta: "Texto", icono: FileType2, color: "#94a3b8" },
    code: { id: "code", etiqueta: "Código", icono: FileCode2, color: "#34d399" },
    link: { id: "link", etiqueta: "Enlace", icono: Link2, color: "#60a5fa" },
    model3d: { id: "model3d", etiqueta: "3D", icono: Box, color: "#fbbf24" },
    app: { id: "app", etiqueta: "App", icono: AppWindow, color: "#818cf8" },
    generic: { id: "generic", etiqueta: "Archivo", icono: FileIcon, color: "#e0a43a" },
};

/** «1,2 MB» (PURO). */
export function tamanoLegible(bytes: number | null | undefined): string | null {
    if (!bytes || bytes <= 0) return null;
    const u = ["B", "KB", "MB", "GB"];
    let v = bytes, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toLocaleString("es-ES", { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${u[i]}`;
}

/** Un archivo del OS como hoja (PURO). */
export function hojaDeArchivo(f: OsFile): ArchivoVista {
    const formato = detectFormat({ name: f.name, mime: f.mime, url: f.url });
    const tipo = FORMATO[formato] ?? FORMATO.generic;
    const extension = f.name.includes(".") ? f.name.split(".").pop()?.toUpperCase() ?? null : null;
    return {
        id: f.id,
        nombre: f.name,
        tipo,
        detalle: [extension, tamanoLegible(f.size)].filter(Boolean).join(" · ") || null,
        imagen: formato === "image" ? f.url : null,
        marcas: [f.isPublic ? { texto: "pública", color: "#10b981" } : { texto: "privada", color: "#94a3b8" }, ...(f.groupSlug ? [{ texto: f.groupSlug }] : [])],
        ms: msDe(f.createdAt),
        href: "/library?view=personal",
        buscable: `${f.mime ?? ""} ${f.groupSlug ?? ""}`,
    };
}

async function cargarArchivos() {
    const archivos = await listMyFiles({ limit: 24 });
    return { datos: archivos };
}

export function DocumentsWidget() {
    const { uid, ready } = useCurrentUid();
    const refRaiz = React.useRef<HTMLDivElement | null>(null);
    const enPantalla = useEnPantalla(refRaiz);
    const fuente = useFuenteCompartida<OsFile[]>(uid ? `archivos:${uid}` : null, cargarArchivos, { intervaloMs: INTERVALO, enPantalla });
    const hojas = React.useMemo(() => (fuente.datos ?? []).map(hojaDeArchivo), [fuente.datos]);
    const ex = useExplorador(hojas);
    const estado = estadoSocial({
        sinSesion: ready && !uid,
        cargando: !ready || fuente.cargando,
        hayDatos: hojas.length > 0,
        error: fuente.fallo ? new Error(fuente.fallo.message || "fuente") : undefined,
    });

    return (
        <div ref={refRaiz} className="h-full w-full">
            <MarcoSocial
                titulo="Archivos"
                subtitulo={`${plural(hojas.length, "archivo reciente", "archivos recientes")}`}
                icono={FolderOpen}
                categoria="archivos"
                acento={ACENTO}
                estado={estado}
                error={fuente.fallo ? new Error(fuente.fallo.message || "fuente") : undefined}
                onReintentar={fuente.recargar}
                esqueleto="rejilla"
                sinSesion={{ mensaje: "Entra para ver tus archivos en cualquier neurona." }}
                vacio={{ icono: Upload, accion: { etiqueta: "Subir archivo", href: "/library?view=personal" } }}
                acciones={(t) => (
                    <>
                        <BotonActualizar onClick={fuente.recargar} actualizando={fuente.actualizando} actualizado={fuente.actualizado} acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={Upload} etiqueta="Subir o gestionar en tu Biblioteca" href="/library?view=personal" acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => (
                    <DisposicionArchivos t={t} archivos={hojas} ex={ex}
                        textos={{ singular: "archivo", plural: "archivos", buscar: "Buscar por nombre o tipo…", hrefTodo: "/library?view=personal", etiquetaTodo: "Abrir en la Biblioteca", icono: FolderOpen }} />
                )}
            </MarcoSocial>
        </div>
    );
}

export default DocumentsWidget;
