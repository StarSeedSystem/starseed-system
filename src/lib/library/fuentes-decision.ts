// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Fuentes de decisiones tipadas (JV11 · Ola 357)
// ------------------------------------------------------------------------------
// Las fuentes que entran en la Biblioteca con su ficha honesta.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryRepo, LibraryPackage } from "./packages";

/* ───────────────────────────── Datos ───────────────────────────── */

export const REPO_DECISIONES: LibraryRepo = {
  id: "starseed-decisiones",
  name: "Fuentes de decisiones",
  builtin: true,
  packages: [
    {
      id: "openjev",
      kind: "ai-source",
      name: "openjev",
      description:
        "Servidor de decisiones compatible con Jev, POST /v1/systemone, sobre DiffusionGemma 26B en Docker. Referencia del contrato de decisiones.",
      icon: "Server",
      tags: ["decisiones", "nube", "referencia", "contrato"],
      version: "1.0.0",
      author: "razorback16",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://github.com/razorback16/openjev",
        licencia: "Apache-2.0",
        requisitos: "GPU NVIDIA de 24 GB o más; Docker",
        corre_aqui: false,
      },
      comingSoon: true,
    },
    {
      id: "decider",
      kind: "ai-source",
      name: "decider",
      description:
        "Qwen3.5-2B-Base que restringe los logits a A..J con softmax (~1.666 decisiones/s en GH200). Candidato local si se cuantiza para Apple Silicon.",
      icon: "Gauge",
      tags: ["decisiones", "local", "candidato", "qwen"],
      version: "1.0.0",
      author: "Mapika",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://github.com/Mapika/decider",
        licencia: "MIT",
        requisitos: "GH200 o equivalente para velocidad medida",
        corre_aqui: false,
      },
      comingSoon: true,
    },
    {
      id: "nimble",
      kind: "ai-source",
      name: "nimble",
      description:
        "Qwen3.5-9B con LoRA y ParallelScorer en MLX para Mac: puntúa todos los campos en una sola pasada. 9B en 8 GB es apretado.",
      icon: "Zap",
      tags: ["decisiones", "local", "mlx", "loRA"],
      version: "1.0.0",
      author: "bespokelabsai",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://github.com/bespokelabsai/nimble",
        licencia: "MIT",
        requisitos: "Mac con MLX; 9B apretado en 8 GB",
        corre_aqui: false,
      },
      comingSoon: true,
    },
    {
      id: "alexwortega-openjev",
      kind: "ai-source",
      name: "AlexWortega/openjev",
      description:
        "Cross-encoder NLI sobre Qwen3.5-4B (variante 35B-A3B) en Hugging Face: reordenar, calificar y filtrar propuestas.",
      icon: "Shapes",
      tags: ["decisiones", "nube", "nli", "huggingface"],
      version: "1.0.0",
      author: "AlexWortega",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://huggingface.co/AlexWortega/openjev",
        licencia: "MIT",
        requisitos: "Modelo descargado (4B o 35B-A3B)",
        corre_aqui: false,
      },
      comingSoon: true,
    },
    {
      id: "trueforge",
      kind: "repo",
      name: "trueforge",
      description:
        "Runtime de agentes en Node 22: chat, API HTTP con SDK TS, componente embebible, herramientas MCP, skills en git, sandbox y puntos de aprobación humana. Modo local con SQLite.",
      icon: "Workflow",
      tags: ["agentes", "runtime", "node", "sandbox", "local"],
      version: "1.0.0",
      author: "truefoundry",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://github.com/truefoundry/trueforge",
        licencia: "MIT",
        requisitos: "Node 22; SQLite local",
        corre_aqui: false,
      },
      comingSoon: true,
    },
    {
      id: "bitnet-b1.58",
      kind: "ai-source",
      name: "BitNet b1.58-2B-4T",
      description:
        "El único motor de decisiones que hoy está encendido en esta Mac (127.0.0.1:8790). Base del Jev local de JV6 con logits de opciones por /completion con n_probs.",
      icon: "Binary",
      tags: ["decisiones", "local", "bitnet", "1.58-bit", "encendido"],
      version: "1.0.0",
      author: "StarSeed · Astraura",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://github.com/StarSeedSystem/starseed-system/tree/main/scripts/nodo-bitnet.sh",
        licencia: "Apache-2.0",
        requisitos: "Mac con llama-server (BitNet) corriendo en 127.0.0.1:8790",
        corre_aqui: true,
      },
    },
    {
      id: "tinker-cookbook",
      kind: "repo",
      name: "tinker-cookbook",
      description:
        "374 módulos Python; 329 (88%) importan el SDK `tinker` y NO funcionan sin cuenta DE PAGO en thinkingmachines.ai. El entrenamiento corre en SU infraestructura. Gratis solo sirven las recetas como planos y los tutoriales.",
      icon: "BookOpen",
      tags: ["entrenamiento", "destilacion", "rl", "astraura", "pago-requerido"],
      version: "1.0.0",
      author: "samwit",
      sourceRepoId: "starseed-decisiones",
      free: false,
      payload: {
        upstream: "https://github.com/samwit/tinker-cookbook",
        licencia: "Apache-2.0",
        requisitos:
          "Cuenta de PAGO en thinkingmachines.ai y TINKER_API_KEY (88% de los módulos); las recetas se leen gratis como planos",
        corre_aqui: false,
      },
      comingSoon: true,
    },
    // ════════════════════════════════════════════════════════════════════
    // Registro de las tres repos nuevas (TK1c, Ola 339): tinker-cookbook
    // (ya existente, descripción corregida para reflejar pago en thinkingmachines.ai
    // y entrenamiento en su infraestructura); hermes-jev-skills (MIT, Python 3.9+,
    // clave OpenRouter ya disponible); jev-router (MIT, Node 20.12+, coste solo de
    // suscripción Claude Code como requisito previo, no del repo).
    // corre_aqui: false porque ninguna ficha afirma comprobación en cualquier máquina;
    // lo comprobamos en ESTA y el código no mira OPENROUTER_API_KEY aquí.
    // ════════════════════════════════════════════════════════════════════
    {
      id: "hermes-jev-skills",
      kind: "repo",
      name: "hermes-jev-skills",
      description:
        "Python 3.9+ sin dependencias, diez skills. Funciona con una clave de OpenRouter, que ya tenemos.",
      icon: "Layers",
      tags: ["skills", "jev", "opentrouter", "mit"],
      version: "1.0.0",
      author: "kerpopule",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://github.com/kerpopule/hermes-jev-skills",
        licencia: "MIT",
        requisitos: "Python 3.9+ sin dependencias; clave de OpenRouter (ya disponible en esta máquina)",
        corre_aqui: false,
      },
      comingSoon: false,
    },
    {
      id: "jev-router",
      kind: "repo",
      name: "jev-router",
      description:
        "Node 20.12+. Proxy que enruta Claude Code a Haiku/Sonnet/Opus según la complejidad que estime Jev. El repo es MIT y gratis; lo que cuesta es la suscripción de Claude Code, que es un requisito previo, no un coste del repo.",
      icon: "GitBranch",
      tags: ["router", "claude-code", "jev", "node"],
      version: "1.0.0",
      author: "gargpratyush",
      sourceRepoId: "starseed-decisiones",
      free: true,
      payload: {
        upstream: "https://github.com/gargpratyush/jev-router",
        licencia: "MIT",
        requisitos: "Node 20.12+; suscripción de Claude Code como requisito previo",
        corre_aqui: false,
      },
      comingSoon: false,
    },
  ],
};
