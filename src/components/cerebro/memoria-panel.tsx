"use client";

/**
 * MemoriaPanel — pilar MEMORIA del Cerebro.
 *
 * Administra los ficheros .md del cerebro y sus FUENTES/SERVIDORES (dónde se
 * guardan/sincronizan: StarSeed, Google Drive, servidor externo/personal o
 * equipo local). Editor markdown tipo Obsidian + lista de ficheros, todo
 * respaldado por Supabase (`brain_memory_files`) con realtime y autosave.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  MEMORY_SOURCES,
  memorySourceById,
  iconForFile,
  ensureSeedFiles,
  listMemoryFiles,
  saveMemoryFile,
  updateMemoryContent,
  setMemorySource,
  deleteMemoryFile,
  type MemoryFile,
  type MemorySource,
} from "@/lib/cerebro/memory-files";
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
} from "lucide-react";

export default function MemoriaPanel({
  brainId,
  focusFileId,
}: {
  brainId: string | null;
  /** Abre este archivo al montar/cambiar (clic en nodo del grafo 2D/3D). */
  focusFileId?: string | null;
}) {
  const confirm = useConfirm();
  const filter = useMemo(
    () => (brainId ? `brain_id=eq.${brainId}` : undefined),
    [brainId],
  );

  // Carga + realtime de los ficheros (siembra base la primera vez).
  const { rows, loading, reload } = useRealtimeRows<MemoryFile>(
    "brain_memory_files",
    async () => {
      await ensureSeedFiles(brainId);
      return listMemoryFiles(brainId);
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

  // Selecciona el primero al cargar.
  useEffect(() => {
    if (!activeId && rows.length) {
      setActiveId(rows[0].id);
      setDraft(rows[0].content);
      setDirty(false);
    }
  }, [rows, activeId]);

  // Abre un archivo concreto cuando lo pide el grafo (clic en nodo 2D/3D).
  useEffect(() => {
    if (!focusFileId) return;
    const f = rows.find((r) => r.id === focusFileId);
    if (f && f.id !== activeId) {
      setActiveId(f.id);
      setDraft(f.content);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFileId, rows]);

  // Al cambiar de fichero, refresca el borrador (si no hay cambios sin guardar).
  useEffect(() => {
    if (active && !dirty) setDraft(active.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const onEdit = (value: string) => {
    setDraft(value);
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Autosave silencioso a los 1.2s de inactividad.
    saveTimer.current = setTimeout(() => void persist(value, true), 1200);
  };

  const persist = async (value: string, silent = false) => {
    if (!active) return;
    setSaving(true);
    const ok = await updateMemoryContent(active.id, value);
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
    const file = await saveMemoryFile({
      brain_id: brainId,
      name: name.endsWith(".md") ? name : `${name}.md`,
      content: `# ${name.replace(/\.md$/i, "")}\n\n`,
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

  const onDelete = async (f: MemoryFile) => {
    if (!(await confirm({
      title: "Eliminar fichero",
      description: `¿Eliminar ${f.name}? Esta acción no se puede deshacer.`,
      destructive: true,
    }))) return;
    const ok = await deleteMemoryFile(f.id);
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
      {/* ─── Lista de ficheros ─────────────────────────────── */}
      <aside className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-cyan-300" />
            <span className="text-sm font-semibold text-cyan-50">Ficheros</span>
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
              Aún no hay ficheros de memoria. Crea el primero abajo.
            </p>
          ) : (
            <ul className="space-y-1">
              {rows.map((f) => {
                const Icon = iconForFile(f.name);
                const src = memorySourceById(f.source);
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
                          ? "bg-cyan-500/15 border border-cyan-500/30"
                          : "hover:bg-white/5 border border-transparent",
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-cyan-300" : "text-white/45")} />
                      <span className="truncate text-sm text-white/80">{f.name}</span>
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

        {/* Crear fichero */}
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

      {/* ─── Editor + fuente ───────────────────────────────── */}
      <section className="space-y-3 min-w-0">
        {!active ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
            <FileText className="w-8 h-8 text-white/25 mx-auto mb-2" />
            <p className="text-sm text-white/50">
              Selecciona un fichero o crea el primero para empezar a editar.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-cyan-50">{active.name}</span>
              {dirty ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                  sin guardar
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                  guardado
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 gap-1.5 text-xs"
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

            {/* Fuente / servidor del fichero */}
            <SourceEditor file={active} onChanged={reload} />
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor de fuente/servidor por fichero                               */
/* ------------------------------------------------------------------ */

function SourceEditor({ file, onChanged }: { file: MemoryFile; onChanged: () => void }) {
  const [source, setSource] = useState<MemorySource>((file.source as MemorySource) || "starseed");
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(file.server_config || {})) c[k] = String(v ?? "");
    return c;
  });
  const [sync, setSync] = useState<boolean>(file.sync);
  const [saving, setSaving] = useState(false);

  // Re-sincroniza cuando cambia el fichero activo.
  useEffect(() => {
    setSource((file.source as MemorySource) || "starseed");
    setSync(file.sync);
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(file.server_config || {})) c[k] = String(v ?? "");
    setConfig(c);
  }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = memorySourceById(source);

  const onSave = async () => {
    setSaving(true);
    const ok = await setMemorySource(file.id, source, config, sync);
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
        <span className="text-sm font-semibold text-cyan-50">Fuente / servidor</span>
        {sync && (
          <Badge variant="outline" className="ml-auto border-emerald-500/40 text-emerald-300 text-[10px] gap-1">
            <RefreshCw className="w-3 h-3" /> sincroniza
          </Badge>
        )}
      </div>

      <p className="text-xs text-white/50">
        Elige dónde se almacena/sincroniza <span className="text-white/70">{file.name}</span>. Por defecto vive en
        StarSeed; puedes moverlo a Google Drive, a un servidor personal o a tu equipo local.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {MEMORY_SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
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

      {/* Campos del servidor (según fuente) */}
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

      <div className="flex items-center justify-between gap-3 pt-1">
        <label className="flex items-center gap-2 text-xs text-white/70">
          <Switch checked={sync} onCheckedChange={setSync} />
          <HardDriveDownload className="w-3.5 h-3.5" />
          Sincronizar automáticamente con esta fuente
        </label>
        <Button size="sm" className="gap-1.5" disabled={saving} onClick={onSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar fuente
        </Button>
      </div>
    </div>
  );
}
