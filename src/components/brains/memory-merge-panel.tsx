"use client";

/**
 * MemoryMergePanel — FUSIONAR y DUPLICAR memorias (MemoryDoc del Exocórtex).
 *
 * Sección autónoma para el panel de Cerebros: lista las memorias de la Bóveda
 * (`@/lib/memory-vault`), permite DUPLICAR una memoria y FUSIONAR varias
 * seleccionadas en una nueva, con previsualización clara del resultado
 * (cuántas memorias se combinan, título/categoría, y el markdown final).
 *
 * No destruye las originales salvo que se marque "eliminar originales".
 * Diseño Crystal Liquid Glass, responsive y respetuoso con reduced-motion.
 * SSR-safe: el hook del vault ya degrada a [] en servidor.
 */

import { useMemo, useState } from "react";
import {
  Brain as BrainIcon,
  Copy,
  GitMerge,
  Check,
  X,
  Eye,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMemoryVault, type MemoryDoc } from "@/lib/memory-vault";
import {
  duplicateMemoryDoc,
  mergeMemories,
  previewMergeMemories,
} from "@/lib/brains/merge-duplicate";

export default function MemoryMergePanel() {
  const { memories } = useMemoryVault();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [removeSources, setRemoveSources] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Sólo ids que siguen existiendo (defensivo ante borrados externos).
  const selectedDocs = useMemo(
    () => memories.filter((m) => selected.includes(m.id)),
    [memories, selected],
  );

  const preview = useMemo(() => {
    if (selectedDocs.length < 2) return null;
    return previewMergeMemories(
      selectedDocs.map((d) => d.id),
      { title: title || undefined, category: category || undefined },
    );
  }, [selectedDocs, title, category]);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function clearSelection() {
    setSelected([]);
    setTitle("");
    setCategory("");
    setRemoveSources(false);
    setShowPreview(false);
  }

  function handleDuplicate(doc: MemoryDoc) {
    const copy = duplicateMemoryDoc(doc.id);
    if (copy) toast.success(`Memoria «${doc.name}» duplicada.`);
    else toast.error("No se pudo duplicar la memoria.");
  }

  function handleMerge() {
    if (selectedDocs.length < 2) {
      toast.error("Selecciona al menos dos memorias para fusionar.");
      return;
    }
    const names = selectedDocs.map((d) => `«${d.name}»`).join(", ");
    const warn = removeSources
      ? `Se creará una memoria fusionada con ${names} y se ELIMINARÁN las originales. ¿Continuar?`
      : `Se creará una nueva memoria fusionando ${names} (las originales se conservan). ¿Continuar?`;
    if (typeof window !== "undefined" && !window.confirm(warn)) return;

    const created = mergeMemories(
      selectedDocs.map((d) => d.id),
      {
        title: title || undefined,
        category: category || undefined,
        removeSources,
      },
    );
    if (created) {
      toast.success(`Memoria «${created.name}» creada por fusión.`);
      clearSelection();
    } else {
      toast.error("No se pudo fusionar las memorias.");
    }
  }

  return (
    <section className="scroll-mt-24 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 text-left transition-colors motion-reduce:transition-none hover:text-fuchsia-100"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-fuchsia-500 to-cyan-500">
          <GitMerge className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-fuchsia-50">Fusionar y duplicar memorias</span>
        <span className="hidden text-[11px] text-fuchsia-300/70 sm:inline">
          Duplica una memoria o combina varias en una nueva, con previsualización.
        </span>
        <span className="ml-auto text-fuchsia-200/70">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {memories.length === 0 ? (
            <p className="text-[11px] text-white/45">
              No hay memorias en tu Bóveda todavía. Créalas en{" "}
              <strong className="text-white/60">Exocórtex → Bóveda de Memorias</strong>.
            </p>
          ) : (
            <>
              {/* Lista seleccionable */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-fuchsia-300/60">
                  <Layers className="h-3.5 w-3.5" /> Selecciona memorias ({selected.length})
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {memories.map((doc) => {
                    const on = selected.includes(doc.id);
                    return (
                      <div
                        key={doc.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors motion-reduce:transition-none",
                          on
                            ? "border-fuchsia-400/50 bg-fuchsia-500/10"
                            : "border-white/10 bg-black/20 hover:border-white/20",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(doc.id)}
                          aria-pressed={on}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              on ? "border-fuchsia-400 bg-fuchsia-500/40" : "border-white/25",
                            )}
                          >
                            {on && <Check className="h-3 w-3 text-white" />}
                          </span>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: doc.color ?? "#007FFF" }}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[12px] text-white/90">{doc.name}</span>
                            <span className="flex items-center gap-1 truncate text-[10px] text-white/35">
                              <FolderOpen className="h-2.5 w-2.5 text-[#FFBF00]" />
                              {doc.category}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(doc)}
                          title="Duplicar esta memoria"
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/60 transition-colors motion-reduce:transition-none hover:border-cyan-400/40 hover:text-cyan-100"
                        >
                          <Copy className="h-3 w-3" /> Duplicar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Controles de fusión */}
              <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/50">Título del resultado</span>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={
                        selectedDocs.length >= 2
                          ? `Fusión de ${selectedDocs.length} memorias`
                          : "Fusión de memorias"
                      }
                      className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/50">Categoría</span>
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder={selectedDocs[0]?.category ?? "Personal"}
                      className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                    />
                  </label>
                </div>

                <label className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-white/80">
                      Eliminar memorias originales tras fusionar
                    </span>
                    <span className="text-[10px] text-white/40">
                      Por defecto se conservan. Actívalo sólo si quieres reemplazarlas.
                    </span>
                  </div>
                  <Switch checked={removeSources} onCheckedChange={setRemoveSources} />
                </label>

                {/* Visualización A + B → resultado */}
                {selectedDocs.length >= 2 && preview && (
                  <div className="rounded-lg border border-fuchsia-500/20 bg-black/30 p-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/70">
                      {selectedDocs.map((d, i) => (
                        <span key={d.id} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-fuchsia-300/70">+</span>}
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: d.color ?? "#007FFF" }}
                            />
                            <span className="max-w-[10rem] truncate">{d.name}</span>
                          </span>
                        </span>
                      ))}
                      <span className="text-fuchsia-300">→</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-100">
                        <BrainIcon className="h-3 w-3" />
                        <span className="max-w-[12rem] truncate">{preview.title}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-white/45">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3" /> {selectedDocs.length} memorias combinadas
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FolderOpen className="h-3 w-3 text-[#FFBF00]" /> {preview.category}
                      </span>
                      {preview.tags.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-cyan-300" /> {preview.tags.length}{" "}
                          etiquetas unidas
                        </span>
                      )}
                      <span>· {preview.chars.toLocaleString()} caracteres</span>
                      <button
                        type="button"
                        onClick={() => setShowPreview((v) => !v)}
                        className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-white/60 hover:text-white"
                      >
                        <Eye className="h-3 w-3" /> {showPreview ? "Ocultar" : "Ver"} markdown
                      </button>
                    </div>
                    {showPreview && (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-white/80">
                        {preview.markdown}
                      </pre>
                    )}
                  </div>
                )}

                {selectedDocs.length === 1 && (
                  <p className="text-[10px] text-amber-300/70">
                    Selecciona al menos una memoria más para fusionar (o usa «Duplicar» en la
                    memoria seleccionada).
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
                    onClick={handleMerge}
                    disabled={selectedDocs.length < 2}
                  >
                    <GitMerge className="h-4 w-4" /> Fusionar seleccionadas
                  </Button>
                  {selected.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-white/60"
                      onClick={clearSelection}
                    >
                      <X className="h-4 w-4" /> Limpiar selección
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
