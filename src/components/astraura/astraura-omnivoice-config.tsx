"use client";

/**
 * AstrauraOmniVoiceConfig — HUB DE SECCIONES de Astraura + OmniVoice (Adenda 133).
 * ============================================================================
 * Reconstrucción del panel único (Adenda 132) en un HUB DE PESTAÑAS internas —
 * usa `@/components/ui/section-tabs` (mismo patrón que `aurora-setup-center.tsx`) —
 * que integra TODO sin duplicar controles:
 *
 *   1. Modelos       → orden de preferencia (4 clases de acceso) + modo Auto/Fijo +
 *                       sugerido para este dispositivo + ámbito CUENTA ⟷ NEURONA +
 *                       «Diagnosticar y reparar» (propio de esta ventana).
 *   2. Neuronas      → `NeuronModelsPanel` embebido (capacidades, recomendación,
 *                       Probar, descargas, servidores por neurona).
 *   3. Integraciones → `IntegrationSourcesPanel` embebido.
 *   4. APIs & modelos→ `AiProvidersPanel` embebido (proveedores, claves, Probar).
 *   5. Voz · OmniVoice → `SetupVoz` (presets + panel completo de voz).
 *   6. Cuenta        → auto-actualización + novedades del catálogo.
 *
 * Los paneles pesados (2-5) se cargan con `next/dynamic({ ssr:false })` y SOLO se
 * montan cuando su pestaña está activa. `variant="modal"/"drawer"` (estrechos)
 * muestran solo Modelos + Cuenta, con un enlace «Configuración completa» hacia
 * el hub entero (`onNavigate("config-ia")` o `/agent?tab=config-ia`).
 *
 * PERSISTE al aplicar:
 *   · `saveModelPreferences({ order, mode })`               → orden de CUENTA.
 *   · `saveNeuronModelPreferences(id, {...})` / `clearNeuronModelPreferences(id)`
 *     → override de ESTA NEURONA (según exista o no; `id = thisDeviceId()`).
 *   · `markUpdatesSeen({ autoUpdate, strategy })` → `strategy` se DERIVA del orden
 *     efectivo (auto→'auto'; top==='local'→'local'; resto→'servidor') para no
 *     romper a quien lea `StartupState.strategy` (el selector explícito de
 *     estrategia se retira: ahora vive fundido en Modelos con el ámbito).
 *
 * `initialSection` abre la pestaña correspondiente (sinónimos: modelos/orden→
 * Modelos, neuronas→Neuronas, integraciones→Integraciones, apis/proveedor→APIs,
 * voz/omnivoice→Voz, cuenta→Cuenta).
 *
 * SSR-safe y defensivo: nunca lanza; sin `window` los helpers devuelven defaults.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Sparkles, Cpu, X, Check, Loader2, Blocks, ExternalLink, RefreshCw, ArrowRight,
  ListOrdered, ChevronUp, ChevronDown, Lock, Key, Gift, Cloud, Globe, Star, HardDrive,
  Boxes, Plug, Puzzle, Rocket, Orbit, Package, Wifi, Network, Zap, Layers, Brain, Server,
  KeyRound, Volume2, UserCog, Stethoscope, User, GitBranch, Trash2, Info, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";
import { detectCapabilities, thisDeviceId, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { classifyDeviceTier } from "@/ai/astraura/model-requirements";
import {
  updateReason, markUpdatesSeen, snoozeUpdates, getStartupState,
  newIntegrationsSince, newModelIdsSince, type StartupStrategy,
} from "@/lib/astraura/startup-updates";
import type { Integration } from "@/lib/integrations/integration-registry";
import {
  MODEL_ACCESS_CLASSES, MODEL_ACCESS_META, getModelPreferences, saveModelPreferences, recommendedOrder,
  getNeuronModelPreferences, saveNeuronModelPreferences, clearNeuronModelPreferences,
  type ModelAccessClass,
} from "@/lib/astraura/model-preferences";

/** Feedback de carga de una sección perezosa. */
function SectionLoading() {
  return (
    <p className="flex items-center justify-center gap-2 px-2 py-10 text-[11px] text-white/40">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
    </p>
  );
}

/* Paneles pesados → SOLO se descargan cuando su pestaña está activa (Adenda 133). */
const NeuronModelsPanel = dynamic(() => import("@/components/neurons/neuron-models-panel"), {
  ssr: false,
  loading: () => <SectionLoading />,
});
const IntegrationSourcesPanel = dynamic(() => import("@/components/integrations/integration-sources-panel"), {
  ssr: false,
  loading: () => <SectionLoading />,
});
const AiProvidersPanel = dynamic(
  () => import("@/components/settings/ai/ai-providers-panel").then((m) => ({ default: m.AiProvidersPanel })),
  { ssr: false, loading: () => <SectionLoading /> },
);
const SetupVoz = dynamic(() => import("@/components/aurora/setup/setup-voz"), {
  ssr: false,
  loading: () => <SectionLoading />,
});

export interface AstrauraOmniVoiceConfigProps {
  /** Presentación: tarjeta de modal, incrustado en pestaña, o cuerpo de Sheet lateral. */
  variant?: "modal" | "embedded" | "drawer";
  /** Navegación por callback a las pestañas de /agent (evita el bug del query param). */
  onNavigate?: (tab: string) => void;
  /** Se llama tras aplicar/guardar (además de persistir internamente). */
  onApply?: () => void;
  /** Se llama al descartar/cerrar (X, «Recordar luego», o al navegar). */
  onDismiss?: () => void;
  /** Sección a abrir (p.ej. "modelos", "voz", "cuenta"; admite sinónimos). */
  initialSection?: string;
  /** Reduce paddings/tipografía (pensado para el drawer). */
  compact?: boolean;
}

/** Identificador de cada pestaña del hub. */
export type SetupSection = "modelos" | "neuronas" | "integraciones" | "apis" | "voz" | "cuenta";

const ALL_SECTIONS: SetupSection[] = ["modelos", "neuronas", "integraciones", "apis", "voz", "cuenta"];
/** `variant="modal"/"drawer"` (estrechos): solo lo esencial, sin cargar paneles enormes. */
const NARROW_SECTIONS: SetupSection[] = ["modelos", "cuenta"];

const SECTION_META: Record<SetupSection, { label: string; icon: LucideIcon }> = {
  modelos: { label: "Modelos", icon: ListOrdered },
  neuronas: { label: "Neuronas", icon: Cpu },
  integraciones: { label: "Integraciones", icon: Blocks },
  apis: { label: "APIs & modelos", icon: KeyRound },
  voz: { label: "Voz · OmniVoice", icon: Volume2 },
  cuenta: { label: "Cuenta", icon: UserCog },
};

/** Normaliza una sección pedida (con sinónimos) al id de pestaña interno. */
function sectionFromSynonym(section?: string): SetupSection | null {
  if (!section) return null;
  const s = section.toLowerCase().trim();
  if (!s) return null;
  if ((ALL_SECTIONS as string[]).includes(s)) return s as SetupSection;
  const map: Record<string, SetupSection> = {
    orden: "modelos", preferencia: "modelos", preferencias: "modelos", modelo: "modelos",
    neurona: "neuronas", dispositivo: "neuronas", capacidades: "neuronas", hardware: "neuronas", entorno: "neuronas",
    integracion: "integraciones", "integración": "integraciones", fuentes: "integraciones", fuente: "integraciones",
    api: "apis", proveedor: "apis", proveedores: "apis",
    omnivoice: "voz", "omni-voice": "voz",
    "auto-actualizacion": "cuenta", "auto-actualización": "cuenta", novedades: "cuenta", estrategia: "cuenta",
  };
  return map[s] ?? null;
}

// Modo del orden de preferencia de modelos: reordenación inteligente vs. orden fijo.
const MODE_OPTS: { value: "auto" | "fixed"; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "auto", label: "Automático", hint: "el sistema puede reordenar según el dispositivo y el entorno (offline/gama)", icon: <Sparkles className="mr-1 inline h-3 w-3" /> },
  { value: "fixed", label: "Fijo", hint: "respeta exactamente tu orden en todas las neuronas y entornos", icon: <Lock className="mr-1 inline h-3 w-3" /> },
];

/** Estilo compartido de píldora (modo, ámbito): activa vs. inactiva. */
function pillCls(active: boolean): string {
  return cn(
    "cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    active ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25",
  );
}

// MODEL_ACCESS_META da el icono como nombre lucide (string); lo resolvemos de forma
// defensiva a un componente, con respaldo por clase si el nombre no se reconoce.
const ICON_BY_NAME: Record<string, LucideIcon> = {
  cpu: Cpu, harddrive: HardDrive, brain: Brain, layers: Layers,
  sparkles: Sparkles, star: Star, orbit: Orbit, rocket: Rocket,
  gift: Gift, cloud: Cloud, globe: Globe, zap: Zap, wifi: Wifi,
  server: Server, blocks: Blocks, boxes: Boxes, plug: Plug, puzzle: Puzzle, package: Package, network: Network,
  key: Key,
};
const ACCESS_FALLBACK_ICON: Record<ModelAccessClass, LucideIcon> = {
  local: Cpu, starseed: Sparkles, "api-free": Gift, "api-external": Blocks,
};
function accessIcon(cls: ModelAccessClass, name?: string): LucideIcon {
  const key = (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ICON_BY_NAME[key] ?? ACCESS_FALLBACK_ICON[cls] ?? Blocks;
}
function orderLabels(order: ModelAccessClass[]): string {
  return order.map((c) => MODEL_ACCESS_META[c]?.label ?? c).join(" → ");
}

/** Reset de apariencia para enlaces INLINE (para que <button> se vea como texto). */
const INLINE_RESET = "inline cursor-pointer border-0 bg-transparent p-0 align-baseline [font:inherit]";

export function AstrauraOmniVoiceConfig({
  variant = "modal",
  onNavigate,
  onApply,
  onDismiss,
  initialSection,
  compact = false,
}: AstrauraOmniVoiceConfigProps) {
  const availableSections = variant === "embedded" ? ALL_SECTIONS : NARROW_SECTIONS;

  const [section, setSection] = useState<SetupSection>(() => sectionFromSynonym(initialSection) ?? "modelos");
  useEffect(() => {
    const s = sectionFromSynonym(initialSection);
    if (s) setSection(s);
    // Solo reacciona a cambios explícitos de `initialSection` (petición del llamador).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);
  const currentSection: SetupSection = availableSections.includes(section) ? section : availableSections[0];

  const [reason, setReason] = useState<"primera-vez" | "novedades" | "al-dia">("primera-vez");
  const [newSources, setNewSources] = useState<Integration[]>([]);
  const [newModels, setNewModels] = useState<number>(0);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [saved, setSaved] = useState(false);

  // ── Orden de preferencia de modelos: ámbito CUENTA + NEURONA (Adenda 133) ───
  const [scope, setScope] = useState<"cuenta" | "neurona">("cuenta");
  const [deviceId] = useState<string>(() => { try { return thisDeviceId(); } catch { return ""; } });

  const [accountOrder, setAccountOrder] = useState<ModelAccessClass[]>(() => {
    try { const o = getModelPreferences().order; return Array.isArray(o) && o.length ? [...o] : [...MODEL_ACCESS_CLASSES]; } catch { return [...MODEL_ACCESS_CLASSES]; }
  });
  const [accountMode, setAccountMode] = useState<"auto" | "fixed">(() => {
    try { return getModelPreferences().mode === "fixed" ? "fixed" : "auto"; } catch { return "auto"; }
  });
  /** `true` si esta neurona tiene un override propio guardado (si no, hereda de la cuenta). */
  const [hasNeuronOverride, setHasNeuronOverride] = useState(false);
  /** Evita persistir/limpiar `perNeuron` antes de saber si YA había un override guardado. */
  const [neuronPrefsLoaded, setNeuronPrefsLoaded] = useState(false);
  const [neuronOrder, setNeuronOrder] = useState<ModelAccessClass[]>(() => [...accountOrder]);
  const [neuronMode, setNeuronMode] = useState<"auto" | "fixed">(accountMode);

  const [caps, setCaps] = useState<NeuronCapabilities | null>(null);
  const [suggestedOrder, setSuggestedOrder] = useState<ModelAccessClass[] | null>(null);
  const [diag, setDiag] = useState<{ state: "idle" | "run" | "done"; gpu?: boolean; mismatch?: boolean; msg?: string }>({ state: "idle" });

  // Carga inicial: estado persistido + detección de capacidades (para el sugerido).
  useEffect(() => {
    const st = getStartupState();
    setAutoUpdate(st.autoUpdate !== false);
    setReason(updateReason());
    setNewSources(newIntegrationsSince().slice(0, 8));
    setNewModels(newModelIdsSince().length);
    let alive = true;
    void (async () => {
      try {
        const c = await detectCapabilities();
        if (!alive) return;
        setCaps(c);
      } catch { /* detección best-effort */ }
    })();
    return () => { alive = false; };
  }, []);

  // Preferencia de ESTA neurona: ¿override propio guardado, o hereda de la cuenta?
  // Solo al disponer de `deviceId` (una vez, al montar): no debe pisar ediciones en curso.
  useEffect(() => {
    if (!deviceId) { setNeuronPrefsLoaded(true); return; }
    try {
      const np = getNeuronModelPreferences(deviceId);
      if (np) {
        setHasNeuronOverride(true);
        setNeuronOrder([...np.order]);
        setNeuronMode(np.mode);
      } else {
        setHasNeuronOverride(false);
        setNeuronOrder([...accountOrder]);
        setNeuronMode(accountMode);
      }
    } catch { /* */ }
    setNeuronPrefsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  // Mientras la neurona HEREDA de la cuenta (sin override propio), refleja EN VIVO los
  // cambios del orden de cuenta en la lista "heredada" mostrada (rev. adversarial A133).
  useEffect(() => {
    if (hasNeuronOverride) return;
    setNeuronOrder([...accountOrder]);
    setNeuronMode(accountMode);
  }, [accountOrder, accountMode, hasNeuronOverride]);

  // Orden sugerido según hardware/entorno (siembra inicial; «Diagnosticar y reparar» lo refresca).
  useEffect(() => {
    if (!caps) return;
    try {
      const tier = classifyDeviceTier(caps);
      const hasLocal = !!(caps.ollama || caps.lmstudio || caps.chromeAi || caps.webgpu);
      let online = true;
      try { online = typeof navigator === "undefined" || navigator.onLine !== false; } catch { /* */ }
      const sug = recommendedOrder({ tier, online, hasLocal });
      setSuggestedOrder(Array.isArray(sug) && sug.length ? sug : null);
    } catch { setSuggestedOrder(null); }
  }, [caps]);

  // Feedback transitorio «Guardado» (variante embedded).
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  // ── Edición del orden ACTIVO (según el ámbito Cuenta/Neurona) ────────────────
  const activeOrder = scope === "cuenta" ? accountOrder : neuronOrder;
  const activeMode = scope === "cuenta" ? accountMode : neuronMode;
  /** En ámbito Neurona sin override propio, la lista se muestra (heredada) pero no se edita hasta crear uno. */
  const editingDisabled = scope === "neurona" && !hasNeuronOverride;

  const setActiveOrder = useCallback(
    (updater: (prev: ModelAccessClass[]) => ModelAccessClass[]) => {
      if (scope === "cuenta") setAccountOrder(updater);
      else setNeuronOrder(updater);
    },
    [scope],
  );

  const moveAccess = (idx: number, dir: -1 | 1) => {
    if (editingDisabled) return;
    setActiveOrder((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const setMode = (m: "auto" | "fixed") => {
    if (editingDisabled) return;
    if (scope === "cuenta") setAccountMode(m); else setNeuronMode(m);
  };
  const useSuggested = () => {
    if (!suggestedOrder || !suggestedOrder.length) return;
    if (scope === "neurona" && !hasNeuronOverride) setHasNeuronOverride(true);
    const sug = suggestedOrder;
    setActiveOrder(() => [...sug]);
  };
  const createNeuronOverride = () => {
    setNeuronOrder([...accountOrder]);
    setNeuronMode(accountMode);
    setHasNeuronOverride(true);
  };
  const removeNeuronOverride = () => {
    setHasNeuronOverride(false);
    setNeuronOrder([...accountOrder]);
    setNeuronMode(accountMode);
  };

  // ── Diagnosticar y reparar: reutiliza la prueba online+WebGPU y ofrece el
  //    sugerido si el orden activo no encaja con el hardware/online detectados.
  //    No reimplementa el router: usa `classifyDeviceTier`/`recommendedOrder` ya
  //    existentes, exactamente como el sugerido inicial.
  const diagnoseAndRepair = async () => {
    setDiag({ state: "run" });
    let online = true;
    let gpu = false;
    try { online = typeof navigator === "undefined" || navigator.onLine !== false; } catch { /* */ }
    try {
      const g = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
      gpu = !!(g && (await g.requestAdapter?.()));
    } catch { /* */ }
    let sug: ModelAccessClass[] | null = suggestedOrder;
    try {
      if (caps) {
        const tier = classifyDeviceTier(caps);
        const hasLocal = !!(caps.ollama || caps.lmstudio || caps.chromeAi || gpu);
        sug = recommendedOrder({ tier, online, hasLocal });
        setSuggestedOrder(sug);
      }
    } catch { /* */ }
    const mismatch = Boolean(sug && sug.length > 0 && sug[0] !== activeOrder[0]);
    const parts = [online ? "conexión OK" : "sin conexión", gpu ? "WebGPU listo" : "sin WebGPU (usa servidor)"];
    setDiag({ state: "done", gpu, mismatch, msg: parts.join(" · ") });
  };

  // ── Persistencia ─────────────────────────────────────────────────────────────
  // Cuenta SIEMPRE se guarda; el override de neurona se guarda o se limpia según
  // `hasNeuronOverride` (solo si ya sabemos su estado real: `neuronPrefsLoaded`).
  const persist = useCallback(() => {
    const effOrder = hasNeuronOverride ? neuronOrder : accountOrder;
    const effMode = hasNeuronOverride ? neuronMode : accountMode;
    const strategy: StartupStrategy = effMode !== "fixed" ? "auto" : effOrder[0] === "local" ? "local" : "servidor";
    try { markUpdatesSeen({ autoUpdate, strategy }); } catch { /* nunca lanza */ }
    try { saveModelPreferences({ order: accountOrder, mode: accountMode }); } catch { /* módulo aún no disponible: no bloquea */ }
    try {
      if (neuronPrefsLoaded && deviceId) {
        if (hasNeuronOverride) saveNeuronModelPreferences(deviceId, { order: neuronOrder, mode: neuronMode });
        else clearNeuronModelPreferences(deviceId);
      }
    } catch { /* */ }
  }, [autoUpdate, accountOrder, accountMode, hasNeuronOverride, neuronOrder, neuronMode, deviceId, neuronPrefsLoaded]);

  const handleApply = () => {
    persist();
    onApply?.();
    // En modal cierra `onApply`; en drawer cerramos con `onDismiss`; en embedded
    // no hay cierre (se queda en la pestaña) y mostramos feedback.
    if (variant === "drawer") onDismiss?.();
    setSaved(true);
  };
  const handleLater = () => { try { snoozeUpdates(); } catch { /* */ } onDismiss?.(); };

  const title = reason === "primera-vez" ? "Configura Astraura y OmniVoice" : reason === "novedades" ? "Novedades disponibles" : "Astraura al día";
  const subtitle = reason === "primera-vez"
    ? "Bienvenida a esta neurona. Estas son las selecciones automáticas según su hardware — todo ajustable luego."
    : reason === "novedades"
      ? "Hay nuevos modelos o fuentes disponibles. Revisa la selección recomendada para esta neurona."
      : "Todo actualizado. Puedes revisar la configuración recomendada.";

  // «Configuración completa»: por callback (dentro de /agent) o navegación de respaldo.
  const goFull = () => { onNavigate?.("config-ia"); onDismiss?.(); };

  // Enlace cruzado entre secciones: pestaña LOCAL si está disponible en esta
  // variante (in-situ, sin salir del hub); si no, cae a «Configuración completa».
  const crossLink = (target: SetupSection, label: string, className: string) => {
    if (availableSections.includes(target)) {
      return <button type="button" onClick={() => setSection(target)} className={cn(INLINE_RESET, className)}>{label}</button>;
    }
    if (onNavigate) {
      return <button type="button" onClick={goFull} className={cn(INLINE_RESET, className)}>{label}</button>;
    }
    return <Link href="/agent?tab=config-ia" onClick={() => onDismiss?.()} className={className}>{label}</Link>;
  };

  const savedNote = variant === "modal"
    ? "Se guarda al pulsar «Aplicar y continuar»."
    : variant === "drawer"
      ? "Se guarda al pulsar «Aplicar»."
      : "Se guarda al pulsar «Guardar».";

  const headerPad = compact ? "px-3 py-2.5" : "px-4 py-3";
  const bodyPad = compact ? "px-3 py-2.5" : "px-4 py-3";
  const bodySpace = compact ? "space-y-2.5" : "space-y-3";
  const footerPad = compact ? "px-3 py-2" : "px-4 py-2.5";
  const scrollBody = variant === "embedded" ? "" : "flex-1 overflow-y-auto";

  const outerClass =
    variant === "modal"
      ? "flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12] text-white shadow-2xl"
      : variant === "drawer"
        ? "flex h-full w-full flex-col overflow-hidden bg-[#0b0d12] text-white"
        : "flex w-full flex-col text-white";

  const tabItems: SectionTabItem[] = availableSections.map((s) => ({
    value: s,
    label: SECTION_META[s].label,
    icon: SECTION_META[s].icon,
    badge: s === "cuenta" && newSources.length + newModels > 0 ? newSources.length + newModels : undefined,
  }));

  const tabsRow = (
    <div className="mt-3 min-w-0">
      <SectionTabs
        items={tabItems}
        value={currentSection}
        onValueChange={(v) => setSection(v as SetupSection)}
        ariaLabel="Secciones de configuración de Astraura y OmniVoice"
        size="sm"
      />
    </div>
  );

  return (
    <div className={outerClass}>
      {/* Cabecera (modal/drawer con degradado; embedded sobria; X solo en modal) */}
      {variant === "embedded" ? (
        <div className={cn("border-b border-white/10", headerPad)}>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-white/95"><Sparkles className="h-4 w-4 text-cyan-300" /> {title}</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-white/55">{subtitle}</p>
          {tabsRow}
        </div>
      ) : (
        <div className={cn("border-b border-white/10 bg-gradient-to-br from-cyan-500/[0.1] to-transparent", headerPad)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-6">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-white/95"><Sparkles className="h-4 w-4 text-cyan-300" /> {title}</h2>
              <p className="mt-0.5 text-[11px] leading-snug text-white/55">{subtitle}</p>
            </div>
            {variant === "modal" && (
              <button type="button" onClick={handleLater} title="Recordar luego" className="cursor-pointer rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {tabsRow}
          <div className="mt-2 flex justify-end">
            {onNavigate ? (
              <button type="button" onClick={goFull} className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-cyan-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-cyan-200">
                Configuración completa <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <Link href="/agent?tab=config-ia" onClick={() => onDismiss?.()} className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-cyan-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-cyan-200">
                Configuración completa <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Cuerpo: SOLO la sección activa (los paneles pesados llegan por next/dynamic) */}
      <div className={cn(scrollBody, bodyPad, bodySpace)}>
        {currentSection === "modelos" && (
          <div className="scroll-mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
                <ListOrdered className="h-3.5 w-3.5 text-cyan-300" /> Orden de preferencia de modelos IA
              </p>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setScope("cuenta")} className={pillCls(scope === "cuenta")}>
                  <User className="mr-1 inline h-3 w-3" /> Cuenta
                </button>
                <button type="button" onClick={() => setScope("neurona")} className={pillCls(scope === "neurona")}>
                  <Cpu className="mr-1 inline h-3 w-3" /> Esta neurona
                  {hasNeuronOverride && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />}
                </button>
              </div>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-white/45">
              Prioridad con que Astraura intenta cada tipo de motor. En «Automático» puede reordenar según el dispositivo y el entorno; en «Fijo» respeta tu orden exacto.
              {scope === "cuenta" ? " Se aplica a toda neurona sin ajuste propio." : " Solo para esta neurona."}
            </p>

            {/* Estado del ámbito Neurona: hereda de la cuenta, o tiene ajuste propio */}
            {scope === "neurona" && (
              <div className={cn(
                "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-[10px] leading-snug",
                hasNeuronOverride ? "border-violet-400/25 bg-violet-500/[0.06] text-violet-100/80" : "border-white/10 bg-white/[0.04] text-white/50",
              )}>
                {hasNeuronOverride ? (
                  <>
                    <span className="inline-flex items-center gap-1 font-semibold text-violet-200"><GitBranch className="h-3 w-3" /> Ajuste propio de esta neurona</span>
                    <span>· solo aplica en este dispositivo.</span>
                    <button type="button" onClick={removeNeuronOverride} className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:border-rose-400/40 hover:text-rose-200">
                      <Trash2 className="h-3 w-3" /> Quitar (volver a heredar)
                    </button>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1"><Info className="h-3 w-3" /> Esta neurona hereda el orden de la cuenta.</span>
                    <button type="button" onClick={createNeuronOverride} className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200 transition-colors hover:bg-violet-500/20">
                      <GitBranch className="h-3 w-3" /> Crear ajuste propio
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Diagnosticar y reparar */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={diagnoseAndRepair} disabled={diag.state === "run"} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50">
                {diag.state === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />} Diagnosticar y reparar
              </button>
              {diag.state === "done" && (
                <span className={cn("inline-flex flex-wrap items-center gap-1 text-[10px]", diag.mismatch ? "text-amber-300/85" : "text-emerald-300/80")}>
                  {diag.mismatch ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Check className="h-3 w-3 shrink-0" />} {diag.msg}
                  {diag.mismatch && (
                    <>
                      {" "}· no coincide con lo recomendado.{" "}
                      <button type="button" onClick={useSuggested} className={cn(INLINE_RESET, "font-semibold text-amber-200 underline decoration-dotted underline-offset-2 hover:text-amber-100")}>
                        Usar sugerido
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>

            {/* Modo Automático / Fijo */}
            <div className={cn("mt-2.5 flex flex-wrap gap-1.5", editingDisabled && "pointer-events-none opacity-50")}>
              {MODE_OPTS.map((m) => (
                <button key={m.value} type="button" title={m.hint} disabled={editingDisabled} onClick={() => setMode(m.value)} className={pillCls(activeMode === m.value)}>
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-white/45">{MODE_OPTS.find((m) => m.value === activeMode)?.hint}</p>

            {/* Lista reordenable de clases de acceso */}
            <ol className={cn("mt-2 space-y-1.5", editingDisabled && "opacity-60")}>
              {activeOrder.map((cls, idx) => {
                const meta = MODEL_ACCESS_META[cls];
                const Icon = accessIcon(cls, meta?.icon);
                return (
                  <li key={cls} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-500/10 text-[10px] font-bold text-cyan-200">{idx + 1}</span>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-white/70" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium text-white/90">{meta?.label ?? cls}</span>
                      {meta?.hint && <span className="block truncate text-[10px] text-white/45">{meta.hint}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button type="button" aria-label={`Subir ${meta?.label ?? cls}`} disabled={editingDisabled || idx === 0} onClick={() => moveAccess(idx, -1)}
                        className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] p-1 text-white/60 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-white/60">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label={`Bajar ${meta?.label ?? cls}`} disabled={editingDisabled || idx === activeOrder.length - 1} onClick={() => moveAccess(idx, 1)}
                        className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] p-1 text-white/60 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-white/60">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* Sugerido para este dispositivo */}
            {suggestedOrder && (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] px-2.5 py-1.5">
                <p className="min-w-0 flex-1 text-[10px] leading-snug text-white/60"><span className="font-semibold text-cyan-200">Sugerido para este dispositivo:</span> {orderLabels(suggestedOrder)}</p>
                <button type="button" onClick={useSuggested} className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25">
                  <Sparkles className="h-3 w-3" /> Usar sugerido
                </button>
              </div>
            )}

            {/* Auto-actualización de catálogos + enlaces in-situ a Neuronas/Integraciones */}
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-white/40">
              <RefreshCw className="mt-px h-3 w-3 shrink-0 text-white/30" />
              <span>Los catálogos se auto-actualizan: OpenRouter (:free) cada 4 h y HuggingBay. Ajusta modelos propios y descargas por{" "}
                {crossLink("neuronas", "neurona", "text-cyan-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-cyan-200")}, o las{" "}
                {crossLink("integraciones", "fuentes externas", "text-fuchsia-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-fuchsia-200")}.
              </span>
            </p>
            <p className="mt-1 text-[10px] text-white/35">{savedNote}</p>
          </div>
        )}

        {currentSection === "neuronas" && <NeuronModelsPanel embedded />}
        {currentSection === "integraciones" && <IntegrationSourcesPanel embedded />}
        {currentSection === "apis" && <AiProvidersPanel embedded />}
        {currentSection === "voz" && <SetupVoz />}

        {currentSection === "cuenta" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-white/90">Actualización automática</span>
                  <span className="block text-[10px] leading-snug text-white/45">Aplica por defecto las mejores opciones cuando haya modelos o fuentes nuevos.</span>
                </span>
                <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
              </label>
            </div>

            {(newSources.length > 0 || newModels > 0) && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85"><RefreshCw className="h-3.5 w-3.5 text-emerald-300" /> Novedades desde tu última visita</p>
                {newModels > 0 && <p className="mt-1 text-[10px] text-white/55">{newModels} modelo(s) nuevo(s) de LLM/voz disponibles.</p>}
                {newSources.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {newSources.map((i) => (
                      <a key={i.id} href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/70 hover:border-cyan-400/40 hover:text-cyan-200">
                        {i.name} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="px-0.5 text-[10px] leading-snug text-white/35">{savedNote}</p>
          </div>
        )}
      </div>

      {/* Pie por variante */}
      {variant === "modal" && (
        <div className={cn("flex items-center justify-end gap-2 border-t border-white/10 bg-black/30", footerPad)}>
          <button type="button" onClick={handleLater} className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25">
            Recordar luego
          </button>
          <button type="button" onClick={handleApply} className="cursor-pointer rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-[12px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30">
            Aplicar y continuar
          </button>
        </div>
      )}
      {variant === "drawer" && (
        <div className={cn("flex items-center justify-end gap-2 border-t border-white/10 bg-black/30", footerPad)}>
          <button type="button" onClick={() => onDismiss?.()} className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25">
            Cerrar
          </button>
          <button type="button" onClick={handleApply} className="cursor-pointer rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-[12px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30">
            Aplicar
          </button>
        </div>
      )}
      {variant === "embedded" && (
        <div className={cn("flex items-center gap-2 border-t border-white/10", bodyPad)}>
          <button type="button" onClick={handleApply} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-[12px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30">
            <Check className="h-3.5 w-3.5" /> Guardar
          </button>
          {saved && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300/90"><Check className="h-3.5 w-3.5" /> Guardado</span>}
        </div>
      )}
    </div>
  );
}

export default AstrauraOmniVoiceConfig;
