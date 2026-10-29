/**
 * La guía completa de StarSeed OS · UN solo catálogo de pasos (Ola 1025U · GUIA1025U).
 * ═══════════════════════════════════════════════════════════════════════════
 * Alex (2026-10-26): «A la guía introducción le faltan varios pasos que no sé por qué no aparecen completos
 * desde cualquier medio, creando o no la cuenta.» La causa: había DOS guías con pasos distintos —la
 * introducción de la ventana de acceso (4 pasos) y el recorrido de Aurora (12)— y diez demostraciones
 * hechas (Protomolécula, malla, capas, neuronas, los tres pilares, Librería, Genesis y personalización
 * segura) que no se usaban en ningún sitio.
 *
 * Este módulo es la ÚNICA lista de pasos. La leen a la vez:
 *   · la introducción de `PaginaAcceso` / `VentanaAcceso` (`auth/ventana-acceso.tsx`), con o sin cuenta;
 *   · el recorrido de Aurora (`onboarding/aurora-guide.tsx`), que añade encima voz, «Ir» y «Hazlo por mí».
 * Los dos recorren LOS MISMOS pasos, en el mismo orden y con el mismo progreso «paso N de M».
 *
 * Los textos del sistema y de la red NO se copian aquí: salen de `guia-temas-sistema.ts` y
 * `guia-temas-red.ts` (la fuente de `architecture/guias-introduccion.md` §3). Honestidad: nada que no
 * exista se enseña como si existiera —lo que está en camino se dice «en camino» y la verificación
 * biométrica de «una persona, una voz» no se menciona como hecha—.
 *
 * Lo que NO vive aquí, a propósito: iconos, selectores del foco y acciones de «Hazlo por mí» (son de la
 * interfaz). El catálogo es dato puro: sin React, sin `node:*`, sin tocar el almacén; lo importan
 * componentes de cliente.
 */

import { TEMAS_RED } from "./guia-temas-red";
import { TEMAS_SISTEMA, type TemaGuia } from "./guia-temas-sistema";

/* ─────────────────────────────── Acentos Trinity ─────────────────────────────── */

/** Los cuatro nodos Trinity y el centro (Aurora): el acento de cada paso. */
export const ACENTOS_TRINITY = {
  zenith: "#007FFF",
  horizon: "#39FF14",
  logic: "#FFBF00",
  anchor: "#DC143C",
  aurora: "#C9A8FF",
} as const;
export type AcentoTrinity = keyof typeof ACENTOS_TRINITY;
/** Los cuatro bordes que abre Trinity (el centro no es un borde). */
export type BordeTrinity = Exclude<AcentoTrinity, "aurora">;

/* ─────────────────────────────────── Demos ─────────────────────────────────── */

/** Demostraciones del sistema (`demos-sistema.tsx` → `DEMOS_SISTEMA`). */
export const CLAVES_DEMO_SISTEMA = ["protomolecula", "malla", "capas-conciencia", "neuronas-cerebro"] as const;
/** Demostraciones de la red (`demos-red.tsx` → `DEMOS_RED`). */
export const CLAVES_DEMO_RED = [
  "pilar-politica", "pilar-educacion", "pilar-cultura", "libreria-biblioteca", "genesis", "personalizacion-segura",
] as const;

/**
 * Demostraciones del recorrido de Aurora (`aurora-guide-demos.tsx` → `StepDemo`): las propias del
 * paso MÁS las diez de temas que sus parciales GUI1021Gb-d1b/-d2/-d3 montaron dentro de `StepDemo`
 * a partir de `demos-sistema.tsx` y `demos-red.tsx`. La clave vieja `cerebros` despacha a la
 * demo nueva «neuronas-cerebro» por compatibilidad. Debe cuadrar con los `case` de `StepDemo` y
 * con `CLAVES_STEPDEMO` (`guia-completa-catalogo.test.ts`).
 */
export const CLAVES_DEMO_PASO = [
  "orbe", "trinity-zenith", "trinity-horizon", "trinity-logic", "trinity-anchor",
  "gestos-hibridos", "escritorio", "dashboard", "astraura", "perfil", "cerebros",
  ...CLAVES_DEMO_SISTEMA,
  ...CLAVES_DEMO_RED,
] as const;

export type ClaveDemo =
  | (typeof CLAVES_DEMO_PASO)[number]
  | (typeof CLAVES_DEMO_SISTEMA)[number]
  | (typeof CLAVES_DEMO_RED)[number];

/** Todas las claves de demostración que existen. */
export const CLAVES_DEMO: readonly ClaveDemo[] = [...CLAVES_DEMO_PASO, ...CLAVES_DEMO_SISTEMA, ...CLAVES_DEMO_RED];

/** De qué archivo sale cada demostración (decide cuál se carga a demanda). */
export function origenDeDemo(clave: ClaveDemo): "paso" | "sistema" | "red" {
  if ((CLAVES_DEMO_SISTEMA as readonly string[]).includes(clave)) return "sistema";
  if ((CLAVES_DEMO_RED as readonly string[]).includes(clave)) return "red";
  return "paso";
}

/* ─────────────────────────────────── Capítulos ─────────────────────────────────── */

export type CapituloId =
  | "bienvenida" | "trinity" | "sistema" | "red" | "libreria" | "genesis" | "personalizacion" | "espacio" | "cuenta";

export interface CapituloGuia {
  id: CapituloId;
  titulo: string;
  /** Una línea: de qué trata (para el índice). */
  resumen: string;
}

export const CAPITULOS_GUIA: readonly CapituloGuia[] = [
  { id: "bienvenida", titulo: "Bienvenida", resumen: "Qué es StarSeed OS." },
  { id: "trinity", titulo: "Trinity y gestos", resumen: "El orbe, los cuatro menús y cómo se abren." },
  { id: "sistema", titulo: "El sistema", resumen: "Protomolécula, malla, capas de conciencia, neuronas y cerebro." },
  { id: "red", titulo: "La red", resumen: "Los tres pilares: política, educación y cultura." },
  { id: "libreria", titulo: "Librería y Biblioteca", resumen: "El catálogo de la red y lo que tú guardas." },
  { id: "genesis", titulo: "Genesis y PoliGenesis", resumen: "Pedir cambios del sistema, tú o tu grupo." },
  { id: "personalizacion", titulo: "Personalización segura", resumen: "Cambiarlo todo, con un núcleo que nada quita." },
  { id: "espacio", titulo: "Tu espacio", resumen: "Escritorio, dashboard, Astraura, perfil y cerebro." },
  { id: "cuenta", titulo: "Tu cuenta", resumen: "Crear una cuenta, entrar o explorar sin ella." },
];

/* ─────────────────────────────────── Pasos ─────────────────────────────────── */

export type PerfilTexto = "tactil" | "raton" | "hibrido";

export interface TarjetaPaso {
  id: string;
  titulo: string;
  texto: string;
}

export interface RazonCuenta {
  id: string;
  titulo: string;
  texto: string;
}

export interface PasoGuia {
  id: string;
  capitulo: CapituloId;
  titulo: string;
  /** Explicación completa. */
  texto: string;
  /** Versión corta: lo que narra Aurora y el subtítulo del paso en la ventana de acceso. */
  voz: string;
  /** Animación del paso; `null` si el paso es de lectura (bienvenida, qué es, cuenta). */
  demo: ClaveDemo | null;
  acento: AcentoTrinity;
  /** Ideas clave en lista corta (las del tema en la SOP). */
  puntos?: readonly string[];
  /** Tarjetas con título y texto (el paso «Qué es StarSeed OS»). */
  tarjetas?: readonly TarjetaPaso[];
  /** Ruta REAL a la que lleva «Ir». Necesita cuenta. */
  ruta?: string;
  /** Borde Trinity que abre «Ir» (no necesita cuenta). */
  borde?: BordeTrinity;
  /** Texto del botón «Ir». */
  irEtiqueta?: string;
  /** La frase para pedírselo a Aurora. */
  pregunta?: string;
  /** Texto y narración según el aparato (táctil, ratón, híbrido). */
  textoPorPerfil?: Partial<Record<PerfilTexto, string>>;
  vozPorPerfil?: Partial<Record<PerfilTexto, string>>;
  /** Lo que cambia cuando ya hay sesión (solo el último paso). */
  conSesion?: { titulo: string; texto: string; voz: string };
}

/** Un paso a partir de un tema del sistema o de la red: los textos se toman tal cual. */
function deTema(
  tema: TemaGuia,
  capitulo: CapituloId,
  demo: ClaveDemo,
  acento: AcentoTrinity,
  irEtiqueta: string,
): PasoGuia {
  return {
    id: tema.key,
    capitulo,
    titulo: tema.titulo,
    texto: tema.cuerpo,
    voz: tema.voz,
    demo,
    acento,
    puntos: tema.puntos,
    ruta: tema.ruta,
    irEtiqueta,
    pregunta: tema.preguntaAurora,
  };
}

function tema(lista: readonly TemaGuia[], key: string): TemaGuia {
  const t = lista.find((x) => x.key === key);
  if (!t) throw new Error(`guia-completa: falta el tema «${key}»`);
  return t;
}

/** Las razones breves para tener cuenta (bajo el formulario y en el último paso). */
export const RAZONES_CUENTA: readonly RazonCuenta[] = [
  { id: "una-cuenta", titulo: "Una sola cuenta", texto: "OS, Nexus, Café y Audiomorphic con un mismo acceso." },
  { id: "direccion", titulo: "Dirección @star.seed", texto: "Tu identidad interna en la red, lista al crear la cuenta." },
  { id: "aurora-guia", titulo: "Aurora te guía", texto: "Una guía inteligente te ayuda a dejar todo listo." },
];

export const PASOS_GUIA: readonly PasoGuia[] = [
  /* ── Bienvenida ── */
  {
    id: "bienvenida",
    capitulo: "bienvenida",
    titulo: "Te damos la bienvenida a StarSeed OS",
    texto: "Tu sistema operativo social: escritorios, biblioteca, apps y Aurora, tu inteligencia personal, en todos tus dispositivos con una sola cuenta.",
    voz: "Tu sistema operativo social: escritorios, biblioteca, apps y Aurora, tu inteligencia personal, en todos tus dispositivos con una sola cuenta.",
    demo: null,
    acento: "aurora",
  },
  {
    id: "que-es",
    capitulo: "bienvenida",
    titulo: "Qué es StarSeed OS",
    texto: "Un sistema abierto que es tuyo: tus datos, tu IA y tu voz en la comunidad.",
    voz: "Un sistema abierto que es tuyo: tus datos, tu IA y tu voz en la comunidad.",
    demo: null,
    acento: "horizon",
    tarjetas: [
      { id: "escritorios", titulo: "Tus escritorios", texto: "Ventanas, widgets y apps que se sincronizan en todos tus dispositivos." },
      { id: "aurora", titulo: "Aurora, tu inteligencia", texto: "Una IA que es tuya: te guía, crea contigo y también funciona en tu propio equipo." },
      { id: "biblioteca", titulo: "Biblioteca y apps", texto: "Lo que guardas e instalas te sigue a cualquier dispositivo." },
      { id: "comunidad", titulo: "Comunidad y gobernanza", texto: "Decide con otras personas sin intermediarios: propones, debates y votas." },
    ],
  },

  /* ── Trinity y gestos ── */
  {
    id: "orbe",
    capitulo: "trinity",
    titulo: "El Orbe de Aurora",
    texto: "Aurora vive en el orbe flotante, presente en todas las pantallas. Un TOQUE activa o para su voz; MANTENER pulsado abre el menú Trinity centrado y, sin soltar, DESLIZAS hacia una opción para abrirla; ARRASTRA el orbe para moverlo (o llévalo arriba para ocultarlo). Con clic derecho abres su chat completo en el Exocórtex.",
    voz: "Este es mi orbe. Tócame para activar o parar mi voz; mantén pulsado para abrir el menú Trinity y desliza hacia una opción; arrástrame para moverme.",
    demo: "orbe",
    acento: "aurora",
    pregunta: "Aurora, abre tu chat en el Exocórtex",
  },
  {
    id: "trinity-zenith",
    capitulo: "trinity",
    titulo: "Trinity · Zenith (arriba)",
    texto: "Zenith es tu guía de IA y el Exocórtex: la cortina superior donde Aurora piensa contigo, con acceso a su chat, sentidos y contexto. Es el nodo azul del norte. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde superior.",
    voz: "Arriba está Zenith, el nodo azul: mi Exocórtex, donde pienso contigo. Ábrelo desde el menú Trinity o deslizando desde el borde superior.",
    demo: "trinity-zenith",
    acento: "zenith",
    borde: "zenith",
    irEtiqueta: "Abrir Zenith",
    pregunta: "Aurora, abre Zenith",
  },
  {
    id: "trinity-horizon",
    capitulo: "trinity",
    titulo: "Trinity · Horizon (izquierda)",
    texto: "Horizon es el lienzo de Creación: el nodo verde del oeste. Desde aquí generas y das forma a ideas, contenidos y espacios. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde izquierdo.",
    voz: "A la izquierda, Horizon, el nodo verde: tu lienzo de creación para dar forma a ideas y contenidos. Ábrelo desde el borde izquierdo.",
    demo: "trinity-horizon",
    acento: "horizon",
    borde: "horizon",
    irEtiqueta: "Abrir Horizon",
    pregunta: "Aurora, abre Horizon",
  },
  {
    id: "trinity-logic",
    capitulo: "trinity",
    titulo: "Trinity · Logic (derecha)",
    texto: "Logic es el control del sistema: el nodo ámbar del este. Reúne ajustes, paneles y el mando de lo que ocurre en el OS. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde derecho.",
    voz: "A la derecha, Logic, el nodo ámbar: el control del sistema, con ajustes y paneles. Ábrelo desde el borde derecho.",
    demo: "trinity-logic",
    acento: "logic",
    borde: "logic",
    irEtiqueta: "Abrir Logic",
    pregunta: "Aurora, abre Logic",
  },
  {
    id: "trinity-anchor",
    capitulo: "trinity",
    titulo: "Trinity · Anchor (abajo)",
    texto: "Anchor es tu dock y acceso raíz: el nodo carmesí del sur. Desde el OmniDock saltas entre las apps y secciones del sistema. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde inferior.",
    voz: "Abajo, Anchor, el nodo carmesí: tu dock y acceso raíz para saltar entre apps y secciones. Ábrelo desde el borde inferior.",
    demo: "trinity-anchor",
    acento: "anchor",
    borde: "anchor",
    irEtiqueta: "Abrir el Dock",
    pregunta: "Aurora, abre el dock",
  },
  {
    // Interfaz híbrida: el mismo gesto en cualquier pantalla, con práctica real (demo-gestos-hibridos.tsx).
    id: "gestos-hibridos",
    capitulo: "trinity",
    titulo: "Gestos naturales en cualquier pantalla",
    texto: "Los cuatro menús se abren y se cierran igual en móvil, tableta u ordenador. Ábrelos desde su borde; ciérralos devolviéndolos a su borde, tocando fuera, con la X de su esquina o con Escape. StarSeed detecta solo si usas el dedo, el ratón o los dos, y se adapta al tamaño y a la orientación de tu pantalla.",
    textoPorPerfil: {
      tactil: "Desliza el dedo desde cualquier borde hacia dentro: el menú de ese lado aparece bajo tu dedo y lo sigue. Para cerrarlo, arrástralo de vuelta a su borde (un gesto rápido basta), toca fuera o pulsa la X de su esquina. Todo se adapta solo al tamaño y a la orientación de tu pantalla.",
      raton: "Deja el cursor un instante en un borde, haz clic en él o tira de él con el ratón: el menú sigue a tu puntero. En un portátil también puedes deslizar dos dedos en el panel táctil. Para cerrar: la X de la esquina, un clic fuera, la tecla Escape o arrastrarlo a su borde.",
      hibrido: "Con el dedo, desliza desde un borde; con el ratón, deja el cursor en el borde, haz clic o tira de él. Para cerrar sirve lo mismo en los dos: devolverlo a su borde, tocar fuera, la X de su esquina o Escape. StarSeed detecta qué usas en cada momento y se adapta solo.",
    },
    voz: "Los menús se abren desde su borde y se cierran devolviéndolos a su borde, tocando fuera, con la X o con Escape. Pruébalo en el recuadro.",
    vozPorPerfil: {
      tactil: "Desliza el dedo desde un borde y el menú te sigue. Para cerrarlo, devuélvelo a su borde, toca fuera o pulsa la X. Pruébalo en el recuadro.",
      raton: "Deja el cursor en un borde, haz clic o tira de él. Para cerrar, usa la X, un clic fuera o la tecla Escape. Pruébalo en el recuadro.",
    },
    demo: "gestos-hibridos",
    acento: "horizon",
    borde: "horizon",
    irEtiqueta: "Probar con Horizon",
    pregunta: "Aurora, ¿cómo cierro los menús?",
  },

  /* ── El sistema ── */
  deTema(tema(TEMAS_SISTEMA, "protomolecula"), "sistema", "protomolecula", "horizon", "Abrir la Protomolécula"),
  deTema(tema(TEMAS_SISTEMA, "malla"), "sistema", "malla", "zenith", "Abrir la red mesh"),
  deTema(tema(TEMAS_SISTEMA, "capas-conciencia"), "sistema", "capas-conciencia", "aurora", "Ver mis capas de conciencia"),
  deTema(tema(TEMAS_SISTEMA, "neuronas-cerebro"), "sistema", "neuronas-cerebro", "anchor", "Abrir mi cerebro"),

  /* ── La red: los tres pilares ── */
  deTema(tema(TEMAS_RED, "pilar-politica"), "red", "pilar-politica", "logic", "Ir a Política"),
  deTema(tema(TEMAS_RED, "pilar-educacion"), "red", "pilar-educacion", "zenith", "Ir a Educación"),
  deTema(tema(TEMAS_RED, "pilar-cultura"), "red", "pilar-cultura", "horizon", "Ir a Cultura"),

  /* ── Librería y Biblioteca · Genesis · Personalización ── */
  deTema(tema(TEMAS_RED, "libreria-biblioteca"), "libreria", "libreria-biblioteca", "zenith", "Abrir la Librería"),
  deTema(tema(TEMAS_RED, "genesis"), "genesis", "genesis", "horizon", "Abrir Genesis"),
  deTema(tema(TEMAS_RED, "personalizacion-segura"), "personalizacion", "personalizacion-segura", "anchor", "Ver qué puedo personalizar"),

  /* ── Tu espacio ── */
  {
    id: "escritorio",
    capitulo: "espacio",
    titulo: "El Escritorio",
    texto: "El Escritorio es tu página principal: un espacio soberano con iconos y ventanas que organizas a tu gusto, como un sistema operativo. Aquí conviven tus apps, accesos y contenidos. Aurora puede navegar y actuar sobre él por voz.",
    voz: "El Escritorio es tu página principal: un espacio soberano con iconos y ventanas que organizas a tu gusto, como un sistema operativo.",
    demo: "escritorio",
    acento: "horizon",
    ruta: "/escritorios",
    irEtiqueta: "Ir al Escritorio",
    pregunta: "Aurora, llévame al escritorio",
  },
  {
    id: "dashboard",
    capitulo: "espacio",
    titulo: "El Dashboard",
    texto: "El Dashboard reúne tus widgets en una rejilla que puedes reordenar arrastrando: un vistazo vivo a tu red, tus datos y tus herramientas. Personalízalo para tener a mano lo que más usas.",
    voz: "El Dashboard reúne tus widgets en una rejilla que reordenas arrastrando: un vistazo vivo a tu red, tus datos y tus herramientas.",
    demo: "dashboard",
    acento: "logic",
    ruta: "/dashboard",
    irEtiqueta: "Ir al Dashboard",
    pregunta: "Aurora, abre el dashboard",
  },
  {
    id: "astraura",
    capitulo: "espacio",
    titulo: "Astraura · IA (Agente)",
    texto: "Astraura es la mente de Aurora: aquí configuras su cerebro (el modelo de IA), sus memorias, sus skills y sus sentidos, y hablas con ella por voz o texto. Es tu Exocórtex — propiedad tuya, leal a ti. Ajusta qué modelos usa y qué recuerda.",
    voz: "Astraura es mi mente: aquí configuras mi cerebro, mis memorias, mis skills y mis sentidos. Soy tu Exocórtex, propiedad tuya y leal a ti.",
    demo: "astraura",
    acento: "zenith",
    ruta: "/agent",
    irEtiqueta: "Abrir Astraura",
    pregunta: "Aurora, abre tu configuración de agente",
  },
  {
    id: "perfil",
    capitulo: "espacio",
    titulo: "Tu Perfil",
    texto: "Tu Perfil es tu cara pública en la red: nombre, @handle, avatar, biografía y lo que compartes. Recuerda que tu Cuenta (privada) es el ancla soberana y puedes tener varios perfiles (cívico, artístico, profesional) sobre ella.",
    voz: "Tu Perfil es tu cara pública: nombre, arroba, avatar y lo que compartes. Tu Cuenta privada es el ancla, y puedes tener varios perfiles sobre ella.",
    demo: "perfil",
    acento: "aurora",
    ruta: "/profile/me",
    irEtiqueta: "Ver mi Perfil",
    pregunta: "Aurora, muéstrame mi perfil",
  },
  {
    // (Corregido) Antes decía «Cerebros y Servidores» y llevaba a /cerebros con un grafo de servidores. Hoy la
    // sección es /cerebro: el cerebro de la cuenta con su parte privada y su parte pública (guias-introduccion.md §1).
    id: "cerebros",
    capitulo: "espacio",
    titulo: "Tu cerebro",
    texto: "En Cerebro ves el tuyo, con su parte privada (tu cuenta y tus perfiles) y su parte pública (tus grupos, comunidades y páginas). Ahí están sus memorias, habilidades, conectores y procesos activos, y desde ahí puedes fusionarlo con otros o vincularlo por telepatía.",
    voz: "En Cerebro ves el tuyo, con su parte privada y su parte pública: sus memorias, habilidades y conectores.",
    demo: "cerebros",
    acento: "anchor",
    ruta: "/cerebro",
    irEtiqueta: "Abrir mi cerebro",
    pregunta: "Aurora, abre mi cerebro",
  },

  /* ── Tu cuenta ── */
  {
    id: "cuenta",
    capitulo: "cuenta",
    titulo: "Crea tu cuenta o entra",
    texto: "Con tu cuenta, lo que hagas aquí aparece también en tus otros dispositivos.",
    voz: "Con tu cuenta, lo que hagas aquí aparece también en tus otros dispositivos.",
    demo: null,
    acento: "aurora",
    conSesion: {
      titulo: "Tu cuenta, tu espacio",
      texto: "Ya tienes cuenta: lo que hagas aquí aparece también en tus otros dispositivos. Puedes volver a esta guía cuando quieras desde Ajustes → Personalización.",
      voz: "Ya tienes cuenta: lo que hagas aquí aparece también en tus otros dispositivos. Puedes volver a esta guía desde Ajustes.",
    },
  },
];

/* ─────────────────────────────── Navegación y progreso ─────────────────────────────── */

export const TOTAL_PASOS = PASOS_GUIA.length;
export const ULTIMO_PASO = TOTAL_PASOS - 1;
export const TOTAL_CAPITULOS = CAPITULOS_GUIA.length;

export function pasoPorId(id: string): PasoGuia | undefined {
  return PASOS_GUIA.find((p) => p.id === id);
}

/** Posición de un paso por su id, o -1. */
export function indiceDePaso(id: string): number {
  return PASOS_GUIA.findIndex((p) => p.id === id);
}

/** Lleva un índice a un paso que existe. */
export function acotarIndice(i: number): number {
  if (!Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(ULTIMO_PASO, Math.trunc(i)));
}

/**
 * Por dónde empieza la guía según lo que pida quien la abre: un número (posición), el id de un paso o de un
 * tema, o nada (desde el principio). Un id que no existe vale lo mismo que nada.
 */
export function indiceInicial(inicio?: number | string | null): number {
  if (typeof inicio === "number") return acotarIndice(inicio);
  if (typeof inicio === "string") {
    const i = indiceDePaso(inicio);
    return i >= 0 ? i : 0;
  }
  return 0;
}

export function capituloDeIndice(indice: number): CapituloGuia {
  const paso = PASOS_GUIA[acotarIndice(indice)];
  return CAPITULOS_GUIA.find((c) => c.id === paso.capitulo) ?? CAPITULOS_GUIA[0];
}

/** Posición (0-based) del capítulo en la lista. */
export function numeroDeCapitulo(id: CapituloId): number {
  return CAPITULOS_GUIA.findIndex((c) => c.id === id);
}

/** Índices de los pasos de un capítulo. */
export function pasosDelCapitulo(id: CapituloId): number[] {
  const r: number[] = [];
  PASOS_GUIA.forEach((p, i) => {
    if (p.capitulo === id) r.push(i);
  });
  return r;
}

export function primerPasoDelCapitulo(id: CapituloId): number {
  return pasosDelCapitulo(id)[0] ?? 0;
}

export interface PosicionGuia {
  /** Paso actual, desde 1. */
  paso: number;
  total: number;
  /** Capítulo actual, desde 1. */
  capitulo: number;
  capitulos: number;
  /** Paso dentro de su capítulo, desde 1. */
  enCapitulo: number;
  delCapitulo: number;
}

export function posicionDe(indice: number): PosicionGuia {
  const i = acotarIndice(indice);
  const cap = PASOS_GUIA[i].capitulo;
  const delCap = pasosDelCapitulo(cap);
  return {
    paso: i + 1,
    total: TOTAL_PASOS,
    capitulo: numeroDeCapitulo(cap) + 1,
    capitulos: TOTAL_CAPITULOS,
    enCapitulo: delCap.indexOf(i) + 1,
    delCapitulo: delCap.length,
  };
}

/** «Paso 7 de 24». */
export function etiquetaProgreso(indice: number): string {
  const p = posicionDe(indice);
  return `Paso ${p.paso} de ${p.total}`;
}

/** Cuánto lleva recorrido un capítulo estando en `indice`: 0 (sin empezar) a 1 (terminado). */
export function avanceDeCapitulo(id: CapituloId, indice: number): number {
  const pasos = pasosDelCapitulo(id);
  if (pasos.length === 0) return 0;
  const i = acotarIndice(indice);
  if (i > pasos[pasos.length - 1]) return 1;
  if (i < pasos[0]) return 0;
  return (i - pasos[0] + 1) / pasos.length;
}

/** El texto de un paso para este aparato (cae al común si no hay variante). */
export function textoDelPaso(paso: PasoGuia, entrada?: PerfilTexto): string {
  return (entrada && paso.textoPorPerfil?.[entrada]) || paso.texto;
}

/** La narración de un paso para este aparato (cae a la común, y esta a su texto). */
export function vozDelPaso(paso: PasoGuia, entrada?: PerfilTexto): string {
  return (entrada && paso.vozPorPerfil?.[entrada]) || paso.voz || textoDelPaso(paso, entrada);
}

/** Rutas a las que se llega sin cuenta: «Explorar sin cuenta» lleva a los escritorios (`explorar-sin-cuenta.ts`). */
const RUTAS_SIN_CUENTA: readonly string[] = ["/escritorios"];

/**
 * ¿«Ir» de este paso necesita cuenta? Las rutas, salvo las que se usan sin ella; abrir un borde Trinity,
 * no. Sin cuenta, la guía lo sustituye por «Disponible al entrar» (`architecture/guias-introduccion.md` §5).
 */
export function irNecesitaCuenta(paso: PasoGuia): boolean {
  return Boolean(paso.ruta) && !paso.borde && !RUTAS_SIN_CUENTA.includes(paso.ruta as string);
}
