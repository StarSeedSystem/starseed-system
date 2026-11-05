// StarSeed OS — Educación · tutor nativo (DeepTutor: explicar, comprobar, practicar, resumir). PURO, sin `node:*`.
export type NivelTutoria = "principiante" | "intermedio" | "avanzado";
export type PasoId = "explicar" | "comprobar" | "practicar" | "resumir";
export interface RecuerdoTutor { titulo?: string; contenido: string }
export type RecuerdoEntrada = RecuerdoTutor | string;
export interface EntradaTutoria { concepto: string; nivel?: NivelTutoria | string; recuerdos?: RecuerdoEntrada[] }
export interface PasoTutoria { id: PasoId; titulo: string; instruccion: string }
export interface PlanTutoria { concepto: string; nivel: NivelTutoria; pasos: PasoTutoria[]; base: RecuerdoTutor[] }

const MAX_RECUERDOS = 8;
const MAX_CARACTERES_RECUERDO = 600;

function normalizar(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

const PETICIONES: readonly RegExp[] = [
    /^\s*(explicame|explicamelo|explicamela|ensen(ame|amelo|amela))\b/,
    /\b(quiero|necesito|deseo|me gustaria) (aprender|entender|estudiar|saber)\b/,
    /\b(no (lo |te )?entiendo|no acabo de entender)\b/,
    /\bayudame a (entender|aprender|estudiar)\b/,
    /\b(aprender|estudiar) (sobre|acerca de)\b/,
    /\bcomo (puedo|se puede|podria) (aprender|entender|estudiar)\b/,
    /^\s*(teach me|help me (understand|learn)|i (want|need|would like|'d like) to (learn|understand|know))\b/,
    /\b(i (do not|don'?t|cannot|can'?t) (really )?understand|explain (this|that|it|how|why|what)|explain to me)\b/,
];

const FORMULAS: readonly RegExp[] = [
    /\bcomo funciona\b/,
    /\bcomo se (hace|usa|construye)\b/,
    /\bhow (does|do|can|could) .+ work\b/,
];
const FORMULA_AL_INICIO = /^(?:como funciona|como se (hace|usa|construye)|how (does|do|can|could) .+ work)\b/;

/** ¿El texto pide que le enseñen o le expliquen algo? Sin falsos positivos obvios. */
export function esPeticionDeAprender(texto: string): boolean {
    if (typeof texto !== "string") return false;
    const t = normalizar(texto);
    if (!t) return false;
    const inicio = t.replace(/^[¿¡\s]+/, "").replace(/^(hola|oye|buenas|hey|por favor)[, ]+/, "");
    if (PETICIONES.some((re) => re.test(inicio))) return true;
    if (FORMULA_AL_INICIO.test(inicio)) return true;
    return t.includes("?") && FORMULAS.some((re) => re.test(t));
}

export function normalizarNivel(nivel?: string): NivelTutoria {
    const n = normalizar(typeof nivel === "string" ? nivel : "");
    if (/^(avanzad|advanced|experto|expert|alto|superior)/.test(n)) return "avanzado";
    if (/^(intermedi|intermediate|medio|medium)/.test(n)) return "intermedio";
    return "principiante";
}

function normalizarRecuerdos(recuerdos?: RecuerdoEntrada[]): RecuerdoTutor[] {
    if (!Array.isArray(recuerdos)) return [];
    const vistos = new Set<string>();
    const salida: RecuerdoTutor[] = [];
    for (const r of recuerdos) {
        const bruto = typeof r === "string" ? r : r?.contenido;
        if (typeof bruto !== "string") continue;
        const contenido = bruto.trim().slice(0, MAX_CARACTERES_RECUERDO);
        if (!contenido || vistos.has(contenido)) continue;
        vistos.add(contenido);
        const titulo = typeof r === "string" ? "" : r.titulo?.trim();
        salida.push(titulo ? { titulo, contenido } : { contenido });
        if (salida.length >= MAX_RECUERDOS) break;
    }
    return salida;
}

function apoyo(base: RecuerdoTutor[]): string {
    if (!base.length) return "No hay memorias propias de este tema: parte de conocimiento general y dilo con honestidad.";
    return `Apóyate en estas memorias del cerebro: ${base.map((r) => (r.titulo ? `${r.titulo}: ${r.contenido}` : r.contenido)).join(" | ")}.`;
}

export function planTutoria(entrada: EntradaTutoria): PlanTutoria {
    const concepto = (entrada?.concepto ?? "").trim() || "el tema";
    const nivel = normalizarNivel(entrada?.nivel);
    const base = normalizarRecuerdos(entrada?.recuerdos);
    const memorias = apoyo(base);
    return {
        concepto,
        nivel,
        base,
        pasos: [
            { id: "explicar", titulo: "Explicar", instruccion: `Explica «${concepto}» a nivel ${nivel}, en 3 a 5 párrafos claros y con un ejemplo cotidiano. ${memorias}` },
            { id: "comprobar", titulo: "Comprobar", instruccion: `Haz UNA sola pregunta de comprobación sobre «${concepto}» que obligue a razonar y no a recitar. No des la respuesta: espera la del estudiante.` },
            { id: "practicar", titulo: "Practicar", instruccion: `Propón un ejercicio breve de «${concepto}» para nivel ${nivel}, con su criterio de corrección. Si falla, da una pista antes de revelar la solución. ${memorias}` },
            { id: "resumir", titulo: "Resumir", instruccion: `Cierra con un resumen de 3 a 5 puntos de «${concepto}» y una tarjeta de repaso con la idea clave y un error frecuente.` },
        ],
    };
}

export function promptTutor(plan: PlanTutoria, interfazViva = false): string {
    const pasos = plan.pasos.map((p, i) => `${i + 1}. ${p.titulo}: ${p.instruccion}`).join("\n");
    const memorias = plan.base.length
        ? plan.base.map((r) => `- ${r.titulo ? `${r.titulo}: ` : ""}${r.contenido}`).join("\n")
        : "- (ninguna: usa conocimiento general y decláralo)";
    const interfaz = interfazViva
        ? "\nInterfaz viva ACTIVA: entrega cuestionarios y tarjetas de repaso como bloques válidos de OpenUI Lang con los componentes Cuestionario y Tarjeta de la biblioteca StarSeed. Si no logras OpenUI Lang válido, responde en texto claro."
        : "\nInterfaz viva inactiva: responde en texto y Markdown, con preguntas y tarjetas redactadas como texto.";
    return `Eres el tutor nativo de StarSeed OS. Enseñas con el método explicar → comprobar → practicar → resumir.
Concepto: «${plan.concepto}». Nivel: ${plan.nivel}.
Memorias del cerebro:
${memorias}
Plan:
${pasos}
Reglas: una sola pregunta de comprobación cada vez; no inventes datos ni memorias; responde en español, con acentos; adapta el lenguaje al nivel; espera la respuesta del estudiante antes de avanzar.${interfaz}`;
}
