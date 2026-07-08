// ════════════════════════════════════════════════════════════════
// Integraciones · Registro — catálogo de conectores funcionales
// ----------------------------------------------------------------
// Una entrada por herramienta del catálogo OSS que el OS puede INVOCAR
// de verdad (no solo listar). Cada descriptor declara sus acciones, su
// endpoint por defecto (self-host local típico) y si necesita clave.
//
// La UI de configuración (otra superficie) importa de aquí:
//   • INTEGRATIONS              — lista de descriptores.
//   • getIntegration(id)        — busca uno.
//   • integrationConfigKey()    — clave de almacenamiento (global o por cerebro).
//   • loadIntegrationConfig()   — lee config de localStorage (SSR-safe).
//   • saveIntegrationConfig()   — persiste config (SSR-safe).
//
// `ossId` enlaza con el id de oss-library cuando aplica, para que el
// catálogo y la configuración compartan la misma fuente de verdad.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationDescriptor } from "./types";

// ── Extensión aditiva del descriptor (retrocompatible) ────────────
// Añadimos metadatos de hospedaje GRATIS sin tocar el tipo base:
// cualquier consumidor que use `IntegrationDescriptor` sigue funcionando
// (los campos nuevos son opcionales). La UI de configuración puede leer
// `freeHostingHint` para sugerir dónde desplegar la herramienta gratis y
// `onByDefault` para saber cuáles son seguras de activar para todo el mundo.
export interface IntegrationDescriptorExt extends IntegrationDescriptor {
  /**
   * Pista (ES) de la MEJOR opción de hospedaje GRATUITO para esta
   * herramienta cuando NO hay un endpoint público fiable. Informativo:
   * no cambia el comportamiento del runner. Ver docs/HOSTING_INTEGRACIONES.md.
   */
  freeHostingHint?: string;
  /**
   * `true` solo si la herramienta es GENUINAMENTE segura de activar por
   * defecto para cada usuario (endpoint público fiable y de uso público).
   * Hoy ninguna lo es sin que StarSeed hospede una instancia oficial:
   * queda ausente/false hasta que exista ese endpoint. Defensivo: la UI
   * debe tratar `undefined` como `false`.
   */
  onByDefault?: boolean;
}

// ── Catálogo de integraciones ────────────────────────────────────
export const INTEGRATIONS: IntegrationDescriptorExt[] = [
  // ── Ingesta de datos ──────────────────────────────────────────
  {
    id: "crawl4ai",
    ossId: "crawl4ai",
    label: "Crawl4AI",
    category: "data-ingest",
    capabilities: ["Rastrear webs", "Extraer Markdown para RAG", "Scraping LLM-friendly"],
    defaultEndpoint: "http://localhost:11235",
    needsKey: false,
    docsUrl: "https://docs.crawl4ai.com/core/docker-deployment/",
    // Sin instancia pública fiable. GRATIS: Hugging Face Spaces (SDK Docker,
    // imagen `unclecode/crawl4ai`, 16GB RAM/2 vCPU, puerto 11235; se duerme a
    // las 48h de inactividad) o VM Always Free de Oracle Cloud (Docker 24/7).
    freeHostingHint:
      "Self-host GRATIS en Hugging Face Spaces (Docker, imagen unclecode/crawl4ai, expón el puerto 11235) o en una VM Always Free de Oracle Cloud (24/7). No hay instancia pública fiable; StarSeed debería hospedar una oficial y ponerla como default.",
    actions: [
      { id: "crawl", label: "Rastrear URL", description: "Rastrea una o varias URLs y devuelve su contenido en Markdown." },
    ],
  },
  {
    id: "firecrawl",
    ossId: "firecrawl",
    label: "Firecrawl",
    category: "data-ingest",
    capabilities: ["Scraping a Markdown", "Rastreo de sitios", "Datos estructurados"],
    defaultEndpoint: "http://localhost:3002",
    needsKey: true,
    // Existe SaaS oficial (api.firecrawl.dev) con free tier limitado (créditos
    // one-shot + límites por minuto y clave obligatoria): NO se pone como default
    // por ser de pago/rate-limited. GRATIS ilimitado: self-host en VM Always Free
    // de Oracle Cloud (Docker Compose; necesita Redis + navegador headless).
    freeHostingHint:
      "SaaS oficial en https://api.firecrawl.dev con free tier limitado (créditos y clave obligatoria) — no apto como default. Para uso libre: self-host con Docker Compose en una VM Always Free de Oracle Cloud (requiere Redis y navegador headless).",
    docsUrl: "https://docs.firecrawl.dev/",
    actions: [
      { id: "scrape", label: "Extraer página", description: "Extrae una página web como Markdown y metadatos." },
      { id: "crawl", label: "Rastrear sitio", description: "Rastrea un sitio completo desde una URL raíz (asíncrono)." },
    ],
  },

  // ── Apps y plataformas IA ─────────────────────────────────────
  {
    id: "dify",
    ossId: "dify",
    label: "Dify",
    category: "app-platform",
    capabilities: ["Apps de chat/agente", "Workflows LLM", "RAG"],
    defaultEndpoint: "http://localhost/v1",
    needsKey: true,
    // Dify Cloud (api.dify.ai) tiene plan Sandbox gratis pero con 200 créditos
    // one-shot y clave POR APP: no sirve como default para todos. GRATIS estable:
    // self-host con Docker Compose en VM Always Free de Oracle Cloud (≥24GB RAM va sobrado).
    freeHostingHint:
      "Dify Cloud (https://cloud.dify.ai) ofrece plan Sandbox gratis pero con créditos one-shot y clave por app — no apto como default. Para uso libre: self-host con Docker Compose (repo langgenius/dify) en una VM Always Free de Oracle Cloud.",
    docsUrl: "https://docs.dify.ai/en/use-dify/publish/developing-with-apis",
    actions: [
      { id: "chat", label: "Chat con app", description: "Envía un mensaje a una app de chat/agente de Dify (clave por app)." },
      { id: "run-workflow", label: "Ejecutar workflow", description: "Ejecuta un workflow de Dify con variables de entrada." },
    ],
  },
  {
    id: "langflow",
    ossId: "langflow",
    label: "Langflow",
    category: "app-platform",
    capabilities: ["Ejecutar flujos visuales", "Agentes low-code"],
    defaultEndpoint: "http://localhost:7860",
    needsKey: false,
    // Sin instancia pública multi-tenant. GRATIS: "Duplicate Space" del Space
    // oficial Langflow/Langflow en Hugging Face (Docker, puerto 7860; duerme a
    // las 48h) o VM Always Free de Oracle Cloud para tenerlo 24/7 con persistencia.
    freeHostingHint:
      "Self-host GRATIS duplicando el Space oficial (huggingface.co/spaces/Langflow/Langflow, expón el puerto 7860) o en una VM Always Free de Oracle Cloud (24/7 con persistencia). No hay instancia pública compartible.",
    docsUrl: "https://docs.langflow.org/api-flows-run",
    actions: [
      { id: "run-flow", label: "Ejecutar flujo", description: "Ejecuta un flujo de Langflow por su flowId con un valor de entrada." },
    ],
  },
  {
    id: "flowise",
    ossId: "flowise",
    label: "Flowise",
    category: "app-platform",
    capabilities: ["Predicción de chatflow", "Agentes visuales"],
    defaultEndpoint: "http://localhost:3000",
    needsKey: false,
    // Depende de tus flows/claves LLM: no tiene sentido un endpoint público.
    // GRATIS: Hugging Face Spaces (Docker) para pruebas o VM Always Free de
    // Oracle Cloud para 24/7. Protégelo con FLOWISE_USERNAME/PASSWORD.
    freeHostingHint:
      "Self-host GRATIS en Hugging Face Spaces (Docker) o en una VM Always Free de Oracle Cloud (24/7). Actívale autenticación (FLOWISE_USERNAME/PASSWORD). No procede endpoint público.",
    docsUrl: "https://docs.flowiseai.com/api-reference/prediction",
    actions: [
      { id: "predict", label: "Preguntar al chatflow", description: "Envía una pregunta a un chatflow de Flowise y devuelve su respuesta." },
    ],
  },
  {
    id: "anything-llm",
    ossId: "anythingllm",
    label: "AnythingLLM",
    category: "app-platform",
    capabilities: ["Chat RAG sobre tus documentos", "Workspaces privados", "Agentes de workspace"],
    defaultEndpoint: "http://localhost:3001",
    needsKey: true,
    // App todo-en-uno self-host (workspaces con tus documentos + vectorDB
    // propia): no procede un endpoint público compartido. GRATIS: Hugging Face
    // Spaces (Docker) para pruebas o VM Always Free de Oracle Cloud para 24/7.
    // Genera tu clave en tu instancia → Ajustes → API Keys.
    freeHostingHint:
      "Cada usuario tiene sus propios workspaces/documentos: no procede un endpoint público. Self-host GRATIS en Hugging Face Spaces (Docker, imagen mintplexlabs/anythingllm) o en una VM Always Free de Oracle Cloud (24/7). Genera tu clave en tu instancia → Ajustes → API Keys.",
    docsUrl: "https://docs.anythingllm.com/api/overview",
    actions: [
      { id: "chat", label: "Preguntar al workspace", description: "Envía un mensaje a un workspace de AnythingLLM (RAG sobre sus documentos; needs extra.workspaceSlug)." },
    ],
  },
  {
    id: "open-webui",
    ossId: "open-webui",
    label: "Open WebUI",
    category: "app-platform",
    capabilities: ["Chat con LLM", "Compatible OpenAI", "RAG"],
    defaultEndpoint: "http://localhost:3000",
    needsKey: true,
    // Interfaz personal con cuentas y clave: nunca un endpoint público compartido.
    // GRATIS: Hugging Face Spaces (Docker) o VM Always Free de Oracle Cloud (24/7).
    freeHostingHint:
      "Self-host GRATIS en Hugging Face Spaces (Docker, imagen ghcr.io/open-webui/open-webui) o en una VM Always Free de Oracle Cloud (24/7). Requiere cuenta y clave; no procede un endpoint público compartido.",
    docsUrl: "https://docs.openwebui.com/",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat usando la API compatible con OpenAI de Open WebUI." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos disponibles." },
    ],
  },
  {
    id: "openhands",
    ossId: "openhands",
    label: "OpenHands",
    category: "app-platform",
    capabilities: ["Agente de software", "Escribe y ejecuta código (experimental)"],
    defaultEndpoint: "http://localhost:3000",
    needsKey: false,
    // Agente que EJECUTA código: por seguridad jamás debe ser público ni default
    // para todos. Correr siempre aislado (Docker/VM propia). GRATIS: VM Always
    // Free de Oracle Cloud como sandbox dedicado.
    freeHostingHint:
      "Experimental y ejecuta código: manténlo SIEMPRE aislado, nunca público ni on-by-default. Para pruebas gratis usa una VM Always Free de Oracle Cloud como sandbox dedicado (Docker).",
    docsUrl: "https://docs.all-hands.dev/",
    actions: [
      { id: "run-task", label: "Lanzar tarea", description: "Envía una tarea de programación al servidor de OpenHands (experimental; configura extra.path)." },
    ],
  },
  {
    id: "stirling-pdf",
    ossId: "stirling-pdf",
    label: "Stirling-PDF",
    category: "app-platform",
    capabilities: ["Fusionar PDF", "PDF a imagen", "Extraer texto"],
    defaultEndpoint: "http://localhost:8080",
    needsKey: false,
    // El antiguo demo público (stirlingpdf.io) hoy redirige a un producto
    // comercial: no hay API pública OSS fiable. Es stateless y sin datos
    // sensibles → GRAN candidato a instancia oficial de StarSeed on-by-default.
    // GRATIS: Hugging Face Spaces (Docker, imagen stirlingtools/stirling-pdf,
    // puerto 8080) o VM Always Free de Oracle Cloud (24/7).
    freeHostingHint:
      "Sin instancia pública OSS fiable (el demo stirlingpdf.io ahora redirige a un producto de pago). Self-host GRATIS en Hugging Face Spaces (Docker, imagen stirlingtools/stirling-pdf, puerto 8080) o VM Always Free de Oracle Cloud. Es stateless: candidato ideal a instancia oficial StarSeed activada por defecto.",
    docsUrl: "https://docs.stirlingpdf.com/API/",
    actions: [
      { id: "merge", label: "Fusionar PDFs", description: "Combina dos o más PDFs en un único documento." },
      { id: "to-image", label: "PDF a imagen", description: "Convierte las páginas de un PDF en imágenes." },
      { id: "extract-text", label: "Extraer texto", description: "Extrae el texto de un PDF (si la instancia lo soporta)." },
    ],
  },

  // ── Runtimes locales (compatibles OpenAI) ─────────────────────
  {
    id: "ollama",
    ossId: "ollama",
    label: "Ollama",
    category: "runtime",
    capabilities: ["Inferencia local", "Compatible OpenAI", "Gestión de modelos"],
    defaultEndpoint: "http://localhost:11434",
    needsKey: false,
    // Inferencia LOCAL: su gracia es correr en la máquina del usuario (o su
    // exocórtex). No procede endpoint público (necesitaría GPU costosa). El
    // free tier sin GPU de HF/VMs solo mueve modelos diminutos.
    freeHostingHint:
      "Diseñado para correr LOCAL en la máquina/exocórtex del usuario. No procede un endpoint público (requeriría GPU). El hosting gratis sin GPU solo sirve para modelos muy pequeños; mantener default localhost.",
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat con un modelo local servido por Ollama." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos descargados en Ollama." },
    ],
  },
  {
    id: "litellm",
    ossId: "litellm",
    label: "LiteLLM",
    category: "runtime",
    capabilities: ["Gateway 100+ LLM", "Compatible OpenAI", "Balanceo/coste"],
    defaultEndpoint: "http://localhost:4000",
    needsKey: true,
    // Gateway con TUS claves de proveedores dentro: por seguridad nunca público.
    // GRATIS: proxy ligero en Hugging Face Spaces (Docker) o VM Always Free de
    // Oracle Cloud; protégelo con LITELLM_MASTER_KEY.
    freeHostingHint:
      "Contiene tus claves de proveedores: nunca lo expongas público. Self-host GRATIS en Hugging Face Spaces (Docker) o VM Always Free de Oracle Cloud, protegido con LITELLM_MASTER_KEY.",
    docsUrl: "https://docs.litellm.ai/docs/simple_proxy",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat a través del proxy LiteLLM (formato OpenAI)." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos expuestos por el gateway." },
    ],
  },
  {
    id: "localai",
    ossId: "localai",
    label: "LocalAI",
    category: "runtime",
    capabilities: ["Inferencia local multimodal", "Compatible OpenAI"],
    defaultEndpoint: "http://localhost:8080",
    needsKey: false,
    // Inferencia local multimodal: como Ollama, su sentido es correr en local.
    // GRATIS para pruebas: Hugging Face Spaces (Docker) con modelos pequeños;
    // para algo real hace falta GPU. Mantener default localhost.
    freeHostingHint:
      "Inferencia local (como Ollama): pensado para la máquina del usuario. Pruebas gratis con modelos pequeños en Hugging Face Spaces (Docker); sin GPU no rinde. Mantener default localhost.",
    docsUrl: "https://localai.io/",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat con LocalAI (formato OpenAI)." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos disponibles." },
    ],
  },

  // ── Automatización ────────────────────────────────────────────
  {
    id: "n8n",
    ossId: "n8n",
    label: "n8n",
    category: "automation",
    capabilities: ["Disparar workflows", "Automatización", "Webhooks"],
    defaultEndpoint: "http://localhost:5678",
    needsKey: false,
    // Sus workflows/credenciales son propios de cada usuario: no hay endpoint
    // público. OJO: los free tiers que "duermen" (Render/Railway/Koyeb) rompen
    // los webhooks entrantes. Para 24/7 real y gratis → VM Always Free de Oracle Cloud.
    freeHostingHint:
      "Cada usuario tiene sus propios workflows/credenciales; no hay endpoint público. Para 24/7 GRATIS usa una VM Always Free de Oracle Cloud (Docker): los free tiers que se duermen (Render/Railway/Koyeb) rompen los webhooks entrantes.",
    docsUrl: "https://docs.n8n.io/integrations/webhooks/",
    actions: [
      { id: "trigger", label: "Disparar automatización", description: "Dispara un workflow de n8n vía su webhook con un payload." },
    ],
  },
  {
    id: "browser-use",
    ossId: "browser-use",
    label: "Browser Use",
    category: "automation",
    capabilities: ["Agente de navegador", "Automatización web (experimental)"],
    defaultEndpoint: "http://localhost:8000",
    needsKey: false,
    // Controla un navegador real (experimental): jamás público ni default para
    // todos. Aíslalo. GRATIS para pruebas: VM Always Free de Oracle Cloud (Docker
    // con navegador headless).
    freeHostingHint:
      "Controla un navegador real y es experimental: manténlo aislado, nunca público ni on-by-default. Pruebas gratis en una VM Always Free de Oracle Cloud (Docker con navegador headless).",
    docsUrl: "https://docs.browser-use.com/",
    actions: [
      { id: "browser-task", label: "Tarea de navegador", description: "Envía una tarea web en lenguaje natural a un servidor Browser Use (experimental; configura extra.path)." },
    ],
  },

  // ── Media y hogar (self-host, solo lectura) ───────────────────
  {
    id: "immich",
    ossId: "immich",
    label: "Immich",
    category: "backend",
    capabilities: ["Listar álbumes", "Ver assets recientes", "Importar referencias a la Biblioteca"],
    defaultEndpoint: "http://localhost:2283",
    needsKey: true,
    // Servidor personal de fotos/vídeos con ML (reconocimiento facial/objetos):
    // cada instancia es del usuario, no procede un endpoint público compartido.
    // GRATIS: self-host en tu NAS/servidor (docker-compose oficial) o en una VM
    // Always Free de Oracle Cloud con volumen persistente (no apto para Hugging
    // Face Spaces: necesita almacenamiento duradero + colas ML, no encaja con
    // contenedores efímeros).
    freeHostingHint:
      "Cada usuario tiene su propia fototeca: no procede un endpoint público. Self-host GRATIS con el docker-compose oficial en tu NAS/servidor o en una VM Always Free de Oracle Cloud con volumen persistente (necesita almacenamiento duradero, no encaja en Hugging Face Spaces). Genera tu clave en Immich → Ajustes de cuenta → API Keys.",
    docsUrl: "https://immich.app/docs/api/",
    actions: [
      { id: "albums", label: "Listar álbumes", description: "Lista tus álbumes de Immich (nombre y nº de elementos)." },
      { id: "assets", label: "Assets recientes", description: "Lista tus fotos/vídeos más recientes (needs take opcional, por defecto 20)." },
    ],
  },
  {
    id: "audiobookshelf",
    ossId: "audiobookshelf",
    label: "Audiobookshelf",
    category: "backend",
    capabilities: ["Listar bibliotecas de audio", "Listar audiolibros/podcasts"],
    defaultEndpoint: "http://localhost:13378",
    needsKey: true,
    // Servidor personal de audiolibros/podcasts: cada instancia es del usuario,
    // no procede un endpoint público compartido. GRATIS: self-host en su propio
    // NAS/servidor o en una VM Always Free de Oracle Cloud (Docker).
    freeHostingHint:
      "Cada usuario tiene su propia biblioteca de audio: no procede un endpoint público. Self-host GRATIS en tu NAS/servidor o en una VM Always Free de Oracle Cloud (imagen ghcr.io/advplyr/audiobookshelf).",
    docsUrl: "https://api.audiobookshelf.org/",
    actions: [
      { id: "libraries", label: "Listar bibliotecas", description: "Lista tus bibliotecas de audio (audiolibros/podcasts)." },
      { id: "items", label: "Listar elementos de una biblioteca", description: "Lista los audiolibros/episodios de una biblioteca (needs libraryId)." },
    ],
  },
  {
    id: "home-assistant",
    ossId: "home-assistant",
    label: "Home Assistant",
    category: "automation",
    capabilities: ["Consultar estado de dispositivos", "Consultar una entidad concreta"],
    defaultEndpoint: "http://homeassistant.local:8123",
    needsKey: true,
    // Controla dispositivos reales del hogar del usuario: jamás público ni
    // on-by-default, y este conector es DELIBERADAMENTE de solo lectura (nunca
    // llama a /api/services). GRATIS: corre ya en el propio hub/NAS del usuario;
    // no aplica hosting externo.
    freeHostingHint:
      "Corre ya en el hub/NAS/Raspberry Pi del propio usuario (no aplica hosting externo). Genera un 'Long-Lived Access Token' en tu perfil de Home Assistant y pégalo aquí como clave. Este conector es DELIBERADAMENTE de solo lectura (nunca actúa sobre dispositivos).",
    docsUrl: "https://developers.home-assistant.io/docs/api/rest/",
    actions: [
      { id: "states", label: "Ver estado de todas las entidades", description: "Lista el estado actual de todas tus entidades/dispositivos (solo lectura)." },
      { id: "state", label: "Ver estado de una entidad", description: "Consulta el estado de una entidad concreta por su entity_id (solo lectura)." },
    ],
  },

  // ── Búsqueda (metabuscador · IA con citas) ─────────────────────
  {
    id: "perplexica",
    ossId: "perplexica",
    label: "Perplexica (Vane)",
    category: "data-ingest",
    capabilities: ["Búsqueda IA con fuentes citadas", "Modo académico/discusiones", "Motor opcional de acceso web"],
    defaultEndpoint: "http://localhost:3000",
    needsKey: false,
    // El repo oficial (ItzCrazyKns/Perplexica) se renombró a «Vane» en 2026
    // (mismo autor/proyecto); mantenemos el id "perplexica" por continuidad.
    // Sin instancia pública fiable (busca con TUS proveedores LLM). GRATIS:
    // self-host con Docker (incluye SearXNG embebido) en Hugging Face Spaces
    // o en una VM Always Free de Oracle Cloud (24/7). API más compleja que el
    // resto del catálogo: exige providerId/modelos de TU instancia (ver
    // clients/perplexica.ts) — por eso queda como endpoint configurable +
    // capacidad, no como conector de un solo campo.
    freeHostingHint:
      "Sin instancia pública fiable (usa TUS proveedores LLM configurados). Self-host GRATIS con Docker (docker run itzcrazykns1337/vane:latest, incluye SearXNG embebido) en Hugging Face Spaces o en una VM Always Free de Oracle Cloud. Tras desplegarlo, configura tus modelos en su pantalla de setup y usa la acción «providers» para obtener el providerId que pide este conector.",
    docsUrl: "https://github.com/ItzCrazyKns/Vane/tree/master/docs/API/SEARCH.md",
    actions: [
      { id: "providers", label: "Ver proveedores/modelos", description: "Lista los proveedores y modelos configurados en tu instancia (para configurar la búsqueda)." },
      { id: "search", label: "Buscar con IA", description: "Busca con respuesta sintetizada y fuentes citadas (needs extra.providerId/chatModel/embeddingModel)." },
    ],
  },
  {
    id: "searxng",
    ossId: "searxng",
    label: "SearXNG",
    category: "data-ingest",
    capabilities: ["Búsqueda web privada", "Metabúsqueda", "Resultados JSON"],
    defaultEndpoint: "http://localhost:8080",
    needsKey: false,
    // IMPORTANTE: la INMENSA mayoría de instancias públicas (searx.space) tienen
    // el formato JSON DESHABILITADO y devuelven 403 al pedir `format=json`, así
    // que NO se puede fijar una pública como default sin romper el conector.
    // Es liviano y sin datos sensibles → candidato claro a instancia oficial de
    // StarSeed on-by-default (con `search.formats: [html, json]` en settings.yml).
    // GRATIS: Hugging Face Spaces (Docker, searxng/searxng, puerto 8080) o VM
    // Always Free de Oracle Cloud (24/7).
    freeHostingHint:
      "Las instancias públicas de searx.space suelen tener JSON deshabilitado (403) — no se puede usar una pública como default. Self-host GRATIS en Hugging Face Spaces (Docker, imagen searxng/searxng) o VM Always Free de Oracle Cloud, con `search.formats: [html, json]` en settings.yml. Candidato ideal a instancia oficial StarSeed activada por defecto.",
    actions: [
      { id: "search", label: "Buscar en la web", description: "Realiza una búsqueda web y devuelve resultados (requiere format JSON activo)." },
    ],
  },
];

// ── Helpers de búsqueda ──────────────────────────────────────────
export function getIntegration(id: string): IntegrationDescriptor | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}

// ── Persistencia de configuración (localStorage, SSR-safe) ───────
const CONFIG_PREFIX = "starseed.integration.";

/**
 * Clave de almacenamiento de la config:
 *   • Global:    starseed.integration.<id>
 *   • Por cerebro: starseed.brain.<brainId>.integration.<id>
 */
export function integrationConfigKey(id: string, brainId?: string): string {
  if (brainId && brainId.trim()) {
    return `starseed.brain.${brainId.trim()}.integration.${id}`;
  }
  return `${CONFIG_PREFIX}${id}`;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Lee la config (defensivo). Devuelve {} si no hay nada/error/SSR. */
export function loadIntegrationConfig(id: string, brainId?: string): IntegrationConfig {
  if (!isClient()) return {};
  try {
    const raw = localStorage.getItem(integrationConfigKey(id, brainId));
    if (!raw) {
      // Fallback a la global si se pidió por-cerebro y no existe.
      if (brainId) {
        const g = localStorage.getItem(integrationConfigKey(id));
        if (g) {
          const parsed = JSON.parse(g);
          if (parsed && typeof parsed === "object") return parsed as IntegrationConfig;
        }
      }
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as IntegrationConfig) : {};
  } catch {
    return {};
  }
}

/** Persiste la config (defensivo). No-op en SSR. Notifica por evento. */
export function saveIntegrationConfig(id: string, cfg: IntegrationConfig, brainId?: string): void {
  if (!isClient()) return;
  try {
    const key = integrationConfigKey(id, brainId);
    localStorage.setItem(key, JSON.stringify(cfg ?? {}));
    try {
      window.dispatchEvent(
        new CustomEvent("starseed:integration-config-changed", {
          detail: { id, brainId: brainId || null, at: Date.now() },
        }),
      );
    } catch { /* noop */ }
  } catch { /* noop */ }
}
