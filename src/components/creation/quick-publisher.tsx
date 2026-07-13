"use client";

// src/components/creation/quick-publisher.tsx
// ─────────────────────────────────────────────────────────────────────────────
// ZONA DE PUBLICACIÓN (/crear?area=publicar&dest=…) — compositor rápido por
// contexto: los 4 destinos Trinity (Biblioteca · Política · Educación ·
// Cultura) + Mi Perfil/entidad propia, con los TIPOS especializados por
// sección y publicación REAL en os_posts (mismo mecanismo que /publish).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createPost } from "@/lib/os-social";
import {
    buildSsMetaComment,
    defaultTagFor,
    destToEntity,
    CREATION_DEST_BY_ID,
    type CreationDest,
} from "@/components/creation/creation-config";
import {
    DestSelector,
    TagSelector,
    type OwnEntityOption,
} from "@/components/creation/creation-fields";
import { Loader2, Send, Megaphone, ExternalLink } from "lucide-react";

/** La Zona de Publicación publica SIEMPRE en os_posts (no guarda en Librería). */
const QUICK_DESTS: CreationDest[] = ["perfil", "politica", "educacion", "cultura", "biblioteca", "propia"];

/** Rutas de cada sección para el enlace "ver sección" tras publicar. */
const SECTION_ROUTES: Partial<Record<CreationDest, string>> = {
    politica: "/network/politics",
    educacion: "/network/education",
    cultura: "/network/culture",
    biblioteca: "/library",
};

interface QuickPublisherProps {
    initialDest?: CreationDest;
}

export function QuickPublisher({ initialDest }: QuickPublisherProps) {
    const { toast } = useToast();
    const [dest, setDest] = useState<CreationDest>(initialDest ?? "politica");
    const [tags, setTags] = useState<string[]>([defaultTagFor(initialDest ?? "politica")]);
    const [own, setOwn] = useState<OwnEntityOption | null>(null);
    const [titulo, setTitulo] = useState("");
    const [body, setBody] = useState("");
    const [publishing, setPublishing] = useState(false);

    const changeDest = useCallback((d: CreationDest) => {
        setDest(d);
        setTags((prev) => (prev.length === 0 ? [defaultTagFor(d)] : prev));
    }, []);

    const handlePublish = useCallback(async () => {
        if (!titulo.trim() && !body.trim()) {
            toast({
                title: "Contenido vacío",
                description: "Escribe algo antes de publicar.",
                variant: "destructive",
            });
            return;
        }
        setPublishing(true);
        try {
            const primaryTipo = tags[0] || defaultTagFor(dest);
            const meta = buildSsMetaComment({ area: dest, tipo: primaryTipo, tags });
            const text = titulo.trim() ? `${titulo.trim()}\n\n${body.trim()}` : body.trim();
            const entity = destToEntity(dest, own);
            const res = await createPost({
                entityType: entity.entityType,
                entitySlug: entity.entitySlug,
                body: `${text}${meta ? `\n\n${meta}` : ""}`,
            });
            if (res.needsAuth) {
                toast({
                    title: "Inicia sesión",
                    description: "Necesitas una cuenta para publicar en la red.",
                    variant: "destructive",
                });
                return;
            }
            if (res.ok) {
                const destLabel =
                    dest === "propia" && own ? own.name : CREATION_DEST_BY_ID[dest].label;
                toast({
                    title: "Publicado",
                    description: `Tu ${primaryTipo} se publicó en ${destLabel}.`,
                });
                setTitulo("");
                setBody("");
            } else {
                toast({
                    title: "Error al publicar",
                    description: res.error || "Inténtalo de nuevo.",
                    variant: "destructive",
                });
            }
        } finally {
            setPublishing(false);
        }
    }, [titulo, body, dest, tags, own, toast]);

    const sectionRoute = SECTION_ROUTES[dest];
    const tipos = CREATION_DEST_BY_ID[dest];

    return (
        <div className="mx-auto w-full max-w-3xl space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-emerald-300" />
                    <h3 className="text-sm font-semibold text-white/90">Zona de Publicación</h3>
                    <span className="text-[10px] uppercase tracking-widest text-emerald-300/50 font-mono">
                        Publicar por contexto
                    </span>
                    {sectionRoute && (
                        <Link
                            href={sectionRoute}
                            className="ml-auto inline-flex items-center gap-1 text-xs text-white/40 hover:text-emerald-300 transition-colors cursor-pointer"
                        >
                            Ver {tipos.label}
                            <ExternalLink className="w-3 h-3" />
                        </Link>
                    )}
                </div>

                {/* Destino */}
                <DestSelector value={dest} onChange={changeDest} dests={QUICK_DESTS} ownValue={own} onOwnChange={setOwn} />

                {/* Etiquetas múltiples */}
                <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                        Etiquetas de la publicación
                    </p>
                    <TagSelector dest={dest} value={tags} onChange={setTags} />
                </div>

                {/* Contenido */}
                <div className="space-y-2">
                    <Input
                        placeholder={
                            dest === "politica"
                                ? "Título de la propuesta / debate…"
                                : dest === "educacion"
                                  ? "Título del curso / guía / recurso…"
                                  : dest === "cultura"
                                    ? "Título de la obra / evento…"
                                    : dest === "biblioteca"
                                      ? "Título del archivo / wiki…"
                                      : "Título (opcional)…"
                        }
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        className="bg-black/30 border-white/10"
                    />
                    <Textarea
                        placeholder="Desarrolla tu publicación…"
                        rows={5}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="bg-black/30 border-white/10 text-sm"
                    />
                </div>

                <div className="flex justify-end">
                    <Button
                        size="lg"
                        onClick={() => void handlePublish()}
                        disabled={publishing}
                        className="cursor-pointer gap-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 transition-all duration-200 shadow-[0_0_20px_rgba(16,185,129,0.12)]"
                    >
                        {publishing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                        {publishing ? "Publicando…" : "Publicar"}
                    </Button>
                </div>
            </div>

            <p className="text-center text-xs text-white/35">
                ¿Necesitas el compositor completo con adjuntos y referencias?{" "}
                <Link
                    href={`/publish${dest !== "perfil" && dest !== "propia" ? `?area=${dest}` : ""}`}
                    className="text-emerald-300/80 hover:text-emerald-200 underline underline-offset-2 cursor-pointer transition-colors"
                >
                    Abrir /publish
                </Link>
            </p>
        </div>
    );
}
