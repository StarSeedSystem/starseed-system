"use client";

/* ============================================================
   STARSEED · ASSET PREVIEW MODAL ("app-store" para diseños)
   Ventana emergente de preview por cada archivo/folder de diseño:
   - Galería de fotos/vídeos (con fallback).
   - Descripción + info (autor, versión, licencia, descargas, atribución).
   - Pestañas: Reseñas y Versiones (autor + ramas de comunidad).
   - Acciones: Usar/Integrar, Descargar, Abrir externo, Crear rama.
   - Modo edición de metadatos (formularios controlados) pensado para
     "al subir cada archivo". Sin backend: estado local; la persistencia
     en localStorage la gestiona el panel contenedor.
   Estilo reutilizado de StarSeedKnowledgePanel: GlassCard, oro #E9C46A,
   Fraunces (font-headline), lucide, responsive.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import {
  type DesignAsset,
  type AssetKind,
  type AssetLicense,
  type AssetReview,
  type AssetBranch,
} from "@/data/design-assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  X,
  ExternalLink,
  Download,
  GitBranch,
  Star,
  Plus,
  Pencil,
  Check,
  Trash2,
  Image as ImageIcon,
  Video as VideoIcon,
  Code2,
  Palette,
  Layers,
  Wand2,
  Puzzle,
  Globe,
  ChevronLeft,
  ChevronRight,
  Copy,
} from "lucide-react";

const GOLD = "#E9C46A";

function iconForKind(kind: AssetKind) {
  switch (kind) {
    case "theme":
      return <Palette className="w-6 h-6" style={{ color: GOLD }} />;
    case "tokens":
      return <Layers className="w-6 h-6 text-cyan-300/90" />;
    case "background":
      return <Wand2 className="w-6 h-6 text-purple-300/90" />;
    case "component":
      return <Puzzle className="w-6 h-6 text-emerald-300/90" />;
    case "snippet":
      return <Code2 className="w-6 h-6 text-amber-200/90" />;
    case "external":
      return <Globe className="w-6 h-6 text-sky-300/90" />;
    default:
      return <Puzzle className="w-6 h-6" style={{ color: GOLD }} />;
  }
}

const KIND_OPTIONS: AssetKind[] = [
  "theme",
  "tokens",
  "background",
  "component",
  "snippet",
  "external",
];
const LICENSE_OPTIONS: AssetLicense[] = ["MIT", "CC0", "OpenSource"];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "w-3.5 h-3.5",
            n <= Math.round(value)
              ? "fill-current text-amber-300"
              : "text-white/20"
          )}
        />
      ))}
    </span>
  );
}

type Tab = "info" | "reviews" | "versions";

export function AssetPreviewModal({
  asset,
  startInEdit = false,
  onClose,
  onSave,
  onDelete,
}: {
  asset: DesignAsset;
  startInEdit?: boolean;
  onClose: () => void;
  /** Guardar cambios / nuevo asset (lo persiste el panel). */
  onSave?: (next: DesignAsset) => void;
  /** Eliminar un asset creado por el usuario. */
  onDelete?: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(startInEdit);
  const [draft, setDraft] = useState<DesignAsset>(asset);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [brokenImg, setBrokenImg] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(asset);
    setEditing(startInEdit);
    setGalleryIdx(0);
  }, [asset, startInEdit]);

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const view = editing ? draft : asset;
  const images = view.media?.images ?? [];
  const videos = view.media?.videos ?? [];

  const avgStars = useMemo(() => {
    if (!view.reviews.length) return 0;
    return (
      view.reviews.reduce((s, r) => s + (r.stars || 0), 0) / view.reviews.length
    );
  }, [view.reviews]);

  /* ---------- helpers de edición ---------- */
  const set = <K extends keyof DesignAsset>(key: K, value: DesignAsset[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setMediaList = (kind: "images" | "videos", value: string) =>
    setDraft((d) => ({
      ...d,
      media: {
        ...d.media,
        [kind]: value
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    }));

  const handleSave = () => {
    if (onSave) onSave(draft);
    setEditing(false);
  };

  const handleCopyCode = async () => {
    if (!view.code) return;
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard puede no estar disponible; ignoramos */
    }
  };

  const handleDownload = () => {
    // Descarga del código/recurso como fichero de texto (sin backend).
    const blob = new Blob([view.code || view.fileRef || view.externalUrl || ""], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${view.id || "starseed-asset"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const addBranch = () => {
    setDraft((d) => ({
      ...d,
      branches: [
        ...d.branches,
        { author: d.author || "comunidad", name: "nueva-rama", note: "" },
      ],
    }));
    setEditing(true);
    setTab("versions");
  };

  /* ---------- render ---------- */
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-[clamp(0.5rem,2vw,2rem)] bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex flex-col w-full max-w-5xl max-h-[92vh] rounded-2xl overflow-hidden border shadow-2xl bg-[#0b0d14]/95"
        style={{ borderColor: "rgba(233,196,106,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-black/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-white/5 shrink-0">
              {iconForKind(view.kind)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate text-white font-headline">
                {view.name || "Nuevo diseño"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {view.kind} · {view.author || "—"} · v{view.version || "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onSave && !editing && (
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 hover:bg-white/10 gap-1.5 text-xs cursor-pointer"
                onClick={() => setEditing(true)}
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
            )}
            {editing && (
              <Button
                size="sm"
                className="gap-1.5 text-xs font-semibold cursor-pointer"
                style={{ background: GOLD, color: "#1a1206" }}
                onClick={handleSave}
              >
                <Check className="w-3.5 h-3.5" /> Guardar
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body (scroll) */}
        <div className="flex-1 overflow-y-auto">
          {/* Galería */}
          <div className="relative bg-black/30 border-b border-white/10">
            <div className="relative aspect-[16/7] w-full overflow-hidden flex items-center justify-center">
              {images.length > 0 && !brokenImg[galleryIdx] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[galleryIdx]}
                  alt={view.name}
                  className="w-full h-full object-cover"
                  onError={() =>
                    setBrokenImg((b) => ({ ...b, [galleryIdx]: true }))
                  }
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="w-10 h-10 opacity-40" />
                  <p className="text-xs">Sin vista previa disponible</p>
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setGalleryIdx(
                        (i) => (i - 1 + images.length) % images.length
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white cursor-pointer"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setGalleryIdx((i) => (i + 1) % images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white cursor-pointer"
                    aria-label="Siguiente"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setGalleryIdx(i)}
                        className={cn(
                          "w-2 h-2 rounded-full cursor-pointer transition-colors",
                          i === galleryIdx ? "bg-amber-300" : "bg-white/30"
                        )}
                        aria-label={`Imagen ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Vídeos (con fallback de etiqueta) */}
            {videos.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 border-t border-white/5">
                {videos.map((v, i) => (
                  <video
                    key={i}
                    src={v}
                    controls
                    className="h-24 rounded-lg border border-white/10 bg-black"
                  >
                    <a href={v} target="_blank" rel="noopener noreferrer">
                      <VideoIcon className="w-4 h-4" /> Ver vídeo
                    </a>
                  </video>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-white/10 overflow-x-auto">
            {(
              [
                ["info", "Información"],
                ["reviews", `Reseñas (${view.reviews.length})`],
                ["versions", `Versiones (${view.branches.length})`],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "px-3 py-2 text-xs font-semibold rounded-t-lg cursor-pointer transition-colors whitespace-nowrap",
                  tab === key
                    ? "text-white border-b-2"
                    : "text-muted-foreground hover:text-white"
                )}
                style={tab === key ? { borderColor: GOLD } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "info" && (
              <div className="flex flex-col gap-4">
                {editing ? (
                  <EditForm
                    draft={draft}
                    set={set}
                    setMediaList={setMediaList}
                  />
                ) : (
                  <>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {view.description || "Sin descripción."}
                    </p>

                    {/* Meta grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Meta label="Autor" value={view.author || "—"} />
                      <Meta label="Versión" value={view.version || "—"} />
                      <Meta label="Licencia" value={view.license} gold />
                      <Meta
                        label="Descargas"
                        value={(view.downloads ?? 0).toLocaleString()}
                      />
                    </div>

                    {view.attribution && (
                      <p className="text-[11px] text-muted-foreground italic">
                        {view.attribution}
                      </p>
                    )}

                    {/* Tags */}
                    {view.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {view.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {view.fileRef && (
                      <p className="text-[11px] text-cyan-200/80 font-mono break-all">
                        {view.fileRef}
                      </p>
                    )}

                    {/* Código */}
                    {view.code && (
                      <div className="relative rounded-xl border border-white/10 bg-black/40 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/5">
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Código · integrable
                          </span>
                          <button
                            onClick={handleCopyCode}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-white cursor-pointer"
                          >
                            {copied ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copied ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                        <pre className="p-3 text-[11px] leading-relaxed text-emerald-100/90 overflow-x-auto max-h-72">
                          <code>{view.code}</code>
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "reviews" && (
              <ReviewsTab
                asset={view}
                editing={editing}
                avgStars={avgStars}
                onChange={(reviews) => set("reviews", reviews)}
              />
            )}

            {tab === "versions" && (
              <VersionsTab
                asset={view}
                editing={editing}
                onChange={(branches) => set("branches", branches)}
              />
            )}
          </div>
        </div>

        {/* Footer · acciones */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-white/10 bg-black/40 shrink-0">
          <Button
            size="sm"
            className="gap-1.5 text-xs font-semibold cursor-pointer"
            style={{ background: GOLD, color: "#1a1206" }}
            onClick={handleCopyCode}
            disabled={!view.code}
          >
            <Code2 className="w-3.5 h-3.5" /> Usar / Integrar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
            onClick={handleDownload}
          >
            <Download className="w-3.5 h-3.5" /> Descargar
          </Button>
          {view.externalUrl && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
              onClick={() =>
                window.open(view.externalUrl, "_blank", "noopener")
              }
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir externo
            </Button>
          )}
          {view.repoUrl && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
              onClick={() => window.open(view.repoUrl, "_blank", "noopener")}
            >
              <GitBranch className="w-3.5 h-3.5" /> Repo
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
            onClick={addBranch}
          >
            <GitBranch className="w-3.5 h-3.5" /> Crear rama
          </Button>

          {onDelete && view.userCreated && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-rose-500/30 text-rose-300 hover:bg-rose-500/10 cursor-pointer ml-auto"
              onClick={() => {
                onDelete(view.id);
                onClose();
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------- subcomponentes -------- */
function Meta({
  label,
  value,
  gold,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className="text-sm font-semibold truncate"
        style={{ color: gold ? GOLD : "#e5e7eb" }}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "bg-black/20 border-white/10 text-sm focus-visible:ring-amber-400/40";
const areaCls =
  "w-full rounded-md bg-black/20 border border-white/10 text-sm p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40";

function EditForm({
  draft,
  set,
  setMediaList,
}: {
  draft: DesignAsset;
  set: <K extends keyof DesignAsset>(key: K, value: DesignAsset[K]) => void;
  setMediaList: (kind: "images" | "videos", value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Nombre">
        <Input
          className={inputCls}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Nombre del diseño"
        />
      </Field>
      <Field label="Autor">
        <Input
          className={inputCls}
          value={draft.author}
          onChange={(e) => set("author", e.target.value)}
          placeholder="Tu nombre / @usuario"
        />
      </Field>

      <Field label="Tipo">
        <select
          className={areaCls}
          value={draft.kind}
          onChange={(e) => set("kind", e.target.value as AssetKind)}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k} className="bg-[#0b0d14]">
              {k}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Licencia">
        <select
          className={areaCls}
          value={draft.license}
          onChange={(e) => set("license", e.target.value as AssetLicense)}
        >
          {LICENSE_OPTIONS.map((l) => (
            <option key={l} value={l} className="bg-[#0b0d14]">
              {l}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Versión">
        <Input
          className={inputCls}
          value={draft.version}
          onChange={(e) => set("version", e.target.value)}
          placeholder="1.0.0"
        />
      </Field>
      <Field label="Atribución / nota de licencia">
        <Input
          className={inputCls}
          value={draft.attribution ?? ""}
          onChange={(e) => set("attribution", e.target.value)}
          placeholder="Libre uso · atribución apreciada"
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Descripción">
          <textarea
            className={areaCls}
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="¿Qué es y cómo se integra?"
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field label="Etiquetas (separadas por comas)">
          <Input
            className={inputCls}
            value={draft.tags.join(", ")}
            onChange={(e) =>
              set(
                "tags",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder="background, css, animado"
          />
        </Field>
      </div>

      <Field label="Enlace externo (opcional)">
        <Input
          className={inputCls}
          value={draft.externalUrl ?? ""}
          onChange={(e) => set("externalUrl", e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <Field label="Repo (opcional)">
        <Input
          className={inputCls}
          value={draft.repoUrl ?? ""}
          onChange={(e) => set("repoUrl", e.target.value)}
          placeholder="https://github.com/…"
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Imágenes (una URL por línea)">
          <textarea
            className={areaCls}
            rows={2}
            value={draft.media.images.join("\n")}
            onChange={(e) => setMediaList("images", e.target.value)}
            placeholder="https://…/cover.png"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Vídeos (una URL por línea)">
          <textarea
            className={areaCls}
            rows={2}
            value={draft.media.videos.join("\n")}
            onChange={(e) => setMediaList("videos", e.target.value)}
            placeholder="https://…/demo.mp4"
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field label="Código / recurso integrable">
          <textarea
            className={cn(areaCls, "font-mono text-[12px]")}
            rows={6}
            value={draft.code ?? ""}
            onChange={(e) => set("code", e.target.value)}
            placeholder=":root { --primary: #E9C46A; }"
          />
        </Field>
      </div>
    </div>
  );
}

function ReviewsTab({
  asset,
  editing,
  avgStars,
  onChange,
}: {
  asset: DesignAsset;
  editing: boolean;
  avgStars: number;
  onChange: (reviews: AssetReview[]) => void;
}) {
  const [newReview, setNewReview] = useState<AssetReview>({
    user: "",
    stars: 5,
    text: "",
  });

  const addReview = () => {
    if (!newReview.text.trim()) return;
    onChange([
      ...asset.reviews,
      { ...newReview, user: newReview.user.trim() || "anónimo" },
    ]);
    setNewReview({ user: "", stars: 5, text: "" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold text-white font-headline">
          {avgStars ? avgStars.toFixed(1) : "—"}
        </span>
        <Stars value={avgStars} />
        <span className="text-xs text-muted-foreground">
          {asset.reviews.length} reseñas
        </span>
      </div>

      {asset.reviews.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Aún no hay reseñas. Sé la primera persona en valorar.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {asset.reviews.map((r, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-200">
                {r.user}
              </span>
              <Stars value={r.stars} />
            </div>
            <p className="text-sm text-gray-300">{r.text}</p>
            {editing && (
              <button
                onClick={() =>
                  onChange(asset.reviews.filter((_, idx) => idx !== i))
                }
                className="self-end text-[11px] text-rose-300/80 hover:text-rose-200 cursor-pointer"
              >
                Eliminar
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Añadir reseña (siempre disponible: la comunidad puede valorar) */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-3 flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Añadir reseña
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            className={cn(inputCls, "sm:w-40")}
            value={newReview.user}
            onChange={(e) =>
              setNewReview((r) => ({ ...r, user: e.target.value }))
            }
            placeholder="@usuario"
          />
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setNewReview((r) => ({ ...r, stars: n }))}
                className="cursor-pointer"
                aria-label={`${n} estrellas`}
              >
                <Star
                  className={cn(
                    "w-5 h-5",
                    n <= newReview.stars
                      ? "fill-current text-amber-300"
                      : "text-white/20"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
        <textarea
          className={areaCls}
          rows={2}
          value={newReview.text}
          onChange={(e) =>
            setNewReview((r) => ({ ...r, text: e.target.value }))
          }
          placeholder="Tu opinión…"
        />
        <Button
          size="sm"
          className="self-end gap-1.5 text-xs font-semibold cursor-pointer"
          style={{ background: GOLD, color: "#1a1206" }}
          onClick={addReview}
        >
          <Plus className="w-3.5 h-3.5" /> Publicar
        </Button>
      </div>
    </div>
  );
}

function VersionsTab({
  asset,
  editing,
  onChange,
}: {
  asset: DesignAsset;
  editing: boolean;
  onChange: (branches: AssetBranch[]) => void;
}) {
  const update = (i: number, patch: Partial<AssetBranch>) =>
    onChange(asset.branches.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const addBranch = () =>
    onChange([
      ...asset.branches,
      { author: asset.author || "comunidad", name: "nueva-rama", note: "" },
    ]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Versión del autor y ramas de la comunidad. Cada rama es una adaptación
        libre del recurso original.
      </p>

      <div className="flex flex-col gap-2">
        {asset.branches.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Sin ramas todavía. Crea la primera con “Crear rama”.
          </p>
        )}
        {asset.branches.map((b, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/5 p-3"
          >
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  className={inputCls}
                  value={b.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="nombre de rama"
                />
                <Input
                  className={inputCls}
                  value={b.author}
                  onChange={(e) => update(i, { author: e.target.value })}
                  placeholder="autor"
                />
                <div className="sm:col-span-2">
                  <Input
                    className={inputCls}
                    value={b.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                    placeholder="nota / changelog"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    className={inputCls}
                    value={b.url ?? ""}
                    onChange={(e) => update(i, { url: e.target.value })}
                    placeholder="https://… (opcional)"
                  />
                </div>
                <button
                  onClick={() =>
                    onChange(asset.branches.filter((_, idx) => idx !== i))
                  }
                  className="self-end text-[11px] text-rose-300/80 hover:text-rose-200 cursor-pointer"
                >
                  Eliminar rama
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <GitBranch
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: GOLD }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-200">
                      {b.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      por {b.author}
                    </span>
                  </div>
                  {b.note && (
                    <p className="text-xs text-gray-400">{b.note}</p>
                  )}
                </div>
                {b.url && (
                  <button
                    onClick={() => window.open(b.url, "_blank", "noopener")}
                    className="text-muted-foreground hover:text-white cursor-pointer shrink-0"
                    aria-label="Abrir rama"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="self-start gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
        onClick={addBranch}
      >
        <Plus className="w-3.5 h-3.5" /> Añadir rama
      </Button>
    </div>
  );
}
