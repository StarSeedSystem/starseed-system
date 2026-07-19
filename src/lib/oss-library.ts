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
  | "voice"           // Motores de VOZ (TTS/clonación) — la voz de Aurora
  | "agent-framework" // Frameworks de agentes / RAG
  | "vector-memory"   // Almacenes vectoriales / memoria
  | "agent-memory"    // Sistemas de MEMORIA DE AGENTES (extracción, grafos, capas, archivos)
  | "chat-channel"    // Plataformas de chat / canales self-host
  | "storage"         // Almacenamiento / sync soberano
  | "plugin-standard" // Estándares de interoperabilidad de tools/plugins
  | "app-platform"    // Apps y plataformas IA self-host (LLMOps, UIs, agentes-app)
  | "automation"      // Automatización / workflows / RPA
  | "data-ingest"     // Crawling / scraping / ETL para IA
  | "backend"         // Backend / BaaS / base de datos
  | "devops"          // Self-host / despliegue / PaaS
  // ── Adenda 67 · P4 (jul-2026) ──
  | "search"          // Motores de BÚSQUEDA self-host (Typesense…)
  | "creation";       // Diseño, lienzos, pizarras y edición de vídeo (Penpot, OpenCut…)

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
  "voice":           { label: "Voz (TTS y clonación)",   emoji: "🗣️", hint: "Motores con los que habla Aurora. Se conectan por endpoint desde una neurona propia; si uno falla, la cadena sigue y Aurora nunca se queda muda." },
  "agent-framework": { label: "Frameworks de agentes",   emoji: "🛠️", hint: "Orquestación de agentes y RAG." },
  "vector-memory":   { label: "Memoria / vectores",      emoji: "📚", hint: "Bases vectoriales para memorias y baúles." },
  "agent-memory":    { label: "Memoria de agentes",      emoji: "🧠", hint: "Sistemas de memoria para agentes: extracción de hechos, grafos temporales, capas y memoria-como-archivos. Encajan como fuente de un cerebro o detrás de un memory_root." },
  "chat-channel":    { label: "Canales de chat",         emoji: "💬", hint: "Plataformas y APIs de chat self-host." },
  "storage":         { label: "Almacenamiento soberano", emoji: "🗄️", hint: "Object storage y sync descentralizado." },
  "plugin-standard": { label: "Plugins / tools",         emoji: "🔌", hint: "Estándares para conectar herramientas y datos." },
  "app-platform":    { label: "Apps y plataformas IA",   emoji: "🚀", hint: "Apps y plataformas IA self-host (LLMOps, UIs, agentes-app)." },
  "automation":      { label: "Automatización",          emoji: "🔁", hint: "Automatización, workflows y RPA self-host." },
  "data-ingest":     { label: "Ingesta de datos",        emoji: "🕷️", hint: "Crawling, scraping y ETL para IA." },
  "backend":         { label: "Backend / BaaS",          emoji: "🧱", hint: "Backend, BaaS y bases de datos soberanas." },
  "devops":          { label: "Despliegue / PaaS",       emoji: "📦", hint: "Self-host, despliegue y PaaS." },
  "search":          { label: "Búsqueda",                emoji: "🔎", hint: "Motores de búsqueda self-host. Si conectas uno, el OS lo usa; si no, sigue buscando con Supabase — nunca te quedas sin búsqueda." },
  "creation":        { label: "Creación y diseño",       emoji: "🎨", hint: "Lienzos, pizarras, diseño y edición de vídeo de código abierto. Se abren desde el OS y su resultado se publica en el Lienzo Universal." },
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
  /* ══ VOZ (Adenda 67 · P2) ══════════════════════════════════════════════════
   * Los motores con los que HABLA Aurora. Orden = realismo (el registro vivo está
   * en src/lib/aurora/tts-oss/engine-registry.ts, que además elige solo el mejor
   * disponible y encadena el resto como respaldo). Todos gratis y OSS.
   * Nota honesta: bark/gpt-sovits/omnivoice estaban catalogados como "runtime";
   * se mueven aquí, que es su sitio (no son runtimes de LLM). */
  { id: "voxcpm", name: "VoxCPM (OpenBMB)", category: "voice", description: "MOTOR DE VOZ PRINCIPAL de Aurora. TTS tokenizer-free (difusión autoregresiva) de OpenBMB: 30 idiomas, audio de 48 kHz y lo que lo hace único — DISEÑO DE VOZ por descripción en lenguaje natural («mujer joven, voz cálida y serena») sin necesidad de audio de referencia, más clonación controlable a partir de una muestra. Es el más realista y expresivo del catálogo: en cuanto tiene endpoint, Aurora lo usa sola. Se sirve con vLLM-Omni (API OpenAI-compatible), Nano-vLLM o su demo Gradio, en una neurona con GPU.", license: "Apache-2.0", url: "https://github.com/OpenBMB/VoxCPM", oss: true, maintained: true, defaultIntegrated: true, tags: ["voz", "tts", "clonacion", "diseño-de-voz", "multilingue", "principal", "48khz"] },
  { id: "voicebox", name: "Voicebox", category: "voice", description: "Estudio de voz local de código abierto (alternativa a ElevenLabs + WisprFlow): clona voces desde unos segundos de audio, 7 motores TTS dentro (Qwen3-TTS, Chatterbox, LuxTTS, Kokoro…), 23 idiomas, dictado global y servidor MCP. HONESTIDAD: es una APP DE ESCRITORIO (Tauri), no un servicio web — pero expone una API REST real en 127.0.0.1:17493, así que Aurora SÍ puede hablar con ella: usa `POST /generate/stream` (devuelve WAV). Requiere tener la app abierta, un perfil de voz creado (profile_id) y arrancarla con VOICEBOX_CORS_ORIGINS para que el navegador pueda llamarla.", license: "MIT", url: "https://github.com/jamiepine/voicebox", oss: true, maintained: true, tags: ["voz", "tts", "clonacion", "escritorio", "dictado", "mcp", "estudio"] },
  { id: "kokoro-tts", name: "Kokoro TTS", category: "voice", description: "Voz local de 82M parámetros que corre 100% DENTRO del navegador (ONNX/WASM/WebGPU): sin servidor, sin enviar tu texto a ninguna parte y offline tras la primera descarga (~80 MB). Es la red de seguridad de la cadena de voz: cuando un motor por endpoint falla, Kokoro recoge el turno antes de bajar a la voz del sistema. Voces en español (ef_dora…).", license: "Apache-2.0", url: "https://github.com/hexgrad/kokoro", oss: true, maintained: true, defaultIntegrated: true, tags: ["voz", "tts", "local", "navegador", "offline", "onnx"] },
  { id: "gpt-sovits", name: "GPT-SoVITS", category: "voice", description: "Clonación de voz few-shot (bastan ~5 s de muestra) + TTS multilingüe con WebUI: permite dar a Aurora una voz propia; servidor Python conectable por endpoint, simbiótico con Bark (puede clonar la voz que Bark genera).", license: "MIT", url: "https://github.com/RVC-Boss/GPT-SoVITS", oss: true, maintained: true, tags: ["voz", "tts", "clonacion", "few-shot"] },
  { id: "bark", name: "Bark", category: "voice", description: "TTS generativo expresivo de Suno (texto→audio con tonos, risas y música): motor de voz neural para Aurora, servido por endpoint desde una neurona propia o CasaOS.", license: "MIT", url: "https://github.com/suno-ai/bark", oss: true, maintained: true, tags: ["voz", "tts", "generativo", "audio"] },
  { id: "omnivoice", name: "OmniVoice", category: "voice", description: "Motor de voz neural multilingüe del ecosistema k2-fsa (Next-gen Kaldi): síntesis servida por endpoint, complementario a Bark y GPT-SoVITS en la cadena de voz gratis-primero de Aurora.", license: "Apache-2.0", url: "https://github.com/k2-fsa/OmniVoice", oss: true, maintained: true, tags: ["voz", "tts", "multilingue", "k2-fsa"] },
  { id: "raven", name: "Raven", category: "vector-memory", description: "Backend de memoria e inteligencia para agentes (EverMind): guarda y recupera recuerdos de largo plazo; adaptador OPCIONAL para los cerebros de Aurora/Astraura vía endpoint por neurona (misma pauta de conector que CasaOS).", license: "Código abierto (ver repo)", url: "https://github.com/EverMind-AI/Raven", oss: true, maintained: true, tags: ["memoria", "agentes", "backend", "cerebros"] },
  { id: "skales", name: "Skales", category: "vector-memory", description: "Adaptador/backend de memoria e inteligencia para agentes: capa opcional que un cerebro de Aurora/Astraura puede usar como fuente de memoria conectándose por endpoint desde una neurona.", license: "Código abierto (ver repo)", url: "https://github.com/skalesapp/skales", oss: true, maintained: true, tags: ["memoria", "inteligencia", "backend", "cerebros"] },
  { id: "mouzi", name: "Mouzi", category: "automation", description: "Organizador inteligente de archivos: clasifica por tipo, tema y fecha con IA y propone estructura de folders; inspiración de la acción «Organizar inteligentemente» de biblioteca, cerebros y escritorios de StarSeed.", license: "Código abierto (ver repo)", url: "https://github.com/hsr88/mouzi", oss: true, maintained: true, tags: ["organizador", "archivos", "clasificacion", "ia"] },
  { id: "strix", name: "Strix", category: "agent-framework", description: "Agentes autónomos de seguridad ofensiva (pentesting/AppSec) que encuentran y VALIDAN vulnerabilidades reales: suite avanzada de seguridad para auditar neuronas, servidores caseros y despliegues propios.", license: "Apache-2.0", url: "https://github.com/usestrix/strix", oss: true, maintained: true, tags: ["seguridad", "pentesting", "agentes", "appsec"] },
  { id: "organicmaps", name: "Organic Maps", category: "app-platform", description: "Mapas offline nativos (Android/iOS/escritorio) basados en OpenStreetMap, sin rastreo ni anuncios: la misma filosofía de datos abiertos que el Mapa del Hub de Conexiones.", license: "Apache-2.0", url: "https://github.com/organicmaps/organicmaps", oss: true, maintained: true, tags: ["mapas", "osm", "offline", "privacidad"] },
  { id: "omniroute", name: "OmniRoute", category: "runtime", description: "Enrutador/gateway de LLMs multi-proveedor (formato OpenAI): dirige cada petición a la mejor fuente disponible con failover; patrón del ruteo inteligente gratis-primero de Astraura.", license: "Código abierto (ver repo)", url: "https://github.com/diegosouzapw/OmniRoute", oss: true, maintained: true, tags: ["gateway", "enrutado", "openai-compat", "failover"] },

  /* ══ 15 · ADENDA 67 · P4 (jul-2026) ═══════════════════════════════════════
   * Nueve repos nuevos. Cada descripción declara EN LA PROPIA FICHA qué es
   * REALMENTE cada uno y cuál es su ESTADO en el OS:
   *   FUNCIONAL  → el OS lo ejecuta de verdad (llm-council).
   *   CONECTOR   → servidor que TÚ levantas y el OS llama (Typesense, Postiz,
   *                TencentDB Memory, Databasement, OpenManus*).
   *   CATÁLOGO   → sin API que el OS pueda usar; enlace/lanzador (Penpot,
   *                OpenCut, MemPalace*).
   * (*) los asteriscos van explicados en su propia descripción, sin eufemismos.
   */

  // ── P4-1 · OpenManus (habilidades y capacidades de Aurora) ──
  { id: "openmanus", name: "OpenManus", category: "agent-framework", description: "Framework de agentes generales de código abierto (MIT, del equipo de MetaGPT): un agente que planifica, navega con un navegador real, ejecuta código Python y encadena pasos hasta terminar una tarea compleja. También trae un modo multi-agente (run_flow) y un servidor MCP. ESTADO EN EL OS: CONECTOR EXPERIMENTAL — Aurora puede DELEGARLE tareas complejas si lo tienes corriendo. HONESTIDAD: su repo NO expone API HTTP (es CLI + MCP), así que tienes que exponerlo tú en tu neurona (su MCP en modo SSE, o un envoltorio que acepte POST {task}) y declarar la ruta en Ajustes → Integraciones → OpenManus. Sin eso, Aurora sigue funcionando igual: no delega y no miente diciendo que lo hizo.", license: "MIT", url: "https://github.com/FoundationAgents/OpenManus", oss: true, maintained: true, tags: ["agentes", "python", "delegacion", "mcp", "navegador", "experimental"] },

  // ── P4-2 · Penpot (lienzo, pizarras, entornos de edición) ──
  { id: "penpot", name: "Penpot", category: "creation", description: "La plataforma de DISEÑO de código abierto (MPL-2.0): lienzos, pizarras, componentes, prototipos e inspección de código — la alternativa soberana a Figma, con estándares web (SVG) y sin encierro de datos. ESTADO EN EL OS: CONECTOR POR INSTANCIA + BLOQUE DE PUBLICACIÓN — declara tu instancia (la oficial design.penpot.app o la tuya propia) y publica cualquier diseño en el Lienzo Universal con el bloque «Diseño Penpot» (usa su enlace de vista compartida). HONESTIDAD: design.penpot.app manda «X-Frame-Options: SAMEORIGIN» (comprobado), así que NO se puede incrustar dentro del OS: el bloque muestra una tarjeta con enlace, que sí funciona. En una instancia propia que lo permita, la incrustación se activa sola.", license: "MPL-2.0", url: "https://github.com/penpot/penpot", oss: true, maintained: true, defaultIntegrated: true, tags: ["diseño", "lienzo", "pizarra", "prototipo", "self-host", "figma-alternativa"] },

  // ── P4-3 · OpenCut (edición de vídeo) ──
  { id: "opencut", name: "OpenCut", category: "creation", description: "Editor de VÍDEO de código abierto (MIT) que corre en el navegador — la alternativa libre a CapCut. Los ficheros no salen de tu equipo. Su instancia pública (opencut.app, versión «classic») está en vivo y es gratis; también puedes auto-hospedarlo. ESTADO EN EL OS: LANZADOR + BLOQUE DE PUBLICACIÓN «Vídeo» — el OS te lleva al editor y reproduce de verdad el vídeo que exportes. HONESTIDAD: OpenCut NO tiene API todavía; su «Editor API», su modo headless y su servidor MCP están anunciados como FUTUROS en su propio README, así que el OS no puede editar por ti ni recuperar tu montaje automáticamente. Cuando publiquen esa API, este catálogo se actualizará solo (releases de GitHub).", license: "MIT", url: "https://github.com/opencut-app/opencut", oss: true, maintained: true, defaultIntegrated: true, tags: ["video", "edicion", "navegador", "capcut-alternativa", "creacion"] },

  // ── Adenda 68 · E · Audiomorphic (PORTADO al OS: no es un enlace, es código) ──
  { id: "audiomorphic", name: "Audiomorphic", category: "creation", description: "Visualizador de consciencia del propio ecosistema StarSeed: traduce el sonido en GEOMETRÍA VIVA — una espiral fractal (Zn+1 = Zn·k·e^iψ) gobernada por el «Tratado de Unificación Armónica». ESTADO EN EL OS: **PORTADO ENTERO Y DESBLOQUEADO, NO ES UN ENLACE** (Adenda 69·K). Su motor corre nativo dentro del OS (src/lib/audiomorphic/) en dos superficies: la APP COMPLETA en /audiomorphic y una CAPA DE FONDO con TRANSPARENCIA REAL (canvas con alfa), ambas con el MISMO menú de ajustes completo: 3 pilotos (Deriva · Armónico · Génesis), 11 modos de aleatorización (Inteligente · DJ · Sagrado · Rítmico · Arcoíris · Astral…), autorregeneración avanzada, bloqueo por parámetro, LAS 20 GEOMETRÍAS SAGRADAS (Metatrón, Merkaba, Sri Yantra, Cimática, Sólidos Platónicos, Árbol de la Vida, Chakras, Om, Loto, Dharma Chakra, 3 mandalas…) como capa propia Y como perturbación de la espiral, color armónico, 6 modos de fondo, presets ilimitados. SIN LOGIN, SIN PLANES, SIN TOUR: en la app original los planes SÍ bloqueaban de verdad la mitad de esto. HONESTIDAD: el modo VR/AR NO está portado — su motor (@react-three/xr v6 + R3F v9 + postprocessing v3) exige React 19 y el OS va con React 18 + R3F v8; para VR/AR se abre la app original.", license: "Repo del propio usuario (alexbordongarrigos)", url: "https://github.com/alexbordongarrigos/audiomorphic-ar", oss: true, maintained: true, defaultIntegrated: true, tags: ["visualizador", "audio", "geometria-sagrada", "fondo", "portado", "nativo", "starseed"] },

  // ── P4-4 · llm-council → «Aurora política» (¡esto sí se EJECUTA!) ──
  { id: "llm-council", name: "LLM Council (Aurora política)", category: "moa", description: "El patrón de deliberación multi-modelo de Andrej Karpathy: la misma pregunta va a VARIOS modelos por separado; luego cada uno lee las respuestas de los demás ANONIMIZADAS y las evalúa; y por último un modelo «Chairman» sintetiza una respuesta final. ESTADO EN EL OS: **IMPLEMENTADO Y FUNCIONAL** — es el CONSEJO DE AURORA del Área Política (src/lib/aurora/council.ts). No hay servidor que instalar ni clave que pagar: se ejecuta con el router gratis-primero de Astraura. Nuestra variación: los consejeros no son modelos rivales sino los cinco FUNDAMENTOS StarSeed (ontocrático · ecológico · abundancia · simbiótico · empático), y cada dictamen cita el fundamento en que se apoya. Si solo hay una fuente de inteligencia disponible, el informe lo dice («fuente única») en vez de fingir pluralidad.", license: "Sin licencia declarada (código de referencia)", url: "https://github.com/karpathy/llm-council", oss: true, maintained: false, moaNative: true, defaultIntegrated: true, tags: ["multi-modelo", "deliberacion", "politica", "consejo", "sintesis", "implementado"] },

  // ── P4-5 · Typesense (búsqueda) ──
  { id: "typesense", name: "Typesense", category: "search", description: "Motor de BÚSQUEDA de código abierto (GPL-3.0, C++): instantáneo, en memoria y tolerante a erratas — la alternativa libre a Algolia y una versión mucho más fácil de Elasticsearch. ESTADO EN EL OS: CONECTOR POR ENDPOINT CON FALLBACK — si lo levantas en tu neurona y lo activas, la búsqueda de personas y grupos del OS (Hub, Cultura) pasa a usarlo, con relevancia y tolerancia a erratas; si NO lo tienes, o si se cae, o si su índice está vacío, la búsqueda cae SOLA a la de siempre (Supabase) sin que notes nada. Es una mejora, nunca un requisito. Usa siempre una clave de SOLO BÚSQUEDA en el OS, jamás la admin key.", license: "GPL-3.0", url: "https://github.com/typesense/typesense", oss: true, maintained: true, defaultIntegrated: true, tags: ["busqueda", "algolia-alternativa", "tolerante-erratas", "self-host", "fallback"] },

  // ── P4-6 · Memoria de agentes ──
  { id: "mempalace", name: "MemPalace", category: "vector-memory", description: "Memoria de IA local-first (MIT) que guarda las conversaciones LITERALMENTE (no resume ni parafrasea) y las recupera con búsqueda semántica, organizadas como un palacio de la memoria: personas y proyectos son «alas», los temas «habitaciones» y el contenido original vive en «cajones». Backend por defecto ChromaDB (también Milvus, Qdrant, pgvector). Nada sale de tu máquina. ESTADO EN EL OS: CATÁLOGO + FUENTE DE MEMORIA DECLARABLE — HONESTIDAD DURA: MemPalace NO expone API HTTP; su servidor MCP habla JSON-RPC **por stdio** (lo dice su propio docker-compose), así que el OS, desde el navegador, NO puede sincronizar con él. Lo declaras como fuente de memoria del cerebro para que Aurora sepa que tu memoria vive ahí y te guíe con sus comandos; la lectura/escritura real la hace tu agente local por MCP. Si montas un puente HTTP tú mismo, pega su URL y entonces sí sincroniza.", license: "MIT", url: "https://github.com/mempalace/mempalace", oss: true, maintained: true, tags: ["memoria", "local-first", "mcp", "chromadb", "verbatim", "cli"] },
  { id: "tencentdb-agent-memory", name: "TencentDB Agent Memory", category: "vector-memory", description: "Memoria para agentes en dos frentes: (1) memoria SIMBÓLICA de corto plazo que condensa los logs de herramientas en un lienzo Mermaid compacto (mide hasta −61 % de tokens), y (2) memoria LARGA POR CAPAS que destila la conversación en una pirámide L0 conversación → L1 átomo → L2 escena → L3 persona, en vez de un montón plano de vectores. 100 % local por defecto (SQLite + sqlite-vec), sin APIs externas. ESTADO EN EL OS: CONECTOR REAL POR ENDPOINT — trae un Gateway HTTP propio (/recall · /capture · /search/memories · /session/end, leído en su código fuente): levántalo en tu neurona (Docker, puerto 8420), autoriza el origen del OS en su CORS y ya es una fuente de memoria viva para tus cerebros.", license: "MIT", url: "https://github.com/TencentCloud/TencentDB-Agent-Memory", oss: true, maintained: true, tags: ["memoria", "capas", "simbolica", "mermaid", "gateway", "local", "cerebros"] },

  // ── P4-7 · Databasement ──
  { id: "databasement", name: "Databasement", category: "backend", description: "Gestor auto-hospedado de COPIAS DE SEGURIDAD de bases de datos, con panel web (MIT, Laravel): programa y ejecuta backups de MySQL, PostgreSQL, MariaDB, SQL Server, MongoDB, SQLite, Firebird y Redis hacia S3, SFTP, FTP o disco local; retención GFS, cifrado AES-256, túnel SSH, agentes remotos para redes cerradas y restauración cruzada entre servidores. ESTADO EN EL OS: CONECTOR REAL POR ENDPOINT (API /api/v1 con token Sanctum) — se declara como SERVIDOR DE RESPALDO de una cuenta, un cerebro o un perfil. ⚠️ HONESTIDAD: NO es «una base de datos para cada cuenta»: no provisiona bases de datos nuevas. Es quien las RESPALDA — que, para soberanía de datos, es exactamente la pieza que faltaba.", license: "MIT", url: "https://github.com/David-Crty/databasement", oss: true, maintained: true, tags: ["respaldo", "backup", "bases-de-datos", "s3", "sftp", "soberania", "self-host"] },

  // ── P4-8 · Postiz ──
  { id: "postiz", name: "Postiz", category: "automation", description: "Gestor de publicación y programación en REDES SOCIALES de código abierto (AGPL-3.0): ~32 plataformas (X, LinkedIn, Instagram, Facebook, Threads, Mastodon, Bluesky, Telegram, Discord, Reddit, YouTube, TikTok, Pinterest, Medium, Dev.to, WordPress…), con calendario, equipos y API pública. Es la alternativa libre a Buffer/Hypefury. ESTADO EN EL OS: CONECTOR REAL POR ENDPOINT (API pública verificada) — aparece en el Hub de Conexiones y añade al Lienzo Universal la acción «Publicar también en redes». ⚠️ REGLA DEL OS: publicar fuera de StarSeed es IRREVERSIBLE y toca cuentas de terceros → NUNCA es automático. Publicar en la red StarSeed jamás dispara Postiz: el crosspost es un acto separado, con los canales y el texto exactos a la vista y una confirmación explícita tuya. Aurora puede redactar el texto; pulsar el botón, no.", license: "AGPL-3.0", url: "https://github.com/gitroomhq/postiz-app", oss: true, maintained: true, defaultIntegrated: true, tags: ["redes-sociales", "publicacion", "programacion", "buffer-alternativa", "self-host", "confirmacion-explicita"] },

  /* ══ 16 · MEMORIA DE AGENTES (Adenda I2 · jul-2026) ═══════════════════════
   * Sistemas de memoria de largo plazo para agentes. A diferencia de la
   * categoría «vector-memory» (que son ALMACENES de vectores), estos son CAPAS
   * DE MEMORIA COMPLETAS: extraen hechos, construyen grafos, destilan por capas
   * o guardan la memoria como archivos. En StarSeed encajan en dos sitios:
   *   · como FUENTE de un cerebro (endpoint/servidor conectado por neurona), o
   *   · detrás de un MEMORY_ROOT (carpeta de .md portátil), cuando el sistema
   *     es memoria-como-archivos (memU) o local de un solo binario (supermemory).
   * Ninguno es nativo del MoA ni se integra por defecto: son OPCIONALES y el
   * usuario los conecta en su propia neurona. */
  { id: "mem0", name: "Mem0", category: "agent-memory", description: "Capa de memoria para agentes que EXTRAE hechos automáticamente de cada conversación y los guarda en un modelo híbrido (vector + grafo + clave-valor), recuperando solo lo relevante. En StarSeed: fuente de memoria de un cerebro — encaja de forma natural sobre pgvector/Supabase que ya usa el OS, así que un cerebro puede delegarle el «recordar» sin montar otra base de datos.", license: "Apache-2.0", url: "https://github.com/mem0ai/mem0", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "extraccion-de-hechos", "vector+grafo", "pgvector", "supabase", "cerebros"] },
  { id: "letta", name: "Letta (MemGPT)", category: "agent-memory", description: "Servidor de agentes con estado y memoria POR NIVELES (el patrón MemGPT): memoria de contexto (núcleo), memoria de archivo (recall) y memoria externa, con auto-edición del propio agente. En StarSeed: fuente de memoria de un cerebro por endpoint (levántalo en una neurona) — aporta el «cerebro que recuerda entre sesiones» y se paginan los recuerdos como hace su jerarquía de memoria.", license: "Apache-2.0", url: "https://github.com/letta-ai/letta", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "memgpt", "por-niveles", "agente-con-estado", "cerebros"] },
  { id: "graphiti", name: "Zep · Graphiti", category: "agent-memory", description: "Motor de GRAFO DE CONOCIMIENTO TEMPORAL para memoria de agentes (de Zep): cada hecho lleva marca de tiempo y se invalida cuando cambia, así que la memoria refleja el estado ACTUAL sin borrar la historia. En StarSeed: fuente de memoria de un cerebro que necesita razonar sobre cómo evolucionan las cosas (relaciones, decisiones, cargos) en el tiempo; se conecta por endpoint desde una neurona.", license: "Apache-2.0", url: "https://github.com/getzep/graphiti", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "grafo-temporal", "conocimiento", "zep", "bi-temporal", "cerebros"] },
  { id: "cognee", name: "Cognee", category: "agent-memory", description: "Pipeline ECL (Extract → Cognify → Load) que convierte tus documentos y notas en un GRAFO semántico + memoria vectorial con pocas líneas. En StarSeed: ideal detrás de un MEMORY_ROOT — toma los .md de una rama (soul/memory/dream…) y los «cognifica» en un grafo que el cerebro consulta; también sirve como fuente por endpoint.", license: "Apache-2.0", url: "https://github.com/topoteretes/cognee", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "ecl", "markdown-a-grafo", "memory-root", "rag", "cerebros"] },
  { id: "memu", name: "MemU", category: "agent-memory", description: "Framework de memoria que trata la memoria del agente como una CARPETA DE ARCHIVOS (folder-as-memory): organiza, enlaza y evoluciona notas en disco en vez de esconderlas en una base de datos opaca. En StarSeed: encaje PERFECTO con el memory_root — sus archivos SON el memory root portátil (raíz + ramas), legibles y versionables; un cerebro lo adopta como su carpeta de memoria.", license: "Apache-2.0", url: "https://github.com/NevaMind-AI/memU", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "memoria-como-archivos", "memory-root", "folder", "portable", "cerebros"] },
  { id: "supermemory", name: "Supermemory", category: "agent-memory", description: "Motor de memoria universal para IA en un BINARIO ÚNICO que corre local (Rust), sin dependencias pesadas: guarda, conecta y recupera recuerdos por API. En StarSeed: fuente de memoria local-first de un cerebro o respaldo de un memory_root — se levanta en una neurona/equipo del usuario y el OS lo llama por su endpoint; nada sale de tu máquina.", license: "MIT", url: "https://github.com/supermemoryai/supermemory", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "binario-unico", "local-first", "rust", "api", "cerebros"] },
  { id: "langmem", name: "LangMem", category: "agent-memory", description: "SDK de memoria de LangChain para agentes sobre LangGraph: memoria semántica, episódica y procedimental con extracción y consolidación en segundo plano. En StarSeed: encaja como fuente de memoria de un cerebro cuando ya se usa el patrón LangGraph — sus tres tipos de memoria mapean directo a la taxonomía cognitiva del OS (semántica · episódica · procedural).", license: "MIT", url: "https://github.com/langchain-ai/langmem", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "langgraph", "semantica", "episodica", "procedural", "cerebros"] },
  { id: "memary", name: "Memary", category: "agent-memory", description: "Memoria de agente autónomo construida sobre un GRAFO DE CONOCIMIENTO con TIPOS COGNITIVOS explícitos (memoria de entidades + de trabajo) que emula cómo recuerda un humano. En StarSeed: fuente de memoria de un cerebro alineada con la taxonomía cognitiva del OS (identidad · semántica · episódica · procedural…); se conecta por endpoint desde una neurona propia.", license: "MIT", url: "https://github.com/kingjulio8238/memary", oss: true, maintained: true, moaNative: false, defaultIntegrated: false, tags: ["memoria", "grafo-de-conocimiento", "tipos-cognitivos", "agente-autonomo", "cerebros"] },
];

OSS_LIBRARY.push(...OSS_LIBRARY_EXT);

// ── Helpers ──
export function getLibrary(): OssOption[] { return OSS_LIBRARY; }
export function getByCategory(cat: OssCategory): OssOption[] { return OSS_LIBRARY.filter((o) => o.category === cat); }
export function getMoaFrameworks(): OssOption[] { return OSS_LIBRARY.filter((o) => o.category === "moa"); }
export function findOption(id: string): OssOption | undefined { return OSS_LIBRARY.find((o) => o.id === id); }
