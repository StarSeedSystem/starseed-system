"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · SELECTOR DE CATEGORÍAS (rediseño P6)
// ----------------------------------------------------------------------------
// Superficie de selección de categorías de la tienda viva. Es ADITIVA y
// DEFENSIVA: reemplaza SOLO la pestaña «Categorías» del PackageStore y reutiliza
// sus piezas exportadas (KIND_META + PackageGrid, que internamente usa las
// mismas tarjetas con PkgIcon/materialClassFor) para NO tocar el flujo real de
// instalar/desinstalar (todo eso sigue en package-store.tsx → packages.ts).
// Renderiza CUALQUIER categoría que exista en packages.ts hoy
// (los 12 kinds) y las que se añadan luego (p.ej. «Agentes»): las categorías se
// derivan de los paquetes vivos + KIND_META, nunca de una lista fija.
//
// Qué añade (P6):
//   1. Ventana-selector con TODAS las categorías + icono lucide simbólico por
//      categoría (mapa KIND_SYMBOL; fallback al icono de KIND_META).
//   2. Orden + filtros configurables y PERSONALIZABLES por categoría, guardados
//      por categoría en localStorage (clave `starseed.library.filters.v1`).
//   3. «Aurora recomienda» por categoría: usa el hook REAL de autonomía
//      (topSignals de src/ai/astraura/autonomy) para ordenar por tus señales
//      (búsquedas + instalaciones); si aún no hay señales, cae a una heurística
//      honesta y determinista (destacados primero, luego más etiquetas).
//   4. Buscador inteligente que filtra por nombre / descripción / etiquetas en
//      toda la biblioteca (ámbito conmutable: categoría actual o todo).
//   5. Secciones «Novedades», «Populares» y «Relevantes» dentro de cada
//      categoría y a nivel general. Derivadas de forma determinista de campos
//      existentes (sin métricas reales, etiquetado con honestidad):
//        · Novedades  = mayor versión (semver) → desempata alfabético.
//        · Populares  = destacados (`featured`) primero, luego más etiquetas.
//        · Relevantes = coincidencia con la búsqueda/etiquetas (o «Aurora
//                       recomienda» cuando no hay búsqueda activa).
//
// SSR-safe: los filtros persistidos y las señales de Aurora se leen tras montar.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  // Iconos simbólicos por categoría (uno por PackageKind conocido) + acciones.
  AppWindow, LayoutGrid, FileText, Megaphone, PencilRuler, Microscope,
  FolderKanban, Paintbrush, Wand2, BrainCircuit, GitBranch,
  Shapes, Search, ArrowLeft, ArrowUpDown, Sparkles, Clock, Flame,
  Target, ListFilter, X, Package, Bot,
  type LucideIcon,
} from "lucide-react";
import type { LibraryPackage, PackageKind } from "@/lib/library/packages";
import {
  KIND_META,
  PackageGrid,
  type StoreActions,
  type StoreData,
} from "@/components/library/package-store";

/* ───────────────────── Icono SIMBÓLICO por categoría ───────────────────── */
// Distinto del icono funcional de KIND_META (chips): aquí buscamos un símbolo
// más expresivo para la portada del selector. Defensivo: cualquier kind sin
// símbolo cae al icono de KIND_META, y si el kind es desconocido, a Package.

const KIND_SYMBOL: Partial<Record<PackageKind, LucideIcon>> = {
  app: AppWindow,
  widget: LayoutGrid,
  page: FileText,
  publication: Megaphone,
  board: PencilRuler,
  research: Microscope,
  project: FolderKanban,
  design: Paintbrush,
  animation: Wand2,
  function: BrainCircuit,
  "ai-source": Bot,
  repo: GitBranch,
};

function symbolFor(kind: PackageKind): LucideIcon {
  return KIND_SYMBOL[kind] ?? KIND_META[kind]?.icon ?? Package;
}

/** Etiqueta legible de una categoría (defensiva ante kinds no mapeados). */
function labelFor(kind: PackageKind): string {
  return KIND_META[kind]?.plural ?? kind;
}
function chipFor(kind: PackageKind): string {
  return KIND_META[kind]?.chip ?? "bg-white/10 text-white border-white/20";
}

/* ───────────────────── Filtros persistidos por categoría ───────────────────── */

export const LIBRARY_FILTERS_KEY = "starseed.library.filters.v1";

type SortMode = "aurora" | "novedades" | "populares" | "relevantes" | "alfabetico";

/** Ajustes de orden/filtro de UNA categoría (personalizables, persistidos). */
interface CategoryFilter {
  sort: SortMode;
  onlyFree: boolean;
  onlyInstalled: boolean;
  onlyFeatured: boolean;
  hideComingSoon: boolean;
  /** Etiquetas seleccionadas como filtro (AND-lite: al menos una coincide). */
  tags: string[];
}

const DEFAULT_FILTER: CategoryFilter = {
  sort: "aurora",
  onlyFree: false,
  onlyInstalled: false,
  onlyFeatured: false,
  hideComingSoon: false,
  tags: [],
};

const SORT_LABELS: Record<SortMode, string> = {
  aurora: "Aurora recomienda",
  novedades: "Novedades",
  populares: "Populares",
  relevantes: "Relevantes",
  alfabetico: "Alfabético",
};

type FiltersState = Record<string, CategoryFilter>;

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Sanea un CategoryFilter crudo del storage (defensivo, nunca lanza). */
function sanitizeFilter(raw: unknown): CategoryFilter {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FILTER };
  const r = raw as Record<string, unknown>;
  const sort = typeof r.sort === "string" && r.sort in SORT_LABELS ? (r.sort as SortMode) : DEFAULT_FILTER.sort;
  return {
    sort,
    onlyFree: r.onlyFree === true,
    onlyInstalled: r.onlyInstalled === true,
    onlyFeatured: r.onlyFeatured === true,
    hideComingSoon: r.hideComingSoon === true,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string").slice(0, 24) : [],
  };
}

function readFilters(): FiltersState {
  if (!isClient()) return {};
  try {
    const raw = window.localStorage.getItem(LIBRARY_FILTERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: FiltersState = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = sanitizeFilter(value);
    }
    return out;
  } catch {
    return {};
  }
}

function writeFilters(state: FiltersState): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(LIBRARY_FILTERS_KEY, JSON.stringify(state));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/** Hook: estado de filtros persistido por categoría (clave especial "__all__"). */
function useCategoryFilters(mounted: boolean) {
  const [filters, setFilters] = useState<FiltersState>({});

  useEffect(() => {
    if (mounted) setFilters(readFilters());
  }, [mounted]);

  const getFilter = useCallback(
    (key: string): CategoryFilter => filters[key] ?? { ...DEFAULT_FILTER },
    [filters],
  );

  const setFilter = useCallback((key: string, patch: Partial<CategoryFilter>) => {
    setFilters((prev) => {
      const current = prev[key] ?? { ...DEFAULT_FILTER };
      const next: FiltersState = { ...prev, [key]: { ...current, ...patch } };
      writeFilters(next);
      return next;
    });
  }, []);

  const resetFilter = useCallback((key: string) => {
    setFilters((prev) => {
      const next: FiltersState = { ...prev, [key]: { ...DEFAULT_FILTER } };
      writeFilters(next);
      return next;
    });
  }, []);

  return { getFilter, setFilter, resetFilter };
}

/* ───────────────────── «Aurora recomienda» (hook de autonomía real) ───────────────────── */

/**
 * Puntúa cada paquete combinando (a) las SEÑALES reales del usuario del router
 * de Aurora (topSignals: instalaciones ×3 + búsquedas que casan por nombre/tag/
 * kind) y (b) una heurística honesta y determinista de respaldo (destacado +
 * nº de etiquetas), para que «Aurora recomienda» funcione incluso sin señales.
 * Import dinámico de autonomy (SSR-safe); nunca lanza.
 */
function useAuroraScores(mounted: boolean, packages: LibraryPackage[]) {
  const [signalScores, setSignalScores] = useState<Record<string, number>>({});
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
        for (const s of installs) map[s.key] = (map[s.key] ?? 0) + s.count * 3;
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
        setSignalScores(map);
        setHasSignals(installs.length > 0 || searches.length > 0);
      } catch {
        /* defensivo: sin señales usamos solo la heurística determinista */
      }
    })();
    return () => { alive = false; };
  }, [mounted, packages]);

  /** Heurística determinista de respaldo: destacado (peso alto) + nº etiquetas. */
  const heuristic = useCallback((p: LibraryPackage): number => {
    return (p.featured ? 100 : 0) + Math.min(p.tags.length, 12);
  }, []);

  /** Puntuación combinada: señales reales (dominan) + heurística de respaldo. */
  const scoreOf = useCallback(
    (p: LibraryPackage): number => (signalScores[p.id] ?? 0) * 10 + heuristic(p),
    [signalScores, heuristic],
  );

  return { scoreOf, hasSignals };
}

/* ───────────────────── Ordenaciones deterministas ───────────────────── */

/** Compara versiones semver de forma tolerante (mayor primero). */
function compareVersionDesc(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return 0;
}

/** Novedades: versión más alta primero; desempate alfabético estable. */
function sortNovedades(list: LibraryPackage[]): LibraryPackage[] {
  return [...list].sort((a, b) => compareVersionDesc(a.version, b.version) || a.name.localeCompare(b.name));
}

/** Populares: destacados primero, luego más etiquetas; desempate alfabético. */
function sortPopulares(list: LibraryPackage[]): LibraryPackage[] {
  return [...list].sort((a, b) => {
    const fa = a.featured ? 1 : 0;
    const fb = b.featured ? 1 : 0;
    if (fa !== fb) return fb - fa;
    if (a.tags.length !== b.tags.length) return b.tags.length - a.tags.length;
    return a.name.localeCompare(b.name);
  });
}

/* ───────────────────── Barra de orden + filtros (por categoría) ───────────────────── */

function FilterBar({
  filter,
  availableTags,
  onPatch,
  onReset,
  scopeLabel,
}: {
  filter: CategoryFilter;
  availableTags: { tag: string; count: number }[];
  onPatch: (patch: Partial<CategoryFilter>) => void;
  onReset: () => void;
  scopeLabel: string;
}) {
  const activeCount =
    (filter.onlyFree ? 1 : 0) +
    (filter.onlyInstalled ? 1 : 0) +
    (filter.onlyFeatured ? 1 : 0) +
    (filter.hideComingSoon ? 1 : 0) +
    filter.tags.length;

  const toggleTag = (tag: string) => {
    const next = filter.tags.includes(tag)
      ? filter.tags.filter((t) => t !== tag)
      : [...filter.tags, tag];
    onPatch({ tags: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Orden */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 border-white/10 hover:bg-white/10 cursor-pointer">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{SORT_LABELS[filter.sort]}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="border-white/10 bg-black/80 backdrop-blur-xl">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Ordenar {scopeLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/5" />
          <DropdownMenuRadioGroup value={filter.sort} onValueChange={(v) => onPatch({ sort: v as SortMode })}>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <DropdownMenuRadioItem key={mode} value={mode} className="cursor-pointer text-sm">
                {SORT_LABELS[mode]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filtros (checkbox) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 border-white/10 hover:bg-white/10 cursor-pointer">
            <ListFilter className="h-3.5 w-3.5" />
            <span>Filtros</span>
            {activeCount > 0 && (
              <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary">
                {activeCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 border-white/10 bg-black/80 backdrop-blur-xl">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Mostrar solo</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/5" />
          <DropdownMenuCheckboxItem
            checked={filter.onlyFree}
            onCheckedChange={(v) => onPatch({ onlyFree: v === true })}
            className="cursor-pointer text-sm"
          >
            Gratis
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={filter.onlyInstalled}
            onCheckedChange={(v) => onPatch({ onlyInstalled: v === true })}
            className="cursor-pointer text-sm"
          >
            Instalados
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={filter.onlyFeatured}
            onCheckedChange={(v) => onPatch({ onlyFeatured: v === true })}
            className="cursor-pointer text-sm"
          >
            Destacados
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator className="bg-white/5" />
          <DropdownMenuCheckboxItem
            checked={filter.hideComingSoon}
            onCheckedChange={(v) => onPatch({ hideComingSoon: v === true })}
            className="cursor-pointer text-sm"
          >
            Ocultar «próximamente»
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Etiquetas de la categoría (chips filtrables) */}
      {availableTags.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 border-white/10 hover:bg-white/10 cursor-pointer">
              <span>Etiquetas</span>
              {filter.tags.length > 0 && (
                <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary">
                  {filter.tags.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 w-56 overflow-y-auto border-white/10 bg-black/80 backdrop-blur-xl">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Filtrar por etiqueta</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/5" />
            {availableTags.map(({ tag, count }) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={filter.tags.includes(tag)}
                onCheckedChange={() => toggleTag(tag)}
                className="cursor-pointer text-sm"
              >
                #{tag} <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground hover:text-white cursor-pointer"
          onClick={onReset}
        >
          <X className="h-3.5 w-3.5" /> Limpiar
        </Button>
      )}
    </div>
  );
}

/* ───────────────────── Aplicar filtros + orden a una lista ───────────────────── */

function applyFilter(
  list: LibraryPackage[],
  filter: CategoryFilter,
  installed: Record<string, unknown>,
  scoreOf: (p: LibraryPackage) => number,
  query: string,
): LibraryPackage[] {
  const q = query.trim().toLowerCase();
  let out = list.filter((p) => {
    if (filter.onlyFree && !p.free) return false;
    if (filter.onlyInstalled && !(p.id in installed)) return false;
    if (filter.onlyFeatured && !p.featured) return false;
    if (filter.hideComingSoon && p.comingSoon) return false;
    if (filter.tags.length > 0 && !filter.tags.some((t) => p.tags.includes(t))) return false;
    if (q) {
      const hay =
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q));
      if (!hay) return false;
    }
    return true;
  });

  switch (filter.sort) {
    case "novedades":
      out = sortNovedades(out);
      break;
    case "populares":
      out = sortPopulares(out);
      break;
    case "alfabetico":
      out = [...out].sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "relevantes":
    case "aurora":
    default:
      // «Aurora recomienda» y «Relevantes» comparten el motor de puntuación
      // (señales reales + heurística); estable para el resto.
      out = [...out].sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name));
      break;
  }
  return out;
}

/* ───────────────────── Carrusel horizontal de una sub-sección ───────────────────── */

function ShelfRow({
  title,
  hint,
  icon: Icon,
  accent,
  packages,
  data,
  aiReady,
  actions,
  onOpenDetail,
}: {
  title: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  packages: LibraryPackage[];
  data: StoreData;
  aiReady: Record<string, boolean>;
  actions: StoreActions;
  onOpenDetail: (pkg: LibraryPackage) => void;
}) {
  if (packages.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", accent)} />
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
          {hint}
        </span>
      </div>
      <PackageGrid
        packages={packages}
        data={data}
        aiReady={aiReady}
        actions={actions}
        onOpenDetail={onOpenDetail}
        emptyText=""
      />
    </section>
  );
}

/* ───────────────────── Vista de UNA categoría abierta ───────────────────── */

function CategoryView({
  kind,
  data,
  aiReady,
  actions,
  onOpenDetail,
  onBack,
  scoreOf,
  hasSignals,
  filter,
  onPatch,
  onReset,
}: {
  kind: PackageKind;
  data: StoreData;
  aiReady: Record<string, boolean>;
  actions: StoreActions;
  onOpenDetail: (pkg: LibraryPackage) => void;
  onBack: () => void;
  scoreOf: (p: LibraryPackage) => number;
  hasSignals: boolean;
  filter: CategoryFilter;
  onPatch: (patch: Partial<CategoryFilter>) => void;
  onReset: () => void;
}) {
  const [query, setQuery] = useState("");
  const SymbolIcon = symbolFor(kind);

  const items = useMemo(() => data.packages.filter((p) => p.kind === kind), [data.packages, kind]);

  // Etiquetas presentes en esta categoría (con recuento), para el filtro por tag.
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of items) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [items]);

  const filtered = useMemo(
    () => applyFilter(items, filter, data.installed, scoreOf, query),
    [items, filter, data.installed, scoreOf, query],
  );

  // Sub-secciones (sobre el conjunto YA filtrado, honestas y deterministas).
  const novedades = useMemo(() => sortNovedades(filtered).slice(0, 8), [filtered]);
  const populares = useMemo(() => sortPopulares(filtered).slice(0, 8), [filtered]);
  const relevantes = useMemo(
    () => [...filtered].sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name)).slice(0, 8),
    [filtered, scoreOf],
  );

  const meta = KIND_META[kind];

  return (
    <section className="flex flex-col gap-5">
      {/* Cabecera de la categoría */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-2 cursor-pointer" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Categorías
        </Button>
        <div className={cn("grid h-9 w-9 place-items-center rounded-xl border", chipFor(kind))}>
          <SymbolIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">{labelFor(kind)}</h2>
          <p className="text-[11px] text-muted-foreground">
            {items.length} paquete{items.length === 1 ? "" : "s"}
            {filtered.length !== items.length ? ` · ${filtered.length} tras filtros` : ""}
          </p>
        </div>
        {meta && (
          <span className={cn("ml-auto hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex", meta.chip)}>
            <meta.icon className="h-3.5 w-3.5" /> {meta.label}
          </span>
        )}
      </div>

      {/* Buscador dentro de la categoría + barra de orden/filtros */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-background/20 p-4 backdrop-blur-xl">
        <div className="relative w-full group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            placeholder={`Buscar en ${labelFor(kind)} por nombre, descripción o etiqueta…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-white/10 bg-black/30 pl-10 focus-visible:ring-indigo-500/40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FilterBar
          filter={filter}
          availableTags={availableTags}
          onPatch={onPatch}
          onReset={onReset}
          scopeLabel={labelFor(kind).toLowerCase()}
        />
      </div>

      {/* Sub-secciones honestas (solo cuando NO hay filtro de orden manual fuerte
          ni búsqueda: si el usuario ya pidió un orden concreto, respetamos su
          lista única para no confundir). */}
      {!query && filter.sort === "aurora" ? (
        <>
          <ShelfRow
            title="Aurora recomienda"
            hint={hasSignals ? "según tus señales" : "heurística: destacados y más etiquetas"}
            icon={Sparkles}
            accent="text-cyan-300"
            packages={relevantes}
            data={data}
            aiReady={aiReady}
            actions={actions}
            onOpenDetail={onOpenDetail}
          />
          <ShelfRow
            title="Novedades"
            hint="por versión más alta"
            icon={Clock}
            accent="text-emerald-300"
            packages={novedades}
            data={data}
            aiReady={aiReady}
            actions={actions}
            onOpenDetail={onOpenDetail}
          />
          <ShelfRow
            title="Populares"
            hint="destacados y más etiquetados"
            icon={Flame}
            accent="text-amber-300"
            packages={populares}
            data={data}
            aiReady={aiReady}
            actions={actions}
            onOpenDetail={onOpenDetail}
          />
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Shapes className="h-4 w-4 text-indigo-300" />
              <h3 className="text-sm font-bold text-white">Todo en {labelFor(kind)}</h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                {filtered.length}
              </span>
            </div>
            <PackageGrid
              packages={filtered}
              data={data}
              aiReady={aiReady}
              actions={actions}
              onOpenDetail={onOpenDetail}
              emptyText="Nada coincide con tus filtros en esta categoría. Ajusta los filtros o añade repos para ampliar el catálogo."
            />
          </section>
        </>
      ) : (
        <PackageGrid
          packages={filtered}
          data={data}
          aiReady={aiReady}
          actions={actions}
          onOpenDetail={onOpenDetail}
          emptyText={
            query
              ? `Nada en ${labelFor(kind)} coincide con «${query.trim()}».`
              : "Nada coincide con tus filtros. Ajusta los filtros o añade repos para ampliar el catálogo."
          }
        />
      )}
    </section>
  );
}

/* ───────────────────── Portada del selector (todas las categorías) ───────────────────── */

function CategoryGrid({
  kinds,
  counts,
  onSelect,
}: {
  kinds: PackageKind[];
  counts: Map<PackageKind, number>;
  onSelect: (kind: PackageKind) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {kinds.map((kind) => {
        const count = counts.get(kind) ?? 0;
        const SymbolIcon = symbolFor(kind);
        return (
          <button
            key={kind}
            onClick={() => onSelect(kind)}
            className="group cursor-pointer rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-4 text-left transition-all duration-200 hover:border-primary/40 hover:scale-[1.02]"
          >
            <div className={cn("mb-3 grid h-11 w-11 place-items-center rounded-xl border", chipFor(kind))}>
              <SymbolIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-gray-100 transition-colors group-hover:text-primary">
              {labelFor(kind)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {count} paquete{count === 1 ? "" : "s"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────── Componente principal exportado ───────────────────── */

export function CategoryPicker({
  data,
  aiReady,
  actions,
  onOpenDetail,
  mounted,
}: {
  data: StoreData;
  aiReady: Record<string, boolean>;
  actions: StoreActions;
  onOpenDetail: (pkg: LibraryPackage) => void;
  mounted: boolean;
}) {
  const [selected, setSelected] = useState<PackageKind | null>(null);
  // Buscador GLOBAL (portada): filtra por nombre/descr/etiquetas en toda la lib.
  const [globalQuery, setGlobalQuery] = useState("");

  const { scoreOf, hasSignals } = useAuroraScores(mounted, data.packages);
  const { getFilter, setFilter, resetFilter } = useCategoryFilters(mounted);

  // Categorías VIVAS: las presentes en los paquetes + las conocidas en KIND_META
  // (así aparecen incluso vacías y NUNCA se rompe si packages.ts añade un kind
  // nuevo, p.ej. «Agentes»: se incluye aunque no esté en KIND_META).
  const counts = useMemo(() => {
    const map = new Map<PackageKind, number>();
    for (const p of data.packages) map.set(p.kind, (map.get(p.kind) ?? 0) + 1);
    return map;
  }, [data.packages]);

  const kinds = useMemo(() => {
    const known = Object.keys(KIND_META) as PackageKind[];
    const extra = Array.from(counts.keys()).filter((k) => !known.includes(k));
    // Conocidas primero (orden de KIND_META), luego cualquier kind nuevo vivo.
    return [...known, ...extra];
  }, [counts]);

  // Registra la búsqueda global como señal de Aurora (aprendizaje), con debounce.
  useEffect(() => {
    if (!mounted) return;
    const term = globalQuery.trim().toLowerCase();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      import("@/ai/astraura/autonomy").then((m) => m.recordSignal("searches", term)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [globalQuery, mounted]);

  // Resultado del buscador global (toda la biblioteca, cualquier categoría).
  const globalResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    const matched = data.packages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.kind.includes(q) ||
        (KIND_META[p.kind]?.label ?? "").toLowerCase().includes(q) ||
        (KIND_META[p.kind]?.plural ?? "").toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
    return [...matched].sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name));
  }, [data.packages, globalQuery, scoreOf]);

  // Sub-secciones GENERALES (portada, sin categoría abierta ni búsqueda).
  const overallNovedades = useMemo(() => sortNovedades(data.packages).slice(0, 8), [data.packages]);
  const overallPopulares = useMemo(() => sortPopulares(data.packages).slice(0, 8), [data.packages]);
  const overallRelevantes = useMemo(
    () => [...data.packages].sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name)).slice(0, 8),
    [data.packages, scoreOf],
  );

  // Categoría abierta.
  if (selected) {
    return (
      <CategoryView
        kind={selected}
        data={data}
        aiReady={aiReady}
        actions={actions}
        onOpenDetail={onOpenDetail}
        onBack={() => setSelected(null)}
        scoreOf={scoreOf}
        hasSignals={hasSignals}
        filter={getFilter(selected)}
        onPatch={(patch) => setFilter(selected, patch)}
        onReset={() => resetFilter(selected)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Buscador inteligente GLOBAL */}
      <div className="relative w-full group">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          placeholder="Buscar en toda la biblioteca: nombre, descripción o etiqueta…"
          value={globalQuery}
          onChange={(e) => setGlobalQuery(e.target.value)}
          className="h-12 rounded-2xl border-white/10 bg-black/30 pl-12 pr-10 text-base focus-visible:ring-indigo-500/40"
        />
        {globalQuery && (
          <button
            onClick={() => setGlobalQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {globalQuery.trim() ? (
        /* Resultados del buscador inteligente (toda la biblioteca) */
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-white">Resultados en toda la biblioteca</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
              {globalResults.length}
            </span>
          </div>
          <PackageGrid
            packages={globalResults}
            data={data}
            aiReady={aiReady}
            actions={actions}
            onOpenDetail={onOpenDetail}
            emptyText={`Nada instalable coincide con «${globalQuery.trim()}». Prueba con otro nombre, etiqueta o categoría.`}
          />
        </section>
      ) : (
        <>
          {/* Ventana-selector: todas las categorías con icono simbólico + conteo */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Shapes className="h-5 w-5 text-indigo-300" />
              <h2 className="text-lg font-bold text-white">Categorías · elige un tipo</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                {kinds.length}
              </span>
            </div>
            <p className="max-w-2xl text-xs text-muted-foreground">
              Cada categoría abre su propia ventana con orden, filtros configurables (gratis · instalados
              · destacados · etiquetas), «Aurora recomienda» y las secciones Novedades, Populares y
              Relevantes. Tus filtros se recuerdan por categoría en este dispositivo.
            </p>
            <CategoryGrid kinds={kinds} counts={counts} onSelect={setSelected} />
          </section>

          {/* Sub-secciones GENERALES (a nivel de toda la biblioteca) */}
          <GlassCard intensity="low" className="border-white/5 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              <h2 className="text-lg font-bold text-white">En toda la biblioteca</h2>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                {hasSignals ? "Aurora aprende de tus señales" : "orden honesto y determinista"}
              </span>
            </div>
            <div className="flex flex-col gap-6">
              <ShelfRow
                title="Aurora recomienda"
                hint={hasSignals ? "según tus señales" : "heurística: destacados y más etiquetas"}
                icon={Target}
                accent="text-cyan-300"
                packages={overallRelevantes}
                data={data}
                aiReady={aiReady}
                actions={actions}
                onOpenDetail={onOpenDetail}
              />
              <ShelfRow
                title="Novedades"
                hint="por versión más alta"
                icon={Clock}
                accent="text-emerald-300"
                packages={overallNovedades}
                data={data}
                aiReady={aiReady}
                actions={actions}
                onOpenDetail={onOpenDetail}
              />
              <ShelfRow
                title="Populares"
                hint="destacados y más etiquetados"
                icon={Flame}
                accent="text-amber-300"
                packages={overallPopulares}
                data={data}
                aiReady={aiReady}
                actions={actions}
                onOpenDetail={onOpenDetail}
              />
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
