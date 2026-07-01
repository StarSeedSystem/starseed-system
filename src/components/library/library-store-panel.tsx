"use client";

// ════════════════════════════════════════════════════════════════
// LibraryStorePanel — La antigua "Tienda", ahora DENTRO de la Librería
// ----------------------------------------------------------------
// Absorbe TODO lo que hacía la Tienda (Módulo 12 · Economía del Regalo):
//   • Publicar creaciones (apps, personalidades, lienzos, cerebros).
//   • Instalar un item → Biblioteca soberana (library-store).
//   • Valorar (ratings) y ver descargas.
//   • Items reales de Supabase en tiempo real (store_items) con degradación.
//
// Nada de la Tienda se pierde: se convierte en una vista de la Librería.
// La ruta /store se retira (redirige a /library?tab=store).
//
// Aditivo/defensivo: never-throw, SSR-safe (consultas tras montar), glass.
// Al INSTALAR abre un evento para que la Librería refresque "Mis recursos".
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Search,
  Download,
  Star,
  Share2,
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
import type { LibraryDetailItem } from "@/components/library/app-file-page";

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

// ── Valoración por estrellas (1–5) ──
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
          className="transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          aria-label={`Valorar con ${s} estrella${s > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "w-3.5 h-3.5",
              s <= active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
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

export interface LibraryStorePanelProps {
  /** Abre la ficha (tipo App Store) de un item de la Tienda. */
  onOpenDetail?: (item: LibraryDetailItem) => void;
}

/** Convierte un StoreItem en el modelo de ficha detallada (App Store/Play Store). */
function storeItemToDetail(item: StoreItem): LibraryDetailItem {
  const cat = STORE_CATEGORIES.find((c) => c.id === item.category);
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    categoryLabel: cat?.label ?? item.category,
    author: item.owner ?? undefined,
    license: item.license,
    rating: item.rating,
    ratingsCount: item.ratings_count,
    downloads: item.downloads,
    verified: item.verified,
    cover: coverFor(item),
    sourceLabel: "Tienda StarSeed",
    fileKind: item.source_kind ?? item.category,
    origin: "store",
    storeItem: item,
  };
}

export function LibraryStorePanel({ onOpenDetail }: LibraryStorePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [replicatedItems, setReplicatedItems] = useState<string[]>([]);

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

  // ── Carga de items reales (never-throw) ──
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

  // Tiempo real: nuevos items publicados aparecen en vivo.
  useRealtime("store_items", {}, () => {
    void reloadItems();
  });

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCategory && it.category !== activeCategory) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) || it.description.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, activeCategory]);

  // ── Instalar item real → Biblioteca ──
  const handleInstall = useCallback(async (item: StoreItem) => {
    setInstalling(item.id);
    try {
      const res = await installItem(item);
      if (res.ok) {
        setReplicatedItems((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, downloads: it.downloads + 1 } : it)),
        );
        toast.success("Añadido a tu Biblioteca", { description: item.title });
        // Avisar a la Librería para que refresque "Mis recursos guardados".
        if (typeof window !== "undefined") {
          try {
            window.dispatchEvent(new Event("starseed:library"));
          } catch {
            /* noop */
          }
        }
      } else {
        toast.error("No se pudo instalar", { description: item.title });
      }
    } catch {
      toast.error("No se pudo instalar");
    } finally {
      setInstalling(null);
    }
  }, []);

  // ── Valorar item real ──
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
                  ratings_count: res.ratingsCount ?? it.ratings_count,
                }
              : it,
          ),
        );
        toast.success(`Valorado con ${stars} ★`, { description: item.title });
      } else {
        toast.error("No se pudo valorar (¿inicia sesión?)");
      }
    } catch {
      toast.error("No se pudo valorar");
    }
  }, []);

  // ── Publicación ──
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

  const handlePublish = useCallback(async () => {
    if (!selectedCreation) return;
    setPublishing(true);
    try {
      const creation: MyCreation = { ...selectedCreation };
      const item = await publishCreation(creation, pubDescription);
      if (item) {
        toast.success("Publicado en la Librería", { description: creation.title });
        setPublishOpen(false);
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
    <div className="flex flex-col gap-6">
      {/* Cabecera de sección */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-emerald-400" />
          <h2 className="text-xl font-bold">Intercambio de Recursos</h2>
          <Badge variant="outline" className="text-[10px] opacity-70 border-emerald-400/30 text-emerald-300">
            Economía del Regalo
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Todo es libre. Publica, instala en tu Biblioteca, valora y mejora activos digitales.
          Antes era la Tienda; ahora forma parte de la Librería: nada se pierde.
        </p>
      </div>

      {/* Banner colaborativo + publicar */}
      <GlassCard className="p-6 relative overflow-hidden bg-gradient-to-r from-emerald-900/40 to-teal-900/40 border-emerald-500/20">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2 min-w-0">
            <Badge variant="outline" className="text-emerald-400 border-emerald-400/50">
              Proyecto Colaborativo
            </Badge>
            <h3 className="text-2xl font-bold">Comparte tus creaciones</h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Apps, personalidades, lienzos y cerebros: publícalos libres para que la comunidad los
              instale y los mejore.
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            className="border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/10 shrink-0 cursor-pointer"
            onClick={openPublish}
          >
            <Upload className="mr-2 w-4 h-4" /> Publicar mis creaciones
          </Button>
        </div>
        <div className="absolute -right-20 -bottom-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
      </GlassCard>

      {/* Buscar + publicar */}
      <div className="flex gap-3 items-center bg-background/5 p-2 rounded-xl border border-white/5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar recursos abiertos, planos o conocimiento…"
            className="pl-10 bg-transparent border-0 focus-visible:ring-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          onClick={openPublish}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 hidden sm:inline-flex cursor-pointer"
        >
          <Upload className="w-4 h-4 mr-2" /> Publicar
        </Button>
      </div>

      {/* Categorías */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={activeCategory === null ? "default" : "outline"}
          onClick={() => setActiveCategory(null)}
          className="rounded-full cursor-pointer"
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
              className="rounded-full cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5 mr-1.5" />
              {cat.label}
            </Button>
          );
        })}
      </div>

      {/* Items reales */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" /> En la Librería
          </h3>
          {loadingItems && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Badge variant="outline" className="text-[10px] opacity-70 border-emerald-400/30 text-emerald-300">
            En vivo
          </Badge>
        </div>

        {!loadingItems && filteredItems.length === 0 && (
          <GlassCard className="p-8 text-center">
            <p className="text-muted-foreground">
              Aún no hay creaciones publicadas{activeCategory ? " en esta categoría" : ""}. Sé el
              primero:{" "}
              <button onClick={openPublish} className="text-emerald-400 hover:underline font-medium cursor-pointer">
                publica una creación
              </button>
              .
            </p>
          </GlassCard>
        )}

        {filteredItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-[clamp(1.25rem,2.5vw,2rem)] w-full">
            {filteredItems.map((item) => {
              const cat = STORE_CATEGORIES.find((c) => c.id === item.category);
              const isInstalled = replicatedItems.includes(item.id);
              const isBusy = installing === item.id;
              return (
                <GlassCard key={item.id} variant="hover" className="flex flex-col h-full group">
                  <button
                    type="button"
                    className="aspect-[4/3] relative overflow-hidden bg-black/20 cursor-pointer text-left"
                    onClick={() => onOpenDetail?.(storeItemToDetail(item))}
                    aria-label={`Ver ficha de ${item.title}`}
                  >
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
                  </button>
                  <div className="p-4 flex flex-col flex-1 gap-3">
                    <button
                      type="button"
                      className="text-left cursor-pointer"
                      onClick={() => onOpenDetail?.(storeItemToDetail(item))}
                    >
                      <Badge variant="outline" className="text-[10px] mb-1 opacity-70 border-white/20">
                        {cat?.label ?? item.category}
                      </Badge>
                      <h4 className="font-bold leading-tight group-hover:text-primary transition-colors">
                        {item.title}
                      </h4>
                    </button>
                    <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{item.description}</p>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                      <span>{item.license}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Download className="w-3 h-3" /> {item.downloads}
                      </span>
                    </div>

                    <StarRating
                      value={item.rating}
                      count={item.ratings_count}
                      onRate={(stars) => handleRate(item, stars)}
                    />

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                        <Heart className="w-3 h-3 fill-emerald-400" />{" "}
                        {item.rating > 0 ? item.rating.toFixed(1) : "—"}
                      </div>
                      <Button
                        size="sm"
                        variant={isInstalled ? "secondary" : "default"}
                        onClick={() => handleInstall(item)}
                        disabled={isInstalled || isBusy}
                        className="cursor-pointer"
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

      {/* Diálogo: Publicar mis creaciones */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400" /> Publicar en la Librería
            </DialogTitle>
            <DialogDescription>
              Comparte una de tus creaciones con la comunidad. Economía del Regalo: queda libre para
              que otros la instalen y mejoren.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {loadingCreations ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando tus creaciones…
              </div>
            ) : myCreations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No encontramos creaciones tuyas (apps, personalidades, lienzos o cerebros). Crea algo
                primero o inicia sesión para publicar.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto flex flex-col gap-2 pr-1">
                {myCreations.map((c) => {
                  const cat = STORE_CATEGORIES.find((x) => x.id === c.suggestedCategory);
                  const Icon = cat ? CATEGORY_ICONS[cat.icon] || Package : Package;
                  const isSel = selectedCreation?.id === c.id && selectedCreation?.kind === c.kind;
                  return (
                    <button
                      key={`${c.kind}-${c.id}`}
                      type="button"
                      onClick={() => setSelectedCreation(c)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors cursor-pointer",
                        isSel
                          ? "border-emerald-400/60 bg-emerald-500/10"
                          : "border-white/10 hover:border-white/25 hover:bg-white/5",
                      )}
                    >
                      <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{c.title}</div>
                        <div className="text-xs text-muted-foreground">{cat?.label ?? c.kind}</div>
                      </div>
                      {isSel && <BadgeCheck className="w-4 h-4 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedCreation && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium">Descripción (opcional)</label>
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
            <Button variant="ghost" onClick={() => setPublishOpen(false)} className="cursor-pointer">
              Cancelar
            </Button>
            <Button
              onClick={handlePublish}
              disabled={!selectedCreation || publishing}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 cursor-pointer"
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

export default LibraryStorePanel;
