/**
 * Soup como fábrica de adaptadores (Ola 1025U · fábrica intercambiable) — módulo PURO.
 * ──────────────────────────────────────────────────────────────────────────────────
 * Soup (https://github.com/MakazhanAlpamys/Soup, Apache-2.0) afina modelos de lenguaje desde UN
 * archivo `soup.yaml`. Este módulo NO ejecuta Soup, no instala nada y no toca el disco: solo
 *   · genera el `soup.yaml` de una petición (SFT, DPO, ORPO o KTO; LoRA o QLoRA),
 *   · lo valida contra las claves que Soup DOCUMENTA (la v0.75 rechaza las desconocidas y la
 *     v0.76 rechaza además los ajustes que aceptaba y nunca aplicaba), y
 *   · lista las órdenes exactas y un guion para Kaggle o Colab, donde sí hay GPU.
 *
 * Verificado el 2026-10-25 contra README, docs/training.md, docs/data.md, docs/serving-and-export.md
 * y docs/commands.md de Soup, y contra PyPI (soup-cli 0.76.1, 2026-10-14). Cada clave de abajo
 * lleva su origen; no hay ninguna inventada. Lo que Soup no documenta (por ejemplo una sección
 * `export:` en el YAML) NO se escribe: el export va por orden de línea de comandos.
 *
 * Sin `node:*` (CLAUDE.md, trampa 11): lo puede importar código de cliente.
 */

import type { Acelerador } from "./fabricas";

/** Versión de Soup contra la que se comprobaron las claves (PyPI, 2026-10-14). */
export const VERSION_SOUP_VERIFICADA = "0.76.1";

/**
 * Pythons que sirven a la vez a la v0.76.1 de PyPI (`>=3.10,<3.13`) y al README actual de Soup (3.11–3.13).
 * Se pide 3.11 o 3.12: con 3.13 la rueda de PyPI de la 0.76.1 se niega a instalarse.
 */
export const PYTHON_SOUP = "3.12";

export const REPO_SOUP = "https://github.com/MakazhanAlpamys/Soup";

export type TareaSoup = "sft" | "dpo" | "orpo" | "kto";
export type MetodoSoup = "lora" | "qlora";
export type FormatoDatosSoup = "chatml" | "alpaca" | "sharegpt" | "dpo" | "kto";
export type TipoSujeto = "personalidad" | "agente" | "bot" | "capa";

/** Tareas que esta fábrica genera. GRPO, PPO y compañía existen en Soup pero piden una función de recompensa: no se generan. */
export const TAREAS_SOUP: readonly TareaSoup[] = ["sft", "dpo", "orpo", "kto"];

/** Formato de datos que Soup documenta para cada tarea (README «Data Formats» y docs/training.md). */
const FORMATOS_POR_TAREA: Record<TareaSoup, readonly FormatoDatosSoup[]> = {
    sft: ["chatml", "alpaca", "sharegpt"],
    dpo: ["dpo"],
    orpo: ["dpo"], // docs/training.md · ORPO usa `format: dpo`
    kto: ["kto"],
};

const CLAVE_BETA: Partial<Record<TareaSoup, "dpo_beta" | "orpo_beta" | "kto_beta">> = {
    dpo: "dpo_beta",
    orpo: "orpo_beta",
    kto: "kto_beta",
};

/**
 * Las ÚNICAS claves que escribe y acepta esta fábrica, con el documento de Soup donde se comprobó.
 * Si Soup añade una clave nueva, se añade aquí con su origen; nunca de memoria.
 */
export const CLAVES_SOUP = {
    raiz: ["base", "task", "backend", "modality", "data", "training", "output"],
    data: ["train", "format", "val_split", "max_length"],
    training: [
        "epochs", "lr", "batch_size", "gradient_accumulation_steps", "quantization",
        "eval_steps", "lora", "dpo_beta", "orpo_beta", "kto_beta",
    ],
    lora: ["r", "alpha", "dropout", "target_modules"],
} as const;

/** De dónde sale cada clave (para quien mantenga esto cuando salga otra versión de Soup). */
export const ORIGEN_CLAVES_SOUP: Readonly<Record<string, string>> = {
    "base, task, output, data.train, data.format, data.val_split, training.epochs, training.lr, training.batch_size, training.lora.r, training.lora.alpha, training.quantization":
        "README · Configuration (el soup.yaml completo de ejemplo)",
    "data.max_length": "docs/training.md · ejemplos de GRPO, destilación y clasificación",
    "training.gradient_accumulation_steps": "docs/training.md · KTO («Raise gradient_accumulation_steps»)",
    "training.eval_steps": "docs/training.md · «Validation split & evaluation»",
    "training.dpo_beta": "docs/training.md · DPO Training",
    "training.orpo_beta": "docs/training.md · ORPO Training",
    "training.kto_beta": "docs/training.md · KTO Training",
    "training.lora.dropout, training.lora.target_modules": "docs/peft-and-efficiency.md",
    "modality, backend": "docs/training.md · «Full fine-tuning» (`modality: text`, `backend: transformers`)",
};

/** Petición de una fábrica Soup para un sujeto (personalidad, agente, bot o capa de conciencia). */
export interface PeticionSoup {
    sujeto: { tipo: TipoSujeto; id: string };
    /** Modelo base de Hugging Face, «organización/nombre». */
    base: string;
    tarea?: TareaSoup;
    /** QLoRA (4 bits) solo existe en CUDA; en MPS o CPU se escribe LoRA sin cuantizar. */
    metodo?: MetodoSoup;
    /** Dónde se entrenará. Por defecto CUDA (Kaggle o Colab). */
    acelerador?: Acelerador;
    /** Sello de consentimiento del corpus que alimenta el entrenamiento. Sin él no se genera nada. */
    consentimiento: { otorgado: boolean };
    /** Ruta RELATIVA del archivo de entrenamiento exportado del corpus; por defecto la del exportador. */
    rutaDatos?: string;
    formatoDatos?: FormatoDatosSoup;
    epocas?: number;
    lr?: number;
    rango?: number;
    alfa?: number;
    dropout?: number;
    maxLength?: number;
    valSplit?: number;
    beta?: number;
}

/** El `soup.yaml` como objeto: solo claves de `CLAVES_SOUP`. */
export interface ConfigSoup {
    base: string;
    task: TareaSoup;
    data: { train: string; format: FormatoDatosSoup; val_split: number; max_length: number };
    training: {
        epochs: number;
        lr?: number;
        batch_size: "auto" | number;
        quantization: "4bit" | "none";
        lora: { r: number; alpha: number; dropout: number; target_modules: "auto" };
        dpo_beta?: number;
        orpo_beta?: number;
        kto_beta?: number;
    };
    output: string;
}

export type ResultadoConfigSoup =
    | { ok: true; config: ConfigSoup; yaml: string; avisos: string[] }
    | { ok: false; errores: string[] };

/** «Pérez Ñandú» → «perez-nandu»: apto para nombres de carpeta, sin acentos ni símbolos. */
export function slugSujeto(id: string): string {
    return String(id ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

const RE_BASE_HF = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

/** Una ruta de datos válida es relativa, sin `..`, sin unidad de disco y sin tocar un `.env`. */
export function rutaRelativaSegura(ruta: string): boolean {
    const r = String(ruta ?? "").trim();
    if (!r || r.startsWith("/") || r.startsWith("~") || /^[A-Za-z]:[\\/]/.test(r) || r.includes("\\")) return false;
    if (r.split("/").includes("..")) return false;
    return !/(^|\/)\.env/i.test(r);
}

/** Ruta por defecto del archivo de entrenamiento que deja el exportador del corpus. */
export function rutaDatosPorDefecto(sujeto: { tipo: TipoSujeto; id: string }): string {
    return `./data/aprendizaje/corpus/${slugSujeto(sujeto.id)}/train.jsonl`;
}

/** Carpeta de salida del adaptador de este sujeto. */
export function rutaSalidaSoup(sujeto: { tipo: TipoSujeto; id: string }): string {
    return `./output/${sujeto.tipo}-${slugSujeto(sujeto.id)}`;
}

/** Genera el `soup.yaml` de una petición, o dice por qué no. Nunca lanza. */
export function configSoup(p: PeticionSoup): ResultadoConfigSoup {
    const errores: string[] = [];
    const avisos: string[] = [];
    if (p?.consentimiento?.otorgado !== true) {
        errores.push("Sin sello de consentimiento del corpus no se prepara ningún entrenamiento: los datos son de la persona.");
    }
    const slug = slugSujeto(p?.sujeto?.id);
    if (!slug) errores.push("El sujeto (personalidad, agente, bot o capa) necesita un id.");
    if (!RE_BASE_HF.test(String(p?.base ?? ""))) {
        errores.push("La base debe ser un modelo de Hugging Face con la forma «organización/nombre».");
    }
    const tarea: TareaSoup = p?.tarea ?? "sft";
    if (!TAREAS_SOUP.includes(tarea)) errores.push(`La tarea «${String(tarea)}» no la genera esta fábrica (solo ${TAREAS_SOUP.join(", ")}).`);

    const datos = p?.rutaDatos ?? (slug ? rutaDatosPorDefecto(p.sujeto) : "");
    if (!rutaRelativaSegura(datos)) errores.push("El archivo de entrenamiento debe ir por una ruta relativa, sin «..» ni rutas de .env.");
    const formatos = FORMATOS_POR_TAREA[tarea] ?? [];
    const formato: FormatoDatosSoup = p?.formatoDatos ?? formatos[0];
    if (formatos.length > 0 && !formatos.includes(formato)) {
        errores.push(`La tarea ${tarea} lee datos «${formatos.join("» o «")}», no «${String(formato)}».`);
    }

    const rango = p?.rango ?? 16;
    const alfa = p?.alfa ?? rango * 2;
    const epocas = p?.epocas ?? 3;
    const valSplit = p?.valSplit ?? 0.1;
    const maxLength = p?.maxLength ?? 2048;
    const dropout = p?.dropout ?? 0.05;
    const beta = p?.beta ?? 0.1;
    if (!Number.isInteger(rango) || rango < 1 || rango > 256) errores.push("El rango de LoRA debe ser un entero entre 1 y 256 (rango 0 sería afinar el modelo entero).");
    if (!(alfa > 0)) errores.push("El alfa de LoRA debe ser mayor que 0.");
    if (!Number.isInteger(epocas) || epocas < 1 || epocas > 20) errores.push("Las épocas deben ser un entero entre 1 y 20.");
    if (!(valSplit >= 0 && valSplit <= 0.5)) errores.push("La parte de validación debe estar entre 0 y 0,5.");
    if (!Number.isInteger(maxLength) || maxLength < 128 || maxLength > 32768) errores.push("La longitud máxima debe ser un entero entre 128 y 32768.");
    if (!(dropout >= 0 && dropout < 1)) errores.push("El dropout de LoRA debe estar entre 0 y 1.");
    if (CLAVE_BETA[tarea] && !(beta > 0 && beta <= 1)) errores.push("Beta debe estar entre 0 (excluido) y 1.");
    if (p?.lr !== undefined && !(p.lr > 0 && p.lr < 1)) errores.push("La tasa de aprendizaje debe estar entre 0 y 1.");
    if (errores.length > 0) return { ok: false, errores };

    const acelerador: Acelerador = p.acelerador ?? "cuda";
    let metodo: MetodoSoup = p.metodo ?? (acelerador === "cuda" ? "qlora" : "lora");
    if (metodo === "qlora" && acelerador !== "cuda") {
        metodo = "lora";
        avisos.push("QLoRA (4 bits) es de CUDA: en MPS o CPU se escribe LoRA sin cuantizar («quantization: none»).");
    }
    if (tarea === "sft" && !formatos.includes(formato)) avisos.push("Formato de datos no estándar para SFT.");
    avisos.push(
        "Soup 0.76 rechaza al cargar las claves desconocidas y los ajustes que nunca aplicaba: ejecuta «soup doctor --config soup.yaml» antes de entrenar o de actualizar Soup.",
    );

    const training: ConfigSoup["training"] = {
        epochs: epocas,
        ...(tarea === "sft" || p.lr !== undefined ? { lr: p.lr ?? 2e-5 } : {}),
        batch_size: "auto",
        quantization: metodo === "qlora" ? "4bit" : "none",
        lora: { r: rango, alpha: alfa, dropout, target_modules: "auto" },
    };
    const claveBeta = CLAVE_BETA[tarea];
    if (claveBeta) training[claveBeta] = beta;

    const config: ConfigSoup = {
        base: p.base,
        task: tarea,
        data: { train: datos, format: formato, val_split: valSplit, max_length: maxLength },
        training,
        output: rutaSalidaSoup(p.sujeto),
    };
    const validada = validarConfigSoup(config);
    if (!validada.ok) return { ok: false, errores: validada.errores };
    return { ok: true, config, yaml: aYamlSoup(config, p.sujeto), avisos };
}

/* ───────────────────────────── Validación ───────────────────────────── */

export interface ValidacionConfigSoup {
    ok: boolean;
    errores: string[];
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clavesDesconocidas(obj: Record<string, unknown>, validas: readonly string[], ruta: string, errores: string[]): void {
    for (const k of Object.keys(obj)) {
        if (!validas.includes(k)) {
            errores.push(`clave desconocida «${ruta}${k}»: Soup 0.75 en adelante se niega a cargar el archivo.`);
        }
    }
}

/**
 * Valida un `soup.yaml` ya convertido a objeto (el nuestro o uno ajeno) contra las claves documentadas.
 * Rechaza lo mismo que rechaza Soup al cargar: claves desconocidas, aunque sean secciones enteras como `export:`.
 */
export function validarConfigSoup(crudo: unknown): ValidacionConfigSoup {
    const errores: string[] = [];
    if (!esObjeto(crudo)) return { ok: false, errores: ["La configuración debe ser un objeto."] };
    clavesDesconocidas(crudo, CLAVES_SOUP.raiz, "", errores);

    const tarea = crudo.task;
    if (typeof crudo.base !== "string" || !RE_BASE_HF.test(crudo.base)) errores.push("«base» debe ser «organización/nombre» de Hugging Face.");
    if (typeof tarea !== "string" || !TAREAS_SOUP.includes(tarea as TareaSoup)) errores.push(`«task» debe ser una de: ${TAREAS_SOUP.join(", ")}.`);
    if (crudo.backend !== undefined && crudo.backend !== "transformers") errores.push("«backend» solo puede ser «transformers» (unsloth se rechaza en varias tareas desde la 0.76).");
    if (crudo.modality !== undefined && crudo.modality !== "text") errores.push("«modality» solo puede ser «text».");
    if (typeof crudo.output !== "string" || !rutaRelativaSegura(crudo.output)) errores.push("«output» debe ser una ruta relativa.");

    const data = crudo.data;
    if (!esObjeto(data)) errores.push("Falta la sección «data».");
    else {
        clavesDesconocidas(data, CLAVES_SOUP.data, "data.", errores);
        if (typeof data.train !== "string" || !rutaRelativaSegura(data.train)) errores.push("«data.train» debe ser una ruta relativa.");
        const permitidos = FORMATOS_POR_TAREA[tarea as TareaSoup];
        if (permitidos && !permitidos.includes(data.format as FormatoDatosSoup)) {
            errores.push(`«data.format» para ${String(tarea)} debe ser ${permitidos.join(" o ")}.`);
        }
        if (typeof data.val_split !== "number" || data.val_split < 0 || data.val_split > 0.5) errores.push("«data.val_split» debe estar entre 0 y 0,5.");
        if (data.max_length !== undefined && (!Number.isInteger(data.max_length) || (data.max_length as number) < 128)) errores.push("«data.max_length» debe ser un entero de al menos 128.");
    }

    const tr = crudo.training;
    if (!esObjeto(tr)) errores.push("Falta la sección «training».");
    else {
        clavesDesconocidas(tr, CLAVES_SOUP.training, "training.", errores);
        if (!Number.isInteger(tr.epochs) || (tr.epochs as number) < 1) errores.push("«training.epochs» debe ser un entero positivo.");
        if (tr.quantization !== "4bit" && tr.quantization !== "none") errores.push("«training.quantization» debe ser 4bit o none.");
        if (tr.batch_size !== undefined && tr.batch_size !== "auto" && !(Number.isInteger(tr.batch_size) && (tr.batch_size as number) >= 1)) {
            errores.push("«training.batch_size» debe ser «auto» o un entero positivo.");
        }
        if (tarea === "kto" && typeof tr.batch_size === "number" && tr.batch_size < 2) errores.push("KTO necesita batch_size de al menos 2 (con 1 Soup se niega a cargar).");
        for (const t of TAREAS_SOUP) {
            const clave = CLAVE_BETA[t];
            if (clave && t !== tarea && tr[clave] !== undefined) errores.push(`«training.${clave}» no pertenece a la tarea ${String(tarea)}.`);
        }
        const claveTarea = CLAVE_BETA[tarea as TareaSoup];
        if (claveTarea && !(typeof tr[claveTarea] === "number" && (tr[claveTarea] as number) > 0)) errores.push(`Falta «training.${claveTarea}».`);
        const lora = tr.lora;
        if (!esObjeto(lora)) errores.push("Falta «training.lora».");
        else {
            clavesDesconocidas(lora, CLAVES_SOUP.lora, "training.lora.", errores);
            if (!Number.isInteger(lora.r) || (lora.r as number) < 1) errores.push("«training.lora.r» debe ser un entero positivo.");
            if (typeof lora.alpha !== "number" || lora.alpha <= 0) errores.push("«training.lora.alpha» debe ser positivo.");
        }
    }
    return { ok: errores.length === 0, errores };
}

/* ───────────────────────────── YAML ───────────────────────────── */

const RE_ESCALAR_LLANO = /^(\.\/)?[A-Za-z0-9_][A-Za-z0-9_./-]*$/;
const RE_PARECE_NUMERO_O_LITERAL = /^(true|false|null|yes|no|on|off|~|[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?)$/i;

function escalar(v: string): string {
    return RE_ESCALAR_LLANO.test(v) && !RE_PARECE_NUMERO_O_LITERAL.test(v) ? v : JSON.stringify(v);
}

function numero(v: number, exponencial = false): string {
    return exponencial ? v.toExponential() : String(v);
}

/** Serializa la configuración en el orden del ejemplo del README de Soup, con una cabecera de comentarios. */
export function aYamlSoup(c: ConfigSoup, sujeto?: { tipo: TipoSujeto; id: string }): string {
    const t = c.training;
    const L: string[] = [];
    if (sujeto) L.push(`# Fábrica Soup de StarSeed OS · ${sujeto.tipo} «${slugSujeto(sujeto.id)}»`);
    L.push(
        `# Probado contra las claves documentadas de Soup ${VERSION_SOUP_VERIFICADA}. Antes de entrenar: soup doctor --config soup.yaml`,
        `base: ${escalar(c.base)}`,
        `task: ${c.task}`,
        "",
        "data:",
        `  train: ${escalar(c.data.train)}`,
        `  format: ${c.data.format}`,
        `  val_split: ${numero(c.data.val_split)}`,
        `  max_length: ${c.data.max_length}`,
        "",
        "training:",
        `  epochs: ${t.epochs}`,
    );
    if (t.lr !== undefined) L.push(`  lr: ${numero(t.lr, true)}`);
    L.push(`  batch_size: ${t.batch_size}`);
    for (const clave of ["dpo_beta", "orpo_beta", "kto_beta"] as const) {
        if (t[clave] !== undefined) L.push(`  ${clave}: ${numero(t[clave] as number)}`);
    }
    L.push(
        "  lora:",
        `    r: ${t.lora.r}`,
        `    alpha: ${numero(t.lora.alpha)}`,
        `    dropout: ${numero(t.lora.dropout)}`,
        `    target_modules: ${t.lora.target_modules}`,
        `  quantization: ${t.quantization}`,
        "",
        `output: ${escalar(c.output)}`,
        "",
    );
    return L.join("\n");
}

/* ───────────────────────────── Órdenes ───────────────────────────── */

export type FaseSoup = "entorno" | "preparar" | "entrenar" | "evaluar" | "exportar" | "servir";

export interface OrdenSoup {
    id: string;
    fase: FaseSoup;
    /** La orden EXACTA, tal como se escribe en la terminal de ese medio. */
    orden: string;
    /** `cualquiera`: sirve también en la Mac o el A1 (solo prepara). `gpu`: pide el medio con GPU. */
    donde: "cualquiera" | "gpu";
    nota: string;
    /** `true` si la orden NO es de Soup (por ejemplo una herramienta de llama.cpp). */
    fuera_de_soup?: boolean;
}

export type ResultadoComandosSoup =
    | { ok: true; version: string; python: string; ordenes: OrdenSoup[]; guion: string }
    | { ok: false; errores: string[] };

export interface OpcionesComandosSoup {
    version?: string;
    /** Archivo de evaluación del Evaluador (JSONL), para `soup eval custom`. */
    archivoEvaluacion?: string;
    /** Nombre del archivo de configuración. */
    archivoConfig?: string;
}

/**
 * Órdenes exactas del ciclo completo para una configuración, en el orden en que se ejecutan, más un guion
 * para Kaggle o Colab (formato de celdas `# %%`, que ambos importan). No ejecuta nada.
 */
export function comandosSoup(config: ConfigSoup, op: OpcionesComandosSoup = {}): ResultadoComandosSoup {
    const validada = validarConfigSoup(config);
    if (!validada.ok) return { ok: false, errores: validada.errores };
    const version = op.version ?? VERSION_SOUP_VERIFICADA;
    const yamlNombre = op.archivoConfig ?? "soup.yaml";
    const salida = config.output;
    const gguf = `${salida}/model.q4_k_m.gguf`;
    const evalArchivo = op.archivoEvaluacion ?? "./data/aprendizaje/eval/eval.jsonl";
    const o = (
        id: string, fase: FaseSoup, orden: string, donde: OrdenSoup["donde"], nota: string, fuera?: boolean,
    ): OrdenSoup => ({ id, fase, orden, donde, nota, ...(fuera ? { fuera_de_soup: true } : {}) });

    const ordenes: OrdenSoup[] = [
        o("instalar-ligero", "entorno", `pip install "soup-cli==${version}"`, "cualquiera",
            `Núcleo ligero, sin PyTorch: basta para validar datos y configuración. Python ${PYTHON_SOUP} (o 3.11) en un entorno virtual.`),
        o("instalar-entrenar", "entorno", `pip install "soup-cli[train]==${version}"`, "gpu",
            "Añade PyTorch, transformers, peft, trl y datasets. Comillas dobles siempre. Fija la versión: la 0.76 ya rechaza configuraciones que la 0.74 aceptaba."),
        o("doctor", "preparar", "soup doctor", "cualquiera", "Comprueba GPU, memoria y dependencias del medio."),
        o("doctor-config", "preparar", `soup doctor --config ${yamlNombre}`, "cualquiera",
            "Dice si Soup aceptará el archivo (claves desconocidas, ajustes que nunca aplicaba). Obligatorio antes de entrenar o de actualizar Soup."),
        o("validar-datos", "preparar", `soup data validate ${config.data.train} --format ${config.data.format}`, "cualquiera",
            "Cuenta las filas válidas del corpus exportado y nombra las que Soup descartaría."),
        o("inspeccionar-datos", "preparar", `soup data inspect ${config.data.train}`, "cualquiera", "Estadísticas del conjunto de entrenamiento."),
        o("entrenar", "entrenar", `soup train --config ${yamlNombre}`, "gpu", "Entrena el adaptador. Sin GPU de verdad (CUDA, o MPS con memoria de sobra) no se lanza."),
        o("comprobar-adaptador", "entrenar", `soup adapters check ${salida}`, "gpu",
            "Dice si el adaptador aprendió algo o quedó inactivo (sale con código 2 si está inactivo)."),
        o("evaluar", "evaluar", `soup eval custom --model ${salida} --tasks ${evalArchivo}`, "gpu",
            "Evalúa con las tareas del Evaluador (por personalidad). La puerta de regresión de Astraura decide después si el adaptador sale."),
        o("exportar-gguf", "exportar", `soup export --model ${salida} --format gguf --quant q4_k_m`, "gpu",
            "Fusiona el adaptador con su base y deja un GGUF cuantizado COMPLETO (no un adaptador suelto). Clona la herramienta de llama.cpp: pide internet."),
        o("adaptador-gguf", "exportar", `python convert_lora_to_gguf.py --base <carpeta-de-la-base-HF> --outfile ${salida}/adapter.gguf ${salida}`, "gpu",
            "Solo si se quiere un adaptador LoRA suelto para «llama-server --lora». Lo hace llama.cpp, NO Soup (que no documenta esa salida): comprueba la orden contra tu copia de llama.cpp.", true),
        o("servir-modelo", "servir", `llama-server -m ${gguf}`, "cualquiera",
            "Sirve el GGUF fusionado con llama.cpp. Alternativa de Soup: «soup serve --model " + salida + " --port 8000» (API compatible con OpenAI, transformers)."),
        o("servir-lora", "servir", `llama-server -m <base.gguf> --lora ${salida}/adapter.gguf`, "cualquiera",
            "Con el adaptador suelto. La base tiene que ser LA MISMA con la que se entrenó: un adaptador de Soup no se carga sobre el BitNet 1.58.", true),
    ];
    return { ok: true, version, python: PYTHON_SOUP, ordenes, guion: guionKaggleColab(config, ordenes, yamlNombre) };
}

/**
 * Guion de celdas `# %%` para Kaggle o Colab. El corpus es privado: se sube como dataset privado (Kaggle) o al disco
 * de la sesión (Colab) y se borra al acabar. Ningún token va escrito aquí: si la base es privada, el token entra por
 * los secretos del servicio (variable HF_TOKEN), nunca por el cuaderno.
 */
export function guionKaggleColab(config: ConfigSoup, ordenes: OrdenSoup[], yamlNombre = "soup.yaml"): string {
    const yaml = aYamlSoup(config);
    const de = (id: string): string => ordenes.find((x) => x.id === id)?.orden ?? "";
    const carpetaDatos = config.data.train.replace(/\/[^/]*$/, "");
    return [
        "# %% [markdown]",
        `# # Fábrica Soup de StarSeed OS (${config.task}, ${config.training.quantization === "4bit" ? "QLoRA" : "LoRA"})`,
        "# Corre en una GPU gratuita de Kaggle o Colab. El corpus es de una persona: súbelo como dataset PRIVADO y borra la sesión al acabar.",
        "# Si la base necesita permiso, añade HF_TOKEN en los secretos del servicio (nunca en este cuaderno).",
        "",
        "# %% Python compatible con Soup (3.11 o 3.12)",
        "import sys",
        "assert (3, 11) <= sys.version_info[:2] <= (3, 12), f'Soup 0.76 pide Python 3.11 o 3.12, hay {sys.version}'",
        "",
        "# %% Instalar Soup con la versión comprobada",
        `!${de("instalar-entrenar")}`,
        "",
        "# %% Configuración",
        "from pathlib import Path",
        `Path("${yamlNombre}").write_text("""${yaml}""")`,
        `Path("${carpetaDatos}").mkdir(parents=True, exist_ok=True)`,
        `# Kaggle: !cp /kaggle/input/<tu-dataset-privado>/train.jsonl ${config.data.train}`,
        `# Colab: sube train.jsonl a ${carpetaDatos}/ con el panel de archivos`,
        "",
        "# %% Comprobar entorno, configuración y datos",
        `!${de("doctor")}`,
        `!${de("doctor-config")}`,
        `!${de("validar-datos")}`,
        "",
        "# %% Entrenar y comprobar que el adaptador aprendió",
        `!${de("entrenar")}`,
        `!${de("comprobar-adaptador")}`,
        "",
        "# %% Exportar a GGUF (q4_k_m)",
        `!${de("exportar-gguf")}`,
        "",
        "# %% Descargar el resultado y borrar los datos",
        `# Descarga ${config.output}/ y borra ${carpetaDatos}/ antes de cerrar la sesión.`,
        "",
    ].join("\n");
}
