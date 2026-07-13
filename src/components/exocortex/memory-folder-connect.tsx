"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Conectar folder de memorias (memory root → cerebro/baúl)
// ----------------------------------------------------------------
// Panel de VISTA PREVIA para vincular un memory root (`<nombre>_memory_root/`)
// al sistema de memorias. Lee un `memory.manifest.json` (por URL o pegado),
// previsualiza sus ramas, lo "conecta" (guarda en localStorage) y permite una
// "Sincronización (preview)" que sólo calcula el diff por rama — SIN escribir
// en ninguna cuenta/servidor.
//
// ⚠️ NO CONECTADO A LA CUENTA: todo es local. La cuenta "Ester" se conecta
//    más tarde, fuera de este componente. Ver `architecture/memoria-cerebros-sync.md`.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FolderSync,
  Link2,
  ClipboardPaste,
  Loader2,
  Trash2,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  PlusCircle,
  Pencil,
  Minus,
  ListTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseManifest,
  diffManifest,
  summarize,
  type MemoryManifest,
  type ManifestDiff,
  type BranchStatus,
} from "@/lib/memory-sync/manifest";
import {
  loadManifestFromUrl,
  loadManifestFromText,
  readRoots,
  addRoot,
  removeRoot,
  type ConnectedRoot,
} from "@/lib/memory-sync/connect";

// Iconos por tipo de rama (coherente con el lenguaje visual del Memory Hub).
const TIPO_ICON: Record<string, string> = {
  soul: "🪷", skill: "✨", memory: "🧠", dream: "🌙", task: "✅",
  aurora: "🌅", style: "🎨", accounts: "👤", log: "📜",
};

// Estilo del estado del diff por rama.
const STATUS_STYLE: Record<BranchStatus, { label: string; cls: string }> = {
  added: { label: "se añade", cls: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" },
  updated: { label: "se actualiza", cls: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200" },
  unchanged: { label: "sin cambios", cls: "border-white/15 bg-white/5 text-white/50" },
  removed: { label: "se quita", cls: "border-amber-400/40 bg-amber-500/10 text-amber-200" },
};

function StatusIcon({ status }: { status: BranchStatus }) {
  if (status === "added") return <PlusCircle className="w-3 h-3" />;
  if (status === "updated") return <Pencil className="w-3 h-3" />;
  if (status === "removed") return <Minus className="w-3 h-3" />;
  return <CheckCircle2 className="w-3 h-3" />;
}

/** Insignia clara: el panel NO está conectado a la cuenta (sólo vista previa). */
function PreviewBadge() {
  return (
    <Badge
      variant="outline"
      className="text-[9px] border-amber-400/40 bg-amber-500/10 text-amber-200 inline-flex items-center gap-1"
      title="Este panel no escribe en ninguna cuenta ni servidor. Sólo previsualiza."
    >
      <ShieldAlert className="w-2.5 h-2.5" /> No conectado a la cuenta · vista previa
    </Badge>
  );
}

/** Tabla de ramas: rama · tipo · scope · archivo. */
function BranchesTable({ manifest }: { manifest: MemoryManifest }) {
  if (manifest.branches.length === 0) {
    return <div className="text-[11px] text-white/40 px-1 py-2">El manifiesto no declara ramas.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-white/5 text-fuchsia-200/60">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">rama</th>
            <th className="px-2.5 py-1.5 font-medium">tipo</th>
            <th className="px-2.5 py-1.5 font-medium">scope</th>
            <th className="px-2.5 py-1.5 font-medium">archivo</th>
          </tr>
        </thead>
        <tbody>
          {manifest.branches.map((b, i) => (
            <tr key={`${b.archivo}-${i}`} className="border-t border-white/5">
              <td className="px-2.5 py-1.5 text-white/85">{b.rama}</td>
              <td className="px-2.5 py-1.5 text-white/70">
                <span className="inline-flex items-center gap-1">
                  <span>{TIPO_ICON[b.tipo] ?? "•"}</span> {b.tipo}
                </span>
              </td>
              <td className="px-2.5 py-1.5 text-white/55">{b.scope ?? "—"}</td>
              <td className="px-2.5 py-1.5 font-mono text-cyan-200/70">{b.archivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MemoryFolderConnect() {
  // Entrada: URL o JSON pegado.
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vista previa del manifiesto parseado (antes de "Conectar").
  const [preview, setPreview] = useState<MemoryManifest | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Roots ya vinculados (persistidos en localStorage).
  const [roots, setRoots] = useState<ConnectedRoot[]>([]);

  // Diff por root: { [rootId]: ManifestDiff } tras "Sincronizar (preview)".
  const [diffs, setDiffs] = useState<Record<string, ManifestDiff>>({});

  // Carga inicial de roots (sólo en cliente).
  const refresh = useCallback(() => setRoots(readRoots()), []);
  useEffect(() => { refresh(); }, [refresh]);

  // ── Previsualizar desde URL ──
  async function previewFromUrl() {
    setLoading(true); setError(null); setPreview(null);
    try {
      const m = await loadManifestFromUrl(url);
      setPreview(m); setPreviewUrl(url.trim() || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el manifiesto.");
    } finally {
      setLoading(false);
    }
  }

  // ── Previsualizar desde texto pegado ──
  function previewFromText() {
    setError(null); setPreview(null);
    try {
      const m = loadManifestFromText(text);
      setPreview(m); setPreviewUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El texto no es un manifiesto válido.");
    }
  }

  // ── Conectar (guardar en localStorage) ──
  function connect() {
    if (!preview) return;
    const next = addRoot(preview, previewUrl);
    setRoots(next);
    setPreview(null); setPreviewUrl(null);
    setUrl(""); setText("");
  }

  // ── Quitar un root vinculado ──
  function disconnect(id: string) {
    setRoots(removeRoot(id));
    setDiffs((d) => { const n = { ...d }; delete n[id]; return n; });
  }

  // ── Sincronizar (preview): calcula el diff por rama, SIN escribir nada ──
  // Si el root tiene URL, re-descarga el manifiesto y lo compara con el último
  // conocido. Si se pegó como texto (sin URL), compara contra sí mismo
  // (resultado esperado: todo "sin cambios") para demostrar el mecanismo.
  const [syncingId, setSyncingId] = useState<string | null>(null);
  async function syncPreview(root: ConnectedRoot) {
    setSyncingId(root.id); setError(null);
    try {
      let next: MemoryManifest = root.lastManifest;
      if (root.url) {
        next = await loadManifestFromUrl(root.url);
      } else {
        // Sin fuente remota: re-parseamos el último manifiesto (no-op seguro).
        next = parseManifest(root.lastManifest);
      }
      const diff = diffManifest(root.lastManifest, next);
      setDiffs((d) => ({ ...d, [root.id]: diff }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo previsualizar la sincronización.");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <Card className="border-fuchsia-500/20 bg-black/20 p-0">
      <div className="p-4 space-y-4">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center shrink-0">
            <FolderSync className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fuchsia-50 flex items-center gap-2 flex-wrap">
              Conectar folder de memorias <PreviewBadge />
            </div>
            <div className="text-[11px] text-fuchsia-300/60">
              Vincula un <span className="font-mono">memory root</span> (su <span className="font-mono">memory.manifest.json</span>) y previsualiza qué se sincronizaría por memoria. No escribe en ninguna cuenta.
            </div>
          </div>
        </div>

        {/* Entrada: URL del manifiesto */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-[11px] text-white/60 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-cyan-300/70" /> URL del <span className="font-mono">memory.manifest.json</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url.trim() && previewFromUrl()}
              placeholder="https://…/ester_memory_root/memory.manifest.json"
              className="bg-white/5 text-xs h-9"
            />
            <Button
              size="sm"
              className="gap-1.5 bg-cyan-600 hover:bg-cyan-500 shrink-0"
              disabled={loading || !url.trim()}
              onClick={previewFromUrl}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Previsualizar
            </Button>
          </div>

          {/* Entrada alternativa: JSON pegado */}
          <div className="text-[11px] text-white/60 flex items-center gap-1.5 pt-1">
            <ClipboardPaste className="w-3.5 h-3.5 text-fuchsia-300/70" /> …o pega el JSON del manifiesto
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'{ "name": "Ester", "kind": "memory_root", "structure": "root+branches", "accountConnected": false, "branches": [ … ] }'}
            className="w-full bg-black/40 border border-white/10 rounded text-xs font-mono min-h-[90px] p-2 text-white/85"
          />
          <div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-fuchsia-400/30 text-fuchsia-100 hover:bg-fuchsia-900/20"
              disabled={!text.trim()}
              onClick={previewFromText}
            >
              <ClipboardPaste className="w-3.5 h-3.5" /> Previsualizar JSON pegado
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-[11px] rounded px-2 py-1.5 break-words bg-red-900/30 text-red-200 border border-red-500/30">
            {error}
          </div>
        )}

        {/* Vista previa del manifiesto parseado (antes de conectar) */}
        {preview && (
          <div className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-950/10 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ListTree className="w-4 h-4 text-fuchsia-300" />
              <span className="text-sm font-semibold text-fuchsia-50">{preview.name}</span>
              <Badge variant="outline" className="text-[9px] border-fuchsia-500/30 text-fuchsia-200/80">
                {summarize(preview).totalBranches} ramas
              </Badge>
              {Object.entries(summarize(preview).byTipo).map(([t, n]) => (
                <Badge key={t} variant="outline" className="text-[9px] border-white/15 text-white/60">
                  {TIPO_ICON[t] ?? "•"} {t} · {n}
                </Badge>
              ))}
              <PreviewBadge />
            </div>

            {preview.linkTargets.length > 0 && (
              <div className="text-[10px] text-white/50">
                Destinos declarados: {preview.linkTargets.join(" · ")}
              </div>
            )}

            <BranchesTable manifest={preview} />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500"
                onClick={connect}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectar (guardar localmente)
              </Button>
              <span className="text-[10px] text-white/40">
                Se guarda en este dispositivo (localStorage). No se sube a ninguna cuenta.
              </span>
            </div>
          </div>
        )}

        {/* Roots vinculados */}
        <div>
          <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50 mb-2 flex items-center gap-1">
            <FolderSync className="w-3 h-3" /> Folders de memorias vinculadas
          </div>
          {roots.length === 0 ? (
            <div className="text-[11px] text-white/40 px-1">
              Aún no has vinculado ningún folder. Previsualiza un manifiesto arriba y pulsa “Conectar”.
            </div>
          ) : (
            <div className="space-y-2">
              {roots.map((root) => {
                const diff = diffs[root.id];
                return (
                  <div key={root.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white flex items-center gap-1.5">
                          <FolderSync className="w-3.5 h-3.5 text-fuchsia-300/70" /> {root.name}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5 break-all">
                          {root.url ? root.url : "manifiesto pegado (sin URL)"} · {root.branches.length} ramas
                        </div>
                      </div>
                      <PreviewBadge />
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20"
                          disabled={syncingId === root.id}
                          onClick={() => syncPreview(root)}
                          title="Calcula qué se sincronizaría por memoria. No escribe en ninguna cuenta ni servidor."
                        >
                          {syncingId === root.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Sincronizar (preview)
                        </Button>
                        <button onClick={() => disconnect(root.id)} className="text-white/30 hover:text-red-400" title="Quitar vínculo">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Preview por rama del root (rama · tipo · scope · archivo) */}
                    <BranchesTable manifest={root.lastManifest} />

                    {/* Resultado del diff (qué se sincronizaría por memoria) */}
                    {diff && (
                      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-2.5 space-y-2">
                        <div className="text-[11px] text-cyan-100/80 flex flex-wrap items-center gap-2">
                          <span className="font-semibold">Vista previa de sincronización</span>
                          <Badge variant="outline" className="text-[9px] border-emerald-400/40 text-emerald-200">+{diff.added} nuevas</Badge>
                          <Badge variant="outline" className="text-[9px] border-cyan-400/40 text-cyan-200">~{diff.updated} actualizadas</Badge>
                          <Badge variant="outline" className="text-[9px] border-white/15 text-white/55">{diff.unchanged} sin cambios</Badge>
                          {diff.removed > 0 && (
                            <Badge variant="outline" className="text-[9px] border-amber-400/40 text-amber-200">-{diff.removed} quitadas</Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-white/45">
                          Se sincronizarían <span className="text-white/70 font-medium">{diff.toSync}</span> memoria(s). Nada se ha escrito: esto es sólo una vista previa local.
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {diff.branches.map((b, i) => {
                            const st = STATUS_STYLE[b.status];
                            return (
                              <span
                                key={`${b.archivo}-${i}`}
                                className={cn("text-[10px] rounded-full px-2 py-0.5 border inline-flex items-center gap-1", st.cls)}
                                title={b.archivo}
                              >
                                <StatusIcon status={b.status} />
                                {TIPO_ICON[b.tipo] ?? "•"} {b.rama} · {st.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Aviso global persistente */}
        <div className="text-[10px] text-amber-300/70 border-t border-white/10 pt-3 flex items-start gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>
            Modo vista previa: este panel <strong>no está conectado a ninguna cuenta StarSeed ni servidor</strong>. Lee manifiestos portátiles y calcula diferencias localmente. La sincronización real (cuenta “Ester”) se conecta más tarde.
          </span>
        </div>
      </div>
    </Card>
  );
}

export default MemoryFolderConnect;
