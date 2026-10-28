/**
 * Fábrica intercambiable del aprendizaje continuo (Ola 1025U) — módulo PURO.
 * ──────────────────────────────────────────────────────────────────────────
 * La capa 2 del aprendizaje (la Fábrica de adaptadores) deja de ser «solo QVAC»: hay tres motores y
 * cada uno sirve para una cosa distinta. Este módulo dice cuál toca para una necesidad y un medio, y
 * DICE LA VERDAD cuando el medio no puede: la Mac de 8 GB y el A1 no entrenan con Soup, solo
 * preparan (datos, configuración, comprobaciones); el entrenamiento va a una GPU de Kaggle o Colab.
 *
 *   qvac       · adaptadores LoRA GGUF para el BitNet 1.58 de Astraura, en el aparato (Metal), por turnos.
 *   soup       · adaptadores (SFT) y preferencias (DPO, ORPO, KTO) para bases estándar de Hugging Face.
 *   onebitllms · refresco del BASE 1.58 (afinado completo), solo GPU NVIDIA en la nube.
 *   meta-n     · mejora el PROCESO de la capa (pautas y funciones de ayuda), en una caja Docker.
 *
 * Sin I/O, sin red, sin claves y sin `node:*` (CLAUDE.md, trampa 11). SOP:
 * architecture/astraura-158-aprendizaje-continuo.md §2.2 y §2.2.1.
 */

export type MotorFabrica = "qvac" | "soup" | "onebitllms" | "meta-n";
export type Acelerador = "cuda" | "mps" | "ninguno";
/**
 * Qué se quiere fabricar. `preferencias` = DPO, ORPO o KTO (aprender de «mejor/peor»).
 * `proceso` = mejorar CÓMO resuelve la capa (pautas y funciones de ayuda), no sus pesos.
 */
export type TareaFabrica = "adaptador" | "preferencias" | "refresco-base" | "proceso";
/** Sobre qué modelo: el BitNet 1.58 de Astraura o una base estándar de Hugging Face (Qwen, Llama, Gemma…). */
export type FamiliaBase = "bitnet-1.58" | "estandar";

/** Un aparato o servicio donde podría correr una fábrica. */
export interface MedioFabrica {
    id: string;
    nombre: string;
    ram_gb: number;
    acelerador: Acelerador;
    /** Memoria de la tarjeta (solo CUDA). En MPS la memoria es la unificada: `ram_gb`. */
    vram_gb?: number;
    /** `true`: aparato o servidor de la persona (el archivo de entrenamiento no sale). `false`: GPU prestada. */
    local: boolean;
    gratuito: boolean;
    /** `true`: tiene Docker para la caja sin red de Meta^n. La Mac de 8 GB no lo tiene. */
    docker?: boolean;
}

export interface MotorInfo {
    id: MotorFabrica;
    nombre: string;
    repo: string;
    licencia: string;
    tareas: readonly TareaFabrica[];
    bases: readonly FamiliaBase[];
    /** Aceleradores donde ENTRENA de verdad. Sin ellos solo prepara. */
    entrena_en: readonly Acelerador[];
    /** Qué deja al terminar. */
    salida: string;
    requisitos: readonly string[];
    limites: readonly string[];
}

/** Los tres motores, con lo comprobado en sus repos y en el SOP del aprendizaje. */
export const MOTORES: Readonly<Record<MotorFabrica, MotorInfo>> = {
    qvac: {
        id: "qvac",
        nombre: "QVAC Fabric BitNet (llama-finetune-lora)",
        repo: "https://github.com/tetherto/qvac-rnd-fabric-llm-bitnet",
        licencia: "Apache-2.0",
        tareas: ["adaptador"],
        bases: ["bitnet-1.58"],
        entrena_en: ["mps", "cuda"],
        salida: "Adaptador LoRA GGUF para llama-server --lora",
        requisitos: ["Metal (Mac con Apple Silicon) o una GPU compatible", "8 GB de memoria como mínimo, un adaptador cada vez y por turnos"],
        limites: ["Solo SFT: no aprende de preferencias", "Solo el BitNet 1.58 (TQ1_0/TQ2_0)"],
    },
    soup: {
        id: "soup",
        nombre: "Soup (soup-cli)",
        repo: "https://github.com/MakazhanAlpamys/Soup",
        licencia: "Apache-2.0",
        tareas: ["adaptador", "preferencias"],
        bases: ["estandar"],
        entrena_en: ["cuda", "mps"],
        salida: "Adaptador LoRA (carpeta de Soup) y GGUF fusionado con «soup export --format gguf --quant q4_k_m»",
        requisitos: [
            "Python 3.11 o 3.12 (la 0.76.1 de PyPI no instala en 3.13)",
            "GPU CUDA recomendada; Apple Silicon (MPS) soportado; CPU experimental y muy lenta",
            "8 GB de VRAM para 7B con QLoRA; 16 GB para ~14B; 24 GB para ~34B; 48 GB para ~70B",
        ],
        limites: [
            "No entrena con sentido en la Mac de 8 GB ni en el A1 (sin GPU): ahí solo prepara y valida",
            "QLoRA (4 bits) es de CUDA",
            "El GGUF de «soup export» sale FUSIONADO con su base; un adaptador suelto para llama-server --lora lo hace llama.cpp",
            "Entrena bases estándar de Hugging Face: un adaptador de Soup no se carga sobre el BitNet 1.58",
            "Desde la 0.75 rechaza las claves desconocidas del soup.yaml y desde la 0.76 los ajustes que aceptaba y no aplicaba",
        ],
    },
    onebitllms: {
        id: "onebitllms",
        nombre: "onebitllms (TII)",
        repo: "https://github.com/tiiuae/onebitllms",
        licencia: "Apache-2.0",
        tareas: ["refresco-base"],
        bases: ["bitnet-1.58"],
        entrena_en: ["cuda"],
        salida: "Un base 1.58 nuevo que baja a la neurona por el canal de despliegue",
        requisitos: ["GPU NVIDIA (kernels Triton)", "El ejemplo del repo usa 8×A10G durante 8,5 h: sin cifra propia de memoria mínima"],
        limites: ["No corre en Mac ni sin GPU NVIDIA", "Es afinado completo del base: nunca en la Mac"],
    },
    "meta-n": {
        id: "meta-n",
        nombre: "Meta^n (automejora del proceso)",
        repo: "https://github.com/minnesotanlp/meta-n",
        licencia: "MIT",
        tareas: ["proceso"],
        // No toca los pesos: el mismo proceso sirve sobre el BitNet 1.58 o sobre una base estándar.
        bases: [],
        // No entrena: solo propone dentro de su caja Docker.
        entrena_en: [],
        salida: "Pautas de texto para la capa y propuestas de funciones de ayuda",
        requisitos: ["Python ≥ 3.11 y Docker para la caja sin red ni claves", "Sin GPU; ~1 GB de RAM"],
        limites: [
            "Solo PROPONE dentro de la caja: el juez de StarSeed decide fuera y nunca ejecuta su código",
            "Las funciones de ayuda nunca se cargan en caliente: salen como propuesta de tarea al enjambre",
            "No mejora los pesos del modelo: mejora el proceso de la capa",
        ],
    },
};

/** Medios que conocemos hoy. Las cifras de Kaggle y Colab son del reparto gratuito y cambian con la cuota del día. */
export const MEDIOS_FABRICA: readonly MedioFabrica[] = [
    { id: "mac-8gb", nombre: "Mac de la fundación (8 GB, Apple Silicon)", ram_gb: 8, acelerador: "mps", local: true, gratuito: true, docker: false },
    { id: "a1-oracle", nombre: "A1 de Oracle (ARM, 2 OCPU, 12 GB, sin GPU)", ram_gb: 12, acelerador: "ninguno", local: true, gratuito: true, docker: true },
    { id: "contenedor-github", nombre: "Contenedor de GitHub (sin GPU)", ram_gb: 7, acelerador: "ninguno", local: false, gratuito: true, docker: true },
    { id: "kaggle-gpu", nombre: "Kaggle · GPU gratuita (T4 o P100, ~15 GB)", ram_gb: 29, acelerador: "cuda", vram_gb: 15, local: false, gratuito: true },
    { id: "colab-gpu", nombre: "Colab · GPU gratuita (T4, ~15 GB)", ram_gb: 12, acelerador: "cuda", vram_gb: 15, local: false, gratuito: true },
];

/** Ámbito de lo que se mejora: lo privado NUNCA va a un contenedor de GitHub. */
export type AmbitoFabrica = "privado" | "colectivo";

export interface NecesidadFabrica {
    tarea: TareaFabrica;
    base: FamiliaBase;
    /** Tamaño del modelo en miles de millones de parámetros, si se conoce (para comprobar la memoria). */
    parametros_b?: number;
    /**
     * Ámbito de la mejora (solo lo usa `proceso`). Sin declararlo se asume `privado`, que es lo más
     * protector: un ámbito colectivo tiene que decirlo a propósito para salir a un runner.
     */
    ambito?: AmbitoFabrica;
}

export type ModoFabrica = "entrenar" | "preparar" | "sin-camino";

export interface DecisionFabrica {
    motor: MotorFabrica | null;
    modo: ModoFabrica;
    medio: string;
    motivo: string;
    /** Lo que SÍ se puede hacer en este medio. */
    haceAqui: string[];
    /** Lo que impide entrenar aquí (vacío si entrena). */
    falta: string[];
    /** Ids de medios conocidos donde sí se entrenaría. */
    derivarA: string[];
    avisos: string[];
}

/** La necesidad por defecto del OS: un adaptador para el BitNet 1.58 de Astraura. */
export const NECESIDAD_DEFECTO: NecesidadFabrica = { tarea: "adaptador", base: "bitnet-1.58" };

/**
 * VRAM mínima para QLoRA 4 bits según la guía de Soup (README, «Supported Models»):
 * 8 GB ≈ 7B · 16 GB ≈ 14B · 24 GB ≈ 34B · 48 GB ≈ 70B · 80 GB+ más allá.
 */
export function vramMinimaQLoRA(parametros_b: number): number {
    if (parametros_b <= 7) return 8;
    if (parametros_b <= 14) return 16;
    if (parametros_b <= 34) return 24;
    if (parametros_b <= 70) return 48;
    return 80;
}

/** Regla de la casa (no de Soup): memoria unificada que comparte el sistema; con menos no se entrena en MPS. */
export const RAM_MINIMA_MPS_SOUP_GB = 16;

const MOTIVO_PROCESO = "Meta^n mejora el PROCESO de la capa: escribe pautas y funciones de ayuda, no los pesos.";

function motorPara(n: NecesidadFabrica): { motor: MotorFabrica | null; motivo: string } {
    if (n.tarea === "proceso") return { motor: "meta-n", motivo: MOTIVO_PROCESO };
    if (n.tarea === "refresco-base") {
        return n.base === "bitnet-1.58"
            ? { motor: "onebitllms", motivo: "El refresco del base 1.58 es afinado completo: solo lo hace onebitllms, en GPU NVIDIA." }
            : { motor: null, motivo: "Astraura no refresca bases estándar: ese modelo no es suyo, se usa tal cual o se le fabrica un adaptador." };
    }
    if (n.tarea === "preferencias") {
        return n.base === "estandar"
            ? { motor: "soup", motivo: "Aprender de preferencias (DPO, ORPO, KTO) lo hace Soup sobre una base estándar de Hugging Face." }
            : { motor: null, motivo: "No hay fábrica comprobada de preferencias para el BitNet 1.58: QVAC solo hace SFT y Soup no ha comprobado esa base." };
    }
    return n.base === "bitnet-1.58"
        ? { motor: "qvac", motivo: "El adaptador del BitNet 1.58 lo fabrica QVAC en el propio aparato, por turnos de memoria." }
        : { motor: "soup", motivo: "Un adaptador para una base estándar de Hugging Face lo fabrica Soup." };
}

const PREPARAR_SOUP = [
    "Instalar solo el núcleo ligero de Soup (sin PyTorch)",
    "Validar e inspeccionar el corpus exportado («soup data validate», «soup data inspect»)",
    "Comprobar el soup.yaml («soup doctor --config soup.yaml») antes de gastar GPU",
];

/** Por qué un medio no puede ejecutar Meta^n. La caja Docker sin red y claves es obligatoria. */
function faltaParaProceso(medio: MedioFabrica, ambito: AmbitoFabrica): string[] {
    const falta: string[] = [];
    if (medio.docker !== true) falta.push(`${medio.nombre} no tiene Docker: Meta^n corre dentro de una caja sin red ni claves.`);
    if (medio.ram_gb < 1) falta.push(`Meta^n pide ~1 GB de RAM y el medio tiene ${medio.ram_gb}.`);
    if (medio.id === "contenedor-github" && ambito === "privado") {
        falta.push("Lo privado nunca va a un contenedor de GitHub: ese medio solo vale para el ámbito colectivo.");
    }
    return falta;
}

/** La decisión de `proceso`: Meta^n dentro de una caja Docker, nunca `LocalExecutor` fuera de ella. */
function decidirProceso(medio: MedioFabrica, n: NecesidadFabrica, medios: readonly MedioFabrica[]): DecisionFabrica {
    const ambito = n.ambito ?? "privado";
    const avisos = [
        "Meta^n solo propone: el juez de StarSeed decide fuera de la caja y no ejecuta su código.",
        "Las funciones de ayuda nunca se cargan en caliente: salen como propuesta de tarea al enjambre.",
    ];
    const falta = faltaParaProceso(medio, ambito);
    if (falta.length === 0) {
        return {
            motor: "meta-n",
            modo: "entrenar",
            medio: medio.id,
            motivo: MOTIVO_PROCESO,
            haceAqui: [
                "Ejecutar Meta^n dentro de una caja Docker sin red y sin claves",
                "Proponer pautas de texto para la capa y funciones de ayuda que juzga StarSeed",
            ],
            falta: [],
            derivarA: [],
            avisos,
        };
    }
    const derivarA = medios.filter((m) => m.id !== medio.id && faltaParaProceso(m, ambito).length === 0).map((m) => m.id);
    return {
        motor: "meta-n",
        modo: "sin-camino",
        medio: medio.id,
        motivo: `${MOTIVO_PROCESO} ${medio.nombre} no puede: ${falta.join(" ")}`,
        haceAqui: [],
        falta,
        derivarA,
        avisos,
    };
}

/** ¿En qué medios conocidos entrenaría este motor con esta necesidad? */
function medioQueEntrena(motor: MotorFabrica, n: NecesidadFabrica, medio: MedioFabrica): string[] {
    const m = MOTORES[motor];
    if (!m.entrena_en.includes(medio.acelerador)) return [`Sin ${medio.acelerador === "ninguno" ? "GPU" : medio.acelerador.toUpperCase()}: ${m.nombre} entrena en ${m.entrena_en.join(" o ").toUpperCase()}.`];
    const falta: string[] = [];
    if (motor === "qvac" && medio.ram_gb < 8) falta.push(`QVAC pide al menos 8 GB y el medio tiene ${medio.ram_gb}.`);
    if (motor === "soup" && medio.acelerador === "cuda") {
        const min = n.parametros_b === undefined ? 0 : vramMinimaQLoRA(n.parametros_b);
        if ((medio.vram_gb ?? 0) < min) falta.push(`Un modelo de ${n.parametros_b}B pide ~${min} GB de VRAM con QLoRA y el medio tiene ${medio.vram_gb ?? 0}.`);
    }
    if (motor === "soup" && medio.acelerador === "mps" && medio.ram_gb < RAM_MINIMA_MPS_SOUP_GB) {
        falta.push(`Memoria unificada de ${medio.ram_gb} GB compartida con el sistema: para entrenar con Soup en MPS la casa pide ${RAM_MINIMA_MPS_SOUP_GB} GB.`);
    }
    return falta;
}

/**
 * Elige motor y modo para una necesidad en un medio. Honesto: si el medio no puede entrenar dice `preparar`
 * (con lo que sí se hace ahí) o `sin-camino`, y apunta a los medios conocidos donde sí entrenaría.
 */
export function elegirFabrica(medio: MedioFabrica, necesidad: NecesidadFabrica = NECESIDAD_DEFECTO, medios: readonly MedioFabrica[] = MEDIOS_FABRICA): DecisionFabrica {
    const { motor, motivo } = motorPara(necesidad);
    if (!motor) {
        return { motor: null, modo: "sin-camino", medio: medio.id, motivo, haceAqui: [], falta: [motivo], derivarA: [], avisos: [] };
    }
    // Meta^n no entrena pesos ni prepara en un medio sin caja: se decide aparte, antes de la tabla de aceleradores.
    if (necesidad.tarea === "proceso") return decidirProceso(medio, necesidad, medios);
    const info = MOTORES[motor];
    const falta = medioQueEntrena(motor, necesidad, medio);
    const avisos: string[] = [];
    if (motor === "onebitllms" && falta.length === 0) avisos.push("onebitllms no publica una memoria mínima: su ejemplo usa 8×A10G. Puede no caber en una GPU gratuita.");
    if (motor === "soup" && medio.acelerador === "mps" && falta.length === 0) {
        avisos.push("Soup soporta MPS pero no publica cifras de rendimiento: empieza por el modelo más pequeño. QLoRA (4 bits) es de CUDA; aquí va LoRA sin cuantizar.");
    }
    if (motor === "soup" && necesidad.parametros_b === undefined && medio.acelerador === "cuda") avisos.push("Sin el tamaño del modelo no se puede comprobar la VRAM.");
    if (!medio.local && falta.length === 0) avisos.push("El archivo de entrenamiento sale de la neurona hacia este medio: pide el consentimiento explícito de quien lo aporta.");

    if (falta.length === 0) {
        return { motor, modo: "entrenar", medio: medio.id, motivo, haceAqui: [`Entrenar con ${info.nombre}`, ...(motor === "soup" ? PREPARAR_SOUP : [])], falta: [], derivarA: [], avisos };
    }
    const derivarA = medios.filter((m) => m.id !== medio.id && medioQueEntrena(motor, necesidad, m).length === 0).map((m) => m.id);
    const puedePreparar = motor === "soup";
    return {
        motor,
        modo: puedePreparar ? "preparar" : "sin-camino",
        medio: medio.id,
        motivo: puedePreparar ? `${motivo} ${medio.nombre} no entrena con ${info.nombre} de forma útil: aquí solo se prepara.` : `${motivo} ${medio.nombre} no puede.`,
        haceAqui: puedePreparar ? PREPARAR_SOUP : [],
        falta,
        derivarA,
        avisos,
    };
}

// Soup: la configuración y las órdenes viven en `soup.ts`; se reexportan aquí para que la fábrica sea UNA puerta.
export {
    CLAVES_SOUP,
    PYTHON_SOUP,
    REPO_SOUP,
    TAREAS_SOUP,
    VERSION_SOUP_VERIFICADA,
    comandosSoup,
    configSoup,
    guionKaggleColab,
    validarConfigSoup,
} from "./soup";
export type { ConfigSoup, OrdenSoup, PeticionSoup, ResultadoComandosSoup, ResultadoConfigSoup, TareaSoup } from "./soup";
