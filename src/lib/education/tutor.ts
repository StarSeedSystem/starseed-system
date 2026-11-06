// tutor — Habilidad educativa nativa de DeepTutor (ola 1104R, §6 del contrato).
// Capa PURA: sin red, sin disco, sin procesos; el cliente puede importarla.
// Método de DeepTutor: explicar → comprobar con una pregunta → practicar →
// resumir, con los recuerdos del cerebro como base y la interfaz viva de
// OpenUI (solo si está activa) para cuestionarios y tarjetas.
// Contrato: architecture/repos-libreria-1104.md

/** Un recuerdo del cerebro que sirve de base de conocimiento a la tutoría. */
export interface RecuerdoTutoria {
  texto: string;
  titulo?: string;
  /** Origen del recuerdo en el cerebro (p. ej. «leccion», «memoria»). */
  tipo?: string;
}

/** Las cuatro fases del método de DeepTutor, en orden. */
export type OrdenTutoria = "explicar" | "comprobar" | "practicar" | "resumir";

export interface PasoPlan {
  orden: OrdenTutoria;
  titulo: string;
  instruccion: string;
  /** Si este paso se apoya en los recuerdos del cerebro. */
  usaRecuerdos: boolean;
}

export interface PlanTutoria {
  concepto: string;
  nivel: string;
  pasos: PasoPlan[];
  /** Recuerdos del cerebro usados como base, ya limpios. */
  baseRecuerdos: RecuerdoTutoria[];
}

export interface EntradaTutoria {
  concepto: string;
  nivel?: string;
  recuerdos?: RecuerdoTutoria[];
}

/** Minúsculas sin acentos, para casar «Explícame» y «explicame» por igual. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Frases largas: se casan por inclusión (pocas colisiones posibles).
const FRASES = [
  "explícame", "explícanos", "quiero aprender", "quiero entender", "quiero estudiar",
  "no entiendo", "no lo entiendo", "enséñame", "hazme un examen", "hazme un cuestionario",
  "hazme preguntas", "hazme tarjetas", "ponme a prueba", "hazme una tutoría",
  "no me queda claro", "quiero que me enseñes", "hazme un test", "cuéntame qué es",
  "quiero repasar", "hazme flashcards", "ayúdame a entender", "ayúdame a aprender",
  "teach me", "explain to me", "help me understand", "help me learn",
  "i want to learn", "i don't get how", "i don't understand how",
  "quiz me", "flashcards", "walk me through", "break it down for me",
];

// Palabras y construcciones cortas: solo con frontera de palabra, SIN acentos
// (se comprueba contra el texto ya normalizado), para no falsar los cortos.
const PALABRAS = [
  /\bexplica(?:me|nos)?\b/, /\bexplain\b/, /\baprender\b/, /\bentender\b/,
  /\bestudiar\b/, /\brepasar\b/, /\bcomo funciona\b/, /\bcomo se hace\b/,
  /\bcomo se usa\b/, /\bhow does\b/, /\bexamen\b/, /\bcuestioname\b/,
  /\bnombre\b/, /\btest me\b/, /\becuerdame\b/, /\btutoria\b/,
];

/** ¿Es esta frase una petición de aprender o entender algo? */
export function esPeticionDeAprender(texto: string): boolean {
  if (!texto || typeof texto !== "string") return false;
  const t = normalizar(texto);
  if (!t.trim()) return false;
  if (FRASES.some((frase) => t.includes(normalizar(frase)))) return true;
  return PALABRAS.some((re) => re.test(t));
}

const TITULOS: Record<OrdenTutoria, string> = {
  explicar: "1 · Explícamelo",
  comprobar: "2 · Comprobación",
  practicar: "3 · Práctica",
  resumir: "4 · Resumen",
};

const INSTRUCCIONES: Record<
  OrdenTutoria,
  (concepto: string, nivel: string, conRecuerdos: boolean) => string
> = {
  explicar: (concepto, nivel, conRecuerdos) =>
    conRecuerdos
      ? `Explica «${concepto}» en palabras claras, partiendo de lo que el usuario ya sabe según sus recuerdos del cerebro, para nivel ${nivel}: lo que domina se menciona, no se repite de cero.`
      : `Explica «${concepto}» en palabras claras, de lo simple a lo completo, para nivel ${nivel}, sin jerga sin definir.`,
  comprobar: (concepto) =>
    `Comprueba si entendió: formula UNA pregunta corta sobre «${concepto}» y espera su respuesta antes de seguir; si falla, corrige con calma y vuelve a intentar la comprobación con otra pregunta.`,
  practicar: (concepto) =>
    `Ponle a practicar: propone 2 o 3 ejercicios aplicados sobre «${concepto}», del más fácil al más difícil, y corrige su trabajo paso a paso si te lo da.`,
  resumir: (concepto) =>
    `Cierra con un resumen: 5 ideas clave de «${concepto}» en una lista corta y un siguiente paso sugerido para profundizar.`,
};

/** Plan de tutoría según el método de DeepTutor: explicar → comprobar → practicar → resumir. */
export function planTutoria(entrada: EntradaTutoria): PlanTutoria {
  const concepto = (entrada.concepto || "").trim();
  const nivel = (entrada.nivel || "intermedio").trim() || "intermedio";
  const baseRecuerdos = (entrada.recuerdos || [])
    .filter((r) => r && typeof r.texto === "string" && r.texto.trim())
    .map((r) => ({
      texto: r.texto.trim(),
      titulo: r.titulo?.trim() || undefined,
      tipo: r.tipo?.trim() || undefined,
    }));
  const conRecuerdos = baseRecuerdos.length > 0;
  const ordenes: OrdenTutoria[] = ["explicar", "comprobar", "practicar", "resumir"];
  return {
    concepto,
    nivel,
    pasos: ordenes.map((orden) => ({
      orden,
      titulo: TITULOS[orden],
      instruccion: INSTRUCCIONES[orden](concepto, nivel, conRecuerdos),
      usaRecuerdos: orden === "explicar" && conRecuerdos,
    })),
    baseRecuerdos,
  };
}

/** Prompt de sistema del tutor; OpenUI Lang se pide SOLO con la interfaz viva activa. */
export function promptTutor(plan: PlanTutoria, interfazViva: boolean): string {
  let texto = [
    "Eres DeepTutor, el tutor nativo de StarSeed OS. Sigues el método de DeepTutor:",
    ...plan.pasos.map((paso) => `- ${paso.titulo}: ${paso.instruccion}`),
    "No avances de fase hasta comprobar lo anterior, y trata la duda del usuario con calma y sin teatros.",
    "Escribe todo en español.",
  ].join("\n");
  if (plan.baseRecuerdos.length > 0) {
    texto +=
      "\n\nBASE DE CONOCIMIENTO (recuerdos del cerebro del perfil):\n" +
      plan.baseRecuerdos
        .slice(0, 6)
        .map((r) => `- ${r.titulo ? `${r.titulo}: ` : ""}${r.texto}`)
        .join("\n");
  }
  if (interfazViva) {
    texto +=
      "\n\nINTERFAZ VIVA: en la fase de Comprobación pinta UNA pregunta de cuestionario con opciones " +
      "y, en Práctica y Resumen, entrega cuestionarios y tarjetas de estudio en OpenUI Lang " +
      `(lenguaje de interfaz generativa de StarSeed OS). Concepto: ${plan.concepto}. ` +
      "El resto del texto va en llano: ninguna otra fase envuelve datos.";
  } else {
    texto +=
      "\n\nModo texto: respuestas en texto llano; las preguntas de comprobación van con opciones a, b, c y las tarjetas, como parejas de pregunta y respuesta en texto, sin renderizar nada.";
  }
  return texto;
}
