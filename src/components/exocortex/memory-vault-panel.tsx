"use client";

/**
 * StarSeed OS — Panel Bóveda de Memorias
 *
 * Drawer/overlay para gestionar los documentos de memoria del Exocórtex:
 * crear, editar, categorizar, etiquetar, activar/desactivar, importar,
 * exportar y compartir memorias .md que se integran en el cerebro 3D.
 *
 * Props:
 *   open         — controla visibilidad del panel
 *   onClose      — callback para cerrar
 *   onChange     — callback tras cualquier mutación (para que el cerebro reconstruya el grafo)
 *   onFocusNode  — callback para enfocar un nodo en el cerebro 3D por nombre
 */

import { useState, useRef, useCallback } from "react";
import {
  Brain,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  Share2,
  Edit3,
  Check,
  X,
  FileText,
  Tag,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  useMemoryVault,
  parseMarkdownToGraph,
  encodeShare,
  decodeShare,
  type MemoryDoc,
} from "@/lib/memory-vault";

// ============================================================
// Tipos internos
// ============================================================

interface EditState {
  id: string;
  name: string;
  category: string;
  tags: string;
  markdown: string;
  color: string;
}

// ============================================================
// Componente principal
// ============================================================

export function MemoryVaultPanel({
  open,
  onClose,
  onChange,
  onFocusNode,
}: {
  open: boolean;
  onClose: () => void;
  onChange?: () => void;
  onFocusNode?: (label: string) => void;
}) {
  const {
    memories,
    create,
    update,
    remove,
    duplicate,
    toggleActive,
    setCategory,
    importMd,
    exportMd,
    exportJson,
    importJson,
  } = useMemoryVault();

  // Estado UI
  const [editState, setEditState] = useState<EditState | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Personal");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Refs para file inputs ocultos
  const mdFileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  // ── Helpers ────────────────────────────────────────────────

  const notifyChange = useCallback(() => {
    onChange?.();
  }, [onChange]);

  function showToast(msg: string) {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 2500);
  }

  // ── Agrupación por categoría ────────────────────────────────

  const grouped = memories.reduce<Record<string, MemoryDoc[]>>((acc, doc) => {
    const cat = doc.category || "Sin categoría";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort();

  // ── Acciones de edición ────────────────────────────────────

  function startEdit(doc: MemoryDoc) {
    setEditState({
      id: doc.id,
      name: doc.name,
      category: doc.category,
      tags: doc.tags.join(", "),
      markdown: doc.markdown,
      color: doc.color ?? "#007FFF",
    });
  }

  function cancelEdit() {
    setEditState(null);
  }

  function saveEdit() {
    if (!editState) return;
    update(editState.id, {
      name: editState.name,
      category: editState.category,
      tags: editState.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      markdown: editState.markdown,
      color: editState.color,
    });
    setEditState(null);
    notifyChange();
  }

  // ── Crear memoria ──────────────────────────────────────────

  function handleCreate() {
    if (!newName.trim()) return;
    create({ name: newName.trim(), category: newCategory || "Personal" });
    setNewName("");
    notifyChange();
  }

  // ── Eliminar ───────────────────────────────────────────────

  function handleDelete(id: string) {
    if (deleteConfirm === id) {
      remove(id);
      setDeleteConfirm(null);
      notifyChange();
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  }

  // ── Duplicar ───────────────────────────────────────────────

  function handleDuplicate(id: string) {
    duplicate(id);
    notifyChange();
  }

  // ── Toggle activo ──────────────────────────────────────────

  function handleToggleActive(id: string) {
    toggleActive(id);
    notifyChange();
  }

  // ── Categoría inline ───────────────────────────────────────

  function handleCategoryBlur(id: string, val: string) {
    setCategory(id, val);
    notifyChange();
  }

  // ── Exportar .md ───────────────────────────────────────────

  function handleExportMd(doc: MemoryDoc) {
    const text = exportMd(doc.id);
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name.replace(/[^a-z0-9]/gi, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Compartir (base64) ─────────────────────────────────────

  async function handleShare(id: string) {
    const encoded = encodeShare(id);
    if (!encoded) return;
    try {
      await navigator.clipboard.writeText(encoded);
      showToast("Enlace copiado al portapapeles");
    } catch {
      showToast(encoded.slice(0, 40) + "...");
    }
  }

  // ── Exportar JSON completo ─────────────────────────────────

  function handleExportAll() {
    const text = exportJson();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "starseed-memory-vault.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Importar .md ───────────────────────────────────────────

  function handleMdFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      importMd(file.name.replace(/\.md$/i, ""), text);
      notifyChange();
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Importar JSON ──────────────────────────────────────────

  function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        importJson(ev.target?.result as string);
        notifyChange();
        showToast("Bóveda importada correctamente");
      } catch {
        showToast("Error: JSON inválido");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Colapsar categoría ─────────────────────────────────────

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // ── Nodos que añadiría la memoria en edición ───────────────

  const editNodeCount = editState
    ? parseMarkdownToGraph({
        id: editState.id,
        name: editState.name,
        category: editState.category,
        tags: editState.tags.split(",").map((t) => t.trim()).filter(Boolean),
        markdown: editState.markdown,
        color: editState.color,
        createdAt: 0,
        updatedAt: 0,
        active: true,
      }).nodes.length
    : 0;

  // ── Render ─────────────────────────────────────────────────

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-black/80 backdrop-blur-2xl shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Bóveda de Memorias"
      >
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Brain className="h-5 w-5 text-[#007FFF]" />
          <h2 className="flex-1 text-base font-semibold text-white tracking-wide">
            Bóveda de Memorias
          </h2>
          <span className="text-xs text-white/40">{memories.length} docs</span>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="space-y-1 px-4 py-4">

            {/* ── Crear nueva memoria ─────────────────────── */}
            <section className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#39FF14]">
                <Plus className="h-3.5 w-3.5" />
                Nueva memoria
              </h3>
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre de la memoria"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="h-8 flex-1 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30 focus:border-[#007FFF]/60"
                />
                <Input
                  placeholder="Categoría"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="h-8 w-28 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30 focus:border-[#007FFF]/60"
                />
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="h-8 cursor-pointer bg-[#007FFF] px-3 text-white hover:bg-[#007FFF]/80"
                >
                  Crear
                </Button>
              </div>
            </section>

            {/* ── Memorias por categoría ───────────────────── */}
            {sortedCategories.length === 0 && (
              <p className="py-8 text-center text-sm text-white/30">
                No hay memorias todavía. ¡Crea la primera!
              </p>
            )}

            {sortedCategories.map((cat) => {
              const docs = grouped[cat];
              const collapsed = collapsedCategories.has(cat);

              return (
                <section key={cat} className="mb-4">
                  {/* Cabecera de categoría */}
                  <button
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-white/60 hover:bg-white/5 hover:text-white/90 transition-colors"
                    onClick={() => toggleCategory(cat)}
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    <FolderOpen className="h-3.5 w-3.5 text-[#FFBF00]" />
                    {cat}
                    <span className="ml-auto text-white/30">{docs.length}</span>
                  </button>

                  {/* Memorias de esta categoría */}
                  {!collapsed && (
                    <div className="mt-1 space-y-2 pl-2">
                      {docs.map((doc) => (
                        <MemoryCard
                          key={doc.id}
                          doc={doc}
                          isEditing={editState?.id === doc.id}
                          editState={editState}
                          editNodeCount={editNodeCount}
                          deleteConfirm={deleteConfirm}
                          onEditStart={() => startEdit(doc)}
                          onEditCancel={cancelEdit}
                          onEditSave={saveEdit}
                          onEditChange={(patch) =>
                            setEditState((prev) => (prev ? { ...prev, ...patch } : null))
                          }
                          onDelete={() => handleDelete(doc.id)}
                          onDuplicate={() => handleDuplicate(doc.id)}
                          onToggleActive={() => handleToggleActive(doc.id)}
                          onExportMd={() => handleExportMd(doc)}
                          onShare={() => handleShare(doc.id)}
                          onCategoryBlur={(val) => handleCategoryBlur(doc.id, val)}
                          onFocusNode={() => onFocusNode?.(doc.name)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

            {/* ── Importar / Exportar ──────────────────────── */}
            <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                <FileText className="h-3.5 w-3.5" />
                Importar / Exportar
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {/* Importar .md */}
                <button
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                  onClick={() => mdFileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importar .md
                </button>
                <input
                  ref={mdFileRef}
                  type="file"
                  accept=".md,text/markdown"
                  className="hidden"
                  onChange={handleMdFileChange}
                />

                {/* Importar JSON */}
                <button
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                  onClick={() => jsonFileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importar JSON
                </button>
                <input
                  ref={jsonFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleJsonFileChange}
                />

                {/* Exportar todo */}
                <button
                  className="col-span-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-2 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/20 transition-colors"
                  onClick={handleExportAll}
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar toda la bóveda (JSON)
                </button>
              </div>
            </section>

          </div>
        </ScrollArea>

        {/* Toast notification */}
        {shareToast && (
          <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/10 bg-black/90 px-4 py-2 text-sm text-white shadow-xl backdrop-blur-xl">
            {shareToast}
          </div>
        )}
      </aside>
    </>
  );
}

// ============================================================
// Subcomponente: MemoryCard
// ============================================================

interface MemoryCardProps {
  doc: MemoryDoc;
  isEditing: boolean;
  editState: EditState | null;
  editNodeCount: number;
  deleteConfirm: string | null;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onEditChange: (patch: Partial<EditState>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onExportMd: () => void;
  onShare: () => void;
  onCategoryBlur: (val: string) => void;
  onFocusNode: () => void;
}

function MemoryCard({
  doc,
  isEditing,
  editState,
  editNodeCount,
  deleteConfirm,
  onEditStart,
  onEditCancel,
  onEditSave,
  onEditChange,
  onDelete,
  onDuplicate,
  onToggleActive,
  onExportMd,
  onShare,
  onCategoryBlur,
  onFocusNode,
}: MemoryCardProps) {
  const [localCategory, setLocalCategory] = useState(doc.category);

  const accentColor = doc.color ?? "#007FFF";

  return (
    <article
      className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
      style={{ borderLeftColor: accentColor, borderLeftWidth: "3px" }}
    >
      {/* Cabecera de la tarjeta */}
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Indicador de color + nombre */}
        <div className="flex-1 min-w-0">
          <button
            className="cursor-pointer truncate text-sm font-semibold text-white hover:text-[#007FFF] transition-colors text-left w-full"
            onClick={onFocusNode}
            title="Enfocar en el cerebro"
          >
            {doc.name}
          </button>

          {/* Categoría editable */}
          <div className="mt-1 flex items-center gap-1">
            <FolderOpen className="h-3 w-3 text-[#FFBF00] shrink-0" />
            <input
              className="h-5 w-24 rounded bg-transparent px-1 text-xs text-[#FFBF00] outline-none hover:bg-white/5 focus:bg-white/10 transition-colors"
              value={localCategory}
              onChange={(e) => setLocalCategory(e.target.value)}
              onBlur={(e) => {
                if (e.target.value !== doc.category) {
                  onCategoryBlur(e.target.value);
                }
              }}
              title="Editar categoría"
            />
          </div>

          {/* Tags */}
          {doc.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {doc.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Toggle activo */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {doc.active ? (
              <Eye className="h-3 w-3 text-[#39FF14]" />
            ) : (
              <EyeOff className="h-3 w-3 text-white/30" />
            )}
            <Switch
              checked={doc.active}
              onCheckedChange={onToggleActive}
              className="h-4 w-7 cursor-pointer"
              aria-label="Mostrar en el cerebro"
            />
          </div>
          <span className="text-[9px] text-white/30">en cerebro</span>
        </div>
      </div>

      {/* Barra de acciones */}
      <div className="flex items-center gap-0.5 border-t border-white/5 px-2 py-1.5">
        <ActionBtn icon={<Edit3 className="h-3 w-3" />} label="Editar" onClick={onEditStart} />
        <ActionBtn icon={<Copy className="h-3 w-3" />} label="Duplicar" onClick={onDuplicate} />
        <ActionBtn icon={<Download className="h-3 w-3" />} label="Exportar .md" onClick={onExportMd} />
        <ActionBtn icon={<Share2 className="h-3 w-3" />} label="Compartir" onClick={onShare} />
        <ActionBtn
          icon={<Trash2 className="h-3 w-3" />}
          label={deleteConfirm === doc.id ? "¿Eliminar?" : "Eliminar"}
          onClick={onDelete}
          danger
          active={deleteConfirm === doc.id}
        />
      </div>

      {/* Editor inline */}
      {isEditing && editState && (
        <div className="border-t border-white/10 bg-black/40 px-3 py-3 space-y-2">
          {/* Nombre */}
          <div className="flex gap-2">
            <Input
              placeholder="Nombre"
              value={editState.name}
              onChange={(e) => onEditChange({ name: e.target.value })}
              className="h-7 flex-1 border-white/10 bg-white/5 text-xs text-white placeholder:text-white/30"
            />
            {/* Color */}
            <input
              type="color"
              value={editState.color}
              onChange={(e) => onEditChange({ color: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
              title="Color del nodo"
            />
          </div>

          {/* Tags */}
          <Input
            placeholder="Etiquetas separadas por comas"
            value={editState.tags}
            onChange={(e) => onEditChange({ tags: e.target.value })}
            className="h-7 border-white/10 bg-white/5 text-xs text-white placeholder:text-white/30"
          />

          {/* Markdown */}
          <Textarea
            value={editState.markdown}
            onChange={(e) => onEditChange({ markdown: e.target.value })}
            rows={10}
            placeholder="Escribe en markdown..."
            className="min-h-[160px] resize-y border-white/10 bg-white/5 font-mono text-xs text-white/90 placeholder:text-white/20"
          />

          {/* Contador de nodos */}
          <div className="flex items-center gap-1.5 text-[10px] text-white/40">
            <Sparkles className="h-3 w-3 text-[#007FFF]" />
            Este documento añadiría{" "}
            <span className="font-semibold text-[#007FFF]">{editNodeCount}</span>{" "}
            {editNodeCount === 1 ? "nodo" : "nodos"} al cerebro
          </div>

          {/* Botones guardar/cancelar */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={onEditSave}
              className="h-7 cursor-pointer bg-[#007FFF] px-3 text-xs text-white hover:bg-[#007FFF]/80"
            >
              <Check className="mr-1 h-3 w-3" />
              Guardar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onEditCancel}
              className="h-7 cursor-pointer border-white/10 bg-transparent px-3 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

// ============================================================
// Botón de acción pequeño
// ============================================================

function ActionBtn({
  icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={[
        "flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[10px] transition-colors",
        danger
          ? active
            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            : "text-white/40 hover:bg-red-500/10 hover:text-red-400"
          : "text-white/40 hover:bg-white/10 hover:text-white",
      ].join(" ")}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
