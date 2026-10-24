import type { SkillCapability } from "@/ai/astraura/skills";

/**
 * Ingeniería A · Habilidades de ingeniería de Matt Pocock en tres tamaños
 * ----------------------------------------------------------------------
 * TDD, diagnóstico de fallos, diseño de módulos profundos, modelo de dominio y revisión
 * de código, resumidas para las capas pequeñas de Astraura (contrato
 * architecture/laya-y-habilidades.md §5): la TARJETA (≤ 60 palabras) va a Needle y BitNet,
 * el RESUMEN (≤ 120 palabras) a Bonsai pequeño y el texto COMPLETO (`rutaCompleta`) a las
 * capas razón, profunda y nube. Laya elige qué habilidad aplica; el planificador, el tamaño.
 *
 * Atribución: basado en https://github.com/mattpocock/skills (commit 49dd158),
 * Copyright (c) 2026 Matt Pocock, licencia MIT; texto íntegro de la licencia en
 * vendor/habilidades/mattpocock-skills/LICENSE. Los resúmenes son nuestros, fieles al
 * original y sin pasos inventados.
 *
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj (sirve en cliente y servidor).
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;

export const ATRIBUCION_INGENIERIA =
  "Habilidades de ingeniería de Matt Pocock (github.com/mattpocock/skills), licencia MIT.";

export interface HabilidadIngenieria {
  /** Igual al `name` del SKILL.md original. */
  id: string;
  nombre: string;
  /** Cuándo aplica, en una frase. */
  cuando: string;
  /** ≤ 60 palabras, para Needle y BitNet. */
  tarjeta: string;
  /** ≤ 120 palabras, para Bonsai pequeño. */
  resumen: string;
  /** Ruta del SKILL.md original, relativa a la raíz del repositorio. */
  rutaCompleta: string;
  licencia: "MIT";
  autor: "Matt Pocock";
}

const RAIZ = "vendor/habilidades/mattpocock-skills/engineering";

export const HABILIDADES_INGENIERIA_A: HabilidadIngenieria[] = [
  {
    id: "tdd",
    nombre: "TDD · Desarrollo guiado por pruebas",
    cuando: "Cuando se quiere construir una función o arreglar un fallo escribiendo primero la prueba, se menciona «rojo-verde-refactor» o se piden pruebas de integración.",
    tarjeta: "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión.",
    resumen: "TDD es el bucle rojo → verde; esta habilidad hace que deje pruebas dignas de conservar. Una buena prueba verifica comportamiento por interfaces públicas, no detalles internos, y se lee como una especificación: sobrevive a las refactorizaciones. Las pruebas viven en costuras (la frontera pública donde se observa el comportamiento): antes de escribir ninguna, acuerda las costuras con el usuario, cada una con lo que detecta y lo que no. Antipatrones: acopladas a la implementación, tautológicas (el valor esperado debe venir de una fuente independiente) y rebanado horizontal (todas las pruebas primero). Reglas: rojo antes que verde, solo el código justo, una rebanada cada vez; refactorizar es de la revisión, no del bucle. Lee GLOSSARY.md y respeta los ADR.",
    rutaCompleta: `${RAIZ}/tdd/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "diagnosing-bugs",
    nombre: "Diagnóstico de fallos difíciles",
    cuando: "Cuando alguien pide «diagnostica» o «depura esto», o informa de algo roto, que lanza errores, falla o va lento.",
    tarjeta: "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>.",
    resumen: "Fallos difíciles: ninguna fase se salta sin justificación y todo secreto va como <REDACTED>. Fase 1, lo esencial: un bucle de realimentación que se ponga en rojo con ESTE fallo (prueba, curl, CLI, navegador sin cabeza, traza reproducida, arnés, fuzz, bisección, diferencial; humano solo al final), rápido, nítido y determinista. Sin bucle, dilo y pide acceso o artefactos. Fase 2: reproduce el síntoma del usuario y minimiza hasta dejar solo lo imprescindible. Fase 3: 3–5 hipótesis falsables, ordenadas y enseñadas al usuario. Fase 4: instrumenta una variable cada vez con registros etiquetados; en rendimiento, mide antes. Fase 5: prueba de regresión en una costura correcta, luego el arreglo. Fase 6: limpia y anota la causa en el commit.",
    rutaCompleta: `${RAIZ}/diagnosing-bugs/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "codebase-design",
    nombre: "Diseño de módulos profundos",
    cuando: "Cuando se diseña o mejora la interfaz de un módulo, se buscan oportunidades de profundizar, se decide dónde va una costura o se quiere código más fácil de probar y de recorrer por una IA.",
    tarjeta: "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real.",
    resumen: "Vocabulario común para diseñar módulos profundos; usa siempre los mismos términos. Módulo: cualquier cosa con interfaz e implementación. Interfaz: todo lo que el llamador debe saber (tipos, invariantes, orden, errores, configuración, rendimiento). Profundidad: comportamiento por unidad de interfaz; profundo es mucho comportamiento tras una interfaz pequeña, superficial si la interfaz casi iguala a la implementación. Costura: el lugar donde vive la interfaz. Adaptador: lo que la satisface en una costura. La profundidad da palanca a los llamadores y localidad a quien mantiene. Principios: la profundidad es de la interfaz; prueba del borrado; la interfaz es la superficie de prueba; un adaptador es una costura hipotética, dos una real. Para probar bien: acepta dependencias, devuelve resultados y reduce la superficie.",
    rutaCompleta: `${RAIZ}/codebase-design/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "domain-modeling",
    nombre: "Modelo de dominio",
    cuando: "Cuando se habla de la terminología del código, se escribe o edita un GLOSSARY.md o se registra o edita un ADR.",
    tarjeta: "Construye y afina el modelo de dominio mientras diseñas. Señala al instante los términos que choquen con GLOSSARY.md, propone un término canónico para el lenguaje vago, prueba las relaciones con escenarios límite y contrasta lo dicho con el código. Actualiza el glosario al resolver cada término. ADR solo si es difícil de revertir, sorprendente y fruto de un compromiso real.",
    resumen: "Disciplina activa para construir y afinar el modelo de dominio mientras se diseña (no basta con leer GLOSSARY.md). Estructura: un GLOSSARY.md y docs/adr/ en la raíz; si existe GLOSSARY-MAP.md hay varios contextos y el mapa dice dónde vive cada uno. Crea cada archivo solo cuando haga falta. Señala al momento el término que choque con el glosario; propone un término canónico preciso para el lenguaje vago o sobrecargado; prueba las relaciones con escenarios concretos que fuercen los límites; contrasta lo dicho con el código y señala las contradicciones; actualiza GLOSSARY.md en cuanto se resuelve un término, sin detalles de implementación. Ofrece un ADR solo si es difícil de revertir, sorprendente sin contexto y fruto de un compromiso real.",
    rutaCompleta: `${RAIZ}/domain-modeling/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "code-review",
    nombre: "Revisión de código en dos ejes",
    cuando: "Cuando se quiere revisar una rama, un PR o cambios en curso, o se pide «revisa desde X».",
    tarjeta: "Revisa el diff entre HEAD y un punto fijo (commit, rama o etiqueta) en dos ejes separados: Normas (¿sigue las normas documentadas y la base de malos olores de Fowler?) y Especificación (¿hace lo que pedía la issue o spec?). Dos subagentes en paralelo; presenta ambos informes sin mezclarlos ni reordenarlos, con el total y lo peor de cada eje.",
    resumen: "Revisión del diff entre HEAD y un punto fijo que da el usuario (si falta, pregúntalo). 1) Fija el punto: git diff <punto>...HEAD y los commits; comprueba que la referencia existe y el diff no está vacío. 2) Especificación: issues citadas en los commits, una ruta dada o un archivo en docs/, specs/ o .scratch/; si no hay, pregunta. 3) Normas documentadas (CODING_STANDARDS.md o CONTRIBUTING.md si existen) y la base de malos olores de Fowler: siempre juicios; manda la norma del repositorio. 4) Lanza a la vez un subagente por eje, cada informe con menos de 400 palabras. 5) Presenta ## Standards y ## Spec sin mezclar ni reordenar; cierra con el total y lo peor de cada eje.",
    rutaCompleta: `${RAIZ}/code-review/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
];

/** Palabras de un texto: trozos separados por espacios (cuenta estricta, también símbolos). */
export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Adapta una habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidad(h: HabilidadIngenieria, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}
