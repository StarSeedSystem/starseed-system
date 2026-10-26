// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repos que el OS usa por dentro (2026-10-23)
// ------------------------------------------------------------------------------
// Regla de Alex (2026-09-20): todo repo que se integra entra en la Biblioteca con
// su ficha y comprobación automática de versión. Lo que no corre aquí se marca
// `comingSoon` con el motivo a la vista: una ficha no promete lo que no hace.
// `kind: "project"` (como LiteLLM): instalar lo registra en tu Biblioteca y abre su superficie
// (`payload.route`). «function» exige una skill de Aurora y estas fichas no la tienen.
//
// Módulo PURO y SIN "use client": lo importa también `/api/library/actualizaciones`.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";

export const FICHAS_REPOS_OS: LibraryPackage[] = [
    {
        id: "repo-hono",
        kind: "project",
        name: "Hono · servidor web ultraligero",
        description:
            "Framework web sobre los estándares de la web (MIT, sin dependencias, < 12 kB en su versión mínima) que corre igual en " +
            "Node, Bun, Deno, Cloudflare Workers, Vercel y AWS Lambda. En StarSeed OS es la base del «servidor propio de IA» de cada " +
            "neurona (servicios/servidor-ia): une BitNet 1.58, Ollama, TurboFieldfare, LM Studio y Laya tras una sola API compatible " +
            "con OpenAI, con token, para que tus otras neuronas usen la IA de la más capaz por la malla local o la red de StarSeed. " +
            "Abrir lleva a Recursos de IA, donde se elige esa topología.",
        icon: "Server",
        tags: ["servidor", "api", "edge", "malla", "recursos-ia", "desarrollo"],
        version: "4.12.6",
        author: "honojs",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/honojs/hono",
            canal: "releases",
            licencia: "MIT",
            requisitos: "Node 22+ (o Bun, Deno, Workers). Ya viene en el OS (dependencia del SDK de MCP).",
            servicio: "servicios/servidor-ia",
            route: "/agent?tab=recursos-ia",
            corre_aqui: true,
        },
    },
    {
        id: "repo-filee",
        kind: "project",
        name: "Filee · convertir archivos (255 formatos)",
        description:
            "Conversor de archivos libre (MIT) que funciona sin conexión: imágenes (HEIC, RAW, PSD, AVIF…), PDF, Word, Excel, " +
            "PowerPoint, HWP, libros electrónicos, vídeo, audio, subtítulos, comprimidos, CAD, tipografías, 3D y datos " +
            "geoespaciales, sin Office ni LibreOffice. En StarSeed OS convierte en tu propia neurona, sin subir nada a servicios " +
            "de fuera: con clic derecho sobre cualquier archivo («Convertir a…»), pidiéndoselo a Astraura («convierte este PDF " +
            "a Word»), desde la Protomolécula o en la página Convertir. Abrir lleva al conversor.",
        icon: "Replace",
        tags: ["conversion", "archivos", "formatos", "pdf", "imagenes", "video", "audio", "documentos", "sin-conexion"],
        version: "2.0.0",
        author: "KnifeLemon",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/KnifeLemon/Filee",
            canal: "releases",
            licencia: "MIT",
            requisitos:
                "Neurona con macOS 13+ (versión preliminar, sin notarizar), Windows 10/11 o Linux x64/ARM64 (Ubuntu 22.04+). " +
                "Orden `filee` en ~/.local/bin. Motores opcionales: LibreOffice, Pandoc, Ghostscript, calibre y FFmpeg.",
            instalar_mac:
                "curl -LO https://github.com/KnifeLemon/Filee/releases/download/v2.0.0/Filee-2.0.0-osx-arm64.tar.gz && " +
                "tar -xzf Filee-2.0.0-osx-arm64.tar.gz && ./Filee-2.0.0-osx-arm64/install.sh",
            servicio: "src/lib/conversion (ruta /api/conversion)",
            route: "/convertir",
            corre_aqui: true,
        },
    },
    {
        id: "repo-codegraph",
        kind: "project",
        name: "CodeGraph · mapa del código para los agentes",
        description:
            "Grafo de conocimiento del código (MIT) que se indexa una vez en local (SQLite) y se mantiene al día: los agentes " +
            "preguntan «quién llama a esto», «qué rompe este cambio» o «dónde está X» por MCP en vez de leer archivos a ciegas. " +
            "Su autor mide en su banco ~62 % menos tokens y ~88 % menos llamadas a herramientas. En StarSeed OS da contexto a " +
            "los agentes que escriben el OS (MetaGenesis: opencode, Codex, Hermes y Claude Code), junto a GitNexus. Nada sale " +
            "de la neurona (telemetría apagada).",
        icon: "Network",
        tags: ["agentes", "contexto", "codigo", "mcp", "metagenesis", "tokens"],
        version: "1.6.2",
        author: "colbymchenry",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/colbymchenry/codegraph",
            canal: "releases",
            licencia: "MIT",
            requisitos: "Node 20+. Índice en .codegraph/ del repo (~0,5 GB para StarSeed OS). Telemetría apagada (CODEGRAPH_TELEMETRY=0).",
            servicio: "codegraph serve --mcp (por agente) · codegraph sync",
            route: "/metagenesis",
            corre_aqui: true,
        },
    },
    {
        id: "repo-manimgx",
        kind: "project",
        name: "ManimGX · animaciones matemáticas y 3D para agentes",
        description:
            "Motor de animación compatible con la API de Python de Manim (MIT; las ruedas nativas incluyen x264, GPL) sobre un " +
            "núcleo Rust con GPU (wgpu): escenas 2D y 3D (ThreeDScene, superficies, mallas, cámara) a MP4 1080p60 sin LaTeX. " +
            "Pensado para que los agentes escriban la escena y la comprueben (`manimgx inspect`). Corre también en el navegador " +
            "(npm: Pyodide en un Worker + WebGPU), así que sirve en cualquier medio. En StarSeed OS será el átomo de animación " +
            "3D de la Protomolécula y la acción de Astraura para crear piezas animadas en publicaciones y archivos.",
        icon: "Atom",
        tags: ["3d", "animacion", "video", "protomolecula", "astraura", "matematicas", "webgpu"],
        version: "0.1.1",
        author: "academa-labs",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: {
            upstream: "https://github.com/academa-labs/manimgx",
            canal: "commits",
            licencia: "MIT (ruedas nativas con x264: GPL-3.0-or-later en conjunto)",
            requisitos: "Python 3.13+ (pip install manimgx) o el navegador con WebGPU (npm manimgx).",
            note:
                "Llega con la ola 1023X: el código que escribe un agente solo se ejecuta aislado (en el navegador, Pyodide en un " +
                "Worker), nunca en el proceso del OS; luego el átomo de la Protomolécula y la acción de Astraura.",
            corre_aqui: false,
        },
    },
    {
        id: "repo-earshot",
        kind: "project",
        name: "earshot · oído de sonidos para los agentes",
        description:
            "Da a los agentes oído para lo que no es voz (MIT; modelos CLAP, Apache-2.0, y AST, BSD-3): describe sonidos con " +
            "etiquetas de AudioSet, encuentra momentos («un portazo», «una tecla»), mide volumen y ritmo y distingue audio real " +
            "de sintético. Solo CPU y sin conexión tras la primera descarga (~1,4 GB de modelos). En StarSeed OS será el sentido " +
            "de oído ambiental de los agentes de Astraura y de la orbe cuando tienen los sentidos encendidos y siempre escuchando.",
        icon: "Ear",
        tags: ["sentidos", "audio", "oido", "agentes", "astraura", "orbe", "privado"],
        version: "0.1.0",
        author: "Leonxlnx",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: {
            upstream: "https://github.com/Leonxlnx/earshot",
            canal: "commits",
            licencia: "MIT (modelos: CLAP Apache-2.0, AST BSD-3-Clause)",
            requisitos: "Python 3.10+, PyTorch CPU, ffmpeg; ~1,4 GB de modelos y ~20–40 s de carga en frío (el servidor MCP los deja cargados).",
            note:
                "Llega con la ola 1023X: servicio de oído en una neurona con memoria (el A1) al que los sentidos mandan solo " +
                "fragmentos sin voz y solo con los sentidos encendidos; nada sale de tus neuronas.",
            corre_aqui: false,
        },
    },
    {
        id: "repo-agno",
        kind: "project",
        name: "Agno · plataforma de agentes (Python)",
        description:
            "Framework y runtime (AgentOS) para construir, correr y gestionar agentes y equipos de agentes con memoria, " +
            "conocimiento, herramientas, MCP, aprobación humana y trazas OpenTelemetry, en tu propia base de datos. Apache-2.0. " +
            "En StarSeed OS es uno de los motores de agentes de Genesis, PoliGenesis y MetaGenesis.",
        icon: "Bot",
        tags: ["agentes", "genesis", "metagenesis", "poligenesis", "python", "equipos"],
        version: "3.1.10",
        author: "agno-agi",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: { upstream: "https://github.com/agno-agi/agno", canal: "releases", licencia: "Apache-2.0", requisitos: "Python 3.10+ (pip install agno)", note: "Llega con la ola 1023A (motores de agentes de Genesis).", corre_aqui: false },
    },
    {
        id: "repo-langgraph",
        kind: "project",
        name: "LangGraph · agentes con estado y ejecución duradera (Python)",
        description:
            "Orquestación de bajo nivel para agentes con estado: ejecución duradera (retoma tras un fallo), persona en el bucle " +
            "(inspeccionar y cambiar el estado a mitad), memoria corta y larga. MIT; no necesita LangChain. Su versión en " +
            "TypeScript (LangGraph.js) ya está en la Biblioteca. En StarSeed OS, motor para flujos largos de MetaGenesis.",
        icon: "GitBranch",
        tags: ["agentes", "grafos", "estado", "metagenesis", "genesis", "python"],
        version: "1.2.16",
        author: "langchain-ai",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: { upstream: "https://github.com/langchain-ai/langgraph", canal: "releases", licencia: "MIT", requisitos: "Python 3.10+ (pip install langgraph)", note: "Llega con la ola 1023A (motores de agentes de Genesis).", corre_aqui: false },
    },
    {
        id: "repo-pydantic-ai",
        kind: "project",
        name: "Pydantic AI · agentes tipados (Python)",
        description:
            "SDK de agentes con salidas y herramientas tipadas y validadas, inyección de dependencias, MCP, ejecución duradera " +
            "(Temporal, DBOS, Prefect), evaluaciones y grafos tipados. MIT. En StarSeed OS, para los directores de Genesis que " +
            "tienen que devolver decisiones con forma exacta (como Jev, pero con modelos de texto).",
        icon: "ShieldCheck",
        tags: ["agentes", "tipado", "validacion", "genesis", "directores", "python"],
        version: "2.60.0",
        author: "pydantic",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: { upstream: "https://github.com/pydantic/pydantic-ai", canal: "releases", licencia: "MIT", requisitos: "Python 3.10+ (pip install pydantic-ai-slim)", note: "Llega con la ola 1023A (motores de agentes de Genesis).", corre_aqui: false },
    },
    {
        id: "repo-openai-agents-python",
        kind: "project",
        name: "OpenAI Agents SDK · traspasos y guardas (Python)",
        description:
            "Framework ligero de flujos multiagente: agentes con instrucciones y herramientas, traspasos (handoffs), guardas de " +
            "entrada y salida, sesiones, persona en el bucle, MCP y voz en tiempo real. MIT y de cualquier proveedor (más de " +
            "100 modelos vía LiteLLM). En StarSeed OS, para equipos de agentes de PoliGenesis con traspasos entre roles.",
        icon: "Workflow",
        tags: ["agentes", "traspasos", "guardas", "poligenesis", "genesis", "python"],
        version: "0.24.0",
        author: "openai",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: { upstream: "https://github.com/openai/openai-agents-python", canal: "releases", licencia: "MIT", requisitos: "Python 3.10+ (pip install openai-agents)", note: "Llega con la ola 1023A (motores de agentes de Genesis). Trazas a OpenAI apagadas por defecto en el OS.", corre_aqui: false },
    },
    {
        id: "repo-react-native-zalo-kit",
        kind: "project",
        name: "React Native Zalo Kit · iniciar sesión con Zalo",
        description:
            "Envoltorio del SDK de Zalo (la mensajería de Vietnam) para apps React Native en iOS y Android: iniciar sesión con " +
            "Zalo, comprobar la sesión, leer el perfil y cerrar sesión. No es un modelo de IA ni sirve para correr modelos locales: " +
            "es un conector de identidad. Queda a la espera porque las apps nativas de StarSeed OS son Tauri (no React Native) y " +
            "porque pide una app registrada en el portal de desarrolladores de Zalo en «Live Mode»; además, leer el perfil solo " +
            "funciona desde direcciones IP de Vietnam.",
        icon: "LogIn",
        tags: ["identidad", "inicio-de-sesion", "zalo", "react-native", "movil", "conector"],
        version: "0.0.0",
        author: "maitrungduc1410",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: {
            upstream: "https://github.com/maitrungduc1410/react-native-zalo-kit",
            canal: "commits",
            licencia: "MIT",
            requisitos: "App React Native (o Expo con `npx expo prebuild`), Zalo App ID en Live Mode, configuración nativa en iOS y Android",
            note: "Llegará cuando exista una app móvil de StarSeed en React Native o un puente de inicio de sesión de Zalo para la app Tauri.",
            corre_aqui: false,
        },
    },
    {
        id: "repo-cloudroom",
        kind: "project",
        name: "Cloudroom",
        description:
            "App de escritorio (núcleo de código abierto) que ejecuta agentes de código (Claude Code, Codex, opencode, Hermes…) " +
            "en tu neurona o en sandboxes de la nube: cada agente con su sandbox aislado y su propia rama de git, y los de la nube " +
            "siguen aunque se cierre el aparato. Núcleo abierto en davidondrej/cloudroom-core. En StarSeed OS es una opción MÁS para " +
            "los servidores de los agentes (nunca la única): se sugiere solo si el contexto lo soporta y lo gratuito da; el parche " +
            "que traen sus hilos entra por las MISMAS puertas que la nube (tsc, pruebas, revisión). Abrir lleva a la sección de " +
            "contenedores de agentes de MetaGenesis.",
        icon: "Container",
        tags: ["agentes", "contenedores", "sandbox", "nube", "local", "metagenesis", "ramas"],
        version: "119.0.0",
        author: "davidondrej",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/davidondrej/cloudroom-gui",
            canal: "releases",
            externalUrl: "https://www.cloudroom.dev",
            licencia: "código abierto (núcleo cloudroom-core)",
            requisitos:
                "App de escritorio en macOS Apple Silicon ≥13 o Linux x64 (alfa); Windows: próximamente (sin versión oficial); móvil: próximamente (sin app oficial). " +
                "Cuenta de Cloudroom, GitHub y un agente de código conectado. Las claves las pone su dueño en la app (room-cli cloud env).",
            servicio: "room-cli (status · thread spawn → wait · environment diff-patch) · versión por las releases de davidondrej/cloudroom-gui",
            gratis: "local sin límite · 100 agentes en la nube cada 30 días por cuenta",
            route: "/metagenesis",
            corre_aqui: false,
            note:
                "Entra con la ola 1024C como opción de contenedores de agentes de Genesis (catálogo de conectores, cupo por contexto). " +
                "El sandbox recibe una COPIA del proyecto: nada privado-local se manda sin consentimiento explícito del contexto, y " +
                "se dice honesto cuando la neurona no tiene la app o la cuenta no tiene cupo.",
        },
    },
    {
        id: "repo-blender",
        kind: "project",
        name: "Blender · escenas 3D, render y GLB para todo el OS",
        description:
            "La suite 3D libre de la Blender Foundation (GPL-3.0-or-later): modelado, materiales, animación y render (Workbench, " +
            "Cycles, EEVEE) y exportación a GLB para el navegador. En StarSeed OS es un MEDIO, no una dependencia: corre como programa " +
            "aparte en las neuronas que lo tengan (tu Mac, tu escritorio), el OS mide qué puede hacer cada una (GPU, memoria, núcleos) y " +
            "se adapta, y un trabajo 3D es un dato con vocabulario cerrado: una IA propone la escena, nunca código. Servirá a la " +
            "Protomolécula (convertir a GLB), a Astraura (render por chat) y al Estudio audiovisual (intros 3D). Lo que creas es tuyo.",
        icon: "Box",
        tags: ["3d", "render", "glb", "blender", "protomolecula", "astraura", "estudio", "escritorio", "autoadaptable"],
        version: "5.2.3",
        author: "Blender Foundation",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: {
            upstream: "https://github.com/blender/blender",
            canal: "tags",
            patronTag: "^v5\\.2\\.\\d+$",
            licencia: "GPL-3.0-or-later (programa aparte, no va dentro del OS; lo que creas con él es tuyo)",
            requisitos:
                "Mac con Apple Silicon (macOS 13+): brew install --cask blender (346 MB de descarga). Linux ARM sin GPU: la distro trae " +
                "Blender 4.0 para lotes ligeros. Sin Blender el 3D del OS sigue funcionando en el navegador (three.js).",
            note:
                "Llega con la ola 1025B (architecture/blender-3d.md): detección por neurona, trabajo 3D como dato, cola de render " +
                "local, conversor de la Protomolécula, acción de Astraura y plantilla del Estudio. Se activa cuando el render de " +
                "punta a punta esté comprobado en la Mac.",
            corre_aqui: false,
        },
    },
    {
        id: "repo-soup",
        kind: "project",
        name: "Soup · afinar modelos desde un YAML (fábrica de adaptadores)",
        description:
            "Programa de línea de órdenes en Python (Apache-2.0) que afina modelos de lenguaje desde UN archivo YAML: SFT, " +
            "preferencias (DPO, ORPO, KTO, SimPO, IPO), aprendizaje por refuerzo (GRPO, PPO), LoRA y QLoRA; los evalúa " +
            "(`soup eval`, `soup ab`), diagnostica el entorno (`soup doctor`), exporta a GGUF (`soup export --format gguf " +
            "--quant q4_k_m`) y los sirve con una API compatible con OpenAI (`soup serve`) y un panel local (`soup ui`, " +
            "puerto 7860). En StarSeed OS es la tercera fábrica del aprendizaje continuo, junto a QVAC y onebitllms: sirve " +
            "para que Astraura se automejore (sistemas privados y públicos), para dar más capacidad a las capas de conciencia " +
            "y para personalizar modelos, agentes, personalidades y bots con adaptadores. Entrena SOLO donde hay GPU " +
            "(CUDA, o Apple Silicon con memoria de sobra): la Mac de 8 GB y el A1 de Oracle (sin GPU) no entrenan con " +
            "él, solo preparan y validan datos y configuración; el entrenamiento va a la GPU gratuita de Kaggle o Colab.",
        icon: "FlaskConical",
        tags: ["aprendizaje", "fine-tuning", "lora", "qlora", "gguf", "dpo", "astraura", "personalizacion", "python", "gpu"],
        // Canal de commits: Soup publica etiquetas (v0.76.1) y paquetes en PyPI, pero sus «Releases» de GitHub van
        // semanas por detrás (la última marcada es la v0.73.3) y la API de etiquetas ordena por nombre, no por versión
        // (v0.9.0 saldría antes que v0.76.1). El SHA de main es la única señal fiable; `versionPublicada` lleva la de PyPI.
        version: "51777d1",
        author: "MakazhanAlpamys",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: {
            upstream: "https://github.com/MakazhanAlpamys/Soup",
            canal: "commits",
            licencia: "Apache-2.0",
            versionPublicada: "0.76.1 (PyPI, 2026-10-14; etiqueta v0.76.1)",
            requisitos:
                "Python 3.11 o 3.12 (la 0.76.1 de PyPI no instala en 3.13). GPU CUDA recomendada; Apple Silicon (MPS) soportado; " +
                "CPU solo experimental y muy lenta. QLoRA: 8 GB de VRAM para 7B, 16 GB para ~14B, 24 GB para ~34B. " +
                "Instalación con `pip install \"soup-cli[train]\"` (comillas dobles).",
            corre_aqui: false,
            note:
                "Llega con la ola 1025U: el plan (fabricas.ts) elige la fábrica por medio, genera el soup.yaml con solo claves " +
                "documentadas (la 0.75 rechaza las desconocidas y la 0.76 los ajustes que no aplicaba: `soup doctor --config " +
                "soup.yaml` antes de actualizar) y lista las órdenes y el guion para Kaggle o Colab. El primer entrenamiento real " +
                "falta. Un adaptador de Soup se entrena sobre una base estándar de Hugging Face: no se carga sobre el BitNet 1.58.",
        },
    },
    {
        id: "repo-hermes3d",
        kind: "project",
        name: "Hermes3D · oficina 3D para agentes de IA",
        description:
            "Estudio web libre (MIT; Next.js, React Three Fiber y Phaser) que pone a tus agentes de IA en una oficina 3D: los " +
            "ves trabajar, hacer reuniones, revisar código y vigilar la calidad, y se conecta a un gateway (Hermes con su " +
            "adaptador, un runtime HTTP propio o una demostración). El programa en sí no corre dentro del OS, pero sus ideas " +
            "ya están portadas, con su licencia y atribución: salas navegables con ocupantes que muestran actividad real y un " +
            "backend «gateway-first» que posee el estado (la oficina de Genesis y el Mundo de los avatares). Abrir lleva al " +
            "Mundo de los avatares.",
        icon: "Move3d",
        tags: ["3d", "agentes", "oficina", "avatares", "mundo", "genesis", "react-three-fiber", "nextjs"],
        // Sin lanzamientos: solo una etiqueta v1.0.0 antigua y main avanza. Se sigue por commits (SHA de main).
        version: "beb7629",
        author: "iamlukethedev",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/iamlukethedev/Hermes3D",
            canal: "commits",
            licencia: "MIT",
            requisitos:
                "Node 20+ y npm 10+ (recomendados) y un gateway: Hermes con `npm run hermes-adapter`, un runtime HTTP propio o la " +
                "demostración (`npm run demo-gateway`). Voz opcional con ElevenLabs (clave del propio usuario). No se instala en el OS.",
            route: "/mundo-avatares",
            corre_aqui: false,
            note:
                "Las ideas están en src/components/astraura/genesis/oficina/ (con LICENSE-hermes3d.md) y en el Mundo de los " +
                "avatares; el código del programa no se copió. La ficha existe para seguir su versión y atribuirlo.",
        },
    },
    {
        id: "repo-ecc",
        kind: "project",
        name: "ECC · catálogo de agentes y skills para Claude Code, Codex y OpenCode",
        description:
            "Sistema de optimización del arnés de agentes (MIT) con 71 agentes y 311 skills (README del 25-10-2026), comandos, hooks, " +
            "reglas, memoria y aprendizaje continuo para Claude Code, Codex, OpenCode y Cursor, más el escáner de seguridad AgentShield. Instalarlo " +
            "entero carga unos 47,6 k tokens fijos en cada sesión; por eso en la Mac de la fundación solo está una selección, " +
            "`ecc-starseed` (24 skills y 12 agentes, ~3,7 k tokens fijos), instalada como plugin de Claude Code. Es una " +
            "herramienta de quienes escriben el OS (Claude Code y los agentes de MetaGenesis), no una función del OS: instalar " +
            "la ficha solo guarda el enlace al repositorio.",
        icon: "Boxes",
        tags: ["agentes", "skills", "claude-code", "codex", "opencode", "metagenesis", "tokens", "herramientas"],
        version: "2.2.3",
        author: "affaan-m",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/affaan-m/ECC",
            canal: "releases",
            // Las etiquetas de sus releases son `vX.Y.Z` (v2.2.3); existe una candidata `v2.0.0-rc.1` marcada como
            // pre-lanzamiento, que `releases/latest` ya excluye.
            patronRelease: "v*",
            externalUrl: "https://github.com/affaan-m/ECC",
            licencia: "MIT",
            requisitos:
                "Node.js 18+ para `npx ecc-universal@2.2.3 setup`; el plugin de Claude Code pide Git y Claude Code 2.1+. " +
                "Perfil ligero: `npx ecc-universal@2.2.3 install --profile minimal --target claude`. Las reglas son contexto siempre " +
                "cargado: empezar por `rules/common` y un solo paquete de lenguaje.",
            corre_aqui: false,
            note:
                "No corre dentro del OS. En la Mac de la fundación hay instalada solo la selección `ecc-starseed`; el catálogo " +
                "entero no, por su coste fijo de contexto por sesión.",
        },
    },
];
