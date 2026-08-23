"use client";

/**
 * CommandPalette — lanzador global por teclado (Cmd/Ctrl+K).
 * ============================================================================
 * Paleta de comandos: buscar y saltar a cualquier app/página del OS, más un
 * pequeño set de ACCIONES RÁPIDAS. Se monta UNA vez en el layout RAÍZ como
 * HERMANO de `{children}` (igual que `ConfirmProvider`, Adenda 137) para estar
 * disponible en TODAS las rutas, sin envolver el árbol (evita el React #310).
 *
 * Destinos = DOCK_PRESETS (dock-config.ts, catálogo canónico del OmniDock) +
 * las entradas de APP_CATALOG (app-catalog.ts) que tengan `open.route` (ruta
 * interna real; las apps solo-externas como Nexus/Café, o sin ruta como
 * Música/Radio «soon», se excluyen porque no hay un `path` al que hacer
 * `router.push`). Se de-duplica por `path` exacto — si dos catálogos apuntan
 * al mismo path gana el preset del dock. Con el estado actual del repo esto
 * agrega 39 destinos del dock + 5 nuevos de APP_CATALOG (audiomorphic,
 * omnifrecuencias, network, clima→/atmosphere, immersive) = 44 destinos.
 * DOCK_PRESETS se usa COMPLETO (no solo `enabled:true`): un botón apagado en
 * el dock del usuario sigue siendo una página real y navegable — ese es
 * justamente el valor de una paleta de comandos (llegar a lo que no está
 * anclado en el dock).
 *
 * ⚠️ CONFLICTO EXISTENTE (verificado por grep antes de escribir esto):
 * `src/components/design-canvas/DesignIntegrationCanvas.tsx` (montado solo en
 * la ruta /design-canvas) ya tiene SU PROPIO atajo Cmd/Ctrl+K local, que abre
 * `SettingsCommandCenter` — un buscador de AJUSTES de esa herramienta (no de
 * navegación del OS). Su listener es `window.addEventListener("keydown", …)`
 * en fase de BURBUJA, sin capturar el foco del target.
 * Para NO abrir las dos paletas a la vez («double-bind»), el listener global
 * de aquí abajo usa la FASE DE CAPTURA (`addEventListener(..., true)`) +
 * `stopPropagation()` al activarse: la captura en `window` SIEMPRE precede a
 * la burbuja, así que esta paleta gana de forma determinista y el listener
 * local de /design-canvas deja de recibir el evento mientras esta paleta esté
 * montada (o sea, siempre, al vivir en el layout raíz). Con foco en un campo
 * de texto/contenteditable y la paleta CERRADA, en cambio, no se intercepta
 * nada (se deja pasar el evento tal cual) — así que ese caso concreto del
 * buscador de /design-canvas se conserva intacto. No se tocó
 * `DesignIntegrationCanvas.tsx`: si se quiere seguir teniendo un atajo directo
 * a ESE buscador de ajustes, conviene remaparlo (p.ej. Cmd/Ctrl+Shift+K).
 *
 * Estilo «Crystal Liquid Glass»: panel `liquid-glass-panel` + backdrop
 * `bg-black/70 backdrop-blur-sm`, igual que `confirm-dialog.tsx`/`dialog.tsx`.
 * Accesibilidad vía `useModalA11y` (foco inicial en el input, trampa de Tab,
 * Escape, devolución de foco al cerrar) — Escape lo gestiona SOLO el hook
 * (closeOnEscape por defecto); ↑/↓ los gestiona un listener propio mientras
 * la paleta está abierta; Enter lo gestiona el propio input (evita disparar
 * la activación dos veces si el foco ya está en un botón de fila vía Tab,
 * donde Enter/Space nativos del <button> ya activan `onClick`).
 */

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Binary,
  Brain,
  Command as CommandIcon,
  CornerDownLeft,
  Cpu,
  Mic,
  Radio,
  Search,
  SearchX,
  Sparkles,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import {
  DOCK_PRESETS,
  DOCK_ICON_MAP,
  DOCK_FALLBACK_ICON,
  type DockColor,
} from "@/components/layout/dock-config";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { openAuroraSetup } from "@/lib/aurora/setup-config";
import { openAstrauraConfig } from "@/lib/astraura/config-ui";

/* ═══════════════════════════ Tipos ═══════════════════════════ */

type IconComponent = ComponentType<{ className?: string }>;

interface PaletteEntry {
  id: string;
  kind: "action" | "destination";
  label: string;
  /** Subtítulo discreto: path interno (destinos) o descripción corta (acciones). */
  hint: string;
  icon: IconComponent;
  color: DockColor;
  activate: () => void;
  /** Cabecera de sección visual (se asigna al construir `rows`, no aquí). */
  group?: string;
}

interface PaletteDestination {
  id: string;
  label: string;
  path: string;
  icon: IconComponent;
  color: DockColor;
}

/* ═══════════════════ Destinos: fusión + de-dupe por path ═══════════════════ */

function buildDestinations(): PaletteDestination[] {
  const seenPaths = new Set<string>();
  const out: PaletteDestination[] = [];

  // 1) DOCK_PRESETS — catálogo canónico del OmniDock (completo, no solo enabled).
  for (const item of DOCK_PRESETS) {
    if (seenPaths.has(item.path)) continue;
    seenPaths.add(item.path);
    out.push({
      id: `dock:${item.id}`,
      label: item.label,
      path: item.path,
      // DOCK_ICON_MAP está tipado como ComponentType<{className?:string}> (más
      // laxo que LucideIcon); es exactamente nuestro IconComponent — cast solo
      // para dejar explícito que ambos catálogos conviven en el mismo campo.
      icon: (DOCK_ICON_MAP[item.iconKey] ?? DOCK_FALLBACK_ICON) as IconComponent,
      color: item.color,
    });
  }

  // 2) APP_CATALOG — solo entradas con ruta interna real (`open.route`); las
  //    apps solo-externas (Nexus, Café) o sin ruta (Música/Radio "soon") no
  //    tienen un path al que navegar y quedan fuera de esta paleta.
  for (const app of APP_CATALOG) {
    const route = app.open.route;
    if (!route || seenPaths.has(route)) continue;
    seenPaths.add(route);
    out.push({
      id: `app:${app.id}`,
      label: app.name,
      path: route,
      icon: app.icon,
      color: "neutral",
    });
  }

  return out;
}

/* ═══════════════ Matcher fuzzy/substring mínimo (sin dependencias) ═══════════════ */

/** Rango Unicode de marcas diacríticas combinantes (tildes, diéresis…): U+0300–U+036F. */
const DIACRITICS_RE = /[\u0300-\u036f]/g;

/** minúsculas + sin diacríticos, para que "senales" encuentre "Señales". */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

/**
 * Puntúa `text` contra `query` (null = no matchea). Primero intenta substring
 * exacto (mejor cuanto antes empiece); si no, subsecuencia difusa: cada
 * carácter de `query` debe aparecer en orden dentro de `text` (huecos
 * penalizan un poco frente a coincidencias consecutivas).
 */
function fuzzyScore(text: string, query: string): number | null {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx !== -1) return 1000 - idx;

  let ti = 0;
  let score = 0;
  let lastMatch = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti);
    if (found === -1) return null;
    score += found === lastMatch + 1 ? 2 : 1;
    lastMatch = found;
    ti = found + 1;
  }
  return score;
}

/** Filtra + ordena entradas por mejor puntuación (label o hint) contra `query`. */
function rankEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const scored: { entry: PaletteEntry; score: number }[] = [];
  for (const entry of entries) {
    const s1 = fuzzyScore(entry.label, query);
    const s2 = fuzzyScore(entry.hint, query);
    const best = s1 === null ? s2 : s2 === null ? s1 : Math.max(s1, s2);
    if (best !== null) scored.push({ entry, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.entry);
}

/* ═══════════════════════ Recientes (memoria en módulo, sin localStorage) ═══════════════════════ */

const MAX_RECENTS = 6;
/** Ids (`PaletteEntry.id`) de los últimos destinos usados. Solo en memoria del
 *  proceso — se pierde al recargar, deliberadamente (nada de localStorage). */
let moduleRecentIds: string[] = [];

function pushRecent(id: string): void {
  moduleRecentIds = [id, ...moduleRecentIds.filter((existing) => existing !== id)].slice(0, MAX_RECENTS);
}

/* ═══════════════════════ Foco: ¿el target es un campo editable? ═══════════════════════ */

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return true;
  return target.isContentEditable;
}

/* ═══════════════════════ Estilos por acento (DockColor) ═══════════════════════ */

const ACCENT_TEXT: Record<DockColor, string> = {
  neutral: "text-foreground/70",
  cyan: "text-cyan-300",
  crimson: "text-red-300",
  amber: "text-amber-300",
  emerald: "text-emerald-300",
  purple: "text-purple-300",
};

const ACCENT_BG: Record<DockColor, string> = {
  neutral: "bg-foreground/10",
  cyan: "bg-cyan-500/15",
  crimson: "bg-red-500/15",
  amber: "bg-amber-500/15",
  emerald: "bg-emerald-500/15",
  purple: "bg-purple-500/15",
};

const GROUP_ACTIONS = "Acciones rápidas";
const GROUP_RECENT = "Recientes";
const GROUP_ALL = "Páginas y apps";

/* ═══════════════════════════ Componente ═══════════════════════════ */

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentsSnapshot, setRecentsSnapshot] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Catálogo de destinos: se calcula UNA vez (DOCK_PRESETS/APP_CATALOG son
  // constantes estáticas del módulo, no cambian en tiempo de ejecución).
  const destinations = useMemo(() => buildDestinations(), []);

  // Acciones rápidas verificadas (grep previo confirmó ambos eventos y sus
  // oyentes reales, montados en `src/app/(app)/app-globals.tsx`):
  //   · AURORA_SETUP_OPEN_EVENT   = "starseed:open-aurora-setup"   (Aurora Setup Center)
  //   · ASTRAURA_CONFIG_EVENT     = "starseed:open-astraura-config" (Drawer Astraura/OmniVoice)
  const quickActions = useMemo<PaletteEntry[]>(
    () => [
      {
        // (Adenda 153) Panel del SISTEMA PRIMARIO Astraura 1.58-bit.
        id: "action:astraura-158",
        kind: "action",
        label: "Astraura 1.58-bit: sistema primario",
        hint: "Estado del backend soberano, endpoint, personalidades, agentes, habilidades y cerebros",
        icon: Binary,
        color: "cyan",
        activate: () => router.push("/agent?tab=astraura-158"),
      },
      {
        id: "action:aurora-setup",
        kind: "action",
        label: "Configurar Neurona",
        hint: "Centro de configuración de Aurora: personalidad, sentidos y memoria",
        icon: Sparkles,
        color: "purple",
        activate: () => openAuroraSetup(),
      },
      {
        id: "action:astraura-config",
        kind: "action",
        label: "Configuración de Astraura / OmniVoice",
        hint: "Modelos de IA, orden de fuentes y voz",
        icon: SlidersHorizontal,
        color: "purple",
        activate: () => openAstrauraConfig(),
      },
      // (Adenda 149) Una entrada POR SISTEMA: la ventana tiene cinco puertas y
      // con una sola acción genérica no se descubrían. `openAstrauraConfig`
      // acepta la sección destino (llm · astraura · openvoice · cerebro · señales).
      {
        id: "action:astraura-llm",
        kind: "action",
        label: "Sistemas de Astraura: LLM",
        hint: "Modelo de lenguaje efectivo de cada personalidad en esta neurona",
        icon: Cpu,
        color: "cyan",
        activate: () => openAstrauraConfig("llm"),
      },
      {
        id: "action:astraura-router",
        kind: "action",
        label: "Sistemas de Astraura: Astraura",
        hint: "Modo automático o fijo, fuentes de pago y orden de motores",
        icon: SlidersHorizontal,
        color: "amber",
        activate: () => openAstrauraConfig("astraura"),
      },
      {
        id: "action:astraura-openvoice",
        kind: "action",
        label: "Sistemas de Astraura: OmniVoice",
        hint: "Sistema de voz: motor (OpenVoice 2 y compañía) y vía por personalidad",
        icon: Mic,
        color: "purple",
        activate: () => openAstrauraConfig("openvoice"),
      },
      {
        id: "action:astraura-cerebro",
        kind: "action",
        label: "Sistemas de Astraura: Cerebro",
        hint: "Memorias, nivel de contexto y cerebros permitidos",
        icon: Brain,
        color: "purple",
        activate: () => openAstrauraConfig("cerebro"),
      },
      {
        id: "action:astraura-senales",
        kind: "action",
        label: "Sistemas de Astraura: Señales",
        hint: "Antenas, entrada/salida y ruta preferida por personalidad",
        icon: Radio,
        color: "emerald",
        activate: () => openAstrauraConfig("senales"),
      },
      {
        id: "action:astraura-persona-activa",
        kind: "action",
        label: "Sistemas de Astraura: …de la personalidad activa",
        hint: "Abre la ventana ya centrada en la personalidad activa ahora mismo",
        icon: UserCog,
        color: "purple",
        // La personalidad activa se lee en el momento de activar (import
        // PEREZOSO: este componente vive en el layout raíz y no debe arrastrar
        // el módulo de personalidades a su chunk). Sin personalidad activa,
        // abre la ventana tal cual.
        activate: () => {
          void import("@/lib/aurora/personalities")
            .then((m) => {
              const id = (() => { try { return m.getActivePersonality()?.id ?? null; } catch { return null; } })();
              openAstrauraConfig("llm", id ? { personalityId: id } : undefined);
            })
            .catch(() => openAstrauraConfig("llm"));
        },
      },
    ],
    // `router` es estable entre renders (next/navigation); se declara por
    // honestidad con exhaustive-deps (la acción 1.58 navega con router.push).
    [router],
  );

  const destinationEntries = useMemo<PaletteEntry[]>(
    () =>
      destinations.map((d) => ({
        id: d.id,
        kind: "destination" as const,
        label: d.label,
        hint: d.path,
        icon: d.icon,
        color: d.color,
        activate: () => {
          pushRecent(d.id);
          router.push(d.path);
        },
      })),
    [destinations, router],
  );

  // Al ABRIR: limpia búsqueda/selección y toma una foto de los "recientes"
  // actuales (no se re-lee en cada tecla, solo al abrir). `useLayoutEffect`
  // (no `useEffect`) para que la foto esté lista ANTES del primer pintado y
  // no se vea un parpadeo con el snapshot de la apertura anterior.
  useLayoutEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    setRecentsSnapshot([...moduleRecentIds]);
  }, [open]);

  // Lista final, agrupada y filtrada — base del render Y de la navegación ↑/↓.
  const rows = useMemo<PaletteEntry[]>(() => {
    const q = query.trim();

    if (!q) {
      const byId = new Map(destinationEntries.map((e) => [e.id, e] as const));
      const recents = recentsSnapshot
        .map((id) => byId.get(id))
        .filter((e): e is PaletteEntry => !!e);
      const recentIds = new Set(recents.map((e) => e.id));
      const rest = destinationEntries.filter((e) => !recentIds.has(e.id));
      return [
        ...quickActions.map((e) => ({ ...e, group: GROUP_ACTIONS })),
        ...recents.map((e) => ({ ...e, group: GROUP_RECENT })),
        ...rest.map((e) => ({ ...e, group: GROUP_ALL })),
      ];
    }

    const matchedActions = rankEntries(quickActions, q).map((e) => ({ ...e, group: GROUP_ACTIONS }));
    const matchedDestinations = rankEntries(destinationEntries, q).map((e) => ({ ...e, group: GROUP_ALL }));
    return [...matchedActions, ...matchedDestinations];
  }, [query, quickActions, destinationEntries, recentsSnapshot]);

  // Atajo global Cmd/Ctrl+K — FASE DE CAPTURA (ver nota de conflicto arriba).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const isTrigger = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (!isTrigger) return;
      // Con la paleta CERRADA, si el foco está en un campo editable de la
      // página, dejamos pasar el atajo (no lo robamos a inputs/editores).
      // Con la paleta YA ABIERTA, el propio input de búsqueda cuenta como
      // "editable" y aun así debe poder cerrarse con el mismo atajo.
      if (!open && isEditableTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  // ↑/↓ mientras la paleta está abierta (funciona con foco en el input o,
  // tras Tab, en cualquier fila — por eso vive en window, no en el input).
  useEffect(() => {
    if (typeof window === "undefined" || !open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (rows.length ? (i + 1) % rows.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, rows.length]);

  // Foco inicial (input), trampa de Tab y Escape-para-cerrar + devolución de foco.
  useModalA11y({ open, onClose: () => setOpen(false), containerRef });

  function handleSelect(row: PaletteEntry) {
    row.activate();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/70 p-4 pt-[10vh] backdrop-blur-sm duration-200 animate-in fade-in-0 sm:items-center sm:pt-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
    >
      <div
        className="liquid-glass-panel flex w-full max-w-xl flex-col overflow-hidden text-foreground shadow-2xl duration-200 animate-in zoom-in-95 slide-in-from-top-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Búsqueda */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const row = rows[activeIndex];
                if (row) handleSelect(row);
              }
            }}
            placeholder="Busca una app, página o acción…"
            aria-label="Buscar"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="hidden shrink-0 items-center rounded border border-white/15 bg-white/5 px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            Esc
          </kbd>
        </div>

        {/* Resultados */}
        <div role="listbox" aria-label="Resultados" className="max-h-[60vh] overflow-y-auto p-2 sm:max-h-[420px]">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <SearchX className="size-7 opacity-40" aria-hidden="true" />
              <span>Sin resultados para «{query}»</span>
            </div>
          ) : (
            rows.map((row, i) => {
              const prevGroup = i > 0 ? rows[i - 1].group : undefined;
              const showHeader = !!row.group && row.group !== prevGroup;
              const Icon = row.icon;
              const active = i === activeIndex;
              return (
                <Fragment key={row.id}>
                  {showHeader && (
                    <div className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 first:pt-1">
                      {row.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(i)}
                    onFocus={() => setActiveIndex(i)}
                    onClick={() => handleSelect(row)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors duration-150",
                      active ? "border-white/10 bg-white/10" : "hover:bg-white/5",
                    )}
                  >
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ACCENT_BG[row.color])}>
                      <Icon className={cn("size-4", ACCENT_TEXT[row.color])} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground/90">{row.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground/70">{row.hint}</span>
                    </span>
                    {active && <ArrowRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
                  </button>
                </Fragment>
              );
            })
          )}
        </div>

        {/* Pistas de teclado */}
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-muted-foreground/60">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="size-3" aria-hidden="true" />
              <ArrowDown className="size-3" aria-hidden="true" />
              moverte
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="size-3" aria-hidden="true" />
              abrir
            </span>
          </div>
          <span className="inline-flex items-center gap-1 opacity-70">
            <CommandIcon className="size-3" aria-hidden="true" />K
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
