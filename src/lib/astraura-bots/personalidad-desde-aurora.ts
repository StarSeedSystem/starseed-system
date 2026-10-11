/**
 * PERSONALIDAD DESDE AURORA — Módulo PURO para modificar rasgos de personalidad
 * basado en parámetros y emociones de Aurora (Adenda XX · Ola XXXX)
 * ─────────────────────────────────────────────────────────────────────────────
 * Función pura que toma una configuración de parámetros y emociones de Aurora
 * y ajusta los rasgos de una personalidad base según reglas específicas.
 * 
 * NO importa módulos de cliente («use client») ni toca localStorage.
 * Totalmente testeable sin efectos secundarios.
 */

/** Forma mínima de la entrada `p` según especificaciones de la tarea. */
interface EntradaPersonalidad {
  params?: Record<string, number | string | undefined>;
  emotions?: Record<string, number>;
  tags?: string[];
}

/** Función de acotado (clamp) local para evitar problemas de importación en entornos de prueba. */
function acotar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Rasgos modificables de una personalidad (escala 0-100). */
export interface Personalidad {
  calidez: number;   // calidez/warmth
  energia: number;   // energia/energy
  formalidad: number; // formalidad/formality
  curiosidad: number; // curiosidad/curiosity
  humor: number;     // humor
  concision: number; // concision/brevedad
}

/**
 * Mapeo de los UserVoiceMood de audio-emotion.ts a SenalesContexto.animo.
 * Cada estado de ánimo de la voz se traduce a un estado emocional para
 * la personalidad de Aurora, usado en el contexto de toma de decisiones.
 */
export const ANIMO_DESDE_VOZ: Record<"alegre" | "sereno" | "tenso" | "triste" | "enérgico" | "neutral", { valencia: number; activacion: number }> = {
  alegre: { valencia: 0.8, activacion: 0.7 },   // positivo, activado
  sereno: { valencia: 0.6, activacion: 0.3 },   // positivo, relajado
  tenso: { valencia: -0.3, activacion: 0.8 },   // negativo, activado
  triste: { valencia: -0.7, activacion: 0.2 },  // negativo, bajo energía
  enérgico: { valencia: 0.5, activacion: 0.9 }, // ligeramente positivo, muy activado
  neutral: { valencia: 0.0, activacion: 0.5 },  // neutral, activación media
};

/**
 * Convierte un valor de parámetro (posiblemente en escala 0-1) a su equivalente en escala 0-100.
 * Si el valor está fuera de rangos esperados, se aplica acotar para mantenerlo en 0-100.
 * @param valor Valor del parámetro (puede ser número o string que represente un número)
 * @returns Número en escala 0-100, acotado al rango válido
 */
function normalizarParametro(valor: unknown): number {
  // Si no es un número finito (no es number, es NaN, o es infinito), retornar 0 (valor neutral)
  if (typeof valor !== "number" || Number.isNaN(valor) || !Number.isFinite(valor)) {
    return 0;
  }

  // Determinar si el valor está en escala 0-1 o 0-100
  let resultado: number;
  if (valor >= 0 && valor <= 1) {
    // Escala 0-1 detectada, convertir a 0-100
    resultado = valor * 100;
  } else {
    // Asumir escala 0-100 (también cubre valores >1 que podrían ser errores)
    resultado = valor;
  }

  // Asegurar que esté en el rango 0-100
  return acotar(resultado, 0, 100);
}

/**
 * Obtiene el valor de un rasgo de personalidad desde los parámetros, aplicando
 * conversión de escala y valores por defecto cuando es necesario.
 * @param params Objeto de parámetros de entrada
 * @param nombreClave Nombre oficial del rasgo en español
 * @param aliasIngles Alias opcional en inglés para el mismo rasgo
 * @param valorPorDefecto Valor a usar si no se proporciona ningún alias
 * @returns Valor del rasgo en escala 0-100
 */
function obtenerValorParametro(
  params: Record<string, number | string | undefined> | undefined,
  nombreClave: string,
  aliasIngles: string | undefined,
  valorPorDefecto: number
): number {
  if (!params) {
    return valorPorDefecto;
  }

  // Verificar si la clave en español existe en el objeto (incluso si es undefined)
  const tieneClaveEsp = nombreClave in params;
  // Verificar si la clave en inglés existe en el objeto (incluso si es undefined)
  const tieneClaveIng = aliasIngles !== undefined && aliasIngles in params;

  // Si ninguna clave existe, caer al valor por defecto
  if (!tieneClaveEsp && !tieneClaveIng) {
    return valorPorDefecto;
  }

  // Obtener el valor, prefiriendo el español si ambas existen
  let valor: unknown;
  if (tieneClaveEsp) {
    valor = params[nombreClave];
  } else if (tieneClaveIng) {
    valor = params[aliasIngles];
  } else {
    // Este caso debería estar cubierto por la verificación anterior, pero por seguridad
    return valorPorDefecto;
  }

  // Normalizar el valor (maneja valores inválidos retornando 0)
  return normalizarParametro(valor);
}

/**
 * Ajusta los rasgos de una personalidad base según los parámetros y emociones de Aurora.
 * 
 * @param p Configuración de entrada con params y emotions (forma mínima declarada)
 * @param base Personalidad de partida cuyos rasgos se usarán como base para rasgos no especificados
 * @return Nueva personalidad con rasgos ajustados según las reglas de conversión
 * 
 * Lee claves numéricas conocidas de `params` (calidez/warmth, energia/energy,
 * formalidad/formality, curiosidad/curiosity, humor, concision/brevity; acepta
 * 0–1 y 0–100) y de `emotions` (alegria/joy sube energía y humor, calma/calm
 * baja energía) con pesos fijos, acota con `acotar` y cae a `base` en lo que
 * falte; nunca lanza.
 */
export function rasgosDesdePersonalidad(
  p: EntradaPersonalidad,
  base: Personalidad
): Personalidad {
  // Extraer params y emotions con valores por defecto seguros
  const params = p.params ?? {};
  const emotions = p.emotions ?? {};

  // Obtener valores de params con conversión de escala y fallback a base
  const calidez = obtenerValorParametro(params, "calidez", "warmth", base.calidez);
  const energia = obtenerValorParametro(params, "energia", "energy", base.energia);
  const formalidad = obtenerValorParametro(params, "formalidad", "formality", base.formalidad);
  const curiosidad = obtenerValorParametro(params, "curiosidad", "curiosity", base.curiosidad);
  const humor = obtenerValorParametro(params, "humor", undefined, base.humor);
  const concision = obtenerValorParametro(params, "concision", "brevity", base.concision);

  // Aplicar modificaciones desde emotions con pesos fijos
  // alegria/joy sube energía y humor
  const alegria = emotions.alegria ?? 0;
  const alegriaFactor = acotar(alegria, 0, 1); // Normalizar a 0-1 para usar como factor
  const energiaConAlegria = acotar(energia + (alegriaFactor * 20), 0, 100); // +20 puntos máximos
  const humorConAlegria = acotar(humor + (alegriaFactor * 20), 0, 100);   // +20 puntos máximos

  // calma/calm baja energía
  const calma = emotions.calma ?? 0;
  const calmaFactor = acotar(calma, 0, 1); // Normalizar a 0-1 para usar como factor
  const energiaFinal = acotar(energiaConAlegria - (calmaFactor * 15), 0, 100); // -15 puntos máximos

  // Construir y retornar la nueva personalidad con todos los rasgos
  return {
    calidez: acotar(calidez, 0, 100),      // Ya debería estar acotado, pero por seguridad
    energia: acotar(energiaFinal, 0, 100), // Aplicar acotar final
    formalidad: acotar(formalidad, 0, 100),
    curiosidad: acotar(curiosidad, 0, 100),
    humor: acotar(humorConAlegria, 0, 100),
    concision: acotar(concision, 0, 100),
  };
}