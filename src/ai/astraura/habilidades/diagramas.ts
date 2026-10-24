import type { PreguntaChoice } from "@/lib/jev/decisiones";
import type { SkillCapability } from "@/ai/astraura/skills";
/**
 * Diagramas · Habilidad Diagram Design para Astraura en tres tamaños.
 * Dibuja diagramas como UN archivo HTML con SVG en línea, estilo editorial y marca
 * del contexto (contrato: architecture/diagramas.md). La TARJETA (≤ 60 palabras) va
 * a Needle y BitNet, el RESUMEN (≤ 120 palabras) a Bonsai pequeño y la ruta COMPLETA
 * (`rutaCompleta`) a las capas razón, profunda y nube. Laya elige el tipo de diagrama
 * entre los 45 con `preguntaTipo` (pregunta «choice» con nombre y una frase por tipo).
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj (sirve en cliente y servidor).
 */

export const MAX_PALABRAS_TARJETA = 60, MAX_PALABRAS_RESUMEN = 120;

export const ATRIBUCION_DIAGRAMAS =
  "Habilidad Diagram Design de Cathryn Lavery (github.com/cathrynlavery/diagram-design), licencia MIT.";

export interface HabilidadDiagramas {
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
  autor: "Diagram Design";
}

export interface TipoDiagrama {
  /** Igual al slug de su guía: `references/type-<id>.md`. */
  id: string;
  nombre: string;
  /** Una frase, fiel al «Best for» de su guía. */
  frase: string;
}

export const HABILIDAD_DIAGRAMAS: HabilidadDiagramas = {
  id: "diagram-design",
  nombre: "Diagram Design · Diagramas editoriales",
  cuando: "Cuando la petición pide dibujar arquitectura, flujos, datos, estado, planificación o cualquier estructura que se entienda mejor en un diagrama que en prosa.",
  tarjeta: "Convierte una petición en un diagrama editorial: UN archivo HTML autocontenido con SVG incrustado, desde una plantilla del estilo del contexto. Si el comportamiento lleva el significado, elige primero un patrón semántico y luego el tipo visual entre los 45. Declara el plan antes de dibujar. Presupuesto: 9 nodos, 12 flechas y 2 acentos; lo mejor suele ser eliminar.",
  resumen: "Diagram Design dibuja diagramas como un único archivo HTML autocontenido con SVG incrustado, con estilo editorial y su marca. Filosofía: lo mejor suele ser eliminar; densidad 4/10, máximos 9 nodos, 12 flechas y 2 acentos. Respeta la guía de estilo o su perfil guardado; si es la de fábrica, pregúntalo. Si el comportamiento lleva el significado, elige un patrón semántico antes del tipo visual, y el tipo entre los 45 (arquitectura, flujo, Gantt, Sankey, Wardley…). Declara el plan antes de dibujar: tipo, tamaño y qué expulsará el presupuesto. Conectores ortogonales con etiquetas enmascaradas; SVG accesible con sus elementos title y desc. Importar draw.io, Mermaid y Excalidraw es redibujar, con informe de fidelidad. Exporta SVG y PNG solo si lo piden.",
  rutaCompleta: "vendor/habilidades/diagram-design/SKILL.md",
  licencia: "MIT",
  autor: "Diagram Design",
};

export const TIPOS_DIAGRAMA: TipoDiagrama[] = [
  { id: "architecture", nombre: "Arquitectura", frase: "Componentes y conexiones en una instantánea: visión de sistema, flujos de datos, integraciones y topología de infraestructura." },
  { id: "architecture-delta", nombre: "Delta de arquitectura", frase: "El cambio estructural entre un antes y un después sincronizados, diciendo qué sobrevive, aparece, desaparece o se reconecta." },
  { id: "it-state", nombre: "Estado actual de TI", frase: "El paisaje heredado por fases o departamentos, con puntos de dolor y traspasos por ficheros: el antes que una modernización va a cerrar." },
  { id: "flowchart", nombre: "Flujo", frase: "Lógica de decisiones con ramas: algoritmos, flujos con elecciones del usuario, triajes y enrutamiento de arranque." },
  { id: "sequence", nombre: "Secuencia", frase: "Mensajes ordenados en el tiempo entre actores: protocolos, llamadas de API y reconstrucciones de incidentes." },
  { id: "state", nombre: "Máquina de estados", frase: "Estados con transiciones y condiciones guardia: estados de pedidos, conexiones, formularios y colas de trabajo." },
  { id: "er", nombre: "Entidad-relación", frase: "Entidades con campos y relaciones: modelos conceptuales y de dominio donde lo que cuenta es la cardinalidad." },
  { id: "timeline", nombre: "Línea de tiempo", frase: "Eventos posicionados en el tiempo: hitos, historial de versiones e incidentes." },
  { id: "swimlane", nombre: "Carriles", frase: "Procesos entre funciones con traspasos: flujos de varios equipos y traspasos con proveedores." },
  { id: "quadrant", nombre: "Cuadrante", frase: "Posicionamiento y priorización en dos ejes: impacto por esfuerzo, mapas de cartera y marcos de decisión 2×2." },
  { id: "radar", nombre: "Radar", frase: "De 3 a 5 entidades comparadas en 3–5 criterios cuantitativos a escala común: matrices de capacidades y evaluaciones." },
  { id: "polar", nombre: "Polar", frase: "Una serie cuantitativa sobre de 4 a 8 categorías cuyo orden en el sentido del reloj significa algo; ángulo es categoría y radio, magnitud." },
  { id: "loop", nombre: "Bucle", frase: "Ciclos de refuerzo donde el último paso alimenta al primero y un eje común acumula estado: ruedas y bucles de operar." },
  { id: "nested", nombre: "Anidado", frase: "Jerarquía por contención: alcances, zonas de confianza, carpetas y radio de impacto, donde fuera es más general." },
  { id: "tree", nombre: "Árbol", frase: "Relaciones de padre a hijo: taxonomías, árboles de ficheros y desgloses de decisiones." },
  { id: "org-chart", nombre: "Organigrama", frase: "Propiedad y escalado de personas o agentes: quién posee qué, rutas de soporte y jerarquías." },
  { id: "layers", nombre: "Pila de capas", frase: "Niveles apilados de abstracción: modelo OSI, pila tecnológica, cascada de estilos o jerarquía de memoria." },
  { id: "exploded", nombre: "Despiece", frase: "Un objeto en proyección paralela con sus partes separadas a lo largo de un eje: desmontaje, unboxing u orden de montaje." },
  { id: "axonometric-plan", nombre: "Planta axonométrica", frase: "Una planta o un sitio vistos desde arriba en ángulo, con lo que hay sobre él: oficinas, campus, almacenes." },
  { id: "venn", nombre: "Venn", frase: "Solapamiento entre conjuntos: atributos compartidos y donde A se encuentra con B, como en ikigai." },
  { id: "pyramid", nombre: "Pirámide y embudo", frase: "Jerarquías de necesidad, rangos de prioridad y caída de conversión, ordenadas de más a menos." },
  { id: "bar", nombre: "Barras", frase: "Comparación de cantidades discretas por categoría o franja temporal, con una sola cifra por barra; variante dumbbell de dos valores." },
  { id: "waterfall", nombre: "Cascada", frase: "Cómo un total inicial llega al total final por aportaciones con signo: puentes de presupuesto y altas menos bajas." },
  { id: "treemap", nombre: "Treemap", frase: "Parte de un todo donde lo que cuenta son los tamaños relativos: uso de disco, gasto o reparto del tiempo." },
  { id: "heatmap", nombre: "Mapa de calor", frase: "Datos cruzados en una matriz donde lo que añade valor es qué casilla sobresale del conjunto: fallos por servicio y sprint, causas de cómputo." },
  { id: "line", nombre: "Líneas", frase: "Tendencias continuas en el tiempo o sobre un índice ordenado: lo que cuenta es la dirección y el ritmo del cambio entre puntos." },
  { id: "gantt", nombre: "Gantt", frase: "Planes con tareas de inicio y fin agrupadas en fases: solapes, pistas paralelas y secuencia de hitos de un vistazo." },
  { id: "scatter", nombre: "Dispersión", frase: "Correlación y distribución de dos variables continuas: clústeres, casos atípicos y niveles; variantes de burbuja y beeswarm." },
  { id: "high-level", nombre: "Visión general", frase: "La pila de datos de extremo a extremo sobre un orquestador de contenedores: entrada, almacenamiento, consulta, análisis y visualización." },
  { id: "process", nombre: "Proceso", frase: "Proceso secuencial con varios actores: quién hace qué, qué datos entran y salen de cada paso y con qué herramientas." },
  { id: "medallion", nombre: "Medallion", frase: "Almacenamiento por niveles de calidad y acceso del mismo conjunto de datos: bruto, limpio, agregado y archivo." },
  { id: "data-flow", nombre: "Flujo de datos", frase: "Cómo se mueven los datos por una canalización entre roles de la organización: quién inicia, procesa, publica y consume." },
  { id: "dp-integration", nombre: "Integración de plataforma de datos", frase: "La topología de integración de una plataforma de datos: qué fuentes y consumidores se enchufan y con qué protocolo." },
  { id: "dp-security-matrix", nombre: "Matriz de seguridad", frase: "Permisos por rol y componente de la plataforma en una parrilla: qué puede leer, escribir o administrar cada grupo." },
  { id: "sankey", nombre: "Sankey", frase: "Dónde va una cantidad que se reparte y se reúne por etapas: el grosor de la cinta lleva el dato." },
  { id: "fishbone", nombre: "Espina de pescado", frase: "Causas de un efecto observado agrupadas por categoría: el análisis de causa raíz de las revisiones de incidentes." },
  { id: "wardley", nombre: "Wardley", frase: "La cadena de valor contra la evolución de cada componente: qué construir, qué comprar y qué está a punto de moverse." },
  { id: "kanban", nombre: "Kanban", frase: "Foto del trabajo en curso por estado, sin flechas: qué está en cola, en movimiento, bloqueado o pasándose el límite de WIP." },
  { id: "journey", nombre: "Viaje de usuario", frase: "Lo que hace una persona por las etapas de una experiencia y cómo lo siente en cada una; sin curva de sentimiento, no es este tipo." },
  { id: "service-blueprint", nombre: "Blueprint de servicio", frase: "Lo que el cliente hace, lo que ve y lo que queda oculto, separados por la línea de visibilidad sobre una misma parrilla." },
  { id: "deployment", nombre: "Despliegue", frase: "Dónde corre el software: anfitriones, pods y servicios gestionados dentro de zonas de red, con réplicas y artefactos versionados." },
  { id: "dependency", nombre: "Dependencias", frase: "Qué depende de qué entre paquetes o servicios, expresando padres múltiples y ciclos que un árbol no puede." },
  { id: "uml-class", nombre: "Clases UML", frase: "La estructura estática del modelo de objetos: clases con operaciones, herencia y composición que una ER no expresa." },
  { id: "story-map", nombre: "Story map", frase: "La historia completa de la experiencia en orden narrativo, con el corte de la primera entrega como punto editorial." },
  { id: "db-schema", nombre: "Esquema de base de datos", frase: "Tablas físicas con tipos SQL reales, restricciones, índices y claves externas de columna a columna: el DDL legible." },
];

/** Palabras de un texto: trozos separados por espacios (cuenta estricta, también símbolos). */
export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Arma la pregunta «choice» de Laya para elegir el tipo de diagrama por la petición.
 *  Con `tipos` (ids de `TipoDiagrama`) limita las opciones, por ejemplo al bloque afín. */
export function preguntaTipo(tipos?: string[]): PreguntaChoice {
  const elegidos = tipos?.length ? TIPOS_DIAGRAMA.filter((t) => tipos.includes(t.id)) : TIPOS_DIAGRAMA;
  const criteria: Record<string, string> = {};
  for (const t of elegidos) criteria[t.id] = `${t.nombre}: ${t.frase}`;
  return { type: "choice", instructions: "¿Qué tipo de diagrama encaja mejor con la petición?", criteria };
}

/** Adapta la habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidad(h: HabilidadDiagramas, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}
