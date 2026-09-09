/**
 * Revisores continuos por área — vigilancia de fondo del OS.
 *
 * Ola 301 · Tarea RV1 (2026-09-09). Por qué: Alex pidió «orquestar agentes
 * que revisen constantemente cada área para sugerir mejoras, revisar errores
 * y solucionarlos, mejorar la calidad de los diseños, eliminar código que no
 * sirva y hacer eficiente todo el programa». Este módulo monta esa vigilancia
 * ENCIMA de `astra.ts` (Ola 294): no inventa un formato nuevo de sugerencia,
 * reutiliza `SugerenciaAstra` respetando su forma para que el Mando y el
 * enjambre ya sepan qué hacer con lo que un revisor produzca.
 *
 * TODO es puro: sin red, sin disco, sin entorno. Las funciones deciden CUÁNDO
 * mirar un área, CUÁL mira antes y QUÉ se les pide a los revisores; el resto
 * (llamar al modelo, guardar resultados) queda fuera de este archivo.
 */

import type { SugerenciaAstra } from "./astra";

/** Papel que juega un revisor dentro de su área: qué ojos tiene y qué persigue. */
export type PapelRevisor = "disenador" | "ingeniero" | "limpiador" | "economista";

/** Una zona del repositorio que un agente revisa con su propia cadencia. */
export interface AreaRevisada {
  id: string;
  nombre: string;
  rutas: string[];
  busca: string[];
  cadenciaHoras: number;
  papel: PapelRevisor;
}

/**
 * Las zonas reales de este repositorio y qué busca cada revisor en ellas.
 * La cadencia se elige por cuánto pesa el cambio en cada área: la interfaz y
 * la accesibilidad se miran a menudo (se tocan a diario), mientras que el
 * código muerto o la economía de agentes aguantan cadencias más largas.
 */
export const AREAS_REVISADAS: readonly AreaRevisada[] = [
  {
    id: "interfaz-diseno",
    nombre: "Interfaz y diseño",
    rutas: ["src/components", "design-system/"],
    busca: ["Coherencia con Crystal Liquid Glass y Trinity (Zenith/Horizon/Logic/Anchor).", "Jerarquía visual y jerarquía tipográfica.", "Movimiento y transiciones de 150-300ms (regla del CLAUDE.md §8).", "Estados vacíos y de error honestos y útiles.", "Tokens del design system (design-system/starseed-system/MASTER.md)."],
    cadenciaHoras: 6,
    papel: "disenador",
  },
  {
    id: "accesibilidad",
    nombre: "Accesibilidad",
    rutas: ["src/components", "src/app"],
    busca: ["Foco visible y orden de tabulación coherente.", "Contraste suficiente en texto y superficies.", "Atributos aria-* en elementos interactivos y no semánticos.", "Navegación por teclado sin trampas de foco."],
    cadenciaHoras: 12,
    papel: "disenador",
  },
  {
    id: "arquitectura",
    nombre: "Arquitectura",
    rutas: ["src/lib", "src/ai"],
    busca: ["Capas y acoplamientos entre src/lib, src/components y src/app.", "Módulos de servidor (imports de node:*) colados en el paquete del cliente (regla del CLAUDE.md §Publicar).", "Singletons y dependencias implícitas que compliquen probar o reutilizar."],
    cadenciaHoras: 24,
    papel: "ingeniero",
  },
  {
    id: "codigo-muerto",
    nombre: "Código muerto",
    rutas: ["src/lib", "src/components", "src/app"],
    busca: ["Exports sin nadie que los importe.", "Componentes huérfanos y archivos sin referencias.", "Rutas no enlazadas desde el OmniDock ni desde el catálogo de apps (CLAUDE.md §11: una ruta así «no existe»)."],
    cadenciaHoras: 48,
    papel: "limpiador",
  },
  {
    id: "rendimiento",
    nombre: "Rendimiento",
    rutas: ["src/components", "src/app"],
    busca: ["Paquetes pesados importados de forma estática.", "Faltas de next/dynamic para chunks caros.", "Imágenes sin optimizar (next/image) o sin dimensiones.", "Renderer calls y suscripciones repetidas; la Mac de 8 GB manda."],
    cadenciaHoras: 24,
    papel: "ingeniero",
  },
  {
    id: "enjambre-economia",
    nombre: "Enjambre y economía",
    rutas: ["scripts/enjambre", "memory/orquestacion-economica.md"],
    busca: ["Ningún proveedor ni sesión agotando créditos (regla permanente §💠).", "Sin claves en el repo ni en memorias (solo nombres de variables).", "Tareas ≤ 3 archivos y ≤ 120 líneas por archivo."],
    cadenciaHoras: 24,
    papel: "economista",
  },
  {
    id: "canales-contenido",
    nombre: "Canales y contenido",
    rutas: ["src/app/(app)/network", "src/lib"],
    busca: ["Singularidad del contenido (Entidad Única: se referencia, no se duplica).", "Flujo de publicación, feed y reproducción de contenido accesible.", "Privacidad de lo personal frente a transparencia de lo público (§6)."],
    cadenciaHoras: 24,
    papel: "ingeniero",
  },
  {
    id: "memorias-privacidad",
    nombre: "Memorias y privacidad",
    rutas: ["src/lib/memory-sync", "src/lib/astraura", "memory/"],
    busca: ["Alcance de memoria: personal > perfil > grupo > pública, nunca al revés.", "Datos que no salen de la neurona sin consentimiento.", "Ningún secreto ni clave en archivos de memoria ni documentos."],
    cadenciaHoras: 24,
    papel: "limpiador",
  },
  {
    id: "descubribilidad",
    nombre: "Descubribilidad",
    rutas: ["src/components/layout/dock-config.ts", "src/components/dashboard/apps/app-catalog.ts", "src/lib/dock/dock-defaults.ts"],
    busca: ["La regla dorada del CLAUDE.md §11: una ruta fuera del OmniDock y del catálogo «no existe».", "Presets del dock, App Launcher y biblioteca instalable en paridad.", "Iconos de lucide registrados en DOCK_ICON_MAP."],
    cadenciaHoras: 24,
    papel: "limpiador",
  },
];

/** Cadena con tilde › texto sin tildes ni diacríticos para comparar sin tropezar. */
function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Mínimo legible que normaliza un título: minúsculas, sin tildes, sin puntuación. */
function normalizarTitulo(texto: string): string {
  return sinTildes(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Decide si un área toca revisar AHORA respecto de su cadencia. Se compara la
 * última revisión con la hora actual y se devuelve también el PORQUÉ, para que
 * el Mando (o el log) pueda explicar la decisión y no quede como magia.
 */
export function tocaRevisar(
  area: AreaRevisada,
  ultimaRevisionIso: string,
  ahora: Date,
): { toca: boolean; motivo: string } {
  const cadencia = Number.isFinite(area.cadenciaHoras) && area.cadenciaHoras > 0 ? area.cadenciaHoras : 1;
  const ultima = Date.parse(ultimaRevisionIso);
  const msCadencia = cadencia * 3600_000;

  // Sin registro previo, toca siempre: es la primera mirada del área.
  if (!Number.isFinite(ultima)) {
    return { toca: true, motivo: `${area.nombre} nunca se ha revisado: toca mirarlo por primera vez.` };
  }

  const transcurrido = ahora.getTime() - ultima;
  const atraso = transcurrido - msCadencia;

  if (atraso >= 0) {
    const h = Math.round(transcurrido / 3600_000);
    return { toca: true, motivo: `${area.nombre} hace ${h} h sin revisión (cadencia ${cadencia} h): toca.` };
  }

  const hFaltan = Math.ceil(-atraso / 3600_000);
  return { toca: false, motivo: `${area.nombre} se revisó hace poco: faltan ~${hFaltan} h para su cadencia de ${cadencia} h.` };
}

/**
 * Devuelve el área MÁS ATRASADA respecto de su cadencia, o null si ninguna
 * toca aún. Así la vigilancia rota sola: siempre se mira la que lleva más
 * tiempo sin atención y ninguna zona se queda sin mirar por motivos de orden.
 */
export function siguienteArea(
  areas: readonly AreaRevisada[],
  ultimas: Record<string, string>,
  ahora: Date,
): AreaRevisada | null {
  let candidata: AreaRevisada | null = null;
  let mayorAtraso = 0;

  for (const area of areas) {
    const ultima = ultimas[area.id];
    const r = tocaRevisar(area, ultima ?? "", ahora);
    if (!r.toca) continue;

    const msUltima = ultima ? Date.parse(ultima) : Number.NEGATIVE_INFINITY;
    const transcurrido = Number.isFinite(msUltima) ? ahora.getTime() - msUltima : Number.POSITIVE_INFINITY;
    const cadencia = area.cadenciaHoras * 3600_000;
    const atraso = Number.isFinite(msUltima) ? transcurrido - cadencia : Number.POSITIVE_INFINITY;

    if (atraso > mayorAtraso || candidata === null) {
      mayorAtraso = atraso;
      candidata = area;
    }
  }

  return candidata;
}

/** Frase de identidad que define al revisor según el papel de su área. */
function frasePapel(papel: PapelRevisor, nombre: string): string {
  switch (papel) {
    case "disenador":
      return `Eres el diseñador que cuida la identidad visual de StarSeed OS: polilla directa de Crystal Liquid Glass y Trinity, al servicio de ${nombre}.`;
    case "economista":
      return `Eres el economista del enjambre: velas por que ${nombre} funcione sin que ningún proveedor, modelo ni sesión agote sus créditos.`;
    case "limpiador":
      return `Eres quien borra lo que ya no sirve sin romper nada: limpias ${nombre} de código muerto y deuda que nadie usa.`;
    case "ingeniero":
      return `Eres el ingeniero que mantiene ${nombre} sano: capas limpias, rendimiento honesto y ningún módulo de servidor colado en el cliente.`;
  }
}

/**
 * Construye el prompt del revisor de un área. El `system` fija su papel, le
 * exige citar archivo y línea, no proponer lo que ya existe y devolver JSON
 * estricto con la forma de `SugerenciaAstra[]` (reutiliza el formato de
 * `astra.ts`, no inventa otro). El `user` lleva el área, lo que busca y el
 * contexto del momento. PURA: no toca red ni entorno.
 */
export function promptRevisorArea(area: AreaRevisada, contexto: string): { system: string; user: string } {
  const system = [
    frasePapel(area.papel, area.nombre),
    "Revisas EN SEGUNDO PLANO y propones mejoras, errores a corregir y código a eliminar, con imaginación e intuición.",
    "Cada sugerencia cita SIEMPRE el archivo y la línea exactos (formato `ruta/archivo.ts:NNN`), con la evidencia de lo que viste.",
    "No propones nada que ya exista en el repositorio ni en las memorias: comprueba antes con el grafo de código y la documentación viva.",
    "Respetas la Tríada Ideológica y las invariantes del §6 del CLAUDE.md: descentralización, identidad soberana, código abierto, singularidad del contenido, privacidad/transparencia dual, dualidad cuenta/perfil y justicia restaurativa.",
    "Respondes ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, con la forma de `SugerenciaAstra[]` y nada más. Cada elemento lleva: id, ambito, titulo, porque, evidencia (citas con archivo y línea), impacto (1-5), esfuerzo (1-5), riesgo (1-5), archivos (rutas relativas) y propuestaDeTarea (objeto {titulo, archivos, prompt} o null).",
  ].join(" ");

  const user = [
    `ÁREA: ${area.nombre} (id=${area.id}).`,
    "QUÉ BUSCO:",
    ...area.busca.map((b) => `- ${b}`),
    "RUTAS: " + area.rutas.join(", "),
    "",
    "CONTEXTO:",
    contexto,
    "",
    "Devuelve solo el JSON con la lista de sugerencias. Si no hay nada que mejorar, devuelve [].",
  ].join("\n");

  return { system, user };
}

/** Clave de deduplicación: área + archivos + título normalizado. */
function claveSugerencia(s: SugerenciaAstra): string {
  const titulo = normalizarTitulo(s.titulo);
  const archivos = s.archivos.map(sinTildes).sort().join("|");
  return `${s.ambito}::${archivos}::${titulo}`;
}

/** Mímesis: intercala en orden y desempata por id para ser determinista. */
function ordenarSugerencias(lista: SugerenciaAstra[]): SugerenciaAstra[] {
  const copia = lista.slice();
  copia.sort((a, b) => a.id.localeCompare(b.id));
  return copia;
}

/**
 * Fusiona nuevas sugerencias sobre las previas SIN duplicar: se compara por
 * área + archivos + título normalizado. En caso de choque se conserva la MÁS
 * RECIENTE (la de `nuevas`, que acaba de producir el revisor). PURA y estable.
 */
export function fusionarSugerencias(previas: SugerenciaAstra[], nuevas: SugerenciaAstra[]): SugerenciaAstra[] {
  const porClave = new Map<string, SugerenciaAstra>();
  const orden: string[] = [];

  // Las previas entran primero para preservar su orden; las nuevas las pisan en choque.
  for (const s of previas) {
    const clave = claveSugerencia(s);
    if (!porClave.has(clave)) orden.push(clave);
    porClave.set(clave, s);
  }
  for (const s of nuevas) {
    const clave = claveSugerencia(s);
    if (!porClave.has(clave)) orden.push(clave);
    porClave.set(clave, s); // la más reciente gana
  }

  const out: SugerenciaAstra[] = [];
  for (const clave of orden) {
    const s = porClave.get(clave);
    if (s) out.push(s);
  }
  return ordenarSugerencias(out);
}

/** Formatea la evidencia de una sugerencia como citas numeradas para el prompt. */
function evidenciaEnLineas(evidencia: string[]): string {
  if (evidencia.length === 0) return "Sin evidencia adjunta.";
  return evidencia.map((e, i) => `${i + 1}. ${e}`).join("\n");
}

/**
 * Convierte una sugerencia APROBADA en una tarea del enjambre. El `prompt`
 * resultante incluye la evidencia y las reglas del repositorio (≤ 3 archivos,
 * tests de funciones puras), de modo que el escritor que la recoja no tenga
 * que volver a abrir documentación. PURA: no escribe ni dispara nada.
 */
export function aTareaDeCola(s: SugerenciaAstra, ola: string): { id: string; ola: string; titulo: string; archivos: string[]; depende: string[]; modelo: string; prompt: string } {
  const archivos = s.archivos.slice(0, 3);
  const propuesta = s.propuestaDeTarea;

  const prompt = [
    `Tarea del enjambre para el área ${s.ambito}.`,
    `OBJETIVO: ${propuesta?.titulo ?? s.titulo}`,
    `POR QUÉ: ${s.porque || "Mejora señalada por el revisor continuo del área."}`,
    "",
    "EVIDENCIA (cita archivo y línea):",
    evidenciaEnLineas(s.evidencia),
    "",
    "REGLAS DEL REPOSITORIO (obligatorias):",
    "- Toca como mucho 3 archivos y hasta 120 líneas por archivo.",
    "- Añade tests de funciones puras con npx vitest run, sin vi.mock de módulos de Node.",
    "- Comentarios en español, sin `any`, cursor-pointer en lo clicable.",
  ].join("\n");

  return {
    id: `rv-${s.ambito}-${s.id}`,
    ola,
    titulo: propuesta?.titulo ?? s.titulo,
    archivos,
    depende: [],
    modelo: "",
    prompt,
  };
}