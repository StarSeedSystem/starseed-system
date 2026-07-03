"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — MODELOS POR FUNCIÓN (registro + store + hook)
// ----------------------------------------------------------------------------
// El usuario es soberano sobre SU IA (Exocórtex). No basta con elegir "un
// modelo": distintas FUNCIONES de generación (texto, imagen, vídeo, voz,
// presentaciones, infografías, sitios web…) pueden querer servicios/modelos
// DISTINTOS. Este módulo declara ese registro de funciones y guarda, POR
// FUNCIÓN y por SCOPE (usuario · cerebro · página · contexto), qué CONEXIÓN OSS
// concreta usar.
//
// No reimplementa la resolución: se apoya en la capa ya existente de conexiones
// OSS (`oss-connections.ts`) — `resolveServiceFor(category, scope)`,
// `setDefaultFor`, `clearDefaultFor` — mapeando cada función a una
// `OssServiceCategory`. Así "elegir el servicio de la función Imagen para el
// cerebro X" = fijar el default de la categoría `image` en el scope `brain:X`.
//
// Persistencia:
//   • Preferencia de servicio por función/scope → vive en el store de defaults
//     de OSS (`starseed.oss.defaults.v1`), reutilizando su sincronización con la
//     cuenta soberana. NO duplicamos ese estado aquí.
//   • Metadatos de UI del panel (p.ej. scope activo elegido en la interfaz) →
//     `starseed.ai.function-models.v1` (sólo preferencias de presentación).
//
// Todo SSR-safe y defensivo: acceso a window/localStorage tras guardas; nunca
// lanza. No añade dependencias. No toca providerStore/chat/MoA ni sus firmas.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  OssService,
  OssServiceCategory,
} from "@/lib/services/oss-services";
import {
  OSS_SERVICE_CATEGORY_META,
  getOssServicesByCategory,
  findOssService,
} from "@/lib/services/oss-services";
import {
  resolveServiceFor,
  setDefaultFor,
  clearDefaultFor,
  readDefaults,
  defaultKey,
  normalizeScope,
  type OssScope,
  type ResolvedService,
} from "@/lib/services/oss-connections";

// ── Clave de persistencia (sólo preferencias de UI del panel) ────────────────

export const FUNCTION_MODELS_KEY = "starseed.ai.function-models.v1";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Id estable de una función de generación. */
export type GenerationFunctionId =
  | "text"
  | "transcription"
  | "voice"
  | "image"
  | "video"
  | "presentation"
  | "infographic"
  | "website"
  | "automation"
  | "document"
  | "design";

/**
 * Una FUNCIÓN de generación con su servicio/modelo elegible. La `category`
 * mapea a una `OssServiceCategory` del catálogo OSS, de modo que la resolución
 * reutiliza `resolveServiceFor(category, scope)`.
 */
export interface GenerationFunction {
  /** Id estable. */
  id: GenerationFunctionId;
  /** Etiqueta legible (es). */
  label: string;
  /** Categoría OSS que cubre esta función (enrutado). */
  category: OssServiceCategory;
  /** Servicio del catálogo sugerido por defecto (`OssService.id`). */
  defaultServiceId: string;
  /** Ayuda corta (es): qué genera y con qué se conecta. */
  help: string;
  /** Emoji/etiqueta ligera para el panel (no icono de librería). */
  glyph?: string;
}

// ── Registro de funciones ─────────────────────────────────────────────────────
// Cada función apunta a una categoría OSS y a un servicio por defecto que EXISTE
// en `oss-services.ts`. Para funciones que aún no tienen categoría propia en el
// catálogo (presentaciones, infografías) reutilizamos la categoría más cercana
// (`image` para artefactos visuales; `website` para sitios). Honesto: si el
// usuario conecta un servicio específico, este registro sólo fija el "por
// defecto" — el usuario manda vía las conexiones OSS.

export const GENERATION_FUNCTIONS: GenerationFunction[] = [
  {
    id: "text",
    label: "Texto",
    category: "llm",
    defaultServiceId: "ollama",
    help: "Chat y generación de texto con un modelo de lenguaje (Ollama local o el servicio LLM que conectes).",
    glyph: "✍️",
  },
  {
    id: "transcription",
    label: "Transcripción (voz → texto)",
    category: "stt",
    defaultServiceId: "whisper-browser",
    help: "Convierte audio y dictado en texto (Whisper en el navegador o whisper.cpp como servidor).",
    glyph: "🎙️",
  },
  {
    id: "voice",
    label: "Voz (texto → voz)",
    category: "tts",
    defaultServiceId: "piper",
    help: "Sintetiza voz a partir de texto (Piper o Kokoro, en el navegador o como servidor HTTP).",
    glyph: "🗣️",
  },
  {
    id: "image",
    label: "Imagen",
    category: "image",
    defaultServiceId: "fooocus-api",
    help: "Genera imágenes (Fooocus-API o AUTOMATIC1111 / Stable Diffusion) desde tus prompts.",
    glyph: "🖼️",
  },
  {
    id: "video",
    label: "Vídeo",
    category: "video",
    defaultServiceId: "",
    help: "Genera o edita vídeo con el servicio de vídeo que conectes (endpoint propio o de terceros).",
    glyph: "🎬",
  },
  {
    id: "presentation",
    label: "Presentaciones",
    category: "image",
    defaultServiceId: "",
    help: "Compón diapositivas y presentaciones. Reutiliza tu servicio visual (imagen) o un endpoint dedicado que conectes.",
    glyph: "📊",
  },
  {
    id: "infographic",
    label: "Infografías",
    category: "image",
    defaultServiceId: "",
    help: "Genera infografías y diagramas visuales. Usa el servicio de imagen o un endpoint específico.",
    glyph: "📈",
  },
  {
    id: "website",
    label: "Sitios web",
    category: "website",
    defaultServiceId: "starseed-sites",
    help: "Genera y publica páginas/sitios (generador integrado de StarSeed o tu propio endpoint).",
    glyph: "🌐",
  },
  {
    id: "design",
    label: "Diseño",
    category: "design",
    defaultServiceId: "penpot",
    help: "Lienzos vectoriales y prototipos (Penpot). Enlaza tu instancia o conéctate con un token.",
    glyph: "🎨",
  },
  {
    id: "document",
    label: "Documentos",
    category: "docs",
    defaultServiceId: "appflowy",
    help: "Escribe y organiza documentos y notas (AppFlowy u otro workspace que embebas).",
    glyph: "📄",
  },
  {
    id: "automation",
    label: "Automatización",
    category: "workflow",
    defaultServiceId: "n8n",
    help: "Orquesta flujos y acciones vía webhooks (n8n u otro motor de automatización).",
    glyph: "⚙️",
  },
];

/** Orden estable de funciones para el panel. */
export const GENERATION_FUNCTION_ORDER: GenerationFunctionId[] =
  GENERATION_FUNCTIONS.map((f) => f.id);

// ── Helpers de lectura del registro ───────────────────────────────────────────

/** Devuelve todas las funciones (referencia estable). */
export function getGenerationFunctions(): GenerationFunction[] {
  return GENERATION_FUNCTIONS;
}

/** Resuelve una función por id, o undefined. */
export function findGenerationFunction(
  id: string,
): GenerationFunction | undefined {
  return GENERATION_FUNCTIONS.find((f) => f.id === id);
}

/** La categoría OSS que cubre una función (o null si el id es desconocido). */
export function categoryForFunction(
  functionId: string,
): OssServiceCategory | null {
  return findGenerationFunction(functionId)?.category ?? null;
}

/** Meta de presentación de la categoría de una función (label/blurb). */
export function categoryMetaForFunction(functionId: string) {
  const cat = categoryForFunction(functionId);
  return cat ? OSS_SERVICE_CATEGORY_META[cat] : null;
}

/** Servicios del catálogo elegibles para una función (por su categoría). */
export function servicesForFunction(functionId: string): OssService[] {
  const cat = categoryForFunction(functionId);
  return cat ? getOssServicesByCategory(cat) : [];
}

// ════════════════════════════════════════════════════════════════════════════
// NVIDIA NIM — modelos elegibles por función (texto · imagen · código · voz…)
// ----------------------------------------------------------------------------
// NVIDIA tiene modelos especializados (LLM, visión/imagen, código, embeddings,
// voz) que van MÁS ALLÁ de las categorías OSS. Este bloque permite que la UI de
// "modelos por función" ofrezca modelos NIM concretos para cada función, sin
// tocar las firmas existentes ni la resolución (que sigue en oss-connections).
// La preferencia de SERVICIO por función se fija con `setServiceFor` (OSS
// defaults); la elección de MODELO NIM concreto se guarda como preferencia de
// UI ligera (`starseed.ai.nim-function-model.v1`), aditiva y SSR-safe.
// ════════════════════════════════════════════════════════════════════════════

import {
  buildNimModelCatalog,
  type NimCategory,
  type NimModelEntry,
} from "@/lib/services/nvidia/nim-catalog";

/** Ids de servicio NVIDIA registrados en el catálogo OSS (para detección). */
export const NVIDIA_SERVICE_IDS = [
  "nvidia-nim",
  "nvidia-nim-vision",
  "nvidia-riva-asr",
  "nvidia-riva-tts",
] as const;

/** ¿Es un servicio NVIDIA (NIM/Riva) del catálogo OSS? */
export function isNvidiaService(serviceId: string): boolean {
  return (NVIDIA_SERVICE_IDS as readonly string[]).includes(serviceId);
}

/**
 * Mapa función de generación → categoría(s) NIM cuyos modelos tienen sentido
 * para ella. Una función puede aceptar varias categorías NIM (p.ej. "texto"
 * admite LLM y código; "imagen" admite generación de imagen y visión).
 */
const FUNCTION_TO_NIM_CATEGORIES: Partial<
  Record<GenerationFunctionId, NimCategory[]>
> = {
  text: ["llm", "code"],
  transcription: ["stt"],
  voice: ["tts"],
  image: ["image", "vision"],
  presentation: ["image", "vision"],
  infographic: ["image", "vision"],
  document: ["llm"],
  website: ["llm", "code"],
  design: ["image", "vision"],
  automation: ["llm"],
};

/** Categorías NIM aceptadas por una función (vacío si desconocida). */
export function nimCategoriesForFunction(functionId: string): NimCategory[] {
  return FUNCTION_TO_NIM_CATEGORIES[functionId as GenerationFunctionId] ?? [];
}

/**
 * Modelos NIM curados elegibles para una función (por sus categorías NIM).
 * Devuelve [] si la función no admite NIM. Nunca lanza.
 */
export function nimModelsForFunction(functionId: string): NimModelEntry[] {
  const cats = nimCategoriesForFunction(functionId);
  if (!cats.length) return [];
  const all = buildNimModelCatalog();
  return all.filter((m) => cats.includes(m.category));
}

// ── Preferencia de MODELO NIM por función/scope (UI ligera) ──────────────────

/** Clave de persistencia del modelo NIM elegido por función/scope. */
export const NIM_FUNCTION_MODEL_KEY = "starseed.ai.nim-function-model.v1";

type NimFunctionModelPrefs = Record<string, string>; // `${functionId}@${scope}` → modelId

function readNimModelPrefs(): NimFunctionModelPrefs {
  if (!isClient()) return {};
  try {
    const raw = window.localStorage.getItem(NIM_FUNCTION_MODEL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: NimFunctionModelPrefs = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeNimModelPrefs(prefs: NimFunctionModelPrefs): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(NIM_FUNCTION_MODEL_KEY, JSON.stringify(prefs));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

function nimModelKey(functionId: string, scope: OssScope): string {
  return `${functionId}@${normalizeScope(scope)}`;
}

/**
 * Id del modelo NIM elegido para una función en un scope (o null si ninguno).
 * Preferencia de UI ligera; no afecta a la resolución OSS. Nunca lanza.
 */
export function getNimModelFor(
  functionId: string,
  scope: OssScope = "user",
): string | null {
  const prefs = readNimModelPrefs();
  const v = prefs[nimModelKey(functionId, scope)];
  return typeof v === "string" && v ? v : null;
}

/**
 * Fija (o limpia con null) el modelo NIM a usar para una función en un scope.
 * Valida que el modelo exista en el catálogo curado y sea de una categoría
 * compatible con la función. Devuelve true si se aplicó.
 */
export function setNimModelFor(
  functionId: string,
  modelId: string | null,
  scope: OssScope = "user",
): boolean {
  const key = nimModelKey(functionId, scope);
  const prefs = readNimModelPrefs();
  if (!modelId) {
    if (key in prefs) {
      delete prefs[key];
      writeNimModelPrefs(prefs);
    }
    return true;
  }
  const eligible = nimModelsForFunction(functionId).some((m) => m.id === modelId);
  if (!eligible) return false;
  prefs[key] = modelId;
  writeNimModelPrefs(prefs);
  return true;
}

// ── Preferencias de UI del panel (scope activo elegido en la interfaz) ────────
// SÓLO presentación. La preferencia real de servicio vive en OSS defaults.

interface FunctionModelsUiPrefs {
  /** Último scope elegido en el panel (para recordar la vista). */
  lastScope?: OssScope;
}

function isClient(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readUiPrefs(): FunctionModelsUiPrefs {
  if (!isClient()) return {};
  try {
    const raw = window.localStorage.getItem(FUNCTION_MODELS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FunctionModelsUiPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeUiPrefs(prefs: FunctionModelsUiPrefs): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(FUNCTION_MODELS_KEY, JSON.stringify(prefs));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Resolución por función (se apoya en resolveServiceFor de oss-connections)
// ════════════════════════════════════════════════════════════════════════════

/** Qué devuelve resolver una función: el servicio+conexión efectivos. */
export interface ResolvedFunction {
  /** La función del registro. */
  fn: GenerationFunction;
  /** Resolución OSS (servicio, conexión, endpoint). Null si no hay servicio. */
  resolved: ResolvedService | null;
  /** true si viene de una conexión explícita del usuario. */
  fromUserConnection: boolean;
}

/**
 * Resuelve QUÉ servicio/conexión usar para una función, opcionalmente en un
 * scope. Función PURA: delega en `resolveServiceFor(category, scope)`. Las tools
 * de generación pueden llamarla directamente. Nunca lanza.
 */
export function resolveFunction(
  functionId: string,
  scope: OssScope = "user",
): ResolvedFunction | null {
  const fn = findGenerationFunction(functionId);
  if (!fn) return null;
  const resolved = resolveServiceFor(fn.category, normalizeScope(scope));
  return {
    fn,
    resolved,
    fromUserConnection: !!resolved?.fromUserConnection,
  };
}

/**
 * Id de la conexión OSS elegida como "por defecto" para una función en un scope
 * (mirando el store de defaults de OSS). Devuelve null si no hay preferencia
 * explícita para ese scope exacto (no cae al scope "user").
 */
export function getServiceFor(
  functionId: string,
  scope: OssScope = "user",
): string | null {
  const cat = categoryForFunction(functionId);
  if (!cat) return null;
  const defs = readDefaults();
  const key = defaultKey(cat, normalizeScope(scope));
  return typeof defs[key] === "string" && defs[key] ? defs[key] : null;
}

/**
 * Fija la conexión OSS a usar para una función en un scope. Delega en
 * `setDefaultFor(category, connectionId, scope)`. Pasar connectionId vacío/null
 * limpia la preferencia. Devuelve true si se aplicó.
 */
export function setServiceFor(
  functionId: string,
  connectionId: string | null,
  scope: OssScope = "user",
): boolean {
  const cat = categoryForFunction(functionId);
  if (!cat) return false;
  const s = normalizeScope(scope);
  if (!connectionId) {
    clearDefaultFor(cat, s);
    return true;
  }
  return setDefaultFor(cat, connectionId, s);
}

// ════════════════════════════════════════════════════════════════════════════
// useFunctionModels() — hook de React (SSR-safe)
// ════════════════════════════════════════════════════════════════════════════

export interface UseFunctionModels {
  /** Registro completo de funciones (referencia estable). */
  functions: GenerationFunction[];
  /** Servicios del catálogo elegibles para una función. */
  servicesFor: (functionId: string) => OssService[];
  /** Id de conexión OSS por defecto para una función/scope (o null). */
  getServiceFor: (functionId: string, scope?: OssScope) => string | null;
  /** Fija/limpia la conexión OSS para una función/scope. */
  setServiceFor: (
    functionId: string,
    connectionId: string | null,
    scope?: OssScope,
  ) => boolean;
  /** Resuelve el servicio+conexión efectivos para una función/scope. */
  resolveFunction: (
    functionId: string,
    scope?: OssScope,
  ) => ResolvedFunction | null;
  /** Modelos NIM (NVIDIA) curados elegibles para una función (o []). */
  nimModelsFor: (functionId: string) => NimModelEntry[];
  /** Id del modelo NIM elegido para una función/scope (o null). */
  getNimModelFor: (functionId: string, scope?: OssScope) => string | null;
  /** Fija/limpia el modelo NIM a usar para una función/scope. */
  setNimModelFor: (
    functionId: string,
    modelId: string | null,
    scope?: OssScope,
  ) => boolean;
  /** Scope actualmente elegido en la UI (recordado entre sesiones). */
  uiScope: OssScope;
  /** Cambia el scope activo de la UI (persistente). */
  setUiScope: (scope: OssScope) => void;
  /** Fuerza una relectura (tras cambios en las conexiones OSS). */
  refresh: () => void;
}

/**
 * Hook reactivo. Relee cuando cambian las conexiones OSS (evento del store) o
 * cuando otra pestaña toca localStorage. SSR-safe: en el servidor devuelve el
 * registro y valores por defecto; hidrata en el primer efecto del cliente.
 */
export function useFunctionModels(): UseFunctionModels {
  const [uiScope, setUiScopeState] = useState<OssScope>("user");
  // "tick" para forzar recomputaciones de getters tras cambios en OSS.
  const [, setTick] = useState(0);
  const mounted = useRef(false);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Hidrata scope recordado.
    const prefs = readUiPrefs();
    if (prefs.lastScope) setUiScopeState(normalizeScope(prefs.lastScope));
    refresh();

    // El store OSS emite este evento cuando cambian conexiones/defaults.
    const onChange = () => {
      if (mounted.current) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "starseed.oss.connections.v1" ||
        e.key === "starseed.oss.defaults.v1" ||
        e.key === FUNCTION_MODELS_KEY ||
        e.key === null
      ) {
        onChange();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("starseed:oss-connections", onChange);
      window.addEventListener("storage", onStorage);
    }
    return () => {
      mounted.current = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("starseed:oss-connections", onChange);
        window.removeEventListener("storage", onStorage);
      }
    };
  }, [refresh]);

  const setUiScope = useCallback<UseFunctionModels["setUiScope"]>((scope) => {
    const s = normalizeScope(scope);
    setUiScopeState(s);
    const prefs = readUiPrefs();
    writeUiPrefs({ ...prefs, lastScope: s });
  }, []);

  const servicesFor = useCallback<UseFunctionModels["servicesFor"]>(
    (functionId) => servicesForFunction(functionId),
    [],
  );

  const get = useCallback<UseFunctionModels["getServiceFor"]>(
    (functionId, scope = "user") => getServiceFor(functionId, scope),
    [],
  );

  const set = useCallback<UseFunctionModels["setServiceFor"]>(
    (functionId, connectionId, scope = "user") => {
      const ok = setServiceFor(functionId, connectionId, scope);
      refresh();
      return ok;
    },
    [refresh],
  );

  const resolve = useCallback<UseFunctionModels["resolveFunction"]>(
    (functionId, scope = "user") => resolveFunction(functionId, scope),
    [],
  );

  const nimModels = useCallback<UseFunctionModels["nimModelsFor"]>(
    (functionId) => nimModelsForFunction(functionId),
    [],
  );

  const getNimModel = useCallback<UseFunctionModels["getNimModelFor"]>(
    (functionId, scope = "user") => getNimModelFor(functionId, scope),
    [],
  );

  const setNimModel = useCallback<UseFunctionModels["setNimModelFor"]>(
    (functionId, modelId, scope = "user") => {
      const ok = setNimModelFor(functionId, modelId, scope);
      refresh();
      return ok;
    },
    [refresh],
  );

  return {
    functions: GENERATION_FUNCTIONS,
    servicesFor,
    getServiceFor: get,
    setServiceFor: set,
    resolveFunction: resolve,
    nimModelsFor: nimModels,
    getNimModelFor: getNimModel,
    setNimModelFor: setNimModel,
    uiScope,
    setUiScope,
    refresh,
  };
}

// Re-export para conveniencia de las tools (evita import doble).
export { findOssService };
