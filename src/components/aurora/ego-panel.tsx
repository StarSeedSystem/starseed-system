"use client";

/**
 * AuroraEgoPanel — el manager del sistema ego.md de Aurora.
 *
 * Equivalente Aurora del MemoriaPanel del Cerebro: administra los ficheros .md
 * que definen un EGO de Aurora (identidad portable y compartible) y sus
 * FUENTES/SERVIDORES por fichero. Editor markdown + lista de ficheros, todo
 * respaldado por Supabase (`aurora_egos` / `aurora_ego_files`) con realtime y
 * autosave.
 *
 * Acciones de ego: Compartir · Replicar · Exportar (.md/JSON) · Instalar/
 * Importar · Conectar (cerebro) · Integrar (memoria/biblioteca) · Adjuntar a un
 * contexto (grupo/página/comunidad/evento/perfil/app/widget/pizarra/publicación).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  EGO_SOURCES,
  EGO_CONTEXT_KINDS,
  egoSourceById,
  iconForEgoFile,
  ensureEgoSeedFiles,
  listEgoFiles,
  listEgos,
  saveEgo,
  saveEgoFile,
  updateEgoContent,
  setEgoSource,
  deleteEgoFile,
  setEgoFileShareable,
  setEgoShareable,
  createEgoForContext,
  attachEgoToContext,
  attachmentsOf,
  egoToMarkdownBundle,
  egoToJSON,
  egoFromJSON,
  egoFromMarkdownBundle,
  installEgo,
  replicateEgo,
  saveEgoAsMemory,
  type AuroraEgo,
  type EgoFile,
  type EgoSource,
  type EgoContextKind,
} from "@/lib/aurora/ego";
import { saveResource } from "@/lib/library-store";
import { listBrains, type Brain } from "@/lib/brains/brains";
import { attachEgoToBrain } from "@/lib/aurora/ego";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import {
  Plus,
  Save,
  Trash2,
  Loader2,
  Server,
  RefreshCw,
  HardDriveDownload,
  FileText,
  Sparkles,
  Share2,
  Copy,
  Download,
  Upload,
  Link2,
  Library,
  Paperclip,
  BrainCircuit,
  X,
} from "lucide-react";

export default function AuroraEgoPanel() {
  // ── Egos del usuario (selector) ──
  const { rows: egos, loading: egosLoading, reload: reloadEgos } = useRealtimeRows<AuroraEgo>(
    "aurora_egos",
    () => listEgos(),
    { idKey: "id" },
  );

  const [activeEgoId, setActiveEgoId] = useState<string | null>(null);
  const [creatingEgo, setCreatingEgo] = useState(false);

  // Selecciona el primer ego al cargar.
  useEffect(() => {
    if (!activeEgoId && egos.length) setActiveEgoId(egos[0].id);
  }, [egos, activeEgoId]);

  const activeEgo = egos.find((e) => e.id === activeEgoId) ?? null;

  const onCreateEgo = async () => {
    setCreatingEgo(true);
    const ego = await createEgoForContext({
      name: "Mi Ego de Aurora",
      summary: "Identidad portable de Aurora: personalidad, voz, sentidos, emociones, carácter y más.",
    });
    setCreatingEgo(false);
    if (ego) {
      await reloadEgos();
      setActiveEgoId(ego.id);
      toast.success("Ego de Aurora creado. Empieza por ego.md.");
    } else {
      toast.error("No se pudo crear el ego. ¿Has iniciado sesión?");
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-950/30 to-cyan-950/20 p-4 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">ego.md — la identidad portable de Aurora.</div>
          <div className="text-[11px] text-white/50">
            Un Ego reúne personalidad, voz, sentidos, emociones, carácter, modelos, habilidades, plugins y conexiones.
            Compártelo, replícalo, expórtalo, instálalo, conéctalo e intégralo en cualquier contexto.
          </div>
        </div>
      </div>

      {/* ── Selector de ego ────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Tus Egos</span>
          <Badge variant="outline" className="border-white/15 text-white/50 text-[10px]">
            {egos.length}
          </Badge>
        </div>

        {egosLoading ? (
          <div className="flex items-center gap-2 text-sm text-white/50 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando egos…
          </div>
        ) : egos.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/15 p-6 text-center">
            <Sparkles className="w-8 h-8 text-white/25 mx-auto mb-2" />
            <p className="text-sm text-white/55">
              Aún no tienes ningún Ego de Aurora. Crea el primero para empezar.
            </p>
            <Button className="mt-3 gap-1.5" disabled={creatingEgo} onClick={onCreateEgo}>
              {creatingEgo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear mi primer Ego
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {egos.map((e) => (
              <button
                key={e.id}
                onClick={() => setActiveEgoId(e.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  e.id === activeEgoId
                    ? "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-100"
                    : "border-white/10 text-white/70 hover:bg-white/5",
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {e.name}
                {e.shareable && <Share2 className="w-3 h-3 text-emerald-300" />}
              </button>
            ))}
            <Button size="sm" variant="outline" className="gap-1.5" disabled={creatingEgo} onClick={onCreateEgo}>
              {creatingEgo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Nuevo Ego
            </Button>
          </div>
        )}
      </div>

      {/* ── Ego activo: ficheros + acciones ────────────────── */}
      {activeEgo && (
        <>
          <EgoActions ego={activeEgo} onChanged={reloadEgos} />
          <EgoFilesEditor egoId={activeEgo.id} />
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* Editor de ficheros del ego (mirror del MemoriaPanel)                */
/* ================================================================== */

function EgoFilesEditor({ egoId }: { egoId: string }) {
  const filter = useMemo(() => `ego_id=eq.${egoId}`, [egoId]);

  const { rows, loading, reload } = useRealtimeRows<EgoFile>(
    "aurora_ego_files",
    async () => {
      await ensureEgoSeedFiles(egoId);
      return listEgoFiles(egoId);
    },
    { filter, idKey: "id" },
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = rows.find((f) => f.id === activeId) ?? null;

  // Al cambiar de ego, reinicia la selección.
  useEffect(() => {
    setActiveId(null);
    setDraft("");
    setDirty(false);
  }, [egoId]);

  useEffect(() => {
    if (!activeId && rows.length) {
      setActiveId(rows[0].id);
      setDraft(rows[0].content);
      setDirty(false);
    }
  }, [rows, activeId]);

  useEffect(() => {
    if (active && !dirty) setDraft(active.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const onEdit = (value: string) => {
    setDraft(value);
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(value, true), 1200);
  };

  const persist = async (value: string, silent = false) => {
    if (!active) return;
    setSaving(true);
    const ok = await updateEgoContent(active.id, value);
    setSaving(false);
    if (ok) {
      setDirty(false);
      if (!silent) toast.success(`${active.name} guardado.`);
    } else if (!silent) {
      toast.error("No se pudo guardar.");
    }
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const file = await saveEgoFile({
      ego_id: egoId,
      name: name.endsWith(".md") ? name : `${name}.md`,
      content: `# ${name.replace(/\.md$/i, "")}\n\n`,
      kind: "custom",
      source: "starseed",
    });
    setCreating(false);
    setNewName("");
    if (file) {
      await reload();
      setActiveId(file.id);
      setDraft(file.content);
      setDirty(false);
      toast.success(`Creado ${file.name}.`);
    } else {
      toast.error("No se pudo crear el fichero.");
    }
  };

  const onDelete = async (f: EgoFile) => {
    if (!confirm(`¿Eliminar ${f.name}? Esta acción no se puede deshacer.`)) return;
    const ok = await deleteEgoFile(f.id);
    if (ok) {
      if (activeId === f.id) setActiveId(null);
      await reload();
      toast.success(`${f.name} eliminado.`);
    } else {
      toast.error("No se pudo eliminar.");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
      {/* Lista de ficheros */}
      <aside className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-fuchsia-300" />
            <span className="text-sm font-semibold text-fuchsia-50">Ficheros del ego</span>
            <Badge variant="outline" className="ml-auto border-white/15 text-white/50 text-[10px]">
              {rows.length}
            </Badge>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-white/50 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-white/45 py-3">
              Aún no hay ficheros. Se sembrarán los canónicos (ego.md, personalidad.md…) al abrir.
            </p>
          ) : (
            <ul className="space-y-1">
              {rows.map((f) => {
                const Icon = iconForEgoFile(f.name);
                const src = egoSourceById(f.source);
                const isActive = f.id === activeId;
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => {
                        setActiveId(f.id);
                        setDraft(f.content);
                        setDirty(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        isActive
                          ? "bg-fuchsia-500/15 border border-fuchsia-500/30"
                          : "hover:bg-white/5 border border-transparent",
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-fuchsia-300" : "text-white/45")} />
                      <span className="truncate text-sm text-white/80">{f.name}</span>
                      {f.shareable && <Share2 className="w-3 h-3 text-emerald-300/70 shrink-0" />}
                      <span className="ml-auto text-[11px]" title={src?.label}>
                        {src?.icon ?? "✨"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
            placeholder="nuevo-fichero.md"
            className="h-8 text-sm bg-black/30"
          />
          <Button size="sm" className="w-full gap-1.5" disabled={creating || !newName.trim()} onClick={onCreate}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear fichero
          </Button>
        </div>
      </aside>

      {/* Editor + fuente */}
      <section className="space-y-3 min-w-0">
        {!active ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
            <FileText className="w-8 h-8 text-white/25 mx-auto mb-2" />
            <p className="text-sm text-white/50">
              Selecciona un fichero del ego para empezar a editar.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-fuchsia-50">{active.name}</span>
              {dirty ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                  sin guardar
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                  guardado
                </Badge>
              )}
              <label className="ml-auto flex items-center gap-1.5 text-[11px] text-white/60">
                <Switch
                  checked={active.shareable}
                  onCheckedChange={async (v) => {
                    const ok = await setEgoFileShareable(active.id, v);
                    if (ok) {
                      await reload();
                      toast.success(v ? "Fichero marcado como compartible." : "Fichero privado.");
                    }
                  }}
                />
                <Share2 className="w-3.5 h-3.5" /> compartible
              </label>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={saving || !dirty}
                onClick={() => persist(draft)}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs text-red-300 hover:text-red-200"
                onClick={() => onDelete(active)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </Button>
            </div>

            <Textarea
              value={draft}
              onChange={(e) => onEdit(e.target.value)}
              spellCheck={false}
              className="min-h-[340px] font-mono text-sm leading-relaxed bg-black/30 border-white/10"
              placeholder="# Escribe tu markdown aquí…"
            />

            <EgoSourceEditor file={active} onChanged={reload} />
          </>
        )}
      </section>
    </div>
  );
}

/* ================================================================== */
/* Acciones del ego: compartir/replicar/exportar/instalar/conectar…    */
/* ================================================================== */

function EgoActions({ ego, onChanged }: { ego: AuroraEgo; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  const attachments = attachmentsOf(ego.attached_to);

  async function withFiles<T>(fn: (files: EgoFile[]) => Promise<T> | T): Promise<T> {
    const files = await listEgoFiles(ego.id);
    return fn(files);
  }

  // ── Compartir (toggle shareable + dejar en biblioteca) ──
  async function onShare() {
    setBusy(true);
    const ok = await setEgoShareable(ego.id, !ego.shareable);
    if (ok && !ego.shareable) {
      // al compartir, lo dejamos también disponible en la Biblioteca soberana.
      try {
        saveResource({
          id: `ego:${ego.id}`,
          kind: "ego",
          title: ego.name,
          origin: "Aurora · ego.md",
        });
      } catch {
        /* noop */
      }
    }
    setBusy(false);
    if (ok) {
      onChanged();
      toast.success(ego.shareable ? "Ego dejado de compartir." : "Ego compartido y publicado en la Biblioteca.");
    } else toast.error("No se pudo cambiar el estado de compartir.");
  }

  // ── Replicar ──
  async function onReplicate() {
    setBusy(true);
    const copy = await withFiles((files) => replicateEgo(ego, files));
    setBusy(false);
    if (copy) {
      onChanged();
      toast.success(`Ego replicado: "${copy.name}".`);
    } else toast.error("No se pudo replicar.");
  }

  // ── Exportar .md ──
  async function onExportMD() {
    try {
      const files = await listEgoFiles(ego.id);
      const blob = new Blob([egoToMarkdownBundle(ego, files)], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ego-${slug(ego.name)}.md`;
      a.click();
    } catch {
      toast.error("No se pudo exportar Markdown.");
    }
  }

  // ── Exportar JSON ──
  async function onExportJSON() {
    try {
      const files = await listEgoFiles(ego.id);
      const blob = new Blob([egoToJSON(ego, files)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ego-${slug(ego.name)}.json`;
      a.click();
    } catch {
      toast.error("No se pudo exportar JSON.");
    }
  }

  // ── Instalar / importar ──
  function onImport(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = file.name.toLowerCase().endsWith(".json")
          ? egoFromJSON(text)
          : egoFromMarkdownBundle(text);
        const installed = await installEgo(parsed);
        if (installed) {
          onChanged();
          toast.success(`Ego instalado: "${installed.name}".`);
        } else toast.error("No se pudo instalar el ego.");
      } catch {
        toast.error("Archivo no válido (.json o .md).");
      }
    };
    reader.onerror = () => toast.error("No se pudo leer el archivo.");
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Integrar (guardar como memoria .md → cerebro/biblioteca) ──
  async function onIntegrateMemory() {
    setBusy(true);
    const ok = await withFiles((files) => saveEgoAsMemory(ego, files));
    setBusy(false);
    if (ok) toast.success(`Integrado como memoria .md: "Ego de Aurora · ${ego.name}".`);
    else toast.error("No se pudo integrar en memoria.");
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-fuchsia-300" />
        <span className="text-sm font-semibold text-fuchsia-50">{ego.name}</span>
        {ego.shareable && (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px] gap-1">
            <Share2 className="w-3 h-3" /> compartido
          </Badge>
        )}
        {attachments.length > 0 && (
          <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px] gap-1">
            <Paperclip className="w-3 h-3" /> {attachments.length} contexto{attachments.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {ego.summary && <p className="text-xs text-white/50">{ego.summary}</p>}

      {/* Adjuntos actuales */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a, i) => {
            const def = EGO_CONTEXT_KINDS.find((k) => k.id === a.kind);
            return (
              <span
                key={`${a.kind}-${a.ref}-${i}`}
                className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-100"
              >
                <span>{def?.icon ?? "🔗"}</span>
                {a.label || def?.label || a.kind}
              </span>
            );
          })}
        </div>
      )}

      {/* Botonera de acciones */}
      <div className="flex flex-wrap gap-2">
        <ActBtn icon={Share2} label={ego.shareable ? "Dejar de compartir" : "Compartir"} onClick={onShare} busy={busy} accent="emerald" />
        <ActBtn icon={Copy} label="Replicar" onClick={onReplicate} busy={busy} accent="fuchsia" />
        <ActBtn icon={Download} label="Exportar .md" onClick={onExportMD} accent="cyan" />
        <ActBtn icon={Download} label="Exportar JSON" onClick={onExportJSON} accent="cyan" />
        <ActBtn icon={Upload} label="Instalar / importar" onClick={() => fileRef.current?.click()} accent="amber" />
        <input
          ref={fileRef}
          type="file"
          accept=".json,.md,.markdown,application/json,text/markdown"
          className="hidden"
          onChange={(e) => onImport(e.target.files?.[0] ?? null)}
        />
        <ActBtn icon={BrainCircuit} label="Conectar a cerebro" onClick={() => setShowConnect((v) => !v)} accent="violet" />
        <ActBtn icon={Library} label="Integrar (memoria)" onClick={onIntegrateMemory} busy={busy} accent="fuchsia" />
        <ActBtn icon={Paperclip} label="Adjuntar a contexto" onClick={() => setShowAttach((v) => !v)} accent="cyan" />
      </div>

      {showConnect && <ConnectToBrain ego={ego} onDone={() => { setShowConnect(false); onChanged(); }} />}
      {showAttach && <AttachToContext ego={ego} onDone={() => { setShowAttach(false); onChanged(); }} />}
    </div>
  );
}

function ActBtn({
  icon: Icon,
  label,
  onClick,
  busy,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  busy?: boolean;
  accent: "fuchsia" | "cyan" | "emerald" | "amber" | "violet";
}) {
  const accentCls: Record<string, string> = {
    fuchsia: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/20",
    cyan: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20",
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
    violet: "border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-50", accentCls[accent])}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

/* ── Conectar a un cerebro (brain.includes.personalities) ── */
function ConnectToBrain({ ego, onDone }: { ego: AuroraEgo; onDone: () => void }) {
  const [brains, setBrains] = useState<Brain[]>([]);
  const [sel, setSel] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => setBrains(await listBrains()))();
  }, []);

  async function onConnect() {
    if (!sel) return;
    setBusy(true);
    const brain = brains.find((b) => b.id === sel);
    const ok = await attachEgoToBrain(ego.id, sel, brain?.name);
    setBusy(false);
    if (ok) {
      toast.success(`Ego conectado al cerebro "${brain?.name ?? ""}".`);
      onDone();
    } else toast.error("No se pudo conectar al cerebro.");
  }

  return (
    <div className="rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-violet-300/70">
        <Link2 className="w-3 h-3" /> Conectar a un cerebro
      </div>
      {brains.length === 0 ? (
        <p className="text-xs text-white/45">
          No tienes cerebros todavía. Crea uno en el Cerebro para poder conectar este ego.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          >
            <option value="" className="bg-zinc-900">— Elige cerebro —</option>
            {brains.map((b) => (
              <option key={b.id} value={b.id} className="bg-zinc-900">{b.name}</option>
            ))}
          </select>
          <Button size="sm" className="gap-1.5" disabled={!sel || busy} onClick={onConnect}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
            Conectar
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Adjuntar a un contexto (escribe attached_to) ── */
function AttachToContext({ ego, onDone }: { ego: AuroraEgo; onDone: () => void }) {
  const [kind, setKind] = useState<EgoContextKind>("grupo");
  const [ref, setRef] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function onAttach() {
    setBusy(true);
    const ok = await attachEgoToContext(ego.id, {
      kind,
      ref: ref.trim() || undefined,
      label: label.trim() || undefined,
    });
    setBusy(false);
    if (ok) {
      const def = EGO_CONTEXT_KINDS.find((k) => k.id === kind);
      toast.success(`Ego adjuntado a ${def?.label ?? kind}.`);
      setRef("");
      setLabel("");
      onDone();
    } else toast.error("No se pudo adjuntar.");
  }

  return (
    <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-cyan-300/70">
        <Paperclip className="w-3 h-3" /> Adjuntar a un contexto
      </div>
      <p className="text-[11px] text-white/45">
        Integra este ego como agente en un grupo, página, comunidad, evento, perfil, app, widget, pizarra,
        publicación o mensaje. Indica su id/slug y una etiqueta.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EgoContextKind)}
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
        >
          {EGO_CONTEXT_KINDS.map((k) => (
            <option key={k.id} value={k.id} className="bg-zinc-900">{k.icon} {k.label}</option>
          ))}
        </select>
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="id / slug (opcional)"
          className="h-8 text-xs bg-black/30"
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="etiqueta (opcional)"
          className="h-8 text-xs bg-black/30"
        />
      </div>
      <Button size="sm" className="gap-1.5" disabled={busy} onClick={onAttach}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        Adjuntar
      </Button>
    </div>
  );
}

/* ================================================================== */
/* Editor de fuente/servidor por fichero (mirror del MemoriaPanel)     */
/* ================================================================== */

function EgoSourceEditor({ file, onChanged }: { file: EgoFile; onChanged: () => void }) {
  const [source, setSourceState] = useState<EgoSource>((file.source as EgoSource) || "starseed");
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(file.server_config || {})) c[k] = String(v ?? "");
    return c;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSourceState((file.source as EgoSource) || "starseed");
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(file.server_config || {})) c[k] = String(v ?? "");
    setConfig(c);
  }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = egoSourceById(source);

  const onSave = async () => {
    setSaving(true);
    const ok = await setEgoSource(file.id, source, config);
    setSaving(false);
    if (ok) {
      toast.success(`Fuente de ${file.name} actualizada: ${def?.label}.`);
      onChanged();
    } else {
      toast.error("No se pudo actualizar la fuente.");
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4 text-violet-300" />
        <span className="text-sm font-semibold text-fuchsia-50">Fuente / servidor</span>
      </div>

      <p className="text-xs text-white/50">
        Elige dónde se almacena/sincroniza <span className="text-white/70">{file.name}</span>. Por defecto vive en
        StarSeed; puedes moverlo a Google Drive, a un servidor personal o a tu equipo local.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {EGO_SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSourceState(s.id)}
            className={cn(
              "flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors",
              source === s.id ? "border-violet-500/50 bg-violet-500/10" : "border-white/10 hover:bg-white/5",
            )}
          >
            <span className="text-base leading-none mt-0.5">{s.icon}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-sm text-white/85">{s.label}</span>
                {s.oss && (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300/80 text-[9px] py-0">
                    open-source
                  </Badge>
                )}
              </span>
              <span className="block text-[11px] text-white/45 mt-0.5">{s.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      {def && def.fields.length > 0 && (
        <div className="space-y-2 pt-1">
          {def.fields.map((f) => (
            <div key={f.key}>
              <label className="text-[11px] text-white/55">{f.label}</label>
              <Input
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="h-8 text-sm bg-black/30 mt-0.5"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-1">
        <Button size="sm" className="gap-1.5" disabled={saving} onClick={onSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar fuente
        </Button>
      </div>
    </div>
  );
}

function slug(s: string) {
  return (
    (s || "ego")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ego"
  );
}
