"use client";

// ════════════════════════════════════════════════════════════════
// LibrarySourcesPanel — Gestor de Fuentes de la Librería
// ----------------------------------------------------------------
// Lista TODAS las fuentes (`LIBRARY_SOURCES` seed + añadidas por el usuario)
// agrupadas por `kind` (código, componentes, diseño, MCP, modelos, apps,
// catálogo, automatización). Por cada fuente:
//   • Activar/desactivar (estado global en `starseed.library.sources.v1`).
//   • "Instalar en cerebro": elige un cerebro + alcance (usuario/comunidad)
//     y persiste en `starseed.brain.<id>.sources`.
//   • "Copiar enlace": genera un enlace compartible que abre `/install`
//     (instalación con permiso explícito, nunca automática).
// Además:
//   • "Añadir fuente": url + kind personalizados (fuente de usuario).
//   • "Actualizar skills": re-lee catálogo + fuentes y muestra novedades
//     instalables (vía `checkForUpdates` del agente de auto-actualización).
//
// Estética alineada con `OssLibraryBrowser` (bordes white/5, fondos black/20).
// Defensivo: guardas, try/catch, SSR-safe. UI en español.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  Plus,
  ExternalLink,
  Link2,
  BrainCircuit,
  Check,
  RefreshCw,
  Trash2,
  Loader2,
  Download,
  X,
  Users,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import type { LibrarySource } from "@/lib/oss-library";
import {
  getAllSources,
  isCustomSource,
  toggleSource,
  addCustomSource,
  removeCustomSource,
  installSourceInBrain,
  readBrainSources,
  type SourceKind,
  type InstallScope,
} from "@/lib/library/sources-store";
import { buildInstallLink, scopeBadge } from "@/lib/library/install";
import { listBrains, type Brain } from "@/lib/brains/brains";
import {
  checkForUpdates,
  type Novelty,
} from "@/lib/brain-skills/auto-update-agent";

// ── Metadatos de presentación por kind ───────────────────────────

const KIND_META: Record<SourceKind, { label: string; emoji: string; hint: string }> = {
  code: { label: "Código", emoji: "💾", hint: "Registros de paquetes y repos para instalar o clonar." },
  components: { label: "Componentes", emoji: "🧩", hint: "Componentes de interfaz para instalar y compartir en equipo." },
  design: { label: "Diseño", emoji: "🎨", hint: "Galerías e inspiración visual para nutrir el sistema de estilo." },
  mcp: { label: "MCP / Tools", emoji: "🔌", hint: "Servidores MCP: tools y contexto para los agentes." },
  models: { label: "Modelos", emoji: "🧠", hint: "Modelos, datasets y Spaces de IA para adjuntar a un cerebro." },
  apps: { label: "Apps", emoji: "🚀", hint: "Apps y plataformas IA self-host." },
  automation: { label: "Automatización", emoji: "🔁", hint: "Workflows y automatización." },
  catalog: { label: "Catálogo", emoji: "📚", hint: "Catálogos soberanos de opciones verificadas." },
};

const KIND_ORDER: SourceKind[] = [
  "catalog",
  "code",
  "components",
  "design",
  "mcp",
  "models",
  "apps",
  "automation",
];

const ADD_KIND_OPTIONS: SourceKind[] = [
  "code",
  "components",
  "design",
  "mcp",
  "models",
  "apps",
  "automation",
  "catalog",
];

function metaFor(kind: LibrarySource["kind"]): { label: string; emoji: string; hint: string } {
  const k = (kind ?? "catalog") as SourceKind;
  return KIND_META[k] ?? KIND_META.catalog;
}

// ── Componente principal ─────────────────────────────────────────

export function LibrarySourcesPanel() {
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainsLoading, setBrainsLoading] = useState(true);
  const [installedByBrain, setInstalledByBrain] = useState<Record<string, string[]>>({});

  // Estado del formulario "Añadir fuente".
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newKind, setNewKind] = useState<SourceKind>("code");

  // Estado de instalación (qué fuente se está instalando, alcance elegido).
  const [installFor, setInstallFor] = useState<LibrarySource | null>(null);
  const [installScope, setInstallScope] = useState<InstallScope>("user");
  const [installBrainId, setInstallBrainId] = useState<string>("");

  // Estado de "Actualizar skills".
  const [updateBrainId, setUpdateBrainId] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [novelties, setNovelties] = useState<Novelty[] | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  // ── Carga inicial ──
  const refreshSources = useCallback(() => {
    try {
      setSources(getAllSources());
    } catch {
      setSources([]);
    }
  }, []);

  const refreshInstalled = useCallback((list: Brain[]) => {
    const map: Record<string, string[]> = {};
    for (const b of list) {
      try {
        map[b.id] = readBrainSources(b.id).map((r) => r.sourceId);
      } catch {
        map[b.id] = [];
      }
    }
    setInstalledByBrain(map);
  }, []);

  useEffect(() => {
    refreshSources();
    let alive = true;
    (async () => {
      setBrainsLoading(true);
      try {
        const list = await listBrains();
        if (!alive) return;
        setBrains(list);
        refreshInstalled(list);
        if (list[0]) {
          setInstallBrainId((prev) => prev || list[0].id);
          setUpdateBrainId((prev) => prev || list[0].id);
        }
      } catch {
        if (alive) setBrains([]);
      } finally {
        if (alive) setBrainsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshSources, refreshInstalled]);

  // ── Agrupación por kind ──
  const grouped = useMemo(() => {
    const by: Record<string, LibrarySource[]> = {};
    for (const s of sources) {
      const k = (s.kind ?? "catalog") as SourceKind;
      (by[k] ||= []).push(s);
    }
    const orderedKeys = [
      ...KIND_ORDER.filter((k) => by[k]?.length),
      ...Object.keys(by).filter((k) => !KIND_ORDER.includes(k as SourceKind)),
    ];
    return orderedKeys.map((k) => ({ kind: k as SourceKind, items: by[k] }));
  }, [sources]);

  const enabledCount = useMemo(() => sources.filter((s) => s.enabled).length, [sources]);

  // ── Acciones ──
  function onToggle(s: LibrarySource) {
    try {
      const next = toggleSource(s.id);
      refreshSources();
      toast.success(`${s.label}: ${next ? "habilitada" : "deshabilitada"}.`);
    } catch {
      toast.error("No se pudo cambiar el estado de la fuente.");
    }
  }

  function onRemoveCustom(s: LibrarySource) {
    try {
      removeCustomSource(s.id);
      refreshSources();
      toast.success(`Fuente «${s.label}» eliminada.`);
    } catch {
      toast.error("No se pudo eliminar la fuente.");
    }
  }

  function onAddSource() {
    const created = addCustomSource({ label: newLabel, url: newUrl, kind: newKind });
    if (!created) {
      toast.error("Indica al menos un nombre o una URL para la fuente.");
      return;
    }
    refreshSources();
    setNewLabel("");
    setNewUrl("");
    setNewKind("code");
    setShowAdd(false);
    toast.success(`Fuente «${created.label}» añadida a la librería.`);
  }

  function openInstall(s: LibrarySource) {
    setInstallFor(s);
    setInstallScope("user");
    if (!installBrainId && brains[0]) setInstallBrainId(brains[0].id);
  }

  function confirmInstall() {
    if (!installFor) return;
    if (!installBrainId) {
      toast.error("Elige un cerebro destino.");
      return;
    }
    const brain = brains.find((b) => b.id === installBrainId);
    try {
      installSourceInBrain(installBrainId, installFor, installScope);
      refreshInstalled(brains);
      toast.success(
        `«${installFor.label}» instalada en ${brain?.name ?? "el cerebro"} con permisos de ${
          installScope === "community" ? "comunidad" : "usuario"
        }.`,
      );
      setInstallFor(null);
    } catch {
      toast.error("No se pudo instalar la fuente en el cerebro.");
    }
  }

  async function onCopyLink(s: LibrarySource) {
    const link = buildInstallLink({ sourceId: s.id, kind: s.kind, scope: "user" });
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        toast.success("Enlace de instalación copiado al portapapeles.");
      } else {
        toast.message("Enlace de instalación", { description: link });
      }
    } catch {
      toast.message("Enlace de instalación", { description: link });
    }
  }

  function onCheckUpdates() {
    if (!updateBrainId) {
      toast.error("Elige un cerebro para comprobar novedades.");
      return;
    }
    setChecking(true);
    try {
      // `checkForUpdates` es local y síncrona; re-lee catálogo + fuentes y
      // diffea contra el snapshot del cerebro. Nunca lanza.
      const res = checkForUpdates(updateBrainId);
      setNovelties(res.novelties);
      setFirstRun(res.firstRun);
      if (res.firstRun) {
        toast.message("Estado base registrado", {
          description: "Vuelve a comprobar más tarde para ver novedades.",
        });
      } else if (res.novelties.length === 0) {
        toast.success("Sin novedades: todo al día.");
      } else {
        toast.success(`${res.novelties.length} novedad(es) detectada(s).`);
      }
    } catch {
      toast.error("No se pudieron comprobar las novedades.");
      setNovelties([]);
    } finally {
      setChecking(false);
    }
  }

  // Instala una novedad concreta (fuente de librería) en el cerebro elegido.
  function onInstallNovelty(n: Novelty) {
    if (!updateBrainId) {
      toast.error("Elige un cerebro destino.");
      return;
    }
    const src = sources.find((s) => s.id === n.refId);
    if (!src) {
      toast.message("Esta novedad no es una fuente instalable directamente.", {
        description: n.title,
      });
      return;
    }
    try {
      installSourceInBrain(updateBrainId, src, "user");
      refreshInstalled(brains);
      toast.success(`«${src.label}» instalada en el cerebro.`);
    } catch {
      toast.error("No se pudo instalar la novedad.");
    }
  }

  const installableNovelties = useMemo(
    () => (novelties ?? []).filter((n) => sources.some((s) => s.id === n.refId)),
    [novelties, sources],
  );

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          <BookMarked className="h-3.5 w-3.5" /> Fuentes de la librería
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Check className="h-3 w-3 text-emerald-400" /> {enabledCount}/{sources.length} activas
          </Badge>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-3 w-3" /> Añadir fuente
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Orígenes desde los que la librería se nutre (código, componentes, diseño, MCP, modelos, apps…). Actívalos,
        instálalos en un cerebro con permisos, o comparte un enlace de instalación.
      </p>

      {/* Formulario añadir fuente */}
      {showAdd && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-3 space-y-2">
          <div className="text-[11px] font-semibold text-cyan-100">Nueva fuente personalizada</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nombre (p. ej. Mi registro)"
              className="h-8 bg-black/30 text-xs"
            />
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://… (URL del origen)"
              className="h-8 bg-black/30 text-xs"
            />
            <Select value={newKind} onValueChange={(v) => setNewKind(v as SourceKind)}>
              <SelectTrigger className="h-8 w-[140px] bg-black/30 text-xs">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {ADD_KIND_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {KIND_META[k].emoji} {KIND_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setShowAdd(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={onAddSource}>
              <Plus className="h-3 w-3" /> Añadir
            </Button>
          </div>
        </div>
      )}

      {/* Actualizar skills / novedades desde los repos originales */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-300" />
            <div>
              <div className="text-sm font-semibold">Actualizar skills</div>
              <p className="text-[11px] text-muted-foreground">
                Re-lee el catálogo y las fuentes, y detecta skills/apps nuevas o actualizadas en sus repos originales.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={updateBrainId} onValueChange={setUpdateBrainId}>
              <SelectTrigger className="h-8 w-[180px] max-w-[50vw] bg-black/30 text-xs">
                <SelectValue placeholder={brainsLoading ? "Cargando…" : "Elige cerebro"} />
              </SelectTrigger>
              <SelectContent>
                {brains.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 gap-1 text-[11px]"
              onClick={onCheckUpdates}
              disabled={checking || !updateBrainId}
            >
              {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Comprobar
            </Button>
          </div>
        </div>

        {!brainsLoading && brains.length === 0 && (
          <p className="text-[11px] text-amber-300/80">
            Aún no tienes cerebros. Crea uno en la sección Cerebros para instalar fuentes y comprobar novedades.
          </p>
        )}

        {novelties !== null && (
          <div className="space-y-2">
            {firstRun ? (
              <p className="text-[11px] text-muted-foreground">
                Primera comprobación: registramos el estado base de este cerebro. Vuelve más tarde para ver novedades.
              </p>
            ) : novelties.length === 0 ? (
              <p className="text-[11px] text-emerald-300/80">Sin novedades: catálogo, fuentes y skills al día.</p>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {novelties.length} novedad(es)
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {novelties.map((n, i) => {
                    const installable = sources.some((s) => s.id === n.refId);
                    return (
                      <div
                        key={`${n.kind}-${n.refId}-${i}`}
                        className="rounded-lg border border-white/5 bg-black/30 p-2.5 flex flex-col gap-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold">{n.title}</span>
                          <Badge variant="outline" className="text-[8px] shrink-0">
                            {n.kind}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{n.detail}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          {n.url ? (
                            <a
                              href={n.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-[10px] flex items-center gap-0.5"
                            >
                              ver <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span />
                          )}
                          {installable && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] gap-1"
                              onClick={() => onInstallNovelty(n)}
                            >
                              <Download className="h-3 w-3" /> Instalar
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {installableNovelties.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/70">
                    Estas novedades son informativas; no hay fuentes instalables directas entre ellas.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Grupos por kind */}
      {grouped.map(({ kind, items }) => {
        const meta = KIND_META[kind] ?? KIND_META.catalog;
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold flex items-center gap-1.5">
                {meta.emoji} {meta.label}
              </span>
              <Badge variant="outline" className="text-[9px]">
                {items.length}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">{meta.hint}</p>

            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((s) => {
                const custom = isCustomSource(s.id);
                const installedIn = brains.filter((b) => installedByBrain[b.id]?.includes(s.id));
                return (
                  <div
                    key={s.id}
                    className="rounded-lg border border-white/5 bg-black/20 p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch checked={s.enabled} onCheckedChange={() => onToggle(s)} />
                        <span className="text-sm font-semibold truncate">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {custom && (
                          <Badge variant="outline" className="text-amber-300 border-amber-300/40 text-[8px]">
                            propia
                          </Badge>
                        )}
                        {s.shareable === false && (
                          <Badge variant="outline" className="text-rose-300 border-rose-300/40 text-[8px]">
                            no compartible
                          </Badge>
                        )}
                      </div>
                    </div>

                    {s.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{s.description}</p>
                    )}

                    {installedIn.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {installedIn.map((b) => (
                          <Badge
                            key={b.id}
                            variant="outline"
                            className="text-[8px] text-cyan-300 border-cyan-300/40 gap-0.5"
                          >
                            <BrainCircuit className="h-2.5 w-2.5" /> {b.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <a
                        href={s.url?.startsWith("http") ? s.url : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-[10px] flex items-center gap-0.5 ${
                          s.url?.startsWith("http")
                            ? "text-primary hover:underline"
                            : "text-muted-foreground/50 pointer-events-none"
                        }`}
                      >
                        origen <ExternalLink className="h-3 w-3" />
                      </a>
                      <div className="flex items-center gap-1.5">
                        {s.shareable !== false && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => onCopyLink(s)}
                            title="Copiar enlace de instalación (con permiso)"
                          >
                            <Link2 className="h-3 w-3" /> Enlace
                          </Button>
                        )}
                        {s.installable !== false && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => openInstall(s)}
                          >
                            <BrainCircuit className="h-3 w-3" /> Instalar en cerebro
                          </Button>
                        )}
                        {custom && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-rose-300/80 hover:text-rose-300"
                            onClick={() => onRemoveCustom(s)}
                            title="Eliminar fuente propia"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Diálogo simple de instalación en cerebro (con permiso/alcance) */}
      {installFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setInstallFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b12] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-cyan-300" />
                <div>
                  <div className="text-sm font-semibold">Instalar en cerebro</div>
                  <p className="text-[11px] text-muted-foreground">
                    {metaFor(installFor.kind).emoji} {installFor.label}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setInstallFor(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {brains.length === 0 ? (
              <p className="text-[12px] text-amber-300/90">
                Aún no tienes cerebros. Crea uno en la sección Cerebros y vuelve a intentarlo.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Cerebro destino</label>
                  <Select value={installBrainId} onValueChange={setInstallBrainId}>
                    <SelectTrigger className="h-9 bg-black/30 text-xs">
                      <SelectValue placeholder="Elige cerebro" />
                    </SelectTrigger>
                    <SelectContent>
                      {brains.map((b) => (
                        <SelectItem key={b.id} value={b.id} className="text-xs">
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Permiso / alcance
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInstallScope("user")}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        installScope === "user"
                          ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      <User className="h-4 w-4 shrink-0" />
                      <span>
                        <span className="block font-semibold">Usuario</span>
                        <span className="block text-[10px] text-muted-foreground">Solo para ti</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstallScope("community")}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        installScope === "community"
                          ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      <Users className="h-4 w-4 shrink-0" />
                      <span>
                        <span className="block font-semibold">Comunidad</span>
                        <span className="block text-[10px] text-muted-foreground">Permiso compartido</span>
                      </span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Instalar «{installFor.label}» con permisos de {installScope === "community" ? "la comunidad" : "el usuario"}.
                </p>

                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => setInstallFor(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-8 gap-1 text-[11px]" onClick={confirmInstall} disabled={!installBrainId}>
                    <Check className="h-3 w-3" /> Instalar ({scopeBadge(installScope)})
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LibrarySourcesPanel;
