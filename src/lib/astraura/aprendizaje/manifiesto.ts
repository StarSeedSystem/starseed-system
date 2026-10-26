/**
 * Manifiesto del aprendizaje continuo de Astraura 1.58 (Ola 267).
 * Módulo PURO: sin I/O, sin red, sin claves. Describe agentes, fases y fuentes
 * del aprendizaje por adaptadores LoRA. SOP: architecture/astraura-158-aprendizaje-continuo.md
 */

/** Dónde prefiere trabajar cada agente de aprendizaje. */
export type ModeloPreferido = "bitnet-local" | "nube-gratis";

export type EstadoTrabajo = "pendiente" | "en-curso" | "hecho";

/** Uno de los cinco agentes especializados del aprendizaje continuo. */
export interface AgenteAprendizaje {
  /** Identificador único y estable, en kebab-case. */
  id: string;
  /** Nombre legible en español. */
  nombre: string;
  /** Rol dentro del ciclo de aprendizaje. */
  rol: string;
  /** Lo barato (curar, etiquetar) va al BitNet local; lo difícil a la nube gratis. */
  modeloPreferido: ModeloPreferido;
  /** Artefactos que consume (rutas lógicas, no del disco). */
  entradas: string[];
  /** Artefactos que produce. */
  salidas: string[];
  /** Estado actual del rol dentro del programa. */
  estado: EstadoTrabajo;
}

/** Un hito verificable dentro de una fase. */
export interface HitoAprendizaje {
  id: string;
  titulo: string;
  estado: EstadoTrabajo;
}

/** Una capa del sistema de aprendizaje, ligada a su ola del enjambre. */
export interface FaseAprendizaje {
  id: string;
  nombre: string;
  /** Número de ola del orquestador que la implementa (268-272). */
  ola: number;
  hitos: HitoAprendizaje[];
}

/** Fuente externa verificada en la que se apoya el sistema. */
export interface FuenteAprendizaje {
  nombre: string;
  url: string;
  licencia: string;
  /** Papel que juega dentro del sistema. */
  papel: string;
}

/** Los cinco agentes especializados del aprendizaje continuo. */
export const AGENTES_APRENDIZAJE: AgenteAprendizaje[] = [
  {
    id: "curador",
    nombre: "Curador",
    rol: "Captura y limpia el corpus vivo: turnos de chat por personalidad, trazas de herramientas, salidas de cognition y valoraciones; aplica privacidad, consentimiento y la limpieza de la guía Falcon.",
    modeloPreferido: "bitnet-local",
    entradas: ["turnos de chat", "trazas de herramientas", "salidas de cognition", "valoraciones del usuario"],
    salidas: ["data/aprendizaje/corpus/<personalidad>/AAAA-MM.jsonl"],
    estado: "pendiente",
  },
  {
    id: "entrenador",
    nombre: "Entrenador",
    rol: "Fabrica adaptadores LoRA GGUF por personalidad con QVAC llama-finetune-lora en Metal (por turnos de memoria); con Soup, en una GPU gratuita, los de bases estándar y los de preferencias (DPO, ORPO, KTO); coordina el refresco del modelo base con onebitllms en GPU de nube.",
    modeloPreferido: "bitnet-local",
    entradas: ["corpus curado por personalidad"],
    salidas: ["adaptadores LoRA GGUF", "candidatos de refresco del base"],
    estado: "pendiente",
  },
  {
    id: "evaluador",
    nombre: "Evaluador",
    rol: "Mide cada adaptador con conjuntos por personalidad (estilo, formato de tool-call, recuerdo de memoria, tareas del OS) y aplica la puerta de regresión antes de desplegar.",
    modeloPreferido: "nube-gratis",
    entradas: ["adaptadores candidatos", "conjuntos de evaluación por personalidad"],
    salidas: ["informes de evaluación", "veredicto de la puerta de regresión"],
    estado: "pendiente",
  },
  {
    id: "desplegador",
    nombre: "Desplegador",
    rol: "Carga los adaptadores aprobados vía llama-server --lora, actualiza el registro y ejecuta el rollback si una versión falla en producción.",
    modeloPreferido: "bitnet-local",
    entradas: ["adaptadores aprobados"],
    salidas: ["starseed_memory_root/aprendizaje/adaptadores.json", "rollback cuando haga falta"],
    estado: "pendiente",
  },
  {
    id: "cronista",
    nombre: "Cronista",
    rol: "Documenta cada ciclo de aprendizaje: qué corpus entró, qué adaptador salió, cómo evaluó y qué se desplegó; escribe la bitácora y las adendas.",
    modeloPreferido: "nube-gratis",
    entradas: ["eventos de todo el ciclo de aprendizaje"],
    salidas: ["bitácora de aprendizaje", "adendas"],
    estado: "pendiente",
  },
];

const hito = (id: string, titulo: string, estado: EstadoTrabajo = "pendiente"): HitoAprendizaje => ({ id, titulo, estado });

/** Las cinco capas del sistema, como fases con su ola del enjambre (268-272). */
export const FASES_APRENDIZAJE: FaseAprendizaje[] = [
  {
    id: "corpus",
    nombre: "Corpus vivo",
    ola: 268,
    hitos: [
      hito("corpus-captura", "Captura de turnos por personalidad, trazas y salidas de cognition"),
      hito("corpus-privacidad", "Filtro de privacidad y consentimiento; nunca claves en el corpus"),
      hito("corpus-limpieza", "Limpieza según la guía Falcon (máscara solo-asistente, split 80/10/10)"),
    ],
  },
  {
    id: "fabrica",
    nombre: "Fábrica de adaptadores",
    ola: 269,
    hitos: [
      hito("fabrica-qvac", "QVAC llama-finetune-lora en Metal, por turnos de memoria en la Mac"),
      hito("fabrica-nube", "Refresco del base con onebitllms en GPU de nube (cuentas de Alex)"),
      // Ola 1025U: la fábrica es intercambiable (QVAC · Soup · onebitllms). Soup cubre las bases estándar y las
      // preferencias (DPO, ORPO, KTO); entrena solo donde hay GPU (Kaggle o Colab), la Mac y el A1 preparan.
      hito("fabrica-soup", "Fábrica Soup: elección honesta por medio, soup.yaml validado y órdenes exactas (fabricas.ts, sin entrenar)", "hecho"),
      hito("fabrica-soup-destino", "Adaptador registrado por sujeto y ámbito (privado o colectivo), con consentimiento y sin memoria personal en lo público", "hecho"),
      hito("fabrica-soup-gpu", "Primer adaptador real entrenado con Soup en una GPU gratuita (Kaggle o Colab) y pasado por la puerta de regresión"),
    ],
  },
  {
    id: "evaluacion",
    nombre: "Evaluación",
    ola: 270,
    hitos: [
      hito("eval-conjuntos", "Conjuntos por personalidad: estilo, tool-call, memoria, tareas del OS"),
      hito("eval-puerta", "Puerta de regresión al estilo de verificar-neurona"),
    ],
  },
  {
    id: "despliegue",
    nombre: "Despliegue y Genesis",
    ola: 271,
    hitos: [
      hito("desp-lora", "Carga de adaptadores con llama-server --lora"),
      hito("desp-registro", "Registro y rollback en aprendizaje/adaptadores.json"),
      hito("desp-mando", "Pestaña «Aprendizaje» en Genesis"),
    ],
  },
  {
    id: "integracion",
    nombre: "Integración con el OS",
    ola: 272,
    hitos: [
      hito("int-personalidades", "Personalidades con su adaptador activo"),
      hito("int-valoracion", "Botones de valoración en el chat que alimentan el corpus"),
      hito("int-bots", "Bots 3D e imaginación intuitiva escribiendo al corpus"),
    ],
  },
];

/** Las cuatro fuentes verificadas del 2026-09-07. */
export const FUENTES_158: FuenteAprendizaje[] = [
  {
    nombre: "QVAC Fabric BitNet (llama.cpp fork)",
    url: "https://github.com/tetherto/qvac-rnd-fabric-llm-bitnet",
    licencia: "Apache-2.0",
    papel: "Inferencia TQ1_0/TQ2_0 en Metal/Vulkan/CPU y fine-tuning LoRA en el propio dispositivo: la fábrica en la Mac.",
  },
  {
    nombre: "onebitllms (TII)",
    url: "https://github.com/tiiuae/onebitllms",
    licencia: "Apache-2.0",
    papel: "Fine-tuning completo de modelos 1.58 pre-cuantizados, solo en GPU NVIDIA: el refresco del base en la nube.",
  },
  {
    nombre: "MLX (Apple)",
    url: "https://github.com/ml-explore/mlx",
    licencia: "MIT",
    papel: "Experimentos en Apple Silicon y modelos 4-bit auxiliares (Whisper, difusión); sin kernels ternarios 1.58.",
  },
  {
    nombre: "Falcon harness engineering guide",
    url: "https://falcon-lm.github.io/tutorials/harness-engineering-guide",
    licencia: "Documentación pública",
    papel: "Recetas de LoRA rango 16, limpieza de trazas, split 80/10/10 y smoke tests antes de producción.",
  },
];

/**
 * Soup, la tercera fábrica (Ola 1025U). No entra en `FUENTES_158` (las cuatro verificadas el 2026-09-07):
 * verificada el 2026-10-25 contra su README, sus docs y PyPI (soup-cli 0.76.1).
 */
export const FUENTE_SOUP: FuenteAprendizaje = {
  nombre: "Soup (soup-cli)",
  url: "https://github.com/MakazhanAlpamys/Soup",
  licencia: "Apache-2.0",
  papel: "Fine-tuning desde un YAML (SFT, DPO, ORPO, KTO; LoRA y QLoRA), evaluación y export a GGUF: la fábrica de adaptadores para bases estándar y de preferencias, solo en GPU (Kaggle o Colab); la Mac de 8 GB y el A1 preparan y validan.",
};

/** Proporción de hitos hechos sobre el total, entre 0 y 1. */
export function progresoAprendizaje(): number {
  const hitos = FASES_APRENDIZAJE.flatMap((f) => f.hitos);
  if (hitos.length === 0) return 0;
  return hitos.filter((h) => h.estado === "hecho").length / hitos.length;
}
