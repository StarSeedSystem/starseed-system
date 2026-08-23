/**
 * StarSeed OS — REGISTRO CURADO DE INTEGRACIONES (Adenda 110).
 * ============================================================================
 * Catálogo vetado de las MEJORES opciones open-source / gratuitas para cada
 * servicio de TODOS los sistemas del OS: IA, voz, red/federación, datos/sync,
 * identidad/seguridad, gobernanza/comunidad y medios/plataforma. Cada entrada
 * lleva su licencia (clasificada), tipo de acceso, madurez, nota de seguridad,
 * enlace y por qué es relevante para StarSeed; una por categoría marcada como
 * `top` (la recomendación por defecto).
 *
 * Investigado con múltiples subagentes (búsqueda web, estado 2026) y curado a
 * mano. `reviewed` marca la fecha de revisión; se refresca re-ejecutando la
 * investigación (ver architecture/integraciones-fuentes-recomendadas.md).
 *
 * Módulo LIVIANO: solo datos + helpers puros (sin React/Supabase). Nunca lanza.
 */

export const REGISTRY_REVIEWED = "2026-07-31";

export type IntegrationAccess =
  | "local" | "self-host" | "browser" | "free-api" | "library" | "protocol" | "mcp";

/** Clasificación de licencia para filtrar por compatibilidad/soberanía. */
export type LicenseClass =
  | "permissive"        // MIT/Apache/BSD/ISC/MPL/Zlib — integra sin fricción
  | "copyleft"          // GPL/LGPL — copyleft clásico (herramienta aparte OK)
  | "network-copyleft"  // AGPL/EUPL — obliga a publicar fuente a los usuarios
  | "non-commercial"    // pesos/uso no comerciales (CPML, OpenRAIL, Gemma, Llama, BFL-NC)
  | "proprietary-free"  // servicio propietario con capa gratuita
  | "open-data"         // ODbL/CC-BY — datos abiertos con atribución
  | "public-domain";    // dominio público / Unlicense / CC0

export type Maturity = "large" | "active" | "niche";

/** Sistema del OS al que sirve una categoría (para agrupar en la UI). */
export type OsSystem = "ia" | "voz" | "red" | "datos" | "identidad" | "gobernanza" | "medios";

export interface IntegrationCategoryMeta {
  id: string;
  system: OsSystem;
  label: string;
  /** Qué servicio del OS cubre. */
  serves: string;
}

export interface Integration {
  id: string;
  name: string;
  category: string;      // IntegrationCategoryMeta.id
  purpose: string;
  license: string;       // cadena cruda, p.ej. "MIT", "AGPL-3.0"
  licenseClass: LicenseClass;
  access: IntegrationAccess;
  maturity: Maturity;
  security: string;
  url: string;
  why: string;
  /** Recomendación por defecto de su categoría. */
  top?: boolean;
  /** Ya integrado/usado en StarSeed. */
  usedInStarSeed?: boolean;
  /** Advertencia relevante (licencia no comercial, mantenimiento, etc.). */
  caveat?: string;
}

export const OS_SYSTEMS: { id: OsSystem; label: string; hint: string }[] = [
  { id: "ia", label: "IA (Astraura)", hint: "Modelos de lenguaje, inferencia, agentes, embeddings y RAG." },
  { id: "voz", label: "Voz (OmniVoice)", hint: "Síntesis, clonación/emoción, transcripción e idioma." },
  { id: "red", label: "Red y federación", hint: "Protocolos sociales, P2P, malla y puentes de interoperabilidad." },
  { id: "datos", label: "Datos y sincronización", hint: "CRDT, motores de sync, almacenamiento y búsqueda." },
  { id: "identidad", label: "Identidad y seguridad", hint: "Passkeys, identidad soberana, autorización y cripto E2EE." },
  { id: "gobernanza", label: "Gobernanza y comunidad", hint: "Democracia, voto verificable, moderación y economía." },
  { id: "medios", label: "Medios y plataforma", hint: "Generación de medios, mapas, analítica, notificaciones y auto-hospedaje." },
];

export const CATEGORIES: IntegrationCategoryMeta[] = [
  // IA
  { id: "llm-runtime", system: "ia", label: "Runtimes LLM locales", serves: "Astraura · inferencia local" },
  { id: "llm-browser", system: "ia", label: "Inferencia en navegador", serves: "Astraura · WebGPU/WASM en la PWA" },
  { id: "llm-gateway", system: "ia", label: "Gateways/routers LLM", serves: "Astraura · router gratis-primero" },
  { id: "agent-framework", system: "ia", label: "Frameworks de agentes", serves: "Astraura · orquestación y herramientas" },
  { id: "embeddings", system: "ia", label: "Embeddings", serves: "Memorias/cerebros · vectores" },
  { id: "vector-rag", system: "ia", label: "Vector DB / RAG", serves: "Biblioteca/memorias · recuperación" },
  // Voz
  { id: "tts", system: "voz", label: "Síntesis de voz (TTS)", serves: "OmniVoice · voz de personalidades" },
  { id: "voice-clone", system: "voz", label: "Clonación / emoción", serves: "OmniVoice · voz por referencia y tono" },
  { id: "stt", system: "voz", label: "Transcripción (STT)", serves: "OmniVoice · escucha/dictado" },
  { id: "lang-detect", system: "voz", label: "Detección de idioma", serves: "Chats · idioma automático" },
  // Red
  { id: "federation", system: "red", label: "Protocolos sociales", serves: "Red · interoperar con el fediverso" },
  { id: "p2p", system: "red", label: "Redes P2P", serves: "Red sináptica · conexión directa" },
  { id: "mesh-radio", system: "red", label: "Malla / radio off-grid", serves: "Red mesh · sin infraestructura" },
  { id: "interop", system: "red", label: "Puentes / SDKs", serves: "Red · librerías de interoperabilidad" },
  // Datos
  { id: "crdt", system: "datos", label: "CRDT", serves: "Entidad universal · edición concurrente" },
  { id: "sync-engine", system: "datos", label: "Motores de sync local-first", serves: "Sincronización de neuronas" },
  { id: "realtime-server", system: "datos", label: "Servidores realtime", serves: "Colaboración en vivo" },
  { id: "browser-store", system: "datos", label: "Almacén en navegador", serves: "Offline-first en la PWA" },
  { id: "storage", system: "datos", label: "Almacenamiento de archivos", serves: "Archivos/medios descentralizados" },
  { id: "search", system: "datos", label: "Búsqueda", serves: "Biblioteca · búsqueda full-text/híbrida" },
  // Identidad
  { id: "auth-passkey", system: "identidad", label: "Passkeys / WebAuthn", serves: "Cuenta · acceso sin contraseña" },
  { id: "ssi-vc", system: "identidad", label: "Identidad soberana / VCs", serves: "Cuenta · identidad portátil verificable" },
  { id: "authz", system: "identidad", label: "Autorización", serves: "Permisos · delegación líquida revocable" },
  { id: "crypto-e2ee", system: "identidad", label: "Cripto / E2EE / ZK", serves: "Cifrado, grupos y prueba de conocimiento cero" },
  // Gobernanza
  { id: "governance", system: "gobernanza", label: "Democracia / deliberación", serves: "Ecosistema político · participación" },
  { id: "voting", system: "gobernanza", label: "Voto / decisión", serves: "Voto seguro y democracia líquida" },
  { id: "moderation", system: "gobernanza", label: "Moderación / seguridad", serves: "Confianza · justicia restaurativa" },
  { id: "mutual-economy", system: "gobernanza", label: "Economía / ayuda mutua", serves: "Abundancia · crédito mutuo y recursos" },
  // Medios
  { id: "media-gen", system: "medios", label: "Generación de medios", serves: "Cultura · imagen/vídeo" },
  { id: "media-browser", system: "medios", label: "Medios en navegador", serves: "Procesado de medios en la PWA" },
  { id: "maps", system: "medios", label: "Mapas / geo", serves: "Hub · mapas de comunidades" },
  { id: "analytics", system: "medios", label: "Analítica privada", serves: "Mejora continua sin vigilancia" },
  { id: "notifications", system: "medios", label: "Notificaciones", serves: "Avisos y despertares de neuronas" },
  { id: "selfhost", system: "medios", label: "Auto-hospedaje / infra", serves: "Nodos comunitarios soberanos" },
];

/* ── El registro (curado de la investigación multi-agente, estado 2026) ──────── */
export const INTEGRATIONS: Integration[] = [
  // ── IA · runtimes locales ──
  { id: "astraura-158", name: "Astraura 1.58-bit (soberano)", category: "llm-runtime", purpose: "Backend propio de StarSeed: BitNet b1.58 ternario nativo, personalidades, agentes, imaginación y memoria", license: "AGPL-3.0", licenseClass: "copyleft", access: "self-host", maturity: "active", security: "local/self-host, clave X-Astraura-Key, air-gap estricto", url: "https://github.com/StarSeedSystem/astraura", why: "SISTEMA PRIMARIO del OS (Adenda 153/155): inferencia real 1.58-bit sin nube y procesos autónomos de fondo", top: true, usedInStarSeed: true },
  { id: "ollama", name: "Ollama", category: "llm-runtime", purpose: "Runner local de modelos con 1 comando", license: "MIT", licenseClass: "permissive", access: "local", maturity: "large", security: "local, sin telemetría", url: "https://ollama.com", why: "Fallback local, API OpenAI, siempre funciona", top: true, usedInStarSeed: true },
  { id: "llama-cpp", name: "llama.cpp", category: "llm-runtime", purpose: "Motor de inferencia GGUF en C/C++", license: "MIT", licenseClass: "permissive", access: "local", maturity: "large", security: "local, sin red", url: "https://github.com/ggml-org/llama.cpp", why: "Motor base embebible de casi todo runtime" },
  { id: "localai", name: "LocalAI", category: "llm-runtime", purpose: "Motor multimodal compatible con OpenAI", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host, aislable", url: "https://localai.io", why: "Drop-in OpenAI: texto, voz e imagen" },
  { id: "vllm", name: "vLLM", category: "llm-runtime", purpose: "Servido GPU de alto rendimiento", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "large", security: "self-host, datos soberanos", url: "https://github.com/vllm-project/vllm", why: "Escala inferencia para nodos comunitarios" },
  { id: "mlc-llm", name: "MLC LLM", category: "llm-runtime", purpose: "Despliegue compilado universal", license: "Apache-2.0", licenseClass: "permissive", access: "local", maturity: "active", security: "on-device, offline", url: "https://llm.mlc.ai", why: "Compila modelos para móvil y PWA" },
  // ── IA · navegador ──
  { id: "webllm", name: "WebLLM", category: "llm-browser", purpose: "LLM en navegador por WebGPU", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "active", security: "on-device, sin salida de datos", url: "https://github.com/mlc-ai/web-llm", why: "LLM completo en la PWA sin servidor", top: true, usedInStarSeed: true },
  { id: "transformers-js", name: "transformers.js", category: "llm-browser", purpose: "Modelos HF en JS/WASM/WebGPU", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "large", security: "on-device, privado", url: "https://github.com/huggingface/transformers.js", why: "Embeddings y modelos pequeños en el navegador" },
  { id: "wllama", name: "wllama", category: "llm-browser", purpose: "llama.cpp compilado a WASM", license: "MIT", licenseClass: "permissive", access: "browser", maturity: "niche", security: "on-device, offline", url: "https://github.com/ngxson/wllama", why: "GGUF en navegador sin exigir WebGPU" },
  { id: "chrome-ai", name: "Chrome Built-in AI (Gemini Nano)", category: "llm-browser", purpose: "Modelo on-device del navegador", license: "propietaria (API gratis)", licenseClass: "proprietary-free", access: "browser", maturity: "active", security: "on-device, sin nube", url: "https://developer.chrome.com/docs/ai/built-in", why: "IA sin descarga en Chrome compatible", usedInStarSeed: true },
  // ── IA · gateways ──
  { id: "litellm", name: "LiteLLM", category: "llm-gateway", purpose: "Gateway compatible OpenAI auto-hospedable", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "large", security: "self-host, bóveda de claves", url: "https://github.com/BerriAI/litellm", why: "Router soberano = espina de Astraura", top: true },
  { id: "openrouter", name: "OpenRouter", category: "llm-gateway", purpose: "API unificada con modelos :free", license: "propietaria (tier gratis)", licenseClass: "proprietary-free", access: "free-api", maturity: "large", security: "TLS, no-logging opcional", url: "https://openrouter.ai", why: "Una clave, muchos modelos gratis de respaldo", usedInStarSeed: true },
  { id: "groq", name: "Groq", category: "llm-gateway", purpose: "Inferencia LPU ultrarrápida", license: "propietaria (tier gratis)", licenseClass: "proprietary-free", access: "free-api", maturity: "large", security: "TLS, nube estándar", url: "https://groq.com", why: "Respuestas en tiempo real gratis", usedInStarSeed: true },
  { id: "cerebras", name: "Cerebras", category: "llm-gateway", purpose: "Inferencia wafer-scale rápida", license: "propietaria (tier gratis)", licenseClass: "proprietary-free", access: "free-api", maturity: "active", security: "TLS, nube estándar", url: "https://cerebras.ai", why: "~1M tokens/día gratis, contexto grande", usedInStarSeed: true },
  { id: "routellm", name: "RouteLLM", category: "llm-gateway", purpose: "Router barato-vs-fuerte", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "niche", security: "self-host, sin lock-in", url: "https://github.com/lm-sys/RouteLLM", why: "Enruta a modelo barato o fuerte por dificultad" },
  // ── IA · agentes ──
  { id: "vercel-ai-sdk", name: "Vercel AI SDK", category: "agent-framework", purpose: "Toolkit de IA/agentes en TypeScript", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "large", security: "corre en tu app", url: "https://ai-sdk.dev", why: "Encaje TS nativo con Next.js", top: true },
  { id: "mcp", name: "Model Context Protocol", category: "agent-framework", purpose: "Estándar abierto de herramientas/datos", license: "MIT", licenseClass: "permissive", access: "mcp", maturity: "large", security: "servidores acotados, self-host", url: "https://modelcontextprotocol.io", why: "Capa de herramientas estándar entre clientes", usedInStarSeed: true },
  { id: "mastra", name: "Mastra", category: "agent-framework", purpose: "Framework de agentes en TypeScript", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "corre en tu app", url: "https://mastra.ai", why: "Agentes TS con workflows, memoria y RAG" },
  { id: "langgraph", name: "LangGraph", category: "agent-framework", purpose: "Orquestación de agentes con estado", license: "MIT", licenseClass: "permissive", access: "library", maturity: "large", security: "corre en tu app", url: "https://github.com/langchain-ai/langgraph", why: "Orquestación durable multi-paso" },
  // ── IA · embeddings ──
  { id: "transformers-js-embed", name: "transformers.js (embeddings)", category: "embeddings", purpose: "Embeddings ONNX on-device", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "large", security: "on-device, sin salida", url: "https://github.com/huggingface/transformers.js", why: "Embeddings sin que el dato salga de la neurona", top: true },
  { id: "fastembed", name: "fastembed", category: "embeddings", purpose: "Embeddings ONNX locales ligeros", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "local ONNX, sin red", url: "https://github.com/qdrant/fastembed", why: "Embeddings locales rápidos, huella mínima" },
  { id: "qwen3-embedding", name: "Qwen3-Embedding", category: "embeddings", purpose: "Modelo de embedding top-MTEB", license: "Apache-2.0", licenseClass: "permissive", access: "local", maturity: "active", security: "pesos self-host, offline", url: "https://github.com/QwenLM/Qwen3-Embedding", why: "Top-MTEB multilingüe, permisivo, self-host" },
  { id: "nomic-embed-v2", name: "nomic-embed-text-v2", category: "embeddings", purpose: "Embeddings MoE de contexto largo", license: "Apache-2.0", licenseClass: "permissive", access: "local", maturity: "active", security: "pesos self-host, offline", url: "https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe", why: "Multilingüe de contexto largo, self-host" },
  // ── IA · vector/RAG ──
  { id: "pgvector", name: "pgvector", category: "vector-rag", purpose: "Búsqueda vectorial en Postgres", license: "PostgreSQL", licenseClass: "permissive", access: "self-host", maturity: "large", security: "hereda RLS/roles de Postgres", url: "https://github.com/pgvector/pgvector", why: "Vectores en el Supabase existente, con RLS", top: true },
  { id: "qdrant", name: "Qdrant", category: "vector-rag", purpose: "Vector DB en Rust con filtros", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "large", security: "API keys, TLS, RBAC", url: "https://github.com/qdrant/qdrant", why: "Mejor vector DB independiente, RAG filtrado" },
  { id: "lancedb", name: "LanceDB", category: "vector-rag", purpose: "Vectores multimodales embebidos", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "embebido; app-enforced", url: "https://github.com/lancedb/lancedb", why: "Vectores on-device por neurona, TS-nativo" },
  { id: "llamaindex-ts", name: "LlamaIndex.TS", category: "vector-rag", purpose: "Orquestación RAG TS-nativa", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "corre en tu infra", url: "https://github.com/run-llama/LlamaIndexTS", why: "RAG TS sobre memorias/cerebros" },

  // ── Voz · TTS ──
  { id: "kokoro", name: "Kokoro", category: "tts", purpose: "TTS neuronal en navegador, 8 idiomas", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "active", security: "on-device WebGPU, sin telemetría", url: "https://github.com/hexgrad/kokoro", why: "Corre en la PWA offline, motor por defecto", top: true, usedInStarSeed: true },
  { id: "piper", name: "Piper", category: "tts", purpose: "TTS neuronal offline rápido", license: "MIT", licenseClass: "permissive", access: "local", maturity: "large", security: "offline, apto edge", url: "https://github.com/rhasspy/piper", why: "Voces CPU ligeras para nodos modestos", usedInStarSeed: true },
  { id: "melotts", name: "MeloTTS", category: "tts", purpose: "TTS CPU multilingüe en tiempo real", license: "MIT", licenseClass: "permissive", access: "local", maturity: "active", security: "offline, sin salida", url: "https://github.com/myshell-ai/MeloTTS", why: "Voz CPU en tiempo real, muchos idiomas" },
  { id: "kittentts", name: "KittenTTS", category: "tts", purpose: "TTS nano de 25MB en CPU", license: "Apache-2.0", licenseClass: "permissive", access: "local", maturity: "niche", security: "diminuto, offline, embebible", url: "https://github.com/KittenML/KittenTTS", why: "Voz ultraligera para móvil/edge" },
  { id: "styletts2", name: "StyleTTS2", category: "tts", purpose: "TTS expresivo de alta calidad", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host, privado", url: "https://github.com/yl4579/StyleTTS2", why: "Voz inglesa expresiva de nivel humano, MIT" },
  // ── Voz · clonación/emoción ──
  { id: "chatterbox", name: "Chatterbox", category: "voice-clone", purpose: "Clonación zero-shot + emoción", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host, marca de agua Perth", url: "https://github.com/resemble-ai/chatterbox", why: "Clon + emoción, 23 idiomas, MIT — ideal personalidades", top: true },
  { id: "openvoice-v2", name: "OpenVoice v2", category: "voice-clone", purpose: "Clon instantáneo, tono translingüe", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "large", security: "self-host, sin salida", url: "https://github.com/myshell-ai/OpenVoice", why: "Clon MIT + tono/emoción entre idiomas", usedInStarSeed: true },
  { id: "orpheus-tts", name: "Orpheus", category: "voice-clone", purpose: "TTS LLM con etiquetas de emoción + clon", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host, permisivo, privado", url: "https://github.com/canopyai/Orpheus-TTS", why: "Habla emotiva etiquetada + clon, permisivo" },
  { id: "zonos", name: "Zonos", category: "voice-clone", purpose: "Clon + control fino de emoción", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "niche", security: "self-host, sin telemetría", url: "https://github.com/Zyphra/Zonos", why: "Sliders de emoción por personalidad, Apache" },
  { id: "xtts-v2", name: "XTTS-v2 (Coqui)", category: "voice-clone", purpose: "Clonación de voz en 17 idiomas", license: "CPML (no comercial)", licenseClass: "non-commercial", access: "self-host", maturity: "large", security: "self-host; licencia no comercial", url: "https://huggingface.co/coqui/XTTS-v2", why: "Buen clon pero solo dev/test (no comercial)", usedInStarSeed: true, caveat: "Pesos CPML no comerciales — evitar en producción; usar Chatterbox/OpenVoice." },
  { id: "gptsovits", name: "GPT-SoVITS", category: "voice-clone", purpose: "Clonación de alta fidelidad", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host, requiere GPU", url: "https://github.com/RVC-Boss/GPT-SoVITS", why: "Clonación de alta fidelidad; requiere GPU", usedInStarSeed: true },
  // ── Voz · STT ──
  { id: "whisper", name: "Whisper", category: "stt", purpose: "STT 99 idiomas + autodetección", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "large", security: "self-host, sin salida", url: "https://github.com/openai/whisper", why: "Multilingüe + autodetección; build WebGPU navegador", top: true },
  { id: "faster-whisper", name: "faster-whisper", category: "stt", purpose: "Runtime de Whisper 4× más rápido", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "large", security: "self-host, privado", url: "https://github.com/SYSTRAN/faster-whisper", why: "STT multilingüe barato en CPU gratis" },
  { id: "whisper-cpp", name: "whisper.cpp", category: "stt", purpose: "Whisper C++ CPU/edge/WASM", license: "MIT", licenseClass: "permissive", access: "local", maturity: "large", security: "offline, apto edge", url: "https://github.com/ggml-org/whisper.cpp", why: "On-device incl. navegador WASM, sin servidor" },
  { id: "moonshine", name: "Moonshine", category: "stt", purpose: "STT diminuto en navegador en vivo", license: "MIT", licenseClass: "permissive", access: "browser", maturity: "active", security: "on-device WebGPU, privado", url: "https://github.com/moonshine-ai/moonshine", why: "Subtítulos en vivo más rápidos en la PWA" },
  { id: "silero-vad", name: "Silero VAD", category: "stt", purpose: "Detección de actividad de voz", license: "MIT", licenseClass: "permissive", access: "browser", maturity: "large", security: "on-device, sin red", url: "https://github.com/snakers4/silero-vad", why: "Gating de micro para turnos de OmniVoice" },
  // ── Voz · idioma ──
  { id: "franc", name: "franc", category: "lang-detect", purpose: "Detección de idioma en JS puro", license: "MIT", licenseClass: "permissive", access: "browser", maturity: "large", security: "en navegador, sin red", url: "https://github.com/wooorm/franc", why: "Detecta idioma en cliente para elegir voz", top: true },
  { id: "lingua", name: "lingua", category: "lang-detect", purpose: "Detección precisa en texto corto", license: "Apache-2.0", licenseClass: "permissive", access: "local", maturity: "active", security: "offline, sin telemetría", url: "https://github.com/pemistahl/lingua-py", why: "Mejor en frases cortas de chat, permisivo" },
  { id: "cld3", name: "CLD3", category: "lang-detect", purpose: "Detección neuronal on-device de Google", license: "Apache-2.0", licenseClass: "permissive", access: "local", maturity: "active", security: "on-device, privado", url: "https://github.com/google/cld3", why: "Detector neuronal compilable a WASM" },

  // ── Red · federación ──
  { id: "activitypub", name: "ActivityPub", category: "federation", purpose: "Grafo social federado (estándar W3C)", license: "W3C/abierto", licenseClass: "permissive", access: "protocol", maturity: "large", security: "HTTP firmado, sin E2EE nativo", url: "https://www.w3.org/TR/activitypub/", why: "Interoperar con Mastodon/Threads (web social)", top: true },
  { id: "atproto", name: "AT Protocol", category: "federation", purpose: "Federación Bluesky, identidad portátil", license: "MIT", licenseClass: "permissive", access: "protocol", maturity: "large", security: "DIDs criptográficos; DMs no E2EE", url: "https://atproto.com/", why: "Identidad DID portátil afín a cuentas firmadas" },
  { id: "nostr", name: "Nostr", category: "federation", purpose: "Eventos sociales firmados por relés", license: "dominio público", licenseClass: "public-domain", access: "protocol", maturity: "active", security: "firma schnorr, DMs NIP-44", url: "https://nostr.com/", why: "Identidad por par de claves afín a ECDSA" },
  { id: "matrix", name: "Matrix", category: "federation", purpose: "Chat/comms en tiempo real federado", license: "Apache-2.0", licenseClass: "permissive", access: "protocol", maturity: "large", security: "E2EE maduro (Olm/Megolm)", url: "https://matrix.org/", why: "Federación E2EE probada para salas de mensajería" },
  // ── Red · P2P ──
  { id: "iroh", name: "Iroh", category: "p2p", purpose: "P2P QUIC, marca por claves no IPs", license: "MIT/Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "QUIC/TLS, identidad por clave", url: "https://www.iroh.computer/", why: "P2P directo fiable, hole-punching, por clave", top: true },
  { id: "libp2p", name: "js-libp2p", category: "p2p", purpose: "Stack P2P modular nativo en navegador", license: "MIT/Apache-2.0", licenseClass: "permissive", access: "library", maturity: "large", security: "cifrado de transporte Noise/TLS", url: "https://libp2p.io/", why: "TS nativo, navegador-a-navegador WebRTC/WebTransport" },
  { id: "hypercore", name: "Hypercore / Pear", category: "p2p", purpose: "Runtime P2P de logs append-only", license: "Apache-2.0/MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "logs firmados, cifrado Noise", url: "https://pears.com/", why: "Sync de datos P2P en JS, offline-first" },
  { id: "veilid", name: "Veilid", category: "p2p", purpose: "Framework P2P privado onion-routed", license: "MPL-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "onion-routed, E2EE por defecto", url: "https://veilid.com/", why: "Privacidad tipo Tor para nodos móviles soberanos" },
  // ── Red · malla/radio ──
  { id: "meshtastic", name: "Meshtastic", category: "mesh-radio", purpose: "Firmware de malla LoRa de texto", license: "GPL-3.0", licenseClass: "copyleft", access: "local", maturity: "large", security: "canales AES-256, claves compartidas", url: "https://meshtastic.org/", why: "Ya en el stack, mayor comunidad LoRa", top: true, usedInStarSeed: true },
  { id: "reticulum", name: "Reticulum (RNS)", category: "mesh-radio", purpose: "Stack de malla E2EE multi-transporte", license: "custom (restringida)", licenseClass: "non-commercial", access: "library", maturity: "active", security: "E2EE curve25519 por defecto", url: "https://reticulum.network/", why: "Malla soberana, pero licencia no-OSI/GPL-incompatible", caveat: "Relicenciada a custom no-OSI (restricciones de IA/uso); existe fork comunitario Reticulum_CE." },
  { id: "briar", name: "Briar", category: "mesh-radio", purpose: "Mensajería Tor + malla Bluetooth", license: "GPL-3.0", licenseClass: "copyleft", access: "local", maturity: "active", security: "Tor + E2EE por defecto", url: "https://briarproject.org/", why: "Sync offline resistente a censura, probado" },
  { id: "meshcore", name: "MeshCore", category: "mesh-radio", purpose: "Firmware de malla LoRa enrutada", license: "MIT", licenseClass: "permissive", access: "local", maturity: "active", security: "AES + clave pública opcional", url: "https://meshcore.co.uk/", why: "Mejor enrutado que Meshtastic, ecosistema joven" },
  // ── Red · interop ──
  { id: "fedify", name: "Fedify", category: "interop", purpose: "Framework ActivityPub en TypeScript", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "gestiona firmas HTTP/claves", url: "https://fedify.dev/", why: "Añade el fediverso al servidor Next.js/TS", top: true },
  { id: "matrix-js-sdk", name: "matrix-js-sdk", category: "interop", purpose: "SDK oficial de Matrix (JS)", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "large", security: "E2EE vía matrix-rust-crypto", url: "https://github.com/matrix-org/matrix-js-sdk", why: "Mensajería Matrix E2EE en TS, drop-in" },
  { id: "nostr-tools", name: "nostr-tools", category: "interop", purpose: "Librería Nostr JS/TS de referencia", license: "dominio público", licenseClass: "public-domain", access: "library", maturity: "large", security: "firma schnorr, cifra NIP-44", url: "https://github.com/nbd-wtf/nostr-tools", why: "Toolkit de facto de Nostr para navegadores" },
  { id: "atproto-api", name: "@atproto/api", category: "interop", purpose: "SDK TS oficial de AT Protocol", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "firma por clave DID, OAuth", url: "https://github.com/bluesky-social/atproto", why: "Hablar con un PDS de Bluesky desde TS" },

  // ── Datos · CRDT ──
  { id: "yjs", name: "Yjs", category: "crdt", purpose: "Framework CRDT de documentos maduro", license: "MIT", licenseClass: "permissive", access: "library", maturity: "large", security: "agnóstico al transporte, añade auth/cifrado", url: "https://github.com/yjs/yjs", why: "Ecosistema más rico, editores y servidores listos", top: true },
  { id: "loro", name: "Loro", category: "crdt", purpose: "CRDT rápido en Rust, tipos ricos", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "auth gestionada por la app", url: "https://loro.dev", why: "Árbol movible, viaje en el tiempo, alto rendimiento" },
  { id: "automerge", name: "Automerge", category: "crdt", purpose: "CRDT tipo JSON con núcleo Rust", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "gestionado por la app", url: "https://automerge.org", why: "Modelo de documento limpio, v3 más eficiente" },
  // ── Datos · sync engines ──
  { id: "jazz", name: "Jazz", category: "sync-engine", purpose: "Local-first TS con CoValues E2E", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "E2E cifrado, ACL por valor", url: "https://jazz.tools", why: "E2E, entidades por referencia, offline, descentralizado", top: true },
  { id: "electricsql", name: "ElectricSQL", category: "sync-engine", purpose: "Motor de sync sobre Postgres", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "auth por shape/fila", url: "https://electric-sql.com", why: "Conserva el Postgres de Supabase, pareja con PGlite" },
  { id: "zero-rocicorp", name: "Zero (Rocicorp)", category: "sync-engine", purpose: "Sync reactivo de consultas Postgres", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "réplica de lectura, no corrompe", url: "https://zero.rocicorp.dev", why: "GA 1.0, sync Postgres con consultas reactivas" },
  { id: "powersync", name: "PowerSync", category: "sync-engine", purpose: "Sync offline Postgres↔SQLite", license: "FSL-1.1", licenseClass: "copyleft", access: "self-host", maturity: "active", security: "reglas de sync, auth por fila", url: "https://powersync.com", why: "Offline robusto web/móvil, afín a Supabase", caveat: "FSL-1.1 (revierte a Apache-2.0 a los 2 años)." },
  { id: "evolu", name: "Evolu", category: "sync-engine", purpose: "SQLite local-first cifrado E2E", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "niche", security: "E2E cifrado, claves del dueño", url: "https://evolu.dev", why: "SQLite local cifrado y privado" },
  // ── Datos · realtime servers ──
  { id: "y-sweet", name: "y-sweet", category: "realtime-server", purpose: "Servidor de sync Yjs con backend S3", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "auth por token, por documento", url: "https://y-sweet.dev", why: "Yjs durable, escalable y auto-hospedado", top: true },
  { id: "hocuspocus", name: "Hocuspocus", category: "realtime-server", purpose: "Backend Yjs (Tiptap)", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "hooks onAuthenticate", url: "https://tiptap.dev/hocuspocus", why: "Yjs probado, con hooks de persistencia en BD" },
  { id: "partykit", name: "PartyKit", category: "realtime-server", purpose: "Servidor realtime sobre Durable Objects", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "auth definida por la app", url: "https://partykit.io", why: "Realtime en el edge, respaldado por Cloudflare" },
  // ── Datos · browser store ──
  { id: "pglite", name: "PGlite", category: "browser-store", purpose: "Postgres compilado a WASM", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "active", security: "a nivel app/OPFS", url: "https://pglite.dev", why: "Postgres local que refleja Supabase, sync con Electric", top: true },
  { id: "rxdb", name: "RxDB", category: "browser-store", purpose: "BD offline reactiva, lista para sync", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "large", security: "plugin de cifrado", url: "https://rxdb.info", why: "Consultas reactivas, replicación conectable" },
  { id: "dexie", name: "Dexie.js", category: "browser-store", purpose: "Wrapper ergonómico de IndexedDB", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "large", security: "gestionado por la app", url: "https://dexie.org", why: "Almacén local simple y robusto" },
  { id: "wa-sqlite", name: "wa-sqlite / SQLite-WASM", category: "browser-store", purpose: "SQLite en navegador vía OPFS", license: "MIT", licenseClass: "permissive", access: "browser", maturity: "active", security: "gestionado por la app", url: "https://github.com/rhashimoto/wa-sqlite", why: "SQL completo offline con durabilidad OPFS" },
  // ── Datos · storage ──
  { id: "garage", name: "Garage", category: "storage", purpose: "Object store S3 geo-distribuido", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "TLS, claves S3, self-host", url: "https://garagehq.deuxfleurs.fr", why: "Pensado para neuronas geo-distribuidas pequeñas", top: true, caveat: "AGPL: servicio aparte, no se enlaza con el código del OS." },
  { id: "seaweedfs", name: "SeaweedFS", category: "storage", purpose: "Object store S3 + filer distribuido", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "large", security: "S3 IAM, cifrado, JWT", url: "https://github.com/seaweedfs/seaweedfs", why: "S3+filer permisivo que escala entre neuronas" },
  { id: "helia-ipfs", name: "IPFS / Helia", category: "storage", purpose: "Almacenamiento P2P por contenido, JS", license: "Apache-2.0/MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "CIDs públicos, cifrar-antes-de-guardar", url: "https://github.com/ipfs/helia", why: "Direccionado por contenido, JS nativo, navegador" },
  { id: "syncthing", name: "Syncthing", category: "storage", purpose: "Sync P2P continuo de archivos", license: "MPL-2.0", licenseClass: "permissive", access: "self-host", maturity: "large", security: "TLS, auth por dispositivo, E2E", url: "https://syncthing.net", why: "Sync P2P entre dispositivos-neurona", usedInStarSeed: true },
  // ── Datos · búsqueda ──
  { id: "meilisearch", name: "Meilisearch", category: "search", purpose: "Búsqueda full-text + híbrida instantánea", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "large", security: "API keys, tokens por tenant", url: "https://github.com/meilisearch/meilisearch", why: "Búsqueda híbrida MIT, self-host trivial, SDK JS", top: true },
  { id: "paradedb", name: "ParadeDB (pg_search)", category: "search", purpose: "Full-text BM25 dentro de Postgres", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "hereda RLS/roles de Postgres", url: "https://github.com/paradedb/paradedb", why: "BM25 híbrido en el Supabase existente", caveat: "AGPL: extensión de Postgres, servicio aparte." },
  { id: "typesense", name: "Typesense", category: "search", purpose: "Búsqueda tolerante a typos, con vectores", license: "GPL-3.0", licenseClass: "copyleft", access: "self-host", maturity: "large", security: "API keys, tokens acotados", url: "https://github.com/typesense/typesense", why: "Búsqueda instantánea simple, SDK JS" },

  // ── Identidad · passkeys ──
  { id: "simplewebauthn", name: "SimpleWebAuthn", category: "auth-passkey", purpose: "Passkeys/WebAuthn servidor + navegador", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "conforme al estándar, muy usado", url: "https://simplewebauthn.dev", why: "TS isomorfo MIT, entra en Next.js", top: true },
  { id: "hanko", name: "Hanko", category: "auth-passkey", purpose: "Auth sin contraseña + passkeys auto-hospedable", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "FIDO2 limpio, despliegue Docker", url: "https://github.com/teamhanko/hanko", why: "Backend passkey completo; AGPL como servicio aparte", caveat: "AGPL (elementos web MIT)." },
  { id: "webauthn-json", name: "@github/webauthn-json", category: "auth-passkey", purpose: "Wrapper JSON de WebAuthn en navegador", license: "MIT", licenseClass: "permissive", access: "browser", maturity: "active", security: "helper base64url fino", url: "https://github.com/github/webauthn-json", why: "Pegamento cliente diminuto para ceremonias" },
  // ── Identidad · SSI/VC ──
  { id: "credo-ts", name: "Credo (credo-ts)", category: "ssi-vc", purpose: "Agente SSI: DIDComm, OID4VC, AnonCreds", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "gobernado por OWF, interop-probado", url: "https://github.com/openwallet-foundation/credo-ts", why: "Emisión/tenencia de VCs soberanas en TS", top: true },
  { id: "veramo", name: "Veramo", category: "ssi-vc", purpose: "Framework modular DID/VC", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "respaldado por DIF, conectable", url: "https://veramo.io", why: "did:key/web + VC-JWT, ligero" },
  { id: "did-key-web", name: "did:key / did:web", category: "ssi-vc", purpose: "Métodos DID sin ledger", license: "W3C spec", licenseClass: "permissive", access: "protocol", maturity: "large", security: "autocertificado, sin ledger", url: "https://w3c-ccg.github.io/did-method-key/", why: "DIDs sin infraestructura afines a identidad soberana" },
  { id: "digitalbazaar-vc", name: "digitalbazaar/vc", category: "ssi-vc", purpose: "Librerías W3C VC + Data Integrity", license: "BSD-3-Clause", licenseClass: "permissive", access: "library", maturity: "active", security: "implementaciones de referencia W3C", url: "https://github.com/digitalbazaar/vc", why: "Primitivas canónicas de firma/verificación de VCs" },
  // ── Identidad · authz ──
  { id: "openfga", name: "OpenFGA", category: "authz", purpose: "Autorización relacional estilo Zanzibar", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "CNCF, auditado, HA", url: "https://openfga.dev", why: "Modela la delegación líquida revocable como grafo", top: true },
  { id: "cerbos", name: "Cerbos", category: "authz", purpose: "Punto de decisión de políticas sin estado", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "PDP desacoplado, políticas GitOps", url: "https://cerbos.dev", why: "ABAC/RBAC rápido como sidecar" },
  { id: "casbin", name: "Casbin (node-casbin)", category: "authz", purpose: "Librería RBAC/ABAC embebible", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "large", security: "en proceso, muchos adaptadores", url: "https://casbin.org", why: "Sin servidor; embebe en Next.js/Supabase" },
  // ── Identidad · cripto/E2EE/ZK ──
  { id: "libsodium", name: "libsodium.js", category: "crypto-e2ee", purpose: "Primitivas cripto modernas vía WASM", license: "ISC", licenseClass: "permissive", access: "library", maturity: "large", security: "auditado, resistente a mal uso", url: "https://github.com/jedisct1/libsodium.js", why: "Caballo de batalla para sellado E2EE", top: true },
  { id: "noble-curves", name: "@noble/curves", category: "crypto-e2ee", purpose: "Cripto pura JS/TS auditada", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "auditado, cero deps, tree-shakeable", url: "https://github.com/paulmillr/noble-curves", why: "P-256/Ed25519 nativos para identidades de dispositivo" },
  { id: "ts-mls", name: "ts-mls", category: "crypto-e2ee", purpose: "E2EE de grupo MLS (RFC 9420) en TS", license: "MIT", licenseClass: "permissive", access: "library", maturity: "niche", security: "sin auditar; OpenMLS maduro alt.", url: "https://github.com/LukaJCB/ts-mls", why: "E2EE de grupo en TS puro, suites post-cuánticas" },
  { id: "o1js", name: "o1js", category: "crypto-e2ee", purpose: "zk-SNARKs en TypeScript, pruebas recursivas", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "sin trusted setup, permisivo", url: "https://github.com/o1-labs/o1js", why: "Prueba ZK biométrica TS-nativa, sin setup" },
  { id: "dock-crypto-wasm", name: "Dock crypto-wasm-ts", category: "crypto-e2ee", purpose: "Credenciales anónimas BBS+ + acumuladores", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "niche", security: "pruebas invinculables, revocación por acumulador", url: "https://github.com/docknetwork/crypto-wasm-ts", why: "Una-persona-un-voto invinculable + revocación" },

  // ── Gobernanza · democracia ──
  { id: "decidim", name: "Decidim", category: "governance", purpose: "Framework de democracia participativa", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "large", security: "auditado, uso en gobiernos UE", url: "https://decidim.org", why: "Suite de gobernanza completa y probada", top: true, caveat: "AGPL: integrar como servicio federado aparte." },
  { id: "consul-democracy", name: "Consul Democracy", category: "governance", purpose: "Portal de participación ciudadana", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "probado, fundación activa", url: "https://consuldemocracy.org", why: "Propuestas, votos y presupuestos out-of-box" },
  { id: "polis", name: "Polis", category: "governance", purpose: "Clustering de opiniones a escala", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "probado en vTaiwan, consenso ML", url: "https://compdemocracy.org/polis", why: "Encuentra consenso en deliberación masiva" },
  { id: "loomio", name: "Loomio", category: "governance", purpose: "Decisiones por consenso en grupos", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "estable, GDPR, gestionado por coop", url: "https://loomio.com", why: "Propuestas en hilo, decisiones tipo círculo" },
  { id: "your-priorities", name: "Your Priorities", category: "governance", purpose: "Debate de ideas + facilitación IA", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "maduro, activo, stack Node/TS", url: "https://citizens.is", why: "Encaje de stack Node/TS, facilitación IA" },
  // ── Gobernanza · voto ──
  { id: "belenios", name: "Belenios", category: "voting", purpose: "Voto electrónico verificable E2E", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "verificable E2E, mantenido por criptógrafos (CNRS)", url: "https://www.belenios.org", why: "Voto secreto seguro con auditoría pública", top: true, caveat: "AGPL: servicio de voto aparte." },
  { id: "helios-voting", name: "Helios", category: "voting", purpose: "Voto web de auditoría abierta", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "niche", security: "auditoría abierta, base madura", url: "https://heliosvoting.org", why: "Voto verificable, licencia permisiva" },
  { id: "liquidfeedback", name: "LiquidFeedback", category: "voting", purpose: "Voto líquido/delegado proporcional", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "niche", security: "maduro, Postgres, delegación transitiva", url: "https://liquidfeedback.com", why: "Referencia de democracia líquida, delegación revocable" },
  { id: "pyrankvote", name: "PyRankVote", category: "voting", purpose: "Recuento STV/preferencial", license: "MIT", licenseClass: "permissive", access: "library", maturity: "niche", security: "auditable, embebible, determinista", url: "https://github.com/jontingvold/pyrankvote", why: "Motor de recuento de voto por rango para embeber" },
  // ── Gobernanza · moderación ──
  { id: "ozone", name: "Ozone (Bluesky)", category: "moderation", purpose: "Moderación y etiquetado descentralizado", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "TS, federado, etiquetadores comunitarios", url: "https://github.com/bluesky-social/ozone", why: "Moderación TS + federada, no central", top: true },
  { id: "detoxify", name: "Detoxify", category: "moderation", purpose: "Clasificador de toxicidad multilingüe", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "offline, apto español, self-host", url: "https://github.com/unitaryai/detoxify", why: "Puntuación de toxicidad en español, sin API externa" },
  { id: "llm-guard", name: "LLM Guard", category: "moderation", purpose: "Escáneres de seguridad de entrada/salida LLM", license: "MIT", licenseClass: "permissive", access: "library", maturity: "active", security: "escáneres PII/inyección/toxicidad", url: "https://github.com/protectai/llm-guard", why: "Protege las funciones de IA de StarSeed de extremo a extremo" },
  // ── Gobernanza · economía ──
  { id: "valueflows-hrea", name: "ValueFlows / hREA", category: "mutual-economy", purpose: "Protocolo de contabilidad económica en red", license: "Apache-2.0", licenseClass: "permissive", access: "protocol", maturity: "niche", security: "basado en REA, libs GraphQL JS", url: "https://hrea.io", why: "Contabilidad de contribución/recursos post-escasez", top: true },
  { id: "bonfire", name: "Bonfire", category: "mutual-economy", purpose: "Framework de OS comunitario federado", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "financiado por NLnet, modular", url: "https://bonfirenetworks.org", why: "OS social par con economía ValueFlows", caveat: "AGPL; v1 alpha." },
  { id: "karrot", name: "Karrot", category: "mutual-economy", purpose: "Coordinación de ayuda mutua", license: "AGPL-3.0", licenseClass: "network-copyleft", access: "self-host", maturity: "active", security: "Django/Vue, probado en foodsharing", url: "https://karrot.world", why: "Logística de ayuda mutua y recogidas" },

  // ── Medios · generación ──
  { id: "comfyui", name: "ComfyUI", category: "media-gen", purpose: "Flujos de generación de imagen/vídeo por nodos", license: "GPL-3.0", licenseClass: "copyleft", access: "self-host", maturity: "large", security: "auditar nodos de terceros", url: "https://github.com/comfyanonymous/ComfyUI", why: "Motor local de arte/medios, sin nube", top: true },
  { id: "flux-schnell", name: "FLUX.1 [schnell]", category: "media-gen", purpose: "Pesos abiertos de texto-a-imagen", license: "Apache-2.0", licenseClass: "permissive", access: "local", maturity: "active", security: "pesos offline, sin telemetría", url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell", why: "Modelo de imagen permisivo apto comercial" },
  { id: "sdxl", name: "Stable Diffusion XL", category: "media-gen", purpose: "Pesos abiertos de texto-a-imagen", license: "OpenRAIL++-M", licenseClass: "non-commercial", access: "local", maturity: "large", security: "offline; cláusulas de uso", url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0", why: "Ecosistema maduro: LoRAs, ControlNet", caveat: "OpenRAIL++ con restricciones de uso — revisar antes de producción." },
  { id: "invokeai", name: "InvokeAI", category: "media-gen", purpose: "Estudio pulido de Stable Diffusion", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host; modelos locales", url: "https://github.com/invoke-ai/InvokeAI", why: "UI pro accesible para creadores" },
  // ── Medios · navegador ──
  { id: "mediabunny", name: "mediabunny", category: "media-browser", purpose: "Leer/escribir/convertir medios en navegador", license: "MPL-2.0", licenseClass: "permissive", access: "library", maturity: "active", security: "cliente; sin subir al servidor", url: "https://mediabunny.dev", why: "TS nativo, WebCodecs; encaje PWA ideal", top: true },
  { id: "ffmpeg-wasm", name: "ffmpeg.wasm", category: "media-browser", purpose: "FFmpeg compilado a WebAssembly", license: "LGPL/GPL núcleo; MIT wrapper", licenseClass: "copyleft", access: "browser", maturity: "active", security: "corre en sandbox del navegador", url: "https://ffmpegwasm.netlify.app", why: "Transcodificación completa sin servidor" },
  { id: "sharp", name: "sharp", category: "media-browser", purpose: "Procesado de imágenes rápido en Node", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "large", security: "servidor; libvips nativo", url: "https://sharp.pixelplumbing.com", why: "Miniaturas/optimización en el servidor Next.js" },
  { id: "jsquash", name: "Squoosh / jSquash", category: "media-browser", purpose: "Códecs de compresión de imagen en navegador", license: "Apache-2.0", licenseClass: "permissive", access: "browser", maturity: "niche", security: "códecs WASM en cliente", url: "https://github.com/jamsinclair/jSquash", why: "Optimización de imagen on-device, sin subir" },
  // ── Medios · mapas ──
  { id: "maplibre", name: "MapLibre GL JS", category: "maps", purpose: "Librería de mapas vectoriales", license: "BSD-3-Clause", licenseClass: "permissive", access: "library", maturity: "large", security: "cliente; sin API keys", url: "https://maplibre.org", why: "Renderiza los mapas del Hub, soberano", top: true },
  { id: "protomaps", name: "Protomaps / PMTiles", category: "maps", purpose: "Tiles de mapa en un solo archivo", license: "BSD-3-Clause", licenseClass: "permissive", access: "self-host", maturity: "active", security: "hosting estático; sin tile server", url: "https://protomaps.com", why: "Tiles baratos auto-hospedados en cualquier CDN" },
  { id: "openfreemap", name: "OpenFreeMap", category: "maps", purpose: "Tiles gratis hospedados o self-host", license: "MIT (datos ODbL)", licenseClass: "open-data", access: "free-api", maturity: "active", security: "sin keys, sin rastreo", url: "https://openfreemap.org", why: "Basemaps gratis al instante, self-host luego" },
  { id: "photon", name: "Photon", category: "maps", purpose: "Geocodificación/autocompletado OSM", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host; backend OpenSearch", url: "https://github.com/komoot/photon", why: "Búsqueda de lugares mientras escribes" },
  // ── Medios · analítica ──
  { id: "umami", name: "Umami", category: "analytics", purpose: "Analítica web centrada en privacidad", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "sin cookies; self-host; sin PII", url: "https://umami.is", why: "Analítica permisiva y ligera sin vigilancia", top: true },
  { id: "posthog", name: "PostHog", category: "analytics", purpose: "Analítica de producto + feature flags", license: "MIT (ee/ propietario)", licenseClass: "permissive", access: "self-host", maturity: "large", security: "self-host; captura desactivable", url: "https://posthog.com", why: "Embudos/flags para más profundidad" },
  { id: "opentelemetry", name: "OpenTelemetry", category: "analytics", purpose: "Trazas/métricas/logs neutrales", license: "Apache-2.0", licenseClass: "permissive", access: "library", maturity: "large", security: "backends self-host; tus datos", url: "https://opentelemetry.io", why: "Observabilidad estándar sin lock-in" },
  // ── Medios · notificaciones ──
  { id: "ntfy", name: "ntfy", category: "notifications", purpose: "Pub-sub HTTP push auto-hospedado", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host; auth, ACL, E2E", url: "https://ntfy.sh", why: "Push simple a móvil/PWA, soberano", top: true },
  { id: "web-push", name: "Web Push (VAPID)", category: "notifications", purpose: "Protocolo push nativo del navegador", license: "MIT", licenseClass: "permissive", access: "library", maturity: "large", security: "claves VAPID; sin terceros", url: "https://github.com/web-push-libs/web-push", why: "Push PWA nativo, sin proveedor" },
  { id: "novu", name: "Novu", category: "notifications", purpose: "Infraestructura de notificaciones multicanal", license: "MIT", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host; entrega propia", url: "https://novu.co", why: "In-app/email/push para eventos e invitaciones" },
  // ── Medios · self-host ──
  { id: "coolify", name: "Coolify", category: "selfhost", purpose: "PaaS auto-hospedable (alt. Vercel/Heroku)", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "large", security: "self-host; secretos, SSL, backups", url: "https://coolify.io", why: "Despliega el stack StarSeed en 1 clic, soberano", top: true },
  { id: "casaos", name: "CasaOS", category: "selfhost", purpose: "OS de nube doméstica + tienda de apps", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host; nube personal", url: "https://casaos.io", why: "Nodo comunitario/servidor personal fácil", usedInStarSeed: true },
  { id: "caddy", name: "Caddy", category: "selfhost", purpose: "Reverse proxy con HTTPS automático", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "large", security: "TLS automático; Go memory-safe", url: "https://caddyserver.com", why: "HTTPS sin config para todos los servicios" },
  { id: "dokploy", name: "Dokploy", category: "selfhost", purpose: "Plataforma de despliegue auto-hospedable", license: "Apache-2.0", licenseClass: "permissive", access: "self-host", maturity: "active", security: "self-host; Docker/Traefik", url: "https://dokploy.com", why: "PaaS ligero alternativo a Coolify" },
];

/* ── Helpers puros ───────────────────────────────────────────────────────────── */

export function categoryMeta(id: string): IntegrationCategoryMeta | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function categoriesForSystem(system: OsSystem): IntegrationCategoryMeta[] {
  return CATEGORIES.filter((c) => c.system === system);
}

export function integrationsByCategory(categoryId: string): Integration[] {
  return INTEGRATIONS.filter((i) => i.category === categoryId);
}

/** La recomendación por defecto (top) de una categoría, o la primera. */
export function topFor(categoryId: string): Integration | undefined {
  const list = integrationsByCategory(categoryId);
  return list.find((i) => i.top) ?? list[0];
}

/** ¿La licencia es integrable directamente en el código del OS sin fricción? */
export function isDirectlyIntegrable(i: Integration): boolean {
  return i.licenseClass === "permissive" || i.licenseClass === "public-domain";
}

export function integrationById(id: string): Integration | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}
