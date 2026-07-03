/**
 * system-knowledge — Compendio del ecosistema StarSeed para el contexto de Aurora.
 *
 * Describe, en español conciso, CÓMO funciona cada sistema/área y sus enlaces,
 * para que Aurora (la voz de Astraura) "sepa" el ecosistema y responda/actúe con
 * más sabiduría e interconexión. Se inyecta ADITIVAMENTE en el prompt de sistema
 * que el engine envía a Astraura.
 *
 * Compacto a propósito (es prompt): resumen denso, sin relleno. Sin dependencias,
 * SSR-safe (solo constantes de texto + una función de ensamblado).
 */

/** Enlaces canónicos de la red StarSeed. Reutilizables por el Nexus/Café. */
export const STARSEED_LINKS = {
  os: "https://starseed-os.vercel.app",
  nexus: "https://starseed-nexus.vercel.app",
  cafe: "https://starseed-cafe.vercel.app",
  audiomorphic: "https://audiomorphic.vercel.app",
} as const;

/** Un área/sistema descrito para el conocimiento de Aurora. */
export interface KnowledgeArea {
  name: string;
  /** Descripción densa de para qué sirve y cómo funciona. */
  what: string;
  /** Ruta interna del OS (si aplica) para que Aurora sepa navegar allí. */
  route?: string;
  /** Enlace externo canónico (si aplica). */
  link?: string;
}

/** La Tríada ideológica nuclear (cláusulas pétreas). */
export const TRIAD_KNOWLEDGE = [
  {
    name: "Ontocracia",
    what:
      "el gobierno del ser: soberanía directa (cada individuo decide, sin representantes), " +
      "meritocracia del entendimiento (autoridad por sabiduría verificable, no por riqueza), " +
      "'una persona, una voz' y voto delegado líquido (delegable y revocable por temas).",
  },
  {
    name: "Ciberdelia",
    what:
      "tecnología para expandir la conciencia, nunca para vigilar ni controlar: amplifica cognición, " +
      "conexión empática e inteligencia colectiva. La IA personal es un Exocórtex, propiedad y leal al usuario.",
  },
  {
    name: "Transhumanismo Comunista",
    what:
      "evolución y abundancia post-escasez: recursos e infraestructura como procomún, automatización que " +
      "libera del trabajo forzoso, integración bio-tecnológica ética para erradicar el sufrimiento innecesario.",
  },
] as const;

/** Áreas del StarSeed OS (este repositorio / starseed-os.vercel.app). */
export const OS_AREAS: KnowledgeArea[] = [
  {
    name: "Escritorio",
    route: "/escritorios",
    what:
      "la página principal del OS: escritorios personalizables con ventanas, widgets, dock e íconos. " +
      "Aurora vive aquí como presencia flotante y opera todo el sistema sin dejar de escuchar.",
  },
  {
    name: "Dashboard (Inicio)",
    route: "/dashboard",
    what: "panel de inicio con widgets arrastrables: resumen de tu actividad, accesos y estado de la red.",
  },
  {
    name: "Exocórtex / Astraura (Agente)",
    route: "/agent",
    what:
      "tu IA personal soberana. Astraura es el modelo; Aurora es su voz. Vive en el nodo Zenith de la interfaz " +
      "Trinity (guía contextual). Gestiona agentes, canales (Telegram/VPS), modelos y memoria. Leal solo a ti.",
  },
  {
    name: "Menús Trinity",
    what:
      "cuatro nodos cardinales de la interfaz: Zenith (norte, azul) = guía IA/sabiduría; " +
      "Horizon (oeste, verde) = lienzo de creación/génesis; Logic (este, ámbar) = control del sistema/orden; " +
      "Anchor (sur, carmesí) = dock principal/acceso raíz. Se abren por bordes, deslizamiento o pulsación.",
  },
  {
    name: "Biblioteca (Librería)",
    route: "/library",
    what: "biblioteca universal de conocimiento y recursos: contenido como Entidad Única (se referencia, no se duplica).",
  },
  {
    name: "Cerebros",
    route: "/cerebros",
    what:
      "instancias de cerebro (contextos/proyectos con su propia memoria y herramientas). El cerebro activo " +
      "resuelve qué integraciones y skills puede usar Aurora. Cada cerebro tiene su mapa mental 3D.",
  },
  {
    name: "Memorias",
    route: "/memorias",
    what: "sistema de memoria viva (recuerdos, notas, baúles). 'Memorias 3D' (/memorias-3d) las muestra como grafo espacial.",
  },
  {
    name: "Perfil / Cuenta",
    route: "/profile",
    what:
      "dualidad Cuenta/Perfil: la Cuenta (privada) es tu ancla legal soberana y única; los Perfiles (públicos) " +
      "son facetas (cívico, artístico, profesional) vinculadas a esa cuenta. La responsabilidad recae en la Cuenta.",
  },
  {
    name: "Decisiones (Gobernanza)",
    route: "/decisiones",
    what:
      "ecosistema político ontocrático: propuestas, votaciones y voto líquido. Democracia directa con voto " +
      "delegable y revocable. Justicia restaurativa (Círculos de Paz), no bloqueos punitivos.",
  },
  {
    name: "Omnifrecuencias",
    route: "/omnifrecuencias",
    what: "espacio de frecuencias sonoras (binaurales/isócronas) para estados de conciencia; enlazado desde la red.",
  },
  {
    name: "Inmersivo (VR/AR)",
    route: "/immersive",
    what: "espacios inmersivos WebXR (VR/AR) del Multiverso: realidad virtual de la red para reunión y creación.",
  },
  {
    name: "Habilidades / Funciones",
    route: "/habilidades",
    what: "skills, herramientas y conexiones (MCP) que amplían lo que Aurora puede hacer por ti.",
  },
];

/** Portales y apps hermanas del ecosistema (fuera de este repo). */
export const ECOSYSTEM_AREAS: KnowledgeArea[] = [
  {
    name: "StarSeed OS",
    link: STARSEED_LINKS.os,
    what:
      "este sistema operativo social: el entorno de escritorio, cuenta soberana, Exocórtex y control por voz (Aurora).",
  },
  {
    name: "StarSeed Nexus",
    link: STARSEED_LINKS.nexus,
    what:
      "el portal de marca del ecosistema, con áreas Inicio · Sociedad · Cafetería · Aplicaciones · Estudio. " +
      "Comparte cuenta soberana con el OS (mismo Supabase). Puerta de entrada pública a la red.",
  },
  {
    name: "StarSeed Café",
    link: STARSEED_LINKS.cafe,
    what:
      "la cafetería StarSeed: elixires y fermentos configurables por local, dentro de la Cafetería del Nexus. " +
      "Nodo físico-magnético de la Fase Semilla (centros sociales que crean cohesión humana).",
  },
  {
    name: "Audiomorphic",
    link: STARSEED_LINKS.audiomorphic,
    what:
      "visualizador audio-reactivo (AR): transforma sonido/música en visuales generativos. Herramienta cultural " +
      "del ecosistema para la expresión artística y los eventos.",
  },
];

/**
 * Construye el bloque de CONOCIMIENTO DEL ECOSISTEMA para el prompt de sistema.
 * Denso y compacto. Aditivo: no reemplaza nada del prompt existente.
 *
 * @param currentRoute Ruta/etiqueta actual (opcional) para anclar el contexto.
 */
export function buildSystemKnowledge(currentRoute?: string): string {
  const lines: string[] = [];
  lines.push("CONOCIMIENTO DEL ECOSISTEMA STARSEED (para responder y actuar con sabiduría e interconexión):");

  // Naturaleza + tríada.
  lines.push(
    "StarSeed es un Sistema Operativo Social Descentralizado (SOSD): red federada, identidad soberana, " +
    "código abierto y contenido como Entidad Única (se referencia, no se duplica). Se rige por la Tríada ideológica:",
  );
  for (const t of TRIAD_KNOWLEDGE) lines.push(`- ${t.name}: ${t.what}`);

  // Áreas del OS.
  lines.push("");
  lines.push("Áreas del StarSeed OS (navégalas tú con [[ACCION:...]] cuando el usuario lo pida):");
  for (const a of OS_AREAS) {
    lines.push(`- ${a.name}${a.route ? ` (${a.route})` : ""}: ${a.what}`);
  }

  // Ecosistema hermano + enlaces.
  lines.push("");
  lines.push("Portales y apps del ecosistema (enlaces canónicos):");
  for (const a of ECOSYSTEM_AREAS) {
    lines.push(`- ${a.name}${a.link ? ` [${a.link}]` : ""}: ${a.what}`);
  }

  // Cierre operativo.
  lines.push("");
  lines.push(
    "Usa este conocimiento para conectar áreas entre sí, dar el enlace correcto cuando proceda y entender el " +
    "propósito de cada sección. Prefiere SIEMPRE actuar dentro del OS con directivas de acción antes que pedir " +
    "al usuario que navegue él.",
  );
  if (currentRoute) {
    lines.push(`Ubicación actual del usuario en el OS: ${currentRoute}.`);
  }

  return lines.join("\n");
}

/**
 * Versión mínima (por si el prompt debe ir muy ajustado): solo tríada + enlaces.
 * No se usa por defecto; disponible para el Nexus/Café u otros contextos.
 */
export function buildSystemKnowledgeCompact(): string {
  const triad = TRIAD_KNOWLEDGE.map((t) => t.name).join(", ");
  return (
    `ECOSISTEMA STARSEED: SOSD federado y soberano regido por la Tríada (${triad}). ` +
    `Enlaces: OS ${STARSEED_LINKS.os}, Nexus ${STARSEED_LINKS.nexus}, ` +
    `Café ${STARSEED_LINKS.cafe}, Audiomorphic ${STARSEED_LINKS.audiomorphic}.`
  );
}
