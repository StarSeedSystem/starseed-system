"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Search,
    Download,
    Star,
    Filter,
    Share2,
    Globe,
    Heart,
    Upload,
    BadgeCheck,
    Loader2,
    Sparkles,
    AppWindow,
    LayoutGrid,
    Palette,
    LayoutTemplate,
    BrainCircuit,
    Package,
    CalendarDays,
    type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/lib/realtime/realtime";
import {
    STORE_CATEGORIES,
    listStoreItems,
    installItem,
    rateItem,
    listMyCreations,
    publishCreation,
    type StoreItem,
    type MyCreation,
} from "@/lib/store/store-data";

// ════════════════════════════════════════════════════════════════
// Módulo 12 · La Tienda — Economía del Regalo (Supabase + realtime)
// ----------------------------------------------------------------
// ADITIVO: los items REALES de Supabase se muestran PRIMERO; el demo
// original permanece debajo etiquetado como "Ejemplos". Si Supabase
// falla o no hay sesión, la página degrada con elegancia: el demo
// sigue visible. SSR-safe (las consultas corren tras montar en cliente).
// ════════════════════════════════════════════════════════════════

// Mapa de iconos (string del catálogo → componente lucide).
const CATEGORY_ICONS: Record<string, LucideIcon> = {
    AppWindow,
    LayoutGrid,
    Palette,
    LayoutTemplate,
    Sparkles,
    BrainCircuit,
    Package,
    CalendarDays,
};

// Sin items de ejemplo: la tienda muestra únicamente recursos REALES de la red.
const resources: {
    id: string; title: string; creator: string; rating: number; reviews: number;
    type: string; image: string; description: string; license: string;
}[] = [];

// Imagen determinista de portada para items reales (sin imagen propia).
function coverFor(item: StoreItem): string {
    const palettes: Record<string, string> = {
        app: "4c1d95/e0e7ff",
        widget: "1e3a8a/dbeafe",
        tema: "9f1239/ffe4e6",
        plantilla: "065f46/d1fae5",
        personalidad: "78350f/fef3c7",
        cerebro: "0c4a6e/e0f2fe",
        recurso: "3730a3/e0e7ff",
        calendario: "115e59/ccfbf1",
    };
    const pal = palettes[item.category] || "1f2937/e5e7eb";
    const label = encodeURIComponent(item.title.slice(0, 22));
    return `https://placehold.co/400x300/${pal}.png?text=${label}`;
}

// ── Control de valoración por estrellas (1–5) ────────────────────
function StarRating({
    value,
    count,
    onRate,
    disabled,
}: {
    value: number;
    count: number;
    onRate: (stars: number) => void;
    disabled?: boolean;
}) {
    const [hover, setHover] = useState(0);
    const active = hover || Math.round(value);
    return (
        <div className="flex items-center gap-1" title={`${value.toFixed(1)} (${count})`}>
            {[1, 2, 3, 4, 5].map((s) => (
                <button
                    key={s}
                    type="button"
                    disabled={disabled}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => onRate(s)}
                    className={cn(
                        "transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                    aria-label={`Valorar con ${s} estrella${s > 1 ? "s" : ""}`}
                >
                    <Star
                        className={cn(
                            "w-3.5 h-3.5",
                            s <= active
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/40",
                        )}
                    />
                </button>
            ))}
            <span className="ml-1 text-xs text-muted-foreground/70">
                {value > 0 ? value.toFixed(1) : "—"}
                {count > 0 ? ` (${count})` : ""}
            </span>
        </div>
    );
}

export default function ResourceInterchangePage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [replicatedItems, setReplicatedItems] = useState<string[]>([]);

    // Items REALES de Supabase.
    const [items, setItems] = useState<StoreItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(true);
    const [installing, setInstalling] = useState<string | null>(null);

    // Diálogo de publicación.
    const [publishOpen, setPublishOpen] = useState(false);
    const [myCreations, setMyCreations] = useState<MyCreation[]>([]);
    const [loadingCreations, setLoadingCreations] = useState(false);
    const [selectedCreation, setSelectedCreation] = useState<MyCreation | null>(null);
    const [pubDescription, setPubDescription] = useState("");
    const [publishing, setPublishing] = useState(false);

    // ── Carga de items reales (never-throw; degrada al demo) ──────
    const reloadItems = useCallback(async () => {
        setLoadingItems(true);
        try {
            const data = await listStoreItems();
            setItems(Array.isArray(data) ? data : []);
        } catch {
            setItems([]);
        } finally {
            setLoadingItems(false);
        }
    }, []);

    useEffect(() => {
        void reloadItems();
    }, [reloadItems]);

    // ── Tiempo real: nuevos items publicados aparecen en vivo ─────
    useRealtime("store_items", {}, () => {
        void reloadItems();
    });

    // ── Filtrado (categoría + búsqueda) sobre items reales ────────
    const filteredItems = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return items.filter((it) => {
            if (activeCategory && it.category !== activeCategory) return false;
            if (!q) return true;
            return (
                it.title.toLowerCase().includes(q) ||
                it.description.toLowerCase().includes(q)
            );
        });
    }, [items, searchQuery, activeCategory]);

    const filteredDemo = useMemo(
        () =>
            resources.filter((r) =>
                r.title.toLowerCase().includes(searchQuery.trim().toLowerCase()),
            ),
        [searchQuery],
    );

    // ── Instalar item real → Biblioteca ──────────────────────────
    const handleInstall = useCallback(async (item: StoreItem) => {
        setInstalling(item.id);
        try {
            const res = await installItem(item);
            if (res.ok) {
                setReplicatedItems((prev) =>
                    prev.includes(item.id) ? prev : [...prev, item.id],
                );
                // Reflejo optimista del contador de descargas.
                setItems((prev) =>
                    prev.map((it) =>
                        it.id === item.id
                            ? { ...it, downloads: it.downloads + 1 }
                            : it,
                    ),
                );
                toast.success("Añadido a tu Biblioteca", {
                    description: item.title,
                });
            } else {
                toast.error("No se pudo instalar", { description: item.title });
            }
        } catch {
            toast.error("No se pudo instalar");
        } finally {
            setInstalling(null);
        }
    }, []);

    // ── Valorar item real ────────────────────────────────────────
    const handleRate = useCallback(async (item: StoreItem, stars: number) => {
        try {
            const res = await rateItem(item.id, stars);
            if (res.ok) {
                setItems((prev) =>
                    prev.map((it) =>
                        it.id === item.id
                            ? {
                                  ...it,
                                  rating: res.rating ?? it.rating,
                                  ratings_count:
                                      res.ratingsCount ?? it.ratings_count,
                              }
                            : it,
                    ),
                );
                toast.success(`Valorado con ${stars} ★`, {
                    description: item.title,
                });
            } else {
                toast.error("No se pudo valorar (¿inicia sesión?)");
            }
        } catch {
            toast.error("No se pudo valorar");
        }
    }, []);

    // ── Abrir diálogo de publicación + cargar mis creaciones ──────
    const openPublish = useCallback(async () => {
        setPublishOpen(true);
        setSelectedCreation(null);
        setPubDescription("");
        setLoadingCreations(true);
        try {
            const list = await listMyCreations();
            setMyCreations(Array.isArray(list) ? list : []);
        } catch {
            setMyCreations([]);
        } finally {
            setLoadingCreations(false);
        }
    }, []);

    // ── Confirmar publicación ────────────────────────────────────
    const handlePublish = useCallback(async () => {
        if (!selectedCreation) return;
        setPublishing(true);
        try {
            const creation: MyCreation = { ...selectedCreation };
            const item = await publishCreation(creation, pubDescription);
            if (item) {
                toast.success("Publicado en La Tienda", {
                    description: creation.title,
                });
                setPublishOpen(false);
                // Optimista: añadir delante; realtime también recargará.
                setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
                void reloadItems();
            } else {
                toast.error("No se pudo publicar (¿inicia sesión?)");
            }
        } catch {
            toast.error("No se pudo publicar");
        } finally {
            setPublishing(false);
        }
    }, [selectedCreation, pubDescription, reloadItems]);

    return (
        <div className="flex flex-col gap-[clamp(1.5rem,3vw,3rem)] min-h-screen pb-24 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] w-full mx-auto text-center md:text-left">
            <div className="flex flex-col gap-2 items-center md:items-start w-full">
                <h1 className="text-[clamp(2.5rem,4vw,3.5rem)] w-full text-center md:text-left font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 animate-in fade-in slide-in-from-left-4 duration-700">
                    Intercambio de Recursos
                </h1>
                <p className="text-[clamp(1rem,1.3vw,1.2rem)] text-muted-foreground max-w-3xl text-balance w-full text-center md:text-left">
                    Economía del Regalo. Todo es libre. Replica, mejora y comparte activos digitales para la expansión de la consciencia.
                </p>
            </div>

            {/* Featured Banner - Collaborative Project */}
            <GlassCard className="p-8 relative overflow-hidden bg-gradient-to-r from-emerald-900/50 to-teal-900/50 border-emerald-500/20">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1 space-y-4">
                        <Badge variant="outline" className="text-emerald-400 border-emerald-400/50 animate-pulse">Proyecto Colaborativo</Badge>
                        <h2 className="text-3xl font-bold">Pack de Terraformación V2</h2>
                        <p className="text-lg text-muted-foreground">Herramientas comunitarias para la regeneración de ecosistemas virtuales y físicos. Contribuye tus propios assets.</p>
                        <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                            <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0">
                                Explorar Recursos <Globe className="ml-2 w-4 h-4" />
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                className="border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/10"
                                onClick={openPublish}
                            >
                                <Upload className="mr-2 w-4 h-4" /> Publicar mis creaciones
                            </Button>
                        </div>
                    </div>
                    <div className="w-full md:w-1/3 aspect-video relative rounded-lg overflow-hidden shadow-2xl shadow-emerald-500/20 grid place-items-center bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent border border-emerald-400/20">
                        <Package className="w-12 h-12 text-emerald-300/70" />
                    </div>
                </div>
                {/* Background decoration */}
                <div className="absolute -right-20 -bottom-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
            </GlassCard>

            {/* Search and Filter */}
            <div className="flex gap-4 items-center bg-background/5 p-2 rounded-xl border border-white/5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar recursos abiertos, planos o conocimiento..."
                        className="pl-10 bg-transparent border-0 focus-visible:ring-0"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button onClick={openPublish} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 hidden sm:inline-flex">
                    <Upload className="w-4 h-4 mr-2" /> Publicar
                </Button>
                <Button variant="ghost" size="icon" onClick={openPublish} className="sm:hidden" aria-label="Publicar">
                    <Upload className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon"><Filter className="w-4 h-4" /></Button>
            </div>

            {/* Filtro de categorías */}
            <div className="flex flex-wrap gap-2 justify-center md:justify-start -mt-2">
                <Button
                    size="sm"
                    variant={activeCategory === null ? "default" : "outline"}
                    onClick={() => setActiveCategory(null)}
                    className="rounded-full"
                >
                    Todo
                </Button>
                {STORE_CATEGORIES.map((cat) => {
                    const Icon = CATEGORY_ICONS[cat.icon] || Package;
                    const isActive = activeCategory === cat.id;
                    return (
                        <Button
                            key={cat.id}
                            size="sm"
                            variant={isActive ? "default" : "outline"}
                            onClick={() => setActiveCategory(isActive ? null : cat.id)}
                            className="rounded-full"
                        >
                            <Icon className="w-3.5 h-3.5 mr-1.5" />
                            {cat.label}
                        </Button>
                    );
                })}
            </div>

            {/* ════ Items REALES de la Tienda (Supabase) ════ */}
            <section className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        En la Tienda
                    </h2>
                    {loadingItems && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                    <Badge variant="outline" className="text-[10px] opacity-70 border-emerald-400/30 text-emerald-300">
                        En vivo
                    </Badge>
                </div>

                {!loadingItems && filteredItems.length === 0 && (
                    <GlassCard className="p-8 text-center">
                        <p className="text-muted-foreground">
                            Aún no hay creaciones publicadas{activeCategory ? " en esta categoría" : ""}.
                            Sé el primero:{" "}
                            <button
                                onClick={openPublish}
                                className="text-emerald-400 hover:underline font-medium"
                            >
                                publica una creación
                            </button>
                            .
                        </p>
                    </GlassCard>
                )}

                {filteredItems.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-[clamp(1.5rem,2.5vw,2.5rem)] w-full">
                        {filteredItems.map((item) => {
                            const cat = STORE_CATEGORIES.find((c) => c.id === item.category);
                            const isInstalled = replicatedItems.includes(item.id);
                            const isBusy = installing === item.id;
                            return (
                                <GlassCard key={item.id} variant="hover" className="flex flex-col h-full group">
                                    <div className="aspect-[4/3] relative overflow-hidden bg-black/20">
                                        <Image
                                            src={coverFor(item)}
                                            alt={item.title}
                                            fill
                                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                                        />
                                        {item.verified && (
                                            <div className="absolute top-2 right-2">
                                                <Badge className="bg-emerald-500/90 text-white border-0 gap-1 text-[10px]">
                                                    <BadgeCheck className="w-3 h-3" /> Verificado
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 flex flex-col flex-1 gap-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <Badge variant="outline" className="text-[10px] mb-1 opacity-70 border-white/20">
                                                    {cat?.label ?? item.category}
                                                </Badge>
                                                <h3 className="font-bold leading-tight group-hover:text-primary transition-colors">{item.title}</h3>
                                            </div>
                                        </div>
                                        <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{item.description}</p>

                                        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                                            <span>{item.license}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <Download className="w-3 h-3" /> {item.downloads}
                                            </span>
                                        </div>

                                        {/* Valoración por estrellas */}
                                        <StarRating
                                            value={item.rating}
                                            count={item.ratings_count}
                                            onRate={(stars) => handleRate(item, stars)}
                                        />

                                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                            <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                                                <Heart className="w-3 h-3 fill-emerald-400" /> {item.rating > 0 ? item.rating.toFixed(1) : "—"}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={isInstalled ? "secondary" : "default"}
                                                onClick={() => handleInstall(item)}
                                                disabled={isInstalled || isBusy}
                                            >
                                                {isBusy ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Instalando
                                                    </>
                                                ) : isInstalled ? (
                                                    <>
                                                        <Share2 className="w-4 h-4 mr-1" /> En Biblioteca
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download className="w-4 h-4 mr-1" /> Instalar
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </GlassCard>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ════ Sección de ejemplos retirada: sin datos de demostración ════ */}
            {filteredDemo.length > 0 && (
            <section className="flex flex-col gap-4 mt-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-muted-foreground/80">Ejemplos</h2>
                    <Badge variant="outline" className="text-[10px] opacity-60 border-white/20">
                        Demostración
                    </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-[clamp(1.5rem,2.5vw,2.5rem)] w-full">
                    {filteredDemo.map(resource => (
                        <GlassCard key={resource.id} variant="hover" className="flex flex-col h-full group">
                            <div className="aspect-[4/3] relative overflow-hidden bg-black/20">
                                <Image
                                    src={resource.image}
                                    alt={resource.title}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                />
                            </div>
                            <div className="p-4 flex flex-col flex-1 gap-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <Badge variant="outline" className="text-[10px] mb-1 opacity-70 border-white/20">{resource.type}</Badge>
                                        <h3 className="font-bold leading-tight group-hover:text-primary transition-colors">{resource.title}</h3>
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{resource.description}</p>

                                <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                                    <span>{resource.license}</span>
                                    <span>•</span>
                                    <span>{resource.creator}</span>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                    <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                                        <Heart className="w-3 h-3 fill-emerald-400" /> {resource.rating}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={replicatedItems.includes(resource.id) ? "secondary" : "default"}
                                        onClick={() =>
                                            setReplicatedItems((prev) =>
                                                prev.includes(resource.id) ? prev : [...prev, resource.id],
                                            )
                                        }
                                        disabled={replicatedItems.includes(resource.id)}
                                    >
                                        {replicatedItems.includes(resource.id) ? (
                                            <>
                                                <Share2 className="w-4 h-4 mr-1" /> Replicado
                                            </>
                                        ) : (
                                            <>
                                                <Download className="w-4 h-4 mr-1" /> Replicar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            </section>
            )}

            {/* ════ Diálogo: Publicar mis creaciones ════ */}
            <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="w-5 h-5 text-emerald-400" /> Publicar en La Tienda
                        </DialogTitle>
                        <DialogDescription>
                            Comparte una de tus creaciones con la comunidad. Economía del Regalo: queda libre para que otros la instalen y mejoren.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-2">
                        {loadingCreations ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando tus creaciones…
                            </div>
                        ) : myCreations.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                No encontramos creaciones tuyas (apps, personalidades, lienzos o cerebros).
                                Crea algo primero o inicia sesión para publicar.
                            </p>
                        ) : (
                            <div className="max-h-64 overflow-y-auto flex flex-col gap-2 pr-1">
                                {myCreations.map((c) => {
                                    const cat = STORE_CATEGORIES.find(
                                        (x) => x.id === c.suggestedCategory,
                                    );
                                    const Icon = cat ? CATEGORY_ICONS[cat.icon] || Package : Package;
                                    const isSel =
                                        selectedCreation?.id === c.id &&
                                        selectedCreation?.kind === c.kind;
                                    return (
                                        <button
                                            key={`${c.kind}-${c.id}`}
                                            type="button"
                                            onClick={() => setSelectedCreation(c)}
                                            className={cn(
                                                "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                                                isSel
                                                    ? "border-emerald-400/60 bg-emerald-500/10"
                                                    : "border-white/10 hover:border-white/25 hover:bg-white/5",
                                            )}
                                        >
                                            <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{c.title}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {cat?.label ?? c.kind}
                                                </div>
                                            </div>
                                            {isSel && <BadgeCheck className="w-4 h-4 text-emerald-400" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {selectedCreation && (
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-muted-foreground font-medium">
                                    Descripción (opcional)
                                </label>
                                <Textarea
                                    value={pubDescription}
                                    onChange={(e) => setPubDescription(e.target.value)}
                                    placeholder="Cuenta qué hace tu creación y cómo usarla…"
                                    rows={3}
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setPublishOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handlePublish}
                            disabled={!selectedCreation || publishing}
                            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0"
                        >
                            {publishing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publicando…
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" /> Publicar
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
