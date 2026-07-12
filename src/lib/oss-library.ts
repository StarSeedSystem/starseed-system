// ════════════════════════════════════════════════════════════════
// OSS Library — Catálogo de Código Abierto de StarSeed
// ----------------------------------------------------------------
// Fuente ÚNICA y actualizable que alimenta los catálogos de TODAS las
// superficies de configuración del OS: IA, servicios multi-agente
// (Mixture of Agents), canales, memorias/vectores, servidores de
// cerebros, almacenamiento y estándares de plugins.
//
// • `OSS_LIBRARY` trae una lista amplia de opciones de código abierto
//   investigadas y verificadas (licencia + repo).
// • `LIBRARY_SOURCES` son los orígenes desde los que la librería se
//   actualiza (registros remotos); `getLibrary()` los combina con el
//   seed local. Así, al añadir fuentes, las opciones se actualizan en
//   cada panel de configuración automáticamente.
// ════════════════════════════════════════════════════════════════

export type OssCategory =
  | "moa"             // Mixture-of-Agents / orquestación multi-agente
  | "llm"             // Familias de modelos LLM abiertos
  | "runtime"         // Runtimes de inferencia local/self-host
  | "agent-framework" // Frameworks de agentes / RAG
  | "vector-memory"   // Almacenes vectoriales / memoria
  | "chat-channel"    // Plataformas de chat / canales self-host
  | "storage"         // Almacenamiento / sync soberano
  | "plugin-standard" // Estándares de interoperabilidad de tools/plugins
  | "app-platform"    // Apps y plataformas IA self-host (LLMOps, UIs, agentes-app)
  | "automation"      // Automatización / workflows / RPA
  | "data-ingest"     // Crawling / scraping / ETL para IA
  | "backend"         // Backend / BaaS / base de datos
  | "devops";          // Self-host / despliegue / PaaS

export interface OssOption {
  id: string;
  name: string;
  category: OssCategory;
  description: string;
  license: string;
  url: string;
  /** OSI-approved open source (true) vs open-weight/otra (false). */
  oss: boolean;
  /** Mantenido activamente (false = archivado / maintenance mode). */
  maintained: boolean;
  /** Implementa Mixture-of-Agents nativamente (proposers + aggregator). */
  moaNative?: boolean;
  /** El sistema lo habilita POR DEFECTO para todos los usuarios donde aplica. */
  defaultIntegrated?: boolean;
  tags?: string[];
}

export const OSS_CATEGORY_META: Record<OssCategory, { label: string; emoji: string; hint: string }> = {
  "moa":             { label: "Multi-agente / MoA",      emoji: "🧬", hint: "Combinaciones de agentes que Aurora orquesta y selecciona por contexto." },
  "llm":             { label: "Modelos abiertos",        emoji: "🧠", hint: "Familias de LLM de pesos abiertos." },
  "runtime":         { label: "Runtimes locales",        emoji: "⚙️", hint: "Ejecuta modelos en tu propio hardware/servidor." },
  "agent-framework": { label: "Frameworks de agentes",   emoji: "🛠️", hint: "Orquestación de agentes y RAG." },
  "vector-memory":   { label: "Memoria / vectores",      emoji: "📚", hint: "Bases vectoriales para memorias y baúles." },
  "chat-channel":    { label: "Canales de chat",         emoji: "💬", hint: "Plataformas y APIs de chat self-host." },
  "storage":         { label: "Almacenamiento soberano", emoji: "🗄️", hint: "Object storage y sync descentralizado." },
  "plugin-standard": { label: "Plugins / tools",         emoji: "🔌", hint: "Estándares para conectar herramientas y datos." },
  "app-platform":    { label: "Apps y plataformas IA",   emoji: "🚀", hint: "Apps y plataformas IA self-host (LLMOps, UIs, agentes-app)." },
  "automation":      { label: "Automatización",          emoji: "🔁", hint: "Automatización, workflows y RPA self-host." },
  "data-ingest":     { label: "Ingesta de datos",        emoji: "🕷️", hint: "Crawling, scraping y ETL para IA." },
  "backend":         { label: "Backend / BaaS",          emoji: "🧱", hint: "Backend, BaaS y bases de datos soberanas." },
  "devops":          { label: "Despliegue / PaaS",       emoji: "📦", hint: "Self-host, despliegue y PaaS." },
};

/** Orígenes remotos desde los que se actualiza la librería (además del seed local). */
export interface LibrarySource {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  /** Tipo de origen: catálogo de opciones, código, componentes, diseño, MCP, modelos, etc. */
  kind?: "catalog" | "code" | "components" | "design" | "mcp" | "models" | "automation" | "apps";
  /** Sus elementos pueden instalarse en un cerebro/servidor (vía enlace compartible). */
  installable?: boolean;
  /** Puede compartirse con la comunidad mediante enlaces con permisos de usuario. */
  shareable?: boolean;
  /** Descripción corta del origen. */
  description?: string;
}

export const LIBRARY_SOURCES: LibrarySource[] = [
  { id: "starseed-core", label: "StarSeed · Catálogo base", url: "internal://oss-library", enabled: true, kind: "catalog", installable: true, shareable: true, description: "Catálogo soberano base de StarSeed: opciones OSS verificadas (licencia + repo)." },
  // — Orígenes nombrados / investigados (adjuntables a un cerebro o instalables vía enlaces compartibles con permisos) —
  { id: "github", label: "GitHub", url: "https://github.com", enabled: true, kind: "code", installable: true, shareable: true, description: "Mayor registro de código abierto: repos, releases y plantillas para instalar o clonar." },
  { id: "npm", label: "npm", url: "https://www.npmjs.com", enabled: true, kind: "code", installable: true, shareable: true, description: "Registro de paquetes JavaScript/TypeScript para instalar dependencias y SDKs." },
  { id: "pypi", label: "PyPI", url: "https://pypi.org", enabled: true, kind: "code", installable: true, shareable: true, description: "Índice de paquetes Python para instalar librerías y herramientas." },
  { id: "huggingface", label: "Hugging Face", url: "https://huggingface.co", enabled: true, kind: "models", installable: true, shareable: true, description: "Hub de modelos, datasets y Spaces de IA abiertos para adjuntar a un cerebro." },
  { id: "smithery", label: "Smithery", url: "https://smithery.ai", enabled: true, kind: "mcp", installable: true, shareable: true, description: "Registro de servidores MCP: descubre e instala tools/contexto para agentes." },
  { id: "mcp-market", label: "MCP Market", url: "https://mcpmarket.com", enabled: true, kind: "mcp", installable: true, shareable: true, description: "Mercado de servidores MCP para conectar herramientas y datos a la red." },
  { id: "awesome-mcp", label: "Awesome MCP Servers", url: "https://github.com/punkpeye/awesome-mcp-servers", enabled: true, kind: "mcp", installable: true, shareable: true, description: "Lista curada de servidores MCP de la comunidad, lista para adjuntar." },
  { id: "21st-dev", label: "21st.dev", url: "https://21st.dev", enabled: true, kind: "components", installable: true, shareable: true, description: "Registro de componentes React artesanales para instalar y compartir en equipo." },
  { id: "v0", label: "v0.app", url: "https://v0.app", enabled: true, kind: "components", installable: true, shareable: true, description: "UI generativa de Vercel (v0): genera y exporta componentes/pantallas." },
  { id: "dribbble", label: "Dribbble", url: "https://dribbble.com", enabled: true, kind: "design", installable: false, shareable: true, description: "Galería de diseño e inspiración visual para nutrir el sistema de estilo." },
];

// ── Catálogo seed (investigado y verificado · jun 2026) ──
export const OSS_LIBRARY: OssOption[] = [
  // 1 · Mixture-of-Agents / multi-agente
  { id: "together-moa", name: "Together MoA", category: "moa", description: "Implementación de referencia de Mixture-of-Agents: capas de LLM proponentes + agregador.", license: "Apache-2.0", url: "https://github.com/togethercomputer/MoA", oss: true, maintained: true, moaNative: true, defaultIntegrated: true, tags: ["mixture-of-agents", "aggregator"] },
  { id: "langgraph", name: "LangGraph", category: "moa", description: "Orquestación con estado de flujos multi-agente como grafo (nodos + aristas).", license: "MIT", url: "https://github.com/langchain-ai/langgraph", oss: true, maintained: true, defaultIntegrated: true, tags: ["graph", "stateful"] },
  { id: "crewai", name: "CrewAI", category: "moa", description: "Orquestación multi-agente por roles (\"crew\") para equipos colaborativos.", license: "MIT", url: "https://github.com/crewAIInc/crewAI", oss: true, maintained: true, tags: ["roles", "crew"] },
  { id: "ag2", name: "AG2 (AutoGen)", category: "moa", description: "Continuación comunitaria de AutoGen; GroupChat orientado a eventos (\"AgentOS\").", license: "Apache-2.0", url: "https://github.com/ag2ai/ag2", oss: true, maintained: true, tags: ["groupchat", "events"] },
  { id: "autogen", name: "Microsoft AutoGen", category: "moa", description: "Framework de IA agéntica y conversación multi-agente (en mantenimiento; ver AG2).", license: "MIT", url: "https://github.com/microsoft/autogen", oss: true, maintained: false, tags: ["microsoft"] },
  { id: "openai-agents", name: "OpenAI Agents SDK", category: "moa", description: "Framework ligero y provider-agnóstico de flujos multi-agente (sucesor de Swarm).", license: "MIT", url: "https://github.com/openai/openai-agents-python", oss: true, maintained: true, tags: ["handoffs"] },
  { id: "metagpt", name: "MetaGPT", category: "moa", description: "Multi-agente que simula una empresa de software (PRD→diseño→código).", license: "MIT", url: "https://github.com/FoundationAgents/MetaGPT", oss: true, maintained: true, tags: ["software-company"] },
  { id: "camel", name: "CAMEL-AI", category: "moa", description: "Agentes comunicativos / role-playing a escala.", license: "Apache-2.0", url: "https://github.com/camel-ai/camel", oss: true, maintained: true, tags: ["role-playing"] },
  { id: "agno", name: "Agno (Phidata)", category: "moa", description: "Framework model-agnóstico para agentes y \"teams\" con memoria/tools/razonamiento.", license: "MPL-2.0", url: "https://github.com/agno-agi/agno", oss: true, maintained: true, tags: ["teams", "memory"] },

  // 2 · Modelos LLM abiertos
  { id: "qwen", name: "Qwen", category: "llm", description: "Familia multilingüe fuerte (densa + MoE), licencia permisiva.", license: "Apache-2.0", url: "https://github.com/QwenLM/Qwen3", oss: true, maintained: true, defaultIntegrated: true, tags: ["multilingüe", "moe"] },
  { id: "deepseek", name: "DeepSeek (V3 / R1)", category: "llm", description: "MoE de frontera para chat y razonamiento.", license: "MIT", url: "https://github.com/deepseek-ai/DeepSeek-V3", oss: true, maintained: true, tags: ["reasoning", "moe"] },
  { id: "mistral", name: "Mistral / Mixtral", category: "llm", description: "Modelos densos + MoE disperso; lanzamientos abiertos permisivos.", license: "Apache-2.0", url: "https://github.com/mistralai/mistral-inference", oss: true, maintained: true, tags: ["moe"] },
  { id: "olmo", name: "OLMo (AI2)", category: "llm", description: "Modelos totalmente abiertos: código, datos, configs y checkpoints.", license: "Apache-2.0", url: "https://github.com/allenai/OLMo", oss: true, maintained: true, tags: ["fully-open"] },
  { id: "phi", name: "Phi (Microsoft)", category: "llm", description: "SLMs pequeños de alta calidad para razonamiento.", license: "MIT", url: "https://huggingface.co/microsoft/phi-4", oss: true, maintained: true, tags: ["slm"] },
  { id: "llama", name: "Llama (Meta)", category: "llm", description: "Familia de pesos abiertos densa + MoE (Llama 3.x / 4).", license: "Llama Community (open-weight)", url: "https://github.com/meta-llama/llama-models", oss: false, maintained: true, tags: ["open-weight"] },
  { id: "gemma", name: "Gemma (Google)", category: "llm", description: "Modelos ligeros de pesos abiertos derivados de la investigación Gemini.", license: "Gemma Terms (open-weight)", url: "https://github.com/google-deepmind/gemma", oss: false, maintained: true, tags: ["open-weight"] },

  // 3 · Runtimes de inferencia local
  { id: "ollama", name: "Ollama", category: "runtime", description: "Ejecuta/gestiona LLM en local con un solo comando; API compatible OpenAI.", license: "MIT", url: "https://github.com/ollama/ollama", oss: true, maintained: true, defaultIntegrated: true, tags: ["local", "openai-compat"] },
  { id: "vllm", name: "vLLM", category: "runtime", description: "Motor de servicio de alto rendimiento (PagedAttention), compatible OpenAI.", license: "Apache-2.0", url: "https://github.com/vllm-project/vllm", oss: true, maintained: true, tags: ["serving", "throughput"] },
  { id: "llamacpp", name: "llama.cpp", category: "runtime", description: "Inferencia portátil C/C++ (GGUF) en CPU/GPU/edge con mínimas dependencias.", license: "MIT", url: "https://github.com/ggml-org/llama.cpp", oss: true, maintained: true, tags: ["gguf", "edge"] },
  { id: "sglang", name: "SGLang", category: "runtime", description: "Servicio de alto rendimiento con prefix caching; fuerte para cargas agénticas.", license: "Apache-2.0", url: "https://github.com/sgl-project/sglang", oss: true, maintained: true, tags: ["serving"] },
  { id: "localai", name: "LocalAI", category: "runtime", description: "Motor self-host compatible OpenAI que envuelve múltiples backends (texto/voz/imagen).", license: "MIT", url: "https://github.com/mudler/LocalAI", oss: true, maintained: true, tags: ["multimodal"] },
  { id: "litellm", name: "LiteLLM", category: "runtime", description: "Gateway/proxy que expone 100+ LLM en formato OpenAI con coste, balanceo y guardrails.", license: "MIT (core; enterprise/ comercial)", url: "https://github.com/BerriAI/litellm", oss: true, maintained: true, defaultIntegrated: true, tags: ["gateway", "openai-compat", "proxy"] },

  // 4 · Frameworks de agentes / RAG
  { id: "langchain", name: "LangChain", category: "agent-framework", description: "Framework amplio de apps LLM con 700+ integraciones, cadenas y tools.", license: "MIT", url: "https://github.com/langchain-ai/langchain", oss: true, maintained: true, tags: ["chains", "tools"] },
  { id: "llamaindex", name: "LlamaIndex", category: "agent-framework", description: "Framework de datos para ingesta, indexado, recuperación y RAG.", license: "MIT", url: "https://github.com/run-llama/llama_index", oss: true, maintained: true, tags: ["rag", "indexing"] },
  { id: "haystack", name: "Haystack", category: "agent-framework", description: "Orquestación NLP/LLM en producción con pipelines (DAG) RAG y agentes.", license: "Apache-2.0", url: "https://github.com/deepset-ai/haystack", oss: true, maintained: true, tags: ["pipelines"] },
  { id: "semantic-kernel", name: "Semantic Kernel", category: "agent-framework", description: "SDK multi-lenguaje (C#/Python/Java) de skills, planners y agentes.", license: "MIT", url: "https://github.com/microsoft/semantic-kernel", oss: true, maintained: true, tags: ["skills", "planners"] },
  { id: "dspy", name: "DSPy", category: "agent-framework", description: "\"Programar, no prompts\": compila/optimiza pipelines de LLM.", license: "MIT", url: "https://github.com/stanfordnlp/dspy", oss: true, maintained: true, tags: ["declarative"] },
];

const OSS_LIBRARY_EXT: OssOption[] = [
  // 5 · Memoria / vectores
  { id: "chroma", name: "Chroma", category: "vector-memory", description: "Base vectorial pensada para apps LLM, API simple.", license: "Apache-2.0", url: "https://github.com/chroma-core/chroma", oss: true, maintained: true, defaultIntegrated: true, tags: ["embeddings"] },
  { id: "qdrant", name: "Qdrant", category: "vector-memory", description: "Base vectorial en Rust de alto rendimiento con filtrado por payload.", license: "Apache-2.0", url: "https://github.com/qdrant/qdrant", oss: true, maintained: true, tags: ["rust", "filtering"] },
  { id: "weaviate", name: "Weaviate", category: "vector-memory", description: "Base vectorial con módulos de vectorización y búsqueda híbrida.", license: "BSD-3-Clause", url: "https://github.com/weaviate/weaviate", oss: true, maintained: true, tags: ["hybrid-search"] },
  { id: "milvus", name: "Milvus", category: "vector-memory", description: "Base vectorial distribuida y escalable (miles de millones de vectores).", license: "Apache-2.0", url: "https://github.com/milvus-io/milvus", oss: true, maintained: true, tags: ["scale"] },
  { id: "pgvector", name: "pgvector", category: "vector-memory", description: "Extensión de PostgreSQL para búsqueda por similitud vectorial.", license: "PostgreSQL", url: "https://github.com/pgvector/pgvector", oss: true, maintained: true, defaultIntegrated: true, tags: ["postgres"] },
  { id: "lancedb", name: "LanceDB", category: "vector-memory", description: "Base vectorial embebida (in-process) sobre el formato Lance.", license: "Apache-2.0", url: "https://github.com/lancedb/lancedb", oss: true, maintained: true, tags: ["embedded", "serverless"] },
  { id: "txtai", name: "txtai", category: "vector-memory", description: "Base de embeddings todo-en-uno para búsqueda semántica y workflows.", license: "Apache-2.0", url: "https://github.com/neuml/txtai", oss: true, maintained: true, tags: ["workflows"] },

  // 6 · Canales de chat self-host
  { id: "matrix-synapse", name: "Matrix / Synapse", category: "chat-channel", description: "Homeserver de referencia del protocolo federado y descentralizado Matrix.", license: "AGPL-3.0", url: "https://github.com/element-hq/synapse", oss: true, maintained: true, defaultIntegrated: true, tags: ["federated", "e2ee"] },
  { id: "rocketchat", name: "Rocket.Chat", category: "chat-channel", description: "Plataforma de comunicaciones / chat de equipo self-host.", license: "MIT (core)", url: "https://github.com/RocketChat/Rocket.Chat", oss: true, maintained: true, tags: ["team-chat"] },
  { id: "mattermost", name: "Mattermost", category: "chat-channel", description: "Colaboración estilo Slack self-host.", license: "AGPL-3.0 / MIT", url: "https://github.com/mattermost/mattermost", oss: true, maintained: true, tags: ["team-chat"] },
  { id: "zulip", name: "Zulip", category: "chat-channel", description: "Chat de equipo con hilos por tema y API de cliente abierta.", license: "Apache-2.0", url: "https://github.com/zulip/zulip", oss: true, maintained: true, tags: ["threads"] },
  { id: "telegram-bot-api", name: "Telegram Bot API", category: "chat-channel", description: "API HTTP abierta + servidor open-source para bots/canales de Telegram.", license: "Boost (tdlib)", url: "https://github.com/tdlib/telegram-bot-api", oss: true, maintained: true, tags: ["bots", "telegram"] },

  // 7 · Almacenamiento soberano
  { id: "seaweedfs", name: "SeaweedFS", category: "storage", description: "Object/file store distribuido y rápido (S3-compatible) para miles de millones de ficheros.", license: "Apache-2.0", url: "https://github.com/seaweedfs/seaweedfs", oss: true, maintained: true, tags: ["s3", "distributed"] },
  { id: "garage", name: "Garage", category: "storage", description: "Object store S3-compatible, geo-distribuido y ligero (nodos modestos).", license: "AGPL-3.0", url: "https://github.com/deuxfleurs-org/garage", oss: true, maintained: true, tags: ["s3", "geo"] },
  { id: "ipfs-kubo", name: "IPFS (Kubo)", category: "storage", description: "Implementación de referencia de la red de ficheros por contenido IPFS.", license: "MIT/Apache-2.0", url: "https://github.com/ipfs/kubo", oss: true, maintained: true, defaultIntegrated: true, tags: ["content-addressed", "p2p"] },
  { id: "nextcloud", name: "Nextcloud", category: "storage", description: "Suite self-host de ficheros, sync, compartición y colaboración.", license: "AGPL-3.0", url: "https://github.com/nextcloud/server", oss: true, maintained: true, tags: ["files", "sync"] },
  { id: "syncthing", name: "Syncthing", category: "storage", description: "Sincronización de ficheros P2P continua y descentralizada (sin servidor central).", license: "MPL-2.0", url: "https://github.com/syncthing/syncthing", oss: true, maintained: true, tags: ["p2p", "sync"] },
  { id: "minio", name: "MinIO", category: "storage", description: "Object storage S3-compatible (Community Edition en mantenimiento, 2026).", license: "AGPL-3.0", url: "https://github.com/minio/minio", oss: true, maintained: false, tags: ["s3"] },

  // 8 · Plugins / tools (interop)
  { id: "mcp", name: "Model Context Protocol (MCP)", category: "plugin-standard", description: "Protocolo abierto para conectar apps LLM a tools/datos/contexto (Linux Foundation).", license: "MIT", url: "https://github.com/modelcontextprotocol/modelcontextprotocol", oss: true, maintained: true, defaultIntegrated: true, tags: ["standard"] },
  { id: "mcp-ts", name: "MCP · SDK TypeScript", category: "plugin-standard", description: "SDK oficial TS/JS para servidores y clientes MCP.", license: "MIT/Apache-2.0", url: "https://github.com/modelcontextprotocol/typescript-sdk", oss: true, maintained: true, defaultIntegrated: true, tags: ["sdk"] },
  { id: "mcp-py", name: "MCP · SDK Python", category: "plugin-standard", description: "SDK oficial Python para servidores y clientes MCP.", license: "MIT", url: "https://github.com/modelcontextprotocol/python-sdk", oss: true, maintained: true, tags: ["sdk"] },
  { id: "openapi", name: "OpenAPI Specification", category: "plugin-standard", description: "Descripción estándar de APIs HTTP; común para exponer \"tools\" a LLMs.", license: "Apache-2.0", url: "https://github.com/OAI/OpenAPI-Specification", oss: true, maintained: true, tags: ["api"] },

  // 9 · Apps y plataformas IA self-host (LLMOps, UIs, agentes-app)
  { id: "dify", name: "Dify", category: "app-platform", description: "Plataforma LLMOps para apps agénticas: workflows visuales, RAG, agentes y observabilidad.", license: "Dify Open Source License (Apache-2.0 + condiciones)", url: "https://github.com/langgenius/dify", oss: true, maintained: true, defaultIntegrated: true, tags: ["llmops", "rag", "workflow"] },
  { id: "open-webui", name: "Open WebUI", category: "app-platform", description: "Interfaz de chat self-host para LLM (Ollama, API OpenAI…) con RAG y multiusuario.", license: "Open WebUI License (BSD-3 + cláusula de marca)", url: "https://github.com/open-webui/open-webui", oss: true, maintained: true, defaultIntegrated: true, tags: ["chat-ui", "rag"] },
  { id: "langflow", name: "Langflow", category: "app-platform", description: "Constructor visual de agentes y flujos IA (low-code) sobre un grafo de nodos ejecutables.", license: "MIT", url: "https://github.com/langflow-ai/langflow", oss: true, maintained: true, defaultIntegrated: true, tags: ["visual", "agents", "low-code"] },
  { id: "flowise", name: "Flowise", category: "app-platform", description: "Construye agentes IA de forma visual (drag-and-drop) con LangChain por debajo.", license: "Apache-2.0 (core; enterprise/ comercial)", url: "https://github.com/FlowiseAI/Flowise", oss: true, maintained: true, tags: ["visual", "agents", "low-code"] },
  { id: "openhands", name: "OpenHands", category: "app-platform", description: "Agente ingeniero de software IA: escribe, ejecuta y depura código de forma autónoma.", license: "MIT", url: "https://github.com/OpenHands/OpenHands", oss: true, maintained: true, defaultIntegrated: true, tags: ["coding-agent", "autonomous"] },
  { id: "anythingllm", name: "AnythingLLM", category: "app-platform", description: "App todo-en-uno self-host: chat con documentos, agentes y workspaces privados.", license: "MIT", url: "https://github.com/Mintplex-Labs/anything-llm", oss: true, maintained: true, tags: ["chat-ui", "rag", "workspaces"] },
  { id: "librechat", name: "LibreChat", category: "app-platform", description: "UI de chat multi-modelo self-host (OpenAI, Anthropic, locales…) con plugins y agentes.", license: "MIT", url: "https://github.com/danny-avila/LibreChat", oss: true, maintained: true, tags: ["chat-ui", "multi-model"] },
  { id: "stirling-pdf", name: "Stirling-PDF", category: "app-platform", description: "Caja de herramientas PDF self-host: fusiona, divide, convierte, OCR y firma.", license: "MIT (core; open-core)", url: "https://github.com/Stirling-Tools/Stirling-PDF", oss: true, maintained: true, defaultIntegrated: true, tags: ["pdf", "toolkit"] },

  // 10 · Automatización / workflows / RPA
  { id: "n8n", name: "n8n", category: "automation", description: "Automatización de workflows fair-code con IA nativa y 400+ integraciones (self-host o nube).", license: "Sustainable Use License (fair-code, source-available)", url: "https://github.com/n8n-io/n8n", oss: false, maintained: true, defaultIntegrated: true, tags: ["workflow", "integrations"] },
  { id: "activepieces", name: "Activepieces", category: "automation", description: "Automatización no-code IA-first, MIT y self-host, con piezas de integración.", license: "MIT", url: "https://github.com/activepieces/activepieces", oss: true, maintained: true, tags: ["workflow", "no-code"] },
  { id: "windmill", name: "Windmill", category: "automation", description: "Convierte scripts (Py/TS/Go) en workflows y UIs internas; motor de ejecución rápido.", license: "AGPL-3.0", url: "https://github.com/windmill-labs/windmill", oss: true, maintained: true, tags: ["scripts", "workflow", "internal-tools"] },
  { id: "browser-use", name: "Browser Use", category: "automation", description: "Agente que controla un navegador real para automatizar tareas web por instrucciones.", license: "MIT", url: "https://github.com/browser-use/browser-use", oss: true, maintained: true, defaultIntegrated: true, tags: ["browser-agent", "rpa"] },

  // 11 · Crawling / scraping / ETL para IA
  { id: "crawl4ai", name: "Crawl4AI", category: "data-ingest", description: "Crawler/scraper open source orientado a LLM: salida en Markdown lista para RAG.", license: "Apache-2.0", url: "https://github.com/unclecode/crawl4ai", oss: true, maintained: true, defaultIntegrated: true, tags: ["crawler", "markdown", "rag"] },
  { id: "firecrawl", name: "Firecrawl", category: "data-ingest", description: "Convierte sitios web enteros en Markdown/datos estructurados para IA vía API.", license: "AGPL-3.0 (SDKs MIT)", url: "https://github.com/mendableai/firecrawl", oss: true, maintained: true, tags: ["crawler", "scrape", "api"] },
  { id: "docling", name: "Docling", category: "data-ingest", description: "Toolkit IBM para convertir documentos (PDF/DOCX/PPTX…) a formato listo para gen-AI.", license: "MIT", url: "https://github.com/docling-project/docling", oss: true, maintained: true, defaultIntegrated: true, tags: ["documents", "parsing", "rag"] },
  { id: "apache-tika", name: "Apache Tika", category: "data-ingest", description: "Detección y extracción de texto/metadatos de miles de formatos de fichero.", license: "Apache-2.0", url: "https://github.com/apache/tika", oss: true, maintained: true, tags: ["extraction", "metadata"] },

  // 12 · Backend / BaaS / base de datos
  { id: "supabase", name: "Supabase", category: "backend", description: "Backend open source (alternativa a Firebase): Postgres, Auth, Storage, Realtime y pgvector.", license: "Apache-2.0", url: "https://github.com/supabase/supabase", oss: true, maintained: true, defaultIntegrated: true, tags: ["postgres", "auth", "realtime"] },
  { id: "appwrite", name: "Appwrite", category: "backend", description: "Plataforma backend self-host: bases de datos, auth, storage, funciones y SDKs multi-lenguaje.", license: "BSD-3-Clause", url: "https://github.com/appwrite/appwrite", oss: true, maintained: true, tags: ["baas", "auth", "functions"] },
  { id: "pocketbase", name: "PocketBase", category: "backend", description: "Backend en un solo binario (Go + SQLite): base de datos, auth, ficheros y realtime.", license: "MIT", url: "https://github.com/pocketbase/pocketbase", oss: true, maintained: true, tags: ["baas", "sqlite", "single-binary"] },
  { id: "nhost", name: "Nhost", category: "backend", description: "Backend open source sobre PostgreSQL + Hasura: GraphQL, auth, storage y funciones.", license: "MIT", url: "https://github.com/nhost/nhost", oss: true, maintained: true, tags: ["baas", "graphql", "postgres"] },

  // 13 · Self-host / despliegue / PaaS
  { id: "coolify", name: "Coolify", category: "devops", description: "PaaS self-host (alternativa a Vercel/Heroku/Netlify): despliega apps, BD y 280+ servicios.", license: "Apache-2.0", url: "https://github.com/coollabsio/coolify", oss: true, maintained: true, defaultIntegrated: true, tags: ["paas", "self-host", "deploy"] },
  { id: "dokploy", name: "Dokploy", category: "devops", description: "PaaS ligero self-host sobre Docker (Compose + Swarm) para desplegar apps y bases de datos.", license: "Apache-2.0", url: "https://github.com/Dokploy/dokploy", oss: true, maintained: true, tags: ["paas", "docker", "deploy"] },
  { id: "caprover", name: "CapRover", category: "devops", description: "Gestor de despliegue de apps/BD y servidor web (Docker + nginx + Let's Encrypt).", license: "Apache-2.0", url: "https://github.com/caprover/caprover", oss: true, maintained: true, tags: ["paas", "docker", "deploy"] },

  // 14 · Servidores caseros · voz neural · memoria de agentes · seguridad · mapas
  //      (jul 2026 · SOP centro-creacion-sync-permisos.md §6b/§10/§13/§14)
  { id: "casaos", name: "CasaOS", category: "devops", description: "Sistema de nube personal (Go + Docker) que convierte cualquier equipo en un servidor casero con panel web y App Store de apps Docker: la base de las neuronas-servidor de StarSeed (se instala EN el dispositivo con un comando).", license: "Apache-2.0", url: "https://github.com/IceWhaleTech/CasaOS", oss: true, maintained: true, tags: ["servidor-casero", "docker", "app-store", "neuronas", "self-host"] },
  { id: "bark", name: "Bark", category: "runtime", description: "TTS generativo expresivo de Suno (texto→audio con tonos, risas y música): motor de voz neural para Aurora, servido por endpoint desde una neurona propia o CasaOS.", license: "MIT", url: "https://github.com/suno-ai/bark", oss: true, maintained: true, tags: ["voz", "tts", "generativo", "audio"] },
  { id: "gpt-sovits", name: "GPT-SoVITS", category: "runtime", description: "Clonación de voz few-shot (bastan ~5 s de muestra) + TTS multilingüe con WebUI: permite dar a Aurora una voz propia; servidor Python conectable por endpoint, simbiótico con Bark (puede clonar la voz que Bark genera).", license: "MIT", url: "https://github.com/RVC-Boss/GPT-SoVITS", oss: true, maintained: true, tags: ["voz", "tts", "clonacion", "few-shot"] },
  { id: "omnivoice", name: "OmniVoice", category: "runtime", description: "Motor de voz neural multilingüe del ecosistema k2-fsa (Next-gen Kaldi): síntesis servida por endpoint, complementario a Bark y GPT-SoVITS en la cadena de voz gratis-primero de Aurora.", license: "Apache-2.0", url: "https://github.com/k2-fsa/OmniVoice", oss: true, maintained: true, tags: ["voz", "tts", "multilingue", "k2-fsa"] },
  { id: "raven", name: "Raven", category: "vector-memory", description: "Backend de memoria e inteligencia para agentes (EverMind): guarda y recupera recuerdos de largo plazo; adaptador OPCIONAL para los cerebros de Aurora/Astraura vía endpoint por neurona (misma pauta de conector que CasaOS).", license: "Código abierto (ver repo)", url: "https://github.com/EverMind-AI/Raven", oss: true, maintained: true, tags: ["memoria", "agentes", "backend", "cerebros"] },
  { id: "skales", name: "Skales", category: "vector-memory", description: "Adaptador/backend de memoria e inteligencia para agentes: capa opcional que un cerebro de Aurora/Astraura puede usar como fuente de memoria conectándose por endpoint desde una neurona.", license: "Código abierto (ver repo)", url: "https://github.com/skalesapp/skales", oss: true, maintained: true, tags: ["memoria", "inteligencia", "backend", "cerebros"] },
  { id: "mouzi", name: "Mouzi", category: "automation", description: "Organizador inteligente de archivos: clasifica por tipo, tema y fecha con IA y propone estructura de carpetas; inspiración de la acción «Organizar inteligentemente» de biblioteca, cerebros y escritorios de StarSeed.", license: "Código abierto (ver repo)", url: "https://github.com/hsr88/mouzi", oss: true, maintained: true, tags: ["organizador", "archivos", "clasificacion", "ia"] },
  { id: "strix", name: "Strix", category: "agent-framework", description: "Agentes autónomos de seguridad ofensiva (pentesting/AppSec) que encuentran y VALIDAN vulnerabilidades reales: suite avanzada de seguridad para auditar neuronas, servidores caseros y despliegues propios.", license: "Apache-2.0", url: "https://github.com/usestrix/strix", oss: true, maintained: true, tags: ["seguridad", "pentesting", "agentes", "appsec"] },
  { id: "organicmaps", name: "Organic Maps", category: "app-platform", description: "Mapas offline nativos (Android/iOS/escritorio) basados en OpenStreetMap, sin rastreo ni anuncios: la misma filosofía de datos abiertos que el Mapa del Hub de Conexiones.", license: "Apache-2.0", url: "https://github.com/organicmaps/organicmaps", oss: true, maintained: true, tags: ["mapas", "osm", "offline", "privacidad"] },
  { id: "omniroute", name: "OmniRoute", category: "runtime", description: "Enrutador/gateway de LLMs multi-proveedor (formato OpenAI): dirige cada petición a la mejor fuente disponible con failover; patrón del ruteo inteligente gratis-primero de Astraura.", license: "Código abierto (ver repo)", url: "https://github.com/diegosouzapw/OmniRoute", oss: true, maintained: true, tags: ["gateway", "enrutado", "openai-compat", "failover"] },
];

OSS_LIBRARY.push(...OSS_LIBRARY_EXT);

// ── Helpers ──
export function getLibrary(): OssOption[] { return OSS_LIBRARY; }
export function getByCategory(cat: OssCategory): OssOption[] { return OSS_LIBRARY.filter((o) => o.category === cat); }
export function getMoaFrameworks(): OssOption[] { return OSS_LIBRARY.filter((o) => o.category === "moa"); }
export function findOption(id: string): OssOption | undefined { return OSS_LIBRARY.find((o) => o.id === id); }
