'use client';

// ════════════════════════════════════════════════════════════════
// Registro de visores — mapea ContentKind → componente.
// El visor 3D se importa con next/dynamic (ssr:false) para optimizar
// el peso inicial (sólo se carga cuando se abre un modelo).
// SOP: architecture/dashboard-launcher-apps-y-archivos.md §4
// ════════════════════════════════════════════════════════════════

import React from "react";
import dynamic from "next/dynamic";
import type { ContentKind } from "./content-types";
import {
    ImageViewer, GalleryViewer, MediaPlayer, PdfViewer, HtmlViewer,
    DocViewer, LinkCard, EntityCard, FallbackViewer, type ViewerProps,
} from "./viewers";

const ModelViewer = dynamic(() => import("./model-viewer"), {
    ssr: false,
    loading: () => (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground animate-pulse">
            Cargando visor 3D…
        </div>
    ),
});

const REGISTRY: Partial<Record<ContentKind, React.FC<ViewerProps>>> = {
    image: ImageViewer,
    gif: ImageViewer,
    gallery: GalleryViewer,
    video: MediaPlayer,
    audio: MediaPlayer,
    pdf: PdfViewer,
    html: HtmlViewer,
    markdown: DocViewer,
    code: DocViewer,
    text: DocViewer,
    model3d: ModelViewer as unknown as React.FC<ViewerProps>,
    link: LinkCard,
    entity: EntityCard,
};

export function ContentViewer({ resource }: ViewerProps) {
    const Comp = REGISTRY[resource.kind] ?? FallbackViewer;
    return <Comp resource={resource} />;
}

const KIND_LABEL: Record<ContentKind, string> = {
    image: "Imagen", gif: "GIF", gallery: "Galería", video: "Vídeo", audio: "Audio",
    pdf: "PDF", html: "HTML", model3d: "Modelo 3D", markdown: "Markdown", code: "Código",
    text: "Texto", dataset: "Dataset", link: "Enlace", entity: "Entidad", app: "App", unknown: "Archivo",
};

export function kindLabel(kind: ContentKind): string {
    return KIND_LABEL[kind] ?? "Archivo";
}
