"use client";

// ════════════════════════════════════════════════════════════════
// AppFilePage — Ficha detallada tipo App Store / Play Store
// ----------------------------------------------------------------
// Ficha rica adaptada a CUALQUIER tipo de archivo/app de la Librería.
// Muestra:
//   • Cabecera: icono/portada + nombre + autor + categoría + métricas.
//   • Galería multimedia (media[] + capturas legadas).
//   • Bloque por formato: audio → reproductor, código → snippet,
//     pdf → enlace directo.
//   • Descripción, etiquetas, enlaces (web/repo/releases).
//   • VERSIONES con historial (fecha/notas), descarga por versión y
//     «Replicar» → saveResource (Mi Biblioteca, Lienzo Universal:
//     el contenido se referencia como Entidad Única, no se duplica).
//   • Recomendaciones relacionadas (navegables dentro de la ficha).
//   • Acciones: Instalar (→ Biblioteca), Abrir, Compartir.
//
// Modelo `LibraryDetailItem` (alias `LibraryListing`) extendido con
// {versions[], media[], links[], related[], snippet} — TODOS opcionales
// y tolerantes a faltantes: la ficha funciona con el mínimo (id+title).
//
// Defensivo/SSR-safe/glass. UI en español.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
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
  History,
  Copy,
  Music,
  Code2,
  Link2,
  Sparkles,
  ArrowUpRight,
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
import type {
  ListingMediaItem,
  ListingVersion,
  ListingLink,
} from "@/data/starseed-apps-listings";

// Re-export de primitivos para consumidores de la ficha.
export type { ListingMediaItem, ListingVersion, ListingLink };

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
  /** URLs de capturas (legado; hoy también via `media`). */
  screenshots?: string[];
  /** Etiquetas. */
  tags?: string[];
  /** Nombre de la fuente de origen (GitHub, Dribbble, 21st.dev, Librería…). */
  sourceLabel?: string;
  /** URL del origen (para "Abrir origen"). */
  sourceUrl?: string;
  /** Tipo de archivo/recurso (para el badge de tipo). */
  fileKind?: string;
  /** URL directa para abrir el recurso (si aplica). */
  openUrl?: string;
  /** De dónde viene el item (para elegir la acción de instalación correcta). */
  origin?: "store" | "oss" | "saved" | "file";
  /** Item de intercambio original (si origin==="store"), para instalar de verdad. */
  storeItem?: StoreItem;
  // ── Extensión de ficha rica (todo opcional / tolerante a faltantes) ──
  /** Historial de versiones (más reciente primero). */
  versions?: ListingVersion[];
  /** Galería multimedia (imágenes, vídeo, audio). */
  media?: ListingMediaItem[];
  /** Enlaces externos (web oficial, repositorio, releases…). */
  links?: ListingLink[];
  /** Recomendaciones relacionadas (fichas navegables). */
  related?: LibraryDetailItem[];
  /** Fragmento de código (para fichas de código/componentes). */
  snippet?: string;
  /** Lenguaje del snippet (etiqueta informativa). */
  snippetLang?: string;
}

/** Alias público: el "listado" de la Librería ES el modelo de la ficha. */
export type LibraryListing = LibraryDetailItem;

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

// ── Detección de formato (defensiva) ──

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aac)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;

function isAudioKind(item: LibraryDetailItem): boolean {
  const kind = `${item.fileKind ?? ""} ${item.category ?? ""}`.toLowerCase();
  return /audio|sonido|música|musica|frecuencia/.test(kind);
}

/** URL de audio reproducible de la ficha (media audio o openUrl con extensión). */
function audioUrlOf(item: LibraryDetailItem): string | null {
  const fromMedia = (item.media ?? []).find((m) => m.type === "audio")?.url;
  if (fromMedia) return fromMedia;
  const candidate = item.openUrl || item.sourceUrl || "";
  if (AUDIO_EXT.test(candidate)) return candidate;
  return null;
}

/** URL de PDF de la ficha (por extensión o por tipo declarado). */
function pdfUrlOf(item: LibraryDetailItem): string | null {
  const kind = `${item.fileKind ?? ""} ${item.category ?? ""}`.toLowerCase();
  const candidate = item.openUrl || item.sourceUrl || "";
  if (PDF_EXT.test(candidate)) return candidate;
  if (/\bpdf\b/.test(kind) && candidate) return candidate;
  return null;
}

/** "2026-07-01" | "2026.07.01" → "1 de julio de 2026" (defensivo). */
function fmtDate(raw: string): string {
  const [y, m, d] = raw.split(/[./-]/).map((n) => Number(n));
  if (!y || !m || !d) return raw;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return raw;
  try {
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return raw;
  }
}

export function AppFilePage({ item, open, onOpenChange }: AppFilePageProps) {
  // Ficha activa: permite navegar a "relacionados" sin cerrar el modal.
  const [current, setCurrent] = useState<LibraryDetailItem | null>(item);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setCurrent(item);
    setInstalled(false);
  }, [item]);

  const goRelated = useCallback((rel: LibraryDetailItem) => {
    setCurrent(rel);
    setInstalled(false);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!current) return;
    setInstalling(true);
    try {
      if (current.origin === "store" && current.storeItem) {
        const res = await installItem(current.storeItem);
        if (!res.ok) {
          toast.error("No se pudo instalar", { description: current.title });
          return;
        }
      } else {
        // Cualquier otro origen: guardar en la Biblioteca soberana (local).
        saveResource({
          id: `detail-${current.id}`,
          kind: current.category || current.fileKind || "recurso",
          title: current.title,
          url: current.openUrl || current.sourceUrl || `starseed://library/${current.id}`,
          origin: current.sourceLabel || current.origin || "librería",
        });
      }
      setInstalled(true);
      toast.success("Añadido a tu Biblioteca", { description: current.title });
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
  }, [current]);

  // «Replicar» una versión → Mi Biblioteca (Lienzo Universal: se referencia
  // la Entidad Única, no se duplica el contenido).
  const handleReplicate = useCallback(
    (version?: ListingVersion) => {
      if (!current) return;
      const vLabel = version?.version ? ` · v${version.version}` : "";
      saveResource({
        id: `replica-${current.id}${version?.version ? `-${version.version}` : ""}`,
        kind: current.category || current.fileKind || "recurso",
        title: `${current.title}${vLabel}`,
        url: version?.url || current.openUrl || current.sourceUrl || `starseed://library/${current.id}`,
        origin: "Réplica · Lienzo Universal",
      });
      toast.success("Replicado en tu Biblioteca", {
        description: "Lienzo Universal: la Entidad Única se referencia, no se duplica.",
      });
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new Event("starseed:library"));
        } catch {
          /* noop */
        }
      }
    },
    [current],
  );

  const handleShare = useCallback(async () => {
    if (!current) return;
    const ref =
      current.openUrl ||
      current.sourceUrl ||
      (typeof window !== "undefined"
        ? `${window.location.origin}/library?ref=${encodeURIComponent(current.id)}`
        : `starseed://library/${current.id}`);
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
  }, [current]);

  if (!current) return null;

  const media = current.media ?? [];
  const galleryImages = [
    ...media.filter((m) => m.type === "image"),
    ...(current.screenshots ?? []).map((url) => ({ type: "image" as const, url })),
  ];
  const galleryVideos = media.filter((m) => m.type === "video");
  const audioUrl = audioUrlOf(current);
  const pdfUrl = pdfUrlOf(current);
  const versions = current.versions ?? [];
  const links = current.links ?? [];
  const related = current.related ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="sr-only">{current.title}</DialogTitle>
        </DialogHeader>

        {/* Cabecera tipo App Store: icono + título + autor + categoría */}
        <div className="flex flex-col gap-5 min-w-0">
          <div className="flex items-start gap-4 min-w-0">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              {current.cover ? (
                <Image src={current.cover} alt={current.title} fill className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold font-headline leading-tight">{current.title}</h2>
                {current.verified && (
                  <Badge className="bg-emerald-500/90 text-white border-0 gap-1 text-[10px]">
                    <BadgeCheck className="w-3 h-3" /> Verificado
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {current.author && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {current.author}
                  </span>
                )}
                {current.categoryLabel && (
                  <Badge variant="outline" className="text-[10px] border-white/20">
                    {current.categoryLabel}
                  </Badge>
                )}
                {current.fileKind && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {current.fileKind}
                  </span>
                )}
                {current.sourceLabel && (
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> {current.sourceLabel}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <StarsDisplay rating={current.rating} count={current.ratingsCount} />
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
            {current.openUrl && (
              <Button variant="outline" asChild className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer">
                <Link href={current.openUrl}>
                  <ExternalLink className="h-4 w-4" /> Abrir
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => handleReplicate()}
              className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer"
              title="Guardar una referencia soberana en Mi Biblioteca (Lienzo Universal)"
            >
              <Copy className="h-4 w-4" /> Replicar
            </Button>
            <Button variant="ghost" onClick={handleShare} className="gap-2 text-muted-foreground hover:text-white cursor-pointer">
              <Share2 className="h-4 w-4" /> Compartir
            </Button>
          </div>

          {/* Métricas rápidas */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCell icon={<Download className="h-4 w-4" />} label="Descargas" value={fmtNum(current.downloads)} />
            <MetricCell icon={<Star className="h-4 w-4" />} label="Valoración" value={current.rating ? current.rating.toFixed(1) : "—"} />
            <MetricCell icon={<User className="h-4 w-4" />} label="Autor" value={current.author || "Comunidad"} />
            <MetricCell icon={<Shield className="h-4 w-4" />} label="Licencia" value={current.license || "StarSeed Public"} />
          </div>

          {/* Bloque por formato: audio → reproductor */}
          {(audioUrl || isAudioKind(current)) && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Music className="h-3.5 w-3.5" /> Audio
              </h3>
              {audioUrl ? (
                <audio controls preload="none" src={audioUrl} className="w-full rounded-xl">
                  Tu navegador no soporta el reproductor de audio.
                </audio>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Recurso sonoro sin archivo de audio directo publicado; usa «Abrir» para acceder.
                </p>
              )}
            </div>
          )}

          {/* Bloque por formato: código → snippet */}
          {current.snippet && (
            <div className="space-y-2 min-w-0">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Code2 className="h-3.5 w-3.5" /> Código{current.snippetLang ? ` · ${current.snippetLang}` : ""}
              </h3>
              <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs leading-relaxed text-cyan-100/90">
                <code>{current.snippet}</code>
              </pre>
            </div>
          )}

          {/* Bloque por formato: pdf → enlace directo */}
          {pdfUrl && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Documento
              </h3>
              <Button variant="outline" asChild className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer">
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-4 w-4" /> Abrir PDF <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
          )}

          {/* Galería multimedia (imágenes + vídeo) */}
          {(galleryImages.length > 0 || galleryVideos.length > 0) && (
            <div className="space-y-2 min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground">Galería</h3>
              <div className="ss-hscroll ss-hscroll-fade flex gap-3 pb-2">
                {galleryVideos.map((v, i) => (
                  <video
                    key={`vid-${v.url}-${i}`}
                    src={v.url}
                    controls
                    preload="none"
                    className="aspect-video w-64 shrink-0 rounded-xl border border-white/10 bg-black/30 object-cover"
                  />
                ))}
                {galleryImages.map((m, i) => (
                  <div
                    key={`img-${m.url}-${i}`}
                    className="relative aspect-video w-64 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30"
                  >
                    <Image src={m.url} alt={("caption" in m && m.caption) || `Imagen ${i + 1}`} fill className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descripción */}
          {current.description && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Descripción</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/85">{current.description}</p>
            </div>
          )}

          {/* Enlaces (web / repo / releases…) */}
          {links.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" /> Enlaces
              </h3>
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 cursor-pointer"
                  >
                    {l.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Versiones — historial con descarga y réplica por versión */}
          {versions.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Versiones
              </h3>
              <div className="flex flex-col gap-2">
                {versions.map((v, i) => (
                  <div
                    key={`${v.version}-${i}`}
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-white/20 text-[10px] font-mono">
                        v{v.version}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fmtDate(v.date)}</span>
                      {i === 0 && (
                        <Badge className="border-0 bg-emerald-500/20 text-emerald-300 text-[9px] gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> Actual
                        </Badge>
                      )}
                    </div>
                    {v.notes && <p className="mt-1.5 text-xs leading-relaxed text-white/75">{v.notes}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {v.url && (
                        <Button size="sm" variant="outline" asChild className="h-7 gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer">
                          <a href={v.url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3 w-3" /> Descargar
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReplicate(v)}
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-white cursor-pointer"
                        title="Referenciar esta versión en Mi Biblioteca (Lienzo Universal)"
                      >
                        <Copy className="h-3 w-3" /> Replicar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Etiquetas */}
          {current.tags && current.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {current.tags.map((t) => (
                <span key={t} className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Recomendaciones relacionadas */}
          {related.length > 0 && (
            <div className="space-y-2 min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground">También te puede interesar</h3>
              <div className="ss-hscroll ss-hscroll-fade flex gap-3 pb-2">
                {related.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    onClick={() => goRelated(rel)}
                    className="group flex w-48 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.06] cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                        {rel.cover ? (
                          <Image src={rel.cover} alt={rel.title} fill className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white/90 group-hover:text-primary transition-colors">
                          {rel.title}
                        </p>
                        {rel.categoryLabel && (
                          <p className="truncate text-[10px] text-muted-foreground">{rel.categoryLabel}</p>
                        )}
                      </div>
                    </div>
                    {rel.description && (
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{rel.description}</p>
                    )}
                    <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-medium text-primary/80">
                      Ver ficha <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Origen */}
          {current.sourceUrl && (
            <a
              href={current.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
            >
              Ver en {current.sourceLabel || "el origen"} <ExternalLink className="h-3 w-3" />
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
