// principio-referencia.ts - 8 principios de usabilidad y 8 reglas de redacción
// Referencias: dont-make-me-think (usabilidad), asd-ste100 (redacción)
// Módulo puro: sin efectos laterales, sin red, sin disco

import {
  movimientoDe,
  type MovimientoRegistro,
  type RegistroMovimiento,
  type SeccionMovimiento,
} from "@/lib/design/registros-movimiento"

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

/* ─────────────── Contexto de diseño para la creación con IA ─────────────── */

/** Entidad mínima para el contexto de diseño: cuenta, página, grupo o pieza en creación. */
export interface EntidadDisenoIA {
  tipo?: string
  id?: string
  nombre?: string
  /** Registro de movimiento de DAN1024G: sobrio, expresivo o experimental. */
  registroMovimiento?: string
  /** Alias habitual del registro en el tema de la entidad. */
  movimiento?: string
  /** Alias corto del registro. */
  registro?: string
  /** Sección del OS que adopta el movimiento (trinity, astraura…). */
  seccion?: string
}

const REGISTROS: readonly RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"]
const SECCIONES: readonly SeccionMovimiento[] = ["trinity", "astraura", "genesis", "malla", "biblioteca", "protomolecula"]

function registroDe(entidad: EntidadDisenoIA): RegistroMovimiento {
  const valor = entidad.registroMovimiento ?? entidad.movimiento ?? entidad.registro
  return REGISTROS.find((r) => r === valor) ?? "sobrio"
}

function seccionDe(entidad: EntidadDisenoIA): SeccionMovimiento {
  return SECCIONES.find((s) => s === entidad.seccion) ?? "trinity"
}

/** Solo letras, números y espacios: fuera rutas, claves, signos e identificadores. */
function nombreLegible(valor: unknown): string {
  return typeof valor === "string"
    ? valor.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
    : ""
}

/**
 * Contexto de diseño que recibe cualquier IA que cree o edite en el OS.
 * Módulo PURO y determinista: mismo par entidad/registro, mismo texto. Cita el
 * ADN de la marca, el registro de movimiento de DAN1024G y la regla del
 * símbolo oficial; nunca incluye claves, rutas ni identificadores internos.
 */
export function contextoDisenoIA(entidad: EntidadDisenoIA | null = {}): string {
  const e = entidad ?? {}
  // El nombre no se imprime: puede traer rutas o claves; el tipo basta para situar la pieza.
  const quien = nombreLegible(e.tipo) || "entidad"
  const registro = registroDe(e)
  const m: MovimientoRegistro = movimientoDe(registro, seccionDe(e))
  return [
    "Contexto de diseño StarSeed (ADN, movimiento y símbolo).",
    `Entidad: ${quien}.`,
    "ADN: composición centrada; en la Trinity, un color por papel; un solo brillo multicapa y solo en la pieza protagonista; se animan únicamente transform y opacity; la interfaz usa 140–350 ms con las curvas del ADN, nunca tiempos de vídeo.",
    `Movimiento (registro de la entidad, DAN1024G): «${registro}»; entrada ${m.entrada.ms} ms, salida ${m.salida.ms} ms, cascada ${m.cascadaMs} ms; respiración ${m.respiracion.escala} a ${m.respiracion.periodoMs} ms. Con prefers-reduced-motion, el estado final se pinta quieto, sin transform.`,
    "Símbolo oficial: vesica vertical de dos círculos; no se recolorea ni se deforma; se pinta desde su geometría, nunca se redibuja a ojo.",
  ].join(" ")
}