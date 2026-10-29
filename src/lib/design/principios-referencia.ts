// principio-referencia.ts - 8 principios de usabilidad y 8 reglas de redacción
// Referencias: dont-make-me-think (usabilidad), asd-ste100 (redacción)
// Módulo puro: sin efectos laterales, sin red, sin disco

import { movimientoDe, type RegistroMovimiento, type SeccionMovimiento } from "@/lib/design/registros-movimiento"

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

/* ───────────────── ADN de diseño para la IA creativa (DAN1024H) ───────────────── */

/** La entidad que recibe el contexto: cuenta, página o grupo (DAN1024G); lo
 * que no declare vuelve al patrón común «sobrio» de la Protomolécula. */
export interface EntidadDiseno {
    /** Nombre con el que la entidad se presenta en el texto (opcional). */
    nombre?: string;
    /** Registro de movimiento efectivo: su herencia cuenta › página › grupo se resuelve antes de llamar. */
    registro?: RegistroMovimiento;
    /** Sección del OS donde vive la pieza. */
    seccion?: SeccionMovimiento;
}

const REGISTROS: readonly RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: readonly SeccionMovimiento[] = ["trinity", "astraura", "genesis", "malla", "biblioteca", "protomolecula"];
const REGISTRO_DEFECTO: RegistroMovimiento = "sobrio";
const SECCION_DEFECTO: SeccionMovimiento = "protomolecula";

/** Números y discursos decimales como los escribe el OS: coma, no punto. */
const decimal = (n: number): string => String(n).replace(".", ",");

/**
 * Contexto de diseño del ADN StarSeed para un agente de creación con IA (DAN1024H): el texto
 * breve que dice QUÉ puede inventar y QUÉ es ley de marca. Determinista: la misma entidad
 * devuelve SIEMPRE el mismo texto — sin red, disco, reloj ni rutas de archivo. Los nombres
 * de variables de entorno jamás aparecen (aquí no existen claves). Sale del lenguaje común:
 * los principios del ADN, el movimiento de la entidad (Ola 1024D) y la regla del símbolo.
 * Tope de 900 caracteres: lo que no cabe, no entra (se recorta con una elipsis honesta).
 */
export function contextoDisenoIA(entidad: EntidadDiseno = {}): string {
    const registro = REGISTROS.includes(entidad.registro as RegistroMovimiento)
        ? (entidad.registro as RegistroMovimiento) : REGISTRO_DEFECTO;
    const seccion = SECCIONES.includes(entidad.seccion as SeccionMovimiento)
        ? (entidad.seccion as SeccionMovimiento) : SECCION_DEFECTO;
    const m = movimientoDe(registro, seccion);
    const quien = entidad.nombre ? `la entidad «${entidad.nombre}»` : "la entidad";
    const piezas = [
        `Pieza para ${quien}. ADN StarSeed: composición centrada; los cuatro papeles de la Trinity —Zenith, Horizon, Logic y Anchor— llevan un color por papel; el brillo multicapa se reserva a la pieza protagonista y solo se animan transform y opacity.`,
        `Movimiento (registro «${registro}», sección «${seccion}»): la pieza entra en ${m.entrada.ms} ms y sale en ${m.salida.ms} ms con las curvas del ADN — el mismo gesto en todos los equipos; los hijos en cascada entran a partir de ${m.cascadaMs} ms y la respiración sube la escala hasta ${decimal(m.respiracion.escala)} con un periodo de ${m.respiracion.periodoMs} ms.`,
        "En la interfaz manda el reloj del OS: los números del vídeo no se copian a la interfaz, ni los de la interfaz al vídeo.",
        "Con movimiento reducido el estado final se pinta quieto: la preferencia de accesibilidad manda sobre cualquier adorno que se proponga.",
        "Símbolo oficial: la vesica vertical con los dos discos, el ojo y el rombo de doce facetas no se recolorea ni se deforma; sobre ella solo cabe tocar la escala y la posición, nunca la geometría ni los colores.",
    ];
    const texto = piezas.join(" ");
    return texto.length > 900 ? texto.slice(0, 897) + "…" : texto;
}