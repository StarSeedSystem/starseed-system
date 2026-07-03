"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — REGISTRO UNIFICADO DE SERVICIOS OPEN-SOURCE (catálogo tipado)
// ----------------------------------------------------------------------------
// Catálogo SOBERANO de servicios de código abierto que StarSeed OS trae
// "preintegrados por defecto": SIEMPRE están registrados (aparecen en el panel,
// con su propósito, repo y pistas de auto-hospedaje) aunque el usuario todavía
// no haya puesto un endpoint. Realista: una web NO instala servidores; los
// CONECTA por endpoint/clave/webhook. Aquí describimos QUÉ es cada servicio y
// QUÉ pide para conectarse; las CONEXIONES concretas (con endpoint/clave del
// usuario, por cerebro/contexto) viven en `oss-connections.ts`.
//
// Enrutado por función: cada servicio declara una `category` (llm/stt/tts/
// image/video/workflow/calendar/docs/design/website). Las tools de generación
// resolverán "qué servicio usar para esta función" con `resolveServiceFor()`.
//
// Este archivo NO duplica la capa tri-fuente (`service-routes.ts`) ni el
// catálogo OSS general (`oss-library.ts`): la COMPLEMENTA con un registro
// concreto y accionable de servicios conectables por endpoint.
// ════════════════════════════════════════════════════════════════════════════

/** Funciones que el registro sabe enrutar (una por "category"). */
export type OssServiceCategory =
  | "llm" // Modelos de lenguaje / chat
  | "stt" // Voz → texto (speech-to-text)
  | "tts" // Texto → voz (text-to-speech)
  | "image" // Generación / edición de imagen
  | "video" // Generación / edición de vídeo
  | "workflow" // Automatización / workflows
  | "calendar" // Calendarios / agenda
  | "docs" // Documentos / notas
  | "design" // Diseño / lienzos vectoriales
  | "website"; // Generación de sitios web

/**
 * Cómo se conecta un servicio:
 *  • http-endpoint → una URL base a la que llamamos (p.ej. Ollama, whisper.cpp).
 *  • api-key       → endpoint + clave de API (p.ej. Cal.com, n8n con API key).
 *  • webhook       → se dispara vía una URL de webhook (p.ej. n8n /webhook/…).
 *  • app-embed     → se integra embebiendo/enlazando una instancia (Penpot, AppFlowy).
 *  • browser-local → corre EN EL NAVEGADOR, sin servidor (Whisper WASM, Piper WASM).
 */
export type OssConnectionKind =
  | "http-endpoint"
  | "api-key"
  | "webhook"
  | "app-embed"
  | "browser-local";

/** Tipo de dato que pide un campo de conexión. */
export type OssFieldType = "url" | "apikey" | "webhook" | "text";

/** Un campo que el usuario rellena para conectar el servicio. */
export interface OssServiceField {
  /** Clave estable con la que se guarda el valor en la conexión. */
  key: "baseUrl" | "apiKey" | "webhook" | "path" | "instanceUrl" | string;
  /** Etiqueta legible (es). */
  label: string;
  /** Tipo (controla el input y si es secreto). */
  type: OssFieldType;
  /** Placeholder de ejemplo. */
  placeholder?: string;
  /** ¿Es imprescindible para que la conexión funcione? */
  required?: boolean;
  /** Ayuda corta (es). */
  hint?: string;
  /** true si el valor es sensible (clave/secreto) → guardar con cuidado. */
  secret?: boolean;
}

/** Un endpoint típico documentado del servicio (para la ayuda / testeo). */
export interface OssServiceEndpointHint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  purpose: string;
}

/** Definición de un servicio del catálogo unificado. */
export interface OssService {
  /** Id estable (kebab-case). */
  id: string;
  /** Nombre visible del proyecto. */
  name: string;
  /** Función que cubre (enrutado). */
  category: OssServiceCategory;
  /** Propósito en español, claro y honesto. */
  purpose: string;
  /** Repositorio de código abierto. */
  repoUrl: string;
  /** Documentación (puede coincidir con el repo si no hay web dedicada). */
  docsUrl: string;
  /** Endpoint sugerido por defecto (vacío si es browser-local / requiere instancia). */
  defaultEndpoint: string;
  /** Cómo se conecta. */
  connectionKind: OssConnectionKind;
  /** Qué pedir al usuario para conectar (baseUrl / apiKey / webhook…). */
  fields: OssServiceField[];
  /** Endpoints REST típicos documentados (ayuda + pruebas). */
  endpoints?: OssServiceEndpointHint[];
  /** Pista honesta de auto-hospedaje (es): cómo levantarlo uno mismo. */
  selfHostHint: string;
  /** Preintegrado por defecto: el servicio SIEMPRE está registrado. */
  enabledByDefault: boolean;
  /**
   * Para servicios `browser-local`: NO necesita endpoint para funcionar (el
   * navegador es el "servidor"). Marca el panel para no exigir baseUrl.
   */
  runsInBrowser?: boolean;
  /** Ruta de prueba ligera para `testConnection` (GET). Ausente = no testeable. */
  testPath?: string;
  /** Etiquetas de ayuda. */
  tags?: string[];
}

// ── Metadatos de presentación por categoría (para agrupar en el panel) ────────

export const OSS_SERVICE_CATEGORY_META: Record<
  OssServiceCategory,
  { label: string; blurb: string }
> = {
  llm: {
    label: "Modelos de lenguaje",
    blurb: "El motor que razona y conversa (chat, texto).",
  },
  stt: {
    label: "Voz → texto",
    blurb: "Transcribe audio y dictado a texto (speech-to-text).",
  },
  tts: {
    label: "Texto → voz",
    blurb: "Sintetiza voz a partir de texto (text-to-speech).",
  },
  image: {
    label: "Imagen",
    blurb: "Genera y edita imágenes.",
  },
  video: {
    label: "Vídeo",
    blurb: "Genera y edita vídeo.",
  },
  workflow: {
    label: "Automatización",
    blurb: "Orquesta workflows y conecta acciones (webhooks, integraciones).",
  },
  calendar: {
    label: "Calendarios",
    blurb: "Agenda, reservas y eventos.",
  },
  docs: {
    label: "Documentos y notas",
    blurb: "Escribe, organiza y colabora en documentos.",
  },
  design: {
    label: "Diseño",
    blurb: "Lienzos vectoriales, prototipos y sistemas de diseño.",
  },
  website: {
    label: "Sitios web",
    blurb: "Genera y publica páginas y sitios.",
  },
};

/** Orden estable de categorías para el panel. */
export const OSS_SERVICE_CATEGORY_ORDER: OssServiceCategory[] = [
  "llm",
  "stt",
  "tts",
  "image",
  "video",
  "workflow",
  "calendar",
  "docs",
  "design",
  "website",
];

// ── Campos reutilizables ──────────────────────────────────────────────────────

const F_BASE_URL = (placeholder: string, hint?: string): OssServiceField => ({
  key: "baseUrl",
  label: "URL base (endpoint)",
  type: "url",
  placeholder,
  required: true,
  hint,
});

const F_API_KEY = (hint?: string): OssServiceField => ({
  key: "apiKey",
  label: "Clave de API",
  type: "apikey",
  placeholder: "p.ej. sk-… (se guarda como referencia)",
  required: true,
  secret: true,
  hint:
    hint ??
    "Se guarda como valor de conexión del usuario; no se comparte con la red.",
});

const F_WEBHOOK = (placeholder: string): OssServiceField => ({
  key: "webhook",
  label: "URL de webhook",
  type: "webhook",
  placeholder,
  required: true,
  hint: "La URL que dispara el flujo (production o test).",
});

const F_INSTANCE = (placeholder: string): OssServiceField => ({
  key: "instanceUrl",
  label: "URL de la instancia",
  type: "url",
  placeholder,
  required: true,
  hint: "La dirección de tu instancia auto-hospedada o en la nube.",
});

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO — OSS_SERVICES
// ════════════════════════════════════════════════════════════════════════════

export const OSS_SERVICES: OssService[] = [
  // ── LLM ─────────────────────────────────────────────────────────────────
  {
    id: "ollama",
    name: "Ollama",
    category: "llm",
    purpose:
      "Ejecuta modelos de lenguaje abiertos en tu propio equipo con un solo comando. API compatible OpenAI; cero datos a terceros.",
    repoUrl: "https://github.com/ollama/ollama",
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    defaultEndpoint: "http://localhost:11434",
    connectionKind: "http-endpoint",
    fields: [
      F_BASE_URL(
        "http://localhost:11434",
        "El servidor local de Ollama. Cámbialo si corre en otra máquina.",
      ),
    ],
    endpoints: [
      { method: "GET", path: "/api/tags", purpose: "Listar modelos instalados." },
      { method: "POST", path: "/api/chat", purpose: "Chat/generación con un modelo." },
    ],
    selfHostHint:
      "Instala Ollama desde ollama.com y ejecútalo; escucha en http://localhost:11434. `ollama pull llama3.1` para descargar un modelo.",
    enabledByDefault: true,
    testPath: "/api/tags",
    tags: ["local", "openai-compat", "privacidad"],
  },

  // ── STT (Voz → texto) ─────────────────────────────────────────────────────
  {
    id: "whisper-browser",
    name: "Whisper (navegador)",
    category: "stt",
    purpose:
      "Transcribe voz a texto directamente en tu navegador con Transformers.js (modelos Whisper). No sale audio de tu dispositivo.",
    repoUrl: "https://github.com/huggingface/transformers.js",
    docsUrl: "https://huggingface.co/docs/transformers.js",
    defaultEndpoint: "",
    connectionKind: "browser-local",
    fields: [],
    selfHostHint:
      "No requiere servidor: el modelo se descarga y ejecuta en el navegador (WebGPU/WASM). Ideal para privacidad total.",
    enabledByDefault: true,
    runsInBrowser: true,
    tags: ["navegador", "wasm", "privacidad"],
  },
  {
    id: "whisper-cpp",
    name: "whisper.cpp (servidor)",
    category: "stt",
    purpose:
      "Servidor de transcripción Whisper en C/C++ para audio de mayor duración o mejor rendimiento. Lo conectas por su endpoint HTTP.",
    repoUrl: "https://github.com/ggml-org/whisper.cpp",
    docsUrl:
      "https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/README.md",
    defaultEndpoint: "http://localhost:8080",
    connectionKind: "http-endpoint",
    fields: [
      F_BASE_URL(
        "http://localhost:8080",
        "El binario `whisper-server` de whisper.cpp.",
      ),
    ],
    endpoints: [
      { method: "POST", path: "/inference", purpose: "Transcribir un archivo de audio." },
    ],
    selfHostHint:
      "Compila whisper.cpp y lanza `whisper-server -m models/ggml-base.bin`. Escucha por defecto en el puerto 8080.",
    enabledByDefault: true,
    tags: ["servidor", "cpp"],
  },

  // ── TTS (Texto → voz) ──────────────────────────────────────────────────────
  {
    id: "piper",
    name: "Piper",
    category: "tts",
    purpose:
      "Síntesis de voz neuronal, rápida y ligera, ideal para local/edge. Puede correr como servidor HTTP o embebido en el navegador (WASM).",
    repoUrl: "https://github.com/rhasspy/piper",
    docsUrl: "https://github.com/rhasspy/piper#readme",
    defaultEndpoint: "http://localhost:59125",
    connectionKind: "http-endpoint",
    fields: [
      F_BASE_URL(
        "http://localhost:59125",
        "Servidor HTTP de Piper (o déjalo vacío si usas Piper en el navegador).",
      ),
    ],
    selfHostHint:
      "Descarga una voz de Piper y lánzalo como servicio HTTP, o usa la variante WASM en el navegador. Voces por idioma en el repo.",
    enabledByDefault: true,
    tags: ["local", "edge", "voz"],
  },
  {
    id: "kokoro",
    name: "Kokoro TTS",
    category: "tts",
    purpose:
      "Modelo de texto-a-voz abierto y de alta calidad. Corre en el navegador (kokoro.js) o como servidor HTTP.",
    repoUrl: "https://github.com/hexgrad/kokoro",
    docsUrl: "https://github.com/hexgrad/kokoro#readme",
    defaultEndpoint: "",
    connectionKind: "browser-local",
    fields: [
      {
        key: "baseUrl",
        label: "URL base (opcional)",
        type: "url",
        placeholder: "http://localhost:8880",
        hint: "Déjalo vacío para usar Kokoro en el navegador, o pon tu servidor HTTP.",
      },
    ],
    selfHostHint:
      "Usa kokoro.js para ejecutarlo en el navegador (WebGPU/WASM), o levanta un servidor compatible (p.ej. Kokoro-FastAPI) y conéctalo por URL.",
    enabledByDefault: true,
    runsInBrowser: true,
    tags: ["navegador", "servidor", "voz"],
  },

  // ── Imagen ─────────────────────────────────────────────────────────────────
  {
    id: "fooocus-api",
    name: "Fooocus-API",
    category: "image",
    purpose:
      "API FastAPI sobre Fooocus para generar imágenes de alta calidad (Stable Diffusion XL) con parámetros sencillos.",
    repoUrl: "https://github.com/mrhan1993/Fooocus-API",
    docsUrl: "https://github.com/mrhan1993/Fooocus-API#readme",
    defaultEndpoint: "http://localhost:8888",
    connectionKind: "http-endpoint",
    fields: [
      F_BASE_URL(
        "http://localhost:8888",
        "El servidor FastAPI de Fooocus-API.",
      ),
    ],
    endpoints: [
      {
        method: "POST",
        path: "/v1/generation/text-to-image",
        purpose: "Generar imagen a partir de un prompt.",
      },
      { method: "GET", path: "/docs", purpose: "Swagger de la API." },
    ],
    selfHostHint:
      "Clona Fooocus-API y ejecútalo (necesita GPU para ir fluido). Expone la API en el puerto 8888 por defecto.",
    enabledByDefault: true,
    testPath: "/docs",
    tags: ["fastapi", "sdxl"],
  },
  {
    id: "automatic1111",
    name: "Stable Diffusion (AUTOMATIC1111)",
    category: "image",
    purpose:
      "WebUI de referencia para Stable Diffusion con una API HTTP muy completa (txt2img, img2img, extensiones).",
    repoUrl: "https://github.com/AUTOMATIC1111/stable-diffusion-webui",
    docsUrl:
      "https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API",
    defaultEndpoint: "http://localhost:7860",
    connectionKind: "http-endpoint",
    fields: [
      F_BASE_URL(
        "http://localhost:7860",
        "Lanza la WebUI con `--api` para exponer los endpoints.",
      ),
    ],
    endpoints: [
      { method: "POST", path: "/sdapi/v1/txt2img", purpose: "Generar imagen desde texto." },
      { method: "GET", path: "/sdapi/v1/sd-models", purpose: "Listar modelos." },
    ],
    selfHostHint:
      "Instala la WebUI de AUTOMATIC1111 y arráncala con el flag `--api`. Necesita GPU para rendir bien.",
    enabledByDefault: true,
    testPath: "/sdapi/v1/sd-models",
    tags: ["opcional", "webui", "sd"],
  },

  // ── Workflows / automatización ─────────────────────────────────────────────
  {
    id: "n8n",
    name: "n8n",
    category: "workflow",
    purpose:
      "Automatización de workflows con 400+ integraciones y nodos de IA. Se dispara por webhook y se gobierna por su API con clave.",
    repoUrl: "https://github.com/n8n-io/n8n",
    docsUrl: "https://docs.n8n.io/api/",
    defaultEndpoint: "http://localhost:5678",
    connectionKind: "webhook",
    fields: [
      F_INSTANCE("http://localhost:5678"),
      F_WEBHOOK("http://localhost:5678/webhook/mi-flujo"),
      {
        key: "apiKey",
        label: "Clave de API (opcional)",
        type: "apikey",
        placeholder: "n8n_api_…",
        secret: true,
        hint: "Necesaria sólo para gestionar workflows vía la API REST de n8n.",
      },
    ],
    endpoints: [
      { method: "POST", path: "/webhook/<path>", purpose: "Disparar un workflow (producción)." },
      { method: "GET", path: "/api/v1/workflows", purpose: "Listar workflows (requiere API key)." },
    ],
    selfHostHint:
      "`docker run -it --rm -p 5678:5678 docker.n8n.io/n8nio/n8n`. Crea un workflow con un nodo Webhook y copia su URL aquí.",
    enabledByDefault: true,
    tags: ["webhook", "integraciones", "self-host"],
  },

  // ── Calendarios ────────────────────────────────────────────────────────────
  {
    id: "calcom",
    name: "Cal.com",
    category: "calendar",
    purpose:
      "Plataforma de agendamiento open source (alternativa a Calendly). Reservas, disponibilidad y eventos vía API v2 con clave.",
    repoUrl: "https://github.com/calcom/cal.com",
    docsUrl: "https://cal.com/docs/api-reference/v2/introduction",
    defaultEndpoint: "https://api.cal.com/v2",
    connectionKind: "api-key",
    fields: [
      F_BASE_URL(
        "https://api.cal.com/v2",
        "La API v2 de Cal.com (nube) o tu instancia auto-hospedada.",
      ),
      F_API_KEY("Genera una API key en Settings → Developer → API Keys."),
    ],
    endpoints: [
      { method: "GET", path: "/bookings", purpose: "Listar reservas." },
      { method: "POST", path: "/bookings", purpose: "Crear una reserva." },
    ],
    selfHostHint:
      "Puedes usar la nube de Cal.com o auto-hospedar el repo (Next.js + Postgres). En ambos casos generas una API key.",
    enabledByDefault: true,
    tags: ["reservas", "api-v2"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    purpose:
      "Calendario de Google vía su API. No es open source, pero es un endpoint estándar muy usado; se conecta con OAuth/clave.",
    repoUrl: "https://github.com/googleapis/google-api-nodejs-client",
    docsUrl: "https://developers.google.com/calendar/api",
    defaultEndpoint: "https://www.googleapis.com/calendar/v3",
    connectionKind: "api-key",
    fields: [
      F_BASE_URL("https://www.googleapis.com/calendar/v3"),
      F_API_KEY("Token OAuth / clave de la API de Google Calendar."),
    ],
    endpoints: [
      { method: "GET", path: "/calendars/primary/events", purpose: "Listar eventos." },
    ],
    selfHostHint:
      "No se auto-hospeda: creas credenciales en Google Cloud Console y autorizas el acceso al calendario.",
    enabledByDefault: true,
    tags: ["google", "externo"],
  },
  {
    id: "caldav-ics",
    name: "CalDAV / ICS (genérico)",
    category: "calendar",
    purpose:
      "Cualquier calendario estándar: un servidor CalDAV (Radicale, Baïkal, Nextcloud) o una URL ICS de sólo lectura.",
    repoUrl: "https://github.com/Kozea/Radicale",
    docsUrl: "https://radicale.org/",
    defaultEndpoint: "",
    connectionKind: "http-endpoint",
    fields: [
      F_BASE_URL(
        "https://mi-servidor/dav.php/calendars/yo/personal/",
        "URL CalDAV o enlace ICS (.ics).",
      ),
      {
        key: "apiKey",
        label: "Credencial (opcional)",
        type: "apikey",
        placeholder: "usuario:contraseña o token",
        secret: true,
        hint: "Sólo si el calendario requiere autenticación.",
      },
    ],
    selfHostHint:
      "Levanta Radicale o Baïkal para un servidor CalDAV propio, o exporta una URL ICS desde cualquier calendario.",
    enabledByDefault: true,
    tags: ["caldav", "ics", "estándar"],
  },

  // ── Documentos / notas ─────────────────────────────────────────────────────
  {
    id: "appflowy",
    name: "AppFlowy",
    category: "docs",
    purpose:
      "Espacio de trabajo abierto (alternativa a Notion): documentos, notas, bases y tableros. Se integra embebiendo tu instancia.",
    repoUrl: "https://github.com/AppFlowy-IO/AppFlowy",
    docsUrl: "https://docs.appflowy.io/",
    defaultEndpoint: "",
    connectionKind: "app-embed",
    fields: [
      F_INSTANCE("https://mi-appflowy.ejemplo"),
    ],
    selfHostHint:
      "Auto-hospeda AppFlowy Cloud (Docker Compose) o usa la app de escritorio local; enlaza aquí la URL de tu instancia.",
    enabledByDefault: true,
    tags: ["notas", "workspace", "embed"],
  },

  // ── Diseño ─────────────────────────────────────────────────────────────────
  {
    id: "penpot",
    name: "Penpot",
    category: "design",
    purpose:
      "Herramienta de diseño y prototipado open source (alternativa a Figma), basada en estándares web (SVG). Guarda tus diseños en tu instancia.",
    repoUrl: "https://github.com/penpot/penpot",
    docsUrl: "https://help.penpot.app/",
    defaultEndpoint: "https://design.penpot.app",
    connectionKind: "app-embed",
    fields: [
      F_INSTANCE("https://design.penpot.app"),
      {
        key: "apiKey",
        label: "Token de acceso (opcional)",
        type: "apikey",
        placeholder: "token de acceso de Penpot",
        secret: true,
        hint: "Para guardar/leer diseños vía API; opcional si sólo embebes.",
      },
    ],
    selfHostHint:
      "Usa la nube de Penpot o auto-hospéjalo con Docker Compose. Embebe tus archivos o conéctate con un token de acceso.",
    enabledByDefault: true,
    tags: ["diseño", "svg", "embed"],
  },

  // ── Sitios web ─────────────────────────────────────────────────────────────
  {
    id: "starseed-sites",
    name: "Generador de sitios StarSeed",
    category: "website",
    purpose:
      "Genera y publica páginas/sitios a partir de plantillas. Servicio propio de StarSeed o un endpoint compatible que tú definas.",
    repoUrl: "https://github.com/StarSeedSystem/starseed-system",
    docsUrl: "https://starseed-os.vercel.app",
    defaultEndpoint: "",
    connectionKind: "http-endpoint",
    fields: [
      {
        key: "baseUrl",
        label: "URL del generador (opcional)",
        type: "url",
        placeholder: "https://sites.miservidor.ejemplo/api",
        hint: "Déjalo vacío para usar el generador integrado de StarSeed, o apunta a tu propio servicio.",
      },
      {
        key: "apiKey",
        label: "Clave (opcional)",
        type: "apikey",
        placeholder: "clave del servicio de publicación",
        secret: true,
      },
    ],
    selfHostHint:
      "Puedes usar el generador integrado de StarSeed, o auto-hospedar un servicio de plantillas y apuntar aquí su endpoint.",
    enabledByDefault: true,
    tags: ["sitios", "plantillas", "propio"],
  },

  // ── NVIDIA NIM — API-catalog (compatible con OpenAI, gratis para dev) ───────
  // No se auto-hospeda: se CONECTA por clave (Bearer). La clave es GRATIS para
  // prototipar con el NVIDIA Developer Program (build.nvidia.com). Ver el panel
  // dedicado <NvidiaNimPanel /> para catálogo de modelos/skills y guías.
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM (modelos de lenguaje)",
    category: "llm",
    purpose:
      "Catálogo de modelos de IA de NVIDIA (Llama, Nemotron, Mixtral, DeepSeek…) vía una API compatible con OpenAI. Incluye modelos de código y embeddings. Se conecta con una clave gratis del NVIDIA Developer Program.",
    repoUrl: "https://build.nvidia.com/models",
    docsUrl: "https://docs.api.nvidia.com/nim/reference/llm-apis",
    defaultEndpoint: "https://integrate.api.nvidia.com/v1",
    connectionKind: "api-key",
    fields: [
      F_BASE_URL(
        "https://integrate.api.nvidia.com/v1",
        "La API-catalog de NVIDIA (compatible con OpenAI). Cámbiala sólo si usas un NIM auto-hospedado.",
      ),
      F_API_KEY(
        "Consigue una clave GRATIS en build.nvidia.com (NVIDIA Developer Program). Se guarda como tu credencial; no se comparte.",
      ),
    ],
    endpoints: [
      { method: "GET", path: "/models", purpose: "Listar los modelos disponibles en tu cuenta." },
      { method: "POST", path: "/chat/completions", purpose: "Chat/generación al estilo OpenAI." },
    ],
    selfHostHint:
      "No se instala: es una API en la nube de NVIDIA. La clave es GRATIS para prototipar con el Developer Program (build.nvidia.com). Para producción/on-prem existen los contenedores NIM auto-hospedables.",
    enabledByDefault: true,
    testPath: "/models",
    tags: ["nvidia", "nim", "openai-compat", "gratis-dev", "código", "embeddings"],
  },
  {
    id: "nvidia-nim-vision",
    name: "NVIDIA NIM (visión e imagen)",
    category: "image",
    purpose:
      "Modelos multimodales y de imagen de NVIDIA (Llama Vision, NeVA, Stable Diffusion, FLUX…) para entender y generar imágenes. API compatible con OpenAI; clave gratis del Developer Program.",
    repoUrl: "https://build.nvidia.com/models",
    docsUrl: "https://docs.api.nvidia.com/nim/reference/vision-language-models",
    defaultEndpoint: "https://integrate.api.nvidia.com/v1",
    connectionKind: "api-key",
    fields: [
      F_BASE_URL(
        "https://integrate.api.nvidia.com/v1",
        "La misma API-catalog de NVIDIA; el modelo de visión/imagen se elige por id.",
      ),
      F_API_KEY(
        "Clave GRATIS del NVIDIA Developer Program (build.nvidia.com). La misma clave sirve para todos los modelos NIM.",
      ),
    ],
    endpoints: [
      { method: "GET", path: "/models", purpose: "Listar modelos (visión/imagen incluidos)." },
      { method: "POST", path: "/chat/completions", purpose: "Consulta multimodal (imagen + texto)." },
    ],
    selfHostHint:
      "No se instala: API en la nube de NVIDIA con clave gratis para dev. Los modelos de imagen/visión comparten la misma clave que los LLM.",
    enabledByDefault: true,
    testPath: "/models",
    tags: ["nvidia", "nim", "visión", "imagen", "multimodal", "gratis-dev"],
  },
  {
    id: "nvidia-riva-asr",
    name: "NVIDIA Riva (voz → texto)",
    category: "stt",
    purpose:
      "Reconocimiento de voz de NVIDIA Riva (Parakeet, Canary) para transcribir audio a texto, también multilingüe. Se conecta por la API-catalog con clave gratis del Developer Program.",
    repoUrl: "https://build.nvidia.com/explore/speech",
    docsUrl: "https://docs.nvidia.com/deeplearning/riva/user-guide/docs/asr/asr-overview.html",
    defaultEndpoint: "https://integrate.api.nvidia.com/v1",
    connectionKind: "api-key",
    fields: [
      F_BASE_URL(
        "https://integrate.api.nvidia.com/v1",
        "API-catalog de NVIDIA para los modelos de voz (Riva).",
      ),
      F_API_KEY(
        "Clave GRATIS del NVIDIA Developer Program (build.nvidia.com).",
      ),
    ],
    selfHostHint:
      "No se instala: servicio de voz en la nube de NVIDIA (Riva) con clave gratis para dev. Riva también se puede desplegar on-prem con contenedores NIM.",
    enabledByDefault: true,
    testPath: "/models",
    tags: ["nvidia", "riva", "asr", "voz→texto", "gratis-dev"],
  },
  {
    id: "nvidia-riva-tts",
    name: "NVIDIA Riva (texto → voz)",
    category: "tts",
    purpose:
      "Síntesis de voz de NVIDIA Riva (FastPitch/HiFi-GAN, Magpie) para generar voz natural, incluso multilingüe. Se conecta por la API-catalog con clave gratis del Developer Program.",
    repoUrl: "https://build.nvidia.com/explore/speech",
    docsUrl: "https://docs.nvidia.com/deeplearning/riva/user-guide/docs/tts/tts-overview.html",
    defaultEndpoint: "https://integrate.api.nvidia.com/v1",
    connectionKind: "api-key",
    fields: [
      F_BASE_URL(
        "https://integrate.api.nvidia.com/v1",
        "API-catalog de NVIDIA para los modelos de voz (Riva).",
      ),
      F_API_KEY(
        "Clave GRATIS del NVIDIA Developer Program (build.nvidia.com). La misma clave sirve para ASR y TTS.",
      ),
    ],
    selfHostHint:
      "No se instala: servicio de voz en la nube de NVIDIA (Riva) con clave gratis para dev. Desplegable on-prem con contenedores NIM si lo necesitas.",
    enabledByDefault: true,
    testPath: "/models",
    tags: ["nvidia", "riva", "tts", "texto→voz", "gratis-dev"],
  },
];

// ── Helpers de lectura del catálogo ───────────────────────────────────────────

/** Devuelve todos los servicios del catálogo (referencia estable). */
export function getOssServices(): OssService[] {
  return OSS_SERVICES;
}

/** Servicios de una categoría/función concreta. */
export function getOssServicesByCategory(
  category: OssServiceCategory,
): OssService[] {
  return OSS_SERVICES.filter((s) => s.category === category);
}

/** Resuelve un servicio por id, o undefined. */
export function findOssService(id: string): OssService | undefined {
  return OSS_SERVICES.find((s) => s.id === id);
}

/** ¿Es un id de servicio conocido del catálogo? */
export function isKnownOssService(id: string): boolean {
  return OSS_SERVICES.some((s) => s.id === id);
}

/** Mapa id → servicio (para lookups repetidos). */
export function ossServicesById(): Record<string, OssService> {
  const map: Record<string, OssService> = {};
  for (const s of OSS_SERVICES) map[s.id] = s;
  return map;
}
