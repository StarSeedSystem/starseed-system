"use client";

// src/app/(app)/publicar/page.tsx
// Página contenedora del Composer universal de publicaciones. Mantiene el estilo
// de los wrappers de la app (baúles): <main> con padding, título y subtítulo.

// Evita el bailout de prerender estático (este árbol lee Supabase en cliente).
export const dynamic = "force-dynamic";

import PublicationComposer from "@/components/publish/publication-composer";

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
                <PublicationComposer />
            </div>
        </main>
    );
}
