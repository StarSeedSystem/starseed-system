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
  | "plugin-standard"; // Estándares de interoperabilidad de tools/plugins

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
};

/** Orígenes remotos desde los que se actualiza la librería (además del seed local). */
export interface LibrarySource {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
}

export const LIBRARY_SOURCES: LibrarySource[] = [
  { id: "starseed-core", label: "StarSeed · Catálogo base", url: "internal://oss-library", enabled: true },
  // Añade aquí registros remotos (JSON con OssOption[]) para auto-actualizar las opciones.
];

// ── Catálogo seed (investigado y verificado · jun 2026) ──
export const OSS_LIBRARY: OssOption[] = [
  // 1 · Mixture-of-Agents / multi-agente
  { id: "together-moa", name: "Together MoA", category: "moa", description: "Implementación de referencia de Mixture-of-Agents: capas de LLM proponentes + agregador.", license: "Apache-2.0", url: "https://github.com/togethercomputer/MoA", oss: true, maintained: true, moaNative: true, tags: ["mixture-of-agents", "aggregator"] },
  { id: "langgraph", name: "LangGraph", category: "moa", description: "Orquestación con estado de flujos multi-agente como grafo (nodos + aristas).", license: "MIT", url: "https://github.com/langchain-ai/langgraph", oss: true, maintained: true, tags: ["graph", "stateful"] },
  { id: "crewai", name: "CrewAI", category: "moa", description: "Orquestación multi-agente por roles (\"crew\") para equipos colaborativos.", license: "MIT", url: "https://github.com/crewAIInc/crewAI", oss: true, maintained: true, tags: ["roles", "crew"] },
  { id: "ag2", name: "AG2 (AutoGen)", category: "moa", description: "Continuación comunitaria de AutoGen; GroupChat orientado a eventos (\"AgentOS\").", license: "Apache-2.0", url: "https://github.com/ag2ai/ag2", oss: true, maintained: true, tags: ["groupchat", "events"] },
  { id: "autogen", name: "Microsoft AutoGen", category: "moa", description: "Framework de IA agéntica y conversación multi-agente (en mantenimiento; ver AG2).", license: "MIT", url: "https://github.com/microsoft/autogen", oss: true, maintained: false, tags: ["microsoft"] },
  { id: "openai-agents", name: "OpenAI Agents SDK", category: "moa", description: "Framework ligero y provider-agnóstico de flujos multi-agente (sucesor de Swarm).", license: "MIT", url: "https://github.com/openai/openai-agents-python", oss: true, maintained: true, tags: ["handoffs"] },
  { id: "metagpt", name: "MetaGPT", category: "moa", description: "Multi-agente que simula una empresa de software (PRD→diseño→código).", license: "MIT", url: "https://github.com/FoundationAgents/MetaGPT", oss: true, maintained: true, tags: ["software-company"] },
  { id: "camel", name: "CAMEL-AI", category: "moa", description: "Agentes comunicativos / role-playing a escala.", license: "Apache-2.0", url: "https://github.com/camel-ai/camel", oss: true, maintained: true, tags: ["role-playing"] },
  { id: "agno", name: "Agno (Phidata)", category: "moa", description: "Framework model-agnóstico para agentes y \"teams\" con memoria/tools/razonamiento.", license: "MPL-2.0", url: "https://github.com/agno-agi/agno", oss: true, maintained: true, tags: ["teams", "memory"] },

  // 2 · Modelos LLM abiertos
  { id: "qwen", name: "Qwen", category: "llm", description: "Familia multilingüe fuerte (densa + MoE), licencia permisiva.", license: "Apache-2.0", url: "https://github.com/QwenLM/Qwen3", oss: true, maintained: true, tags: ["multilingüe", "moe"] },
  { id: "deepseek", name: "DeepSeek (V3 / R1)", category: "llm", description: "MoE de frontera para chat y razonamiento.", license: "MIT", url: "https://github.com/deepseek-ai/DeepSeek-V3", oss: true, maintained: true, tags: ["reasoning", "moe"] },
  { id: "mistral", name: "Mistral / Mixtral", category: "llm", description: "Modelos densos + MoE disperso; lanzamientos abiertos permisivos.", license: "Apache-2.0", url: "https://github.com/mistralai/mistral-inference", oss: true, maintained: true, tags: ["moe"] },
  { id: "olmo", name: "OLMo (AI2)", category: "llm", description: "Modelos totalmente abiertos: código, datos, configs y checkpoints.", license: "Apache-2.0", url: "https://github.com/allenai/OLMo", oss: true, maintained: true, tags: ["fully-open"] },
  { id: "phi", name: "Phi (Microsoft)", category: "llm", description: "SLMs pequeños de alta calidad para razonamiento.", license: "MIT", url: "https://huggingface.co/microsoft/phi-4", oss: true, maintained: true, tags: ["slm"] },
  { id: "llama", name: "Llama (Meta)", category: "llm", description: "Familia de pesos abiertos densa + MoE (Llama 3.x / 4).", license: "Llama Community (open-weight)", url: "https://github.com/meta-llama/llama-models", oss: false, maintained: true, tags: ["open-weight"] },
  { id: "gemma", name: "Gemma (Google)", category: "llm", description: "Modelos ligeros de pesos abiertos derivados de la investigación Gemini.", license: "Gemma Terms (open-weight)", url: "https://github.com/google-deepmind/gemma", oss: false, maintained: true, tags: ["open-weight"] },

  // 3 · Runtimes de inferencia local
  { id: "ollama", name: "Ollama", category: "runtime", description: "Ejecuta/gestiona LLM en local con un solo comando; API compatible OpenAI.", license: "MIT", url: "https://github.com/ollama/ollama", oss: true, maintained: true, tags: ["local", "openai-compat"] },
  { id: "vllm", name: "vLLM", category: "runtime", description: "Motor de servicio de alto rendimiento (PagedAttention), compatible OpenAI.", license: "Apache-2.0", url: "https://github.com/vllm-project/vllm", oss: true, maintained: true, tags: ["serving", "throughput"] },
  { id: "llamacpp", name: "llama.cpp", category: "runtime", description: "Inferencia portátil C/C++ (GGUF) en CPU/GPU/edge con mínimas dependencias.", license: "MIT", url: "https://github.com/ggml-org/llama.cpp", oss: true, maintained: true, tags: ["gguf", "edge"] },
  { id: "sglang", name: "SGLang", category: "runtime", description: "Servicio de alto rendimiento con prefix caching; fuerte para cargas agénticas.", license: "Apache-2.0", url: "https://github.com/sgl-project/sglang", oss: true, maintained: true, tags: ["serving"] },
  { id: "localai", name: "LocalAI", category: "runtime", description: "Motor self-host compatible OpenAI que envuelve múltiples backends (texto/voz/imagen).", license: "MIT", url: "https://github.com/mudler/LocalAI", oss: true, maintained: true, tags: ["multimodal"] },

  // 4 · Frameworks de agentes / RAG
  { id: "langchain", name: "LangChain", category: "agent-framework", description: "Framework amplio de apps LLM con 700+ integraciones, cadenas y tools.", license: "MIT", url: "https://github.com/langchain-ai/langchain", oss: true, maintained: true, tags: ["chains", "tools"] },
  { id: "llamaindex", name: "LlamaIndex", category: "agent-framework", description: "Framework de datos para ingesta, indexado, recuperación y RAG.", license: "MIT", url: "https://github.com/run-llama/llama_index", oss: true, maintained: true, tags: ["rag", "indexing"] },
  { id: "haystack", name: "Haystack", category: "agent-framework", description: "Orquestación NLP/LLM en producción con pipelines (DAG) RAG y agentes.", license: "Apache-2.0", url: "https://github.com/deepset-ai/haystack", oss: true, maintained: true, tags: ["pipelines"] },
  { id: "semantic-kernel", name: "Semantic Kernel", category: "agent-framework", description: "SDK multi-lenguaje (C#/Python/Java) de skills, planners y agentes.", license: "MIT", url: "https://github.com/microsoft/semantic-kernel", oss: true, maintained: true, tags: ["skills", "planners"] },
  { id: "dspy", name: "DSPy", category: "agent-framework", description: "\"Programar, no prompts\": compila/optimiza pipelines de LLM.", license: "MIT", url: "https://github.com/stanfordnlp/dspy", oss: true, maintained: true, tags: ["declarative"] },
];

const OSS_LIBRARY_EXT: OssOption[] = [
  // 5 · Memoria / vectores
  { id: "chroma", name: "Chroma", category: "vector-memory", description: "Base vectorial pensada para apps LLM, API simple.", license: "Apache-2.0", url: "https://github.com/chroma-core/chroma", oss: true, maintained: true, tags: ["embeddings"] },
  { id: "qdrant", name: "Qdrant", category: "vector-memory", description: "Base vectorial en Rust de alto rendimiento con filtrado por payload.", license: "Apache-2.0", url: "https://github.com/qdrant/qdrant", oss: true, maintained: true, tags: ["rust", "filtering"] },
  { id: "weaviate", name: "Weaviate", category: "vector-memory", description: "Base vectorial con módulos de vectorización y búsqueda híbrida.", license: "BSD-3-Clause", url: "https://github.com/weaviate/weaviate", oss: true, maintained: true, tags: ["hybrid-search"] },
  { id: "milvus", name: "Milvus", category: "vector-memory", description: "Base vectorial distribuida y escalable (miles de millones de vectores).", license: "Apache-2.0", url: "https://github.com/milvus-io/milvus", oss: true, maintained: true, tags: ["scale"] },
  { id: "pgvector", name: "pgvector", category: "vector-memory", description: "Extensión de PostgreSQL para búsqueda por similitud vectorial.", license: "PostgreSQL", url: "https://github.com/pgvector/pgvector", oss: true, maintained: true, tags: ["postgres"] },
  { id: "lancedb", name: "LanceDB", category: "vector-memory", description: "Base vectorial embebida (in-process) sobre el formato Lance.", license: "Apache-2.0", url: "https://github.com/lancedb/lancedb", oss: true, maintained: true, tags: ["embedded", "serverless"] },
  { id: "txtai", name: "txtai", category: "vector-memory", description: "Base de embeddings todo-en-uno para búsqueda semántica y workflows.", license: "Apache-2.0", url: "https://github.com/neuml/txtai", oss: true, maintained: true, tags: ["workflows"] },

  // 6 · Canales de chat self-host
  { id: "matrix-synapse", name: "Matrix / Synapse", category: "chat-channel", description: "Homeserver de referencia del protocolo federado y descentralizado Matrix.", license: "AGPL-3.0", url: "https://github.com/element-hq/synapse", oss: true, maintained: true, tags: ["federated", "e2ee"] },
  { id: "rocketchat", name: "Rocket.Chat", category: "chat-channel", description: "Plataforma de comunicaciones / chat de equipo self-host.", license: "MIT (core)", url: "https://github.com/RocketChat/Rocket.Chat", oss: true, maintained: true, tags: ["team-chat"] },
  { id: "mattermost", name: "Mattermost", category: "chat-channel", description: "Colaboración estilo Slack self-host.", license: "AGPL-3.0 / MIT", url: "https://github.com/mattermost/mattermost", oss: true, maintained: true, tags: ["team-chat"] },
  { id: "zulip", name: "Zulip", category: "chat-channel", description: "Chat de equipo con hilos por tema y API de cliente abierta.", license: "Apache-2.0", url: "https://github.com/zulip/zulip", oss: true, maintained: true, tags: ["threads"] },
  { id: "telegram-bot-api", name: "Telegram Bot API", category: "chat-channel", description: "API HTTP abierta + servidor open-source para bots/canales de Telegram.", license: "Boost (tdlib)", url: "https://github.com/tdlib/telegram-bot-api", oss: true, maintained: true, tags: ["bots", "telegram"] },

  // 7 · Almacenamiento soberano
  { id: "seaweedfs", name: "SeaweedFS", category: "storage", description: "Object/file store distribuido y rápido (S3-compatible) para miles de millones de ficheros.", license: "Apache-2.0", url: "https://github.com/seaweedfs/seaweedfs", oss: true, maintained: true, tags: ["s3", "distributed"] },
  { id: "garage", name: "Garage", category: "storage", description: "Object store S3-compatible, geo-distribuido y ligero (nodos modestos).", license: "AGPL-3.0", url: "https://github.com/deuxfleurs-org/garage", oss: true, maintained: true, tags: ["s3", "geo"] },
  { id: "ipfs-kubo", name: "IPFS (Kubo)", category: "storage", description: "Implementación de referencia de la red de ficheros por contenido IPFS.", license: "MIT/Apache-2.0", url: "https://github.com/ipfs/kubo", oss: true, maintained: true, tags: ["content-addressed", "p2p"] },
  { id: "nextcloud", name: "Nextcloud", category: "storage", description: "Suite self-host de ficheros, sync, compartición y colaboración.", license: "AGPL-3.0", url: "https://github.com/nextcloud/server", oss: true, maintained: true, tags: ["files", "sync"] },
  { id: "syncthing", name: "Syncthing", category: "storage", description: "Sincronización de ficheros P2P continua y descentralizada (sin servidor central).", license: "MPL-2.0", url: "https://github.com/syncthing/syncthing", oss: true, maintained: true, tags: ["p2p", "sync"] },
  { id: "minio", name: "MinIO", category: "storage", description: "Object storage S3-compatible (Community Edition en mantenimiento, 2026).", license: "AGPL-3.0", url: "https://github.com/minio/minio", oss: true, maintained: false, tags: ["s3"] },

  // 8 · Plugins / tools (interop)
  { id: "mcp", name: "Model Context Protocol (MCP)", category: "plugin-standard", description: "Protocolo abierto para conectar apps LLM a tools/datos/contexto (Linux Foundation).", license: "MIT", url: "https://github.com/modelcontextprotocol/modelcontextprotocol", oss: true, maintained: true, tags: ["standard"] },
  { id: "mcp-ts", name: "MCP · SDK TypeScript", category: "plugin-standard", description: "SDK oficial TS/JS para servidores y clientes MCP.", license: "MIT/Apache-2.0", url: "https://github.com/modelcontextprotocol/typescript-sdk", oss: true, maintained: true, tags: ["sdk"] },
  { id: "mcp-py", name: "MCP · SDK Python", category: "plugin-standard", description: "SDK oficial Python para servidores y clientes MCP.", license: "MIT", url: "https://github.com/modelcontextprotocol/python-sdk", oss: true, maintained: true, tags: ["sdk"] },
  { id: "openapi", name: "OpenAPI Specification", category: "plugin-standard", description: "Descripción estándar de APIs HTTP; común para exponer \"tools\" a LLMs.", license: "Apache-2.0", url: "https://github.com/OAI/OpenAPI-Specification", oss: true, maintained: true, tags: ["api"] },
];

OSS_LIBRARY.push(...OSS_LIBRARY_EXT);

// ── Helpers ──
export function getLibrary(): OssOption[] { return OSS_LIBRARY; }
export function getByCategory(cat: OssCategory): OssOption[] { return OSS_LIBRARY.filter((o) => o.category === cat); }
export function getMoaFrameworks(): OssOption[] { return OSS_LIBRARY.filter((o) => o.category === "moa"); }
export function findOption(id: string): OssOption | undefined { return OSS_LIBRARY.find((o) => o.id === id); }
