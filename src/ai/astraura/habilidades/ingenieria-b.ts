import type { HabilidadIngenieria } from "./ingenieria-a";

/**
 * Ingeniería B · Habilidades de ingeniería de Matt Pocock (segunda mano)
 * ----------------------------------------------------------------------
 * Igual que `ingenieria-a.ts` (contrato architecture/laya-y-habilidades.md §5):
 * la TARJETA (≤ 60 palabras) va a Needle y BitNet, el RESUMEN (≤ 120 palabras) a
 * Bonsai pequeño y el texto COMPLETO (`rutaCompleta`) a las capas razón, profunda
 * y nube. Laya elige qué habilidad aplica; el planificador, el tamaño. Aquí van
 * las de especificar y trocear: to-spec, to-tickets, triage, prototype, research,
 * improve-codebase-architecture e implement.
 *
 * Atribución: basado en https://github.com/mattpocock/skills, licencia MIT;
 * texto íntegro en vendor/habilidades/mattpocock-skills/LICENSE. Los resúmenes
 * son nuestros, fieles al original y sin pasos inventados.
 *
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj.
 */

import {
  ATRIBUCION_INGENIERIA,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  contarPalabras,
  comoCapacidad,
} from "./ingenieria-a";

export {
  ATRIBUCION_INGENIERIA,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  contarPalabras,
  comoCapacidad,
};

const RAIZ = "vendor/habilidades/mattpocock-skills/engineering";

// Se rellena a continuación, habilidad por habilidad.
export const HABILIDADES_INGENIERIA_B: HabilidadIngenieria[] = [
  {
    id: "to-spec",
    nombre: "De la conversación a la especificación",
    cuando: "Cuando ya se habló de una función y hay que convertirla en una especificación publicada, sin volver a entrevistar.",
    tarjeta: "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent.",
    resumen: "Toma la conversación y lo entendido del código y produce una especificación sin entrevistar: solo se sintetiza lo ya hablado. Explora el repositorio para conocer su estado, usa el vocabulario del glosario y respeta los ADR del área. Esboza las costuras por las que se probará la función: se prefieren las existentes, en el punto más alto, con una sola como cifra ideal, y se confirman con la persona. La plantilla pide problema y solución desde la perspectiva de quien los usa, una lista extensa de historias de usuario numeradas, decisiones de implementación y de prueba sin rutas ni fragmentos que envejecen (salvo si un prototipo la codifica mejor), qué queda fuera y notas. Publica en el rastreador sin triage.",
    rutaCompleta: `${RAIZ}/to-spec/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "to-tickets",
    nombre: "De la especificación a los tickets",
    cuando: "Cuando hay un plan, una especificación o una conversación que trocear en tickets con bloqueos declarados.",
    tarjeta: "Trocea un plan o especificación en tickets de bala trazadora: rebanadas verticales completas, demoables por sí solas, con sus bloqueos declarados. Prefactora primero. La refactorización ancha es la excepción: expande, migra en lotes y contrae. Presenta el desglose numerado, pregunta granularidad y dependencias, y ajusta hasta la aprobación; publica en orden de dependencia y trabaja la frontera.",
    resumen: "Trocea un plan, especificación o conversación en tickets de bala trazadora: rebanadas verticales que cortan un camino estrecho pero completo por todas las capas (esquema, API, interfaz, pruebas), demoables por sí mismas y del tamaño de una ventana de contexto limpia; el prefactorado va antes. Cada ticket declara sus bloqueos, arranca ya si no tiene ninguno, y se trabaja la frontera. La refactorización ancha, mecánica y con radio por todo el código, es la excepción: expandir añadiendo lo nuevo junto a lo viejo, migrar por lotes con CI verde y contraer borrando lo viejo. Presenta el desglose numerado (título, bloqueos, qué entrega), ajusta granularidad y aristas hasta la aprobación y publica en orden de dependencia con ready-for-agent.",
    rutaCompleta: `${RAIZ}/to-tickets/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "triage",
    nombre: "Triage de issues y PRs",
    cuando: "Cuando el responsable del rastreador de issues pide ver qué necesita atención, triar un issue o una entrega ajena, moverla de estado o saber qué está lista para un agente.",
    tarjeta: "Mueve issues y PRs por una máquina de estados de triage: dos roles de categoría (bug o mejora) y cinco de estado (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), exactamente uno de cada. Verifica el reclamo reproduciéndolo, recomienda, interroga si falta detalle y aplica el resultado: brief de agente, de humano, pedir información o cerrar. Cada comentario lleva el aviso de IA.",
    resumen: "Mueve los issues, y las entregas externas tratadas como issues con código, por una máquina de estados: lo sin etiquetar va a needs-triage y de ahí a needs-info, ready-for-agent, ready-for-human o wontfix; needs-info vuelve cuando quien reporta responde. Cada issue lleva exactamente un rol de categoría (bug o mejora) y uno de estado; si chocan, se pregunta, y todo comentario empieza con el aviso de que lo generó IA. Triar: leer todo y las notas previas para no repetir preguntas; comprobar si el comportamiento ya existe en el código; verificar el reclamo reproduciéndolo o corriendo pruebas; recomendar con razones; interrogar si falta carne; y aplicar: brief de agente, brief de humano, notas de needs-info o cierre con el motivo.",
    rutaCompleta: `${RAIZ}/triage/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "prototype",
    nombre: "Prototipo desechable",
    cuando: "Cuando alguien duda de si un modelo de estado o una lógica se sienten bien, o de cómo debería verse una interfaz.",
    tarjeta: "Código de borrar que responde a una pregunta: la pregunta manda. Lógica: un HTML compartible que empuje la máquina de estados por casos difíciles en papel. Apariencia: variantes de interfaz distintas en una ruta, cambiables por parámetro de URL. Desechable, trivial de arrancar, sin persistencia ni pulido, muestra el estado tras cada acción y archiva el prototipo fuera de main.",
    resumen: "Un prototipo es código desechable que responde a una pregunta de diseño, y la pregunta decide la forma. Si la pregunta es «¿esta lógica o estado se siente correcta?»: un único archivo HTML compartible que empuje la máquina por casos difíciles de razonar en papel. Si es «¿cómo debería verse?»: varias variantes de interfaz radicalmente distintas en una misma ruta, conmutables por parámetro de la URL. Reglas: desechable y marcado como tal, trivial de ejecutar en una orden, sin persistencia por defecto, sin pulir ni abstraer, mostrar el estado tras cada acción y, al acabar, plegar la decisión validada en el código real y archivar el prototipo en una rama de borrar fuera de main.",
    rutaCompleta: `${RAIZ}/prototype/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "research",
    nombre: "Investigación con fuentes primarias",
    cuando: "Cuando hay que investigar un tema, recoger datos de documentación o API o delegar la lectura pesada a un agente de fondo.",
    tarjeta: "Investiga la pregunta contra fuentes primarias (documentación oficial, código fuente, especificaciones), no contra resúmenes ajenos: sigue cada afirmación hasta la fuente que la posee. Un agente de fondo lee mientras sigues trabajando, y escribe un único Markdown con cada afirmación citada, guardado donde el repositorio ya guarda dichas notas, o en un lugar sensato y declarado.",
    resumen: "Lanza un agente de fondo para que investigue mientras sigues trabajando. Su tarea: investigar la pregunta contra fuentes PRIMARIAS (documentación oficial, código fuente, especificaciones, API de primera mano), no contra el escrito secundario de otra persona; seguir cada afirmación hacia atrás hasta la fuente que la posee; escribir los hallazgos en un único archivo Markdown, citando la fuente de cada afirmación; y guardarlo donde el repositorio ya conserve ese tipo de notas, siguiendo la convención que exista, y si no hay, un lugar sensato avisando dónde quedó. Sirve para investigar un tema, recoger datos de documentación o API, o delegar lectura de fondo mientras el principal sigue su trabajo.",
    rutaCompleta: `${RAIZ}/research/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "improve-codebase-architecture",
    nombre: "Mejorar la arquitectura del código",
    cuando: "Cuando se quiere revisar el código en busca de fricción de arquitectura y módulos superficiales que convenga profundizar.",
    tarjeta: "Busca oportunidades de PROFUNDIZAR: refactorizaciones que vuelven profundos los módulos superficiales. Alcance antes de escanear: pésalo por lo que cambió recientemente; sin foco, mira los puntos calientes del historial. Informa visual y autocontenido en el directorio temporal, cada candidato con problema, solución, beneficios y un diagrama antes y después; luego la persona elige y se interroga el candidato.",
    resumen: "Busca fricción de arquitectura y oportunidades de profundizar: módulos superficiales hechos profundos, para probarlos y recorrerlos mejor. Vocabulario del diseño de módulos siempre; los ADR no se reconsideran sin motivo. Antes de escanear: dirección nombrada o puntos calientes del historial. Explora libremente: interfaces casi tan complejas como su implementación, funciones puras extraídas mientras los fallos viven en los llamadores, acoplamientos que cruzan la costura, y la prueba del borrado a cada sospecha. El informe es un único HTML autocontenido en carpeta temporal, cada candidato con problema, solución, beneficios, diagrama antes y después, fuerza de la recomendación y la principal al cierre. Sin proponer interfaces todavía: la persona elige y el bucle de interrogatorio afina glosario y ADR sobre la marcha.",
    rutaCompleta: `${RAIZ}/improve-codebase-architecture/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
  {
    id: "implement",
    nombre: "Implementar desde la especificación",
    cuando: "Cuando el trabajo ya está descrito en una especificación o un conjunto de tickets y hay que escribirlo.",
    tarjeta: "Implementa el trabajo de una especificación o sus tickets. Con una referencia, recuperala del rastreador y di su título antes; ambigua, pregunta. Aplica TDD en costuras acordadas, comprueba tipos a menudo y pruebas sueltas, y la suite entera solo una vez al final. Acaba revisando el trabajo con la habilidad de revisión y haz commit en la rama actual.",
    resumen: "Implementa el trabajo descrito en una especificación o en un conjunto de tickets. Si se pasa una referencia de ticket, se recupera del rastreador de issues y se enuncia su título antes de empezar; si la referencia es ambigua, se pregunta, nunca se adivina. Se guía el trabajo con la habilidad de TDD siempre que se pueda, en las costuras acordadas de antemano. Se ejecuta la comprobación de tipos con regularidad, las pruebas de un archivo concreto también a menudo, y la suite completa solo una vez, al final del trabajo. Al acabar, se revisa el propio trabajo invocando la habilidad de revisión de código en dos ejes, y se hace commit del resultado en la rama actual.",
    rutaCompleta: `${RAIZ}/implement/SKILL.md`,
    licencia: "MIT",
    autor: "Matt Pocock",
  },
];

