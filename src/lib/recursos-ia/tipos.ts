/**
 * Recursos de IA por neurona — el CONTRATO (2026-10-23).
 *
 * Alex: «cada neurona debe poder seleccionar el medio de almacenamiento, así como para cada
 * archivo, folder y memoria, para los modelos de IA que lo soporten… y de igual manera para los
 * procesadores; todo debe autodetectarse para sugerir las mejores opciones con base a sus
 * capacidades, neuronas y medios disponibles, considerando los tamaños de almacenamiento,
 * preguntando antes de asumir los tamaños de los modelos seleccionados y verificando que todo
 * sea compatible». SOP: `architecture/recursos-ia-neurona.md`.
 *
 * Módulo PURO: solo tipos y constantes. Lo importa código de cliente (nada de `node:*`).
 */

/** Lo que una IA hace. Cada capacidad tiene su modelo, su procesador y su almacén. */
export type Capacidad =
    | "texto" // conversar, escribir
    | "razon" // razonamiento profundo
    | "codigo" // programar y revisar código
    | "decision" // reflejo/decisiones tipadas (Needle, Jev local)
    | "voz-tts" // hablar
    | "voz-asr" // oír
    | "imagen" // generar imágenes
    | "vision" // entender imágenes
    | "embeddings" // memoria/búsqueda semántica
    | "video"
    | "3d";

export const CAPACIDADES: readonly Capacidad[] = [
    "texto",
    "razon",
    "codigo",
    "decision",
    "voz-tts",
    "voz-asr",
    "imagen",
    "vision",
    "embeddings",
    "video",
    "3d",
] as const;

export const NOMBRE_CAPACIDAD: Record<Capacidad, string> = {
    texto: "Conversar y escribir",
    razon: "Razonamiento profundo",
    codigo: "Código (programar)",
    decision: "Reflejo y decisiones",
    "voz-tts": "Voz (hablar)",
    "voz-asr": "Oído (escuchar)",
    imagen: "Imágenes",
    vision: "Visión",
    embeddings: "Memoria semántica",
    video: "Vídeo",
    "3d": "3D",
};

/**
 * Cómo llega una neurona a un recurso que no es suyo.
 * - `local`: la misma neurona.
 * - `malla-local`: P2P en la misma red o malla (WebRTC, LAN, Reticulum por IP). Rápido.
 * - `red-starseed`: relé de la red de StarSeed OS (federación/servidores públicos de StarSeed).
 * - `antena`: enlace directo propio (LoRa, Meshtastic, Reticulum por radio, Wi-Fi directo):
 *   ancho de banda muy bajo — sirve para mensajes y decisiones, nunca para pesos de modelos.
 * - `internet`: un servidor externo por HTTP(S).
 */
export type Via = "local" | "malla-local" | "red-starseed" | "antena" | "internet";

export const VIAS: readonly Via[] = ["local", "malla-local", "red-starseed", "antena", "internet"] as const;

/** Ancho de banda y latencia típicos por vía (MB/s, ms). Orientativos; la detección los afina. */
export const VIA_REFERENCIA: Record<Via, { mbs: number; latenciaMs: number; nombre: string }> = {
    local: { mbs: 2000, latenciaMs: 0, nombre: "En esta neurona" },
    "malla-local": { mbs: 40, latenciaMs: 8, nombre: "Malla local (P2P)" },
    "red-starseed": { mbs: 8, latenciaMs: 80, nombre: "Red de StarSeed OS" },
    antena: { mbs: 0.002, latenciaMs: 1500, nombre: "Antena propia (LoRa/radio)" },
    internet: { mbs: 10, latenciaMs: 60, nombre: "Internet" },
};

/** Dónde puede vivir un modelo, un archivo, una carpeta o una memoria. */
export type TipoAlmacen =
    | "neurona-local" // disco interno de una neurona
    | "navegador" // OPFS/IndexedDB del navegador (presupuesto del medio)
    | "biblioteca" // Biblioteca de la cuenta (servidor StarSeed)
    | "carpeta-cerebro" // carpeta vinculada a un cerebro y sus servidores
    | "disco-externo" // memoria o disco externo conectado a una neurona (USB, Thunderbolt, SD)
    | "servidor-externo" // NAS, WebDAV, S3, servidor propio de almacenamiento
    | "nube"; // Google Drive, GCS… (sin streaming de pesos)

export type TipoDisco = "nvme" | "ssd" | "hdd" | "sd" | "red" | "desconocido";

export interface MedioAlmacen {
    /** Estable: "<neuronaId>:interno", "<neuronaId>:ext:<volumen>", "cerebro:<id>:<carpeta>", "biblioteca", "navegador:<neuronaId>". */
    id: string;
    tipo: TipoAlmacen;
    etiqueta: string;
    /** Neurona donde está físicamente (disco interno, disco externo conectado, navegador). */
    neuronaId?: string;
    cerebroId?: string;
    /** Ruta visible para la persona (con `~`); nunca credenciales ni rutas con secretos. */
    ruta?: string;
    totalGb?: number;
    libreGb?: number;
    /** Lectura secuencial medida o estimada (MB/s). */
    lecturaMBs?: number;
    tipoDisco?: TipoDisco;
    conexion?: "interna" | "usb" | "thunderbolt" | "red" | "nube";
    /** Cómo llega desde ESTA neurona. */
    via: Via;
    persistente: boolean;
    /** true = los datos no salen de la cuenta (o del grupo dueño). */
    privado: boolean;
    disponible: boolean;
    fuente: "detectado" | "declarado" | "estimado";
}

export type TipoProcesador = "cpu" | "gpu" | "npu" | "webgpu" | "servidor";

export type Acelerador =
    | "metal"
    | "metal4"
    | "cuda"
    | "rocm"
    | "vulkan"
    | "webgpu"
    | "wasm-simd"
    | "neon"
    | "avx2"
    | "avx512"
    | "coreml"
    | "ane";

export type Arquitectura = "arm64" | "x86_64" | "wasm" | "otra";

export interface Procesador {
    /** Estable: "<neuronaId>:cpu", "<neuronaId>:gpu", "servidor:<id>". */
    id: string;
    neuronaId: string;
    tipo: TipoProcesador;
    nombre: string;
    /** "macOS 26.3", "Linux", "Android 15", "Windows 11", "navegador". */
    so?: string;
    arquitectura?: Arquitectura;
    nucleos?: number;
    ramGb?: number;
    ramLibreGb?: number;
    vramGb?: number;
    memoriaUnificada?: boolean;
    aceleradores: Acelerador[];
    /** Runtimes instalados o instalables aquí: "llama-cpp", "bitnet-cpp", "mlx", "swift-metal", "ollama", "webgpu-onnx", "onnx", "coreml", "needle-wasm"… */
    runtimes: string[];
    /** Herramientas de compilación disponibles (p. ej. "swift-6.2", "xcode-26"): algunos runtimes se compilan en la neurona. */
    herramientas?: string[];
    via: Via;
    disponible: boolean;
    /** La neurona lo presta a otras (cuenta, grupos o público). */
    prestable?: boolean;
    /** Es de la cuenta (o del grupo dueño del alcance): servidores propios de un cerebro, A1 propio… Lo privado solo se procesa en lo propio. */
    propio?: boolean;
    fuente: "detectado" | "declarado" | "estimado";
}

export interface NeuronaRecursos {
    id: string;
    nombre: string;
    tipo?: string;
    online: boolean;
    esEsta: boolean;
    procesadores: Procesador[];
    almacenes: MedioAlmacen[];
    /** Cómo se llega a ella desde esta neurona, de la mejor a la peor. */
    vias: Via[];
}

export interface InventarioRecursos {
    generado: string;
    estaNeuronaId: string;
    neuronas: NeuronaRecursos[];
    /** Almacenes que no son de una neurona: Biblioteca, carpetas de cerebros, servidores, nube. */
    almacenesSueltos: MedioAlmacen[];
    /** Procesadores que no son de una neurona de la cuenta: servidores propios, públicos o comunales. */
    procesadoresSueltos: Procesador[];
    /** Modelos que ya están en una neurona (un servidor de IA que contesta, el backend de Astraura): no se vuelven a descargar. */
    modelosInstalados?: { modeloId: string; procesadorId?: string; almacenId?: string }[];
    avisos: string[];
}

/** Bits de los pesos predominantes. 1.58 = ternario (BitNet, Bonsai ternario). */
export type Bits = 1 | 1.58 | 2 | 3 | 4 | 5 | 6 | 8 | 16 | 32;

export type MedioApp = "web" | "pwa" | "nativo" | "servidor";

export interface RequisitosModelo {
    id: string;
    nombre: string;
    familia: string;
    capacidades: Capacidad[];
    bits: Bits;
    /** "gguf", "gturbo", "onnx", "mlx", "safetensors", "cact", "bps"… */
    formato: string;
    /** "bitnet-cpp", "llama-cpp", "swift-metal", "webgpu-onnx", "mlx", "needle-wasm", "ollama"… */
    runtime: string;
    /** Miles de millones de parámetros (totales). */
    parametrosB: number;
    /** MoE: activos por token. */
    activosB?: number;
    /**
     * Tamaño en disco. `gb: null` = desconocido o depende de la variante: hay que PREGUNTAR a la
     * persona antes de asumirlo (regla de Alex). `verificado` = medido del archivo real.
     */
    disco: { gb: number | null; verificado: boolean; descargaGb?: number };
    ramMinGb: number;
    vramMinGb?: number;
    /** Sistemas: "macOS>=26", "Linux", "Windows", "Android", "iOS", "navegador". Vacío = cualquiera. */
    so?: string[];
    arquitecturas?: Arquitectura[];
    /** Hace falta AL MENOS uno. */
    aceleradoresRequeridos?: Acelerador[];
    /** Herramientas para compilarlo en la neurona (p. ej. "swift-6.2"). */
    herramientasRequeridas?: string[];
    almacenamiento: {
        /**
         * `streaming-ssd`: lee pesos del disco en cada token (TurboFieldfare y los MoE de Colibri)
         * → disco local rápido obligatorio, no hace falta que todo quepa en RAM.
         */
        modo: "carga-completa" | "mmap" | "streaming-ssd";
        lecturaMinMBs?: number;
        /** Los pesos tienen que estar en la neurona que procesa (no por red). */
        soloLocal: boolean;
    };
    /** Servidor que levanta el runtime (para que el resto de la IA lo use). */
    servidor?: { protocolo: "openai" | "propio"; url: string };
    medios: MedioApp[];
    licencia: string;
    upstream: string;
    tokSRef?: { equipo: string; tokS: number }[];
    notas?: string;
    estado: "recomendado" | "respaldo" | "experimental" | "en-pruebas";
    origen: "capas" | "catalogo-local" | "biblioteca" | "propio";
}

export type NivelCompat = "optimo" | "bueno" | "justo" | "preguntar" | "no-cabe" | "incompatible";

/** Orden de mejor a peor (para ordenar y para el color). */
export const ORDEN_NIVEL: Record<NivelCompat, number> = {
    optimo: 0,
    bueno: 1,
    justo: 2,
    preguntar: 3,
    "no-cabe": 4,
    incompatible: 5,
};

export interface Motivo {
    /** Estable para pruebas: "so", "arquitectura", "acelerador", "ram", "vram", "disco", "disco-desconocido", "lectura", "via", "herramientas", "medio", "privacidad"… */
    clave: string;
    texto: string;
    bloquea: boolean;
    /** Qué hacer para arreglarlo, en palabras de la persona. */
    arreglo?: string;
}

export interface Compatibilidad {
    nivel: NivelCompat;
    /** 0–100: más es mejor (cabe con holgura, rápido, 1.58-bit, local). */
    puntuacion: number;
    motivos: Motivo[];
    tokSEstimado?: number;
    cargaSegundos?: number;
}

export type TipoElemento = "modelo" | "archivo" | "carpeta" | "memoria";

export interface Alcance {
    tipo: "perfil" | "grupo" | "comunidad" | "pagina";
    id: string;
    visibilidad: "privada" | "publica";
}

export interface ElementoRef {
    tipo: TipoElemento;
    id: string;
    nombre: string;
    tamanoGb?: number;
    /** Carpeta que lo contiene (herencia del medio). */
    padreId?: string;
}

export interface Asignacion {
    elemento: ElementoRef;
    /** `MedioAlmacen.id` o "auto" (lo decide el planificador). */
    almacenEn: string;
    /** Solo modelos: `Procesador.id` o "auto". */
    procesaEn?: string;
    replicas?: string[];
    alcance: Alcance;
    t: number;
    quien?: string;
}

export type Topologia =
    | "cada-neurona" // cada neurona usa lo suyo
    | "servidor-propio" // una neurona de la cuenta sirve toda la IA a las demás
    | "almacen-externo" // los modelos viven en un almacenamiento externo; procesa la neurona donde se conecta
    | "fragmentada" // capacidades (o capas) repartidas entre neuronas y servidores
    | "comunal"; // servidores compartidos del grupo o comunidad (públicos o privados)

export const NOMBRE_TOPOLOGIA: Record<Topologia, string> = {
    "cada-neurona": "Cada neurona con lo suyo",
    "servidor-propio": "Un servidor propio para toda mi IA",
    "almacen-externo": "Modelos en un almacenamiento externo",
    fragmentada: "Repartida entre mis neuronas",
    comunal: "Servidores del grupo o la comunidad",
};

export interface ConfigTopologia {
    topologia: Topologia;
    /** `servidor-propio`: la neurona que procesa para todas. */
    servidorNeuronaId?: string;
    /** `almacen-externo`: el almacén donde viven los modelos. */
    almacenExternoId?: string;
    /** Vías permitidas, en orden de preferencia. */
    vias: Via[];
    /** `fragmentada` (o ajuste fino en cualquiera): dónde procesa/almacena cada capacidad. */
    porCapacidad?: Partial<Record<Capacidad, { procesaEn?: string; almacenEn?: string; modeloId?: string }>>;
    alcance: Alcance;
}

export interface Pregunta {
    id: string;
    texto: string;
    tipo: "tamano-modelo" | "confirmar-descarga" | "elegir-variante" | "confirmar-almacen";
    modeloId?: string;
    opciones?: { valor: string; texto: string }[];
}

export interface Alternativa {
    modeloId: string;
    procesadorId: string;
    almacenId: string;
    via: Via;
    compat: Compatibilidad;
}

export interface Sugerencia {
    capacidad: Capacidad;
    modelo: RequisitosModelo;
    procesador: Procesador;
    almacen: MedioAlmacen;
    via: Via;
    compat: Compatibilidad;
    /** Frases cortas: por qué esta y no otra. */
    porQue: string[];
    alternativas: Alternativa[];
}

export interface PlanRecursos {
    topologia: ConfigTopologia;
    sugerencias: Sugerencia[];
    sinOpcion: { capacidad: Capacidad; motivo: string }[];
    preguntas: Pregunta[];
    resumen: string;
}

/** Lo que se guarda (y viaja con la cuenta): asignaciones, topologías y tamaños confirmados. */
export interface EstadoRecursosIa {
    v: 1;
    /** Clave `claveElemento(tipo, id)`. */
    asignaciones: Record<string, Asignacion>;
    /** Clave `claveAlcance(alcance)`. */
    topologias: Record<string, ConfigTopologia>;
    /** Tamaños que la persona confirmó (modeloId → GB). */
    tamanosConfirmados: Record<string, number>;
    /** Almacenes declarados a mano (un servidor externo, un disco que no se detecta solo). */
    almacenesDeclarados: MedioAlmacen[];
}

export const CLAVE_RECURSOS_IA = "starseed.recursos-ia.v1";
export const EVENTO_RECURSOS_IA = "starseed:recursos-ia";
