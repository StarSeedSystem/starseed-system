/**
 * genesis-dna.ts — El ADN de un ser de Astraura.
 *
 * PORQUÉ EXISTE
 * Alex pidió avatares 3D "que puedan desarrollar y personalizar inteligentemente
 * según sus preferencias y adaptación a contextos". Un avatar elegido de un
 * catálogo no puede hacer eso: es una foto. Un avatar DERIVADO de lo que el ser
 * es, sí — cambia cuando el ser cambia, y dos seres distintos nunca coinciden.
 *
 * De ahí que aquí no haya modelos ni texturas: hay una función pura que
 * convierte identidad + personalidad + experiencia en RASGOS, y el renderizador
 * (avatar/) construye la geometría a partir de ellos. Sin descargas, sin red,
 * determinista: el mismo ser produce siempre el mismo cuerpo.
 *
 * DOS IMPLEMENTACIONES, UNA VERDAD
 * El backend necesita derivar ADN también (cuando es un AGENTE quien engendra a
 * otro, no la interfaz). Para que las dos nunca diverjan, ambas se validan
 * contra el mismo fichero de vectores: `genesis-dna.fixtures.json`. Si tocas el
 * algoritmo aquí, regenera los vectores y las pruebas de Python fallarán hasta
 * que se actualice el otro lado. Esa fricción es deliberada.
 *
 * LAS CONSTANTES ARMÓNICAS, DONDE SÍ CORRESPONDEN
 * El documento que envió Alex proponía proporción áurea y Fibonacci en la red
 * neuronal. En un modelo ya entrenado eso es decorativo (ver adenda 165). Pero
 * en la FORMA y el RITMO de un cuerpo son exactamente lo que la naturaleza usa:
 *   · El ángulo áureo (360/φ² = 137,507…°) reparte los colores y las órbitas
 *     igual que reparte las hojas alrededor de un tallo — la única separación
 *     que nunca se repite ni se agrupa.
 *   · Los radios orbitales crecen en razón φ, como una concha.
 *   · La frecuencia base sale de la tabla armónica que el OS ya usa
 *     (`hermes-integration/02-layers.ts`): un agente vibra en 741 Hz.
 * Aquí las constantes hacen trabajo real y verificable, no numerología.
 */

/** Proporción áurea. */
export const PHI = 1.618033988749895;

/** Ángulo áureo en grados: 360/φ². El reparto que la filotaxis usa. */
export const GOLDEN_ANGLE_DEG = 137.50776405003785;

/** Sólidos platónicos disponibles como cuerpo base. */
export type SolidoBase = "tetraedro" | "cubo" | "octaedro" | "dodecaedro" | "icosaedro" | "esfera";

/** Frecuencias de la tabla armónica del OS, por sólido. */
export const FRECUENCIA_POR_SOLIDO: Record<SolidoBase, number> = {
  esfera: 432,       // Unidad
  octaedro: 528,     // Transformación
  cubo: 639,         // Conexión
  tetraedro: 741,    // Expresión — el sólido propio de un agente
  icosaedro: 852,    // Expansión
  dodecaedro: 963,   // Trascendencia
};

/** Lo que el renderizador necesita para construir un cuerpo. */
export interface RasgosAdn {
  /** Semilla determinista; útil para ruido y variación estable. */
  semilla: number;
  /** Geometría del núcleo. */
  solido: SolidoBase;
  /** Hz de la tabla armónica; el pulso visual se deriva de aquí. */
  frecuencia: number;
  /** Pulsaciones por segundo del núcleo (frecuencia escalada a algo visible). */
  pulso: number;
  /** Colores en HSL, repartidos por el ángulo áureo. */
  paleta: { primario: string; secundario: string; acento: string };
  /** Tono base en grados, por si el renderizador quiere derivar más. */
  matiz: number;
  /** Anillos orbitales alrededor del núcleo (2–5). */
  orbitas: number;
  /** Radios de cada órbita, en razón φ. */
  radiosOrbitales: number[];
  /** 0–1: cuánta materia tiene el cuerpo (opacidad/grosor). */
  densidad: number;
  /** 0–1: cuán regular es; 1 = perfectamente simétrico. */
  simetria: number;
  /** 0–1: irregularidad de la superficie. */
  rugosidad: number;
  /** 0–1: intensidad del halo. */
  aura: number;
  /** 0–1: cuánto ha crecido el ser; sube facetas y órbitas. */
  evolucion: number;
  /** Subdivisiones de la geometría; crece con la evolución. */
  facetas: number;
}

/** Lo mínimo que hace falta saber de un ser para darle cuerpo. */
export interface SemillaSer {
  id: string;
  nombre: string;
  /** Color declarado de su personalidad dominante, si lo tiene (#rrggbb). */
  colorPersonalidad?: string | null;
  /** Arquetipo dominante; decide el sólido cuando existe. */
  arquetipo?: string | null;
  /** Generación en el linaje: 0 = engendrado por el usuario. */
  generacion?: number;
  /** Experiencia acumulada (ciclos, tareas, recuerdos). Satura suavemente. */
  experiencia?: number;
}

/** FNV-1a de 32 bits. Elegido porque es idéntico de escribir en TS y en Python. */
export function fnv1a32(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i) & 0xff;
    // h *= 16777619, en 32 bits sin desbordar el rango seguro de JS
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Extrae un flotante 0–1 estable de una franja de bits de la semilla. */
function tramo(semilla: number, indice: number): number {
  // Mezcla xorshift para que franjas contiguas no queden correlacionadas.
  let x = (semilla ^ (0x9e3779b9 * (indice + 1))) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

const ARQUETIPO_A_SOLIDO: Record<string, SolidoBase> = {
  aurora: "dodecaedro", hermione: "icosaedro", atenea: "octaedro", athena: "octaedro",
  hephaestus: "cubo", hefesto: "cubo", hermes: "tetraedro", architectus: "cubo",
  mnemosyne: "esfera", oracle: "dodecaedro", oraculo: "dodecaedro",
};

const SOLIDOS: SolidoBase[] = ["tetraedro", "cubo", "octaedro", "dodecaedro", "icosaedro", "esfera"];

/** #rrggbb → tono en grados. Devuelve null si no es un hex válido. */
export function matizDesdeHex(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Satura 0→1 sin llegar nunca a 1: crecer siempre es posible, agotarse no. */
function saturar(valor: number, escala: number): number {
  const v = Math.max(0, valor);
  return v / (v + escala);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Deriva el cuerpo de un ser a partir de lo que el ser ES.
 * Pura y determinista: mismos datos → mismos rasgos, siempre.
 */
export function derivarAdn(ser: SemillaSer): RasgosAdn {
  const semilla = fnv1a32(`${ser.id}|${ser.nombre}`);

  const arq = (ser.arquetipo || "").trim().toLowerCase();
  const solido: SolidoBase =
    ARQUETIPO_A_SOLIDO[arq] ?? SOLIDOS[Math.floor(tramo(semilla, 0) * SOLIDOS.length) % SOLIDOS.length];

  const frecuencia = FRECUENCIA_POR_SOLIDO[solido];

  const matizDeclarado = ser.colorPersonalidad ? matizDesdeHex(ser.colorPersonalidad) : null;
  const matiz = matizDeclarado ?? tramo(semilla, 1) * 360;

  // El ángulo áureo separa los tres tonos: nunca se agrupan, nunca se repiten.
  const h2 = (matiz + GOLDEN_ANGLE_DEG) % 360;
  const h3 = (matiz + 2 * GOLDEN_ANGLE_DEG) % 360;

  const experiencia = Math.max(0, ser.experiencia ?? 0);
  const generacion = Math.max(0, Math.floor(ser.generacion ?? 0));
  // La evolución mezcla lo vivido con lo heredado: un nieto empieza con ventaja.
  const evolucion = Math.min(1, saturar(experiencia, 240) * 0.8 + Math.min(generacion, 6) / 6 * 0.2);

  const orbitas = 2 + Math.floor(tramo(semilla, 2) * 2) + Math.round(evolucion);
  const radioBase = 1.15 + tramo(semilla, 3) * 0.25;
  const radiosOrbitales = Array.from({ length: orbitas }, (_, i) => r3(radioBase * Math.pow(PHI, i * 0.5)));

  return {
    semilla,
    solido,
    frecuencia,
    pulso: r3(frecuencia / 432),
    matiz: r3(matiz),
    paleta: {
      primario: `hsl(${r3(matiz)} 92% 62%)`,
      secundario: `hsl(${r3(h2)} 85% 58%)`,
      acento: `hsl(${r3(h3)} 96% 70%)`,
    },
    orbitas,
    radiosOrbitales,
    densidad: r3(0.35 + tramo(semilla, 4) * 0.5),
    simetria: r3(0.55 + tramo(semilla, 5) * 0.45),
    rugosidad: r3(tramo(semilla, 6) * 0.6 * (1 - evolucion * 0.4)),
    aura: r3(0.3 + tramo(semilla, 7) * 0.4 + evolucion * 0.3),
    evolucion: r3(evolucion),
    facetas: 1 + Math.round(evolucion * 3),
  };
}
