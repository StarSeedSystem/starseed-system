"use client";

/**
 * ChatConfigMenu — MENÚ UNIFICADO de configuración de chat de Astraura AI
 * (Adenda 71-bis · 2026-07-17, mejorado fix-11; rediseño 2026-09-24).
 *
 * 8 ajustes — Memorias · Personalidad · Sentidos · Motor de modelos ·
 * Capacidades · Habilidades · Conexiones · Conectividad — agrupados en 3
 * tarjetas temáticas («Quién es Astraura» · «Cómo piensa» · «Cómo percibe y
 * se conecta»), cada fila con su VALOR REAL resumido en una frase y una
 * insignia de ALCANCE («Este chat» / «Tu cuenta · sincronizado» / «Este
 * dispositivo» / «Valor de fábrica»). Nada se inventa: cada resumen sale de
 * la misma fuente que ya usaba el menú anterior — sólo cambia cómo se
 * redacta y se agrupa (lógica pura en `lib/astraura/resumen-ajustes-chat.ts`).
 *
 * Cada ajuste es modulable POR CHAT, recordado e interconectado vía la
 * cuenta (aurora_conversations.meta.config, sincronizado en tiempo real).
 * Las secciones reflejan el estado VIVO del sistema:
 *   · Sentidos   → SENSES[] + getActiveSenses()  (lib/senses/senses.ts)
 *   · Conexiones → getOssServices()              (lib/services/oss-connections.ts)
 *   · Capacidades→ getCapabilities()             (lib/aurora/capabilities.ts)
 *   · Personalidad/Modelos → setActivePersonality / setActiveProviderId
 * Diseño adaptado por contexto (exocortex / orbe / astraura) y responsive
 * (hoja inferior en móvil, diálogo centrado en escritorio — lo resuelve el
 * contenedor portal que abre este menú).
 */

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import {
  Brain, UserRound, Eye, Cpu, Boxes, Zap, Network, RadioTower,
  Check, ChevronRight, X, Plus, Search, RotateCcw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ConnectivityConfigPanel } from "@/components/connectivity/connectivity-config-panel";
import { normalizeConnectivityConfig, type ConnectivityConfig } from "@/ai/astraura/mesh";
import {
  listPersonalityProfiles, setActivePersonality, resolvePersonalityForContext,
  getPersonalityAssignments,
} from "@/lib/aurora/personalities";
import { patchChatConfig } from "@/lib/aurora/config-change";
import { cachedConversations, AI_CONV_CHANGE_EVENT, useAiConversations } from "@/lib/aurora/conversations";
import { loadConfigs, getActiveProviderId, setActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";
import { SENSES, getActiveSenses, setActiveSenses } from "@/lib/senses/senses";
import { getOssServices } from "@/lib/services/oss-services";
import { readConnections } from "@/lib/services/oss-connections";
import { getCapabilities } from "@/lib/aurora/capabilities";
import { activeCapabilityIds } from "@/ai/astraura/skills";
import {
  alcanceConRespaldo,
  insigniaAlcance,
  resumenPersonalidad,
  resumenModelo,
  resumenMemorias,
  resumenSentidos,
  resumenCapacidades,
  resumenHabilidades,
  resumenConexiones,
  resumenConectividad,
  resumenInterruptor,
  filaCoincideBusqueda,
  GRUPOS_AJUSTES_CHAT,
  type AlcanceAjuste,
} from "@/lib/astraura/resumen-ajustes-chat";

export type ChatConfigContext = "exocortex" | "orbe" | "astraura";
/** Alias mantenido para ChatHeaderOptions (antes venía de personality-options-window). */
export type PersonalityOptionContext = ChatConfigContext;

export interface ChatConfig {
  personalityId?: string | null;
  provider?: string | null;
  capabilities?: Record<string, boolean>;
  skills?: string[];
  connections?: string[];
  memoryScope?: string;
  senses?: Record<string, boolean>;
  /** Conectividad (señales/internet/privacidad) por chat — Adenda 100 (panel compartido). */
  connectivity?: ConnectivityConfig;
  /** Voz (Aurora habla) por chat — Adenda 71-bis. */
  voice?: boolean;
  /** Registro (historial persistente) por chat — Adenda 71-bis. */
  log?: boolean;
  // ── Espacios de trabajo y compartir (Adenda 76) ──
  /** Espacio de trabajo al que pertenece el chat. */
  workspaceId?: string;
  /** Snapshot de las instrucciones del espacio (inyectado al system prompt). */
  workspaceInstructions?: string;
  /** Fijado: ordena arriba dentro de su carpeta. */
  pinned?: boolean;
  /** Destinatarios con los que se compartió (AccessGrant[] denormalizado). */
  sharedWith?: unknown[];
  /** Espejo os_spaces del chat compartido (snapshot en grupo). */
  sharedSpaceId?: string | null;
  /** Conversación de origen si este chat es una rama. */
  branchedFrom?: string;
}

/** Etiqueta legible del proveedor/modelo guardado por chat (Adenda 71-bis fix-21). */
export function providerLabel(id?: string | null): string | null {
  if (!id) return null;
  try {
    const cfgs = loadConfigs() as Array<{ id: string; label?: string }>;
    const hit = cfgs.find((c) => c.id === id);
    if (hit?.label) return hit.label;
  } catch { /* noop */ }
  try {
    const p = (PROVIDERS as Record<string, { label?: string }>)[id];
    if (p?.label) return p.label;
  } catch { /* noop */ }
  return id;
}

const THEMES: Record<ChatConfigContext, { ring: string; grad: string; accent: string; btn: string }> = {
  exocortex: {
    ring: "border-violet-400/40",
    grad: "from-violet-600/25 via-fuchsia-600/10 to-black/70",
    accent: "text-violet-200",
    btn: "border-violet-400/30 text-violet-100 hover:bg-violet-500/15",
  },
  orbe: {
    ring: "border-cyan-400/40",
    grad: "from-cyan-600/25 via-sky-600/10 to-black/70",
    accent: "text-cyan-200",
    btn: "border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/15",
  },
  astraura: {
    ring: "border-fuchsia-400/40",
    grad: "from-fuchsia-600/25 via-pink-600/10 to-black/70",
    accent: "text-fuchsia-200",
    btn: "border-fuchsia-400/30 text-fuchsia-100 hover:bg-fuchsia-500/15",
  },
};

const SECTION_DEFS = [
  { key: "memorias", label: "Memorias", Icon: Brain },
  { key: "personalidad", label: "Personalidad", Icon: UserRound },
  { key: "sentidos", label: "Sentidos", Icon: Eye },
  { key: "modelos", label: "Motor de modelos", Icon: Cpu },
  { key: "capacidades", label: "Capacidades", Icon: Boxes },
  { key: "habilidades", label: "Habilidades", Icon: Zap },
  { key: "conexiones", label: "Conexiones", Icon: Network },
  { key: "conectividad", label: "Conectividad", Icon: RadioTower },
] as const;

// Etiquetas legibles de categoría de conexiones (Adenda 71-bis fix-22).
const CATEGORY_LABELS: Record<string, string> = {
  llm: "Modelos / Chat",
  stt: "Voz → Texto",
  tts: "Texto → Voz",
  image: "Imagen",
  video: "Vídeo",
  workflow: "Automatización",
  calendar: "Agenda",
  docs: "Documentos",
  design: "Diseño",
  website: "Web / Sitios",
};
// Orden de grupo al renderizar la sección Conexiones.
const CATEGORY_ORDER = ["llm", "stt", "tts", "image", "video", "workflow", "calendar", "docs", "design", "website"];

// Filtro de búsqueda para la sección Conexiones (Adenda 71-bis fix-23).
function matchesConn(c: { label: string; purpose: string; category: string }, q: string): boolean {
  if (!q.trim()) return true;
  const t = q.trim().toLowerCase();
  return (
    c.label.toLowerCase().includes(t) ||
    c.purpose.toLowerCase().includes(t) ||
    c.category.toLowerCase().includes(t)
  );
}

// Abre el panel de conexiones OSS preseleccionando un servicio (Adenda 71-bis fix-23).
function openConnect(serviceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.open(`/servicios?connect=${encodeURIComponent(serviceId)}`, "_blank", "noopener");
  } catch {
    window.location.href = `/servicios?connect=${encodeURIComponent(serviceId)}`;
  }
}

type SectionKey = (typeof SECTION_DEFS)[number]["key"];

const SKILL_KEYS = ["taste", "pm", "web-senses", "research", "vision", "voice", "planning", "memory"] as const;
const SKILL_LABELS: Record<string, string> = {
  taste: "Gusto / preferencia", pm: "Project manager", "web-senses": "Sentidos web",
  research: "Investigación", vision: "Visión", voice: "Voz", planning: "Planificación", memory: "Memoria",
};
const CAP_LABELS: Record<string, string> = {
  mic: "Micrófono", voice: "Voz", vision: "Visión", web: "Web", file: "Archivos",
  memory: "Memoria", cron: "Cron", location: "Ubicación",
};
const MEM_SCOPES = ["personal", "compartida", "cerebro-activo", "todas"] as const;
/** Alcance de memoria por defecto del sistema (marcado "(default)" si el chat no fijó uno). */
const DEFAULT_MEM_SCOPE = "todas";
/** Explicación de una frase de cada alcance de memoria (copy en español llano). */
const MEM_SCOPE_HINTS: Record<string, string> = {
  personal: "solo tus memorias privadas",
  compartida: "memorias que compartes con tu equipo o espacio",
  "cerebro-activo": "solo las del cerebro que tengas activo ahora",
  todas: "todas las memorias a las que tienes acceso",
};

export function ChatConfigMenu({
  convId, context = "astraura", onClose,
}: {
  convId?: string | null;
  context?: ChatConfigContext;
  onClose?: () => void;
}) {
  const theme = THEMES[context];
  const [cfg, setCfg] = useState<ChatConfig>({});
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [personalities, setPersonalities] = useState<{ id: string; name: string; personaje?: string }[]>([]);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [senses, setSenses] = useState<{ id: string; label: string }[]>([]);
  const [sensesActive, setSensesActive] = useState<string[]>([]);
  const [connections, setConnections] = useState<{ id: string; label: string; category: string; purpose: string; connected: boolean }[]>([]);
  const [capsEnv, setCapsEnv] = useState<Record<string, boolean>>({});
  /** Habilidades activas en el sistema (lo que el router usa cuando el chat no elige ninguna). */
  const [skillsActivas, setSkillsActivas] = useState<string[]>([]);
  const [connQuery, setConnQuery] = useState("");
  /** Filtro de búsqueda GLOBAL del menú (por nombre o por el resumen de la fila). */
  const [query, setQuery] = useState("");
  /** Capacidades del dispositivo bajo «Avanzado» (colapsadas por defecto: técnicas, no urgentes). */
  const [avanzadoCap, setAvanzadoCap] = useState(false);
  // Estado EFECTIVO global (Adenda 71-ter · fix convId): cuando el chat no fijó
  // un valor, el menú muestra el estado REAL del sistema (personalidad activa,
  // proveedor activo, sentidos activos) en vez de "sin selección".
  const [effPersonalityId, setEffPersonalityId] = useState<string | null>(null);
  const [effProvider, setEffProvider] = useState<string | null>(null);

  // Título del chat al que se aplica este menú (real: viene de la MISMA lista
  // unificada de conversaciones que usa el resto del OS, nunca inventado).
  const { conversations } = useAiConversations();
  const chatTitle = convId ? conversations.find((c) => c.id === convId)?.title ?? null : null;

  const load = useCallback(async () => {
    let initial: ChatConfig = {};
    if (convId) {
      try {
        const sb = createClient();
        const { data } = await sb.from("aurora_conversations").select("meta").eq("id", convId).maybeSingle();
        const meta = (data?.meta as any) || {};
        initial = meta.config || {};
      } catch { /* */ }
    }
    setCfg(initial);
    // (Adenda 71-ter · Task 10) Nube → local: si el chat fijó una personalidad en
    // meta.config (fuente de verdad en la nube), la reflejamos en la asignación
    // POR CHAT de localStorage para que resolvePersonalityForContext la respete en
    // ESTE dispositivo (compat cross-device). Sólo si difiere (idempotente).
    if (convId && initial.personalityId) {
      try {
        const cur = getPersonalityAssignments().porChat[convId];
        if (cur !== initial.personalityId) setActivePersonality({ scope: "chat", chatId: convId }, initial.personalityId);
      } catch { /* */ }
    }
    // Personalidad/proveedor EFECTIVOS (para hidratar el estado mostrado).
    try { setEffPersonalityId(resolvePersonalityForContext({ chatId: convId ?? undefined })?.id ?? null); } catch { setEffPersonalityId(null); }
    try { setEffProvider(getActiveProviderId() ?? null); } catch { setEffProvider(null); }
    try {
      setPersonalities(listPersonalityProfiles().map((p) => ({ id: p.id, name: p.name, personaje: p.personaje })));
    } catch { /* */ }
    try {
      const cfgs = loadConfigs();
      const provs = PROVIDERS as Record<string, unknown>;
      setProviders(cfgs.map((c: any) => ({ id: c.id, label: c.label || c.id })).filter((p: any) => provs[p.id]));
    } catch { /* */ }
    try { setSenses(SENSES.map((s) => ({ id: s.id, label: s.label }))); } catch { /* */ }
    try { setSensesActive(getActiveSenses()); } catch { /* */ }
    try { setSkillsActivas(activeCapabilityIds()); } catch { /* */ }
    try {
      const connectedIds = new Set(readConnections().map((c) => c.serviceId));
      setConnections(
        getOssServices().map((s: any) => ({
          id: s.id,
          label: s.name || s.id,
          category: s.category || "other",
          purpose: s.purpose || "",
          connected: connectedIds.has(s.id),
        })),
      );
    } catch { /* */ }
    try {
      const c = getCapabilities();
      setCapsEnv({
        mic: c.micPermission === "granted",
        voice: c.hasTTS,
        vision: c.hasMediaDevices,
        web: true, file: true, memory: true, cron: true, location: c.isMobile !== undefined,
      });
    } catch { /* */ }
  }, [convId]);

  useEffect(() => { load(); }, [load]);

  // (Adenda 76 · Task 5) SINCRONIZACIÓN EN VIVO por chat: cuando el meta.config de
  // ESTE chat cambia (otra superficie, otro dispositivo, o el propio espacio de
  // trabajo que le inyecta workspaceId/instrucciones), re-hidratamos desde la
  // caché unificada (mantenida al día por el sync realtime). Así las filas
  // reflejan el estado REAL sin necesidad de reabrir el menú.
  useEffect(() => {
    if (!convId) return;
    const rehydrate = () => {
      try {
        const conv = cachedConversations().find((c) => c.id === convId);
        const c = (conv?.meta as { config?: ChatConfig } | null | undefined)?.config;
        if (c && typeof c === "object") setCfg(c);
      } catch { /* */ }
    };
    window.addEventListener(AI_CONV_CHANGE_EVENT, rehydrate);
    return () => window.removeEventListener(AI_CONV_CHANGE_EVENT, rehydrate);
  }, [convId]);

  // (Adenda 76 · Task 5) ESCRITURA CANÓNICA: todos los cambios pasan por
  // `patchChatConfig` (config-change.ts), que hace read-modify-write en la NUBE
  // (sin pisar campos que otra superficie añadió a meta.config: workspaceId,
  // sharedWith, pinned…), refleja el cambio en la CACHÉ local al instante (para
  // que `getChatConfig`/turn.ts lo vea en el próximo turno) e inserta el divisor
  // "⚙️ Ajustes del chat actualizados". Un campo con valor `undefined` en el
  // patch (p.ej. al "Restablecer" una sección) lo QUITA del chat: al serializar
  // a JSON esa clave desaparece y las lecturas (`cfg.x ?? valorEfectivo`) vuelven
  // a heredar el valor efectivo del sistema.
  const patch = useCallback((p: Partial<ChatConfig>) => {
    setCfg((prev) => ({ ...prev, ...p }));
    if (!convId) return;
    void patchChatConfig(convId, p);
  }, [convId]);

  // AJUSTES POR DEFECTO VISIBLES (2026-09-05): cada opción enseña su estado EFECTIVO —lo que
  // el router usa de verdad cuando el chat no dice nada— y no «apagado» por el mero hecho de
  // no haberse tocado. Capacidades: lo que este dispositivo tiene; habilidades: las activas en
  // el sistema (`activeCapabilityIds`); conexiones: los servicios conectados. Tocar una opción
  // parte de ese valor efectivo, no de «false».
  const capEfectiva = (k: string): boolean => cfg.capabilities?.[k] ?? capsEnv[k] !== false;
  const skillEfectiva = (k: string): boolean => (cfg.skills ? cfg.skills.includes(k) : skillsActivas.includes(k));
  const conexionEfectiva = (id: string, conectada: boolean): boolean => (cfg.connections ? cfg.connections.includes(id) : conectada);

  const toggleCap = (k: string) => {
    const caps = { ...(cfg.capabilities || {}) };
    caps[k] = !capEfectiva(k);
    patch({ capabilities: caps });
  };
  const toggleSense = (k: string) => {
    const s = { ...(cfg.senses || {}) };
    s[k] = !s[k];
    patch({ senses: s });
    // Hace el toggle REAL en el sistema: recalcula el set activo y persiste.
    try {
      const live = SENSES.map((x) => x.id).filter((id) => (id === k ? s[k] : (cfg.senses?.[id] ?? sensesActive.includes(id))));
      void setActiveSenses(live);
    } catch { /* */ }
  };
  const toggleVoice = () => patch({ voice: !(cfg.voice !== false) });
  const toggleLog = () => patch({ log: !(cfg.log !== false) });
  const toggleSkill = (k: string) => {
    // Sin elección explícita, la lista de partida es la activa en el sistema.
    const arr = cfg.skills ? [...cfg.skills] : SKILL_KEYS.filter((id) => skillsActivas.includes(id));
    const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    patch({ skills: arr });
  };
  const toggleConn = (k: string) => {
    // Sin elección explícita, el chat puede usar todo lo conectado: se parte de ahí.
    const arr = cfg.connections ? [...cfg.connections] : connections.filter((c) => c.connected).map((c) => c.id);
    const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    patch({ connections: arr });
  };

  const setPersonality = (id: string) => {
    patch({ personalityId: id });
    try { setActivePersonality({ scope: "chat", chatId: convId || "" }, id); } catch { /* */ }
  };
  const resetPersonalidad = () => {
    patch({ personalityId: undefined });
    try { setActivePersonality({ scope: "chat", chatId: convId || "" }, null); } catch { /* */ }
  };
  const setProvider = (id: string) => {
    patch({ provider: id });
    try { setActiveProviderId(id as any); } catch { /* */ }
  };

  // ── Resúmenes reales por fila (lógica pura en resumen-ajustes-chat.ts) ──────
  const personalidadActivaId = cfg.personalityId ?? effPersonalityId;
  const personalidadActiva = personalidadActivaId ? personalities.find((p) => p.id === personalidadActivaId) ?? null : null;
  const modeloId = cfg.provider ?? effProvider ?? null;
  const modeloEtiqueta = providerLabel(modeloId);
  const memoriaValor = cfg.memoryScope ?? DEFAULT_MEM_SCOPE;
  const sentidosActivosCount = senses.filter((s) => cfg.senses?.[s.id] ?? sensesActive.includes(s.id)).length;
  const capLabelKeys = Object.keys(CAP_LABELS);
  const capacidadesActivasCount = capLabelKeys.filter((k) => capsEnv[k] !== false && capEfectiva(k)).length;
  const habilidadesActivasCount = SKILL_KEYS.filter((k) => skillEfectiva(k)).length;
  const conexionesConectadasCount = connections.filter((c) => c.connected).length;
  const conexionesEnUsoCount = cfg.connections ? cfg.connections.length : conexionesConectadasCount;
  const connectivityEfectiva = normalizeConnectivityConfig(cfg.connectivity);

  const detalleFila: Record<SectionKey, { resumen: string; alcance: AlcanceAjuste }> = {
    personalidad: {
      resumen: resumenPersonalidad({
        nombre: personalidadActiva?.name ?? null,
        matiz: personalidadActiva?.personaje ?? null,
        esDeEsteChat: !!cfg.personalityId,
      }),
      alcance: alcanceConRespaldo(!!cfg.personalityId, "cuenta"),
    },
    memorias: {
      resumen: resumenMemorias({ alcanceMemoria: memoriaValor, esDeEsteChat: !!cfg.memoryScope }),
      alcance: alcanceConRespaldo(!!cfg.memoryScope, "predeterminado"),
    },
    modelos: {
      resumen: resumenModelo({ etiqueta: modeloEtiqueta, esDeEsteChat: !!cfg.provider }),
      alcance: cfg.provider ? "chat" : effProvider ? "dispositivo" : "predeterminado",
    },
    capacidades: {
      resumen: resumenCapacidades({ activas: capacidadesActivasCount, total: capLabelKeys.length }),
      alcance: alcanceConRespaldo(!!(cfg.capabilities && Object.keys(cfg.capabilities).length > 0), "dispositivo"),
    },
    habilidades: {
      resumen: resumenHabilidades({ activas: habilidadesActivasCount, total: SKILL_KEYS.length }),
      alcance: alcanceConRespaldo(!!cfg.skills, "cuenta"),
    },
    sentidos: {
      resumen: resumenSentidos({ activos: sentidosActivosCount, total: senses.length }),
      alcance: alcanceConRespaldo(!!(cfg.senses && Object.keys(cfg.senses).length > 0), "cuenta"),
    },
    conexiones: {
      resumen: resumenConexiones({ enUso: conexionesEnUsoCount, conectados: conexionesConectadasCount, total: connections.length }),
      alcance: alcanceConRespaldo(!!cfg.connections, "dispositivo"),
    },
    conectividad: {
      resumen: resumenConectividad({
        internetMode: connectivityEfectiva.internetMode,
        meshEnabled: connectivityEfectiva.meshEnabled,
        esDeEsteChat: !!cfg.connectivity,
      }),
      alcance: alcanceConRespaldo(!!cfg.connectivity, "predeterminado"),
    },
  };

  const grupoConFilas = GRUPOS_AJUSTES_CHAT.map((grupo) => ({
    grupo,
    filas: grupo.claves
      .map((clave) => SECTION_DEFS.find((s) => s.key === clave))
      .filter((s): s is (typeof SECTION_DEFS)[number] => !!s)
      .filter((s) => filaCoincideBusqueda({ etiqueta: s.label, resumen: detalleFila[s.key].resumen }, query)),
  }));
  const hayResultados = grupoConFilas.some((g) => g.filas.length > 0);

  const tituloVozSwitch = resumenInterruptor({
    etiquetaEncendido: "Aurora también responde en voz",
    etiquetaApagado: "Aurora solo responde en texto",
    encendido: cfg.voice !== false,
    esDeEsteChat: cfg.voice !== undefined,
  });
  const tituloRegistroSwitch = resumenInterruptor({
    etiquetaEncendido: "este chat queda guardado en tu historial",
    etiquetaApagado: "este chat no se guarda en tu historial",
    encendido: cfg.log !== false,
    esDeEsteChat: cfg.log !== undefined,
  });

  const renderDetalle = (key: SectionKey): React.ReactNode => {
    switch (key) {
      case "personalidad":
        return (
          <Section
            title="Personalidad de este chat"
            helper="Cambia cómo habla y qué prioriza Astraura SOLO en esta conversación; tus demás chats no se ven afectados."
          >
            {personalities.map((p) => (
              <Row
                key={p.id}
                label={p.name}
                hint={!cfg.personalityId && effPersonalityId === p.id ? `activa en tu cuenta${p.personaje ? ` · ${p.personaje}` : ""}` : p.personaje}
                active={(cfg.personalityId ?? effPersonalityId) === p.id}
                onClick={() => setPersonality(p.id)}
              />
            ))}
            {cfg.personalityId && (
              <ResetButton label="Usar la personalidad de tu cuenta" onClick={resetPersonalidad} />
            )}
          </Section>
        );
      case "modelos":
        return (
          <Section
            title="Motor de modelos"
            helper="Fuerza qué IA responde SOLO en este chat. Sin elegir nada, Astraura usa el motor activo de este dispositivo o, si tampoco hay uno, el mejor gratuito disponible."
          >
            {providers.map((p) => (
              <Row
                key={p.id}
                label={p.label}
                hint={!cfg.provider && effProvider === p.id ? "activo en este dispositivo" : undefined}
                active={(cfg.provider ?? effProvider) === p.id}
                onClick={() => setProvider(p.id)}
              />
            ))}
            {cfg.provider && (
              <ResetButton label="Usar el motor de este dispositivo" onClick={() => patch({ provider: undefined })} />
            )}
          </Section>
        );
      case "capacidades":
        return (
          <Section
            title="Capacidades de este dispositivo"
            helper="Lo que este navegador puede hacer de verdad (micrófono, voz, archivos…) se detecta solo. Apágalas aquí solo si quieres que Astraura las ignore EN ESTE chat."
          >
            <button
              type="button"
              onClick={() => setAvanzadoCap((v) => !v)}
              aria-expanded={avanzadoCap}
              className="flex min-h-[32px] items-center gap-1 rounded-md px-1 text-[10px] text-white/40 transition hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <ChevronRight className={cn("w-3 h-3 transition-transform", avanzadoCap && "rotate-90")} />
              Avanzado · {capLabelKeys.length} capacidades técnicas
            </button>
            {avanzadoCap && capLabelKeys.map((k) => (
              <Row
                key={k}
                label={CAP_LABELS[k]}
                hint={capsEnv[k] === false ? "no disponible en este dispositivo" : cfg.capabilities?.[k] === undefined ? "por defecto" : undefined}
                active={capsEnv[k] !== false && capEfectiva(k)}
                onClick={() => toggleCap(k)}
              />
            ))}
            {cfg.capabilities && Object.keys(cfg.capabilities).length > 0 && (
              <ResetButton label="Restablecer capacidades" onClick={() => patch({ capabilities: undefined })} />
            )}
          </Section>
        );
      case "sentidos":
        return (
          <Section
            title="Sentidos activos"
            helper="Lo que Astraura puede percibir del entorno. Aviso: cambiar un sentido aquí también lo cambia para TODA tu cuenta, no solo para este chat."
          >
            {senses.map((s) => (
              <Row
                key={s.id}
                label={s.label}
                hint={sensesActive.includes(s.id) ? "activo en tu cuenta" : undefined}
                active={cfg.senses?.[s.id] ?? sensesActive.includes(s.id)}
                onClick={() => toggleSense(s.id)}
              />
            ))}
          </Section>
        );
      case "habilidades":
        return (
          <Section
            title="Habilidades (skills de Astraura)"
            helper="Qué sabe hacer Astraura en este chat (investigar, planificar, ver imágenes…). Sin elegir nada, usa las habilidades activas de tu cuenta."
          >
            {SKILL_KEYS.map((k) => (
              <Row
                key={k}
                label={SKILL_LABELS[k] || k}
                hint={!cfg.skills && skillsActivas.includes(k) ? "activa en tu cuenta" : undefined}
                active={skillEfectiva(k)}
                onClick={() => toggleSkill(k)}
              />
            ))}
            {cfg.skills && (
              <ResetButton label="Usar las habilidades de tu cuenta" onClick={() => patch({ skills: undefined })} />
            )}
          </Section>
        );
      case "conexiones":
        return (
          <Section
            title="Conexiones (servicios del ecosistema)"
            helper="Qué servicios externos puede usar Astraura en este chat. «Conectar» te lleva a Servicios para darle un endpoint o clave."
          >
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                value={connQuery}
                onChange={(e) => setConnQuery(e.target.value)}
                placeholder="Buscar conexión…"
                aria-label="Buscar una conexión"
                className="w-full rounded-lg border border-white/10 bg-black/30 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20"
              />
            </div>
            <div className="space-y-3">
              {CATEGORY_ORDER.filter((cat) => connections.some((c) => c.category === cat && matchesConn(c, connQuery))).map((cat) => (
                <div key={cat}>
                  <div className="text-[10px] uppercase tracking-wider text-white/35 mb-1">{CATEGORY_LABELS[cat] || cat}</div>
                  <div className="space-y-1">
                    {connections.filter((c) => c.category === cat && matchesConn(c, connQuery)).map((c) => (
                      <Row
                        key={c.id}
                        label={c.label}
                        hint={c.connected ? `conectado${!cfg.connections ? " · por defecto" : ""} · ${c.purpose}` : c.purpose}
                        connected={c.connected}
                        active={conexionEfectiva(c.id, c.connected)}
                        onClick={() => toggleConn(c.id)}
                        action={
                          !c.connected ? (
                            <button
                              title={`Conectar ${c.label}`}
                              onClick={(e) => { e.stopPropagation(); openConnect(c.id); }}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                            >
                              <Plus className="w-3 h-3" /> Conectar
                            </button>
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
              {CATEGORY_ORDER.every((cat) => !connections.some((c) => c.category === cat && matchesConn(c, connQuery))) && (
                <div className="text-[11px] text-white/30 px-1 py-2">Sin resultados para “{connQuery}”.</div>
              )}
            </div>
            {cfg.connections && (
              <ResetButton label="Usar las conexiones de este dispositivo" onClick={() => patch({ connections: undefined })} />
            )}
          </Section>
        );
      case "memorias":
        return (
          <Section title="Memorias accesibles por este chat" helper="Qué memorias puede leer Astraura al responder en este chat.">
            {MEM_SCOPES.map((k) => (
              <Row
                key={k}
                label={k}
                hint={!cfg.memoryScope && DEFAULT_MEM_SCOPE === k ? `${MEM_SCOPE_HINTS[k]} · valor por defecto` : MEM_SCOPE_HINTS[k]}
                active={(cfg.memoryScope ?? DEFAULT_MEM_SCOPE) === k}
                onClick={() => patch({ memoryScope: k })}
              />
            ))}
            {cfg.memoryScope && (
              <ResetButton label="Usar el valor por defecto" onClick={() => patch({ memoryScope: undefined })} />
            )}
          </Section>
        );
      case "conectividad":
        return (
          <div className="space-y-2">
            <p className="px-1 text-[11px] leading-snug text-white/40">
              Cómo se conecta Astraura a la red EN ESTE CHAT: malla local, internet público, servidores privados o solo tu cuenta.
            </p>
            <ConnectivityConfigPanel
              mode="portable"
              compact
              contextLabel="este chat"
              value={connectivityEfectiva}
              onChange={(next) => patch({ connectivity: next })}
            />
            {cfg.connectivity && (
              <ResetButton label="Usar el valor por defecto" onClick={() => patch({ connectivity: undefined })} />
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "flex max-h-[92dvh] w-[40rem] max-w-[94vw] flex-col overflow-hidden rounded-t-2xl border backdrop-blur-2xl text-white shadow-2xl sm:max-h-[85dvh] sm:rounded-2xl",
        theme.ring, theme.grad,
      )}
    >
      {/* Cabecera fija: título, chat al que se aplica y cerrar. */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <div className={cn("text-sm font-light tracking-wide", theme.accent)}>Configuración del chat · Astraura IA</div>
          <div className="mt-0.5 truncate text-[11px] text-white/40">
            {chatTitle ? `Ajustando: ${chatTitle}` : "Este chat todavía no tiene nombre"}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar configuración del chat"
            className="shrink-0 rounded-full p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Leyenda de alcance: qué significa cada insignia de color. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2 text-[10px] text-white/35">
        <LegendDot color="bg-fuchsia-400" label={insigniaAlcance("chat").etiqueta} />
        <LegendDot color="bg-emerald-400" label={insigniaAlcance("cuenta").etiqueta} />
        <LegendDot color="bg-sky-400" label={insigniaAlcance("dispositivo").etiqueta} />
        <LegendDot color="bg-white/40" label={insigniaAlcance("predeterminado").etiqueta} />
      </div>

      {/* Chips con CUENTAS REALES (no adorno) + interruptores rápidos que ya existían. */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-1.5 pt-2 text-[10px] text-white/55">
        <span className="rounded-full bg-white/5 px-2 py-1" title={detalleFila.conexiones.resumen}>
          🔗 {conexionesEnUsoCount}/{conexionesConectadasCount}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-1" title={detalleFila.habilidades.resumen}>
          ⚡ {habilidadesActivasCount}/{SKILL_KEYS.length}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-1" title={detalleFila.sentidos.resumen}>
          👁 {sentidosActivosCount}/{senses.length}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4 px-4 pb-2 text-[11px] text-white/65">
        <label className="inline-flex cursor-pointer items-center gap-2" title={tituloVozSwitch}>
          <Switch checked={cfg.voice !== false} onCheckedChange={() => toggleVoice()} aria-label="Voz de Aurora en este chat" />
          <span>Voz{cfg.voice === undefined && <span className="text-white/30"> · por defecto</span>}</span>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2" title={tituloRegistroSwitch}>
          <Switch checked={cfg.log !== false} onCheckedChange={() => toggleLog()} aria-label="Registro de este chat" />
          <span>Registro{cfg.log === undefined && <span className="text-white/30"> · por defecto</span>}</span>
        </label>
      </div>

      {/* Buscador de ajustes (opcional pero útil con 8 secciones). */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar un ajuste del chat…"
            aria-label="Buscar un ajuste del chat"
            className="w-full rounded-lg border border-white/10 bg-black/30 pl-8 pr-2.5 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20"
          />
        </div>
      </div>

      {/* Cuerpo con scroll: tarjetas agrupadas por tema. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 space-y-3">
        {grupoConFilas.map(({ grupo, filas }) => {
          if (filas.length === 0) return null;
          return (
            <div key={grupo.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <div className="px-3 pt-3 pb-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{grupo.titulo}</div>
                <div className="text-[10px] text-white/35">{grupo.descripcion}</div>
              </div>
              <div className="space-y-0.5 p-1.5">
                {filas.map((f) => {
                  const detalle = detalleFila[f.key];
                  const isOpen = open === f.key;
                  return (
                    <div key={f.key}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : f.key)}
                        aria-expanded={isOpen}
                        aria-controls={`ajuste-chat-panel-${f.key}`}
                        className={cn(
                          "flex min-h-[44px] w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                          isOpen && "bg-white/5 ring-1 ring-white/20",
                        )}
                      >
                        <f.Icon className="mt-0.5 w-4 h-4 shrink-0 text-white/70" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-medium text-white">{f.label}</span>
                            <ScopeBadge alcance={detalle.alcance} />
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-white/45">{detalle.resumen}</span>
                        </span>
                        <ChevronRight className={cn("mt-1 w-4 h-4 shrink-0 text-white/30 transition-transform", isOpen && "rotate-90")} />
                      </button>
                      {isOpen && (
                        <div id={`ajuste-chat-panel-${f.key}`} className="px-1 pb-2 pt-1.5">
                          {renderDetalle(f.key)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!hayResultados && (
          <div className="px-2 py-8 text-center text-[12px] text-white/35">Sin resultados para “{query}”.</div>
        )}
      </div>
    </div>
  );
}

/** Punto de color + etiqueta de la leyenda de alcance. */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} aria-hidden="true" />
      {label}
    </span>
  );
}

const ALCANCE_BADGE_CLASS: Record<AlcanceAjuste, string> = {
  chat: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200",
  cuenta: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  dispositivo: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  predeterminado: "border-white/15 bg-white/5 text-white/45",
};

/** Insignia de alcance de una fila ("Este chat" · "Tu cuenta" · "Este dispositivo" · "Valor de fábrica"). */
function ScopeBadge({ alcance }: { alcance: AlcanceAjuste }) {
  const ins = insigniaAlcance(alcance);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
        ALCANCE_BADGE_CLASS[alcance],
      )}
      title={ins.descripcion}
    >
      {ins.etiqueta}
    </span>
  );
}

/** Botón "Restablecer" que aparece solo cuando el chat tiene un valor propio en esa sección. */
function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/50 transition hover:border-white/25 hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      <RotateCcw className="w-3 h-3" /> {label}
    </button>
  );
}

function Section({ title, helper, children }: { title: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/25 p-3">
      <div className="text-[11px] uppercase tracking-wider text-white/40">{title}</div>
      {helper && <p className="mt-1 text-[11px] leading-snug text-white/40">{helper}</p>}
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, active, onClick, hint, connected, action }: {
  label: string;
  active?: boolean;
  onClick: () => void;
  hint?: string;
  /** Muestra un punto verde "conectado" (sección Conexiones). */
  connected?: boolean;
  /** Slot de acción a la derecha (p.ej. botón "Conectar"). */
  action?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={!!active}
      className={cn(
        "w-full min-h-[36px] flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5",
      )}
    >
      <span className="min-w-0 flex items-center gap-2">
        {connected && <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/70 shrink-0" title="conectado" />}
        <span className="min-w-0">
          <span className="capitalize truncate block">{label}</span>
          {hint && <span className="text-[10px] text-white/30 truncate block">{hint}</span>}
        </span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {action}
        {active && !action && <Check className="w-3.5 h-3.5 text-emerald-300" />}
      </span>
    </button>
  );
}
