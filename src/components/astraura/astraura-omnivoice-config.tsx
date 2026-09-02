"use client";

/**
 * AstrauraOmniVoiceConfig — «CONFIGURACIÓN/ACTUALIZACIÓN DE SISTEMAS DE ASTRAURA
 * EN ESTA NEURONA» (Adenda 149 · antes Adendas 111/132/133/138).
 * ============================================================================
 * SOP: `architecture/astraura-config-sistemas-neurona.md`.
 *
 * Centro de sistemas por NEURONA × PERSONALIDAD. La barra superior pasa de
 * «Modelos · Cuenta» a CINCO pestañas de sistemas (todas con selector de
 * personalidad — Aurora, Hermione y las del usuario — y procedencia visible):
 *
 *   1. LLM       → modelo de lenguaje usado por cada personalidad en esta
 *                  neurona (pin fuente/modelo + scout de la Adenda 138).
 *   2. Astraura  → el sistema que decide: orden de preferencia de clases
 *                  CUENTA⟷NEURONA (UI de la A133 íntegra), modo Auto/Fijo,
 *                  permitir pago, auto-actualización, novedades clasificadas
 *                  y «Diagnosticar y reparar».
 *   3. OmniVoice → SISTEMA de voz de Astraura: motor por personalidad (OpenVoice
 *                  es uno de ellos) + vía de la neurona
 *                  (nube⟷local) + coherencia de persona (A112).
 *   4. Cerebro   → memorias por personalidad, cerebros permitidos, almacén
 *                  local⟷servidores y sync de cerebros con esta neurona.
 *   5. Señales   → antenas del dispositivo con entrada/salida y ruta por
 *                  antena (política sináptica A99).
 *
 * La variante `embedded` (hub de /agent · pestaña Configuración IA) añade las
 * pestañas Neuronas · Integraciones · APIs de la Adenda 133. `variant=
 * "modal"/"drawer"` muestran SOLO los 5 sistemas (paneles pesados por
 * next/dynamic, solo al activar su pestaña).
 *
 * TÍTULO DINÁMICO según contexto (`classifyUpdates` + `windowHeading`):
 * neurona nueva · actualización de sistemas en uso · recomendaciones
 * detectadas automáticamente · todo al día.
 *
 * PERSISTE al aplicar (sin cambios de contrato): `saveModelPreferences`,
 * `saveNeuronModelPreferences`/`clearNeuronModelPreferences` y
 * `markUpdatesSeen({ autoUpdate, strategy })`. Los overrides por personalidad
 * se guardan AL EDITAR (capa `neuron-persona-systems`, clave
 * `starseed.astraura.neuron-persona.v1`).
 *
 * `initialSection` admite los sinónimos históricos (modelos/orden/cuenta→
 * astraura, voz/omnivoice→openvoice…): los deep-links viejos siguen vivos.
 *
 * SSR-safe y defensivo: nunca lanza; sin `window` los helpers devuelven defaults.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles, Cpu, X, Check, Loader2, Blocks, ExternalLink, RefreshCw, ArrowRight,
  ListOrdered, ChevronUp, ChevronDown, Lock, Key, Gift, Cloud, Globe, Star, HardDrive,
  Boxes, Plug, Puzzle, Rocket, Orbit, Package, Wifi, Network, Zap, Layers, Brain, Server,
  KeyRound, Volume2, UserCog, Stethoscope, User, GitBranch, Trash2, Info, AlertTriangle,
  Bot, RadioTower, BellRing, Compass, Columns3, Copy, Download, Upload, Undo2, Waves,
  ChevronLeft, ChevronRight, Wand2, SlidersHorizontal,
  type LucideIcon, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { SectionTabs, type SectionTabItem, type SectionTabAccent } from "@/components/ui/section-tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { detectCapabilities, thisDeviceId, listNeurons, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { classifyDeviceTier, type ModelSpec } from "@/ai/astraura/model-requirements";
import {
  markUpdatesSeen, snoozeUpdates, getStartupState,
  newIntegrationsSince, newModelIdsSince, type StartupStrategy,
} from "@/lib/astraura/startup-updates";
import type { Integration } from "@/lib/integrations/integration-registry";
import {
  MODEL_ACCESS_CLASSES, MODEL_ACCESS_META, getModelPreferences, saveModelPreferences, recommendedOrder,
  getNeuronModelPreferences, saveNeuronModelPreferences, clearNeuronModelPreferences,
  type ModelAccessClass,
} from "@/lib/astraura/model-preferences";
import {
  ALL_PERSONAS, classifyUpdates, windowHeading, getRawOverrides, subscribeNeuronPersona,
  clearOverrides, personaChips, resonanceScore, SYSTEM_KEYS,
  type ClassifiedUpdates, type PersonaNeuronOverrides, type UpdateMode,
  type ResonanceResult, type SystemKey,
} from "@/lib/astraura/neuron-persona-systems";
// Funciones de ÁMBITO NEURONA (snapshot/diff/copia/archivo): viven en el núcleo
// del store (A149 · ola 2/3) y aún no se re-exportan por la capa alta.
import {
  getRawDevice, replaceDeviceOverrides, clearDeviceOverrides, diffOverrides,
  listConfiguredDevices, copyOverrides, exportNeuronPersonaJson, importNeuronPersonaJson,
  type OverrideDiff,
} from "@/lib/astraura/neuron-persona-store";
import {
  PersonaSelector, LlmSection, OpenVoiceSection, CerebroSection, SenalesSection, AstrauraPersonaCard,
} from "@/components/astraura/persona-system-sections";
// (Adenda 179) Control EXPLÍCITO y configurable del motor primario de la neurona
// (Astraura 1.58b local marcado por defecto) reutilizando el editor ya probado.
import { PrimaryChoiceEditor } from "@/components/astraura/primary-choice-editor";
import { AgentesFondoSection } from "@/components/astraura/agentes-fondo-section";
import { InteligenciaSection } from "@/components/astraura/inteligencia-section";
import { useNarracionVentana } from "@/lib/aurora/narracion-ventana";
import { PersonaConstellation } from "@/components/astraura/persona-constellation";

/** Feedback de carga de una sección perezosa. */
function SectionLoading() {
  return (
    <p className="flex items-center justify-center gap-2 px-2 py-10 text-[11px] text-[var(--aw-text)]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
    </p>
  );
}

/* Paneles pesados del hub → SOLO se descargan cuando su pestaña está activa. */
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
/* Comparador de personalidades: solo se descarga al pulsar «Comparar». */
const PersonaCompareTable = dynamic(
  () => import("@/components/astraura/persona-compare-table").then((m) => ({ default: m.PersonaCompareTable })),
  { ssr: false, loading: () => <SectionLoading /> },
);

export interface AstrauraOmniVoiceConfigProps {
  /** Presentación: tarjeta de modal, incrustado en pestaña, o cuerpo de Sheet lateral. */
  variant?: "modal" | "embedded" | "drawer";
  /** Navegación por callback a las pestañas de /agent (evita el bug del query param). */
  onNavigate?: (tab: string) => void;
  /** Se llama tras aplicar/guardar (además de persistir internamente). */
  onApply?: () => void;
  /** Se llama al descartar/cerrar (X, «Recordar luego», o al navegar). */
  onDismiss?: () => void;
  /** Sección a abrir (p.ej. "llm", "senales"; admite los sinónimos históricos). */
  initialSection?: string;
  /** Personalidad preseleccionada en el selector (id de PersonalityProfile). */
  initialPersonalityId?: string;
  /** Reduce paddings/tipografía (pensado para el drawer). */
  compact?: boolean;
}

/** Identificador de cada pestaña del hub. */
export type SetupSection =
  | "astraura" | "openvoice" | "cerebro" | "senales" | "agentes" | "inteligencia"
  | "neuronas" | "integraciones" | "apis";

/** Los 5 SISTEMAS de la neurona (barra del modal/drawer). */
// (Adenda 193) La pestaña «LLM» se FUSIONÓ en «Astraura»: ambas mostraban el
// mismo «Sistema primario de esta neurona» (PrimaryChoiceEditor) y separaban en
// dos sitios una sola decisión — qué IA usa esta neurona. Ahora Astraura reúne
// el sistema primario (1.58-bit local por defecto), los pines de fuente/modelo
// y el recomendador por hardware. Los deep-links `llm` siguen vivos (sinónimo).
const SYSTEM_SECTIONS: SetupSection[] = ["astraura", "openvoice", "cerebro", "senales", "agentes", "inteligencia"];
const ALL_SECTIONS: SetupSection[] = [...SYSTEM_SECTIONS, "neuronas", "integraciones", "apis"];
const NARROW_SECTIONS: SetupSection[] = SYSTEM_SECTIONS;

/**
 * Metadatos de pestaña. `accent` es el ACENTO DEL SISTEMA (SOP §7): el mismo
 * tono que ya usan sus tarjetas y su riel de override, ahora también en la
 * barra (A149 · ola 2 · §2.13). Las pestañas del hub embebido (neuronas /
 * integraciones / apis) NO llevan acento: se quedan con el color primario del
 * tema, como el resto de carriles del OS.
 */
const SECTION_META: Record<SetupSection, { label: string; icon: LucideIcon; accent?: SectionTabAccent }> = {
  astraura: { label: "Astraura", icon: Sparkles, accent: "amber" },
  agentes: { label: "Agentes", icon: Bot, accent: "cyan" },
  // (Adenda 218) La pestaña que faltaba: qué IA usa cada cosa y dónde cambiarla.
  inteligencia: { label: "Inteligencia", icon: BrainCircuit, accent: "violet" },
  // El SISTEMA de voz se llama OmniVoice; «OpenVoice» es solo uno de sus
  // motores. El id `openvoice` NO cambia: es la clave de los deep-links y de
  // los sinónimos históricos (voz/omnivoice→openvoice).
  openvoice: { label: "VoiceMorphic", icon: Volume2, accent: "fuchsia" },
  cerebro: { label: "Cerebro", icon: Brain, accent: "violet" },
  senales: { label: "Señales", icon: RadioTower, accent: "emerald" },
  neuronas: { label: "Neuronas", icon: Cpu },
  integraciones: { label: "Integraciones", icon: Blocks },
  apis: { label: "APIs & modelos", icon: KeyRound },
};

/**
 * PIEL DE CABECERA por contexto (`windowHeading().mode`): la ventana no se ve
 * igual cuando te da la bienvenida, cuando trae actualizaciones de lo que ya
 * usas, cuando sugiere novedades o cuando todo está al día.
 */
const HEADING_SKIN: Record<UpdateMode, { grad: string; icon: LucideIcon; iconCls: string }> = {
  "primera-vez": {
    grad: "bg-gradient-to-br from-violet-500/[0.14] via-cyan-500/[0.07] to-transparent",
    icon: Sparkles, iconCls: "text-violet-300",
  },
  actualizacion: {
    grad: "bg-gradient-to-br from-amber-500/[0.12] to-transparent",
    icon: BellRing, iconCls: "text-amber-300",
  },
  recomendaciones: {
    grad: "bg-gradient-to-br from-emerald-500/[0.12] to-transparent",
    icon: Compass, iconCls: "text-emerald-300",
  },
  "al-dia": {
    grad: "bg-gradient-to-br from-cyan-500/[0.08] to-transparent",
    icon: Check, iconCls: "text-cyan-300",
  },
};

/**
 * (Adenda 193) Lo que Astraura DICE en cada pestaña. Una frase por pantalla:
 * corta, presente y sin lista de pasos — lo que se ve es lo que se oye.
 */
const NARRACION_SECCION: Partial<Record<SetupSection, string>> = {
  astraura: "Esta es la inteligencia de tu neurona. Ya viene elegida Astraura 1.58 bits en local: funciona sin conexión y sin coste. Si quieres, debajo puedes afinar el modelo.",
  openvoice: "Aquí eliges cómo sueno en este dispositivo. La voz que escuchas ahora es la que viene puesta y funciona sin instalar nada; cámbiala solo si te apetece otra.",
  cerebro: "Este es el cerebro de la neurona: donde viven tus memorias y las carpetas que vinculaste antes.",
  senales: "Señales: cómo habla tu neurona con la red y con tus otros dispositivos.",
  agentes: "Tus agentes. Ya está todo elegido para este equipo: imaginan y proponen en segundo plano, y se automejoran mientras no miras.",
  inteligencia: "Y aquí ves toda la inteligencia en marcha: qué modelo respondió cada cosa, cuántos tokens usó, qué corre en segundo plano y dónde cambiar cualquiera de ellos.",
};

/** Sistema del store A149 → pestaña de esta ventana (para las insignias). */
const SYSTEM_TAB: Record<keyof PersonaNeuronOverrides, SetupSection> = {
  llm: "astraura", astraura: "astraura", voz: "openvoice", cerebro: "cerebro", senales: "senales",
};
/** Pestaña → sistema del store (ámbito «solo esta pestaña», atajos, diff). */
const TAB_SYSTEM: Partial<Record<SetupSection, SystemKey>> = {
  astraura: "astraura", openvoice: "voz", cerebro: "cerebro", senales: "senales",
};
/** Etiqueta corta de cada sistema (la misma que su pestaña). */
const SYSTEM_LABEL: Record<SystemKey, string> = {
  llm: "LLM", astraura: "Astraura", voz: "OmniVoice", cerebro: "Cerebro", senales: "Señales",
};

/** Nº de sistemas con ajuste propio REAL (objetos vacíos no cuentan). */
function countSystems(ov: PersonaNeuronOverrides | undefined | null): number {
  if (!ov) return 0;
  return Object.values(ov).filter((v) => v && typeof v === "object" && Object.keys(v as object).length > 0).length;
}

/** Sistemas con ajuste propio en TODA la neurona (todas sus personalidades). */
function countDevice(map: Record<string, PersonaNeuronOverrides>): number {
  return Object.values(map ?? {}).reduce((n, ov) => n + countSystems(ov), 0);
}

/**
 * Menú desplegable MÍNIMO y local (sin portal): la ventana puede vivir dentro de
 * un modal con foco atrapado, y un portal externo se pelearía con esa trampa.
 * Cierra al pulsar fuera y con Escape (en captura, para no cerrar la ventana).
 */
function MenuPanel({
  open, onClose, label, align = "left", children,
}: {
  open: boolean; onClose: () => void; label: string;
  align?: "left" | "right"; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node | null;
      if (ref.current && t && !ref.current.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={cn(
        "absolute top-[calc(100%+4px)] z-40 max-h-[50dvh] w-[15rem] max-w-[80vw] overflow-y-auto rounded-xl border border-[var(--aw-line)] p-1",
        "bg-[var(--aw-shell)] backdrop-blur-[var(--glass-blur)] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)]",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      {children}
    </div>
  );
}

/** Fila pulsable del menú (diana ≥36px, texto a la izquierda). */
function MenuItem({
  onClick, disabled, icon: Icon, children, hint,
}: {
  onClick: () => void; disabled?: boolean; icon?: LucideIcon;
  children: React.ReactNode; hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--aw-text)]",
        "transition-colors duration-200 hover:bg-[var(--aw-hover)] hover:text-[var(--aw-strong)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--aw-muted)]" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {hint && <span className="block truncate text-[10px] text-[var(--aw-muted)]">{hint}</span>}
      </span>
    </button>
  );
}

/** Chip pequeño de la fila de acciones de la cabecera. */
const HEADER_CHIP =
  "inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface)] px-2 py-1 text-[10px] text-[var(--aw-text)] transition-colors duration-200 hover:border-[var(--aw-line-strong)] hover:text-[var(--aw-strong)]";

/** Normaliza una sección pedida (con sinónimos, incl. los históricos) al id interno. */
function sectionFromSynonym(section?: string): SetupSection | null {
  if (!section) return null;
  const s = section.toLowerCase().trim();
  if (!s) return null;
  if ((ALL_SECTIONS as string[]).includes(s)) return s as SetupSection;
  const map: Record<string, SetupSection> = {
    // Históricos de la ventana (A132/A133) → nuevas pestañas.
    llm: "astraura", modelos: "astraura", modelo: "astraura", orden: "astraura", preferencia: "astraura", preferencias: "astraura",
    cuenta: "astraura", estrategia: "astraura", "auto-actualizacion": "astraura", "auto-actualización": "astraura",
    novedades: "astraura", actualizaciones: "astraura",
    voz: "openvoice", omnivoice: "openvoice", "omni-voice": "openvoice", "open-voice": "openvoice",
    // Sistemas nuevos.
    ia: "astraura",
    agente: "agentes", agents: "agentes", enjambre: "agentes", imaginacion: "agentes", "imaginación": "agentes",
    inteligencia: "inteligencia", tokens: "inteligencia", rutas: "inteligencia", router: "inteligencia", voicemorphic: "openvoice",
    memoria: "cerebro", memorias: "cerebro", cerebros: "cerebro", almacen: "cerebro", "almacén": "cerebro",
    "señales": "senales", antena: "senales", antenas: "senales", conectividad: "senales", mesh: "senales", malla: "senales",
    // Hub embebido.
    neurona: "neuronas", dispositivo: "neuronas", capacidades: "neuronas", hardware: "neuronas", entorno: "neuronas",
    integracion: "integraciones", "integración": "integraciones", fuentes: "integraciones", fuente: "integraciones",
    api: "apis", proveedor: "apis", proveedores: "apis",
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
    "cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100 shadow-[0_0_10px_-3px_rgb(34_211_238)]"
      : "border-[var(--aw-line)] bg-[var(--aw-surface)] text-[var(--aw-text)] hover:border-[var(--aw-line-strong)]",
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

/** CTAs del pie (Aplicar · Cerrar · Recordar luego · Guardar): diana ≥44px. */
const FOOTER_BTN =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-4 py-1.5 text-[12px] transition-colors";
const FOOTER_CTA = "border-cyan-400/40 bg-cyan-500/20 font-semibold text-cyan-100 hover:bg-cyan-500/30";

export function AstrauraOmniVoiceConfig({
  variant = "modal",
  onNavigate,
  onApply,
  onDismiss,
  initialSection,
  initialPersonalityId,
  compact = false,
}: AstrauraOmniVoiceConfigProps) {
  const availableSections = variant === "embedded" ? ALL_SECTIONS : NARROW_SECTIONS;

  const [section, setSection] = useState<SetupSection>(() => sectionFromSynonym(initialSection) ?? "astraura");
  useEffect(() => {
    const s = sectionFromSynonym(initialSection);
    if (s) setSection(s);
    // Solo reacciona a cambios explícitos de `initialSection` (petición del llamador).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);
  const currentSection: SetupSection = availableSections.includes(section) ? section : availableSections[0];

  /** Personalidad seleccionada («Todas» = defaults de la neurona, clave "*"). */
  const [personaId, setPersonaId] = useState<string>(initialPersonalityId || ALL_PERSONAS);
  useEffect(() => {
    if (initialPersonalityId) setPersonaId(initialPersonalityId);
  }, [initialPersonalityId]);

  const [updates, setUpdates] = useState<ClassifiedUpdates | null>(null);
  /** Overrides CRUDOS de la personalidad seleccionada en esta neurona (insignias). */
  const [rawOverrides, setRawOverrides] = useState<PersonaNeuronOverrides>({});
  /** Overrides de «Todas» (cuentan como ajustes propios de esta neurona). */
  const [rawAllPersonas, setRawAllPersonas] = useState<PersonaNeuronOverrides>({});
  /** Sistemas con ajuste propio en TODA la neurona (para el ámbito completo). */
  const [deviceOwn, setDeviceOwn] = useState(0);
  const [newSources, setNewSources] = useState<Integration[]>([]);
  const [newModels, setNewModels] = useState<number>(0);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [saved, setSaved] = useState(false);

  // ── Piezas de la ola 2/3: constelación · resonancia · comparador · copia ────
  const confirm = useConfirm();
  /** Nombres legibles de las personalidades (diff, menús y confirmaciones). */
  const [personaNames, setPersonaNames] = useState<Record<string, string>>({});
  const [showConstellation, setShowConstellation] = useState(true);
  const [showCompare, setShowCompare] = useState(false);
  const [resonance, setResonance] = useState<ResonanceResult | null>(null);
  const [showResonance, setShowResonance] = useState(false);
  /** Menú abierto en la cabecera (uno cada vez): ámbitos o copiar de otra neurona. */
  const [menu, setMenu] = useState<null | "scope" | "copy">(null);
  const [copyDevices, setCopyDevices] = useState<{ id: string; name: string; sistemas: number }[]>([]);
  const [copySystems, setCopySystems] = useState<Record<SystemKey, boolean>>(
    () => ({ llm: true, astraura: true, voz: true, cerebro: true, senales: true }),
  );
  /** Resumen «Qué cambia» tras aplicar (solo si son muchos cambios). */
  const [diffCard, setDiffCard] = useState<OverrideDiff[] | null>(null);
  /** Foto de TODA la neurona al abrir la ventana (base del diff). */
  const snapshotRef = useRef<Record<string, PersonaNeuronOverrides>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  /** Cuerpo desplazable: al cambiar de sistema/personalidad vuelve arriba. */
  const bodyRef = useRef<HTMLDivElement>(null);

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
  /** Espejo estable de `caps` para listeners de larga vida (refresh de novedades). */
  const capsRef = useRef<NeuronCapabilities | null>(null);
  useEffect(() => { capsRef.current = caps; }, [caps]);
  const [suggestedOrder, setSuggestedOrder] = useState<ModelAccessClass[] | null>(null);
  const [diag, setDiag] = useState<{ state: "idle" | "run" | "done"; gpu?: boolean; mismatch?: boolean; msg?: string }>({ state: "idle" });

  // Carga inicial: estado persistido + detección de capacidades (para el sugerido
  // y para clasificar novedades según el hardware real de esta neurona).
  useEffect(() => {
    const st = getStartupState();
    setAutoUpdate(st.autoUpdate !== false);
    try { setUpdates(classifyUpdates(null)); } catch { /* */ }
    setNewSources(newIntegrationsSince().slice(0, 8));
    setNewModels(newModelIdsSince().length);
    let alive = true;
    void (async () => {
      try {
        const c = await detectCapabilities();
        if (!alive) return;
        setCaps(c);
        try { setUpdates(classifyUpdates(c)); } catch { /* */ }
      } catch { /* detección best-effort */ }
    })();
    return () => { alive = false; };
  }, []);

  // La ventana NO se queda rancia (rev. adversarial 3 olas · M5): al elegir la
  // vía de voz (NeuronVoiceChoice → `starseed.voz.neurona.v2`) o al cambiar el
  // estado de arranque (Aplicar, snooze…), reclasifica novedades/pendientes en
  // vivo — el título, la tarjeta «Configuración pendiente» y el modo guía se
  // actualizan sin reabrir (clave en `variant="embedded"`, que nunca se cierra).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => { try { setUpdates(classifyUpdates(capsRef.current)); } catch { /* */ } };
    window.addEventListener("starseed:voz-neurona-reopen", refresh);
    window.addEventListener("starseed:astraura-startup", refresh);
    return () => {
      window.removeEventListener("starseed:voz-neurona-reopen", refresh);
      window.removeEventListener("starseed:astraura-startup", refresh);
    };
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

  // Overrides crudos EN VIVO de la personalidad seleccionada: alimentan la
  // insignia violeta de cada pestaña («aquí tienes ajustes propios»), el
  // contador de ámbitos y el menú de «volver a auto».
  useEffect(() => {
    const read = () => {
      try { setRawOverrides(getRawOverrides(deviceId, personaId)); } catch { setRawOverrides({}); }
      try {
        setRawAllPersonas(personaId === ALL_PERSONAS ? {} : getRawOverrides(deviceId, ALL_PERSONAS));
      } catch { setRawAllPersonas({}); }
      try { setDeviceOwn(countDevice(getRawDevice(deviceId))); } catch { setDeviceOwn(0); }
    };
    read();
    return subscribeNeuronPersona(read);
  }, [deviceId, personaId]);

  // RESONANCIA en vivo de la personalidad seleccionada («Todas» no resuena:
  // no es una persona, son los defaults de la neurona).
  useEffect(() => {
    if (!deviceId || personaId === ALL_PERSONAS) { setResonance(null); setShowResonance(false); return; }
    const read = () => {
      try { setResonance(resonanceScore(personaId, deviceId)); } catch { setResonance(null); }
    };
    read();
    return subscribeNeuronPersona(read);
  }, [deviceId, personaId]);

  // Foto inicial de TODA la neurona: es la base contra la que se calcula el
  // «qué cambia» al aplicar (se renueva tras cada aplicación).
  useEffect(() => {
    if (!deviceId) return;
    try { snapshotRef.current = getRawDevice(deviceId); } catch { snapshotRef.current = {}; }
  }, [deviceId]);

  // Nombres de las personalidades (diff, menús y confirmaciones legibles).
  useEffect(() => {
    try {
      const map: Record<string, string> = { [ALL_PERSONAS]: "Todas" };
      for (const c of personaChips()) map[c.id] = c.name;
      setPersonaNames(map);
    } catch { /* */ }
  }, []);

  // Otras neuronas de la cuenta CON ajustes guardados (solo al abrir el menú).
  useEffect(() => {
    if (menu !== "copy") return;
    let alive = true;
    void (async () => {
      const names: Record<string, string> = {};
      try {
        for (const n of await listNeurons()) names[n.id] = n.name;
      } catch { /* sin nombres: se muestra el id corto */ }
      if (!alive) return;
      try {
        const ids = listConfiguredDevices().filter((id) => id && id !== deviceId);
        setCopyDevices(ids.map((id) => ({
          id,
          name: names[id] || `Neurona ${id.slice(0, 6)}…`,
          sistemas: countDevice(getRawDevice(id)),
        })));
      } catch { setCopyDevices([]); }
    })();
    return () => { alive = false; };
  }, [menu, deviceId]);

  // Cambiar de sistema o de personalidad vuelve arriba (antes lo hacía el
  // remontaje del cuerpo; ahora los paneles transversales viven fuera de la
  // `key` y hay que pedirlo explícitamente). EXCEPCIÓN (rev. 3 olas · M7): en
  // la pestaña Astraura, cambiar SOLO de personalidad desde la tabla de
  // relaciones no debe llevarse el scroll — la tabla debe seguir a la vista.
  const prevCtxRef = useRef({ section, personaId });
  useEffect(() => {
    const prev = prevCtxRef.current;
    prevCtxRef.current = { section, personaId };
    const soloPersona = prev.section === section && prev.personaId !== personaId;
    if (soloPersona && section === "astraura") return;
    const el = bodyRef.current;
    if (!el) return;
    try { el.scrollTop = 0; } catch { /* */ }
  }, [section, personaId]);

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
  // Los overrides por personalidad×neurona se guardan AL EDITAR (capa A149).
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

  /** Nombre legible de una personalidad por id (con respaldo al propio id). */
  const nameOf = useCallback(
    (id: string) => (id === ALL_PERSONAS ? "Todas" : personaNames[id] || id),
    [personaNames],
  );

  /** Una línea del diff, ya en español: «LLM · Aurora: automático → fuente groq-free». */
  const diffLine = useCallback(
    (d: OverrideDiff) => `${SYSTEM_LABEL[d.system]} · ${nameOf(d.personaId)}: ${d.antes} → ${d.despues}`,
    [nameOf],
  );

  /**
   * RESUMEN «QUÉ CAMBIA» (§2.1): compara la foto de toda la neurona tomada al
   * abrir con la de ahora. Los overrides se guardan al instante, así que esto no
   * añade fricción: describe lo ocurrido en el toast de aplicado (y, si son
   * MUCHOS cambios, deja además una tarjeta desplegada con el detalle).
   */
  const reportChanges = useCallback(() => {
    let cambios: OverrideDiff[] = [];
    try { cambios = diffOverrides(snapshotRef.current, getRawDevice(deviceId)); } catch { cambios = []; }
    try { snapshotRef.current = getRawDevice(deviceId); } catch { /* */ }
    if (!cambios.length) return;
    const head = cambios.slice(0, 3).map(diffLine).join("; ");
    const rest = cambios.length > 3 ? ` — y ${cambios.length - 3} cambio(s) más (detalle abajo).` : "";
    try {
      toast.success(`Aplicado · ${cambios.length} cambio(s) en esta neurona`, { description: `${head}${rest}` });
    } catch { /* */ }
    setDiffCard(cambios.length > 3 ? cambios : null);
  }, [deviceId, diffLine]);

  const handleApply = () => {
    persist();
    reportChanges();
    onApply?.();
    // En modal cierra `onApply`; en drawer cerramos con `onDismiss`; en embedded
    // no hay cierre (se queda en la pestaña) y mostramos feedback.
    if (variant === "drawer") onDismiss?.();
    setSaved(true);
  };
  const handleLater = () => { try { snoozeUpdates(); } catch { /* */ } onDismiss?.(); };

  /* ── ÁMBITOS de «volver a auto» (§2.1) ─────────────────────────────────────
   * Confirmación destructiva por ámbito; aquí no hace falta «deshacer»: la
   * confirmación explícita ya evita el borrado accidental. */
  const tabSystem = TAB_SYSTEM[currentSection] ?? null;
  const ownPersona = countSystems(rawOverrides);
  const ownTodas = countSystems(rawAllPersonas);
  const ownTotal = ownPersona + ownTodas;

  const resetScope = async (scopeKind: "tab" | "persona" | "device") => {
    setMenu(null);
    const personaLabel = nameOf(personaId);
    const opts =
      scopeKind === "tab"
        ? {
          title: `¿Volver a auto en ${SECTION_META[currentSection].label}?`,
          description: `Se quita el ajuste propio de ${SECTION_META[currentSection].label} para «${personaLabel}» en esta neurona. Vuelve a la selección automática.`,
        }
        : scopeKind === "persona"
          ? {
            title: `¿Volver a auto en «${personaLabel}»?`,
            description: `Se quitan sus ${ownPersona} ajuste(s) propio(s) en esta neurona (los cinco sistemas). Los de «Todas» no se tocan.`,
          }
          : {
            title: "¿Volver a auto en toda la neurona?",
            description: `Se quitan los ${deviceOwn} ajuste(s) propio(s) de TODAS las personalidades en esta neurona. Tus personalidades y el resto de neuronas no se tocan.`,
          };
    let ok = false;
    try {
      ok = await confirm({ ...opts, confirmText: "Volver a auto", cancelText: "Cancelar", destructive: true });
    } catch { ok = false; }
    if (!ok) return;
    try {
      if (scopeKind === "tab" && tabSystem) clearOverrides(deviceId, personaId, tabSystem);
      else if (scopeKind === "persona") clearOverrides(deviceId, personaId);
      else clearDeviceOverrides(deviceId);
    } catch { /* */ }
    try {
      toast.success("Vuelve a la selección automática", {
        description: scopeKind === "tab"
          ? `${SECTION_META[currentSection].label} · ${personaLabel}.`
          : scopeKind === "persona"
            ? `Todos los sistemas de «${personaLabel}» en esta neurona.`
            : "Toda la neurona: cada personalidad vuelve a heredar/auto.",
      });
    } catch { /* */ }
  };

  /* ── COPIAR de otra neurona (§2.10) ───────────────────────────────────────── */
  const copySelected = (Object.keys(copySystems) as SystemKey[]).filter((k) => copySystems[k]);

  const copyFrom = async (from: { id: string; name: string }) => {
    if (!copySelected.length) return;
    const etiquetas = copySelected.map((k) => SYSTEM_LABEL[k]).join(" · ");
    let ok = false;
    try {
      ok = await confirm({
        title: `¿Copiar de «${from.name}»?`,
        description: `En esta neurona, ${etiquetas} quedará IGUAL que en «${from.name}» para todas las personalidades (lo que allí esté en automático, aquí también). Podrás deshacerlo desde el aviso.`,
        confirmText: "Copiar aquí",
        cancelText: "Cancelar",
        destructive: true,
      });
    } catch { ok = false; }
    if (!ok) return;
    let before: Record<string, PersonaNeuronOverrides> = {};
    try { before = getRawDevice(deviceId); } catch { /* */ }
    let n = 0;
    try { n = copyOverrides(from.id, deviceId, undefined, copySelected); } catch { n = 0; }
    setMenu(null);
    try {
      toast.success(`Copiado de «${from.name}»`, {
        description: n > 0 ? `${n} sistema(s) igualados en esta neurona (${etiquetas}).` : "No había nada que copiar en esos sistemas.",
        action: {
          label: "Deshacer",
          onClick: () => { try { replaceDeviceOverrides(deviceId, before); } catch { /* */ } },
        },
      });
    } catch { /* */ }
  };

  /* ── EXPORTAR / IMPORTAR el archivo de la neurona (§2.3) ──────────────────── */
  const exportJson = () => {
    try {
      const blob = new Blob([exportNeuronPersonaJson(deviceId)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sistemas-neurona-${(deviceId || "local").slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Configuración exportada", {
        description: `${deviceOwn} ajuste(s) de esta neurona en un archivo .json.`,
      });
    } catch {
      try { toast.error("No se pudo exportar la configuración."); } catch { /* */ }
    }
  };

  const importJson = async (file: File | null | undefined) => {
    if (!file) return;
    let text = "";
    try { text = await file.text(); } catch { text = ""; }
    if (!text) { try { toast.error("No se pudo leer el archivo."); } catch { /* */ } return; }
    let ok = false;
    try {
      ok = await confirm({
        title: "¿Importar configuración de sistemas?",
        description: "Sustituye los ajustes de los cinco sistemas de ESTA neurona por los del archivo (el resto de neuronas y tus personalidades no se tocan). Podrás deshacerlo desde el aviso.",
        confirmText: "Importar",
        cancelText: "Cancelar",
        destructive: true,
      });
    } catch { ok = false; }
    if (!ok) return;
    let before: Record<string, PersonaNeuronOverrides> = {};
    try { before = getRawDevice(deviceId); } catch { /* */ }
    const res = importNeuronPersonaJson(text, deviceId);
    if (!res.ok) {
      try { toast.error("No se pudo importar", { description: res.error }); } catch { /* */ }
      return;
    }
    try {
      toast.success(`Importados ${res.sistemas} ajuste(s) de ${res.personas} personalidad(es)`, {
        description: res.aviso ?? "La configuración de esta neurona ya es la del archivo.",
        action: {
          label: "Deshacer",
          onClick: () => { try { replaceDeviceOverrides(deviceId, before); } catch { /* */ } },
        },
      });
    } catch { /* */ }
  };

  /* ── «Aplicar lo recomendado», solo lo verificable (§2.1) ─────────────────── */
  const aplicarRecomendado = () => {
    if (!suggestedOrder || !suggestedOrder.length) return;
    const igual = activeOrder.join("|") === suggestedOrder.join("|");
    useSuggested();
    try {
      toast.success(igual ? "Ya usabas el orden recomendado" : "Orden recomendado aplicado", {
        description: `${orderLabels(suggestedOrder)}. Los modelos y motores nuevos NO se activan solos: cada uno se abre en su pestaña.`,
      });
    } catch { /* */ }
  };

  /* ── ATAJOS DE TECLADO (§2.1) ─────────────────────────────────────────────── */
  const onShortcut = (e: KeyboardEvent) => {
    // Con una CONFIRMACIÓN Radix encima, los atajos duermen (rev. 3 olas · B10):
    // teclear «3» sobre un AlertDialog no debe cambiar la pestaña de debajo.
    try { if (document.querySelector('[role="alertdialog"]')) return; } catch { /* */ }
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    const editando = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || t?.isContentEditable === true;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleApply();
      return;
    }
    if (editando || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > SYSTEM_SECTIONS.length) return;
    const target = SYSTEM_SECTIONS[n - 1];
    if (!availableSections.includes(target)) return;
    e.preventDefault();
    setSection(target);
  };
  /** Ref viva del manejador: el listener global nunca ve estado caducado. */
  const shortcutRef = useRef(onShortcut);
  useEffect(() => { shortcutRef.current = onShortcut; });
  useEffect(() => {
    // En el hub embebido los atajos van por el contenedor (foco dentro): un
    // listener global secuestraría el «1» de cualquier otra parte de /agent.
    if (variant === "embedded" || typeof window === "undefined") return;
    const h = (e: KeyboardEvent) => shortcutRef.current?.(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [variant]);

  // Título/subtítulo dinámicos según el contexto de la neurona (SOP §2).
  const heading = windowHeading(updates ?? { mode: "al-dia", sistemas: [], recomendadas: [], otras: [], nuevasFuentes: 0, pendientes: [] });
  const title = heading.title;
  const subtitle = heading.subtitle;
  /** Piel (degradado + icono) de la cabecera según ese mismo contexto. */
  const skin = HEADING_SKIN[heading.mode] ?? HEADING_SKIN["al-dia"];
  const HeadingIcon = skin.icon;

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

  // CRISTAL de verdad (identidad «Crystal Liquid Glass»): superficie translúcida
  // con desenfoque tokenizado (`--glass-blur` baja a 8px en data-perf=eco) y las
  // capas de grosor/canto del OS, en vez de un panel opaco sobre el fondo vivo.
  const glassSurface = "bg-[var(--aw-shell)] backdrop-blur-[var(--glass-blur)] glass-depth glass-edge";
  // `astraura-window`: capa de TOKENS de la ventana (globals.css). Todo lo de
  // dentro lee `--aw-*` en vez de fijar blancos y negros a mano, así el modo
  // claro será un cambio de hoja de estilo (§2.13).
  const tokenLayer = "astraura-window text-[var(--aw-ink)]";
  // En <sm el modal se lee como HOJA INFERIOR (§2.1): el overlay sigue
  // centrando, pero `self-end` + ancho completo + esquinas altas lo llevan al
  // borde inferior, respetando el área segura del sistema.
  const mobileSheet =
    "max-sm:self-end max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:pb-[env(safe-area-inset-bottom)]";
  const outerClass =
    variant === "modal"
      ? cn("flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-[var(--aw-line)]", tokenLayer, mobileSheet, glassSurface)
      : variant === "drawer"
        ? cn("flex h-full w-full flex-col overflow-hidden", tokenLayer, glassSurface)
        : cn("flex w-full flex-col", tokenLayer);

  /** Pestañas cuyos sistemas tienen novedades de catálogo (insignia ámbar). */
  const updatedTabs = (() => {
    const set = new Set<SetupSection>();
    if (!updates) return set;
    for (const spec of [...updates.sistemas, ...updates.recomendadas]) {
      set.add(spec.kind === "voz" ? "openvoice" : "astraura");
    }
    if (updates.nuevasFuentes > 0) set.add("astraura");
    return set;
  })();

  /** Pestañas con ajuste propio de esta personalidad aquí (insignia violeta). */
  const pinnedTabs = (() => {
    const set = new Set<SetupSection>();
    for (const key of Object.keys(rawOverrides) as (keyof PersonaNeuronOverrides)[]) {
      const tab = SYSTEM_TAB[key];
      if (tab && rawOverrides[key]) set.add(tab);
    }
    return set;
  })();

  const tabItems: SectionTabItem[] = availableSections.map((s) => {
    const count = s === "astraura" ? newSources.length + newModels : 0;
    const nuevo = updatedTabs.has(s);
    const propio = pinnedTabs.has(s);
    const notas = [propio ? "con ajustes propios aquí" : "", nuevo ? "con novedades" : ""].filter(Boolean);
    return {
      value: s,
      label: SECTION_META[s].label,
      icon: SECTION_META[s].icon,
      // Acento del sistema en la barra (sin `accent` = color primario de siempre).
      accent: SECTION_META[s].accent,
      title: notas.length ? `${SECTION_META[s].label} — ${notas.join(" · ")}` : SECTION_META[s].label,
      badge: count > 0 || nuevo || propio
        ? (
          <span className="inline-flex items-center gap-1">
            {count > 0 && <span>{count}</span>}
            {nuevo && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />}
            {propio && <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />}
          </span>
        )
        : undefined,
    };
  });

  // ── SWIPE TÁCTIL entre pestañas (A149 · ola 2 · §2.1) ───────────────────────
  // En móvil, cambiar de sistema exigía acertar la píldora exacta. Mismo patrón
  // de arrastre+umbral que `trinity-edge-access`/`side-curtains` (sin librería):
  // solo dispara si el eje X domina claramente, así NUNCA compite con el scroll
  // vertical del cuerpo ni con los carriles horizontales de dentro.
  const swipeRef = useRef<{ x: number; y: number; t: number; ok: boolean } | null>(null);

  /** ¿El gesto empieza en algo que ya gestiona su propio desplazamiento? */
  const swipeAllowedFrom = (target: EventTarget | null, root: HTMLElement | null): boolean => {
    let el: HTMLElement | null = target instanceof HTMLElement ? target : null;
    while (el && el !== root) {
      const tag = el.tagName;
      if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA" || tag === "OPTION") return false;
      if (el.hasAttribute("data-no-swipe")) return false;
      // Carriles con scroll-x propio (chips de personalidad, tablas, listas):
      // el gesto es suyo, no se lo robamos.
      if (el.scrollWidth > el.clientWidth + 8) {
        try {
          const ox = getComputedStyle(el).overflowX;
          if (ox === "auto" || ox === "scroll") return false;
        } catch { /* */ }
      }
      el = el.parentElement;
    }
    return true;
  };

  const onBodyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) { swipeRef.current = null; return; }
    const t = e.touches[0];
    swipeRef.current = {
      x: t.clientX, y: t.clientY, t: Date.now(),
      ok: availableSections.length > 1 && swipeAllowedFrom(e.target, e.currentTarget),
    };
  };

  const onBodyTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = swipeRef.current;
    swipeRef.current = null;
    if (!g || !g.ok) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    // Umbral ~48px y eje X dominante (1,5× sobre el vertical); gesto no eterno.
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (Date.now() - g.t > 900) return;
    const idx = availableSections.indexOf(currentSection);
    if (idx < 0) return;
    const next = availableSections[idx + (dx < 0 ? 1 : -1)];
    if (next) setSection(next);
  };

  /* ── MODO GUÍA de primera vez (§2.1): las mismas 5 pestañas, con rail de
   *    progreso y pie «Atrás · Siguiente · Terminar». Las pestañas siguen
   *    clicables: es una guía, no un asistente que secuestre la ventana. */
  // (Adenda 193) Voz de Astraura POR PESTAÑA: instantánea, sin cola y sin
  // arrastrar pasos ya pasados. Cambiar de pestaña corta y sustituye; cerrar la
  // ventana calla. Misma voz que la bienvenida (continuidad hasta OmniVoice).
  useNarracionVentana(NARRACION_SECCION[currentSection] ?? null);

  const enSistemas = SYSTEM_SECTIONS.includes(currentSection);
  const guiaActiva = heading.mode === "primera-vez" && enSistemas;
  const pasoIdx = SYSTEM_SECTIONS.indexOf(currentSection);
  const ultimoPaso = pasoIdx === SYSTEM_SECTIONS.length - 1;

  const guideRail = guiaActiva && (
    <div className="mb-2 flex items-center gap-2">
      <span className="shrink-0 text-[10px] font-semibold text-violet-200">
        Paso {pasoIdx + 1}/{SYSTEM_SECTIONS.length}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1" aria-hidden="true">
        {SYSTEM_SECTIONS.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              i <= pasoIdx ? "bg-violet-400/70" : "bg-[var(--aw-line)]",
            )}
          />
        ))}
      </span>
      <span className="sr-only">
        Guía de primera vez: paso {pasoIdx + 1} de {SYSTEM_SECTIONS.length}, {SECTION_META[currentSection].label}.
      </span>
    </div>
  );

  /** Tono del chip de resonancia: verde ≥90 · ámbar ≥65 · rosa por debajo. */
  const resonanceTone = (score: number) =>
    score >= 90
      ? "border-emerald-400/40 bg-emerald-500/12 text-emerald-100"
      : score >= 65
        ? "border-amber-400/40 bg-amber-500/12 text-amber-100"
        : "border-rose-400/40 bg-rose-500/12 text-rose-100";

  /** Fila de acciones de ámbito NEURONA (bajo el selector de personalidad). */
  const headerActions = (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {/* RESONANCIA de la personalidad con esta neurona (§2.10). */}
      {resonance && personaId !== ALL_PERSONAS && (
        <button
          type="button"
          onClick={() => setShowResonance((o) => !o)}
          aria-expanded={showResonance}
          aria-controls="aw-resonancia"
          title={`Resonancia ${resonance.score}/100 — ${resonance.label}. ${resonance.mismatches.length ? "Pulsa para ver los desajustes y arreglarlos." : "Nada se contradice aquí."}`}
          className={cn(
            "inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium",
            "transition-[background-color,border-color,color] duration-200",
            resonanceTone(resonance.score),
          )}
        >
          <Waves className="h-3 w-3" aria-hidden="true" />
          Resonancia {resonance.score}
          <span className="opacity-80">· {resonance.label}</span>
          {resonance.mismatches.length > 0 && (
            <span className="ml-0.5 rounded-full bg-black/25 px-1.5 py-px text-[9px] font-semibold">
              {resonance.mismatches.length}
            </span>
          )}
          {showResonance
            ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
            : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
        </button>
      )}

      {/* «VOLVER A AUTO» POR ÁMBITO (§2.1): contador + menú con confirmación. */}
      {deviceOwn > 0 && (
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu === "scope"}
            onClick={() => setMenu((m) => (m === "scope" ? null : "scope"))}
            title={`${ownPersona} ajuste(s) de «${nameOf(personaId)}» · ${ownTodas} de «Todas» · ${deviceOwn} en toda la neurona`}
            className={cn(HEADER_CHIP, "border-violet-400/30 bg-violet-500/10 text-violet-100 hover:border-violet-400/50")}
          >
            <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
            {ownTotal > 0
              ? `${ownTotal} ajuste${ownTotal === 1 ? "" : "s"} propio${ownTotal === 1 ? "" : "s"}`
              : `${deviceOwn} ajuste${deviceOwn === 1 ? "" : "s"} en esta neurona`}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          <MenuPanel open={menu === "scope"} onClose={() => setMenu(null)} label="Volver a auto por ámbito">
            <p className="px-2 py-1 text-[10px] text-[var(--aw-muted)]">Volver a auto…</p>
            <MenuItem
              icon={Undo2}
              disabled={!tabSystem || !rawOverrides[tabSystem]}
              onClick={() => void resetScope("tab")}
              hint={tabSystem && rawOverrides[tabSystem] ? "Quita el ajuste de este sistema" : "Aquí no hay ajuste propio"}
            >
              Solo esta pestaña ({SECTION_META[currentSection].label})
            </MenuItem>
            <MenuItem
              icon={UserCog}
              disabled={ownPersona === 0}
              onClick={() => void resetScope("persona")}
              hint={`${ownPersona} ajuste(s) propio(s)`}
            >
              Esta personalidad ({nameOf(personaId)})
            </MenuItem>
            <MenuItem
              icon={Cpu}
              onClick={() => void resetScope("device")}
              hint={`${deviceOwn} ajuste(s) de todas las personalidades`}
            >
              Toda la neurona
            </MenuItem>
          </MenuPanel>
        </div>
      )}

      {/* COMPARADOR de personalidades en esta neurona (§2.10). En la pestaña
          Astraura no hace falta: la tabla de RELACIONES ya está siempre a la
          vista allí, así que el chip lleva a ella en vez de duplicarla. */}
      <button
        type="button"
        onClick={() => {
          if (currentSection === "astraura") { setShowCompare(false); return; }
          setShowCompare((o) => !o);
        }}
        aria-expanded={currentSection === "astraura" ? undefined : showCompare}
        title={currentSection === "astraura"
          ? "La tabla de relaciones por personalidad ya está en esta pestaña"
          : "Ver, una al lado de otra, la configuración de tus personalidades en esta neurona"}
        disabled={currentSection === "astraura"}
        className={cn(
          HEADER_CHIP,
          showCompare && currentSection !== "astraura" && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100",
          currentSection === "astraura" && "cursor-default opacity-50",
        )}
      >
        <Columns3 className="h-3 w-3" aria-hidden="true" /> Comparar
      </button>

      {/* COPIAR de otra neurona (§2.10). */}
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu === "copy"}
          onClick={() => setMenu((m) => (m === "copy" ? null : "copy"))}
          title="Traer la configuración de sistemas de otra de tus neuronas"
          className={HEADER_CHIP}
        >
          <Copy className="h-3 w-3" aria-hidden="true" /> Copiar de…
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
        <MenuPanel open={menu === "copy"} onClose={() => setMenu(null)} label="Copiar configuración de otra neurona">
          <p className="px-2 pt-1 text-[10px] text-[var(--aw-muted)]">Sistemas a copiar</p>
          <div className="flex flex-wrap gap-1 px-2 pb-1.5 pt-1">
            {SYSTEM_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={copySystems[k]}
                onClick={() => setCopySystems((s) => ({ ...s, [k]: !s[k] }))}
                className={cn(
                  "min-h-7 cursor-pointer rounded-md border px-2 py-0.5 text-[10px] transition-colors duration-200",
                  copySystems[k]
                    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                    : "border-[var(--aw-line)] bg-[var(--aw-surface)] text-[var(--aw-muted)]",
                )}
              >
                {SYSTEM_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="border-t border-[var(--aw-line)] pt-1">
            {copyDevices.length === 0 ? (
              <p className="px-2 py-2 text-[10px] leading-snug text-[var(--aw-muted)]">
                Ninguna otra neurona tuya tiene todavía ajustes propios guardados.
              </p>
            ) : (
              copyDevices.map((d) => (
                <MenuItem
                  key={d.id}
                  icon={Cpu}
                  disabled={copySelected.length === 0}
                  onClick={() => void copyFrom(d)}
                  hint={`${d.sistemas} ajuste(s) guardados`}
                >
                  {d.name}
                </MenuItem>
              ))
            )}
          </div>
        </MenuPanel>
      </div>

      {/* Mostrar/ocultar la constelación (en móvil el alto de cabecera importa). */}
      <button
        type="button"
        onClick={() => setShowConstellation((o) => !o)}
        aria-expanded={showConstellation}
        title={showConstellation ? "Ocultar la constelación de sistemas" : "Ver la constelación de los 5 sistemas"}
        className={cn(HEADER_CHIP, "px-1.5")}
      >
        <Orbit className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">{showConstellation ? "Ocultar constelación" : "Ver constelación"}</span>
      </button>

      {/* «Configuración completa» (antes en su propia fila): mismo destino. */}
      {variant !== "embedded" && (
        <span className="ml-auto">
          {onNavigate ? (
            <button type="button" onClick={goFull} className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-cyan-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-cyan-200">
              Configuración completa <ArrowRight className="h-3 w-3" />
            </button>
          ) : (
            <Link href="/agent?tab=config-ia" onClick={() => onDismiss?.()} className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-cyan-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-cyan-200">
              Configuración completa <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </span>
      )}
    </div>
  );

  const tabsRow = (
    <div className="mt-3 min-w-0">
      {guideRail}
      <SectionTabs
        items={tabItems}
        value={currentSection}
        onValueChange={(v) => setSection(v as SetupSection)}
        ariaLabel="Sistemas de Astraura en esta neurona"
        size="sm"
      />
      {/* CONSTELACIÓN + selector de personalidad: por primera vez, los cinco
          sistemas de una personalidad se ven JUNTOS, y cada nodo es navegación. */}
      {enSistemas && (
        <div className="mt-1 flex items-start gap-2">
          {showConstellation && (
            <PersonaConstellation
              personaId={personaId}
              deviceId={deviceId}
              caps={caps}
              // (Adenda 193) La constelación sigue teniendo su nodo «llm»
              // (sistema del store); su pestaña ahora es Astraura.
              onSelect={(s) => setSection(s === "llm" ? "astraura" : s)}
              compact={compact}
              size={compact ? 92 : 104}
              className="mt-1"
            />
          )}
          <div className="min-w-0 flex-1">
            <PersonaSelector value={personaId} onChange={setPersonaId} compact={compact} deviceId={deviceId} />
            {headerActions}
          </div>
        </div>
      )}
    </div>
  );

  /** Botón secundario del pie (guía): misma diana táctil que los CTA. */
  const FOOT_NAV =
    "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-1.5 text-[12px] text-[var(--aw-text)] transition-colors duration-200 hover:border-[var(--aw-line-strong)] hover:text-[var(--aw-strong)] disabled:cursor-not-allowed disabled:opacity-40";

  /**
   * Cabeza del pie: navegación de la GUÍA de primera vez (§2.1) y LEYENDA de
   * atajos (§2.1, solo desde sm: en móvil no hay teclado físico que anunciar).
   */
  const footerLead = (
    <div className="mr-auto flex min-w-0 flex-wrap items-center gap-1.5">
      {guiaActiva && (
        <>
          <span className="hidden text-[10px] font-semibold text-violet-200 sm:inline">
            Paso {pasoIdx + 1}/{SYSTEM_SECTIONS.length}
          </span>
          <button
            type="button"
            disabled={pasoIdx <= 0}
            onClick={() => { const p = SYSTEM_SECTIONS[pasoIdx - 1]; if (p) setSection(p); }}
            className={FOOT_NAV}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Atrás
          </button>
          {ultimoPaso ? (
            <button type="button" onClick={handleApply} className={cn(FOOT_NAV, "border-violet-400/40 bg-violet-500/15 font-semibold text-violet-100")}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Terminar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { const n = SYSTEM_SECTIONS[pasoIdx + 1]; if (n) setSection(n); }}
              className={FOOT_NAV}
            >
              Siguiente <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </>
      )}
      {!guiaActiva && (
        <span className="hidden items-center gap-1 text-[10px] text-[var(--aw-muted)] sm:inline-flex">
          <kbd className="rounded border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-1 py-px font-sans">1</kbd>
          <span aria-hidden="true">–</span>
          <kbd className="rounded border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-1 py-px font-sans">5</kbd>
          sistemas
          <span aria-hidden="true">·</span>
          <kbd className="rounded border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-1 py-px font-sans">⌘/Ctrl</kbd>
          <span aria-hidden="true">+</span>
          <kbd className="rounded border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-1 py-px font-sans">↵</kbd>
          aplicar
        </span>
      )}
    </div>
  );

  /** Novedades como CHIPS que saltan a su pestaña («Ver en LLM/OmniVoice»). */
  const specChips = (specs: ModelSpec[], max = 6) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {specs.slice(0, max).map((s) => {
        const target: SetupSection = s.kind === "voz" ? "openvoice" : "astraura";
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(target)}
            title={`Ver «${s.label}» en la pestaña ${SECTION_META[target].label}`}
            className="inline-flex min-h-7 max-w-full cursor-pointer items-center gap-1 truncate rounded-full border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-text)] transition-colors duration-200 hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <span className="truncate">{s.label}</span>
            <ArrowRight className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="shrink-0 opacity-80">{SECTION_META[target].label}</span>
          </button>
        );
      })}
      {specs.length > max && (
        <span className="inline-flex items-center rounded-full border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-muted)]">
          +{specs.length - max}
        </span>
      )}
    </div>
  );

  /** Resumen de novedades clasificadas por sistema (modos actualización/recomendaciones)
   *  y de la CONFIGURACIÓN PENDIENTE de la neurona (A149 · olas: motivo de la
   *  reaparición al reiniciar mientras falte algo por configurar). */
  const updatesCard = updates && (updates.mode === "actualizacion" || updates.mode === "recomendaciones" || updates.pendientes.length > 0) && (
    <div className={cn(
      "rounded-xl border px-3 py-2",
      updates.mode === "actualizacion" ? "border-amber-400/25 bg-amber-500/[0.06]" : "border-emerald-400/25 bg-emerald-500/[0.06]",
    )}>
      <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
        <BellRing className={cn("h-3.5 w-3.5", updates.mode === "actualizacion" ? "text-amber-300" : "text-emerald-300")} />
        {updates.mode === "actualizacion" ? "Actualizaciones de sistemas en uso" : updates.mode === "recomendaciones" ? "Novedades adecuadas para esta neurona" : "Configuración pendiente de esta neurona"}
      </p>
      {updates.pendientes.length > 0 && (
        <div className="mt-1 space-y-1">
          {updates.pendientes.map((p) => (
            <p key={p.sistema} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug text-[var(--aw-muted)]">
              <span className="min-w-0">Falta por configurar {p.label}.</span>
              <button
                type="button"
                onClick={() => setSection(p.sistema === "voz" ? "openvoice" : "astraura")}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/25"
              >
                Configurar ahora <ArrowRight className="h-3 w-3" />
              </button>
            </p>
          ))}
        </div>
      )}
      {updates.sistemas.length > 0 && (
        <div className="mt-1">
          <p className="text-[10px] leading-snug text-[var(--aw-muted)]">Sistemas en uso con novedades:</p>
          {specChips(updates.sistemas)}
        </div>
      )}
      {updates.recomendadas.length > 0 && (
        <div className="mt-1">
          <p className="text-[10px] leading-snug text-[var(--aw-muted)]">Encajan con este hardware:</p>
          {specChips(updates.recomendadas)}
        </div>
      )}
      {updates.nuevasFuentes > 0 && (
        <p className="mt-1 text-[10px] text-[var(--aw-muted)]">{updates.nuevasFuentes} fuente(s)/integración(es) nueva(s).</p>
      )}
      {/* «APLICAR LO RECOMENDADO», pero SOLO lo verificable (§2.1): el orden
          sugerido para este hardware. Ningún modelo ni motor se activa a ciegas:
          cada novedad se abre en su pestaña con los chips de arriba. */}
      {suggestedOrder && suggestedOrder.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={aplicarRecomendado}
            className="inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-100 transition-colors duration-200 hover:bg-emerald-500/25"
          >
            <Wand2 className="h-3 w-3" aria-hidden="true" /> Aplicar lo recomendado
          </button>
          <span className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--aw-muted)]">
            Solo cambia el ORDEN de motores de este dispositivo ({orderLabels(suggestedOrder)}); los modelos y voces
            nuevos no se activan solos.
          </span>
        </div>
      )}
      <p className="mt-1 text-[10px] text-[var(--aw-muted)]">
        Con la actualización automática activada, Astraura aplica sola las mejores opciones al aceptar esta ventana.
      </p>
    </div>
  );

  return (
    <div className={outerClass}>
      {/* Cabecera (modal/drawer con degradado; embedded sobria; X solo en modal) */}
      {variant === "embedded" ? (
        <div className={cn("border-b border-[var(--aw-line)]", headerPad)}>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-[var(--aw-strong)]"><HeadingIcon className={cn("h-4 w-4", skin.iconCls)} /> {title}</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--aw-text)]">{subtitle}</p>
          {tabsRow}
        </div>
      ) : (
        <div className={cn("border-b border-[var(--aw-line)]", skin.grad, headerPad)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-6">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-[var(--aw-strong)]"><HeadingIcon className={cn("h-4 w-4", skin.iconCls)} /> {title}</h2>
              <p className="mt-0.5 text-[11px] leading-snug text-[var(--aw-text)]">{subtitle}</p>
            </div>
            {variant === "modal" && (
              <button type="button" onClick={handleLater} title="Recordar luego" className="cursor-pointer rounded-lg p-1 text-[var(--aw-muted)] transition-colors hover:bg-[var(--aw-hover)] hover:text-[var(--aw-strong)]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {tabsRow}
          {/* Fuera de los 5 sistemas no hay fila de acciones: el enlace vuelve aquí. */}
          {!enSistemas && (
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
          )}
        </div>
      )}

      {/* Cuerpo: paneles transversales (resonancia · comparador · qué cambió) y
          debajo SOLO la sección activa. `key` compuesta sección+personalidad →
          cross-fade al cambiar de contexto (los paneles NO se remontan). */}
      <div
        ref={bodyRef}
        onTouchStart={onBodyTouchStart}
        onTouchEnd={onBodyTouchEnd}
        onTouchCancel={() => { swipeRef.current = null; }}
        onKeyDown={variant === "embedded" ? (e) => shortcutRef.current?.(e.nativeEvent) : undefined}
        className={cn(scrollBody, bodyPad, bodySpace)}
      >
        {/* DESAJUSTES DE RESONANCIA con su arreglo (§2.10). */}
        {showResonance && resonance && personaId !== ALL_PERSONAS && (
          <div id="aw-resonancia" className={cn(
            "rounded-xl border px-3 py-2.5",
            resonance.mismatches.length === 0 ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-amber-400/25 bg-amber-500/[0.06]",
          )}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
                <Waves className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                Resonancia de «{nameOf(personaId)}» aquí: {resonance.score}/100 · {resonance.label}
              </p>
              <button
                type="button"
                onClick={() => setShowResonance(false)}
                aria-label="Cerrar los desajustes de resonancia"
                className="shrink-0 cursor-pointer rounded-lg p-1 text-[var(--aw-muted)] transition-colors hover:bg-[var(--aw-hover)] hover:text-[var(--aw-strong)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {resonance.mismatches.length === 0 ? (
              <p className="mt-1 text-[10px] leading-snug text-[var(--aw-muted)]">
                Nada se contradice: lo que pide esta personalidad y lo que hace esta neurona apuntan en la misma dirección.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {resonance.mismatches.map((m) => (
                  <li key={m.id} className="rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2.5 py-2">
                    <p className="text-[11px] font-medium text-[var(--aw-strong)]">{m.label}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-[var(--aw-muted)]">{m.detail}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          try { m.arreglo(); } catch { /* */ }
                          try { toast.success("Arreglo aplicado", { description: `${m.arregloLabel} · ${SYSTEM_LABEL[m.system]}.` }); } catch { /* */ }
                        }}
                        className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-100 transition-colors duration-200 hover:bg-emerald-500/25"
                      >
                        <Wand2 className="h-3 w-3" aria-hidden="true" /> Arreglar · {m.arregloLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSection(SYSTEM_TAB[m.system])}
                        className={HEADER_CHIP}
                      >
                        Ver en {SECTION_META[SYSTEM_TAB[m.system]].label} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* COMPARADOR de personalidades (se descarga solo al desplegarlo).
            En la pestaña Astraura NO se pinta aquí: esa pestaña ya monta el
            mismo comparador como vista de RELACIONES (si no, salían DOS
            tablas idénticas apiladas al pulsar «Comparar» estando allí). */}
        {showCompare && currentSection !== "astraura" && (
          <PersonaCompareTable deviceId={deviceId} caps={caps} onClose={() => setShowCompare(false)} />
        )}

        {/* «QUÉ CAMBIÓ» tras aplicar, cuando son muchos cambios (§2.1). */}
        {diffCard && diffCard.length > 0 && (
          <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                Qué cambió en esta neurona ({diffCard.length})
              </p>
              <button
                type="button"
                onClick={() => setDiffCard(null)}
                aria-label="Cerrar el resumen de cambios"
                className="shrink-0 cursor-pointer rounded-lg p-1 text-[var(--aw-muted)] transition-colors hover:bg-[var(--aw-hover)] hover:text-[var(--aw-strong)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="mt-1 space-y-0.5">
              {diffCard.map((d, i) => (
                <li key={`${d.personaId}:${d.system}:${i}`} className="text-[10px] leading-snug text-[var(--aw-muted)]">
                  <span className="font-medium text-[var(--aw-text)]">{SYSTEM_LABEL[d.system]}</span>
                  {" · "}{nameOf(d.personaId)}: {d.antes} <ArrowRight className="inline h-2.5 w-2.5" aria-hidden="true" /> {d.despues}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          // La pestaña Astraura es la vista de RELACIONES entre personalidades:
          // cambiar de personalidad desde su tabla NO debe remontarla (perdía el
          // foco del botón pulsado y saltaba el scroll — rev. 3 olas · M7).
          key={currentSection === "astraura" ? "astraura" : `${currentSection}:${personaId}`}
          className={cn(bodySpace, "animate-in fade-in-0 slide-in-from-bottom-1 duration-200")}
        >
        {currentSection === "astraura" && (
          <div className={bodySpace}>
            {updatesCard}
            {/* (Adenda 179) INTRO del onboarding unificado: control EXPLÍCITO y
                configurable del motor de IA de ESTA neurona, con Astraura 1.58b
                local MARCADO por defecto (nativo StarSeed). Si el usuario no toca
                nada, la neurona ya funciona con ese predeterminado nativo. */}
            <div className="scroll-mt-2 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.05] px-3 py-2.5">
              <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
                <Cpu className="h-3.5 w-3.5 text-cyan-300" /> IA de esta neurona
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-medium text-cyan-200">Recomendado · Astraura 1.58b local</span>
              </p>
              <p className="mt-1 text-[10px] leading-snug text-[var(--aw-muted)]">
                Nativo de StarSeed: funciona sin conexión y sin coste. Ya está seleccionado por defecto — si no cambias nada, esta neurona usa Astraura 1.58b local (con los sistemas StarSeed). Puedes fijar otro motor abajo cuando quieras.
              </p>
              <div className="mt-2">
                <PrimaryChoiceEditor scope="neurona" scopeId={deviceId} context={{ deviceId }} scopeLabel="Esta neurona" compact />
              </div>
            </div>
            {/* RELACIONES de modelos y sistemas POR PERSONALIDAD (petición Alex
                2026-08-06): la pestaña Astraura es la vista de conjunto — qué
                modelo LLM, voz, memoria y señales usa CADA personalidad de la
                cuenta en esta neurona, con navegación directa: pulsar una
                personalidad la selecciona; pulsar un sistema abre su pestaña. */}
            <PersonaCompareTable
              deviceId={deviceId}
              caps={caps}
              title="Relaciones de modelos y sistemas por personalidad en esta neurona"
              onSelectPersona={(id) => setPersonaId(id)}
              onSelectSystem={(sys) =>
                setSection(sys === "llm" ? "astraura" : sys === "voz" ? "openvoice" : sys === "memoria" ? "cerebro" : "senales")
              }
            />
            {/* Modo/pago del sistema Astraura POR PERSONALIDAD (rev. A149·M3). */}
            <AstrauraPersonaCard personaId={personaId} deviceId={deviceId} caps={caps} />
            {/* (Adenda 193) Lo que antes vivía en la pestaña «LLM»: pines de
                fuente/modelo por personalidad y recomendador por hardware. Sin
                su PrimaryChoiceEditor (`hidePrimary`): el sistema primario ya
                está arriba, una sola vez, con 1.58b local marcado por defecto. */}
            <LlmSection personaId={personaId} deviceId={deviceId} caps={caps} compact={compact} full={variant === "embedded"} hidePrimary />
            <div className="scroll-mt-2 rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
                  <ListOrdered className="h-3.5 w-3.5 text-cyan-300" /> Orden de preferencia de motores IA
                </p>
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-pressed={scope === "cuenta"} onClick={() => setScope("cuenta")} className={pillCls(scope === "cuenta")}>
                    <User className="mr-1 inline h-3 w-3" /> Cuenta
                  </button>
                  <button type="button" aria-pressed={scope === "neurona"} onClick={() => setScope("neurona")} className={pillCls(scope === "neurona")}>
                    <Cpu className="mr-1 inline h-3 w-3" /> Esta neurona
                    {hasNeuronOverride && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-[var(--aw-muted)]">
                Prioridad con que Astraura intenta cada tipo de motor. En «Automático» puede reordenar según el dispositivo y el entorno; en «Fijo» respeta tu orden exacto.
                {scope === "cuenta" ? " Se aplica a toda neurona sin ajuste propio." : " Solo para esta neurona."}
              </p>

              {/* Estado del ámbito Neurona: hereda de la cuenta, o tiene ajuste propio */}
              {scope === "neurona" && (
                <div className={cn(
                  "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-[10px] leading-snug",
                  hasNeuronOverride ? "border-violet-400/25 bg-violet-500/[0.06] text-violet-100/80" : "border-[var(--aw-line)] bg-[var(--aw-surface-2)] text-[var(--aw-muted)]",
                )}>
                  {hasNeuronOverride ? (
                    <>
                      <span className="inline-flex items-center gap-1 font-semibold text-violet-200"><GitBranch className="h-3 w-3" /> Ajuste propio de esta neurona</span>
                      <span>· solo aplica en este dispositivo.</span>
                      <button type="button" onClick={removeNeuronOverride} className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-text)] transition-colors hover:border-rose-400/40 hover:text-rose-200">
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
                <button type="button" onClick={diagnoseAndRepair} disabled={diag.state === "run"} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2.5 py-1 text-[11px] text-[var(--aw-text)] transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50">
                  {diag.state === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />} Diagnosticar y reparar
                </button>
                {/* ARCHIVO de la neurona (§2.3): llevarse los 5 sistemas a otra
                    cuenta/dispositivo, o restaurarlos aquí. */}
                <button
                  type="button"
                  onClick={exportJson}
                  disabled={deviceOwn === 0}
                  title={deviceOwn === 0 ? "Todavía no hay ajustes propios que exportar en esta neurona" : "Descargar los ajustes de sistemas de esta neurona (.json)"}
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2.5 py-1 text-[11px] text-[var(--aw-text)] transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Exportar
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Cargar un archivo .json de configuración de sistemas en esta neurona"
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2.5 py-1 text-[11px] text-[var(--aw-text)] transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Importar
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Archivo de configuración de sistemas (.json)"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    void importJson(f);
                  }}
                />
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
                  <button key={m.value} type="button" title={m.hint} aria-pressed={activeMode === m.value} disabled={editingDisabled} onClick={() => setMode(m.value)} className={pillCls(activeMode === m.value)}>
                    {m.icon}{m.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-[var(--aw-muted)]">{MODE_OPTS.find((m) => m.value === activeMode)?.hint}</p>

              {/* Lista reordenable de clases de acceso */}
              <ol className={cn("mt-2 space-y-1.5", editingDisabled && "opacity-60")}>
                {activeOrder.map((cls, idx) => {
                  const meta = MODEL_ACCESS_META[cls];
                  const Icon = accessIcon(cls, meta?.icon);
                  return (
                    <li key={cls} className="flex items-center gap-2 rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-1.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-500/10 text-[10px] font-bold text-cyan-200">{idx + 1}</span>
                      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--aw-text)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-[var(--aw-strong)]">{meta?.label ?? cls}</span>
                        {meta?.hint && <span className="block truncate text-[10px] text-[var(--aw-muted)]">{meta.hint}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button type="button" aria-label={`Subir ${meta?.label ?? cls}`} disabled={editingDisabled || idx === 0} onClick={() => moveAccess(idx, -1)}
                          className="cursor-pointer rounded-md border border-[var(--aw-line)] bg-[var(--aw-surface)] p-1 text-[var(--aw-text)] transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[var(--aw-line)] disabled:hover:text-[var(--aw-text)]">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label={`Bajar ${meta?.label ?? cls}`} disabled={editingDisabled || idx === activeOrder.length - 1} onClick={() => moveAccess(idx, 1)}
                          className="cursor-pointer rounded-md border border-[var(--aw-line)] bg-[var(--aw-surface)] p-1 text-[var(--aw-text)] transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[var(--aw-line)] disabled:hover:text-[var(--aw-text)]">
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
                  <p className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--aw-muted)]"><span className="font-semibold text-cyan-200">Sugerido para este dispositivo:</span> {orderLabels(suggestedOrder)}</p>
                  <button type="button" onClick={useSuggested} className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25">
                    <Sparkles className="h-3 w-3" /> Usar sugerido
                  </button>
                </div>
              )}

              {/* Auto-actualización de catálogos + enlaces in-situ */}
              <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-[var(--aw-muted)]">
                <RefreshCw className="mt-px h-3 w-3 shrink-0 text-[var(--aw-faint)]" />
                <span>Los catálogos se auto-actualizan: OpenRouter (:free) cada 4 h y HuggingBay. Ajusta modelos propios y descargas por{" "}
                  {crossLink("neuronas", "neurona", "text-cyan-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-cyan-200")}, o las{" "}
                  {crossLink("integraciones", "fuentes externas", "text-fuchsia-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-fuchsia-200")}.
                </span>
              </p>
            </div>

            {/* Auto-actualización + novedades de fuentes (antes pestaña «Cuenta») */}
            <div className="rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--aw-strong)]">Actualización automática</span>
                  <span className="block text-[10px] leading-snug text-[var(--aw-muted)]">Aplica por defecto las mejores opciones cuando haya modelos o fuentes nuevos.</span>
                </span>
                <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
              </label>
              {newSources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {newSources.map((i) => (
                    <a key={i.id} href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-text)] hover:border-cyan-400/40 hover:text-cyan-200">
                      {i.name} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <p className="px-0.5 text-[10px] leading-snug text-[var(--aw-muted)]">{savedNote}</p>
          </div>
        )}

        {currentSection === "agentes" && <AgentesFondoSection compact={compact} />}
        {currentSection === "inteligencia" && <InteligenciaSection compact={compact} />}

        {currentSection === "openvoice" && (
          <OpenVoiceSection personaId={personaId} deviceId={deviceId} caps={caps} compact={compact} full={variant === "embedded"} />
        )}
        {currentSection === "cerebro" && (
          <CerebroSection
            personaId={personaId} deviceId={deviceId} caps={caps} compact={compact}
            full={variant === "embedded"} onDismiss={onDismiss} onNavigate={onNavigate}
          />
        )}
        {currentSection === "senales" && (
          <SenalesSection
            personaId={personaId} deviceId={deviceId} caps={caps} compact={compact}
            full={variant === "embedded"} onDismiss={onDismiss} onNavigate={onNavigate}
          />
        )}

        {currentSection === "neuronas" && <NeuronModelsPanel embedded />}
        {currentSection === "integraciones" && <IntegrationSourcesPanel embedded />}
        {currentSection === "apis" && <AiProvidersPanel embedded />}
        </div>
      </div>

      {/* Pie por variante (con la guía de primera vez y la leyenda de atajos) */}
      {variant === "modal" && (
        <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-[var(--aw-line)] bg-[var(--aw-bar)]", footerPad)}>
          {footerLead}
          <button type="button" onClick={handleLater} className={cn(FOOTER_BTN, "border-[var(--aw-line)] bg-[var(--aw-surface)] text-[var(--aw-text)] hover:border-[var(--aw-line-strong)]")}>
            Recordar luego
          </button>
          <button type="button" onClick={handleApply} className={cn(FOOTER_BTN, FOOTER_CTA)}>
            Aplicar y continuar
          </button>
        </div>
      )}
      {variant === "drawer" && (
        <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-[var(--aw-line)] bg-[var(--aw-bar)]", footerPad)}>
          {footerLead}
          <button type="button" onClick={() => onDismiss?.()} className={cn(FOOTER_BTN, "border-[var(--aw-line)] bg-[var(--aw-surface)] text-[var(--aw-text)] hover:border-[var(--aw-line-strong)]")}>
            Cerrar
          </button>
          <button type="button" onClick={handleApply} className={cn(FOOTER_BTN, FOOTER_CTA)}>
            Aplicar
          </button>
        </div>
      )}
      {variant === "embedded" && (
        <div className={cn("flex flex-wrap items-center gap-2 border-t border-[var(--aw-line)]", bodyPad)}>
          <button type="button" onClick={handleApply} className={cn(FOOTER_BTN, FOOTER_CTA, "gap-1.5")}>
            <Check className="h-3.5 w-3.5" /> Guardar
          </button>
          {saved && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300/90"><Check className="h-3.5 w-3.5" /> Guardado</span>}
          {footerLead}
        </div>
      )}
    </div>
  );
}

export default AstrauraOmniVoiceConfig;
