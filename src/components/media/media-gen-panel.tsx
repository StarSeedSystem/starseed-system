"use client";

/**
 * <MediaGenPanel /> — "Generación audiovisual · Astraura".
 * ============================================================================
 * Panel Crystal-glass (mismo lenguaje visual que `NvidiaNimPanel` / paneles de
 * `src/components/settings/aurora`) para la HABILIDAD de generación audiovisual
 * de Astraura:
 *
 *   • Generador en vivo: prompt → botón "Generar" → previsualización de la
 *     imagen resultante con el proveedor que respondió de verdad (puede haber
 *     habido failover), y un botón para guardarla en la Biblioteca.
 *   • Configuración: proveedor por defecto por CUENTA (imagen/vídeo/audio) y
 *     por NEURONA (dispositivo) — los selectores se pueblan con
 *     `listMediaProvidersFor()` de `media-gen.ts` — más los campos de token de
 *     Hugging Face, clave de Muapi.ai y endpoints propios (AUTOMATIC1111,
 *     Fooocus-API, ComfyUI, endpoint genérico).
 *   • Guías honestas: por qué Pollinations es el motor por defecto (gratis,
 *     nada que instalar, funciona desde la web), cómo pasar a un servicio
 *     local (más calidad/control) o a uno de pago, y los límites reales de
 *     audio/vídeo (nunca se promete algo que el motor no hace).
 *
 * Usable tanto SUELTO (pasa por defecto el generador + toda la configuración)
 * como EMBEBIDO en la página de Habilidades con `configOnly` (solo la config
 * de la habilidad, sin el generador en vivo — para no duplicar UI si esa
 * pantalla ya tiene su propio botón de "probar").
 *
 * Toda la persistencia vive en `@/ai/astraura/media/media-gen` (localStorage
 * `starseed.media.prefs.v1`); este componente es una vista sobre ese estado.
 * SSR-safe: los valores dependientes de localStorage se hidratan en un
 * `useEffect` (nunca en el render inicial) para no desajustar la hidratación.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Wand2,
  Loader2,
  Sparkles,
  KeyRound,
  Server,
  HelpCircle,
  FolderPlus,
  CheckCircle2,
  XCircle,
  Globe,
  Smartphone,
  Video,
  Volume2,
  Save,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import {
  MEDIA_PREFS_EVENT,
  MEDIA_PREFS_KEY,
  VIDEO_LIMIT_MESSAGE,
  getMediaPrefs,
  setMediaPrefs,
  generateImage,
  listMediaProvidersFor,
  findMediaProvider,
  type MediaKind,
  type MediaProvider,
  type MediaProviderId,
  type MediaPrefs,
  type MediaGenResult,
} from "@/ai/astraura/media/media-gen";
import { saveResource } from "@/lib/library-store";
import { thisDeviceId } from "@/lib/neurons/neurons";

// ── Constantes de la UI ───────────────────────────────────────────────────

const KIND_LABEL: Record<MediaKind, string> = { image: "imagen", video: "vídeo", audio: "audio" };

/** Proveedores que aceptan un endpoint propio en esta habilidad. */
const ENDPOINT_PROVIDER_IDS: MediaProviderId[] = ["automatic1111", "fooocus", "comfyui", "custom-endpoint"];

/** Construye el patch de una neurona con SOLO el tipo de medio indicado (evita escritura indexada genérica). */
function buildNeuronPatch(
  kind: MediaKind,
  id: MediaProviderId | undefined,
): { image?: MediaProviderId; video?: MediaProviderId; audio?: MediaProviderId } {
  if (kind === "image") return { image: id };
  if (kind === "video") return { video: id };
  return { audio: id };
}

// ── Mini-UI: guía desplegable honesta (sin dependencias) ──────────────────

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-primary/90 transition hover:text-primary">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
        {title}
        <span className="ml-auto text-[10px] text-muted-foreground transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}

// ── Mini-UI: insignia de acceso de un proveedor ────────────────────────────

function AccessBadge({ provider }: { provider: MediaProvider }) {
  if (provider.access === "web-free") {
    return (
      <Badge className="border-emerald-400/30 bg-emerald-400/10 px-1.5 text-[8px] text-emerald-300">
        gratis · sin instalar nada
      </Badge>
    );
  }
  if (provider.access === "web-key") {
    return (
      <Badge
        className={cn(
          "px-1.5 text-[8px]",
          provider.id === "muapi"
            ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
            : "border-sky-400/30 bg-sky-400/10 text-sky-300",
        )}
      >
        {provider.id === "muapi" ? "de pago · clave propia" : "clave gratuita"}
      </Badge>
    );
  }
  return (
    <Badge className="border-violet-400/30 bg-violet-400/10 px-1.5 text-[8px] text-violet-300">
      servidor propio
    </Badge>
  );
}

// ── Mini-UI: fila "proveedor por defecto" para un tipo de medio (cuenta) ───

function DefaultProviderRow({
  kind,
  icon,
  label,
  value,
  onChange,
}: {
  kind: MediaKind;
  icon: React.ReactNode;
  label: string;
  value?: MediaProviderId;
  onChange: (id: MediaProviderId) => void;
}) {
  const { available, active } = useMemo(() => listMediaProvidersFor(kind), [kind]);
  const current = value ?? active;
  const provider = findMediaProvider(current);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
        {icon}
        {label}
        {provider && <AccessBadge provider={provider} />}
      </div>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as MediaProviderId)}
        aria-label={`Proveedor por defecto para ${KIND_LABEL[kind]}`}
        className="w-full cursor-pointer rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {provider && <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">{provider.note}</p>}
    </div>
  );
}

// ── Mini-UI: fila "proveedor por neurona" (con opción de heredar) ─────────

function NeuronProviderRow({
  kind,
  icon,
  label,
  neuronId,
  value,
  onChange,
}: {
  kind: MediaKind;
  icon: React.ReactNode;
  label: string;
  neuronId: string;
  value?: MediaProviderId;
  onChange: (id: MediaProviderId | undefined) => void;
}) {
  const { available } = useMemo(() => listMediaProvidersFor(kind), [kind]);
  const disabled = !neuronId.trim();
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
        {icon}
        {label}
      </div>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? (e.target.value as MediaProviderId) : undefined)}
        aria-label={`Proveedor de ${KIND_LABEL[kind]} para esta neurona`}
        className="w-full cursor-pointer rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">— hereda el valor por defecto de la cuenta —</option>
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Panel principal
// ════════════════════════════════════════════════════════════════════════════

export interface MediaGenPanelProps {
  /** Neurona (dispositivo) preseleccionada en el bloque "por neurona". Por defecto: este dispositivo. */
  neuronId?: string;
  /** true = solo el bloque de configuración de la habilidad (sin el generador en vivo). Útil al incrustarlo en Habilidades. */
  configOnly?: boolean;
  className?: string;
}

export default function MediaGenPanel({ neuronId, configOnly = false, className }: MediaGenPanelProps) {
  // ── Generador en vivo ────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [seed, setSeed] = useState("");
  const [genProvider, setGenProvider] = useState<MediaProviderId | "">("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<MediaGenResult | null>(null);

  // ── Preferencias (hidratadas tras montar: SSR-safe) ─────────────────────
  const [prefs, setPrefsState] = useState<MediaPrefs>({ defaultImage: "pollinations" });
  const [neuronTarget, setNeuronTarget] = useState("");
  const [hfTokenDraft, setHfTokenDraft] = useState("");
  const [muapiKeyDraft, setMuapiKeyDraft] = useState("");
  const [endpointDrafts, setEndpointDrafts] = useState<Record<string, string>>({});
  const [savingCreds, setSavingCreds] = useState(false);

  // Hidrata desde localStorage tras el montaje (evita mismatches de hidratación SSR/CSR).
  useEffect(() => {
    const p = getMediaPrefs();
    setPrefsState(p);
    setHfTokenDraft(p.hfToken || "");
    setMuapiKeyDraft(p.muapiKey || "");
    setEndpointDrafts(p.customEndpoints || {});
    setNeuronTarget((neuronId && neuronId.trim()) || thisDeviceId() || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se refresca si otra pestaña/panel cambia las preferencias.
  useEffect(() => {
    const onChange = () => setPrefsState(getMediaPrefs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === MEDIA_PREFS_KEY) onChange();
    };
    window.addEventListener(MEDIA_PREFS_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MEDIA_PREFS_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const { available: imageProviders } = useMemo(
    () => listMediaProvidersFor("image", { neuronId: neuronTarget || undefined }),
    [neuronTarget],
  );

  // ── Acciones: generador ──────────────────────────────────────────────────

  const onGenerate = useCallback(async () => {
    const p = prompt.trim();
    if (!p) {
      toast.error("Escribe qué imagen quieres generar.");
      return;
    }
    setGenerating(true);
    setResult(null);
    const w = width.trim() ? Number(width) : undefined;
    const h = height.trim() ? Number(height) : undefined;
    const s = seed.trim() ? Number(seed) : undefined;
    const res = await generateImage({
      prompt: p,
      width: typeof w === "number" && Number.isFinite(w) ? w : undefined,
      height: typeof h === "number" && Number.isFinite(h) ? h : undefined,
      seed: typeof s === "number" && Number.isFinite(s) ? s : undefined,
      negative: negative.trim() || undefined,
      provider: genProvider || undefined,
      neuronId: neuronTarget.trim() || undefined,
    });
    setGenerating(false);
    setResult(res);
    if (res.ok) {
      toast.success(`Imagen generada con ${findMediaProvider(res.provider)?.label ?? res.provider}.`);
    } else {
      toast.error(res.error || "No se pudo generar la imagen.");
    }
  }, [prompt, width, height, seed, negative, genProvider, neuronTarget]);

  const onSaveToLibrary = useCallback(() => {
    if (!result?.ok || !result.url) return;
    try {
      saveResource({
        kind: "image",
        title: `Imagen: ${prompt.trim().slice(0, 60) || "generada con Aurora"}`,
        url: result.url,
        origin: findMediaProvider(result.provider)?.label ?? result.provider,
      });
      toast.success("Guardada en tu Biblioteca.");
    } catch {
      toast.error("No se pudo guardar en la Biblioteca de este equipo.");
    }
  }, [result, prompt]);

  // ── Acciones: preferencias por defecto (cuenta) ──────────────────────────

  const setDefault = useCallback((kind: MediaKind, id: MediaProviderId) => {
    const patch: Partial<MediaPrefs> =
      kind === "image" ? { defaultImage: id } : kind === "video" ? { defaultVideo: id } : { defaultAudio: id };
    const next = setMediaPrefs(patch);
    setPrefsState(next);
    toast.success(`Proveedor por defecto de ${KIND_LABEL[kind]} actualizado.`);
  }, []);

  // ── Acciones: preferencias por neurona ───────────────────────────────────

  const setNeuronPref = useCallback(
    (kind: MediaKind, id: MediaProviderId | undefined) => {
      const target = neuronTarget.trim();
      if (!target) return;
      const next = setMediaPrefs({ perNeuron: { [target]: buildNeuronPatch(kind, id) } });
      setPrefsState(next);
    },
    [neuronTarget],
  );

  const clearNeuronOverrides = useCallback(() => {
    const target = neuronTarget.trim();
    if (!target) return;
    const next = setMediaPrefs({
      perNeuron: { [target]: { image: undefined, video: undefined, audio: undefined } },
    });
    setPrefsState(next);
    toast.success("Anulaciones de esta neurona eliminadas: vuelve a heredar la cuenta.");
  }, [neuronTarget]);

  const neuronEntry = neuronTarget.trim() ? prefs.perNeuron?.[neuronTarget.trim()] : undefined;
  const hasNeuronOverrides = !!(neuronEntry && (neuronEntry.image || neuronEntry.video || neuronEntry.audio));

  // ── Acciones: credenciales y endpoints propios ───────────────────────────

  const onEndpointChange = (id: string, value: string) => {
    setEndpointDrafts((prev) => ({ ...prev, [id]: value }));
  };

  const onSaveCredentials = useCallback(() => {
    setSavingCreds(true);
    const endpointsPatch: Record<string, string> = {};
    for (const id of ENDPOINT_PROVIDER_IDS) endpointsPatch[id] = endpointDrafts[id] ?? "";
    const next = setMediaPrefs({
      hfToken: hfTokenDraft,
      muapiKey: muapiKeyDraft,
      customEndpoints: endpointsPatch,
    });
    setPrefsState(next);
    setHfTokenDraft(next.hfToken || "");
    setMuapiKeyDraft(next.muapiKey || "");
    setEndpointDrafts(next.customEndpoints || {});
    setSavingCreds(false);
    toast.success("Credenciales y endpoints guardados.");
  }, [hfTokenDraft, muapiKeyDraft, endpointDrafts]);

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl md:p-6", className)}>
      {/* Cabecera */}
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10">
          <Wand2 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Generación audiovisual · Astraura</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Por defecto usa <strong>Pollinations</strong> (gratis, sin instalar nada, desde la propia web) para
            generar imágenes al momento. Puedes cambiar a un servicio <strong>local</strong> (más calidad y control:
            AUTOMATIC1111, Fooocus-API, ComfyUI) o a uno <strong>de pago</strong> con tu propia clave, por cuenta o
            por dispositivo (neurona).
          </p>
        </div>
      </div>

      {/* Generador en vivo (omitible con configOnly) */}
      {!configOnly && (
        <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Generar una imagen</h3>
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe la imagen que quieres generar…"
            aria-label="Prompt de la imagen"
            className="min-h-[70px] text-sm"
          />

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <SlidersHorizontal className="h-3 w-3" />
            {advancedOpen ? "Ocultar opciones avanzadas" : "Opciones avanzadas (tamaño, semilla, negativo, proveedor)"}
          </button>

          {advancedOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="Ancho (px)"
                  inputMode="numeric"
                  aria-label="Ancho en píxeles"
                  className="text-xs"
                />
                <Input
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="Alto (px)"
                  inputMode="numeric"
                  aria-label="Alto en píxeles"
                  className="text-xs"
                />
                <Input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="Semilla (opcional)"
                  inputMode="numeric"
                  aria-label="Semilla"
                  className="text-xs"
                />
              </div>
              <Input
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
                placeholder="Qué evitar en la imagen (prompt negativo, opcional)"
                aria-label="Prompt negativo"
                className="text-xs"
              />
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Proveedor para esta generación</label>
                <select
                  value={genProvider}
                  onChange={(e) => setGenProvider(e.target.value as MediaProviderId | "")}
                  aria-label="Proveedor para esta generación"
                  className="w-full cursor-pointer rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Automático (según tu configuración)</option>
                  {imageProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={onGenerate} disabled={generating} className="cursor-pointer">
              {generating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Generar
            </Button>
            {result?.ok && result.url && (
              <Button size="sm" variant="outline" onClick={onSaveToLibrary} className="cursor-pointer">
                <FolderPlus className="mr-1 h-3.5 w-3.5" />
                Guardar en Biblioteca
              </Button>
            )}
          </div>

          {result && (
            <div
              className={cn(
                "mt-3 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]",
                result.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300",
              )}
            >
              {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              <span>
                {result.ok
                  ? `Generada con ${findMediaProvider(result.provider)?.label ?? result.provider}.`
                  : result.error || "No se pudo generar la imagen."}
              </span>
            </div>
          )}

          {result?.ok && result.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.url}
              alt={prompt || "Imagen generada"}
              className="mt-3 max-h-[420px] w-full rounded-xl border border-white/10 object-contain"
            />
          )}
        </div>
      )}

      {/* Proveedor por defecto (cuenta) */}
      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Proveedor por defecto (tu cuenta)</h3>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <DefaultProviderRow
            kind="image"
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            label="Imagen"
            value={prefs.defaultImage}
            onChange={(id) => setDefault("image", id)}
          />
          <DefaultProviderRow
            kind="video"
            icon={<Video className="h-3.5 w-3.5" />}
            label="Vídeo"
            value={prefs.defaultVideo}
            onChange={(id) => setDefault("video", id)}
          />
          <DefaultProviderRow
            kind="audio"
            icon={<Volume2 className="h-3.5 w-3.5" />}
            label="Audio (voz)"
            value={prefs.defaultAudio}
            onChange={(id) => setDefault("audio", id)}
          />
        </div>
      </div>

      {/* Proveedor por neurona (dispositivo) */}
      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Anular por neurona (dispositivo)</h3>
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
          Útil, por ejemplo, si este equipo tiene un AUTOMATIC1111 propio y prefieres que SOLO esta neurona lo use,
          sin cambiar el valor por defecto de tu cuenta.
        </p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input
            value={neuronTarget}
            onChange={(e) => setNeuronTarget(e.target.value)}
            placeholder="id de la neurona"
            aria-label="Id de la neurona"
            className="max-w-xs flex-1 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNeuronTarget(thisDeviceId())}
            className="cursor-pointer"
          >
            <Smartphone className="mr-1 h-3.5 w-3.5" />
            Usar este dispositivo
          </Button>
          {hasNeuronOverrides && (
            <Button size="sm" variant="ghost" onClick={clearNeuronOverrides} className="cursor-pointer">
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Quitar anulaciones
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <NeuronProviderRow
            kind="image"
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            label="Imagen"
            neuronId={neuronTarget}
            value={neuronEntry?.image}
            onChange={(id) => setNeuronPref("image", id)}
          />
          <NeuronProviderRow
            kind="video"
            icon={<Video className="h-3.5 w-3.5" />}
            label="Vídeo"
            neuronId={neuronTarget}
            value={neuronEntry?.video}
            onChange={(id) => setNeuronPref("video", id)}
          />
          <NeuronProviderRow
            kind="audio"
            icon={<Volume2 className="h-3.5 w-3.5" />}
            label="Audio (voz)"
            neuronId={neuronTarget}
            value={neuronEntry?.audio}
            onChange={(id) => setNeuronPref("audio", id)}
          />
        </div>
      </div>

      {/* Credenciales y endpoints propios */}
      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Claves y endpoints propios</h3>
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
          Nada de esto es obligatorio: Pollinations funciona sin rellenar nada. Rellena solo lo que quieras usar.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Token de Hugging Face (gratuito)</label>
            <Input
              type="password"
              value={hfTokenDraft}
              onChange={(e) => setHfTokenDraft(e.target.value)}
              placeholder="hf_… (se guarda como tu credencial)"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Clave de Muapi.ai (de pago, opcional)</label>
            <Input
              type="password"
              value={muapiKeyDraft}
              onChange={(e) => setMuapiKeyDraft(e.target.value)}
              placeholder="clave de tu cuenta en muapi.ai"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Endpoint AUTOMATIC1111</label>
            <Input
              value={endpointDrafts["automatic1111"] ?? ""}
              onChange={(e) => onEndpointChange("automatic1111", e.target.value)}
              placeholder="http://localhost:7860 (o el de /servicios)"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Endpoint Fooocus-API</label>
            <Input
              value={endpointDrafts["fooocus"] ?? ""}
              onChange={(e) => onEndpointChange("fooocus", e.target.value)}
              placeholder="http://localhost:8888 (o el de /servicios)"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Endpoint ComfyUI</label>
            <Input
              value={endpointDrafts["comfyui"] ?? ""}
              onChange={(e) => onEndpointChange("comfyui", e.target.value)}
              placeholder="http://localhost:8188"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Endpoint propio genérico</label>
            <Input
              value={endpointDrafts["custom-endpoint"] ?? ""}
              onChange={(e) => onEndpointChange("custom-endpoint", e.target.value)}
              placeholder="https://mi-servicio.ejemplo/generar"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="mt-2.5">
          <Button size="sm" onClick={onSaveCredentials} disabled={savingCreds} className="cursor-pointer">
            {savingCreds ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Guardar credenciales y endpoints
          </Button>
        </div>
      </div>

      {/* Guías honestas */}
      <div className="space-y-2">
        <Guide title="¿Por qué Pollinations es el motor por defecto?">
          <p>
            Pollinations.ai responde una imagen con una simple petición GET, sin clave y con CORS habilitado: funciona
            desde cualquier cuenta, desde la web, sin instalar nada. Es la garantía de que la habilidad audiovisual
            SIEMPRE está encendida, para cualquier persona de la red StarSeed, desde el primer minuto.
          </p>
        </Guide>
        <Guide title="¿Cómo cambio a un servicio local (más calidad) o de pago?">
          <p>
            Si tienes AUTOMATIC1111, Fooocus-API o ComfyUI corriendo (en este equipo o en /servicios), pega su
            endpoint arriba y elígelo como proveedor por defecto o solo para esta neurona: más calidad y control
            total. Hugging Face Inference y Muapi.ai son alternativas con clave propia (gratuita o de pago).
          </p>
        </Guide>
        <Guide title="¿Qué pasa con Muapi.ai?">
          <p>
            Investigamos <span className="font-mono">open-generative-ai</span> (el proyecto que agrega varios modelos
            de imagen/vídeo/audio) y resultó ser un frontend sobre Muapi.ai, una pasarela de PAGO — no gratis, no
            integrable "tal cual". Por eso NO es el motor por defecto: se cataloga como opción de pago con tu propia
            clave (bring-your-own-key) para una futura integración; hoy no ejecuta generación real.
          </p>
        </Guide>
        <Guide title="Límites honestos: audio y vídeo">
          <p>
            <strong>Audio:</strong> Pollinations convierte tu texto en voz (síntesis, no música). Es el único motor de
            audio siempre disponible.
          </p>
          <p>
            <strong>Vídeo:</strong> {VIDEO_LIMIT_MESSAGE}
          </p>
        </Guide>
      </div>
    </div>
  );
}
