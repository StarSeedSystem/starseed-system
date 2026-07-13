"use client";

// ════════════════════════════════════════════════════════════════════════════
// PublicCatalogSection — sección "Comunidad" del área Librería de /library.
// Navegación por categorías y folders públicos de `library_public_items`, con
// vista previa embebida (reusa FilePreview) y "Guardar en biblioteca" por
// ítem. Distinta del catálogo de paquetes builtin (packages.ts/PackageStore):
// esto es contenido PUBLICADO por usuarios desde sus propias Bibliotecas.
//
// SOP: architecture/libreria-biblioteca-sync.md (§7).
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, Folder, FolderOpen, ChevronRight, Home, Loader2, Users, Bookmark } from "lucide-react";
import { FilePreview } from "@/components/files/file-preview";
import {
    usePublicCatalog, foldersOf, PUBLIC_CATEGORIES, type PublicCategory, type PublicItem,
} from "@/lib/library/public-catalog";
import { saveItem, useMyLibraryDestinations } from "@/lib/library/entity-library";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY_LABEL: Record<PublicCategory, string> = {
    app: "Apps", widget: "Widgets", page: "Páginas", publication: "Publicaciones",
    board: "Pizarras", research: "Investigación", project: "Proyectos", design: "Diseño",
    animation: "Animación", function: "Funciones", "ai-source": "Fuentes IA", repo: "Repos",
    agent: "Agentes", otro: "Otro",
};

function GuardarEnBibliotecaMini({ item }: { item: PublicItem }) {
    const { destinations, loading } = useMyLibraryDestinations();
    const [selectedKey, setSelectedKey] = useState("");
    const [saving, setSaving] = useState(false);
    const selected = destinations.find((d) => `${d.ref.kind}:${d.ref.id}` === selectedKey) ?? destinations[0];

    const handleSave = async () => {
        if (!selected) {
            toast.error("Inicia sesión para guardar en una biblioteca");
            return;
        }
        setSaving(true);
        try {
            const res = await saveItem(selected.ref, {
                type: item.payload.route ? "route" : "external",
                route: item.payload.route,
                url: item.payload.url,
                title: item.name,
                tags: item.tags,
            });
            if (res.ok) toast.success("Guardado en biblioteca", { description: `«${item.name}» en ${selected.label}.` });
            else toast.error("No se pudo guardar");
        } finally {
            setSaving(false);
        }
    };

    if (loading || destinations.length === 0) return null;

    return (
        <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void handleSave()}
            className="w-full cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10"
        >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
            Guardar en biblioteca
        </Button>
    );
}

function PublicItemCard({ item }: { item: PublicItem }) {
    return (
        <GlassCard className="flex flex-col gap-2 p-3" intensity="low">
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">{CATEGORY_LABEL[item.category]}{item.folder ? ` · ${item.folder}` : ""}</p>
            </div>
            <FilePreview
                file={{
                    url: item.payload.url,
                    name: item.name,
                    mime: item.payload.mime,
                    type: item.payload.type,
                    thumbnail: item.payload.thumbnail,
                    content: item.payload.content,
                    language: item.payload.language,
                    description: item.payload.description,
                }}
                context="library"
                actions={false}
                compact
            />
            {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 4).map((t) => (
                        <span key={t} className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            #{t}
                        </span>
                    ))}
                </div>
            )}
            <GuardarEnBibliotecaMini item={item} />
        </GlassCard>
    );
}

export function PublicCatalogSection() {
    const [category, setCategory] = useState<PublicCategory | "todas">("todas");
    const [folder, setFolder] = useState("");
    const [query, setQuery] = useState("");

    const { items, loading } = usePublicCatalog(category === "todas" ? undefined : { category });

    const subfolders = useMemo(
        () => (category === "todas" ? [] : foldersOf(items, category).filter((f) => f.startsWith(folder))),
        [items, category, folder],
    );

    const visible = useMemo(() => {
        let list = items;
        if (folder) list = list.filter((it) => it.folder === folder || it.folder.startsWith(`${folder}/`));
        const q = query.trim().toLowerCase();
        if (q) list = list.filter((it) => it.name.toLowerCase().includes(q) || it.tags.some((t) => t.toLowerCase().includes(q)));
        return list;
    }, [items, folder, query]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 text-emerald-300" />
                Comunidad — archivos y folders publicados por otros usuarios de StarSeed, navegables por categoría.
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar en la Comunidad…"
                        className="h-9 rounded-xl border-white/10 bg-black/20 pl-8 text-xs"
                    />
                </div>
                <Select
                    value={category}
                    onValueChange={(v) => {
                        setCategory(v as PublicCategory | "todas");
                        setFolder("");
                    }}
                >
                    <SelectTrigger className="h-9 w-48 border-white/15 bg-black/30 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                        <SelectItem value="todas" className="text-xs">Todas las categorías</SelectItem>
                        {PUBLIC_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c} className="text-xs">
                                {CATEGORY_LABEL[c]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {category !== "todas" && (
                <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => setFolder("")}
                        className={cn("flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium hover:bg-white/5 hover:text-white", !folder && "text-white")}
                    >
                        <Home className="h-3 w-3" /> {CATEGORY_LABEL[category]}
                    </button>
                    {folder.split("/").filter(Boolean).map((seg, i, arr) => {
                        const path = arr.slice(0, i + 1).join("/");
                        return (
                            <span key={path} className="flex items-center gap-1">
                                <ChevronRight className="h-3 w-3 opacity-40" />
                                <button
                                    type="button"
                                    onClick={() => setFolder(path)}
                                    className={cn("cursor-pointer rounded-md px-1.5 py-0.5 font-medium hover:bg-white/5 hover:text-white", path === folder && "text-white")}
                                >
                                    {seg}
                                </button>
                            </span>
                        );
                    })}
                </nav>
            )}

            {category !== "todas" && subfolders.filter((f) => f !== folder).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {subfolders
                        .filter((f) => f !== folder && (folder ? f.startsWith(`${folder}/`) : true))
                        .map((f) => {
                            const label = folder ? f.slice(folder.length + 1) : f;
                            if (label.includes("/")) return null; // solo un nivel a la vez
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    onClick={() => setFolder(f)}
                                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/5 hover:text-white"
                                >
                                    {folder === f ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />} {label}
                                </button>
                            );
                        })}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando Comunidad…
                </div>
            ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center text-muted-foreground">
                    <Users className="h-8 w-8 opacity-20" />
                    <p className="text-sm">Nada publicado aquí todavía.</p>
                    <p className="max-w-sm text-xs">
                        Desde tu Biblioteca, usa «Publicar en la Librería…» sobre cualquier ítem o folder para que
                        aparezca aquí para toda la red.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visible.map((item) => (
                        <PublicItemCard key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default PublicCatalogSection;
