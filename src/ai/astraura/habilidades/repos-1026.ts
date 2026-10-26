import type { SkillCapability } from "@/ai/astraura/skills";

/**
 * Repos 1026 · Tres habilidades de Astraura para los repos que Alex pidió el 2026-10-26 (Ola 1025U · REP1026)
 * ----------------------------------------------------------------------
 * Grabar la pantalla (Cap), conocimiento de cada contexto (WeKnora) y proyectos de la red (OpenProject), en dos
 * tamaños como el resto de habilidades (contrato architecture/laya-y-habilidades.md §5): la TARJETA (≤ 60 palabras)
 * va a Needle y BitNet y el RESUMEN (≤ 120 palabras) es lo que se inyecta en el cerebro de Aurora. Se activan solas al
 * instalar la ficha de la Biblioteca (la siembra instala las tres: instalar = guardar el enlace).
 *
 * HONESTAS A PROPÓSITO: una habilidad no promete lo que no hace. Hoy no hay instancia de WeKnora ni de OpenProject y
 * Aurora no tiene todavía una herramienta que consulte sus conectores (`src/lib/conocimiento/weknora.ts`,
 * `src/lib/proyectos/openproject.ts`): los textos lo dicen para que el modelo no finja consultar lo que no consulta.
 * Cuando se cableen, estos textos cambian a la vez que el cableado.
 *
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj (sirve en cliente y servidor).
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;

export interface HabilidadRepo1026 {
  /** Id de la capacidad en `SKILL_CAPABILITIES` y en el vocabulario de agentes de grupo. */
  id: string;
  nombre: string;
  /** Cuándo aplica, en una frase. */
  cuando: string;
  /** ≤ 60 palabras, para Needle y BitNet. */
  tarjeta: string;
  /** ≤ 120 palabras, para el cerebro de Aurora. */
  resumen: string;
  /** Ficha de la Biblioteca que la activa al instalarse. */
  fichaId: string;
  repo: string;
  licencia: string;
  /** Qué NO hace hoy, en una frase (se comprueba en las pruebas y se enseña en la SOP). */
  limite: string;
}

export const HABILIDAD_GRABAR_PANTALLA: HabilidadRepo1026 = {
  id: "grabar-pantalla",
  nombre: "Grabar la pantalla (Cap)",
  cuando: "Cuando la persona quiere grabar la pantalla: un tutorial del OS, una demostración de la red, de Astraura o de la Protomolécula, o los pasos de un fallo.",
  tarjeta:
    "Grabar la pantalla: el Centro de Control tiene una sección Grabar propia; pide abrirla con la habilidad grabar-pantalla. Cap (app de escritorio, AGPL-3.0) es el motor opcional de la Mac. Tú nunca grabas: solo la persona pulsa grabar, con su permiso. Si la sección no está conectada, dilo así. El uso comercial de Cap pide su licencia de pago.",
  resumen:
    "Grabar la pantalla: tutoriales del OS, demostraciones de la red, de Astraura o de la Protomolécula y pasos de un fallo. El Centro de Control tiene una sección Grabar propia; la habilidad grabar-pantalla pide abrirla con el evento starseed:abrir-grabar y devuelve la verdad: si nadie escucha todavía, dilo y explica que se abre a mano desde el Centro de Control. Cap (CapSoftware, AGPL-3.0) es la app de escritorio opcional de la Mac, con la orden cap y un servidor MCP local; la persona la instala, tú no. Gratis para uso personal; grabar para algo que da ingresos pide su licencia de pago. Tú nunca grabas ni afirmas haber grabado: solo la persona pulsa grabar, y se captura todo lo visible.",
  fichaId: "lib-cap",
  repo: "https://github.com/CapSoftware/Cap",
  licencia: "AGPL-3.0 (crates cap-camera* y scap-* en MIT); binarios gratis para uso personal, de pago para uso comercial",
  limite: "Solo pide abrir la sección Grabar; no graba, no instala Cap y hoy ninguna herramienta de Aurora la invoca.",
};

export const HABILIDAD_CONOCIMIENTO_WEKNORA: HabilidadRepo1026 = {
  id: "conocimiento-weknora",
  nombre: "Conocimiento de Astraura (WeKnora)",
  cuando: "Cuando la persona quiere que Astraura conozca y cite los documentos de un contexto (grupo, comunidad, proyecto) en cualquier medio.",
  tarjeta:
    "WeKnora (MIT) guardaría los documentos de cada contexto y devolvería fragmentos con su documento de origen. Hoy NO hay instancia ni está conectado a tus herramientas: no finjas consultarlo ni inventes citas. Si preguntan cómo darte ese conocimiento, explica que hace falta un servidor aparte y las variables WEKNORA_URL y WEKNORA_API_KEY.",
  resumen:
    "WeKnora (Tencent, MIT) es la base de conocimiento que dará a Astraura los documentos de cada contexto, con búsqueda híbrida y citas al documento de origen. Hoy no hay ninguna instancia levantada y Aurora aún no tiene una herramienta que la consulte: existe el conector de solo lectura (listar bases y buscar), probado solo con respuestas simuladas. No finjas consultarla ni inventes citas: si falta el conocimiento, dilo y responde marcando lo que sabes por tu cuenta. Si preguntan cómo activarla: un servidor aparte de 4 núcleos y 8 GB, y las variables WEKNORA_URL y WEKNORA_API_KEY en ese servidor, nunca en el repositorio. Respeta el alcance de memoria: lo personal no va a una base de grupo ni pública.",
  fichaId: "lib-weknora",
  repo: "https://github.com/Tencent/WeKnora",
  licencia: "MIT",
  limite: "Sin instancia y sin herramienta de Aurora que la consulte: solo existe el conector de solo lectura.",
};

export const HABILIDAD_PROYECTOS_OPENPROJECT: HabilidadRepo1026 = {
  id: "proyectos-openproject",
  nombre: "Proyectos de la red (OpenProject)",
  cuando: "Cuando la persona o un grupo quiere planificar, seguir o consultar proyectos y tareas de la red o de Astraura en un solo sitio.",
  tarjeta:
    "OpenProject (GPL-3.0) sería el sitio común de proyectos y tareas de grupos, comunidades y agentes. Hoy NO hay instancia ni está conectado a tus herramientas: no finjas consultarlo ni inventes tareas. Si preguntan cómo activarlo, explica que hace falta un servidor aparte y las variables OPENPROJECT_URL y OPENPROJECT_API_KEY.",
  resumen:
    "OpenProject (GPL-3.0, autoalojado) sería el sitio común donde los grupos, las comunidades y los agentes de la red y de Astraura planifican proyectos de cualquier tipo: paquetes de trabajo, tableros, Gantt y tiempos. Hoy no hay ninguna instancia y Aurora aún no tiene una herramienta que la consulte: existe el conector de solo lectura (proyectos y paquetes de trabajo), probado solo con respuestas simuladas. No finjas consultarla ni inventes tareas: si te piden planificar, ayuda con un plan en texto. Si preguntan cómo activarla: un servidor aparte de 4 núcleos y 4 GB, y las variables OPENPROJECT_URL y OPENPROJECT_API_KEY, nunca en el repositorio. Para tareas ligeras de un grupo, Vikunja ya está en la Biblioteca.",
  fichaId: "lib-openproject",
  repo: "https://github.com/opf/openproject",
  licencia: "GPL-3.0 (edición Community; los complementos Enterprise son de pago)",
  limite: "Sin instancia y sin herramienta de Aurora que la consulte: solo existe el conector de solo lectura.",
};

/** Las tres, en el orden en que se enseñan. */
export const HABILIDADES_REPOS_1026: readonly HabilidadRepo1026[] = [
  HABILIDAD_GRABAR_PANTALLA,
  HABILIDAD_CONOCIMIENTO_WEKNORA,
  HABILIDAD_PROYECTOS_OPENPROJECT,
];

/** La habilidad como capacidad viva de Aurora: el resumen entra al cerebro y la ficha de la Biblioteca la activa. */
export function comoCapacidad1026(h: HabilidadRepo1026): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: h.resumen, routing: {}, packageIds: [h.fichaId] };
}

/** Lo que `SKILL_CAPABILITIES` suma (la regla de Alex: lo que entra a la Biblioteca se activa solo al instalarse). */
export const CAPACIDADES_REPOS_1026: SkillCapability[] = HABILIDADES_REPOS_1026.map(comoCapacidad1026);

/** Los ids, para el vocabulario de agentes de grupo (`CAPACIDADES_CONOCIDAS`). */
export const IDS_CAPACIDADES_REPOS_1026: readonly string[] = HABILIDADES_REPOS_1026.map((h) => h.id);
