/**
 * Astra — director de orquestación y artista-diseñador de sistemas del OS.
 *
 * Ola 294 · Tarea AR1 (2026-09-08). Por qué: Alex pidió integrar
 * `gpt-6-astra` (OpenAI, primer proveedor de pago de la flota) como
 * DIRECTOR que audita todos los contextos del OS y propone mejoras
 * priorizadas — nunca como escritor a granel (eso es de la flota
 * gratuita). Por eso este módulo es de funciones PURAS: definir su
 * identidad, estructurar sus sugerencias, priorizarlas y ponerle un
 * TECHO DE GASTO duro. Nunca contiene ni nombra valores de claves;
 * la clave vive solo en la variable `OPENAI_API_KEY` del entorno.
 */

export interface AmbitoAstra {
  id: string;
  etiqueta: string;
  queMira: string;
}

/** Los contextos del OS que Astra audita (concretos para este repositorio). */
export const AMBITOS_ASTRA: readonly AmbitoAstra[] = [
  { id: "funciones", etiqueta: "Funciones", queMira: "Qué hace falta y no está: capacidades que el OS promete (CLAUDE.md) y aún no existen." },
  { id: "diseno", etiqueta: "Diseño", queMira: "Identidad Crystal Liquid Glass y Trinity: coherencia visual, jerarquía, movimiento y tokens del design system." },
  { id: "arquitectura", etiqueta: "Arquitectura", queMira: "Capas, acoplamientos y deuda técnica entre src/lib, src/components y src/app." },
  { id: "accesibilidad", etiqueta: "Accesibilidad", queMira: "Contraste, foco, lectores de pantalla y navegación por teclado en las superficies del OS." },
  { id: "rendimiento", etiqueta: "Rendimiento", queMira: "Costes de render, bundles y llamadas repetidas; la Mac de 8 GB manda." },
  { id: "seguridad-y-claves", etiqueta: "Seguridad y claves", queMira: "Que ninguna clave toque el cliente ni el repo, listas blancas de lectura y rutas /api/mando/* solo locales." },
  { id: "economia-de-agentes", etiqueta: "Economía de agentes", queMira: "Orquestación sin agotar créditos: escritores gratuitos, revisores baratos y ningún derrape de cuota." },
  { id: "contenido-y-canales", etiqueta: "Contenido y canales", queMira: "Feed, publicación y singularidad del contenido (Entidad Única, se referencia, no se duplica)." },
  { id: "descubribilidad", etiqueta: "Descubribilidad", queMira: "La regla dorada del CLAUDE.md §11: una ruta que no está en el OmniDock ni en el catálogo de apps no existe para el usuario." },
] as const;
