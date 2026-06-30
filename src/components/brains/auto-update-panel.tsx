"use client";

/**
 * AutoUpdatePanel — UI configurable de la skill por defecto
 * "Auto-actualización + Recomendaciones" de un cerebro.
 *
 * Es un componente independiente (export por defecto) que el panel de ajustes
 * de un cerebro monta pasándole `brainId`. Sigue el estilo de las secciones por
 * cerebro de brains-panel.tsx (BrainMoaSection / BrainChannelsSection /
 * BrainMemoriesSection): tarjeta `rounded-lg border border-cyan-500/20
 * bg-cyan-950/10 p-3`, cabecera en mayúsculas, Switches y Checkboxes shadcn.
 *
 * Toda la lógica vive en `@/lib/brain-skills/auto-update-agent` y es defensiva
 * (guardas typeof window, try/catch, sin dependencias duras de red).
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Satellite,
  RefreshCw,
  Sparkles,
  Plus,
  Trash2,
  Rss,
  Github,
  Globe,
  Library,
  UserCircle,
  Youtube,
  Radio,
  Link2,
  CalendarClock,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  AUTO_UPDATE_SKILL_META,
  loadAutoUpdateConfig,
  saveAutoUpdateConfig,
  checkForUpdates,
  getRecommendations,
  makeContentSource,
  type AutoUpdateConfig,
  type AutoUpdateCadence,
  type ContentSource,
  type Novelty,
  type Recommendation,
} from "@/lib/brain-skills/auto-update-agent";

const CADENCES: { id: AutoUpdateCadence; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "diaria", label: "Diaria" },
  { id: "semanal", label: "Semanal" },
];

const TARGETS: { key: keyof AutoUpdateConfig["targets"]; label: string }[] = [
  { key: "skills", label: "Skills" },
  { key: "ossLibrary", label: "Librería OSS" },
  { key: "librarySources", label: "Fuentes de librería" },
  { key: "contentSources", label: "Fuentes de contenido" },
];

const SOURCE_KINDS: { id: string; label: string; icon: typeof Rss }[] = [
  { id: "rss", label: "RSS / Feed", icon: Rss },
  { id: "github", label: "Repo GitHub", icon: Github },
  { id: "web", label: "Página web", icon: Globe },
  { id: "library-source", label: "Fuente de librería", icon: Library },
  { id: "account", label: "Cuenta conectada", icon: UserCircle },
  { id: "youtube", label: "YouTube / Canal", icon: Youtube },
  { id: "channel", label: "Canal", icon: Radio },
  { id: "otro", label: "Otro", icon: Link2 },
];

function kindIcon(kind: string): typeof Rss {
  return SOURCE_KINDS.find((k) => k.id === kind)?.icon ?? Link2;
}

function noveltyTone(kind: Novelty["kind"]): string {
  switch (kind) {
    case "oss-new":
      return "border-emerald-400/40 text-emerald-300";
    case "oss-updated":
      return "border-cyan-400/40 text-cyan-300";
    case "library-source":
      return "border-fuchsia-400/40 text-fuchsia-300";
    case "skill":
      return "border-amber-400/40 text-amber-300";
    case "content-source":
      return "border-indigo-400/40 text-indigo-300";
    default:
      return "border-white/15 text-white/50";
  }
}

export default function AutoUpdatePanel({ brainId, isNew }: { brainId: string; isNew?: boolean }) {
  const [cfg, setCfg] = useState<AutoUpdateConfig | null>(null);

  // Resultados de "Buscar novedades".
  const [checking, setChecking] = useState(false);
  const [novelties, setNovelties] = useState<Novelty[] | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  // Recomendaciones.
  const [reccing, setReccing] = useState(false);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [recSummary, setRecSummary] = useState("");
  const [recViaAurora, setRecViaAurora] = useState(false);

  // Editor de nueva fuente de contenido.
  const [newKind, setNewKind] = useState<string>("rss");
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  useEffect(() => {
    setCfg(loadAutoUpdateConfig(brainId));
    setNovelties(null);
    setRecs(null);
    setRecSummary("");
  }, [brainId]);

  if (!cfg) return null;

  function update(patch: Partial<AutoUpdateConfig>) {
    setCfg((c) => {
      if (!c) return c;
      const next = { ...c, ...patch };
      saveAutoUpdateConfig(brainId, next);
      return next;
    });
  }

  function updateTarget(key: keyof AutoUpdateConfig["targets"], on: boolean) {
    setCfg((c) => {
      if (!c) return c;
      const next = { ...c, targets: { ...c.targets, [key]: on } };
      saveAutoUpdateConfig(brainId, next);
      return next;
    });
  }

  function addSource() {
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (!label && !url) {
      toast.error("Pon al menos una etiqueta o una URL para la fuente.");
      return;
    }
    const src = makeContentSource({ kind: newKind, label: label || url, url });
    setCfg((c) => {
      if (!c) return c;
      const next = { ...c, sources: [...c.sources, src] };
      saveAutoUpdateConfig(brainId, next);
      return next;
    });
    setNewLabel("");
    setNewUrl("");
    toast.success("Fuente de contenido añadida.");
  }

  function updateSource(id: string, patch: Partial<ContentSource>) {
    setCfg((c) => {
      if (!c) return c;
      const next = {
        ...c,
        sources: c.sources.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)),
      };
      saveAutoUpdateConfig(brainId, next);
      return next;
    });
  }

  function removeSource(id: string) {
    setCfg((c) => {
      if (!c) return c;
      const next = { ...c, sources: c.sources.filter((s) => s.id !== id) };
      saveAutoUpdateConfig(brainId, next);
      return next;
    });
  }

  function runCheck() {
    setChecking(true);
    try {
      const r = checkForUpdates(brainId);
      setNovelties(r.novelties);
      setFirstRun(r.firstRun);
      if (r.firstRun) {
        toast.message("Estado base registrado. Te avisaré de novedades a partir de ahora.");
      } else if (r.novelties.length === 0) {
        toast.message("Sin novedades desde la última comprobación.");
      } else {
        toast.success(`${r.novelties.length} novedad(es) detectada(s).`);
      }
    } catch {
      toast.error("No se pudieron buscar novedades.");
    } finally {
      setChecking(false);
    }
  }

  async function runRecommendations() {
    setReccing(true);
    setRecs(null);
    setRecSummary("");
    try {
      const r = await getRecommendations(brainId, { limit: 8 });
      setRecs(r.recommendations);
      setRecSummary(r.summary);
      setRecViaAurora(r.viaAurora);
      if (r.recommendations.length === 0) {
        toast.message("Aún no hay nada que recomendar. Añade fuentes de contenido.");
      }
    } catch {
      toast.error("No se pudieron generar recomendaciones.");
    } finally {
      setReccing(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
        <Satellite className="h-3.5 w-3.5" /> {AUTO_UPDATE_SKILL_META.emoji} Auto-actualización + Recomendaciones
        <Badge variant="outline" className="border-white/15 text-[9px] normal-case text-white/45">
          skill por defecto
        </Badge>
      </div>
      <p className="text-[10px] text-white/40">{AUTO_UPDATE_SKILL_META.blurb}</p>

      {/* Activar / desactivar */}
      <label className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-cyan-50">
            {cfg.enabled ? "Skill activada en este cerebro" : "Skill desactivada"}
          </span>
          <span className="text-[10px] text-white/40">
            Activada por defecto. Puedes desactivarla o quitarla sin afectar al resto del cerebro.
          </span>
        </div>
        <Switch checked={cfg.enabled} onCheckedChange={(v) => update({ enabled: v })} />
      </label>

      {isNew && (
        <p className="text-[10px] text-amber-300/70">
          Guarda el cerebro para conservar la configuración de esta skill.
        </p>
      )}

      {/* Cuerpo: sólo cuando está activada */}
      {cfg.enabled && (
        <div className="space-y-3">
          {/* Cadencia */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-white/55">
              <CalendarClock className="h-3.5 w-3.5 text-cyan-300" /> Cadencia
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CADENCES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => update({ cadence: c.id })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    cfg.cadence === c.id
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-white/50 hover:text-white/80",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-white/35">
              «Manual» sólo busca cuando pulsas el botón. Diaria/semanal es la frecuencia preferida (la programación real
              de fondo se conecta más adelante).
            </p>
          </div>

          {/* Objetivos a vigilar */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-white/55">
              <RefreshCw className="h-3.5 w-3.5 text-cyan-300" /> Qué vigilar
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {TARGETS.map((t) => {
                const checked = cfg.targets[t.key];
                return (
                  <label
                    key={t.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5"
                  >
                    <Checkbox checked={checked} onCheckedChange={(v) => updateTarget(t.key, v === true)} />
                    <span className="text-[11px] text-white/85">{t.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Fuentes de contenido del usuario */}
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-white/65">
              <Library className="h-3.5 w-3.5 text-indigo-300" /> Tus fuentes de contenido
              <Badge variant="outline" className="ml-auto border-white/15 text-[9px] text-white/45">
                {cfg.sources.length}
              </Badge>
            </div>

            {cfg.sources.length === 0 ? (
              <p className="text-[10px] text-white/35">
                Sin fuentes propias. Añade RSS/feeds, repos de GitHub, páginas web, ids de fuente de librería, cuentas
                conectadas, canales/YouTube… de cualquier tipo.
              </p>
            ) : (
              <div className="space-y-1.5">
                {cfg.sources.map((s) => {
                  const Icon = kindIcon(String(s.kind));
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                      <select
                        value={String(s.kind)}
                        onChange={(e) => updateSource(s.id, { kind: e.target.value })}
                        className="h-7 rounded-md border border-white/15 bg-black/40 px-1.5 text-[10px] text-white"
                      >
                        {SOURCE_KINDS.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={s.label}
                        onChange={(e) => updateSource(s.id, { label: e.target.value })}
                        placeholder="Etiqueta"
                        className="h-7 flex-1 border-white/15 bg-black/40 text-[11px] text-white placeholder:text-white/30"
                      />
                      <Input
                        value={s.url}
                        onChange={(e) => updateSource(s.id, { url: e.target.value })}
                        placeholder="URL / id / handle"
                        className="h-7 flex-1 border-white/15 bg-black/40 text-[11px] text-white placeholder:text-white/30"
                      />
                      {s.url && s.url.startsWith("http") && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-white/30 hover:text-cyan-300"
                          title="Abrir"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => removeSource(s.id)}
                        className="text-white/30 hover:text-red-400"
                        title="Quitar fuente"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Añadir fuente */}
            <div className="flex flex-wrap items-end gap-1.5 rounded-md border border-cyan-500/20 bg-black/30 p-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] text-white/40">Tipo</span>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value)}
                  className="h-7 rounded-md border border-white/15 bg-black/40 px-1.5 text-[11px] text-white"
                >
                  {SOURCE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-0.5">
                <span className="text-[9px] text-white/40">Etiqueta</span>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="p.ej. Blog de IA"
                  className="h-7 border-white/15 bg-black/40 text-[11px] text-white placeholder:text-white/30"
                />
              </label>
              <label className="flex flex-1 flex-col gap-0.5">
                <span className="text-[9px] text-white/40">URL / id</span>
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://… / owner/repo / id"
                  className="h-7 border-white/15 bg-black/40 text-[11px] text-white placeholder:text-white/30"
                />
              </label>
              <Button size="sm" className="h-7 gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500" onClick={addSource}>
                <Plus className="h-3.5 w-3.5" /> Añadir
              </Button>
            </div>
          </div>

          {/* Acciones: buscar novedades + recomendaciones */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500"
              disabled={checking}
              onClick={runCheck}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} /> Buscar novedades
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
              disabled={reccing}
              onClick={runRecommendations}
            >
              <Sparkles className={cn("h-3.5 w-3.5", reccing && "animate-pulse")} /> Recomendaciones
            </Button>
          </div>

          {/* Resultados: novedades */}
          {novelties !== null && (
            <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-white/65">
                <RefreshCw className="h-3.5 w-3.5 text-cyan-300" /> Novedades
                <Badge variant="outline" className="ml-auto border-white/15 text-[9px] text-white/45">
                  {novelties.length}
                </Badge>
              </div>
              {firstRun ? (
                <p className="text-[10px] text-white/40">
                  Primer escaneo: registré el estado actual como base. A partir de ahora verás aquí lo nuevo y lo
                  actualizado.
                </p>
              ) : novelties.length === 0 ? (
                <p className="text-[10px] text-white/40">Sin novedades desde la última comprobación.</p>
              ) : (
                <div className="space-y-1">
                  {novelties.map((n, i) => (
                    <div
                      key={`${n.kind}:${n.refId}:${i}`}
                      className="flex items-start gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                    >
                      <Badge variant="outline" className={cn("mt-0.5 shrink-0 text-[8px]", noveltyTone(n.kind))}>
                        {n.kind}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[11px] font-medium text-white/85">{n.title}</span>
                          {n.url && (
                            <a
                              href={n.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-white/30 hover:text-cyan-300"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-white/40">{n.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resultados: recomendaciones */}
          {recs !== null && (
            <div className="space-y-1.5 rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/10 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-fuchsia-100">
                <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" /> Recomendaciones
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-auto text-[9px]",
                    recViaAurora ? "border-fuchsia-400/40 text-fuchsia-200" : "border-white/15 text-white/45",
                  )}
                >
                  {recViaAurora ? "Aurora" : "local"}
                </Badge>
              </div>
              {recSummary && <p className="text-[10px] text-fuchsia-200/70">{recSummary}</p>}
              {recs.length === 0 ? (
                <p className="text-[10px] text-white/40">
                  Nada que recomendar todavía. Añade fuentes de contenido o explora la librería OSS.
                </p>
              ) : (
                <div className="space-y-1">
                  {recs.map((r, i) => (
                    <div
                      key={`${r.origin}:${r.refId}:${i}`}
                      className="flex items-start gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                    >
                      <span className="mt-0.5 shrink-0 text-[10px] font-mono text-fuchsia-300/70">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[11px] font-medium text-white/85">{r.title}</span>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-white/15 text-[8px] text-white/40"
                          >
                            {r.origin === "oss" ? "OSS" : "fuente"}
                          </Badge>
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-white/30 hover:text-fuchsia-300"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-white/45">{r.reason}</p>
                      </div>
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
