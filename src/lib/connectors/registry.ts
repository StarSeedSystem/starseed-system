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

  /* ═════════════ Adenda CVV1028-J · contenido vivo (oct-2026) ════════════════
   * Conectores de contenido vivo (architecture/contenido-vivo.md §3). Son
   * fichas de catálogo SOLO: no duplican los adaptadores de generación de
   * src/lib/brains/adapters.ts (Higgsfield se sirve de ese preset y su clave
   * vive en la BÓVEDA, jamás en el código). Ninguno se activa solo. */

  // ── Escenas 3D (contenido vivo · nivel 1) ──
  {
    id: "spline",
    name: "Spline (escenas 3D)",
    category: "custom",
    kind: "free",
    authType: "oauth",
    status: "needs-auth",
    free: true,
    icon: "Boxes",
    description:
      "Opcional: escenas 3D para el nivel «3D vivo» del contenido vivo (cuentas, páginas y grupos). Se conecta por MCP con tu propia cuenta de Spline; el plan Pro trae 200 llamadas al día que se reinician a las 00:00 UTC. Local primero: Three.js y Blender no gastan llamadas. Nunca se editan escenas ajenas: solo embeber o remezclar.",
    docsUrl: "https://mcp.spline.design/mcp",
    configHint: "Se conecta con tu cuenta de Spline (MCP)",
  },

  // ── Imagen y vídeo de pago (contenido vivo · niveles 2 y 3) ──
  {
    id: "higgsfield",
    name: "Higgsfield (imagen y vídeo)",
    category: "custom",
    kind: "paid",
    authType: "apiKey",
    status: "needs-auth",
    free: false,
    icon: "Clapperboard",
    description:
      "Opcional: fotogramas y clips de la «película de scroll» y las fotos vivas. Gasta créditos (p. ej. Nano Banana 2 ≈ 2 por imagen, Seedance 1080p/5 s ≈ 60). Reutiliza el preset ya definido en los servidores de cerebro (adaptador higgsfield): pega el endpoint de tu cuenta y el NOMBRE de la variable de tu clave en la bóveda. Nada sale de tu dispositivo sin cotización y tu «sí».",
    docsUrl: "https://cloud.higgsfield.ai",
    configHint: "Endpoint de cloud.higgsfield.ai + clave guardada en la bóveda",
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

  // ── Auto-hospedados (repos-libreria-1020b) ──
  {
    id: "vikunja-selfhost",
    name: "Vikunja (auto-hospedado)",
    category: "custom",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "ListChecks",
    description:
      "Gestor de tareas y proyectos auto-alojable (Go, licencia AGPL-3.0+). Tareas, proyectos, grupos, comunidades, páginas y cerebros. Se aloja en tu A1 o tu Mac; requiere token de API.",
    repo: "https://github.com/go-vikunja/vikunja",
    docsUrl: "https://github.com/go-vikunja/vikunja",
    configHint: "http://<tu A1 o tu Mac>:3456/api/v1",
  },
  {
    id: "trilium-etapi",
    name: "Trilium ETAPI (auto-hospedado)",
    category: "memory",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "NotebookText",
    description:
      "Notas jerárquicas con ETAPI (REST) para perfiles, grupos, cerebros y archivos. Licencia AGPL-3.0+; se aloja en tu servidor.",
    repo: "https://github.com/TriliumNext/Trilium",
    docsUrl: "https://github.com/TriliumNext/Trilium",
    configHint: "http://<host>:8080/etapi",
  },
  {
    id: "metabase-selfhost",
    name: "Metabase (auto-hospedado)",
    category: "custom",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "BarChart3",
    description:
      "Analítica y paneles sobre una réplica de solo lectura. Licencia AGPL-3.0 + licencia comercial; auto-hospédalo para gráficos e información verificable.",
    repo: "https://github.com/metabase/metabase",
    docsUrl: "https://www.metabase.com/docs/latest",
    configHint: "http://<host>:3000/api",
  },
  {
    id: "windmill-selfhost",
    name: "Windmill (auto-hospedado)",
    category: "dev",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "Zap",
    description:
      "Flujos y trabajos programados que Genesis y Astraura disparan (Python/TS/Bash/SQL). Licencia AGPL-3.0 (núcleo) + Apache-2.0 (SDK) + propietario (Enterprise); se aloja en tu servidor.",
    repo: "https://github.com/windmill-labs/windmill",
    docsUrl: "https://www.windmill.dev/docs",
    configHint: "http://<host>:8000/api",
  },
  {
    id: "tirreno-selfhost",
    name: "tirreno (auto-hospedado)",
    category: "custom",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "ShieldAlert",
    description:
      "Antifraude de cuentas y votaciones (toma de cuentas, bots, abuso). Licencia AGPL-3.0; se aloja en tu servidor. Recibe IP y correos de quien lo use: se activa solo con aviso de privacidad y el mínimo de datos. No protege la malla P2P.",
    repo: "https://github.com/tirrenotechnologies/tirreno",
    docsUrl: "https://github.com/tirrenotechnologies/tirreno",
    configHint: "http://<host>:8585",
  },
  {
    id: "moli-serve",
    name: "Moli (navegador sin interfaz)",
    category: "web",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: false,
    icon: "Globe",
    description:
      "Navegador sin interfaz en Rust para agentes: ejecuta JavaScript y entrega Markdown. Licencia Apache-2.0 o MIT. Exige sandbox y lista de dominios permitidos: el contenido web es dato, nunca instrucción, y puede llevar inyección de instrucciones.",
    repo: "https://github.com/lexmount/moli",
    docsUrl: "https://github.com/lexmount/moli",
    configHint: "http://127.0.0.1:<puerto de moli serve>",
  },
  {
    id: "dbx-mcp",
    name: "DBX (MCP de bases de datos)",
    category: "dev",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: false,
    icon: "Database",
    description:
      "Inspección de las bases locales de servidores, neuronas y capas de conciencia por MCP. Licencia Apache-2.0. Siempre en modo solo lectura: nunca el «Acceso total»; su IA integrada puede enviar esquemas a la nube, usa solo Ollama.",
    repo: "https://github.com/t8y2/dbx",
    docsUrl: "https://github.com/t8y2/dbx",
    configHint: "http://127.0.0.1:<puerto de dbx mcp>",
  },
  {
    id: "openshell-gateway",
    name: "OpenShell (sandboxes de agentes)",
    category: "dev",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: false,
    icon: "Box",
    description:
      "Sandboxes para agentes con política de red y archivos. Licencia Apache-2.0. Es alfa (con cambios incompatibles) y envía telemetría por defecto: instálalo con OPENSHELL_TELEMETRY_ENABLED=false.",
    repo: "https://github.com/NVIDIA/OpenShell",
    docsUrl: "https://github.com/NVIDIA/OpenShell",
    configHint: "https://127.0.0.1:<puerto del gateway de OpenShell>",
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
  // ── 3.ª tanda de la Biblioteca (Ola 1020C) · autoalojables ──
  {
    id: "penpot-selfhost",
    name: "Penpot (auto-hospedado)",
    category: "custom",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "Server",
    description:
      "Diseño abierto en grupo y su MCP oficial para que los agentes lean y editen diseños. Licencia MPL-2.0; se aloja en tu servidor o en el de tu grupo. Salvaguarda: usa un token de acceso con los mínimos permisos y revísalo antes de dárselo a un agente.",
    repo: "https://github.com/penpot/penpot",
    docsUrl: "https://help.penpot.app",
    configHint: "http://<host>:9001",
  },
  {
    id: "pocketbase-local",
    name: "PocketBase (local)",
    category: "storage",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: false,
    icon: "Server",
    description:
      "Backend ligero en un solo binario (SQLite, tiempo real, usuarios y archivos), uno por persona, cerebro, neurona o grupo. Licencia MIT; corre en tu equipo. Salvaguarda: escucha solo en 127.0.0.1 salvo que lo expongas tú a propósito.",
    repo: "https://github.com/pocketbase/pocketbase",
    docsUrl: "https://pocketbase.io/docs",
    configHint: "http://127.0.0.1:8090",
  },
  {
    id: "openmaic-aulas",
    name: "OpenMAIC (aulas)",
    category: "custom",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: false,
    icon: "Server",
    description:
      "Aulas interactivas multiagente para los grupos de estudio. Licencia MIT; se aloja en tu servidor. Salvaguarda: una instancia por grupo de confianza, porque aún no aísla a unos usuarios de otros.",
    repo: "https://github.com/THU-MAIC/OpenMAIC",
    docsUrl: "https://github.com/THU-MAIC/OpenMAIC",
    configHint: "http://<host>:3000",
  },
  {
    id: "nextcloud-aio",
    name: "Nextcloud All-in-One",
    category: "storage",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "Server",
    description:
      "Archivos, calendario y contactos propios por WebDAV/OCS con el instalador oficial. Licencia AGPL-3.0; se aloja en tu servidor. Salvaguarda: conecta con una contraseña de aplicación revocable, nunca con la principal.",
    repo: "https://github.com/nextcloud/all-in-one",
    docsUrl: "https://docs.nextcloud.com",
    configHint: "https://<tu-dominio>/remote.php/dav",
  },
  {
    id: "chatwoot-buzon",
    name: "Chatwoot (buzón público)",
    category: "chat",
    kind: "oss",
    authType: "apiKey",
    status: "available",
    free: true,
    recommended: false,
    icon: "Server",
    description:
      "Buzón público de atención para páginas y comunidades. NO es mensajería entre miembros: esa es la mensajería propia del OS (malla P2P, cifrada). Licencia MIT salvo la carpeta enterprise/ (propietaria); se aloja en tu servidor. Salvaguarda: token de agente con permisos mínimos.",
    repo: "https://github.com/chatwoot/chatwoot",
    docsUrl: "https://developers.chatwoot.com",
    configHint: "http://<host>:3000/api/v1",
  },
  {
    id: "paperclip-oficina",
    name: "Paperclip (oficina de agentes)",
    category: "dev",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: false,
    icon: "Server",
    description:
      "Oficina de agentes con presupuestos; solapa en parte con Genesis. Licencia MIT; corre en tu equipo. Salvaguarda: arráncalo con PAPERCLIP_TELEMETRY_DISABLED=1 para no enviar telemetría y fija un tope de gasto por agente.",
    repo: "https://github.com/paperclipai/paperclip",
    docsUrl: "https://github.com/paperclipai/paperclip",
    configHint: "http://127.0.0.1:3100",
  },
  // ── 4.ª tanda de la Biblioteca (Ola 1020U) · autoalojados ──
  {
    id: "comfyui-selfhost",
    name: "ComfyUI (auto-hospedado)",
    category: "custom",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Wand2",
    description:
      "Motor de imagen por nodos para los flujos de Astraura, la Protomolécula, las publicaciones y los mensajes (1:1, 4:5, 9:16 y 16:9). Sin clave: la URL se lee de COMFYUI_URL. Un ComfyUI real exige el GRAFO del flujo en formato API, no un texto suelto; los nodos personalizados ejecutan código y no se instalan sin revisar.",
    repo: "https://github.com/Comfy-Org/ComfyUI",
    docsUrl: "https://github.com/Comfy-Org/ComfyUI",
    configHint: "COMFYUI_URL (por defecto http://127.0.0.1:8188)",
  },
  {
    id: "libretranslate-selfhost",
    name: "LibreTranslate (auto-hospedado)",
    category: "custom",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: true,
    icon: "Languages",
    description:
      "Traducción sin conexión con Argos Translate para todo el OS: selección, párrafo, página y autotraducción por perfil. Sin clave por defecto; si tu instancia la pide, va en LIBRETRANSLATE_API_KEY. Lo privado solo se traduce en el aparato, en tus neuronas o en tu servidor, nunca en un servicio ajeno.",
    repo: "https://github.com/LibreTranslate/LibreTranslate",
    docsUrl: "https://docs.libretranslate.com",
    configHint: "LIBRETRANSLATE_URL (por defecto http://127.0.0.1:5000)",
  },
  {
    id: "coolify-selfhost",
    name: "Coolify (auto-hospedado)",
    category: "dev",
    kind: "oss",
    authType: "apiKey",
    status: "needs-auth",
    free: true,
    recommended: false,
    icon: "Server",
    description:
      "Despliegue autoalojado de apps, bases y servicios en tus propios servidores y en las capas de conciencia. En SOLO LECTURA hasta verificar las rutas de despliegue: equipo y servidores. La URL va en COOLIFY_URL y el token Bearer en COOLIFY_API_TOKEN; nunca en el código ni en la ficha. El panel no se expone a internet.",
    repo: "https://github.com/coollabsio/coolify",
    docsUrl: "https://coolify.io/docs/api-reference",
    configHint: "COOLIFY_URL + token Bearer en COOLIFY_API_TOKEN",
  },
  {
    id: "openhands-agent-server",
    name: "OpenHands Agent Server",
    category: "dev",
    kind: "oss",
    authType: "localEndpoint",
    status: "needs-auth",
    free: true,
    recommended: false,
    icon: "Bot",
    description:
      "Agentes de desarrollo en un sandbox (Docker) con API REST/WebSocket. Esta ficha es el conector del Agent Server, pero el cliente sigue PENDIENTE de verificar su API: no se promete ejecución desde el OS ni escritura en el enjambre. Docker obligatorio y red limitada a la lista de dominios del agente.",
    repo: "https://github.com/OpenHands/OpenHands",
    docsUrl: "https://docs.all-hands.dev",
    configHint: "URL del Agent Server (el A1 lo sirve en el puerto 8010; cliente pendiente)",
  },
  {
    id: "archivebox-selfhost",
    name: "ArchiveBox (auto-hospedado)",
    category: "memory",
    kind: "oss",
    authType: "localEndpoint",
    status: "available",
    free: true,
    recommended: false,
    icon: "Archive",
    description:
      "Memoria de lo que enlazan la Biblioteca, la Librería, las publicaciones y los cerebros: guarda HTML, SingleFile, PDF, captura y WARC para que nada se pierda si el enlace muere. El envío a archive.org va APAGADO (SAVE_ARCHIVE_DOT_ORG=False). No es el Finder ni archiva con sesiones de nadie.",
    repo: "https://github.com/ArchiveBox/ArchiveBox",
    docsUrl: "https://docs.archivebox.io",
    configHint: "URL de tu instancia (envío a archive.org apagado)",
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
