"use client";

// ════════════════════════════════════════════════════════════════
// AppFilePage — Ficha detallada tipo App Store / Play Store
// ----------------------------------------------------------------
// Ficha adaptada a CUALQUIER tipo de archivo/app + tienda compatible, para
// la Librería global y la Biblioteca personal. Muestra:
//   • Icono/portada + capturas (screenshots).
//   • Descripción, categoría, autor, licencia, fuente/origen.
//   • Valoraciones (estrellas), descargas, verificación.
//   • Acciones: Instalar (→ Biblioteca), Abrir, Compartir.
//
// Se presenta como MODAL (Dialog) reutilizable desde la Librería y la Tienda
// absorbida. Modelo `LibraryDetailItem` abierto: sirve para items de la
// Tienda (store_items), del catálogo OSS, recursos guardados o archivos.
//
// Defensivo/SSR-safe/glass. UI en español.
// ════════════════════════════════════════════════════════════════

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  Star,
  Download,
  ExternalLink,
  Share2,
  BadgeCheck,
  Loader2,
  FileText,
  Tag,
  User,
  Shield,
  Package,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { installItem, type StoreItem } from "@/lib/store/store-data";
import { saveResource } from "@/lib/library-store";

// ── Modelo de ficha (abierto, adaptable a cualquier tipo/tienda) ──

export interface LibraryDetailItem {
  /** Id estable del item. */
  id: string;
  /** Título del item. */
  title: string;
  /** Descripción larga (markdown/plano). */
  description?: string;
  /** Id de categoría (app, tema, recurso, documento, componente…). */
  category?: string;
  /** Etiqueta legible de la categoría. */
  categoryLabel?: string;
  /** Autor/creador. */
  author?: string;
  /** Licencia. */
  license?: string;
  /** Valoración media 0–5. */
  rating?: number;
  /** Nº de valoraciones. */
  ratingsCount?: number;
  /** Nº de descargas/instalaciones. */
  downloads?: number;
  /** ¿Verificado por la red? */
  verified?: boolean;
  /** URL de portada / icono. */
  cover?: string;
  /** URLs de capturas. */
  screenshots?: string[];
  /** Etiquetas. */
  tags?: string[];
  /** Nombre de la fuente/tienda de origen (GitHub, Dribbble, 21st.dev, Tienda…). */
  sourceLabel?: string;
  /** URL del origen (para "Abrir origen"). */
  sourceUrl?: string;
  /** Tipo de archivo/recurso (para el badge de tipo). */
  fileKind?: string;
  /** URL directa para abrir el recurso (si aplica). */
  openUrl?: string;
  /** De dónde viene el item (para elegir la acción de instalación correcta). */
  origin?: "store" | "oss" | "saved" | "file";
  /** Item de Tienda original (si origin==="store"), para instalar de verdad. */
  storeItem?: StoreItem;
}

export interface AppFilePageProps {
  item: LibraryDetailItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function StarsDisplay({ rating = 0, count }: { rating?: number; count?: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-1" title={`${rating.toFixed(1)}${count ? ` (${count})` : ""}`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn("w-4 h-4", s <= rounded ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground">
        {rating > 0 ? rating.toFixed(1) : "Sin valorar"}
        {count ? ` · ${count}` : ""}
      </span>
    </div>
  );
}

export function AppFilePage({ item, open, onOpenChange }: AppFilePageProps) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const handleInstall = useCallback(async () => {
    if (!item) return;
    setInstalling(true);
    try {
      if (item.origin === "store" && item.storeItem) {
        const res = await installItem(item.storeItem);
        if (!res.ok) {
          toast.error("No se pudo instalar", { description: item.title });
          return;
        }
      } else {
        // Cualquier otro origen: guardar en la Biblioteca soberana (local).
        saveResource({
          id: `detail-${item.id}`,
          kind: item.category || item.fileKind || "recurso",
          title: item.title,
          url: item.openUrl || item.sourceUrl || `starseed://library/${item.id}`,
          origin: item.sourceLabel || item.origin || "librería",
        });
      }
      setInstalled(true);
      toast.success("Añadido a tu Biblioteca", { description: item.title });
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new Event("starseed:library"));
        } catch {
          /* noop */
        }
      }
    } catch {
      toast.error("No se pudo instalar");
    } finally {
      setInstalling(false);
    }
  }, [item]);

  const handleShare = useCallback(async () => {
    if (!item) return;
    const ref =
      item.openUrl ||
      item.sourceUrl ||
      (typeof window !== "undefined"
        ? `${window.location.origin}/library?ref=${encodeURIComponent(item.id)}`
        : `starseed://library/${item.id}`);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ref);
        toast.success("Referencia copiada", { description: "Pégala para compartir este recurso." });
      } else {
        toast.message("Referencia del recurso", { description: ref });
      }
    } catch {
      toast.message("Referencia del recurso", { description: ref });
    }
  }, [item]);

  if (!item) return null;

  const screenshots = item.screenshots ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{item.title}</DialogTitle>
        </DialogHeader>

        {/* Cabecera tipo App Store: icono + título + acciones */}
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              {item.cover ? (
                <Image src={item.cover} alt={item.title} fill className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold font-headline leading-tight">{item.title}</h2>
                {item.verified && (
                  <Badge className="bg-emerald-500/90 text-white border-0 gap-1 text-[10px]">
                    <BadgeCheck className="w-3 h-3" /> Verificado
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {item.categoryLabel && (
                  <Badge variant="outline" className="text-[10px] border-white/20">
                    {item.categoryLabel}
                  </Badge>
                )}
                {item.fileKind && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {item.fileKind}
                  </span>
                )}
                {item.sourceLabel && (
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> {item.sourceLabel}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <StarsDisplay rating={item.rating} count={item.ratingsCount} />
              </div>
            </div>
          </div>

          {/* Acciones principales */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleInstall}
              disabled={installing || installed}
              className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 cursor-pointer"
            >
              {installing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Instalando…
                </>
              ) : installed ? (
                <>
                  <Check className="h-4 w-4" /> En Biblioteca
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Instalar
                </>
              )}
            </Button>
            {item.openUrl && (
              <Button variant="outline" asChild className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer">
                <Link href={item.openUrl}>
                  <ExternalLink className="h-4 w-4" /> Abrir
                </Link>
              </Button>
            )}
            <Button variant="ghost" onClick={handleShare} className="gap-2 text-muted-foreground hover:text-white cursor-pointer">
              <Share2 className="h-4 w-4" /> Compartir
            </Button>
          </div>

          {/* Métricas rápidas */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCell icon={<Download className="h-4 w-4" />} label="Descargas" value={fmtNum(item.downloads)} />
            <MetricCell icon={<Star className="h-4 w-4" />} label="Valoración" value={item.rating ? item.rating.toFixed(1) : "—"} />
            <MetricCell icon={<User className="h-4 w-4" />} label="Autor" value={item.author || "Comunidad"} />
            <MetricCell icon={<Shield className="h-4 w-4" />} label="Licencia" value={item.license || "StarSeed Public"} />
          </div>

          {/* Capturas */}
          {screenshots.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Capturas</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {screenshots.map((src, i) => (
                  <div
                    key={`${src}-${i}`}
                    className="relative aspect-video w-64 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30"
                  >
                    <Image src={src} alt={`Captura ${i + 1}`} fill className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descripción */}
          {item.description && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Descripción</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/85">{item.description}</p>
            </div>
          )}

          {/* Etiquetas */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t) => (
                <span key={t} className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Origen */}
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
            >
              Ver en {item.sourceLabel || "el origen"} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </div>
    </div>
  );
}

function fmtNum(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

export default AppFilePage;
