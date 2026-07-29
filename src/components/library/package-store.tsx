"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · TIENDA VIVA de paquetes (estilo Cydia)
// ----------------------------------------------------------------------------
// UI de la tienda de paquetes instalables (src/lib/library/packages.ts):
//   · Destacado   → paquetes curados + catálogo completo.
//   · Categorías  → grid por PackageKind con contadores e iconos lucide.
//   · Repos       → fuentes de paquetes (builtin + añadidas por URL).
//   · Instalado   → registro real con desinstalación.
//   · Búsqueda    → filtra por nombre/tags/kind en vivo (query desde la página).
//
// Tarjetas con contenedor de material (`ss-crystal` / clases de la capa de
// materiales en creación en esta ola): si la clase aún no existe, el fallback
// glass de Tailwind mantiene la estética. Ficha de detalle en Sheet con el
// payload legible (transparencia total: qué hará EXACTAMENTE al instalar).
// SSR-safe: todo lo que lee localStorage se calcula tras montar.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  // Iconos de kinds y de paquetes (mapa defensivo con fallback a Package)
  Package, AppWindow, LayoutGrid, PanelsTopLeft, PenSquare, Presentation,
  FlaskConical, FolderKanban, Palette, Sparkles, Wand2, Brain, GitBranch,
  Zap, Gauge, Shapes, Flower2, Chrome, Globe, HardDrive, Gem, Layers,
  TreePine, Leaf, Move3d, Activity, Rotate3d, Radio, Orbit, Monitor,
  BookOpen, Boxes, RefreshCw, CalendarClock, Languages,
  BrainCircuit, Eye, Volume2, Table, Cat, Beaker, Workflow,
  // Iconos de Herramientas IA & Agentes
  Server, ListChecks, ClipboardList, Radar, NotebookPen, Terminal,
  MessagesSquare, Container, Bot,
  // Iconos de Hugging Bay (descubrimiento de modelos)
  Compass, TrendingUp, SearchCode,
  // Iconos de "Siete repos más" (Marcadores/conocimiento/IoT/ciencia, jul-2026)
  Bookmark, Headphones, Home, Drama, Dna,
  // Iconos de acción
  Download, Check, Trash2, KeyRound, ExternalLink, Search, Plus,
  Clock, Store, PackageCheck, Settings2, Loader2,
  Link2, Copy, Share2, Wand,
  // Iconos de la ficha ampliada (valoración/uso/permisos/relacionados/vista previa)
  Star, Shield, Mic, ScanEye, Globe2, Link as LinkCap,
  Sparkle, ArrowUpRight, Image as ImageIcon, Music2, FileCode2, FileType2,
  Wifi, RefreshCcwDot, CircleCheck, RadioTower, Antenna,
  type LucideIcon,
} from "lucide-react";
import {
  addRepoByUrl,
  allPackages,
  downloadPackage,
  getInstalledMap,
  install,
  listRepos,
  publishBranch,
  removeRepo,
  replicatePackage,
  saveLink,
  subscribeLibrary,
  uninstall,
  MINE_REPO_ID,
  type InstalledEntry,
  type LibraryPackage,
  type LibraryRepo,
  type PackageKind,
} from "@/lib/library/packages";
import { findSource } from "@/ai/astraura/free-catalog";
// Selector de categorías rediseñado (P6): superficie con orden + filtros
// persistidos por categoría, «Aurora recomienda» y secciones Novedades /
// Populares / Relevantes. Reutiliza las piezas exportadas más abajo (KIND_META,
// PackageGrid, PkgIcon, materialClassFor) para no duplicar el flujo de instalar.
import { CategoryPicker } from "@/components/library/category-picker";
// Valoración local (estrellas) + contador de uso — módulo nuevo, aditivo.
import {
  getRating,
  getUsageCount,
  getUsageMap,
  setRating as saveRating,
  recordUsage,
} from "@/lib/library/ratings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
// Ficha de agente instalado (kind "agent"): configurar persona/capacidades y
// vincular a un "cerebro" (AgentBindMenu, P4). Reutiliza el store de agentes.
import { getAgent, subscribeAgents } from "@/lib/agents/store";
import { AgentConfigPanel } from "@/components/agents/AgentConfigPanel";
import { AgentBindMenu } from "@/components/agents/AgentBindMenu";
// Guardar una referencia de este paquete en la Biblioteca de una entidad
// (usuario/página/grupo…) — distinto de "Guardar enlace" (Librería personal).
import { SaveToLibrary } from "@/components/library/save-to-library";
// Navegador VIVO de THE HUGGING BAY (descubrimiento inteligente de modelos).
import { HuggingBayBrowser } from "@/components/library/huggingbay-browser";

/* ───────────────────────── Metadatos por kind ───────────────────────── */

export type StoreSection = "destacado" | "categorias" | "repos" | "instalado";

export const KIND_META: Record<PackageKind, { label: string; plural: string; icon: LucideIcon; chip: string }> = {
  app: { label: "App", plural: "Apps", icon: AppWindow, chip: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  widget: { label: "Widget", plural: "Widgets", icon: LayoutGrid, chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  page: { label: "Página", plural: "Páginas", icon: PanelsTopLeft, chip: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  publication: { label: "Publicación", plural: "Publicaciones", icon: PenSquare, chip: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  board: { label: "Pizarra", plural: "Pizarras", icon: Presentation, chip: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  research: { label: "Investigación", plural: "Investigaciones", icon: FlaskConical, chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  project: { label: "Proyecto", plural: "Proyectos", icon: FolderKanban, chip: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  design: { label: "Diseño", plural: "Diseños", icon: Palette, chip: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  animation: { label: "Animación", plural: "Animaciones", icon: Sparkles, chip: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  function: { label: "Función", plural: "Funciones", icon: Wand2, chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  "ai-source": { label: "Fuente IA", plural: "Fuentes IA", icon: Brain, chip: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  repo: { label: "Repo", plural: "Repos", icon: GitBranch, chip: "bg-lime-500/15 text-lime-300 border-lime-500/30" },
  agent: { label: "Agente", plural: "Agentes", icon: Bot, chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
};

/** Qué hace EXACTAMENTE instalar cada kind (transparencia en la ficha). */
const EFFECT_EXPLAIN: Record<PackageKind, string> = {
  "ai-source": "Activa esta fuente en Astraura (Aurora podrá elegirla). Si necesita clave, te llevamos a conseguirla GRATIS y se pega en Ajustes → Inteligencia. Desinstalar la deshabilita de nuevo.",
  design: "Añade su clase de material al registro de diseño (starseed.library.design.v1) y avisa a la capa de materiales del OS para vestir las superficies. Desinstalar la quita.",
  animation: "Añade su clase de animación al registro de diseño (starseed.library.design.v1); la capa de movimiento del OS la aplica. Desinstalar la quita.",
  function: "Registra la skill en starseed.library.functions.v1 para que tus cerebros de Aurora la usen. Desinstalar la quita.",
  repo: "Añade otro repo de paquetes (JSON con shape LibraryRepo) como fuente de esta Biblioteca.",
  app: "Registra la app en tu sistema (starseed.library.installed.v1, sincronizado con tu cuenta) y abre su ruta real del OS.",
  widget: "Registra el widget en tu sistema y abre la superficie del OS donde vive.",
  page: "Registra la página en tu sistema y abre su ruta real.",
  publication: "Registra el flujo en tu sistema y abre el compositor de publicaciones.",
  board: "Registra la pizarra en tu sistema y abre el lienzo colaborativo.",
  research: "Registra la investigación en tu sistema y abre su superficie real.",
  project: "Registra el proyecto en tu sistema y abre su superficie real.",
  agent: "Registra la definición del agente (persona + capacidades) en tu biblioteca personal de agentes: podrás configurarlo y atarlo al cerebro de cualquier superficie del OS. Desinstalar no borra vínculos ya creados.",
};

/** Mapa nombre-lucide → componente (fallback defensivo: Package). */
const ICON_MAP: Record<string, LucideIcon> = {
  Package, AppWindow, LayoutGrid, PanelsTopLeft, PenSquare, Presentation,
  FlaskConical, FolderKanban, Palette, Sparkles, Wand2, Brain, GitBranch,
  Zap, Gauge, Shapes, Flower2, Chrome, Globe, HardDrive, Gem, Layers,
  TreePine, Leaf, Move3d, Activity, Rotate3d, Radio, Orbit, Monitor,
  BookOpen, Boxes, RefreshCw, CalendarClock, Languages,
  BrainCircuit, Eye, Volume2, Table, Cat, Beaker, Workflow,
  // Herramientas IA & Agentes
  Server, ListChecks, ClipboardList, Radar, NotebookPen, Terminal,
  MessagesSquare, Container, Bot,
  // Hugging Bay (descubrimiento de modelos)
  Compass, TrendingUp, SearchCode,
  // Siete repos más (Marcadores/conocimiento/IoT/ciencia, jul-2026)
  Bookmark, Headphones, Home, Drama, Dna,
  // Red / Conexiones (Red Mesh + Señales)
  RadioTower, Antenna,
};

/** Id del repo builtin de Herramientas IA & Agentes (para la sección destacada). */
const IA_TOOLS_REPO_ID = "starseed-ia-tools";

export function PkgIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Package;
  return <Icon className={className} />;
}

/** Clase de material del contenedor del icono (con fallback glass elegante). */
export function materialClassFor(pkg: LibraryPackage): string {
  const own = pkg.kind === "design"
    ? String(pkg.payload.materialClass ?? "")
    : pkg.kind === "animation"
      ? String(pkg.payload.animClass ?? "")
      : "";
  // Si la clase aún no existe en CSS (la crea otra rama de esta ola), estas
  // clases base garantizan que la tarjeta siga siendo bella.
  return cn("bg-white/[0.06] border border-white/10", own || "ss-crystal");
}

/* ───────────────────────── Vista previa VIVA (design/animation) ───────────────────────── */
// Honestidad: solo animamos con clases CSS que EXISTEN de verdad hoy en
// src/styles/starseed-materials.css. Las clases `ss-anim-*` registradas en
// packages.ts (flotación/respiración/tilt) aún no tienen CSS propio: para no
// fingir movimiento que no existe, la miniatura de animación usa las
// utilidades de movimiento reales (.ss-float / .ss-tilt) como aproximación
// honesta, dejando claro en el pie que es una vista previa aproximada.
const LIVE_MATERIAL_CLASSES = new Set([
  "ss-crystal", "ss-crystal--deep", "ss-neon", "ss-neon--zenith", "ss-neon--horizon",
  "ss-neon--logic", "ss-neon--anchor", "ss-metal", "ss-wood", "ss-nature",
]);
const LIVE_ANIM_FALLBACK: Record<string, string> = {
  "ss-anim-float": "ss-float",
  "ss-anim-tilt": "ss-tilt",
  "ss-anim-breathe": "ss-neon-breathe",
};

/** ¿Este paquete puede renderizar una miniatura VIVA (no solo un icono)? */
function hasLivePreview(pkg: LibraryPackage): boolean {
  return pkg.kind === "design" || pkg.kind === "animation";
}

/**
 * Miniatura viva: renderiza la clase real (o su aproximación honesta) sobre
 * un lienzo pequeño, para que el usuario VEA el material/animación antes de
 * instalar — en vez de solo leer su nombre.
 */
function LivePreviewTile({ pkg }: { pkg: LibraryPackage }) {
  if (pkg.kind === "design") {
    const cls = String(pkg.payload.materialClass ?? "");
    const live = LIVE_MATERIAL_CLASSES.has(cls);
    return (
      <div className="flex flex-col gap-1.5">
        <div className={cn("relative h-24 w-full overflow-hidden rounded-2xl", live ? cls : "ss-crystal")}>
          <div className="absolute inset-0 grid place-items-center">
            <PkgIcon name={pkg.icon} className="h-8 w-8 text-white/80" />
          </div>
        </div>
        {!live && (
          <p className="text-[10px] text-muted-foreground">
            Vista previa aproximada (material «{cls || "desconocido"}» sin CSS propio todavía).
          </p>
        )}
      </div>
    );
  }
  // animation
  const cls = String(pkg.payload.animClass ?? "");
  const fallback = LIVE_ANIM_FALLBACK[cls];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <div className={cn("grid h-14 w-14 place-items-center rounded-2xl ss-crystal", fallback)}>
          <PkgIcon name={pkg.icon} className="h-6 w-6 text-white/85" />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {fallback
          ? "Vista previa con movimiento real (aproximación honesta: la clase exacta aún no tiene CSS propio)."
          : `Vista previa estática (animación «${cls || "desconocida"}» sin CSS propio todavía).`}
      </p>
    </div>
  );
}

/* ───────────────────────── Permisos / capacidades (transparencia) ───────────────────────── */

interface CapabilityInfo {
  label: string;
  icon: LucideIcon;
}

/** Vocabulario de capacidades reales que un paquete puede activar en Aurora. */
const CAPABILITY_META: Record<string, CapabilityInfo> = {
  "aurora-web-access": { label: "Acceso web", icon: Wifi },
  "aurora-web-senses": { label: "Sentidos web", icon: Globe2 },
  "aurora-vision": { label: "Visión", icon: ScanEye },
  "aurora-voice-kokoro": { label: "Voz", icon: Mic },
  "aurora-taste": { label: "Gusto de UI", icon: Sparkle },
  "aurora-pm": { label: "Producto/proyecto", icon: ClipboardList },
  "starseed-auto-update": { label: "Auto-actualización", icon: RefreshCcwDot },
};

/** Deriva permisos/capacidades legibles a partir del payload (honesto). */
function capabilitiesOf(pkg: LibraryPackage): CapabilityInfo[] {
  const out: CapabilityInfo[] = [];
  const skillId = typeof pkg.payload.skillId === "string" ? pkg.payload.skillId : "";
  if (skillId && CAPABILITY_META[skillId]) out.push(CAPABILITY_META[skillId]);
  else if (skillId) out.push({ label: skillId.replace(/^aurora-/, "").replace(/-/g, " "), icon: Wand2 });
  if (pkg.kind === "ai-source") out.push({ label: "Fuente de inteligencia", icon: Brain });
  if (pkg.kind === "agent") {
    const agentCaps = Array.isArray((pkg.payload.agent as { capabilities?: unknown } | undefined)?.capabilities)
      ? ((pkg.payload.agent as { capabilities: unknown[] }).capabilities as unknown[]).filter(
          (c): c is string => typeof c === "string",
        )
      : [];
    for (const cap of agentCaps) {
      const known = Object.entries(CAPABILITY_META).find(([id]) => id.endsWith(cap) || id === `aurora-${cap}`);
      out.push(known ? known[1] : { label: cap.replace(/-/g, " "), icon: Wand2 });
    }
  }
  if (typeof pkg.payload.externalUrl === "string" && pkg.payload.externalUrl) {
    out.push({ label: "Servicio externo / self-host", icon: LinkCap });
  }
  return out;
}

/* ───────────────────────── Vista previa de ARCHIVO (imagen/audio/vídeo/pdf/código) ───────────────────────── */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aac)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;
const CODE_EXT = /\.(json|ts|tsx|js|jsx|py|md|yml|yaml|sh|css|html)(\?|#|$)/i;

type FilePreviewKind = "image" | "audio" | "video" | "pdf" | "code" | null;

/** Detecta el tipo de archivo embebible de la URL del paquete (honesto: solo por extensión). */
function filePreviewKindOf(pkg: LibraryPackage): FilePreviewKind {
  const url = String(pkg.payload.externalUrl ?? pkg.payload.url ?? "");
  if (!url) return null;
  if (IMAGE_EXT.test(url)) return "image";
  if (AUDIO_EXT.test(url)) return "audio";
  if (VIDEO_EXT.test(url)) return "video";
  if (PDF_EXT.test(url)) return "pdf";
  if (CODE_EXT.test(url)) return "code";
  return null;
}

const FILE_PREVIEW_ICON: Record<Exclude<FilePreviewKind, null>, LucideIcon> = {
  image: ImageIcon, audio: Music2, video: FileType2, pdf: FileType2, code: FileCode2,
};

/** Bloque de vista previa embebida según el formato detectado, con fallback de descarga. */
function FilePreviewBlock({ pkg }: { pkg: LibraryPackage }) {
  const kind = filePreviewKindOf(pkg);
  if (!kind) return null;
  const url = String(pkg.payload.externalUrl ?? pkg.payload.url ?? "");
  const Icon = FILE_PREVIEW_ICON[kind];

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> Vista previa del archivo
      </p>
      {kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={pkg.name} className="max-h-64 w-full rounded-xl border border-white/10 object-contain" />
      )}
      {kind === "audio" && (
        <audio controls preload="none" src={url} className="w-full rounded-xl">
          Tu navegador no soporta el reproductor de audio.
        </audio>
      )}
      {kind === "video" && (
        <video controls preload="none" src={url} className="max-h-64 w-full rounded-xl border border-white/10 bg-black/30" />
      )}
      {kind === "pdf" && (
        <iframe src={url} title={pkg.name} className="h-72 w-full rounded-xl border border-white/10 bg-white" />
      )}
      {kind === "code" && (
        <p className="text-xs text-muted-foreground">
          Archivo de texto/código: usa «Descargar» o «Abrir» para verlo (no lo incrustamos sin traerlo primero).
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
      >
        Descargar / abrir original <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

/* ───────────────────────── Valoración local (estrellas) ───────────────────────── */

/** Selector de estrellas interactivo (1–5), clicable, con tu valoración actual. */
function StarRatingInput({ pkgId, size = "sm" }: { pkgId: string; size?: "sm" | "md" }) {
  const [value, setValue] = useState<number | undefined>(undefined);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    setValue(getRating(pkgId));
    return subscribeLibrary(() => setValue(getRating(pkgId)));
  }, [pkgId]);

  const iconSize = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const shown = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => saveRating(pkgId, s)}
            onMouseEnter={() => setHover(s)}
            className="cursor-pointer p-0.5 transition-transform duration-150 hover:scale-110"
            aria-label={`Valorar con ${s} estrella${s === 1 ? "" : "s"}`}
            title={`Valorar con ${s} estrella${s === 1 ? "" : "s"}`}
          >
            <Star className={cn(iconSize, s <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {value ? `Tu valoración: ${value}/5` : "Sin valorar"}
      </span>
    </div>
  );
}

/** Chip compacto de "tu valoración" para la tarjeta (silencioso si no hay valoración). */
function CardRatingBadge({ pkgId }: { pkgId: string }) {
  const [value, setValue] = useState<number | undefined>(undefined);
  useEffect(() => {
    setValue(getRating(pkgId));
    return subscribeLibrary(() => setValue(getRating(pkgId)));
  }, [pkgId]);
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {value}/5
    </span>
  );
}

/** Contador de uso (solo lectura, reactivo a la Biblioteca). */
function useUsageCount(pkgId: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(getUsageCount(pkgId));
    return subscribeLibrary(() => setCount(getUsageCount(pkgId)));
  }, [pkgId]);
  return count;
}

/* ───────────────────────── Relacionados (mismo kind o etiquetas) ───────────────────────── */

/** Hasta 4 paquetes relacionados: mismas etiquetas (peso alto) o mismo kind. */
function relatedPackagesOf(pkg: LibraryPackage, all: LibraryPackage[]): LibraryPackage[] {
  const tagSet = new Set(pkg.tags);
  return all
    .filter((p) => p.id !== pkg.id && !p.comingSoon)
    .map((p) => {
      const sharedTags = p.tags.filter((t) => tagSet.has(t)).length;
      const sameKind = p.kind === pkg.kind ? 1 : 0;
      return { p, score: sharedTags * 3 + sameKind };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.p);
}

/* ───────────────────────── Estado compartido ───────────────────────── */

export interface StoreData {
  packages: LibraryPackage[];
  repos: LibraryRepo[];
  installed: Record<string, InstalledEntry>;
}

const EMPTY_DATA: StoreData = { packages: [], repos: [], installed: {} };

function useStoreData(): { data: StoreData; mounted: boolean; refresh: () => void } {
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setMounted(true);
    return subscribeLibrary(refresh);
  }, [refresh]);

  const data = useMemo<StoreData>(() => {
    if (!mounted) return EMPTY_DATA; // SSR/primer render: sin localStorage
    void tick; // dependencia real: recalcular tras cada evento de Biblioteca
    try {
      return { packages: allPackages(), repos: listRepos(), installed: getInstalledMap() };
    } catch {
      return EMPTY_DATA;
    }
  }, [mounted, tick]);

  return { data, mounted, refresh };
}

/**
 * ¿Está lista cada fuente IA? (configurada o sin clave necesaria).
 * `false` explícito = necesita clave y no está configurada → "Conseguir clave".
 */
function useAiReadiness(packages: LibraryPackage[], mounted: boolean): Record<string, boolean> {
  const [ready, setReady] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    (async () => {
      try {
        const avail = await import("@/ai/astraura/availability");
        const map: Record<string, boolean> = {};
        for (const p of packages) {
          if (p.kind !== "ai-source") continue;
          const src = findSource(String(p.payload.catalogSourceId ?? ""));
          map[p.id] = !!src && (!src.requiresKey || !!avail.userConfigForSource(src));
        }
        if (alive) setReady(map);
      } catch { /* defensivo: sin mapa, los botones dicen "Instalar" */ }
    })();
    return () => { alive = false; };
  }, [packages, mounted]);
  return ready;
}

/* ───────────────────────── Acciones (install/uninstall) ───────────────────────── */

function useStoreActions() {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const doInstall = useCallback(async (pkg: LibraryPackage) => {
    setBusyId(pkg.id);
    const res = await install(pkg);
    setBusyId(null);
    // Señal de instalación (personalización de recomendaciones). No bloquea.
    if (res.ok) {
      import("@/ai/astraura/autonomy").then((m) => m.recordSignal("installs", pkg.id)).catch(() => {});
    }
    if (!res.ok) {
      toast.error(pkg.name, { description: res.message });
      return;
    }
    if (res.action === "external" && res.href) {
      // Fuente IA con clave: abrimos dónde conseguirla y ofrecemos Ajustes.
      try { window.open(res.href, "_blank", "noopener,noreferrer"); } catch { /* popup bloqueado */ }
      toast.success(pkg.name, {
        description: res.message,
        action: { label: "Ajustes → Inteligencia", onClick: () => router.push("/settings?tab=ai") },
      });
      return;
    }
    if (res.action === "route" && res.href) {
      const href = res.href;
      toast.success(pkg.name, {
        description: res.message,
        action: { label: "Abrir", onClick: () => { recordUsage(pkg.id); router.push(href); } },
      });
      return;
    }
    toast.success(pkg.name, { description: res.message });
  }, [router]);

  const doUninstall = useCallback(async (id: string, name?: string) => {
    setBusyId(id);
    const res = await uninstall(id);
    setBusyId(null);
    if (res.ok) toast.success(name ?? "Paquete", { description: res.message });
    else toast.error(name ?? "Paquete", { description: res.message });
  }, []);

  /** Abre una ruta real del OS. Si se pasa `pkgId`, registra el uso (contador honesto de aperturas). */
  const openRoute = useCallback((href: string, pkgId?: string) => {
    if (pkgId) recordUsage(pkgId);
    router.push(href);
  }, [router]);

  /* ── Acciones estilo Cydia ── */
  const doSaveLink = useCallback((pkg: LibraryPackage) => {
    const res = saveLink(pkg);
    if (res.ok) toast.success(pkg.name, { description: res.message });
    else toast.error(pkg.name, { description: res.message });
  }, []);

  const doDownload = useCallback((pkg: LibraryPackage) => {
    const res = downloadPackage(pkg);
    if (!res.ok) { toast.error(pkg.name, { description: res.message }); return; }
    if (res.action === "external" && res.href) {
      try { window.open(res.href, "_blank", "noopener,noreferrer"); } catch { /* popup */ }
    }
    toast.success(pkg.name, { description: res.message });
  }, []);

  const doReplicate = useCallback((pkg: LibraryPackage) => {
    const res = replicatePackage(pkg);
    if (res.ok) {
      toast.success(pkg.name, {
        description: res.message,
        ...(res.localId
          ? { action: { label: "Publicar como rama", onClick: () => { const r = publishBranch(res.localId!); toast[r.ok ? "success" : "error"]("Rama", { description: r.message }); } } }
          : {}),
      });
    } else {
      toast.error(pkg.name, { description: res.message });
    }
  }, []);

  const doPublish = useCallback((localId: string, name?: string) => {
    const res = publishBranch(localId);
    if (res.ok) toast.success(name ?? "Rama", { description: res.message });
    else toast.error(name ?? "Rama", { description: res.message });
  }, []);

  return { busyId, doInstall, doUninstall, openRoute, doSaveLink, doDownload, doReplicate, doPublish };
}

export type StoreActions = ReturnType<typeof useStoreActions>;

/* ───────────────────────── Tarjeta de paquete ───────────────────────── */

function PackageCard({
  pkg,
  installed,
  aiReady,
  actions,
  onOpenDetail,
}: {
  pkg: LibraryPackage;
  installed: boolean;
  aiReady?: boolean;
  actions: StoreActions;
  onOpenDetail: (pkg: LibraryPackage) => void;
}) {
  const meta = KIND_META[pkg.kind];
  const route = typeof pkg.payload.route === "string" ? pkg.payload.route : "";
  const needsKey = pkg.kind === "ai-source" && aiReady === false && !installed;
  const busy = actions.busyId === pkg.id;

  return (
    <GlassCard
      variant="hover"
      className="group relative flex h-full flex-col gap-3 border-white/5 bg-gradient-to-br from-white/[0.06] to-transparent p-4 transition-all duration-200 hover:border-primary/40 hover:scale-[1.015] cursor-pointer"
      onClick={() => onOpenDetail(pkg)}
    >
      {/* Cabecera: icono en contenedor de material + nombre */}
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-105", materialClassFor(pkg))}>
          <PkgIcon name={pkg.icon} className="h-6 w-6 text-white/85" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-100 group-hover:text-primary transition-colors">{pkg.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{pkg.author} · v{pkg.version}</p>
        </div>
        {installed && (
          <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 p-1" title="Instalado">
            <Check className="h-3 w-3 text-emerald-300" />
          </span>
        )}
      </div>

      {/* Vista previa VIVA (solo diseño/animación): material/movimiento real en miniatura */}
      {hasLivePreview(pkg) && <LivePreviewTile pkg={pkg} />}

      {/* Descripción 2 líneas */}
      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{pkg.description}</p>

      {/* Chips: kind · gratis · próximamente · tu valoración */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold", meta.chip)}>
          <meta.icon className="h-2.5 w-2.5" /> {meta.label}
        </span>
        {pkg.free && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
            Gratis
          </span>
        )}
        {pkg.comingSoon && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
            <Clock className="h-2.5 w-2.5" /> Próximamente
          </span>
        )}
        <CardRatingBadge pkgId={pkg.id} />
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {pkg.comingSoon ? (
          <Button size="sm" disabled className="h-8 flex-1 gap-1.5 text-xs opacity-60">
            <Clock className="h-3.5 w-3.5" /> Próximamente
          </Button>
        ) : installed ? (
          <>
            {route ? (
              <Button
                size="sm"
                className="h-8 flex-1 gap-1.5 bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 cursor-pointer"
                onClick={() => actions.openRoute(route, pkg.id)}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled className="h-8 flex-1 gap-1.5 border-emerald-500/30 text-xs text-emerald-300 opacity-90">
                <Check className="h-3.5 w-3.5" /> Instalado
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer"
              onClick={() => void actions.doUninstall(pkg.id, pkg.name)}
              disabled={busy}
              title="Desinstalar"
              aria-label={`Desinstalar ${pkg.name}`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className={cn(
              "h-8 flex-1 gap-1.5 text-xs font-semibold text-white cursor-pointer",
              needsKey ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-600 hover:bg-emerald-500",
            )}
            onClick={() => void actions.doInstall(pkg)}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : needsKey ? <KeyRound className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            {needsKey ? "Conseguir clave" : "Instalar"}
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

export function PackageGrid({
  packages,
  data,
  aiReady,
  actions,
  onOpenDetail,
  emptyText,
}: {
  packages: LibraryPackage[];
  data: StoreData;
  aiReady: Record<string, boolean>;
  actions: StoreActions;
  onOpenDetail: (pkg: LibraryPackage) => void;
  emptyText: string;
}) {
  if (packages.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 p-12 text-center text-muted-foreground">
        <Package className="mb-3 h-10 w-10 opacity-25" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {packages.map((pkg) => (
        <PackageCard
          key={pkg.id}
          pkg={pkg}
          installed={pkg.id in data.installed}
          aiReady={aiReady[pkg.id]}
          actions={actions}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}

/* ───────────────────────── Agente instalado: configurar + vincular a cerebro ───────────────────────── */

/**
 * Acción "Configurar agente" para paquetes de kind "agent" ya instalados:
 * abre un Dialog con el editor real (AgentConfigPanel, P5: persona,
 * capacidades, modelo, visibilidad) y el menú de vínculo a "cerebro"
 * (AgentBindMenu, P4) — aquí atado al escritorio propio del agente
 * (`targetType: "widget"`, id estable derivado del agente), su cerebro
 * personal por defecto dentro de la Biblioteca.
 */
function AgentPackageActions({ pkg }: { pkg: LibraryPackage }) {
  const [open, setOpen] = useState(false);
  const agentId = typeof (pkg.payload.agent as { id?: unknown } | undefined)?.id === "string"
    ? (pkg.payload.agent as { id: string }).id
    : "";
  const [agent, setAgent] = useState(() => (agentId ? getAgent(agentId) : undefined));

  useEffect(() => {
    if (!agentId) return;
    setAgent(getAgent(agentId));
    return subscribeAgents(() => setAgent(getAgent(agentId)));
  }, [agentId]);

  if (!agentId) return null;

  return (
    <>
      <Button
        variant="outline"
        className="gap-2 border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Bot className="h-4 w-4" /> Configurar agente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-cyan-300" /> {pkg.name}
            </DialogTitle>
            <DialogDescription>
              Ajusta la persona y capacidades de tu agente, y átalo a su cerebro personal para que
              anime tu escritorio de la Biblioteca.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <AgentConfigPanel agent={agent ?? null} onSaved={(a) => setAgent(a)} onCancel={() => setOpen(false)} />
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" /> Cerebro del agente
              </p>
              <AgentBindMenu
                targetType="widget"
                targetId={`agent-desk-${agentId}`}
                label="Vincular a cerebro"
                buttonVariant="outline"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────── Celdas de metadatos + uso (ficha) ───────────────────────── */

function MetaCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 truncate text-xs font-semibold text-white/90" title={value}>
        {value}
      </div>
    </div>
  );
}

/** "Usado N veces" (o "Nunca abierto") — reactivo al evento de la Biblioteca. */
function UsageBadge({ pkgId }: { pkgId: string }) {
  const count = useUsageCount(pkgId);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
      <Eye className="h-3 w-3" /> {count > 0 ? `Usado ${count} ${count === 1 ? "vez" : "veces"}` : "Aún no abierto"}
    </span>
  );
}

/* ───────────────────────── Ficha de detalle (Sheet) ───────────────────────── */

function PackageDetailSheet({
  pkg,
  open,
  onOpenChange,
  data,
  aiReady,
  actions,
  onOpenDetail,
}: {
  pkg: LibraryPackage | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: StoreData;
  aiReady: Record<string, boolean>;
  actions: StoreActions;
  /** Navega a otra ficha sin cerrar el Sheet (usado por "También te puede interesar"). */
  onOpenDetail?: (pkg: LibraryPackage) => void;
}) {
  if (!pkg) return <Sheet open={false} onOpenChange={onOpenChange}><SheetContent side="right" className="hidden" /></Sheet>;

  const meta = KIND_META[pkg.kind];
  const installed = pkg.id in data.installed;
  const entry = data.installed[pkg.id];
  const route = typeof pkg.payload.route === "string" ? pkg.payload.route : "";
  const needsKey = pkg.kind === "ai-source" && aiReady[pkg.id] === false && !installed;
  const catalogSource = pkg.kind === "ai-source" ? findSource(String(pkg.payload.catalogSourceId ?? "")) : undefined;
  const repoName = data.repos.find((r) => r.id === pkg.sourceRepoId)?.name ?? pkg.sourceRepoId;
  const busy = actions.busyId === pkg.id;
  // ¿Trae recurso externo? (para el texto del botón «Descargar»).
  const hasExternalRes = !!(String(pkg.payload.externalUrl ?? "").trim() || String(pkg.payload.url ?? "").trim());
  // ¿Es una réplica local del usuario? (habilita «Publicar como rama»).
  const isMine = pkg.sourceRepoId === MINE_REPO_ID || !!pkg.forkedFrom;
  // Relacionados: mismas etiquetas o mismo kind, para "También te puede interesar".
  // (Cálculo directo, no memoizado: no se puede usar useMemo aquí porque el
  // componente hace un return condicional temprano cuando `pkg` es null, y los
  // hooks no pueden llamarse tras un return condicional — Rules of Hooks.)
  const related = relatedPackagesOf(pkg, data.packages);

  let payloadPretty = "{}";
  try { payloadPretty = JSON.stringify(pkg.payload, null, 2); } catch { /* defensivo */ }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-black/80 backdrop-blur-2xl sm:max-w-lg">
        <SheetHeader className="text-left">
          <div className="flex items-start gap-4">
            <div className={cn("grid h-16 w-16 shrink-0 place-items-center rounded-3xl", materialClassFor(pkg))}>
              <PkgIcon name={pkg.icon} className="h-8 w-8 text-white/90" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-lg leading-tight text-white">{pkg.name}</SheetTitle>
              <SheetDescription className="text-xs">
                {pkg.author} · v{pkg.version} · repo «{repoName}»
              </SheetDescription>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold", meta.chip)}>
                  <meta.icon className="h-2.5 w-2.5" /> {meta.label}
                </span>
                {pkg.free && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">Gratis</span>}
                {pkg.comingSoon && <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">Próximamente</span>}
                {installed && <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">Instalado</span>}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-5 pb-10">
          {/* Descripción completa */}
          <p className="text-sm leading-relaxed text-gray-200">{pkg.description}</p>

          {/* Vista previa VIVA (diseño/animación): el material/movimiento real, no solo un icono */}
          {hasLivePreview(pkg) && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkle className="h-3.5 w-3.5" /> Vista previa en vivo
              </p>
              <LivePreviewTile pkg={pkg} />
            </div>
          )}

          {/* Vista previa de ARCHIVO (imagen/audio/vídeo/pdf/código) con fallback de descarga */}
          <FilePreviewBlock pkg={pkg} />

          {/* Metadatos: tipo · versión · licencia · permisos/capacidades que usa */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetaCell icon={meta.icon} label="Tipo" value={meta.label} />
            <MetaCell icon={CircleCheck} label="Versión" value={`v${pkg.version}`} />
            <MetaCell icon={Shield} label="Licencia" value={pkg.free ? "Gratis / OSS" : "Con clave"} />
            <MetaCell icon={Store} label="Origen" value={isMine ? "Tu biblioteca" : repoName} />
          </div>
          {(() => {
            const caps = capabilitiesOf(pkg);
            if (caps.length === 0) return null;
            return (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" /> Permisos / capacidades que usa
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {caps.map((c, i) => (
                    <span
                      key={`${c.label}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/80"
                    >
                      <c.icon className="h-3 w-3" /> {c.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Valoración local (estrellas) + contador de uso */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Star className="h-3.5 w-3.5" /> Tu valoración
              </p>
              <UsageBadge pkgId={pkg.id} />
            </div>
            <StarRatingInput pkgId={pkg.id} size="md" />
          </div>

          {/* Fuente IA: transparencia del catálogo (why + limits + modelos) */}
          {catalogSource && (
            <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-300">
                <Brain className="h-3.5 w-3.5" /> Catálogo Astraura
              </p>
              <p className="text-xs text-gray-300"><span className="font-semibold text-teal-200">Por qué Aurora la elegiría:</span> {catalogSource.why}</p>
              <p className="text-xs text-gray-300"><span className="font-semibold text-teal-200">Límites honestos:</span> {catalogSource.limits}</p>
              <p className="text-xs text-gray-300">
                <span className="font-semibold text-teal-200">Modelos:</span>{" "}
                {catalogSource.models.map((m) => m.label).join(" · ")}
              </p>
              {catalogSource.getKeyUrl && (
                <a
                  href={catalogSource.getKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300 hover:text-teal-200 hover:underline cursor-pointer"
                >
                  Conseguir clave gratuita <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Transparencia: qué hará EXACTAMENTE al instalar */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5" /> Qué hará al instalar
            </p>
            <p className="text-xs leading-relaxed text-gray-300">{EFFECT_EXPLAIN[pkg.kind]}</p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-black/50 p-3 text-[10px] leading-relaxed text-cyan-200/90">
{payloadPretty}
            </pre>
            {entry && (
              <p className="text-[10px] text-muted-foreground">
                Instalado el {new Date(entry.installedAt).toLocaleString("es-ES")} (v{entry.version}).
              </p>
            )}
          </div>

          {/* Etiquetas */}
          {pkg.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pkg.tags.map((t) => (
                <span key={t} className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
              ))}
            </div>
          )}

          {/* Acciones de la ficha */}
          <div className="flex flex-wrap items-center gap-2">
            {pkg.comingSoon ? (
              <Button disabled className="gap-2 opacity-60"><Clock className="h-4 w-4" /> Próximamente</Button>
            ) : installed ? (
              <>
                {route && (
                  <Button className="gap-2 bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer" onClick={() => actions.openRoute(route, pkg.id)}>
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </Button>
                )}
                {pkg.kind === "agent" && <AgentPackageActions pkg={pkg} />}
                <Button
                  variant="outline"
                  className="gap-2 border-rose-500/30 text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                  onClick={() => void actions.doUninstall(pkg.id, pkg.name)}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Desinstalar
                </Button>
              </>
            ) : (
              <Button
                className={cn("gap-2 text-white cursor-pointer", needsKey ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-600 hover:bg-emerald-500")}
                onClick={() => void actions.doInstall(pkg)}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : needsKey ? <KeyRound className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {needsKey ? "Conseguir clave e instalar" : "Instalar"}
              </Button>
            )}
          </div>

          {/* ── Acciones estilo Cydia mejorado (guardar/descargar/replicar/publicar) ── */}
          {!pkg.comingSoon && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Wand className="h-3.5 w-3.5" /> Más acciones
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
                  onClick={() => actions.doSaveLink(pkg)}
                  title="Registra el paquete como enlace, sin ejecutar su efecto"
                >
                  <Link2 className="h-3.5 w-3.5" /> Guardar enlace
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
                  onClick={() => actions.doDownload(pkg)}
                  title={hasExternalRes ? "Abre la descarga externa en una pestaña nueva" : "Descarga el paquete como .json (tema/diseño reimportable)"}
                >
                  <Download className="h-3.5 w-3.5" /> Descargar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
                  onClick={() => actions.doReplicate(pkg)}
                  title="Crea una copia editable en tu biblioteca (fork local)"
                >
                  <Copy className="h-3.5 w-3.5" /> Replicar
                </Button>
                {isMine && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-cyan-500/30 text-xs text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                    onClick={() => actions.doPublish(pkg.id, pkg.name)}
                    title="Marca esta copia como pública (preparada para publicar a la red)"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Publicar como rama
                  </Button>
                )}
                <SaveToLibrary
                  variant="button"
                  label="Guardar en Biblioteca…"
                  item={{ type: "package", refId: pkg.id, route: route || undefined, title: pkg.name }}
                />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Replicar crea un fork local editable en tu biblioteca. Publicar marca la rama como
                pública (local por ahora; la publicación real a la red StarSeed llegará vía Supabase).
                «Guardar en Biblioteca…» crea una referencia en la Biblioteca de tu cuenta o de una
                comunidad/página tuya (Entidad Única: no duplica el paquete).
              </p>
            </div>
          )}

          {/* También te puede interesar (relacionados por etiqueta/tipo) */}
          {related.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                También te puede interesar
              </p>
              <div className="ss-hscroll ss-hscroll-fade flex gap-3 pb-1">
                {related.map((rel) => {
                  const relMeta = KIND_META[rel.kind];
                  return (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => onOpenDetail?.(rel)}
                      className="group flex w-40 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.06] cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", materialClassFor(rel))}>
                          <PkgIcon name={rel.icon} className="h-4 w-4 text-white/85" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white/90 group-hover:text-primary transition-colors">
                            {rel.name}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">{relMeta.label}</p>
                        </div>
                      </div>
                      <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-medium text-primary/80">
                        Ver ficha <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────────────────── Sección: Repos ───────────────────────── */

function ReposSection({ data }: { data: StoreData }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    const res = await addRepoByUrl(url);
    setBusy(false);
    if (res.ok) {
      toast.success("Repo añadido", { description: res.message });
      setUrl("");
    } else {
      toast.error("No se pudo añadir", { description: res.message });
    }
  };

  const handleRemove = (repo: LibraryRepo) => {
    const res = removeRepo(repo.id);
    if (res.ok) toast.success(repo.name, { description: res.message });
    else toast.error(repo.name, { description: res.message });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-lime-300" />
        <h2 className="text-lg font-bold text-white">Repos · fuentes de paquetes</h2>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">{data.repos.length}</span>
      </div>
      <p className="text-xs text-muted-foreground max-w-2xl">
        Como en Cydia: cada repo es una fuente de paquetes. El núcleo viene incluido; añade repos
        de la comunidad por URL (un JSON con shape <code className="rounded bg-white/10 px-1">LibraryRepo</code>).
      </p>

      {/* Lista de repos */}
      <div className="flex flex-col gap-2">
        {data.repos.map((repo) => (
          <GlassCard key={repo.id} intensity="low" className="flex items-center gap-3 border-white/5 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
              {repo.builtin ? <Store className="h-5 w-5 text-emerald-300" /> : <GitBranch className="h-5 w-5 text-lime-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                {repo.name}
                {repo.builtin && (
                  <Badge variant="outline" className="border-emerald-400/30 text-[9px] text-emerald-300">núcleo</Badge>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {repo.packages.length} paquete(s){repo.url ? ` · ${repo.url}` : " · integrado en el OS"}
              </p>
            </div>
            {!repo.builtin && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer"
                onClick={() => handleRemove(repo)}
                title="Quitar repo"
                aria-label={`Quitar repo ${repo.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </GlassCard>
        ))}
      </div>

      {/* Añadir repo por URL */}
      <GlassCard intensity="low" className="border-white/5 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-100">
          <Plus className="h-4 w-4 text-lime-300" /> Añadir repo por URL
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="https://ejemplo.org/mi-repo.json"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
            className="flex-1 border-white/10 bg-black/30 focus-visible:ring-lime-500/40"
          />
          <Button
            onClick={() => void handleAdd()}
            disabled={busy || !url.trim()}
            className="gap-2 bg-lime-600 font-semibold text-white hover:bg-lime-500 cursor-pointer"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Añadir
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          El JSON debe traer <code className="rounded bg-white/10 px-1">{`{ "id", "name", "packages": [{ "id", "kind", "name", "payload" … }] }`}</code>.
          Los paquetes inválidos se descartan; el repo se puede quitar cuando quieras.
        </p>
      </GlassCard>
    </section>
  );
}

/* ───────────────────────── Sección: Instalado ───────────────────────── */

/** Compara versiones semver de forma tolerante (mayor primero, sin desempate). */
function compareSemverAsc(a: string, b: string): number {
  const pa = String(a ?? "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** Paquetes instalados cuya versión del catálogo vivo es MAYOR que la registrada. */
function outdatedEntries(
  entries: [string, InstalledEntry][],
  byId: Map<string, LibraryPackage>,
): { id: string; pkg: LibraryPackage; entry: InstalledEntry }[] {
  const out: { id: string; pkg: LibraryPackage; entry: InstalledEntry }[] = [];
  for (const [id, entry] of entries) {
    const pkg = byId.get(id);
    if (!pkg || pkg.comingSoon) continue;
    if (compareSemverAsc(pkg.version, entry.version) > 0) out.push({ id, pkg, entry });
  }
  return out;
}

function InstalledSection({
  data,
  aiReady,
  actions,
  onOpenDetail,
}: {
  data: StoreData;
  aiReady: Record<string, boolean>;
  actions: StoreActions;
  onOpenDetail: (pkg: LibraryPackage) => void;
}) {
  const entries = Object.entries(data.installed).sort((a, b) => b[1].installedAt - a[1].installedAt);
  const byId = useMemo(() => new Map(data.packages.map((p) => [p.id, p])), [data.packages]);
  const outdated = useMemo(() => outdatedEntries(entries, byId), [entries, byId]);
  const [updatingAll, setUpdatingAll] = useState(false);

  // Uso total agregado (contador honesto: suma de aperturas reales registradas).
  const [totalUsage, setTotalUsage] = useState(0);
  useEffect(() => {
    const recalc = () => {
      const usage = getUsageMap();
      setTotalUsage(entries.reduce((sum, [id]) => sum + (usage[id]?.count ?? 0), 0));
    };
    recalc();
    return subscribeLibrary(recalc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const updateOne = useCallback(async (pkg: LibraryPackage) => {
    await actions.doInstall(pkg); // re-instalar aplica el efecto y re-registra con la versión actual
  }, [actions]);

  const updateAll = useCallback(async () => {
    if (outdated.length === 0 || updatingAll) return;
    setUpdatingAll(true);
    for (const { pkg } of outdated) {
      try { await install(pkg); } catch { /* defensivo: una actualización no frena el resto */ }
    }
    setUpdatingAll(false);
    toast.success("Biblioteca actualizada", {
      description: `${outdated.length} paquete(s) actualizado(s) a su última versión.`,
    });
  }, [outdated, updatingAll]);

  return (
    <section className="flex flex-col gap-6">
      {/* Resumen "Mi biblioteca": total instalado + uso agregado */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetaCell icon={PackageCheck} label="Instalados" value={String(entries.length)} />
        <MetaCell icon={Eye} label="Aperturas totales" value={String(totalUsage)} />
        <MetaCell icon={RefreshCcwDot} label="Actualizaciones" value={String(outdated.length)} />
      </div>

      {/* Actualizaciones disponibles + «Actualizar todo» */}
      {outdated.length > 0 && (
        <GlassCard className="border-amber-400/20 bg-gradient-to-br from-amber-900/15 to-transparent p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RefreshCcwDot className="h-4 w-4 text-amber-300" />
              <h3 className="text-sm font-bold text-white">Actualizaciones disponibles</h3>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                {outdated.length}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => void updateAll()}
              disabled={updatingAll}
              className="gap-1.5 bg-amber-600 text-xs font-semibold text-white hover:bg-amber-500 cursor-pointer"
            >
              {updatingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Actualizar todo
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {outdated.map(({ id, pkg, entry }) => (
              <div key={id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", materialClassFor(pkg))}>
                  <PkgIcon name={pkg.icon} className="h-4 w-4 text-white/85" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white/90">{pkg.name}</p>
                  <p className="text-[10px] text-muted-foreground">v{entry.version} → v{pkg.version}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 border-amber-400/30 text-[11px] text-amber-200 hover:bg-amber-500/10 cursor-pointer"
                  onClick={() => void updateOne(pkg)}
                  disabled={actions.busyId === pkg.id}
                >
                  {actions.busyId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Actualizar
                </Button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="flex items-center gap-2">
        <PackageCheck className="h-5 w-5 text-emerald-300" />
        <h2 className="text-lg font-bold text-white">Instalado en tu sistema</h2>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">{entries.length}</span>
      </div>
      <p className="text-xs text-muted-foreground max-w-2xl">
        Registro real de paquetes (viaja con tu cuenta StarSeed vía sincronización de ajustes).
        Desinstalar revierte lo reversible.
      </p>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 p-12 text-center text-muted-foreground">
          <PackageCheck className="mb-3 h-10 w-10 opacity-25" />
          <p className="text-sm">Aún no has instalado nada.</p>
          <p className="mt-1 text-xs">Explora Destacado o Categorías: todo es gratis y open source.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map(([id, entry]) => {
            const pkg = byId.get(id);
            if (pkg) {
              return (
                <PackageCard
                  key={id}
                  pkg={pkg}
                  installed
                  aiReady={aiReady[id]}
                  actions={actions}
                  onOpenDetail={onOpenDetail}
                />
              );
            }
            // El paquete ya no está en ningún repo (repo externo quitado):
            // mostramos la entrada cruda y permitimos desinstalar igualmente.
            const meta = KIND_META[entry.kind];
            return (
              <GlassCard key={id} intensity="low" className="flex h-full flex-col gap-3 border-white/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5">
                    <meta.icon className="h-6 w-6 text-white/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-300">{id}</p>
                    <p className="text-[10px] text-muted-foreground">{meta.label} · v{entry.version} · repo no disponible</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-auto gap-1.5 border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                  onClick={() => void actions.doUninstall(id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Desinstalar
                </Button>
              </GlassCard>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Personalización por señales ───────────────────────── */

/**
 * Puntúa cada paquete según las señales del usuario (búsquedas + instalaciones
 * frecuentes) para subir en «Destacado» lo que encaja con sus preferencias y
 * poblar la fila «Recomendado para ti». Import dinámico de autonomy (SSR-safe);
 * se recalcula cuando cambia la Biblioteca. Devuelve mapa id→score y helpers.
 */
function useSignalScores(
  mounted: boolean,
  packages: LibraryPackage[],
): { scores: Record<string, number>; hasSignals: boolean } {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [hasSignals, setHasSignals] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    (async () => {
      try {
        const { topSignals } = await import("@/ai/astraura/autonomy");
        const installs = topSignals("installs", 20);
        const searches = topSignals("searches", 20);
        if (!alive) return;
        const map: Record<string, number> = {};
        // Instalaciones: coinciden por id de paquete (peso alto).
        for (const s of installs) map[s.key] = (map[s.key] ?? 0) + s.count * 3;
        // Búsquedas: el término suma a los paquetes cuyo nombre/tag/kind lo contienen.
        for (const s of searches) {
          const term = s.key.toLowerCase();
          if (term.length < 2) continue;
          for (const p of packages) {
            const hay =
              p.name.toLowerCase().includes(term) ||
              p.kind.includes(term) ||
              p.tags.some((t) => t.toLowerCase().includes(term));
            if (hay) map[p.id] = (map[p.id] ?? 0) + s.count;
          }
        }
        setScores(map);
        setHasSignals(installs.length > 0 || searches.length > 0);
      } catch {
        /* defensivo: sin señales, orden por defecto */
      }
    })();
    return () => { alive = false; };
  }, [mounted, packages]);

  return { scores, hasSignals };
}

/* ───────────────────────── Componente principal ───────────────────────── */

export function PackageStore({ section, query = "" }: { section: StoreSection; query?: string }) {
  const { data, mounted } = useStoreData();
  const aiReady = useAiReadiness(data.packages, mounted);
  const actions = useStoreActions();
  const [detail, setDetail] = useState<LibraryPackage | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Señales de preferencia (para personalizar «Destacado» / «Recomendado»).
  const signals = useSignalScores(mounted, data.packages);

  const openDetail = useCallback((pkg: LibraryPackage) => {
    setDetail(pkg);
    setDetailOpen(true);
  }, []);

  const q = query.trim().toLowerCase();

  // Registra el término buscado como señal (una vez que el usuario deja de
  // teclear ~600 ms) para que la Biblioteca aprenda y reordene recomendaciones.
  useEffect(() => {
    if (!mounted) return;
    const term = query.trim().toLowerCase();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      import("@/ai/astraura/autonomy").then((m) => m.recordSignal("searches", term)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [query, mounted]);
  const searchResults = useMemo(() => {
    if (!q) return [];
    return data.packages.filter((p) => {
      const meta = KIND_META[p.kind];
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.kind.includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        meta.plural.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [data.packages, q]);

  /* Orden por señales: sube lo que encaja con búsquedas/instalaciones del
   * usuario, manteniendo estable el resto (sort estable en JS moderno). */
  const byScoreDesc = useCallback(
    (a: LibraryPackage, b: LibraryPackage) => (signals.scores[b.id] ?? 0) - (signals.scores[a.id] ?? 0),
    [signals.scores],
  );
  const featuredSorted = useMemo(
    () => data.packages.filter((p) => p.featured).slice().sort(byScoreDesc),
    [data.packages, byScoreDesc],
  );
  const catalogSorted = useMemo(
    () => data.packages.filter((p) => !p.featured).slice().sort(byScoreDesc),
    [data.packages, byScoreDesc],
  );
  /* «Recomendado para ti»: los mejor puntuados por señales que NO estén ya
   * instalados (máx. 4). Vacío si el usuario aún no tiene señales. */
  const recommended = useMemo(() => {
    if (!signals.hasSignals) return [];
    return data.packages
      .filter((p) => (signals.scores[p.id] ?? 0) > 0 && !(p.id in data.installed))
      .sort(byScoreDesc)
      .slice(0, 4);
  }, [data.packages, data.installed, signals.hasSignals, signals.scores, byScoreDesc]);
  /* «Herramientas IA & Agentes»: la caja de herramientas de la inteligencia
   * gratis-primero de Aurora (repo builtin dedicado). Se destaca en portada. */
  const iaTools = useMemo(
    () => data.packages.filter((p) => p.sourceRepoId === IA_TOOLS_REPO_ID).slice().sort(byScoreDesc),
    [data.packages, byScoreDesc],
  );

  if (!mounted) {
    // SSR / primer render: esqueleto ligero sin tocar localStorage.
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl border border-white/5 bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {q ? (
        /* Resultados de búsqueda en vivo (nombre / tags / kind) */
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-white">Resultados</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
              {searchResults.length}
            </span>
          </div>
          <PackageGrid
            packages={searchResults}
            data={data}
            aiReady={aiReady}
            actions={actions}
            onOpenDetail={openDetail}
            emptyText={`Nada instalable coincide con «${query.trim()}». Prueba con otro nombre, etiqueta o categoría.`}
          />
        </section>
      ) : section === "destacado" ? (
        <>
          {/* Recomendado para ti: solo si hay señales y algún paquete puntúa. */}
          {recommended.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-300" />
                <h2 className="text-lg font-bold text-white">Recomendado para ti</h2>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                  según tus búsquedas e instalaciones
                </span>
              </div>
              <PackageGrid
                packages={recommended}
                data={data}
                aiReady={aiReady}
                actions={actions}
                onOpenDetail={openDetail}
                emptyText=""
              />
            </section>
          )}
          {/* Herramientas IA & Agentes: sección destacada (caja de herramientas
              de la inteligencia gratis-primero de Aurora). */}
          {iaTools.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="rounded-3xl border border-teal-400/20 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Bot className="h-5 w-5 text-teal-300" />
                  <h2 className="text-lg font-bold text-white">Herramientas IA & Agentes</h2>
                  <span className="rounded-full border border-teal-400/25 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-200">
                    {iaTools.length} · gratis y open source
                  </span>
                </div>
                <p className="mb-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  La caja de herramientas de la inteligencia gratis-primero de Aurora: listas vivas de
                  APIs gratis, fuentes locales, skills (calidad de UI · sentidos web) y patrones de
                  agentes. Todo viene pre-integrado; instala más aquí cuando quieras.
                </p>
                <PackageGrid
                  packages={iaTools}
                  data={data}
                  aiReady={aiReady}
                  actions={actions}
                  onOpenDetail={openDetail}
                  emptyText=""
                />
              </div>
            </section>
          )}
          {/* Hugging Bay: navegador VIVO de descubrimiento inteligente de modelos
              (datos en tiempo real vía proxy propio, no paquetes locales). */}
          <section className="flex flex-col gap-4">
            <HuggingBayBrowser />
          </section>
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-bold text-white">Destacado</h2>
            </div>
            <PackageGrid
              packages={featuredSorted}
              data={data}
              aiReady={aiReady}
              actions={actions}
              onOpenDetail={openDetail}
              emptyText="Sin destacados por ahora."
            />
          </section>
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-emerald-300" />
              <h2 className="text-lg font-bold text-white">Todo el catálogo</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                {data.packages.length}
              </span>
            </div>
            <PackageGrid
              packages={catalogSorted}
              data={data}
              aiReady={aiReady}
              actions={actions}
              onOpenDetail={openDetail}
              emptyText="El catálogo está vacío (esto no debería pasar: el repo del núcleo viene integrado)."
            />
          </section>
        </>
      ) : section === "categorias" ? (
        <CategoryPicker data={data} aiReady={aiReady} actions={actions} onOpenDetail={openDetail} mounted={mounted} />
      ) : section === "repos" ? (
        <ReposSection data={data} />
      ) : (
        <InstalledSection data={data} aiReady={aiReady} actions={actions} onOpenDetail={openDetail} />
      )}

      {/* Ficha de detalle con transparencia total del payload */}
      <PackageDetailSheet
        pkg={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        data={data}
        aiReady={aiReady}
        actions={actions}
        onOpenDetail={openDetail}
      />
    </div>
  );
}
