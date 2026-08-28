"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · MOTOR DE RESOLUCIÓN DE PROVEEDORES POR CATEGORÍA (jul-2026)
 * ---------------------------------------------------------------------------
 * El OS SIEMPRE funciona con opciones gratuitas/OSS por defecto (Comunismo de
 * Abundancia, §3 CLAUDE.md). Este módulo declara, por CATEGORÍA funcional
 * (búsqueda, scraping, mapas, repos, documentos, chat, diseño, almacenamiento,
 * correo, calendario, PDF, automatización, LLM), cuál es ese default gratis/OSS
 * y qué servicios de MARCA opcionales existen para cuando el usuario prefiere
 * usar su propia cuenta — con FALLBACK automático al default si la cuenta
 * propia no está configurada, no está sana, o falla en tiempo real.
 *
 * PRINCIPIO "NUNCA FALLA": `resolveProvider()` SIEMPRE devuelve un proveedor
 * válido (nunca lanza, nunca null). El default gratis/OSS es la red de
 * seguridad universal; la cuenta propia es siempre un extra opcional.
 *
 * MODO DEL USUARIO (`starseed.connectors.mode.v1`, preferencia NO-secreta,
 * sincronizada — ver SYNCED_KEYS en `lib/settings-sync.ts`):
 *   · "auto"        (por defecto) — Astraura prioriza gratis/OSS. Usa la
 *     cuenta propia YA en modo auto SOLO cuando el default es estructuralmente
 *     incapaz de completar la tarea porque esta requiere alcanzar un recurso
 *     EXTERNO real del usuario (su Gmail, su Drive, su Notion, su GitHub
 *     privado, su Slack/Telegram, su Figma/Canva, su Google Calendar) — estas
 *     categorías llevan `externalReach:true` en `CATEGORY_PROVIDERS`. Para el
 *     resto (buscar/rastrear la web, mapas, LLM, PDF, automatización) el
 *     default gratis/OSS YA hace el mismo trabajo, así que auto se queda con
 *     él (mismo espíritu que `router.ts`: el gratis-primero no cede ante una
 *     clave de pago configurada salvo que el usuario lo pida a propósito).
 *   · "prefer-own"  — si la cuenta propia está configurada y sana, se prioriza
 *     SIEMPRE, en cualquier categoría.
 *   · "only-free"   — ignora cualquier cuenta propia; solo gratis/OSS.
 * Además de un modo GLOBAL, cada categoría admite un override individual
 * (`perCategory`), igual que `IntelligenceSettings.perTask` en `router.ts`.
 *
 * CREDENCIALES (`starseed.connectors.creds.v1`): SOLO LECTURA aquí
 * (`connectorCredentials()`). La UI de escritura la construye otro agente
 * sobre la MISMA clave; este módulo nunca la modifica ni la sincroniza (no
 * está en SYNCED_KEYS — las claves NUNCA viajan a la cuenta, por diseño).
 *
 * HEALTH CHECK "TOLERANTE": por diseño, sano = hay credencial/endpoint
 * presente (igual de tolerante que `isProviderAvailable`/`selectConnector`/
 * `resolveServiceFor` ya existentes en el repo) — NO se hace una sonda de red
 * aquí (eso mantiene `resolveProvider()` síncrono y embebible en cualquier
 * sitio: prompts, tools, UI). Quien quiera una comprobación en vivo real puede
 * usar `testIntegration()`/`testConnection()` de las capas correspondientes.
 *
 * HONESTIDAD: los servicios de marca que HOY no tienen conector real en este
 * repo (p.ej. Google Maps, Google Search/Bing, GitHub por token, Notion,
 * Slack/Telegram, Figma/Canva, Google Drive/Calendar) quedan declarados con
 * `hasRealConnector:false` — nunca se "eligen" como proveedor activo, solo se
 * documentan (con su nota) para que la UI del otro agente sepa qué pedir y
 * qué avisar ("requiere tu clave"; sin conector en vivo todavía). El default
 * gratis/OSS de cada categoría SÍ es código real y funcional (aunque algunos
 * —Stirling-PDF, n8n, el auto-selector de acceso web— necesiten que el
 * usuario les pegue un endpoint propio o de auto-hospedaje; eso se refleja
 * honestamente en `healthy:false` + una nota, nunca fingiendo que ya
 * funciona).
 *
 * NO DUPLICA sistemas existentes que ya resuelven bien su propia categoría:
 *   · LLM de chat → sigue gobernado por `router.ts`/`free-catalog.ts`
 *     (gratis-primero + failover). Aquí solo se añade el matiz "prefer-own"
 *     (ver `router.ts::rankCandidates`) y se expone para `describeActiveProviders()`.
 *   · Imagen/vídeo/voz/STT/TTS/workflow-por-conexión-concreta → siguen
 *     gobernados por `/servicios` (`lib/services/oss-services.ts` +
 *     `oss-connections.ts::resolveServiceFor`), que ya tiene su propio motor
 *     multi-conexión por scope. No se tocan ni se re-implementan aquí.
 *   · El "Hub de Conectores" general (`lib/connectors/*`) es una superficie
 *     hermana (categorías más amplias, otra UI); este módulo es independiente
 *     a propósito (otro agente lo evoluciona en paralelo) y no lo importa.
 *
 * Ver architecture/astraura-inteligencia.md §20 para el diseño completo.
 * Todo SSR-safe y defensivo: sin `window` degrada a valores neutros; ninguna
 * función de este archivo lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { loadIntegrationConfig } from "@/lib/integrations/registry";
import { loadConfigs as loadAiProviderConfigs } from "@/ai/client/providerStore";
import { readWebAccessConfig, availableWebAccessProviders } from "./web-access";
import { getProviderConfig as getSyncProviderConfig } from "./sync-providers";
import {
  connectorCredentials as readConnectorCredentialData,
  hasConnectorCredentials as hasConnectorCredentialsReal,
  getConnectorMode,
  setConnectorMode as setConnectorModeReal,
  getConnectorModePrefs,
  clearConnectorModeOverride as clearConnectorModeOverrideReal,
  type ConnectorMode,
} from "@/lib/connectors/connector-credentials";

/* ═══════════════════════════════ Categorías ═══════════════════════════════ */

/** Categoría funcional que el motor sabe resolver. */
export type ProviderCategory =
  | "llm-chat"
  | "web-search"
  | "web-fetch"
  | "maps"
  | "code-host"
  | "docs"
  | "notify"
  | "design"
  | "storage"
  | "email"
  | "calendar"
  | "pdf-tools"
  | "automation"
  | "memory";

/** Orden estable de categorías (para iterar/mostrar). */
export const PROVIDER_CATEGORIES: ProviderCategory[] = [
  "llm-chat",
  "web-search",
  "web-fetch",
  "maps",
  "code-host",
  "docs",
  "notify",
  "design",
  "storage",
  "email",
  "calendar",
  "pdf-tools",
  "automation",
  "memory",
];

/* ══════════════════════════ Modo del usuario (sincronizado) ══════════════════════════ */

/**
 * Alias del modo real de `lib/connectors/connector-credentials.ts` (el store
 * compartido del Hub de Conectores: clave `starseed.connectors.mode.v1`,
 * global + overrides por categoría, sincronizada vía SYNCED_KEYS). Este
 * módulo NO redefine su almacenamiento — delega en él para que Astraura y el
 * Hub de Conectores lean/escriban siempre el MISMO modo, sin dos fuentes de
 * verdad. Las funciones de abajo son azúcar con el vocabulario de categorías
 * de `provider-resolution.ts` (`ProviderCategory`, más fino que el
 * `ConnectorCategory` del Hub) por encima del mismo store.
 */
export type ConnectorsMode = ConnectorMode;

/** Lee el modo global + overrides (delegado en `connector-credentials.ts`). Nunca lanza. */
export function getConnectorsModeSettings(): {
  mode: ConnectorsMode;
  perCategory: Partial<Record<ProviderCategory, ConnectorsMode>>;
} {
  try {
    const prefs = getConnectorModePrefs();
    return {
      mode: prefs.global,
      perCategory: (prefs.perCategory ?? {}) as Partial<Record<ProviderCategory, ConnectorsMode>>,
    };
  } catch {
    return { mode: "auto", perCategory: {} };
  }
}

/** Cambia el modo GLOBAL de conectores (delegado; afecta a todas las categorías sin override). */
export function saveConnectorsMode(mode: ConnectorsMode): void {
  try {
    setConnectorModeReal(mode);
  } catch {
    /* cuota/modo privado: degrada en silencio */
  }
}

/** Fija (o borra con `null`) el override de UNA categoría (delegado). */
export function setCategoryMode(category: ProviderCategory, mode: ConnectorsMode | null): void {
  try {
    if (mode) setConnectorModeReal(mode, category);
    else clearConnectorModeOverrideReal(category);
  } catch {
    /* cuota/modo privado: degrada en silencio */
  }
}

/** Modo EFECTIVO de una categoría: su override si existe, si no el global (delegado). */
export function modeForCategory(category: ProviderCategory): ConnectorsMode {
  try {
    return getConnectorMode(category);
  } catch {
    return "auto";
  }
}

/* ══════════════════════════ Credenciales propias (SOLO LECTURA) ══════════════════════════ */

/**
 * Este módulo NO tiene su propio almacén de credenciales: delega SIEMPRE en
 * `lib/connectors/connector-credentials.ts` (clave real
 * `starseed.connectors.creds.v1`, bolsa libre `fields` + `enabled`), que es
 * donde escribe la UI del Hub de Conectores (otro agente). Aquí solo se ADAPTA
 * esa forma a un contrato estable (`apiKey`/`token`/`endpoint`/`oauthConnected`)
 * para el resto de este archivo, conservando TODOS los campos originales en
 * `extra` (por si un servicio usa una clave propia, p.ej. `cx`, `chatId`).
 */
export interface ConnectorCredentialEntry {
  apiKey?: string;
  token?: string;
  endpoint?: string;
  oauthConnected?: boolean;
  /** Todos los campos guardados tal cual (bolsa libre del Hub de Conectores). */
  extra?: Record<string, string>;
  updatedAt?: string;
}

/**
 * Lee (SOLO LECTURA) la credencial ACTIVADA de un servicio de marca por su id
 * (p.ej. "openai", "firecrawl", "github", "notion"…), desde el store REAL y
 * compartido del Hub de Conectores. SSR-safe y defensivo: nunca lanza; sin
 * dato o sin activar devuelve `{}`. Las credenciales NUNCA viajan a la cuenta
 * (no están en SYNCED_KEYS): quedan solo en este dispositivo.
 */
export function connectorCredentials(serviceId: string): ConnectorCredentialEntry {
  if (!serviceId) return {};
  try {
    const data = readConnectorCredentialData(serviceId);
    if (!data || !data.enabled) return {};
    const f = data.fields ?? {};
    return {
      apiKey: f.apiKey || f.key || undefined,
      token: f.token || undefined,
      endpoint: f.endpoint || f.baseUrl || f.url || undefined,
      oauthConnected: f.oauthConnected === "true" ? true : undefined,
      extra: Object.keys(f).length ? f : undefined,
      updatedAt: data.updatedAt,
    };
  } catch {
    return {};
  }
}

/** ¿Hay una credencial ACTIVADA (enabled) para este servicio? Delegado en el store real. */
export function hasConnectorCredential(serviceId: string): boolean {
  try {
    return hasConnectorCredentialsReal(serviceId);
  } catch {
    return false;
  }
}

/* ══════════════════════════ Catálogo por categoría ══════════════════════════ */

export interface BrandServiceField {
  /** Clave del campo (top-level de `ConnectorCredentialEntry`, o `extra.<clave>`). */
  key: string;
  /** Etiqueta ES para el formulario de la UI de escritura (otro agente). */
  label: string;
  secret?: boolean;
}

/** Un servicio de MARCA opcional (la cuenta propia del usuario) para una categoría. */
export interface BrandService {
  /** Id estable = clave en `connectorCredentials(id)`. */
  id: string;
  label: string;
  fields: BrandServiceField[];
  /**
   * ¿Existe código real en este repo que sepa LLAMAR a este servicio? `false`
   * = declarado honestamente (nota + campos) pero NUNCA se elige como
   * proveedor activo — evita fingir una integración que no existe.
   */
  hasRealConnector: boolean;
  /** true solo para el caso especial "funciona sin credencial" (Gmail vía mailto:). */
  noCredentialNeeded?: boolean;
  /** Nota honesta en ES (qué requiere, o por qué hoy es solo declarativo). */
  note: string;
}

export interface CategoryDefault {
  /** Id estable del mecanismo/conector por defecto. */
  id: string;
  label: string;
  /** Qué es, qué conector/capacidad real lo resuelve (para UI y prompt). */
  summary: string;
}

export interface ProviderCategoryDescriptor {
  id: ProviderCategory;
  label: string;
  description: string;
  default: CategoryDefault;
  ownServices: BrandService[];
  /**
   * true = el default gratis/OSS es un sistema INTERNO que estructuralmente
   * NO puede alcanzar la cuenta/recurso EXTERNO real del usuario (su Gmail,
   * su Drive, su Notion…): si hay cuenta propia sana, se prioriza incluso en
   * modo "auto". false = el default YA hace el mismo trabajo (buscar/rastrear
   * la web, mapas, LLM, PDF, automatización): "auto" se queda con él.
   */
  externalReach: boolean;
  /** "Cómo elige Astraura" para ESTA categoría (texto corto, ES). */
  howChosen: string;
}

const F_API_KEY = (label = "Clave de API"): BrandServiceField => ({ key: "apiKey", label, secret: true });
const F_TOKEN = (label = "Token"): BrandServiceField => ({ key: "token", label, secret: true });

export const CATEGORY_PROVIDERS: Record<ProviderCategory, ProviderCategoryDescriptor> = {
  "llm-chat": {
    id: "llm-chat",
    label: "IA de conversación (LLM)",
    description: "El modelo que razona y conversa con Aurora.",
    default: {
      id: "astraura-router",
      label: "Router gratis de Astraura",
      summary:
        "Cadena gratis-primero de `router.ts`/`free-catalog.ts`: local (Ollama/LM Studio) → navegador (SmolLM3/Chrome AI/WebLLM) → clave gratis (Groq/Cerebras/OpenRouter :free/Gemini…) → Pollinations (sin clave, red de seguridad universal). Con failover automático.",
    },
    ownServices: [
      { id: "openai", label: "OpenAI (propia)", fields: [F_API_KEY("Clave de API de OpenAI")], hasRealConnector: true, note: "Ya soportado por el sistema de proveedores (Ajustes → Inteligencia / IA)." },
      { id: "anthropic", label: "Anthropic Claude (propia)", fields: [F_API_KEY("Clave de API de Anthropic")], hasRealConnector: true, note: "Ya soportado por el sistema de proveedores (Ajustes → Inteligencia / IA)." },
    ],
    externalReach: false,
    howChosen:
      "Auto prioriza SIEMPRE el router gratis (igual que hoy); con clave propia configurada y modo \"usar mi cuenta\" activo (global o por esta categoría), se prioriza tu proveedor. \"Solo gratis\" descarta cualquier fuente de pago aunque esté configurada. El failover en cadena nunca se rompe.",
  },

  "web-search": {
    id: "web-search",
    label: "Búsqueda web",
    description: "Buscar en la web para responder con datos actuales.",
    default: {
      id: "duckduckgo-browser",
      label: "SearXNG (si lo configuras) / DuckDuckGo (navegador interno)",
      summary:
        "Si el usuario tiene SearXNG propio configurado (`starseed.integration.searxng`), Aurora lo usa como buscador estructurado. Si no, cae al buscador SIEMPRE disponible: abre DuckDuckGo dentro del navegador interno del OS (`buscar_web`, sin clave ni configuración).",
    },
    ownServices: [
      { id: "google-search", label: "Google Programmable Search (propia)", fields: [F_API_KEY("Clave de API"), { key: "extra.cx", label: "ID del motor de búsqueda (cx)" }], hasRealConnector: false, note: "Declarado: requiere tu clave + motor de búsqueda; sin conector en vivo en el OS todavía (el default OSS sí funciona)." },
      { id: "bing-search", label: "Bing Web Search (propia)", fields: [F_API_KEY("Clave de API de Bing")], hasRealConnector: false, note: "Declarado: requiere tu clave; sin conector en vivo en el OS todavía." },
    ],
    externalReach: false,
    howChosen:
      "Buscar la web es buscar la web: el default gratis/OSS ya resuelve la tarea igual de bien, así que \"auto\" se queda con él. Solo en \"usar mi cuenta\" se intentaría Google/Bing propia — hoy declarados sin conector real, por lo que en la práctica siempre gana el default.",
  },

  "web-fetch": {
    id: "web-fetch",
    label: "Lectura/rastreo de páginas web (scrape)",
    description: "Traer el contenido de una URL o rastrear un sitio.",
    default: {
      id: "crawl4ai",
      label: "Crawl4AI / Scrapling / DeepCrawl / WebHarvest / Universal Scraper / Maxun",
      summary:
        "Auto-selección gratis/local/OSS ya existente (`web-access.ts::selectWebAccessProvider`, herramientas `crawl_url`/`buscar_web`): usa el primer proveedor OSS que el usuario tenga configurado por endpoint; si no hay ninguno, Aurora pide la URL/el contenido (honesto, sin fingir que navega).",
    },
    ownServices: [
      { id: "firecrawl", label: "Firecrawl (propia)", fields: [F_API_KEY("Clave de API de Firecrawl")], hasRealConnector: true, note: "Conector real ya existente (`scrape_url` / `lib/integrations/clients/firecrawl.ts`); de pago/rate-limited fuera de un free tier acotado." },
    ],
    externalReach: false,
    howChosen:
      "Rastrear/leer una web es la misma tarea la haga quien la haga: el default gratis/OSS ya funciona igual de bien, así que \"auto\" lo prioriza (mismo criterio que el LLM: una clave de pago configurada no gana sola). Con \"usar mi cuenta\" se prioriza Firecrawl si tiene clave y está sano.",
  },

  maps: {
    id: "maps",
    label: "Mapas y geocodificación",
    description: "Buscar lugares, coordenadas y direcciones.",
    default: {
      id: "osm-nominatim",
      label: "OpenStreetMap / Nominatim (+ Open-Meteo Geocoding)",
      summary:
        "`lib/geocoding.ts` ya geocodifica con Open-Meteo (búsqueda directa) y Nominatim/OSM (reverse geocoding), sin clave; los mapas se pintan con Leaflet (`components/maps/*`). Funciona siempre, sin configurar nada.",
    },
    ownServices: [
      { id: "google-maps", label: "Google Maps (propia)", fields: [F_API_KEY("Clave de API de Google Maps")], hasRealConnector: false, note: "Declarado: requiere tu clave; sin conector en vivo en el OS todavía — el default OSM/Nominatim ya funciona." },
    ],
    externalReach: false,
    howChosen:
      "OpenStreetMap cubre el mismo mundo real: \"auto\" se queda con él. Google Maps propia queda declarada para cuando exista su conector; hoy nunca se elige sola (sin conector real).",
  },

  "code-host": {
    id: "code-host",
    label: "Repositorios / código",
    description: "Consultar repos y su metadata.",
    default: {
      id: "github-repo-proxy",
      label: "Proxy de lectura pública StarSeed",
      summary:
        "`src/app/api/github-repo/[owner]/[repo]/route.ts` + `lib/library/connected-repos.ts`: proxy de solo lectura a repos PÚBLICOS de GitHub, propio del backend del OS — siempre disponible, sin configuración del usuario.",
    },
    ownServices: [
      { id: "github", label: "GitHub (token propio)", fields: [F_TOKEN("Token personal de GitHub")], hasRealConnector: false, note: "Declarado: tu token desbloquearía repos privados y más límite de tasa; sin conector autenticado en vivo todavía (el proxy público de solo lectura sí funciona)." },
    ],
    externalReach: true,
    howChosen:
      "El proxy público NUNCA puede alcanzar tus repos PRIVADOS ni tu límite de tasa autenticado — eso es alcance externo real que solo tu cuenta puede dar. Por eso, si algún día hay token configurado y sano, se prioriza incluso en \"auto\" (hoy declarado, sin conector real, así que en la práctica siempre gana el proxy público).",
  },

  docs: {
    id: "docs",
    label: "Documentos y notas",
    description: "Guardar y consultar documentos/notas.",
    default: {
      id: "biblioteca",
      label: "Biblioteca del usuario",
      summary:
        "`lib/library/*` (notas/documentos/archivos vía `crear_nota`/`crear_documento`/`crear_archivo`) + memorias locales. Anytype aparece solo como CAPACIDAD declarada sin conector en vivo (ver architecture/astraura-inteligencia.md §19.5: su pairing de dos pasos no encaja aún con el patrón endpoint/token).",
    },
    ownServices: [
      { id: "notion", label: "Notion (propia)", fields: [F_TOKEN("Token de integración de Notion")], hasRealConnector: false, note: "Declarado: requiere tu token de integración; sin conector en vivo en el OS todavía — la Biblioteca ya funciona para notas/documentos internos." },
    ],
    externalReach: true,
    howChosen:
      "La Biblioteca es un sistema INTERNO: nunca contendrá tu workspace real de Notion. Con Notion propia configurada y sana se prioriza incluso en \"auto\" (hoy declarado, sin conector real, por lo que en la práctica siempre gana la Biblioteca).",
  },

  notify: {
    id: "notify",
    label: "Chat y notificaciones",
    description: "Enviar/recibir mensajes y avisos.",
    default: {
      id: "os-dm",
      label: "Mensajes internos (os_dm)",
      summary:
        "`lib/messages/dm.ts` (os_dm_threads/os_dm_members/os_dm_messages): mensajería interna del OS, con Aurora opcional por hilo. Siempre disponible dentro del ecosistema StarSeed.",
    },
    ownServices: [
      { id: "slack", label: "Slack (propio)", fields: [F_TOKEN("Token/Webhook de Slack")], hasRealConnector: false, note: "Declarado: requiere tu token/webhook; sin conector en vivo en el OS todavía." },
      { id: "telegram", label: "Telegram (propio)", fields: [F_TOKEN("Token del bot de Telegram"), { key: "extra.chatId", label: "Chat ID" }], hasRealConnector: false, note: "Declarado: requiere tu bot/token; sin conector en vivo en el OS todavía." },
    ],
    externalReach: true,
    howChosen:
      "Los mensajes internos nunca llegan a un canal de Slack/Telegram REAL fuera del OS: con cuenta propia sana se priorizaría incluso en \"auto\" para alcanzar ese canal externo (hoy declarado, sin conector real, así que en la práctica siempre gana el chat interno).",
  },

  design: {
    id: "design",
    label: "Diseño",
    description: "Lienzos, prototipos y bloques visuales.",
    default: {
      id: "pizarra",
      label: "Pizarra / Lienzo interno",
      summary:
        "`lib/canvas/canvas.ts` (`abrir_pizarra`/`crear_en_pizarra`): lienzo universal del OS que conecta con archivos, memorias, apps, enlaces y widgets. Siempre disponible.",
    },
    ownServices: [
      { id: "figma", label: "Figma (propia)", fields: [F_TOKEN("Token de acceso personal de Figma")], hasRealConnector: false, note: "Declarado: requiere tu token; sin conector en vivo en el OS todavía — la Pizarra interna ya funciona para diseño/lienzos propios del OS." },
      { id: "canva", label: "Canva (propia)", fields: [F_TOKEN("Token de Canva (Connect API)")], hasRealConnector: false, note: "Declarado: requiere tu token; sin conector en vivo en el OS todavía." },
    ],
    externalReach: true,
    howChosen:
      "La Pizarra interna nunca abrirá tus archivos REALES de Figma/Canva: con cuenta propia sana se priorizaría incluso en \"auto\" (hoy declarado, sin conector real, por lo que en la práctica siempre gana la Pizarra).",
  },

  storage: {
    id: "storage",
    label: "Almacenamiento de archivos",
    description: "Guardar y sincronizar archivos.",
    default: {
      id: "os-files",
      label: "Archivos del OS + Syncthing P2P (opcional)",
      summary:
        "Archivos internos del OS (Biblioteca/Finder) + sincronización P2P opcional y gratis vía Syncthing propio del usuario (`sync-providers.ts::p2p-syncthing`, `/sincronizacion`). Los archivos internos siempre funcionan; Syncthing es un extra gratis si el usuario lo activa.",
    },
    ownServices: [
      { id: "google-drive", label: "Google Drive (propia)", fields: [F_TOKEN("Token OAuth de Google Drive")], hasRealConnector: false, note: "Declarado: requiere tu token OAuth; sin conector en vivo en el OS todavía — los archivos del OS ya funcionan para almacenamiento interno." },
    ],
    externalReach: true,
    howChosen:
      "Los archivos del OS nunca son tus archivos REALES de Google Drive: con Drive propio sano se priorizaría incluso en \"auto\" (hoy declarado, sin conector real, por lo que en la práctica siempre gana el almacenamiento interno + Syncthing si lo activaste).",
  },

  email: {
    id: "email",
    label: "Correo",
    description: "Enviar y recibir correo.",
    default: {
      id: "os-mail",
      label: "Correo interno (os-mail sobre os_dm)",
      summary:
        "`lib/mail/os-mail.ts`: correo interno REAL construido sobre `os_dm_threads` (asunto, bandejas, reenviar, adjuntos). Siempre disponible dentro de la cuenta StarSeed.",
    },
    ownServices: [
      { id: "gmail", label: "Gmail (propia)", fields: [], hasRealConnector: true, noCredentialNeeded: true, note: "Hoy vía mailto: (abre tu cliente de correo externo, ya implementado en os-mail.ts); no hay envío por API de Gmail todavía." },
    ],
    externalReach: true,
    howChosen:
      "El correo interno nunca llega a una bandeja EXTERNA real: para eso está el mailto: (siempre disponible, sin credencial) que abre tu cliente de correo — se prioriza incluso en \"auto\" en cuanto el destino es externo. \"Solo gratis\" se queda solo con el correo interno.",
  },

  calendar: {
    id: "calendar",
    label: "Calendario",
    description: "Eventos y agenda.",
    default: {
      id: "calendario-interno",
      label: "Calendario unificado interno",
      summary: "`lib/events/events-store.ts` + `contexts/calendar-context.tsx`: calendario interno del OS (eventos, alarmas). Siempre disponible.",
    },
    ownServices: [
      { id: "google-calendar", label: "Google Calendar (propia)", fields: [F_TOKEN("Token OAuth de Google Calendar")], hasRealConnector: false, note: "Declarado: requiere tu token OAuth; sin conector en vivo en el OS todavía — el calendario interno ya funciona." },
    ],
    externalReach: true,
    howChosen:
      "El calendario interno nunca es tu agenda REAL de Google: con Calendar propio sano se priorizaría incluso en \"auto\" (hoy declarado, sin conector real, por lo que en la práctica siempre gana el calendario interno).",
  },

  "pdf-tools": {
    id: "pdf-tools",
    label: "Herramientas de PDF",
    description: "Fusionar, convertir y extraer texto de PDF.",
    default: {
      id: "stirling-pdf",
      label: "Stirling-PDF",
      summary:
        "`lib/integrations` (`pdf_merge`/`pdf_extract`/`pdf_to_image`): conector real a una instancia de Stirling-PDF (self-host, sin clave). Funciona en cuanto el usuario pega su endpoint (Ajustes → Integraciones); candidato a instancia oficial StarSeed on-by-default (ver freeHostingHint del registro).",
    },
    ownServices: [],
    externalReach: false,
    howChosen:
      "No hay servicio de marca opcional para PDF (mismo criterio que /servicios): solo gratis/OSS. \"Auto\" y \"prefer-own\" se comportan igual aquí — la única variable es si el usuario ya configuró su endpoint de Stirling-PDF.",
  },

  automation: {
    id: "automation",
    label: "Automatización / workflows",
    description: "Disparar flujos y automatizaciones.",
    default: {
      id: "n8n",
      label: "n8n (self-host)",
      summary:
        "`lib/integrations` (`run_automation` / `lanzar_workflow`): conector real a una instancia n8n propia por webhook, sin clave obligatoria. Funciona en cuanto el usuario pega su endpoint/webhook (Ajustes → Integraciones o /servicios).",
    },
    ownServices: [
      { id: "zapier", label: "Zapier (propia)", fields: [{ key: "endpoint", label: "URL de webhook de Zapier" }], hasRealConnector: false, note: "Declarado: pégalo como un webhook; sin conector dedicado en el OS todavía (usa n8n self-host mientras tanto, que sí es real)." },
    ],
    externalReach: false,
    howChosen:
      "n8n self-host, una vez configurado, puede alcanzar lo mismo que Zapier (nodos HTTP genéricos): no es un límite estructural, es solo esfuerzo de auto-hospedaje. Por eso \"auto\" se queda con n8n; Zapier propia queda declarada para cuando tenga conector dedicado.",
  },

  memory: {
    id: "memory",
    label: "Memoria y contexto agente",
    description: "Memoria persistente, búsqueda semántica, extracción automática de contexto para exocortex/Astraura.",
    default: {
      id: "openviking",
      label: "OpenViking (self-host)",
      summary:
        "`lib/integrations/clients/openviking.ts` + adapter `ai/astraura/integrations/openviking.ts`: conector real a OpenViking (memoria L0/L1/L2, búsqueda semántica, sesiones, skills). Funciona cuando el usuario ejecuta `openviking serve` local (puerto 1933) o configura endpoint remoto. El default gratis/OSS siempre disponible si el servidor OpenViking corre.",
    },
    ownServices: [],
    externalReach: false,
    howChosen:
      "OpenViking es el default gratis/OSS para memoria/contexto estructurado de agente. No hay servicio de marca opcional (mismo criterio que PDF tools): solo gratis/OSS. \"Auto\" y \"prefer-own\" se comportan igual — la única variable es si el usuario ya tiene OpenViking corriendo (local o remoto).",
  },
};

/** Descriptor de una categoría (o `undefined` si el id no está en el catálogo). */
export function getCategoryProvider(category: string): ProviderCategoryDescriptor | undefined {
  return CATEGORY_PROVIDERS[category as ProviderCategory];
}

/** Todos los descriptores, en el orden estable de `PROVIDER_CATEGORIES`. */
export function listCategoryProviders(): ProviderCategoryDescriptor[] {
  return PROVIDER_CATEGORIES.map((c) => CATEGORY_PROVIDERS[c]);
}

/* ══════════════════════════ Resolución EN VIVO del default ══════════════════════════ */

interface LiveDefault {
  id: string;
  label: string;
  healthy: boolean;
  note?: string;
}

/** Config de una integración de `lib/integrations`, tolerante a cualquier fallo. */
function integrationConfigured(id: string): boolean {
  try {
    const cfg = loadIntegrationConfig(id);
    return cfg.enabled !== false && !!(cfg.endpoint && cfg.endpoint.trim());
  } catch {
    return false;
  }
}

/** Resuelve EN VIVO (pero síncrono y barato) el default de cada categoría. */
function resolveCategoryDefaultLive(category: ProviderCategory, ctx?: ResolveProviderContext): LiveDefault {
  switch (category) {
    case "llm-chat":
      // Pollinations (sin clave) es la red de seguridad universal de router.ts.
      return { id: "astraura-router", label: "Router gratis de Astraura", healthy: true };

    case "web-search": {
      try {
        if (integrationConfigured("searxng")) {
          return { id: "searxng", label: "SearXNG (tu instancia)", healthy: true };
        }
      } catch {
        /* cae al siempre-disponible */
      }
      return { id: "duckduckgo-browser", label: "DuckDuckGo (navegador interno)", healthy: true };
    }

    case "web-fetch": {
      try {
        const free = availableWebAccessProviders().filter((p) => p.free);
        if (free.length) {
          const hint = String(ctx?.taskHint ?? "").toLowerCase();
          const matched = hint ? free.find((p) => p.strengths.some((s) => hint.includes(s))) : undefined;
          const chosen = matched ?? free[0];
          return { id: chosen.id, label: chosen.label, healthy: true };
        }
      } catch {
        /* degrada a "sin configurar" */
      }
      return {
        id: "crawl4ai",
        label: "Crawl4AI (self-host, sin configurar todavía)",
        healthy: false,
        note: "Configura un endpoint OSS en Ajustes → Acceso web (Crawl4AI/Scrapling/DeepCrawl…), o Aurora pedirá la URL/el contenido.",
      };
    }

    case "maps":
      return { id: "osm-nominatim", label: "OpenStreetMap / Nominatim", healthy: true };

    case "code-host":
      return { id: "github-repo-proxy", label: "Proxy de lectura pública StarSeed", healthy: true };

    case "docs":
      return { id: "biblioteca", label: "Biblioteca del usuario", healthy: true };

    case "notify":
      return { id: "os-dm", label: "Mensajes internos (os_dm)", healthy: true };

    case "design":
      return { id: "pizarra", label: "Pizarra / Lienzo interno", healthy: true };

    case "storage": {
      try {
        const cfg = getSyncProviderConfig("p2p-syncthing");
        if (cfg && typeof cfg.endpoint === "string" && cfg.endpoint.trim()) {
          return { id: "os-files+syncthing", label: "Archivos del OS + Syncthing P2P", healthy: true };
        }
      } catch {
        /* degrada al almacenamiento interno puro */
      }
      return {
        id: "os-files",
        label: "Archivos del OS (local)",
        healthy: true,
        note: "Activa Syncthing P2P en /sincronizacion (gratis) para espejo entre tus dispositivos.",
      };
    }

    case "email":
      return { id: "os-mail", label: "Correo interno (os-mail)", healthy: true };

    case "calendar":
      return { id: "calendario-interno", label: "Calendario unificado interno", healthy: true };

    case "pdf-tools": {
      if (integrationConfigured("stirling-pdf")) {
        return { id: "stirling-pdf", label: "Stirling-PDF (tu instancia)", healthy: true };
      }
      return {
        id: "stirling-pdf",
        label: "Stirling-PDF (self-host, sin configurar todavía)",
        healthy: false,
        note: "Auto-hospeda Stirling-PDF (Docker) y pega su endpoint en Ajustes → Integraciones.",
      };
    }

    case "automation": {
      if (integrationConfigured("n8n")) {
        return { id: "n8n", label: "n8n (tu instancia self-host)", healthy: true };
      }
      return {
        id: "n8n",
        label: "n8n (self-host, sin configurar todavía)",
        healthy: false,
        note: "Auto-hospeda n8n y pega su endpoint/webhook en Ajustes → Integraciones o en /servicios.",
      };
    }

    case "memory": {
      if (integrationConfigured("openviking")) {
        return { id: "openviking", label: "OpenViking (tu instancia)", healthy: true };
      }
      return {
        id: "openviking",
        label: "OpenViking (self-host, sin configurar todavía)",
        healthy: false,
        note: "Ejecuta `openviking serve` local (puerto 1933) o configura endpoint remoto en Ajustes → Integraciones.",
      };
    }

    default: {
      // Rama defensiva en runtime: el switch de arriba ya es exhaustivo sobre
      // `ProviderCategory` (TS lo sabe y estrecha `category` a `never` aquí),
      // pero se conserva por si algo llama a esta función con un id inválido
      // (p.ej. viniendo de JS sin tipos). Se relee sin el estrechamiento.
      const anyCategory = category as string;
      const d = CATEGORY_PROVIDERS[anyCategory as ProviderCategory]?.default;
      return d ? { id: d.id, label: d.label, healthy: false } : { id: "desconocido", label: "Sin catálogo", healthy: false };
    }
  }
}

/** ¿Tiene el usuario, en el store de IA (`starseed.ai.providers`), una clave propia activa para este id? */
function hasEnabledAiProviderKey(providerId: "openai" | "anthropic"): boolean {
  try {
    const configs = loadAiProviderConfigs();
    return configs.some((c) => c.id === providerId && c.enabled && !!c.encryptedKey);
  } catch {
    return false;
  }
}

/** ¿Está sano (con credencial/config presente) este servicio de marca? Tolerante: solo presencia, sin sonda de red. */
function ownServiceHealthy(svc: BrandService): boolean {
  try {
    if (!svc.hasRealConnector) return false; // declarado-solo: nunca se elige de verdad
    if (svc.noCredentialNeeded) return true; // p.ej. Gmail vía mailto: (siempre disponible)
    if (svc.id === "openai" || svc.id === "anthropic") {
      if (hasEnabledAiProviderKey(svc.id)) return true;
      return hasConnectorCredential(svc.id); // por si la UI unificada guarda la clave aquí en el futuro
    }
    if (svc.id === "firecrawl") {
      if (hasConnectorCredential("firecrawl")) return true;
      try {
        const legacy = readWebAccessConfig()["firecrawl"];
        return !!(legacy && legacy.key && legacy.key.trim());
      } catch {
        return false;
      }
    }
    return hasConnectorCredential(svc.id);
  } catch {
    return false;
  }
}

/* ══════════════════════════ resolveProvider (API pública) ══════════════════════════ */

export interface ResolveProviderContext {
  /** Pista de tarea/consulta (afina el default cuando hay varios OSS disponibles). */
  taskHint?: string;
  /** Cerebro activo (reservado; hoy informativo). */
  brainId?: string;
}

export interface ResolvedProvider {
  category: ProviderCategory;
  /** "own" = servicio de marca del usuario; "default" = gratis/OSS del sistema. */
  origin: "own" | "default";
  /** Id estable del proveedor activo (BrandService.id o CategoryDefault.id). */
  id: string;
  /** Etiqueta ES lista para mostrar/anunciar. */
  label: string;
  /** Motivo honesto de la elección (transparencia, mismo espíritu que `RouteRecord.reason`). */
  reason: string;
  /** Tolerante: hay credencial/config presente (sin sonda de red). */
  healthy: boolean;
  /** Nota accionable cuando algo falta o hay un matiz honesto que decir. */
  note?: string;
}

function unknownCategoryFallback(category: string): ResolvedProvider {
  return {
    category: category as ProviderCategory,
    origin: "default",
    id: "desconocido",
    label: "Sin catálogo",
    reason: `La categoría "${category}" no está en el catálogo de proveedores de Astraura.`,
    healthy: false,
  };
}

/** Fuerza la resolución del DEFAULT gratis/OSS (ignora la cuenta propia). Nunca lanza. */
export function resolveDefaultProvider(
  category: ProviderCategory,
  ctx?: ResolveProviderContext,
): ResolvedProvider {
  const descriptor = CATEGORY_PROVIDERS[category];
  if (!descriptor) return unknownCategoryFallback(category);
  try {
    const live = resolveCategoryDefaultLive(category, ctx);
    return {
      category,
      origin: "default",
      id: live.id,
      label: live.label,
      healthy: live.healthy,
      note: live.note,
      reason: live.healthy
        ? `Gratis/OSS por defecto para "${descriptor.label}".`
        : `Gratis/OSS por defecto para "${descriptor.label}" (aún sin configurar).`,
    };
  } catch {
    return {
      category,
      origin: "default",
      id: descriptor.default.id,
      label: descriptor.default.label,
      healthy: false,
      reason: `Gratis/OSS por defecto para "${descriptor.label}".`,
    };
  }
}

/**
 * Resuelve el proveedor ACTIVO para una categoría según: el modo del usuario
 * (global + override por categoría, `starseed.connectors.mode.v1`) y si su
 * servicio propio está configurado y SANO (comprobación tolerante, sin red).
 * NUNCA lanza; SIEMPRE devuelve un proveedor válido (principio "nunca falla").
 */
export function resolveProvider(
  category: ProviderCategory,
  ctx?: ResolveProviderContext,
): ResolvedProvider {
  const descriptor = CATEGORY_PROVIDERS[category];
  if (!descriptor) return unknownCategoryFallback(category);
  try {
    const mode = modeForCategory(category);
    if (mode === "only-free") return resolveDefaultProvider(category, ctx);

    const own = descriptor.ownServices.find((s) => ownServiceHealthy(s));
    if (own) {
      if (mode === "prefer-own") {
        return {
          category,
          origin: "own",
          id: own.id,
          label: own.label,
          healthy: true,
          note: own.note,
          reason: `Tu cuenta propia (${own.label}) está configurada y activa — modo "usar mi cuenta".`,
        };
      }
      // auto: solo se prioriza la cuenta propia si el default no puede alcanzar
      // el recurso EXTERNO real (externalReach); si no, gratis/OSS manda.
      if (descriptor.externalReach) {
        return {
          category,
          origin: "own",
          id: own.id,
          label: own.label,
          healthy: true,
          note: own.note,
          reason: `El default gratis/OSS de "${descriptor.label}" es interno y no puede alcanzar tu cuenta externa real; se usa tu ${own.label} configurado.`,
        };
      }
    }
    return resolveDefaultProvider(category, ctx);
  } catch {
    return resolveDefaultProvider(category, ctx);
  }
}

/* ══════════════════════════ withProviderFallback ══════════════════════════ */

/**
 * Intenta el proveedor RESUELTO para `category`; si falla (lanza o devuelve
 * `ok:false`) y el resuelto era "own", reintenta con el DEFAULT gratis/OSS y
 * registra la sustitución (mismo espíritu que `TOOL_ALTERNATES` en
 * `aurora-tools.ts`). Si el resuelto YA era el default, no hay más a qué caer:
 * se devuelve el fallo tal cual (honesto). Nunca lanza.
 */
export async function withProviderFallback<T extends { ok: boolean; error?: string; data?: any }>(
  category: ProviderCategory,
  fn: (provider: ResolvedProvider) => Promise<T>,
  ctx?: ResolveProviderContext,
): Promise<T & { providerUsed?: string; substituted?: boolean }> {
  const resolved = resolveProvider(category, ctx);

  const tryDefault = async (): Promise<T & { providerUsed?: string; substituted?: boolean }> => {
    const fallback = resolveDefaultProvider(category, ctx);
    try {
      const res2 = await fn(fallback);
      const note = `[Sustitución automática: «${resolved.label}» no respondió, usé «${fallback.label}» en su lugar]`;
      const text = typeof (res2 as any)?.data?.text === "string" ? `${note} ${(res2 as any).data.text}`.trim() : undefined;
      return {
        ...res2,
        ...(text !== undefined ? { data: { ...(res2 as any).data, text } } : {}),
        providerUsed: fallback.id,
        substituted: true,
      };
    } catch (e: any) {
      return {
        ok: false,
        error: `Fallo en «${resolved.label}» y en el default «${fallback.label}»: ${e?.message ?? e}`,
      } as unknown as T & { providerUsed?: string; substituted?: boolean };
    }
  };

  try {
    const res = await fn(resolved);
    if (res && res.ok) return { ...res, providerUsed: resolved.id };
    if (resolved.origin === "own") return tryDefault();
    return { ...res, providerUsed: resolved.id };
  } catch {
    if (resolved.origin === "own") return tryDefault();
    return {
      ok: false,
      error: `Fallo en «${resolved.label}».`,
    } as unknown as T & { providerUsed?: string; substituted?: boolean };
  }
}

/* ══════════════════════════ describeActiveProviders ══════════════════════════ */

/**
 * Resumen ES, una línea por categoría, de qué proveedor está ACTIVO ahora
 * mismo (para la UI de ajustes del otro agente). Nunca lanza.
 */
export function describeActiveProviders(): string {
  return PROVIDER_CATEGORIES.map((cat) => {
    const d = CATEGORY_PROVIDERS[cat];
    let r: ResolvedProvider;
    try {
      r = resolveProvider(cat);
    } catch {
      r = unknownCategoryFallback(cat);
    }
    const origin = r.origin === "own" ? "tu cuenta" : "gratis/OSS";
    const salud = r.healthy ? "" : " (sin configurar todavía)";
    return `${d.label}: ${r.label} — ${origin}${salud}.`;
  }).join("\n");
}

/**
 * Versión de UNA frase (para inyectar en el contexto de Aurora vía
 * `context.ts`): si ninguna categoría usa cuenta propia, un mensaje corto y
 * tranquilizador; si alguna sí, las nombra. Nunca lanza.
 */
export function describeActiveProvidersCompact(): string {
  try {
    const resolved = PROVIDER_CATEGORIES.map((c) => ({ c, r: resolveProvider(c) }));
    const ownOnes = resolved.filter((x) => x.r.origin === "own");
    if (!ownOnes.length) {
      return "Proveedores: todo funciona con las opciones gratis/OSS por defecto de Astraura (sin cuentas propias activas ahora).";
    }
    const lista = ownOnes.map((x) => `${CATEGORY_PROVIDERS[x.c].label} → ${x.r.label} (tu cuenta)`).join("; ");
    return `Proveedores: el resto usa gratis/OSS por defecto; con tu cuenta propia: ${lista}.`;
  } catch {
    return "";
  }
}
