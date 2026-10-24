/**
 * Guías de introducción · textos de la red (GUI1021B, Ola 1021G).
 * ═══════════════════════════════════════════════════════════════════════════
 * Los tres pilares de la red social (Política, Educación, Cultura), la Librería y la Biblioteca,
 * Genesis y PoliGenesis, y la personalización ilimitada y segura. Textos del §3 de
 * `architecture/guias-introduccion.md`, copiados tal cual (la prueba los compara con el contrato).
 *
 * Honestidad: lo que aún no existe va «en camino» (las aulas con agentes) y ningún texto presenta
 * como hecha la verificación biométrica de «una persona, una voz».
 *
 * Módulo PURO: sin React ni `node:*`; lo importan componentes de cliente.
 */

import { TEMAS_SISTEMA, type TemaGuia } from "./guia-temas-sistema";

/** Los seis temas de la red, en el orden del tour. */
export const TEMAS_RED: readonly TemaGuia[] = [
  {
    key: "pilar-politica", titulo: "Política: gobierno directo", ruta: "/network/politics",
    cuerpo: "Aquí no hay representantes: propones leyes y proyectos, los debates con enmiendas y votas. Puedes delegar tu voto en quien sepa de un tema y retirarlo cuando quieras. El poder se reparte en Legislativo (decisiones en vivo y el Consejo de Aurora), Ejecutivo (mandatos aprobados y recursos comunes) y Judicial (constitucionalidad y Círculos de Paz para mediar, nunca castigar).",
    voz: "En Política propones, debates y votas sin intermediarios, y puedes delegar tu voto y retirarlo cuando quieras.",
    preguntaAurora: "Aurora, llévame a Política",
    puntos: ["nueva propuesta", "voto líquido revocable", "solo se ejecuta lo que cumple tiempo, participación y umbral", "votos públicos", "Círculos de Paz"],
  },
  {
    key: "pilar-educacion", titulo: "Educación: aprender juntos", ruta: "/network/education",
    cuerpo: "La red de categorías y temas y el Mapa del Conocimiento (en lista, 2D o 3D) te llevan a lo que quieres aprender. En Estudio con Aurora tienes guías e itinerarios, exámenes con insignias, grupos de estudio, tareas y proyectos, y la Biblioteca universal a un toque.",
    voz: "En Educación exploras el Mapa del Conocimiento y estudias con Aurora: itinerarios, exámenes con insignias y grupos de estudio.",
    preguntaAurora: "Aurora, llévame a Educación",
    puntos: ["mapa del conocimiento", "estudio con Aurora", "insignias por lo aprendido", "grupos de estudio", "aulas con agentes en camino"],
  },
  {
    key: "pilar-cultura", titulo: "Cultura: crear y encontrarse", ruta: "/network/culture",
    cuerpo: "Publica y crea en el Lienzo Universal o en una pizarra, mira lo que está en vivo, sigue tendencias y la agenda de encuentros, y entra al Multiverso inmersivo. Tu obra es una entidad única: se comparte por referencia y sus cambios llegan a todas partes.",
    voz: "En Cultura creas, compartes y te encuentras: publicaciones, en vivo, agenda y el Multiverso.",
    preguntaAurora: "Aurora, llévame a Cultura",
    puntos: ["para ti, siguiendo, tendencias, explorar", "en vivo y mapa global", "agenda de encuentros", "Multiverso", "crear en el Lienzo o la pizarra"],
  },
  {
    key: "libreria-biblioteca", titulo: "Librería y Biblioteca", ruta: "/library",
    cuerpo: "La Librería es el catálogo en línea de toda la red: apps, repos, diseños y recursos que se actualizan solos desde sus fuentes. Tu Biblioteca es lo que tú (o tu página, grupo o comunidad) guardas: referencias organizadas en carpetas, nunca copias, así que siempre ves la última versión.",
    voz: "La Librería es el catálogo de toda la red; tu Biblioteca, lo que tú guardas de él.",
    preguntaAurora: "Aurora, abre la Librería",
    puntos: ["instalar y actualizar solas", "repos de la comunidad y de GitHub", "biblioteca por persona o grupo", "referencias, no copias", "versiones y comentarios"],
  },
  {
    key: "genesis", titulo: "Genesis y PoliGenesis", ruta: "/genesis",
    cuerpo: "Genesis es tu taller del sistema: pides en tus palabras un cambio de perfil, páginas, apariencia, dock o widgets, o un agente nuevo, y ves la propuesta antes de aceptarla; siempre puedes deshacer. PoliGenesis hace lo mismo para grupos y páginas: si el grupo es democrático (lo normal), cada cambio es una propuesta que se vota.",
    voz: "En Genesis pides cambios del sistema en tus palabras; en PoliGenesis, tu grupo los decide votando.",
    preguntaAurora: "Aurora, abre Genesis",
    puntos: ["Mi Genesis", "vista previa y deshacer", "PoliGenesis democrático o con roles", "MetaGenesis es el código del OS (para desarrolladores)"],
  },
  {
    key: "personalizacion-segura", titulo: "Personalización ilimitada y segura", ruta: "/genesis",
    cuerpo: "Puedes rehacer tu interfaz entera con la IA, compartirla y usar la de otros, porque la interfaz es un dato, no un programa: nadie ejecuta código de nadie. Hay un núcleo que nada puede quitar: salida siempre, identidad soberana, permisos visibles, navegación fundamental, voto íntegro, datos honestos y deshacer. Lo personal es privado y cifrado; lo que ejerce poder público, transparente.",
    voz: "Puedes cambiarlo todo y compartirlo, con un núcleo de seguridad que nada quita.",
    preguntaAurora: "Aurora, ¿qué puedo personalizar?",
    puntos: ["la interfaz es un dato", "núcleo intocable de siete reglas", "lo compartido se revisa antes de instalar", "memoria personal › perfil › grupo › pública", "tu clave no sale de tu aparato"],
  },
];

/** Los diez temas de la guía: primero los del sistema y luego los de la red. */
export const TODOS_LOS_TEMAS: readonly TemaGuia[] = [...TEMAS_SISTEMA, ...TEMAS_RED];
