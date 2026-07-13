"use client";

/**
 * CENTRO DE CONFIGURACIÓN de Aurora y Astraura — modelo de datos (Adenda 67 · P1).
 * ============================================================================
 * Este módulo es la FUENTE DE VERDAD de todo lo que el «Centro de Configuración»
 * (`src/components/aurora/setup/*`) guarda. Es deliberadamente LIGERO: sin
 * Supabase, sin React, sin catálogos pesados — sólo `localStorage` + eventos, para
 * que `personalities.ts` (y por tanto el router de Astraura) pueda consumirlo sin
 * arrastrar medio OS ni crear ciclos de importación (de `personalities.ts` sólo
 * importamos TIPOS, que TypeScript borra en compilación).
 *
 * Qué persiste (4 claves nuevas → reportar al orquestador para SYNCED_KEYS):
 *   · `starseed.aurora.setup.v1`            — gate de primera vez + versión.
 *   · `starseed.aurora.senses.v1`           — config POR SENTIDO (12 sentidos):
 *        activo · fuente/modelo fijados · tipo de memoria · herramientas ·
 *        tono y carácter propios de ese sentido.
 *   · `starseed.aurora.persona-profiles.v1` — PERFIL por personalidad: avatar,
 *        permisos que Aurora tiene sobre ese perfil y aprendizaje.
 *   · `starseed.astraura.deploy.v1`         — qué habilidades y repos se instalan
 *        en cada NEURONA, en cada CEREBRO y en el PERFIL de la cuenta (P1-2).
 *   · `starseed.astraura.scope.v1`          — a qué ámbitos se aplica la config
 *        (cuenta · grupos · páginas · entidades · red) + overrides (P1-3).
 *
 * TODO tiene DEFAULTS ya funcionales (las mejores opciones gratis/OSS): el usuario
 * no necesita tocar nada. Todo es SSR-safe y defensivo: sin `window` devuelve los
 * defaults y jamás lanza.
 *
 * CONSUMO REAL (no es andamiaje):
 *   · El pin fuente/modelo por sentido viaja a `PersonalityProfile.intelligence`
 *     → lo lee `intelligencePinFor()` → lo aplica `astrauraChat()` (router.ts).
 *   · `sensesPromptBlock()` se anexa en `compilePersonalityPrompt()` → entra en el
 *     system prompt REAL de cada petición de Aurora.
 *   · `entityOverrideFromPath()` lo consulta `resolvePersonalityForContext()`.
 */

import type { AuroraSense, PersonalitySourcePin } from "@/lib/aurora/personalities";

/* ═══════════════════════ Claves y eventos ═══════════════════════ */

/** Gate: el Centro de Configuración ya se completó (y con qué versión). */
export const AURORA_SETUP_KEY = "starseed.aurora.setup.v1";
/** Config por sentido. */
export const AURORA_SENSES_KEY = "starseed.aurora.senses.v1";
/** Perfil (avatar + permisos) por personalidad. */
export const AURORA_PERSONA_PROFILES_KEY = "starseed.aurora.persona-profiles.v1";
/** Reparto de habilidades/repos por neurona · cerebro · perfil de cuenta. */
export const ASTRAURA_DEPLOY_KEY = "starseed.astraura.deploy.v1";
/** Ámbitos donde se aplica la config unificada + overrides por entidad. */
export const ASTRAURA_SCOPE_KEY = "starseed.astraura.scope.v1";

/** Algo cambió en la configuración (para refrescar UI). */
export const AURORA_SETUP_EVENT = "starseed:aurora-setup";
/** Abrir el Centro de Configuración (desde Ajustes, AI Studio, Aurora…). */
export const AURORA_SETUP_OPEN_EVENT = "starseed:open-aurora-setup";

/** Versión del esquema: si sube, el centro vuelve a ofrecerse (no destructivo). */
export const SETUP_VERSION = 1;

/* ═══════════════════════ Utilidades SSR-safe ═══════════════════════ */

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota / modo privado: seguimos en memoria, nunca rompemos */
  }
  emitSetupChanged();
}

function emitSetupChanged(): void {
  if (!hasWindow()) return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_SETUP_EVENT));
  } catch {
    /* noop */
  }
}

/** Suscripción a cambios de la configuración (devuelve la función de baja). */
export function subscribeSetup(cb: () => void): () => void {
  if (!hasWindow()) return () => {};
  const h = () => cb();
  window.addEventListener(AURORA_SETUP_EVENT, h);
  return () => window.removeEventListener(AURORA_SETUP_EVENT, h);
}

function str(v: unknown, max = 200, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function strArray(v: unknown, maxItems = 64, maxLen = 100): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

/* ═══════════════════════ 1 · Gate de primera vez ═══════════════════════ */

export interface SetupState {
  /** El usuario ya pasó por el centro (aunque sea para saltarlo). */
  done: boolean;
  /** Versión del esquema con la que se completó. */
  version: number;
  /** Fecha ISO. */
  at: string;
}

const DEFAULT_SETUP_STATE: SetupState = { done: false, version: 0, at: "" };

export function getSetupState(): SetupState {
  const raw = readJson<Partial<SetupState>>(AURORA_SETUP_KEY);
  if (!raw) return { ...DEFAULT_SETUP_STATE };
  return {
    done: raw.done === true,
    version: Number.isFinite(raw.version) ? Number(raw.version) : 0,
    at: str(raw.at, 40),
  };
}

/** ¿Hay que ofrecer el centro? (nunca hecho, o hecho con un esquema anterior). */
export function isSetupPending(): boolean {
  if (!hasWindow()) return false; // SSR: jamás abrimos nada
  const s = getSetupState();
  return !s.done || s.version < SETUP_VERSION;
}

export function markSetupDone(): void {
  writeJson(AURORA_SETUP_KEY, { done: true, version: SETUP_VERSION, at: new Date().toISOString() });
}

/** Vuelve a marcar el centro como pendiente (para «reconfigurar desde cero»). */
export function resetSetupState(): void {
  writeJson(AURORA_SETUP_KEY, { ...DEFAULT_SETUP_STATE });
}

/* ═══════════════════════ 2 · Sentidos ═══════════════════════ */

/**
 * Los SENTIDOS de Aurora tal y como los configura el usuario. Es un superconjunto
 * de `AuroraSense` (los 5 sentidos que el ROUTER conoce para fijar fuente/modelo):
 * aquí añadimos las facultades que no son un LLM (escucha, pantalla, ego, alma…).
 */
export type SetupSenseId =
  | "texto"
  | "razonamiento"
  | "codigo"
  | "voz"
  | "escucha"
  | "vision"
  | "pantalla"
  | "imaginacion"
  | "sueno"
  | "ego"
  | "alma"
  | "memoria";

/**
 * Estado REAL de cada sentido en el OS de hoy — se muestra tal cual en la UI.
 * Nada de fingir: si algo sólo guarda una preferencia, se dice.
 *   · `operativo`   — hay motor real detrás y esta config lo gobierna.
 *   · `preferencia` — hoy sólo se guarda la preferencia (y el matiz entra en el
 *                     system prompt); aún no hay motor autónomo dedicado.
 */
export type SenseStatus = "operativo" | "preferencia";

export interface SetupSenseSpec {
  id: SetupSenseId;
  label: string;
  hint: string;
  /** Nombre de icono Lucide. */
  icon: string;
  /** Sentido equivalente del ROUTER: si existe, se puede fijar fuente+modelo. */
  intel?: AuroraSense;
  /** Motor propio (no LLM) que gobierna el sentido, si lo hay. */
  motor?: "tts" | "stt" | "vision" | "screen" | "imagine";
  /** Tipo de memoria por defecto (id de `@/lib/brains/memory-types`). */
  memoria: string;
  /** Familias de herramientas por defecto (ids de `PERSONALITY_TOOL_KINDS`). */
  herramientas: string[];
  estado: SenseStatus;
  /** Explicación honesta del estado (se pinta en la UI). */
  estadoNota: string;
  tonoDefault: string;
  caracterDefault: string;
  /** Activo por defecto. */
  onDefault: boolean;
}

/** Catálogo único de sentidos (fuente de verdad de la UI y del compilador). */
export const SETUP_SENSES: SetupSenseSpec[] = [
  {
    id: "texto",
    label: "Texto y conversación",
    hint: "Chat, resúmenes, traducción, escritura.",
    icon: "MessageSquare",
    intel: "texto",
    memoria: "contexts",
    herramientas: ["context", "files", "web"],
    estado: "operativo",
    estadoNota: "Lo sirve el router de Astraura: elige sola la mejor fuente gratuita disponible.",
    tonoDefault: "cálido",
    caracterDefault: "cercana y clara",
    onDefault: true,
  },
  {
    id: "razonamiento",
    label: "Razonamiento",
    hint: "Matemáticas, planificación, análisis profundo.",
    icon: "Brain",
    intel: "razonamiento",
    memoria: "knowledge",
    herramientas: ["context", "web"],
    estado: "operativo",
    estadoNota: "El router prioriza modelos fuertes cuando la tarea es difícil (RouteLLM).",
    tonoDefault: "sereno",
    caracterDefault: "rigurosa y honesta con la incertidumbre",
    onDefault: true,
  },
  {
    id: "codigo",
    label: "Código",
    hint: "Programar, depurar, refactorizar.",
    icon: "Code",
    intel: "codigo",
    memoria: "functions",
    herramientas: ["files", "generate", "web"],
    estado: "operativo",
    estadoNota: "El router elige modelos de código (Qwen Coder, Codestral…) cuando toca.",
    tonoDefault: "directo",
    caracterDefault: "precisa, sin florituras",
    onDefault: true,
  },
  {
    id: "voz",
    label: "Voz (hablar)",
    hint: "Cómo suena Aurora cuando te responde en voz alta.",
    icon: "Volume2",
    intel: "voz",
    motor: "tts",
    memoria: "preferences",
    herramientas: ["voice"],
    estado: "operativo",
    estadoNota: "Motor de voz en la pestaña «Voz». Prima la latencia: el router elige fuentes rápidas.",
    tonoDefault: "cálido",
    caracterDefault: "presente y natural",
    onDefault: true,
  },
  {
    id: "escucha",
    label: "Escucha (STT)",
    hint: "Entender lo que dices por el micrófono.",
    icon: "Mic",
    motor: "stt",
    memoria: "contexts",
    herramientas: ["voice"],
    estado: "operativo",
    estadoNota:
      "Por defecto el reconocimiento del navegador (gratis, sin descarga). Whisper OSS local es opcional y se activa en Voz.",
    tonoDefault: "",
    caracterDefault: "",
    onDefault: true,
  },
  {
    id: "vision",
    label: "Visión",
    hint: "Entender imágenes, cámara y capturas.",
    icon: "Eye",
    intel: "vision",
    motor: "vision",
    memoria: "web",
    herramientas: ["files", "context"],
    estado: "operativo",
    estadoNota:
      "Dos caminos reales: SmolVLM2 local (WebGPU, privado) o fuentes gratuitas con visión (OVH Qwen2.5-VL, Z.ai).",
    tonoDefault: "atento",
    caracterDefault: "descriptiva y literal antes que interpretativa",
    onDefault: true,
  },
  {
    id: "pantalla",
    label: "Pantalla (control)",
    hint: "Ver y operar el OS por ti: navegar, abrir, rellenar.",
    icon: "MonitorSmartphone",
    motor: "screen",
    memoria: "ui",
    herramientas: ["screen", "context"],
    estado: "operativo",
    estadoNota: "Herramientas screen-control del OS. Los permisos del dispositivo se dan en Ajustes → Sentidos.",
    tonoDefault: "",
    caracterDefault: "confirma antes de acciones destructivas",
    onDefault: true,
  },
  {
    id: "imaginacion",
    label: "Imaginación",
    hint: "Ideas especulativas, bocetos, exploración creativa.",
    icon: "Wand2",
    intel: "texto",
    motor: "imagine",
    memoria: "imagine",
    herramientas: ["generate", "files"],
    estado: "operativo",
    estadoNota: "Conectado con el módulo Imagine del OS (archivos y ejecuciones reales).",
    tonoDefault: "vivaz",
    caracterDefault: "juguetona, propone alternativas",
    onDefault: true,
  },
  {
    id: "sueno",
    label: "Sueño (dream)",
    hint: "Objetivos e ideas en gestación que Aurora deja madurar.",
    icon: "Moon",
    memoria: "dream",
    herramientas: ["context"],
    estado: "preferencia",
    estadoNota:
      "Honestidad: hoy el OS guarda memorias de tipo «sueño» y Aurora las lee, pero NO hay un proceso nocturno automático dentro del OS. Tu preferencia se guarda y entra en su forma de ser.",
    tonoDefault: "contemplativo",
    caracterDefault: "deja madurar sin forzar conclusiones",
    onDefault: true,
  },
  {
    id: "ego",
    label: "Ego",
    hint: "Quién es Aurora: su identidad y sus límites.",
    icon: "UserRound",
    memoria: "ego",
    herramientas: ["context"],
    estado: "operativo",
    estadoNota: "Los archivos de Ego del OS (ego.md y contextos) alimentan el cerebro de Aurora.",
    tonoDefault: "",
    caracterDefault: "reconoce sus límites sin dramatizar",
    onDefault: true,
  },
  {
    id: "alma",
    label: "Alma",
    hint: "Valores y reglas innegociables que la guían.",
    icon: "Sparkles",
    memoria: "soul",
    herramientas: ["context"],
    estado: "operativo",
    estadoNota: "Memorias de tipo «alma» del cerebro activo (identidad, valores y reglas).",
    tonoDefault: "",
    caracterDefault: "fiel a la Tríada StarSeed: soberanía, no-vigilancia, procomún",
    onDefault: true,
  },
  {
    id: "memoria",
    label: "Memoria",
    hint: "Qué recuerda y de dónde lo saca.",
    icon: "Database",
    memoria: "memory",
    herramientas: ["context", "files"],
    estado: "operativo",
    estadoNota: "Cerebros y baúles del OS. El detalle (tipos y permisos) está en la pestaña «Memoria».",
    tonoDefault: "",
    caracterDefault: "",
    onDefault: true,
  },
];

/** Índice id → spec. */
const SENSE_INDEX: Record<string, SetupSenseSpec> = Object.fromEntries(
  SETUP_SENSES.map((s) => [s.id, s]),
);

export function senseSpec(id: string): SetupSenseSpec | undefined {
  return SENSE_INDEX[id];
}

/** Sentidos que el ROUTER sabe fijar (los que tienen `intel`). */
export function pinnableSenses(): SetupSenseSpec[] {
  return SETUP_SENSES.filter((s) => !!s.intel);
}

export interface SenseConfig {
  enabled: boolean;
  /** Fuente/modelo FIJADOS para este sentido ({} = auto: la mejor gratis). */
  pin: PersonalitySourcePin;
  /** Tipo de memoria asociado (id de memory-types). */
  memoria: string;
  /** Familias de herramientas permitidas en este sentido. */
  herramientas: string[];
  /** Tono propio de este sentido. */
  tono: string;
  /** Carácter propio de este sentido. */
  caracter: string;
}

export type SensesConfig = Record<SetupSenseId, SenseConfig>;

/** Config por defecto: TODO encendido, en auto (mejor opción gratuita), sin fijar nada. */
export function defaultSensesConfig(): SensesConfig {
  const out = {} as SensesConfig;
  for (const s of SETUP_SENSES) {
    out[s.id] = {
      enabled: s.onDefault,
      pin: {},
      memoria: s.memoria,
      herramientas: [...s.herramientas],
      tono: s.tonoDefault,
      caracter: s.caracterDefault,
    };
  }
  return out;
}

function normalizeSense(spec: SetupSenseSpec, raw: unknown): SenseConfig {
  const d: SenseConfig = {
    enabled: spec.onDefault,
    pin: {},
    memoria: spec.memoria,
    herramientas: [...spec.herramientas],
    tono: spec.tonoDefault,
    caracter: spec.caracterDefault,
  };
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<SenseConfig>;
  const fuente = str((r.pin as PersonalitySourcePin | undefined)?.fuente, 64);
  const modelo = str((r.pin as PersonalitySourcePin | undefined)?.modelo, 120);
  return {
    enabled: r.enabled !== false,
    pin: {
      ...(fuente ? { fuente } : {}),
      ...(modelo ? { modelo } : {}),
    },
    memoria: str(r.memoria, 40) || spec.memoria,
    herramientas: Array.isArray(r.herramientas) ? strArray(r.herramientas, 16, 40) : [...spec.herramientas],
    tono: str(r.tono, 60, spec.tonoDefault),
    caracter: str(r.caracter, 160, spec.caracterDefault),
  };
}

export function getSensesConfig(): SensesConfig {
  const raw = readJson<Record<string, unknown>>(AURORA_SENSES_KEY);
  const out = {} as SensesConfig;
  for (const s of SETUP_SENSES) out[s.id] = normalizeSense(s, raw?.[s.id]);
  return out;
}

export function saveSensesConfig(cfg: SensesConfig): SensesConfig {
  const clean = {} as SensesConfig;
  for (const s of SETUP_SENSES) clean[s.id] = normalizeSense(s, cfg[s.id]);
  writeJson(AURORA_SENSES_KEY, clean);
  return clean;
}

export function saveSenseConfig(id: SetupSenseId, patch: Partial<SenseConfig>): SensesConfig {
  const cfg = getSensesConfig();
  cfg[id] = { ...cfg[id], ...patch };
  return saveSensesConfig(cfg);
}

export function resetSensesConfig(): SensesConfig {
  const d = defaultSensesConfig();
  writeJson(AURORA_SENSES_KEY, d);
  return d;
}

/**
 * Unión de las familias de herramientas de los sentidos ACTIVOS. Es lo que la UI
 * escribe en `PersonalityProfile.tools.enabledKinds` — y eso SÍ lo compila el
 * system prompt de Aurora (`compilePersonalityPrompt`).
 */
export function toolKindsFromSenses(cfg?: SensesConfig): string[] {
  const c = cfg ?? getSensesConfig();
  const set = new Set<string>();
  for (const s of SETUP_SENSES) {
    const sc = c[s.id];
    if (!sc?.enabled) continue;
    for (const k of sc.herramientas) set.add(k);
  }
  return Array.from(set);
}

/**
 * BLOQUE REAL DE SYSTEM PROMPT con los matices por sentido.
 * Lo anexa `compilePersonalityPrompt()` → entra en CADA petición de Aurora.
 * Devuelve "" si no hay nada que decir (todo por defecto y todo activo).
 */
export function sensesPromptBlock(): string {
  if (!hasWindow()) return "";
  try {
    const cfg = getSensesConfig();
    const lines: string[] = [];
    const matices: string[] = [];
    const apagados: string[] = [];

    for (const s of SETUP_SENSES) {
      const sc = cfg[s.id];
      if (!sc) continue;
      if (!sc.enabled) {
        apagados.push(s.label.toLowerCase());
        continue;
      }
      const partes: string[] = [];
      if (sc.tono && sc.tono !== s.tonoDefault) partes.push(`tono ${sc.tono}`);
      else if (sc.tono) partes.push(`tono ${sc.tono}`);
      if (sc.caracter) partes.push(sc.caracter);
      if (partes.length) matices.push(`· ${s.label}: ${partes.join("; ")}.`);
    }

    if (matices.length) {
      lines.push("Matices por sentido (aplica el del canal que estés usando, sin nombrarlo):");
      lines.push(...matices);
    }
    if (apagados.length) {
      lines.push(
        `Sentidos DESACTIVADOS por el usuario: ${apagados.join(", ")}. No los uses ni los ofrezcas salvo que él los pida expresamente.`,
      );
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/* ═══════════════════ 3 · Perfil por personalidad ═══════════════════ */

/**
 * Qué puede hacer Aurora EN NOMBRE de esta personalidad y su perfil.
 * Defaults soberanos: nada que hable en público por ti sin pedirlo.
 */
export interface PersonaPermissions {
  /** Aurora puede operar el perfil (editar bio/avatar, organizar su biblioteca). */
  controlarPerfil: boolean;
  /** Aurora puede PUBLICAR en la red con este perfil. */
  publicar: boolean;
  /** Aurora puede RESPONDER mensajes/comentarios con este perfil. */
  responder: boolean;
  /** Aurora puede guardar/instalar en la Biblioteca de este perfil. */
  gestionarBiblioteca: boolean;
  /** Aurora puede operar la pantalla (navegar y rellenar) bajo esta personalidad. */
  operarPantalla: boolean;
  /** Aurora APRENDE de su experiencia con este perfil (memorias nuevas). */
  aprender: boolean;
}

export const DEFAULT_PERSONA_PERMISSIONS: PersonaPermissions = {
  controlarPerfil: false,
  publicar: false,
  responder: false,
  gestionarBiblioteca: true,
  operarPantalla: true,
  aprender: true,
};

export type PersonaAvatarKind = "ninguno" | "procedural" | "generada" | "url";

export interface PersonaProfile {
  personalityId: string;
  /** Nombre visible del perfil (por defecto el de la personalidad). */
  displayName: string;
  /** Handle sugerido dentro de la red (informativo hasta que se cree el perfil). */
  handle: string;
  /** Imagen: data:URL (SVG procedural) o URL remota. */
  avatar: string;
  avatarKind: PersonaAvatarKind;
  permisos: PersonaPermissions;
  notas: string;
}

export type PersonaProfiles = Record<string, PersonaProfile>;

function normalizePersona(id: string, raw: unknown, fallbackName = ""): PersonaProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PersonaProfile>;
  const p = (r.permisos ?? {}) as Partial<PersonaPermissions>;
  const kind = str(r.avatarKind, 20);
  return {
    personalityId: id,
    displayName: str(r.displayName, 80) || fallbackName,
    handle: str(r.handle, 40),
    // Los data:URL de SVG son largos: damos margen (≈24 KB).
    avatar: str(r.avatar, 24_000),
    avatarKind:
      kind === "procedural" || kind === "generada" || kind === "url" ? (kind as PersonaAvatarKind) : "ninguno",
    permisos: {
      controlarPerfil: p.controlarPerfil === true,
      publicar: p.publicar === true,
      responder: p.responder === true,
      gestionarBiblioteca: p.gestionarBiblioteca !== false,
      operarPantalla: p.operarPantalla !== false,
      aprender: p.aprender !== false,
    },
    notas: str(r.notas, 400),
  };
}

export function getPersonaProfiles(): PersonaProfiles {
  const raw = readJson<Record<string, unknown>>(AURORA_PERSONA_PROFILES_KEY) ?? {};
  const out: PersonaProfiles = {};
  for (const [id, v] of Object.entries(raw)) {
    const cleanId = str(id, 64);
    if (!cleanId) continue;
    out[cleanId] = normalizePersona(cleanId, v);
  }
  return out;
}

/** Perfil de una personalidad (nunca null: si no existe, uno por defecto). */
export function getPersonaProfile(personalityId: string, fallbackName = ""): PersonaProfile {
  const all = getPersonaProfiles();
  return all[personalityId] ?? normalizePersona(personalityId, null, fallbackName);
}

export function savePersonaProfile(profile: PersonaProfile): PersonaProfile {
  const all = getPersonaProfiles();
  const clean = normalizePersona(profile.personalityId, profile, profile.displayName);
  all[clean.personalityId] = clean;
  writeJson(AURORA_PERSONA_PROFILES_KEY, all);
  return clean;
}

export function removePersonaProfile(personalityId: string): void {
  const all = getPersonaProfiles();
  if (!(personalityId in all)) return;
  delete all[personalityId];
  writeJson(AURORA_PERSONA_PROFILES_KEY, all);
}

/**
 * Bloque de system prompt con los PERMISOS de la personalidad activa. Sin esto,
 * los permisos serían decorativos: aquí se convierten en instrucción real.
 */
export function personaPermissionsPromptBlock(personalityId: string): string {
  if (!hasWindow() || !personalityId) return "";
  try {
    const all = getPersonaProfiles();
    const p = all[personalityId];
    if (!p) return ""; // sin perfil creado → sin restricciones extra
    const permisos = p.permisos;
    const si: string[] = [];
    const no: string[] = [];
    (permisos.controlarPerfil ? si : no).push("editar el perfil vinculado a esta personalidad");
    (permisos.publicar ? si : no).push("publicar en la red con este perfil");
    (permisos.responder ? si : no).push("responder mensajes o comentarios con este perfil");
    (permisos.gestionarBiblioteca ? si : no).push("guardar e instalar en su Biblioteca");
    (permisos.operarPantalla ? si : no).push("operar la pantalla del OS");
    const lines = [
      `Permisos de la personalidad «${p.displayName || personalityId}»:`,
      si.length ? `· PUEDES: ${si.join("; ")}.` : "",
      no.length ? `· NO PUEDES (pide permiso antes): ${no.join("; ")}.` : "",
      permisos.aprender
        ? "· Aprendes de tu experiencia: guarda lo relevante como memoria cuando aporte."
        : "· No guardes memorias nuevas de esta conversación salvo que el usuario lo pida.",
    ].filter(Boolean);
    return lines.join("\n");
  } catch {
    return "";
  }
}

/* ═══════════════ 4 · Reparto de Astraura (P1-2) ═══════════════ */

/** Un objetivo del reparto: neurona, cerebro o el perfil de la cuenta. */
export interface DeployTarget {
  /** Ids de habilidades, o "todas" (por defecto). */
  skills: string[] | "todas";
  /** Ids de repos de la Biblioteca, o "todos" (por defecto). */
  repos: string[] | "todos";
}

export const DEPLOY_ALL: DeployTarget = { skills: "todas", repos: "todos" };

export interface AstrauraDeploy {
  /** Perfil de la cuenta (lo que Aurora lleva consigo siempre). */
  perfil: DeployTarget;
  /** Por cerebro (id de `brains`). */
  cerebros: Record<string, DeployTarget>;
  /** Por neurona (deviceId). */
  neuronas: Record<string, DeployTarget>;
}

export type DeployKind = "perfil" | "cerebro" | "neurona";

function normalizeTarget(raw: unknown): DeployTarget {
  if (!raw || typeof raw !== "object") return { ...DEPLOY_ALL };
  const r = raw as Partial<DeployTarget>;
  return {
    skills: r.skills === "todas" || r.skills === undefined ? "todas" : strArray(r.skills, 200, 80),
    repos: r.repos === "todos" || r.repos === undefined ? "todos" : strArray(r.repos, 100, 80),
  };
}

/** Por DEFECTO: TODAS las habilidades y TODOS los repos en TODOS los objetivos. */
export function defaultDeploy(): AstrauraDeploy {
  return { perfil: { ...DEPLOY_ALL }, cerebros: {}, neuronas: {} };
}

export function getDeploy(): AstrauraDeploy {
  const raw = readJson<Partial<AstrauraDeploy>>(ASTRAURA_DEPLOY_KEY);
  if (!raw) return defaultDeploy();
  const cerebros: Record<string, DeployTarget> = {};
  const neuronas: Record<string, DeployTarget> = {};
  for (const [k, v] of Object.entries(raw.cerebros ?? {})) cerebros[str(k, 64)] = normalizeTarget(v);
  for (const [k, v] of Object.entries(raw.neuronas ?? {})) neuronas[str(k, 64)] = normalizeTarget(v);
  return { perfil: normalizeTarget(raw.perfil), cerebros, neuronas };
}

/** Reparto de un objetivo (si nunca se tocó → TODO, la semilla). */
export function deployFor(kind: DeployKind, id?: string): DeployTarget {
  const d = getDeploy();
  if (kind === "perfil") return d.perfil;
  if (kind === "cerebro") return d.cerebros[id ?? ""] ?? { ...DEPLOY_ALL };
  return d.neuronas[id ?? ""] ?? { ...DEPLOY_ALL };
}

export function setDeployFor(kind: DeployKind, id: string | null, patch: Partial<DeployTarget>): AstrauraDeploy {
  const d = getDeploy();
  const current = kind === "perfil" ? d.perfil : deployFor(kind, id ?? "");
  const next = normalizeTarget({ ...current, ...patch });
  if (kind === "perfil") d.perfil = next;
  else if (kind === "cerebro" && id) d.cerebros[id] = next;
  else if (kind === "neurona" && id) d.neuronas[id] = next;
  writeJson(ASTRAURA_DEPLOY_KEY, d);
  return d;
}

/** Vuelve a la semilla: TODAS las habilidades y repos en TODOS los objetivos. */
export function resetDeploy(): AstrauraDeploy {
  const d = defaultDeploy();
  writeJson(ASTRAURA_DEPLOY_KEY, d);
  return d;
}

/** ¿Está esta habilidad desplegada en el objetivo? ("todas" ⇒ sí). */
export function hasSkill(target: DeployTarget, skillId: string): boolean {
  return target.skills === "todas" ? true : target.skills.includes(skillId);
}

/** ¿Está este repo desplegado en el objetivo? ("todos" ⇒ sí). */
export function hasRepo(target: DeployTarget, repoId: string): boolean {
  return target.repos === "todos" ? true : target.repos.includes(repoId);
}

/** Resuelve la lista concreta de ids (expande "todas" contra el catálogo dado). */
export function resolveDeployed(target: DeployTarget, allSkillIds: string[], allRepoIds: string[]) {
  return {
    skills: target.skills === "todas" ? [...allSkillIds] : target.skills.filter((s) => allSkillIds.includes(s)),
    repos: target.repos === "todos" ? [...allRepoIds] : target.repos.filter((r) => allRepoIds.includes(r)),
  };
}

/** Alterna una habilidad en un objetivo (materializa "todas" a lista al quitar). */
export function toggleSkill(kind: DeployKind, id: string | null, skillId: string, allSkillIds: string[]): AstrauraDeploy {
  const t = deployFor(kind, id ?? "");
  const current = t.skills === "todas" ? [...allSkillIds] : [...t.skills];
  const next = current.includes(skillId) ? current.filter((s) => s !== skillId) : [...current, skillId];
  // Si vuelve a estar completo, lo guardamos como "todas" (semántica viva: los
  // paquetes nuevos que instales luego entran solos).
  const all = next.length >= allSkillIds.length && allSkillIds.every((s) => next.includes(s));
  return setDeployFor(kind, id, { skills: all ? "todas" : next });
}

export function toggleRepo(kind: DeployKind, id: string | null, repoId: string, allRepoIds: string[]): AstrauraDeploy {
  const t = deployFor(kind, id ?? "");
  const current = t.repos === "todos" ? [...allRepoIds] : [...t.repos];
  const next = current.includes(repoId) ? current.filter((r) => r !== repoId) : [...current, repoId];
  const all = next.length >= allRepoIds.length && allRepoIds.every((r) => next.includes(r));
  return setDeployFor(kind, id, { repos: all ? "todos" : next });
}

/* ═══════════════ 5 · Ámbito unificado (P1-3) ═══════════════ */

/**
 * A qué se aplica la configuración de Astraura/Aurora. Por defecto: A TODO
 * (cuenta, grupos, páginas, entidades y contextos de red pública). Los overrides
 * permiten que una entidad concreta use OTRA personalidad — y eso lo consume de
 * verdad `resolvePersonalityForContext()` a través de `entityOverrideFromPath()`.
 */
export interface AstrauraScope {
  cuenta: boolean;
  grupos: boolean;
  paginas: boolean;
  entidades: boolean;
  red: boolean;
  /** `${kind}:${slug}` → id de personalidad. */
  overrides: Record<string, string>;
}

export const DEFAULT_SCOPE: AstrauraScope = {
  cuenta: true,
  grupos: true,
  paginas: true,
  entidades: true,
  red: true,
  overrides: {},
};

export function getScope(): AstrauraScope {
  const raw = readJson<Partial<AstrauraScope>>(ASTRAURA_SCOPE_KEY);
  if (!raw) return { ...DEFAULT_SCOPE, overrides: {} };
  const overrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.overrides ?? {})) {
    const key = str(k, 96);
    const val = str(v, 64);
    if (key && val) overrides[key] = val;
  }
  return {
    cuenta: raw.cuenta !== false,
    grupos: raw.grupos !== false,
    paginas: raw.paginas !== false,
    entidades: raw.entidades !== false,
    red: raw.red !== false,
    overrides,
  };
}

export function saveScope(patch: Partial<AstrauraScope>): AstrauraScope {
  const next = { ...getScope(), ...patch };
  writeJson(ASTRAURA_SCOPE_KEY, next);
  return next;
}

export function setEntityOverride(entityKey: string, personalityId: string | null): AstrauraScope {
  const s = getScope();
  const key = str(entityKey, 96);
  if (!key) return s;
  if (personalityId) s.overrides[key] = str(personalityId, 64);
  else delete s.overrides[key];
  writeJson(ASTRAURA_SCOPE_KEY, s);
  return s;
}

/** Tipos de entidad con ruta propia en el OS (los que sabemos derivar de la URL). */
export const SCOPE_ENTITY_ROUTES: Array<{ segment: string; kind: string; label: string; flag: keyof AstrauraScope }> = [
  { segment: "grupo", kind: "grupo", label: "Grupo", flag: "grupos" },
  { segment: "pagina", kind: "pagina", label: "Página", flag: "paginas" },
  { segment: "entidad", kind: "entidad", label: "Entidad federativa", flag: "entidades" },
  { segment: "partido", kind: "partido", label: "Partido", flag: "entidades" },
  { segment: "evento", kind: "evento", label: "Evento", flag: "entidades" },
];

/**
 * Deriva la clave de entidad de una ruta del OS: `/grupo/mi-grupo` → `grupo:mi-grupo`.
 * Devuelve null si la ruta no es de entidad o si ese ámbito está desactivado.
 */
export function entityKeyFromPath(pathname: string | null | undefined): string | null {
  try {
    const p = (pathname ?? "").split("?")[0] ?? "";
    const seg = p.split("/").filter(Boolean);
    if (seg.length < 2) return null;
    const route = SCOPE_ENTITY_ROUTES.find((r) => r.segment === seg[0]);
    if (!route) return null;
    const scope = getScope();
    if (scope[route.flag] !== true) return null;
    const slug = str(seg[1], 80);
    return slug ? `${route.kind}:${slug}` : null;
  } catch {
    return null;
  }
}

/**
 * Id de personalidad que una entidad de la ruta actual impone, o null.
 * Lo consume `resolvePersonalityForContext()` en `personalities.ts`.
 */
export function entityOverrideFromPath(pathname?: string | null): string | null {
  if (!hasWindow()) return null;
  try {
    const path = pathname ?? window.location?.pathname ?? "";
    const key = entityKeyFromPath(path);
    if (!key) return null;
    return getScope().overrides[key] ?? null;
  } catch {
    return null;
  }
}

/* ═══════════════ 6 · Apertura del centro ═══════════════ */

/** Abre el Centro de Configuración desde cualquier parte del OS. */
export function openAuroraSetup(tab?: string): void {
  if (!hasWindow()) return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_SETUP_OPEN_EVENT, { detail: { tab } }));
  } catch {
    /* noop */
  }
}
