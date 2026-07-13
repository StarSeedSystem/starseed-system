/*
 * Conectores · Registro base (BUILTIN_CONNECTORS)
 * ---------------------------------------------------------------------------
 * Catálogo semilla del Hub de Conectores. Es solo DATOS (sin efectos): puede
 * importarse en servidor y cliente.
 *
 * PRINCIPIO RECTOR (CLAUDE.md §3 Ciberdelia · §6 Código Abierto absoluto):
 *  - PRIMERO lo PROPIO / CÓDIGO ABIERTO / GRATIS ABIERTO → `status: 'available'`
 *    o `'connected'`, `authType: 'none' | 'localEndpoint'`, SIN cuenta.
 *  - LUEGO, y claramente OPCIONALES, los de clave/oauth de terceros →
 *    `status: 'needs-auth'`. Somos honestos: requieren que el usuario los conecte.
 *
 * El `status` aquí es el BASE del descriptor; el estado EFECTIVO (según lo que
 * el usuario haya configurado) lo calcula `store.connectorStatus()`.
 *
 * Los ids OSS/propios reusan vocabulario ya presente en el ecosistema (Ollama,
 * OpenLLM, Pollinations, SearXNG, Crawl4AI…) para que Astraura y la Biblioteca
 * hablen el mismo idioma. No importa de otros módulos para no acoplarse.
 */

import type { Connector } from "./model";

/**
 * Lista semilla de conectores. Ampliable por el usuario (custom) y por futuras
 * adendas. El ORDEN pone delante lo propio/OSS/gratis (recomendado por defecto).
 */
export const BUILTIN_CONNECTORS: Connector[] = [
  // ───────────────────────── LLM · propio / OSS / gratis ─────────────────────────
  {
    id: "ollama-local",
    name: "Ollama (local)",
    category: "llm",
    kind: "own",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Cpu",
    description:
      "Modelos ejecutándose en tu propio equipo. Sin cuenta, sin coste, 100% privado. Es el motor propio por defecto.",
    repo: "https://github.com/ollama/ollama",
    docsUrl: "https://ollama.com",
    configHint: "http://localhost:11434",
  },
  {
    id: "openllm-local",
    name: "OpenLLM",
    category: "llm",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Server",
    description:
      "Servidor OSS para exponer modelos abiertos por un endpoint compatible OpenAI. Auto-hospédalo y apúntalo aquí.",
    repo: "https://github.com/bentoml/OpenLLM",
    docsUrl: "https://github.com/bentoml/OpenLLM",
    configHint: "http://localhost:3000/v1",
  },
  {
    id: "pollinations",
    name: "Pollinations",
    category: "llm",
    kind: "free",
    authType: "none",
    status: "available",
    free: true,
    recommended: true,
    icon: "Sparkles",
    description:
      "Inferencia gratuita y abierta, sin clave. Funciona al instante como respaldo cuando no hay modelo local.",
    docsUrl: "https://pollinations.ai",
  },

  // ───────────────────────── Búsqueda · OSS auto-hospedable ─────────────────────────
  {
    id: "searxng-selfhost",
    name: "SearXNG (auto-hospedado)",
    category: "search",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Search",
    description:
      "Metabuscador OSS que respeta la privacidad. Auto-hospédalo y Aurora buscará sin rastreo ni cuentas.",
    repo: "https://github.com/searxng/searxng",
    docsUrl: "https://docs.searxng.org",
    configHint: "http://localhost:8080",
  },

  // ───────────────────────── Web (rastreo/lectura) · OSS ─────────────────────────
  {
    id: "crawl4ai-local",
    name: "Crawl4AI",
    category: "web",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Globe2",
    description:
      "Rastreo y lectura de páginas orientado a IA, de código abierto. Auto-hospédalo para dar sentidos web a Aurora.",
    repo: "https://github.com/unclecode/crawl4ai",
    docsUrl: "https://github.com/unclecode/crawl4ai",
    configHint: "http://localhost:11235",
  },

  // ───────────────────────── Archivos · propios del dispositivo ─────────────────────────
  {
    id: "local-files",
    name: "Archivos locales",
    category: "files",
    kind: "own",
    authType: "none",
    status: "available",
    free: true,
    recommended: true,
    icon: "FolderOpen",
    description:
      "Los archivos que abres/subes en tu dispositivo. Son tuyos y funcionan sin cuenta: Aurora puede razonar sobre ellos.",
  },

  // ───────────────────────── Memoria · propia ─────────────────────────
  {
    id: "local-memory",
    name: "Memoria local (Exocórtex)",
    category: "memory",
    kind: "own",
    authType: "none",
    status: "available",
    free: true,
    recommended: true,
    icon: "Brain",
    description:
      "Tu memoria y contexto guardados en el navegador (Registro Acásico Personal). Propiedad tuya, sin coste ni cuenta.",
  },

  // ════════════════════════════════════════════════════════════════════════════
  //  A PARTIR DE AQUÍ: conectores de terceros, CLARAMENTE OPCIONALES.
  //  Requieren que TÚ los conectes (clave u OAuth). El OS funciona sin ellos.
  // ════════════════════════════════════════════════════════════════════════════

  // ───────────────────────── Correo ─────────────────────────
  {
    id: "gmail",
    name: "Gmail",
    category: "email",
    kind: "free",
    authType: "oauth",
    status: "needs-auth",
    free: true, // gratis, pero requiere conectar tu cuenta (opcional)
    icon: "Mail",
    description:
      "Opcional: conecta tu Gmail para leer/redactar correo. Requiere autorización OAuth con tu cuenta Google.",
    docsUrl: "https://developers.google.com/gmail/api",
    configHint: "Se conecta por OAuth (Google)",
  },

  // ───────────────────────── Almacenamiento ─────────────────────────
  {
    id: "google-drive",
    name: "Google Drive",
    category: "storage",
    kind: "free",
    authType: "oauth",
    status: "needs-auth",
    free: true,
    icon: "HardDrive",
    description:
      "Opcional: conecta Google Drive para leer/guardar archivos en la nube. Requiere autorización OAuth.",
    docsUrl: "https://developers.google.com/drive/api",
    configHint: "Se conecta por OAuth (Google)",
  },

  // ───────────────────────── Calendario ─────────────────────────
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    kind: "free",
    authType: "oauth",
    status: "needs-auth",
    free: true,
    icon: "Calendar",
    description:
      "Opcional: conecta tu calendario para ver/crear eventos. Requiere autorización OAuth con tu cuenta Google.",
    docsUrl: "https://developers.google.com/calendar/api",
    configHint: "Se conecta por OAuth (Google)",
  },

  // ───────────────────────── Memoria / notas externas ─────────────────────────
  {
    id: "notion",
    name: "Notion",
    category: "memory",
    kind: "free",
    authType: "apiKey",
    status: "needs-auth",
    free: true,
    icon: "NotebookPen",
    description:
      "Opcional: conecta tu Notion (token de integración) para leer/escribir páginas y bases de datos.",
    docsUrl: "https://www.notion.so/my-integrations",
    configHint: "secret_… (Internal Integration Token)",
  },

  // ───────────────────────── Chat de equipo ─────────────────────────
  {
    id: "slack",
    name: "Slack",
    category: "chat",
    kind: "free",
    authType: "oauth",
    status: "needs-auth",
    free: true,
    icon: "MessageSquare",
    description:
      "Opcional: conecta un espacio de Slack para leer/enviar mensajes. Requiere autorización OAuth de la app de Slack.",
    docsUrl: "https://api.slack.com/authentication/oauth-v2",
    configHint: "Se conecta por OAuth (Slack)",
  },

  // ───────────────────────── Desarrollo ─────────────────────────
  {
    id: "github",
    name: "GitHub",
    category: "dev",
    kind: "free",
    authType: "apiKey",
    status: "needs-auth",
    free: true,
    icon: "Github",
    description:
      "Opcional: conecta GitHub con un token personal (PAT) para leer repos, issues y PRs. Nunca lo usa sin tu token.",
    docsUrl: "https://github.com/settings/tokens",
    configHint: "ghp_… (Personal Access Token)",
  },

  // ───────────────────────── Diseño / social (creación) ─────────────────────────
  {
    id: "figma",
    name: "Figma",
    category: "dev",
    kind: "free",
    authType: "apiKey",
    status: "needs-auth",
    free: true,
    icon: "Figma",
    description:
      "Opcional: conecta Figma con un token personal para leer archivos y componentes de diseño.",
    docsUrl: "https://www.figma.com/developers/api#access-tokens",
    configHint: "figd_… (Personal Access Token)",
  },

  /* ═════════════ Adenda 67 · P4 (jul-2026) ══════════════════════════════
   * Cinco conectores nuevos en el Hub. Se ordenan por el principio rector del
   * fichero: primero lo PROPIO/OSS auto-hospedado, y solo después el servicio
   * externo con clave. Ninguno se activa solo. */

  // ── Búsqueda propia (P4-5) ──
  {
    id: "typesense",
    name: "Typesense (auto-hospedado)",
    category: "search",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Search",
    description:
      "Motor de búsqueda OSS, instantáneo y tolerante a erratas (alternativa a Algolia). Si lo conectas, la búsqueda de personas y grupos del OS lo usa; si no —o si se cae— cae sola a Supabase. Nunca te quedas sin búsqueda. Usa una clave de SOLO BÚSQUEDA, jamás la admin key.",
    repo: "https://github.com/typesense/typesense",
    docsUrl: "https://typesense.org/docs/latest/api/search.html",
    configHint: "http://tu-neurona:8108",
  },

  // ── Memoria de agentes (P4-6) ──
  {
    id: "tencentdb-memory",
    name: "TencentDB Agent Memory",
    category: "memory",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Brain",
    description:
      "Memoria de largo plazo POR CAPAS para tus cerebros (conversación → átomo → escena → persona) + memoria simbólica que ahorra tokens. 100% local por defecto (SQLite), sin APIs externas. Trae Gateway HTTP propio: levántalo en tu neurona y pega su URL.",
    repo: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
    docsUrl: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
    configHint: "http://tu-neurona:8420",
  },
  {
    id: "mempalace",
    name: "MemPalace (local · CLI/MCP)",
    category: "memory",
    kind: "own",
    authType: "localEndpoint",
    status: "needs-auth",
    free: true,
    icon: "Library",
    description:
      "Memoria local-first que guarda tus conversaciones LITERALMENTE y las recupera por búsqueda semántica (palacio de la memoria: alas, habitaciones, cajones). ⚠️ HONESTIDAD: no expone API HTTP — su MCP habla por stdio, así que el navegador no puede sincronizar con él. Declara aquí un puente HTTP propio si lo montas; si no, úsalo desde tu agente local.",
    repo: "https://github.com/mempalace/mempalace",
    docsUrl: "https://mempalaceofficial.com/guide/getting-started.html",
    configHint: "vacío = solo local (CLI/MCP) · o la URL de tu puente HTTP",
  },

  // ── Agentes complejos (P4-1) ──
  {
    id: "openmanus",
    name: "OpenManus (agente general)",
    category: "custom",
    kind: "oss",
    authType: "localEndpoint",
    status: "needs-auth",
    free: true,
    icon: "Bot",
    description:
      "Agente general OSS (MIT) al que Aurora puede DELEGAR tareas complejas de varios pasos. ⚠️ No trae API HTTP oficial (es CLI + servidor MCP): tienes que exponerlo tú en tu neurona y declarar la ruta. Sin eso, Aurora no delega y te lo dice — no finge haberlo hecho.",
    repo: "https://github.com/FoundationAgents/OpenManus",
    docsUrl: "https://github.com/FoundationAgents/OpenManus",
    configHint: "http://tu-neurona:8000 (+ ruta en Ajustes → Integraciones)",
  },

  // ── Redes sociales (P4-8) ──
  {
    id: "postiz",
    name: "Postiz (redes sociales)",
    category: "social",
    kind: "oss",
    authType: "apiKey",
    status: "needs-auth",
    free: true,
    icon: "Megaphone",
    description:
      "Publica y programa en ~32 redes (X, LinkedIn, Instagram, Mastodon, Bluesky, Telegram, Discord…). OSS y auto-hospedable, o su nube. Añade al Lienzo la acción «Publicar también en redes». ⚠️ Irreversible y NUNCA automático: solo sale lo que confirmes a mano, con canales y texto a la vista.",
    repo: "https://github.com/gitroomhq/postiz-app",
    docsUrl: "https://docs.postiz.com/public-api",
    configHint: "Clave de Ajustes → Desarrolladores → Public API",
  },
];

/** Lookup rápido por id (para no recorrer el array en cada acceso). */
export const CONNECTORS_BY_ID: Record<string, Connector> = Object.freeze(
  BUILTIN_CONNECTORS.reduce<Record<string, Connector>>((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {}),
);

/** Ids del conjunto RECOMENDADO por defecto (gratis · propio · código abierto). */
export const RECOMMENDED_CONNECTOR_IDS: string[] = BUILTIN_CONNECTORS.filter(
  (c) => c.recommended,
).map((c) => c.id);
