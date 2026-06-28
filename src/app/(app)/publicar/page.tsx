"use client";

// src/app/(app)/publicar/page.tsx
// Página contenedora del Composer universal de publicaciones. Mantiene el estilo
// de los wrappers de la app (baúles): <main> con padding, título y subtítulo.
//
// Aurora · acción `crear_publicacion`: la URL puede traer parámetros para
// prerellenar el flujo del compositor:
//   · `area`  → área del Módulo 5 (politica|educacion|cultura|general).
//   · `tipo`  → tipo de publicación (texto|articulo|imagen|…|lienzo|app|mixto).
//   · `intent` (alias `initial`) → texto de intención, prefijado como título.
// Se leen con useSearchParams() (envuelto en Suspense para evitar el bailout de
// prerender) y se mapean a la prop `initial` de <PublicationComposer/>.

// Evita el bailout de prerender estático (este árbol lee Supabase en cliente).
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PublicationComposer, {
    type PublicationComposerInitial,
} from "@/components/publish/publication-composer";
import type { AreaId, PublicationTypeId } from "@/lib/publish/publish";

// Allowlists para no inyectar valores arbitrarios desde la URL en las uniones.
const AREA_IDS: AreaId[] = ["politica", "educacion", "cultura", "general"];
const TYPE_IDS: PublicationTypeId[] = [
    "texto",
    "articulo",
    "imagen",
    "archivo",
    "enlace",
    "encuesta",
    "propuesta",
    "lienzo",
    "app",
    "mixto",
];

function buildInitial(
    params: ReturnType<typeof useSearchParams>,
): PublicationComposerInitial | undefined {
    const initial: PublicationComposerInitial = {};

    const area = params.get("area");
    if (area && (AREA_IDS as string[]).includes(area)) {
        initial.area = area as AreaId;
    }

    const tipo = params.get("tipo") ?? params.get("type");
    if (tipo && (TYPE_IDS as string[]).includes(tipo)) {
        initial.type = tipo as PublicationTypeId;
    }

    // Intención creadora → se prefija como título del contenido.
    const intent = params.get("intent") ?? params.get("initial");
    if (intent && intent.trim()) {
        initial.content = { title: intent.trim() };
    }

    return Object.keys(initial).length ? initial : undefined;
}

function PublicarComposer() {
    const params = useSearchParams();
    const initial = buildInitial(params);
    return <PublicationComposer initial={initial} />;
}

export default function PublicarPage() {
    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <div className="mx-auto max-w-4xl">
                <h1 className="text-2xl font-bold text-amber-50">Publicar · Composer universal</h1>
                <p className="mb-6 mt-1 text-sm text-white/50">
                    Crea cualquier publicación de principio a fin: elige el tipo, los perfiles desde
                    los que publicas, los destinos (páginas, perfiles, grupos, comunidades, entidades
                    federativas, mensajes, chats IA, bibliotecas, carpetas y tu red), y el formato,
                    con vista previa y apertura completa.
                </p>
                <Suspense fallback={<div className="h-24 w-full" />}>
                    <PublicarComposer />
                </Suspense>
            </div>
        </main>
    );
}
