// principio-referencia.ts - 8 principios de usabilidad y 8 reglas de redacción
// Referencias: dont-make-me-think (usabilidad), asd-ste100 (redacción)
// Módulo puro: sin efectos laterales, sin red, sin disco
import type { RegistroMovimiento } from "@/lib/design/registros-movimiento";

export type PrincipioUsabilidad = {
  id: string
  titulo: string
  descripcion: string
}

export type ReglaRedaccion = {
  id: string
  titulo: string
  descripcion: string
}

export const PRINCIPIOS_USABILIDAD: readonly PrincipioUsabilidad[] = [
  {
    id: "usabilidad-1",
    titulo: "Lo obvio no se piensa",
    descripcion: "Los elementos comunes de una interfaz deben ser reconocibles sin instrucción previa; el usuario no debe preguntarse qué hace un botón o enlace."
  },
  {
    id: "usabilidad-2",
    titulo: "Convenencias consistentes",
    descripcion: "Mantener patrones familiares (posicionamiento, colores, comportamiento) para que el usuario transfiera conocimiento de una parte a otra del sistema."
  },
  {
    id: "usabilidad-3",
    titulo: "Páginas que se escanean",
    descripcion: "Jerarquía visual clara, subtítulos significativos y tópicos que permitan al usuario comprender la estructura a primera vista."
  },
  {
    id: "usabilidad-4",
    titulo: "Menos palabras",
    descripcion: "Reducir el texto al mínimo necesario; cada palabra debe aportar valor informativo o de acción."
  },
  {
    id: "usabilidad-5",
    titulo: "Navegación que dice dónde estás",
    descripcion: "Indicadores de ubicación actual (breadcrumbs, resaltado de sección activa) para que el usuario sepa su posición en la estructura."
  },
  {
    id: "usabilidad-6",
    titulo: "Clicks sin duda",
    descripcion: "Los enlaces y botones deben tener comportamiento predecible; evitar confirmaciones ambiguas o acciones que puedan interpretarse erróneamente."
  },
  {
    id: "usabilidad-7",
    titulo: "Errores fáciles de corregir",
    descripcion: "Los mensajes de error deben indicar claramente qué pasó, por qué y cómo solucionarlo, usando lenguaje no técnico."
  },
  {
    id: "usabilidad-8",
    titulo: "Ayuda accesible y oportuna",
    descripcion: "Soporte contextual (tooltips, documentación inline) disponible cuando el usuario lo necesita, sin saturar la interfaz."
  }
] as const

export const REGLAS_REDACCION: readonly ReglaRedaccion[] = [
  {
    id: "redaccion-1",
    titulo: "Frases cortas",
    descripcion: "Una idea por oración; evitar oraciones largas que combinen múltiples conceptos."
  },
  {
    id: "redaccion-2",
    titulo: "Voz activa",
    descripcion: "Usar sujeto + verbo + objeto directo; la voz pasiva debe reservarse para casos técnicos específicos."
  },
  {
    id: "redaccion-3",
    titulo: "Una instrucción por frase",
    descripcion: "Cada frase debe contener una sola acción o indicación; combinar instrucciones confunde al lector."
  },
  {
    id: "redaccion-4",
    titulo: "Palabras simples y constantes",
    descripcion: "Preferir vocabulario cotidiano; si se introduce un término técnico, usarlo de forma consistente en todo el producto."
  },
  {
    id: "redaccion-5",
    titulo: "Evitar jargon no esencial",
    descripcion: "Eliminar palabras o expresiones que no sean conocidas por el público general del producto."
  },
  {
    id: "redaccion-6",
    titulo: "Forma affirmative antes que negativa",
    descripcion: "Indicar qué hacer en lugar de qué no hacer; positivo es más claro y motivador."
  },
  {
    id: "redaccion-7",
    titulo: "Términos familiares",
    descripcion: "Usar palabras que el usuario ya conoce en su contexto; evitar tecnicismos a menos que sean necesarios."
  },
  {
    id: "redaccion-8",
    titulo: "Revisar antes de publicar",
    descripcion: "Leer el texto final en contexto; recortar todo lo superfluo y asegurar claridad."
  }
] as const

/* ───────────── Contexto de diseño para la creación con IA (DAN1024H) ───────────── */

/** La entidad de la que se pide el contexto de diseño (cuenta, página, grupo, pieza…). */
export interface EntidadDiseno {
  /** Nombre visible de la entidad, si lo hay; el contexto la nombra si llega. */
  nombre?: string;
  /** Registro de movimiento de la entidad (DAN1024G): sobrio, expresivo o experimental. Ausente o desconocido → «sobrio». */
  registroMovimiento?: unknown;
}

/** Valida un registro de movimiento: cualquier valor que no sea uno de los tres vuelve a «sobrio». */
function registroDe(entidad: EntidadDiseno | null | undefined): RegistroMovimiento {
  return entidad?.registroMovimiento === "sobrio" ||
    entidad?.registroMovimiento === "expresivo" ||
    entidad?.registroMovimiento === "experimental"
    ? entidad.registroMovimiento
    : "sobrio";
}

/** El texto del contexto de diseño que se da a un agente de creación: ADN, movimiento y símbolo. */
export function contextoDisenoIA(entidad: EntidadDiseno | null | undefined): string {
  const nombre = typeof entidad?.nombre === "string" ? entidad.nombre.trim().slice(0, 60) : "";
  const cabecera = nombre ? `Contexto de diseño StarSeed (ADN) para «${nombre}».` : "Contexto de diseño StarSeed (ADN).";
  const cuerpo = [
    "· Composición centrada: el centro queda libre y los controles llegan desde los bordes.",
    "· Trinity, un color por papel y nunca mezclados: cénit #007FFF (guía), horizonte #10B981 (creación), lógica #FFBF00 (control), ancla #DC143C (escaso).",
    "· El brillo multicapa va solo en la pieza protagonista; jamás en el texto del cuerpo.",
    "· Solo se animan transform y opacity: nada de anchos, altos ni márgenes.",
    "· Interfaz: entre 140 y 350 ms con las curvas del ADN; los números de vídeo no se copian a la interfaz.",
    `· Registro de movimiento: «${registroDe(entidad)}» (hereda de cuenta, página y grupo).`,
    "· Con prefers-reduced-motion el estado final se pinta quieto, sin moverse.",
    "· El símbolo oficial se siembra como vesica vertical y no se recolorea ni se deforma.",
  ].join("\n");
  return `${cabecera}\n${cuerpo}`.slice(0, 900);
}

export function revisarTexto(texto: string): {
  largoPromedioPalabras?: number
  posiblesPasivas?: number
  usoJerga?: string[]
} {
  // Análisis puro: cuenta palabras por frase, busca indicadores de voz pasiva,
  // y detecta posibles palabras de jerga del estándar asd-ste100
  const indicadoresPasiva = /(fue|fueron|fue por|fueron por|se(?:\s+ha|hubo|fue)|se\s+(?:ha|hubo|había))/gi
  const frases = texto.split(/[.!?]+/).filter((f: string) => f.trim().length > 0)
  const totalPalabras = frases.reduce(
    (sum, f) => sum + f.trim().split(/\s+/).length,
    0
  )
  const largoPromedio = totalPalabras / frases.length
  const pasivas = (texto.match(indicadoresPasiva) || []).length
  // Palabras potenciales de jerga del STE100 (controlado)
  const jergaCandidata = [
    "por favor", "considerar", "solicitar", "proceder", "proporcionar"
  ].filter((palabra) => texto.toLowerCase().includes(palabra.toLowerCase()))
  return {
    largoPromedioPalabras: Math.round(largoPromedio),
    posiblesPasivas: pasivas,
    usoJerga: jergaCandidata
  }
}