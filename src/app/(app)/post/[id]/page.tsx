"use client";

// Ruta /post/[id] — Vista dedicada de una PUBLICACIÓN (entidad atómica del Módulo 5).
// Client component + useParams para evitar el constraint de tipos de `params`
// (Promise) del App Router de Next 15 y mantener el build verde. SSR-safe: la
// consulta de datos ocurre dentro de <PostView/> tras el montaje.

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import PostView from "@/components/posts/post-view";

export default function PostPage() {
    const params = useParams<{ id: string }>();
    const raw = params?.id;
    const id = Array.isArray(raw) ? raw[0] : (raw ?? "");

    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <div className="mx-auto max-w-3xl">
                <Link
                    href="/network"
                    className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-cyan-300"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </Link>

                <h1 className="flex items-center gap-2 text-2xl font-bold text-amber-50">
                    <FileText className="h-6 w-6 text-cyan-300" />
                    Publicación
                </h1>
                <p className="mb-6 mt-1 text-sm text-white/50">
                    Una entidad atómica: el mismo contenido, sus instancias, su alcance, sus
                    interacciones y sus comentarios anidados — sincronizado en tiempo real.
                </p>

                {id ? (
                    <PostView postId={id} />
                ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50">
                        No se ha indicado ninguna publicación en la ruta.
                    </div>
                )}
            </div>
        </main>
    );
}
