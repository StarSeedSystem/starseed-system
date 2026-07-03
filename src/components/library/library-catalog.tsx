"use client";

// ════════════════════════════════════════════════════════════════
// LibraryCatalog — Catálogo unificado de «Explorar» (Librería)
// ----------------------------------------------------------------
// Jerarquía clara: buscador arriba → chips de categorías deslizables
// (.ss-hscroll) → destacados («Apps del ecosistema StarSeed») → grid
// fluida. Taxonomía:
//   Apps · Widgets · Layouts · Archivos · Fuentes · Cursores ·
//   Gestos táctiles · Comandos
//
// Contenido REAL:
//   • Apps       → STARSEED_APP_LISTINGS (ecosistema oficial).
//   • Cursores   → CURSOR_LISTINGS (desktop-listings). Instalar guarda
//                  en library-store y ofrece Aplicar (setCursorFxConfig).
//   • Gestos     → GESTURE_ANIMATION_LISTINGS, mismo flujo (click fx).
//   • Comandos   → COMMAND_LIST_LISTINGS: secuencias ejecutables
//                  (navigate/event/open-app) con confirmación + Instalar.
//   • Widgets/Layouts/Archivos/Fuentes → estados vacíos HONESTOS con
//                  el camino real para conseguirlos (nada inventado).
//
// Crystal Liquid Glass · adaptativo a pantallas muy chicas (sin
// desbordes horizontales) · español.
// ════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  X,
  AppWindow,
  LayoutGrid,
  LayoutTemplate,
  FolderOpen,
  BookMarked,
  MousePointer2,
  Hand,
  TerminalSquare,
  Sparkles,
  Download,
  Play,
  ExternalLink,
  Check,
  Boxes,
  Zap,
  Waves,
  Vote,
  PenLine,
  Orbit,
  Rocket,
  ChevronRight,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { saveResource } from "@/lib/library-store";
import {
  CURSOR_LISTINGS,
  GESTURE_ANIMATION_LISTINGS,
  type DesktopListing,
} from "@/components/desktop/desktop-listings";
import {
  setCursorFxConfig,
  type CursorOption,
  type ClickFxOption,
} from "@/components/desktop/cursor-fx";
import {
  STARSEED_APP_LISTINGS,
  type StarSeedAppListing,
} from "@/data/starseed-apps-listings";
import {
  COMMAND_LIST_LISTINGS,
  type CommandListListing,
  type CommandStep,
} from "@/data/starseed-command-listings";
import type { LibraryDetailItem } from "@/components/library/app-file-page";
import { LibraryServicesCatalog } from "@/components/library/library-services-catalog";
import { useOssConnections } from "@/lib/services/oss-connections";
import { listOssLibraryItems } from "@/lib/library/oss-catalog-bridge";

// ── Taxonomía de categorías (chips) ──────────────────────────────

export type CatalogCategory =
  | "todo"
  | "apps"
  | "servicios"
  | "widgets"
  | "layouts"
  | "archivos"
  | "fuentes"
  | "cursores"
  | "gestos"
  | "comandos";

const CATEGORY_DEFS: { id: CatalogCategory; label: string; icon: LucideIcon }[] = [
  { id: "todo", label: "Todo", icon: Sparkles },
  { id: "apps", label: "Apps", icon: AppWindow },
  { id: "servicios", label: "Servicios / Integraciones", icon: Boxes },
  { id: "widgets", label: "Widgets", icon: LayoutGrid },
  { id: "layouts", label: "Layouts", icon: LayoutTemplate },
  { id: "archivos", label: "Archivos", icon: FolderOpen },
  { id: "fuentes", label: "Fuentes", icon: BookMarked },
  { id: "cursores", label: "Cursores", icon: MousePointer2 },
  { id: "gestos", label: "Gestos táctiles", icon: Hand },
  { id: "comandos", label: "Comandos", icon: TerminalSquare },
];

const COMMAND_ICONS: Record<string, LucideIcon> = {
  Zap,
  Waves,
  Vote,
  PenLine,
  Orbit,
  Rocket,
};

// ── Conversores a ficha rica (LibraryDetailItem) ─────────────────

function baseAppDetail(app: StarSeedAppListing): LibraryDetailItem {
  return {
    id: `ss-app-${app.id}`,
    title: app.name,
    description: app.description,
    category: "apps",
    categoryLabel: "App StarSeed",
    author: app.author,
    verified: true,
    cover: app.iconUrl,
    tags: app.tags,
    sourceLabel: "Ecosistema StarSeed",
    sourceUrl: app.repo || app.web,
    fileKind: app.pwa ? "app · PWA" : "app",
    openUrl: app.route || app.web,
    origin: "oss",
    versions: app.versions,
    media: app.media,
    links: app.links,
    license: app.repo ? "Código abierto" : undefined,
  };
}

/** Ficha rica de una app del ecosistema, con recomendaciones relacionadas. */
export function starseedAppToDetail(app: StarSeedAppListing): LibraryDetailItem {
  const detail = baseAppDetail(app);
  detail.related = STARSEED_APP_LISTINGS.filter((a) => a.id !== app.id)
    .slice(0, 4)
    .map(baseAppDetail);
  return detail;
}

function fxToDetail(listing: DesktopListing, tipo: "cursor" | "gesto"): LibraryDetailItem {
  const pool = tipo === "cursor" ? CURSOR_LISTINGS : GESTURE_ANIMATION_LISTINGS;
  return {
    id: `fx-${tipo}-${listing.id}`,
    title: listing.nombre,
    description: listing.descripcion,
    category: tipo === "cursor" ? "cursores" : "gestos",
    categoryLabel: tipo === "cursor" ? "Cursor" : "Gesto táctil",
    author: "StarSeed",
    verified: true,
    tags: listing.paleta,
    sourceLabel: "Personalización del escritorio",
    fileKind: tipo,
    origin: "saved",
    related: pool
      .filter((l) => l.id !== listing.id)
      .slice(0, 3)
      .map((l) => ({
        id: `fx-${tipo}-${l.id}`,
        title: l.nombre,
        description: l.descripcion,
        categoryLabel: tipo === "cursor" ? "Cursor" : "Gesto táctil",
      })),
  };
}

function commandToDetail(cmd: CommandListListing): LibraryDetailItem {
  const steps = cmd.commands.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
  return {
    id: `cmd-${cmd.id}`,
    title: cmd.name,
    description: `${cmd.desc}\n\nSecuencia:\n${steps}`,
    category: "comandos",
    categoryLabel: "Lista de comandos",
    author: "StarSeed",
    verified: true,
    sourceLabel: "Comandos del OS",
    fileKind: "comando",
    origin: "saved",
    related: COMMAND_LIST_LISTINGS.filter((c) => c.id !== cmd.id)
      .slice(0, 3)
      .map((c) => ({
        id: `cmd-${c.id}`,
        title: c.name,
        description: c.desc,
        categoryLabel: "Lista de comandos",
      })),
  };
}

// ── Instalación en la Biblioteca soberana ────────────────────────

function installApp(app: StarSeedAppListing) {
  saveResource({
    id: `ss-app-${app.id}`,
    kind: "app",
    title: app.name,
    url: app.route || app.web || `starseed://app/${app.id}`,
    origin: "Explorar · Apps StarSeed",
  });
  toast.success("App añadida a tu Biblioteca", { description: app.name });
}

function installCommandList(cmd: CommandListListing) {
  saveResource({
    id: `cmd-${cmd.id}`,
    kind: "comando",
    title: cmd.name,
    url: `starseed://comandos/${cmd.id}`,
    origin: "Explorar · Comandos",
  });
  toast.success("Lista de comandos instalada", { description: cmd.name });
}

// ── Componente principal ─────────────────────────────────────────

export interface LibraryCatalogProps {
  /** Abre la ficha rica (AppFilePage) de cualquier item del catálogo. */
  onOpenDetail: (item: LibraryDetailItem) => void;
  /** Salta a la pestaña «Fuentes» de la Librería (catálogo de fuentes). */
  onGoFuentes?: () => void;
  /** Salta a la pestaña «Mi Biblioteca» (archivos personales). */
  onGoPersonal?: () => void;
}

export function LibraryCatalog({ onOpenDetail, onGoFuentes, onGoPersonal }: LibraryCatalogProps) {
  const router = useRouter();
  const { connections } = useOssConnections();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategory>("todo");
  const [confirmCmd, setConfirmCmd] = useState<CommandListListing | null>(null);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (...fields: (string | string[] | undefined)[]) => {
      if (!q) return true;
      return fields.some((f) => {
        if (!f) return false;
        const text = Array.isArray(f) ? f.join(" ") : f;
        return text.toLowerCase().includes(q);
      });
    },
    [q],
  );

  const apps = useMemo(
    () => STARSEED_APP_LISTINGS.filter((a) => matches(a.name, a.tagline, a.description, a.tags)),
    [matches],
  );
  const cursores = useMemo(
    () => CURSOR_LISTINGS.filter((c) => matches(c.nombre, c.descripcion)),
    [matches],
  );
  const gestos = useMemo(
    () => GESTURE_ANIMATION_LISTINGS.filter((g) => matches(g.nombre, g.descripcion)),
    [matches],
  );
  const comandos = useMemo(
    () =>
      COMMAND_LIST_LISTINGS.filter((c) =>
        matches(c.name, c.desc, c.commands.map((s) => s.label)),
      ),
    [matches],
  );
  // Servicios OSS (conectores/integraciones) filtrados por la misma búsqueda.
  const servicios = useMemo(
    () =>
      listOssLibraryItems(connections).filter((s) =>
        matches(s.title, s.description, s.functionLabel, s.tags),
      ),
    [connections, matches],
  );

  const countFor = useCallback(
    (cat: CatalogCategory): number => {
      switch (cat) {
        case "apps": return apps.length;
        case "servicios": return servicios.length;
        case "cursores": return cursores.length;
        case "gestos": return gestos.length;
        case "comandos": return comandos.length;
        case "widgets":
        case "layouts":
        case "archivos":
        case "fuentes":
          return 0;
        default:
          return apps.length + servicios.length + cursores.length + gestos.length + comandos.length;
      }
    },
    [apps, servicios, cursores, gestos, comandos],
  );

  // ── Aplicar cursores / gestos (setCursorFxConfig) ──
  const applyFx = useCallback((listing: DesktopListing, tipo: "cursor" | "gesto") => {
    if (tipo === "cursor") {
      setCursorFxConfig({ cursor: listing.id as CursorOption });
    } else {
      setCursorFxConfig({ click: listing.id as ClickFxOption });
    }
    toast.success(`${tipo === "cursor" ? "Cursor" : "Gesto"} aplicado`, { description: listing.nombre });
  }, []);

  const installFx = useCallback(
    (listing: DesktopListing, tipo: "cursor" | "gesto") => {
      saveResource({
        id: `fx-${tipo}-${listing.id}`,
        kind: tipo,
        title: listing.nombre,
        url: `starseed://desktop-fx/${tipo}/${listing.id}`,
        origin: "Explorar · Personalización",
      });
      toast.success("Instalado en tu Biblioteca", {
        description: listing.nombre,
        action: { label: "Aplicar ahora", onClick: () => applyFx(listing, tipo) },
      });
    },
    [applyFx],
  );

  // ── Ejecutar lista de comandos (secuencia real, confirmada) ──
  const runSequence = useCallback(
    (cmd: CommandListListing) => {
      setConfirmCmd(null);
      const exec = (step: CommandStep) => {
        try {
          if (step.action === "navigate") {
            router.push(step.target);
          } else if (step.action === "event") {
            window.dispatchEvent(
              new CustomEvent(step.target, step.detail ? { detail: step.detail } : undefined),
            );
          } else if (step.action === "open-app") {
            if (/^https?:/i.test(step.target)) {
              window.open(step.target, "_blank", "noopener,noreferrer");
            } else {
              router.push(step.target);
            }
          }
        } catch {
          /* nunca romper la secuencia por un paso */
        }
      };
      const steps = cmd.commands;
      if (!steps.length) return;
      // El primer paso corre YA (conserva la activación del usuario, p. ej.
      // para window.open); el resto en cadencia para que el OS respire.
      exec(steps[0]);
      steps.slice(1).forEach((step, idx) => {
        window.setTimeout(() => exec(step), 750 * (idx + 1));
      });
      toast.success(`Ejecutando «${cmd.name}»`, {
        description: steps.map((s) => s.label).join(" → "),
      });
    },
    [router],
  );

  const showSection = (cat: Exclude<CatalogCategory, "todo">) =>
    category === "todo" || category === cat;

  const nothingVisible =
    apps.length + cursores.length + gestos.length + comandos.length === 0 &&
    (category === "todo" || ["apps", "cursores", "gestos", "comandos"].includes(category));

  return (
    <section className="flex flex-col gap-5 w-full min-w-0">
      {/* 1 · BUSCADOR (arriba, siempre) */}
      <div className="relative w-full group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <Input
          placeholder="Buscar apps, cursores, gestos, comandos…"
          className="pl-10 bg-black/20 border-white/10 focus-visible:ring-indigo-500/50 w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white cursor-pointer transition-colors"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 2 · CHIPS de categorías — tira deslizable, nunca desborda */}
      <div className="ss-hscroll ss-hscroll-fade flex gap-2 -mx-1 px-1 py-0.5">
        {CATEGORY_DEFS.map((c) => {
          const Icon = c.icon;
          const active = category === c.id;
          const count = countFor(c.id);
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer",
                active
                  ? "border-indigo-400/50 bg-indigo-500/20 text-indigo-100 shadow-sm"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
              {count > 0 && <span className="text-[10px] opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* 3 · DESTACADOS — Apps del ecosistema StarSeed */}
      {showSection("apps") && apps.length > 0 && (
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-300" />
            <h3 className="text-base font-bold text-white">Apps del ecosistema StarSeed</h3>
            <Badge variant="outline" className="border-emerald-400/30 text-emerald-300 text-[10px]">
              Oficiales
            </Badge>
          </div>
          <div className="ss-hscroll ss-hscroll-fade flex gap-3 pb-1">
            {apps.map((app) => (
              <GlassCard
                key={app.id}
                variant="hover"
                className="flex w-[min(85vw,17rem)] shrink-0 flex-col gap-3 border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    {app.iconUrl ? (
                      <Image src={app.iconUrl} alt={app.name} fill className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Orbit className="h-6 w-6 text-purple-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{app.name}</p>
                    <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{app.tagline}</p>
                  </div>
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: app.accent }}
                    aria-hidden
                  />
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => onOpenDetail(starseedAppToDetail(app))}
                    className="h-8 gap-1.5 bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 cursor-pointer"
                  >
                    Ver ficha <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  {(app.route || app.web) && (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                      className="h-8 gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
                    >
                      {app.route ? (
                        <Link href={app.route}>
                          Abrir <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <a href={app.web} target="_blank" rel="noopener noreferrer">
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => installApp(app)}
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-white cursor-pointer"
                    title="Guardar en Mi Biblioteca"
                  >
                    <Download className="h-3.5 w-3.5" /> Instalar
                  </Button>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* 3b · SERVICIOS / INTEGRACIONES — conectores OSS instalables */}
      {showSection("servicios") && (
        <LibraryServicesCatalog onOpenDetail={onOpenDetail} query={query} />
      )}

      {/* 4 · GRID FLUIDA por categoría */}

      {/* Cursores */}
      {showSection("cursores") && cursores.length > 0 && (
        <CatalogSection icon={MousePointer2} title="Cursores" accent="text-cyan-300">
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
            {cursores.map((c) => (
              <FxCard
                key={c.id}
                listing={c}
                tipo="cursor"
                onDetail={() => onOpenDetail(fxToDetail(c, "cursor"))}
                onInstall={() => installFx(c, "cursor")}
                onApply={() => applyFx(c, "cursor")}
              />
            ))}
          </div>
        </CatalogSection>
      )}

      {/* Gestos táctiles */}
      {showSection("gestos") && gestos.length > 0 && (
        <CatalogSection icon={Hand} title="Gestos táctiles" accent="text-emerald-300">
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
            {gestos.map((g) => (
              <FxCard
                key={g.id}
                listing={g}
                tipo="gesto"
                onDetail={() => onOpenDetail(fxToDetail(g, "gesto"))}
                onInstall={() => installFx(g, "gesto")}
                onApply={() => applyFx(g, "gesto")}
              />
            ))}
          </div>
        </CatalogSection>
      )}

      {/* Comandos */}
      {showSection("comandos") && comandos.length > 0 && (
        <CatalogSection icon={TerminalSquare} title="Listas de comandos" accent="text-amber-300">
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
            {comandos.map((cmd) => {
              const Icon = (cmd.icon && COMMAND_ICONS[cmd.icon]) || TerminalSquare;
              return (
                <GlassCard
                  key={cmd.id}
                  variant="hover"
                  className="flex h-full flex-col gap-3 border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="shrink-0 rounded-xl border border-white/10 bg-black/30 p-2.5"
                      style={cmd.accent ? { color: cmd.accent } : undefined}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(commandToDetail(cmd))}
                        className="text-left text-sm font-bold text-white hover:text-primary transition-colors cursor-pointer"
                      >
                        {cmd.name}
                      </button>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{cmd.desc}</p>
                    </div>
                  </div>
                  <ol className="flex flex-col gap-1 rounded-lg border border-white/5 bg-black/20 p-2.5">
                    {cmd.commands.map((s, i) => (
                      <li key={`${cmd.id}-${i}`} className="flex items-center gap-2 text-[11px] text-white/75 min-w-0">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70">
                          {i + 1}
                        </span>
                        <span className="truncate">{s.label}</span>
                        <Badge variant="outline" className="ml-auto shrink-0 border-white/10 text-[8px] uppercase text-muted-foreground">
                          {s.action}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setConfirmCmd(cmd)}
                      className="h-8 gap-1.5 bg-gradient-to-r from-amber-500/90 to-orange-600/90 text-xs font-semibold text-white hover:from-amber-500 hover:to-orange-600 border-0 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" /> Ejecutar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => installCommandList(cmd)}
                      className="h-8 gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Instalar
                    </Button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </CatalogSection>
      )}

      {/* Widgets — estado vacío honesto */}
      {category === "widgets" && (
        <HonestEmpty
          icon={LayoutGrid}
          title="Aún no hay widgets publicados en la Librería"
          body="Los widgets reales del OS (Música, Radio, Clima, Omnifrecuencias…) se añaden desde el panel: botón «Añadir widget» del Dashboard. Cuando la comunidad publique widgets aquí, aparecerán en esta categoría."
        >
          <Button asChild variant="outline" size="sm" className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer">
            <Link href="/dashboard">
              <LayoutGrid className="h-3.5 w-3.5" /> Abrir el Dashboard
            </Link>
          </Button>
        </HonestEmpty>
      )}

      {/* Layouts — estado vacío honesto */}
      {category === "layouts" && (
        <HonestEmpty
          icon={LayoutTemplate}
          title="Aún no hay layouts publicados"
          body="Las plantillas de escritorios y dashboards se crean y gestionan en Escritorios. Publica la tuya desde «Intercambio de recursos» (abajo) para que aparezca aquí."
        >
          <Button asChild variant="outline" size="sm" className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer">
            <Link href="/escritorios">
              <LayoutTemplate className="h-3.5 w-3.5" /> Ir a Escritorios
            </Link>
          </Button>
        </HonestEmpty>
      )}

      {/* Archivos — estado vacío honesto */}
      {category === "archivos" && (
        <HonestEmpty
          icon={FolderOpen}
          title="Los archivos compartidos de la red viven abajo"
          body="Usa el explorador «Archivos de la Red» (más abajo en esta misma pestaña) para navegar lo compartido, o tu espacio personal en Mi Biblioteca."
        >
          {onGoPersonal && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGoPersonal}
              className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Abrir Mi Biblioteca
            </Button>
          )}
        </HonestEmpty>
      )}

      {/* Fuentes — puente honesto al catálogo real */}
      {category === "fuentes" && (
        <HonestEmpty
          icon={BookMarked}
          title="El catálogo de fuentes tiene pestaña propia"
          body="GitHub, Dribbble, 21st.dev, v0.app, mcpmarket y más servicios conectables viven en la pestaña «Fuentes», junto al selector de servidor, almacenamiento y cerebros."
        >
          {onGoFuentes && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGoFuentes}
              className="gap-2 border-white/15 hover:bg-white/10 cursor-pointer"
            >
              <BookMarked className="h-3.5 w-3.5" /> Abrir Fuentes
            </Button>
          )}
        </HonestEmpty>
      )}

      {/* Sin resultados de búsqueda */}
      {nothingVisible && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 p-12 text-center text-muted-foreground">
          <Search className="mb-3 h-10 w-10 opacity-25" />
          <p className="text-sm">Sin resultados para «{query}».</p>
          <button
            onClick={() => {
              setQuery("");
              setCategory("todo");
            }}
            className="mt-2 text-xs text-primary hover:underline cursor-pointer"
          >
            Limpiar búsqueda y filtros
          </button>
        </div>
      )}

      {/* Confirmación de ejecución de secuencia */}
      <Dialog open={confirmCmd !== null} onOpenChange={(o) => !o && setConfirmCmd(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-amber-400" /> Ejecutar «{confirmCmd?.name}»
            </DialogTitle>
            <DialogDescription>
              Se ejecutará esta secuencia de {confirmCmd?.commands.length ?? 0} paso
              {(confirmCmd?.commands.length ?? 0) === 1 ? "" : "s"} en orden:
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-2 py-1">
            {(confirmCmd?.commands ?? []).map((s, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm min-w-0">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-300">
                  {i + 1}
                </span>
                <span className="truncate text-white/85">{s.label}</span>
                <Badge variant="outline" className="ml-auto shrink-0 border-white/10 text-[9px] uppercase text-muted-foreground">
                  {s.action}
                </Badge>
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCmd(null)} className="cursor-pointer">
              Cancelar
            </Button>
            <Button
              onClick={() => confirmCmd && runSequence(confirmCmd)}
              className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 border-0 text-white hover:from-amber-600 hover:to-orange-700 cursor-pointer"
            >
              <Play className="h-4 w-4" /> Ejecutar secuencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Piezas auxiliares ────────────────────────────────────────────

function CatalogSection({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: LucideIcon;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", accent ?? "text-primary")} />
        <h3 className="text-base font-bold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FxCard({
  listing,
  tipo,
  onDetail,
  onInstall,
  onApply,
}: {
  listing: DesktopListing;
  tipo: "cursor" | "gesto";
  onDetail: () => void;
  onInstall: () => void;
  onApply: () => void;
}) {
  const [applied, setApplied] = useState(false);
  return (
    <GlassCard
      variant="hover"
      className="flex h-full flex-col gap-3 border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4"
    >
      <button type="button" onClick={onDetail} className="flex items-start gap-3 text-left cursor-pointer min-w-0">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-xl">
          {listing.preview}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white hover:text-primary transition-colors">
            {listing.nombre}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
            {listing.descripcion}
          </span>
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        {listing.paleta.map((hex) => (
          <span
            key={hex}
            className="h-2.5 w-2.5 rounded-full border border-white/20"
            style={{ backgroundColor: hex }}
            title={hex}
          />
        ))}
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onInstall}
          className="h-8 gap-1.5 bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" /> Instalar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onApply();
            setApplied(true);
          }}
          className="h-8 gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
        >
          {applied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" /> Aplicado
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Aplicar
            </>
          )}
        </Button>
      </div>
    </GlassCard>
  );
}

function HonestEmpty({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
      <Icon className="h-10 w-10 text-muted-foreground opacity-30" />
      <p className="text-sm font-semibold text-white/85">{title}</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{body}</p>
      {children && <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export default LibraryCatalog;
