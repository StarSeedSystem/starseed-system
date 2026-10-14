// Malla cristalina SiO₂ amorfa: cristalización (retícula de enlaces)
// Funciones puras, sin node:* ni Supabase

import type {
  Medio,
  NeuronaReticula,
  SenalMedida,
  Tesela,
  Reticula,
  EstadoVitreo,
  Puente,
  Cristal,
  Punto,
} from './tipos';
import { senalesDeReticula } from './teselas';
import { posicionesEstimadas } from './geometria';
import { delaunay } from './triangulacion';
import { costeSenal } from './coste';
import { coordinacionDe, COORDINACION_BASE } from './tipos';
import { huellaReticula } from './teselas';

export const COSTE_PUENTE_SIN_SENAL = 0.8;

/**
 * Calcula la temperatura de cada neurona en la retícula basada en la calidad de sus señales
 * en una ventana de tiempo.
 * @param historial - Array de señales medidas con su timestamp y calidad
 * @param ventanaMs - Tamaño de la ventana en milisegundos (por defecto 120000 = 2 minutos)
 * @param ahora - Timestamp actual en milisegundos
 * @returns Un objeto que mapea el id de cada neurona a su temperatura (0-1)
 */
export function temperaturaDe(
  historial: Array<{ clave: string; t: number; calidad: number }>,
  ventanaMs = 120000,
  ahora: number
): Record<string, number> {
  const ventanaInicio = ahora - ventanaMs;
  const filtrado = historial.filter(entry => entry.t >= ventanaInicio && entry.t <= ahora);
  
  // Agrupar por clave (neurona id)
  const grupos: Record<string, number[]> = {};
  for (const entry of filtrado) {
    if (!grupos[entry.clave]) {
      grupos[entry.clave] = [];
    }
    grupos[entry.clave].push(entry.calidad);
  }
  
  const resultado: Record<string, number> = {};
  // Para cada neurona que apareció en el historial
  for (const clave in grupos) {
    const valores = grupos[clave];
    if (valores.length === 0) {
      resultado[clave] = 0.5;
      continue;
    }
    // Calcular media
    const media = valores.reduce((sum, v) => sum + v, 0) / valores.length;
    // Calcular varianza
    const varianza = valores.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / valores.length;
    const desviacionTipica = Math.sqrt(varianza);
    // Normalizar: 0.25 -> 1, 0 -> 0, luego clamp a [0,1]
    let normalizado = desviacionTipica * 4; // porque 1/0.25 = 4
    if (normalizado > 1) normalizado = 1;
    if (normalizado < 0) normalizado = 0;
    resultado[clave] = normalizado;
  }
  
  // Las neuronas que no aparecen en el historial no se incluyen en el resultado?
  // El contrato dice: "sin historial → 0.5". Pero solo para las neuronas que estamos considerando?
  // La función debe devolver un Record<string, number> para cada neurona que tenga historial?
  // Sin embargo, el contrato no especifica qué neuronas considerar. Probablemente, solo las que aparecen en el historial.
  // Pero para ser seguros, devolvemos solo las que tienen historial. Las que no tienen historial no están en el resultado.
  // Sin embargo, el contrato dice: "sin historial → 0.5". Esto podría significar que si una neurona no tiene historial en la ventana, su temperatura es 0.5.
  // Pero entonces, ¿qué neuronas consideramos? Probablemente todas las neuronas en la retícula? 
  // La función temperaturaDe solo recibe un historial, no una retícula. Por lo tanto, solo podemos devolver temperaturas para las neuronas que aparecen en el historial.
  // El llamador (cristalizar) pasará el historial de señales medidas? O pasará otro historial?
  // Vamos a leer el contrato: en la cristalización, se usa `temperaturaDe` con el historial de señales medidas? 
  // El contrato no especifica de dónde sale el historial. Pero en la cristalización, se menciona: `temperatura?: Record<string, number>` en las opciones.
  // Entonces, el historial probablemente proviene de las señales medidas de la retícula, pero convertidas a un formato de historial?
  // Vamos a dejar la función como está: solo devuelve temperaturas para las neuronas que tienen al menos una señal en el historial.
  // Si el llamador quiere que todas las neuronas tengan una temperatura, debe proporcionar un historial que incluya todas las neuronas (con posiblemente 0 señales?).
  // Pero el contrato dice: "sin historial → 0.5". Interpretamos que si una neurona no tiene entradas en el historial, su temperatura es 0.5.
  // Sin embargo, en nuestro código, si una neurona no tiene entradas, no está en el objeto `grupos`, y por lo tanto no está en el resultado.
  // Cambiemos: inicializamos el resultado para todas las neuronas que aparecen en el historial (con al menos una entrada) y para las que no tienen ninguna entrada, ponemos 0.5.
  // Pero no sabemos qué neuronas existen en total. La función solo tiene el historial.
  // Por lo tanto, no podemos saber qué neuronas faltan. 
  // Decidimos: el historial debe contener una entrada por cada neurona que queremos considerar. Si una neurona no tiene ninguna señal en el historial, entonces no aparece en el historial y no podemos saber que existe.
  // Por lo tanto, la función asume que el historial contiene todas las neuronas de interés, y si una neurona no tiene entradas, entonces no está en el historial y no se considera.
  // Pero el contrato dice "sin historial → 0.5", lo que sugiere que incluso si no hay historial, deberíamos devolver 0.5 para esa neurona.
  // Para resolver esto, cambiemos la interpretación: el historial es un array de señales medidas, y cada señal medida pertenece a una neurona (la que la midió? o la que la recibió?).
  // En el tipo de historial, la clave es la neurona id? El contrato no lo especifica, pero en el uso probablemente sea el id de la neurona.
  // Vamos a asumir que el historial contiene una entrada por cada señal medida, y la clave es la neurona que la midió (o la que la recibió?).
  // Pero la temperatura es por neurona, y se basa en la calidad de sus señales. Entonces, necesitamos agrupar por la neurona que está midiendo o por la que está siendo midida?
  // El contrato dice: "desviación típica de la calidad de sus señales". "Sus señales" significa las señales que involucran a esa neurona.
  // Por lo tanto, deberíamos agrupar por la neurona que es el sujeto de la señal. En una señal medida, tenemos `de` y `a`. Ambas neuronas están involucradas.
  // Sin embargo, el historial no tiene `de` y `a`, tiene `clave`. 
  // Vamos a volver al tipo de historial: `{clave: string; t: number; calidad: number}`. 
  // El contrato no especifica qué es la clave. Pero en el contexto de la cristalización, probablemente la clave sea el id de la neurona para la cual estamos calculando la temperatura.
  // Y cada entrada en el historial representa una señal medida que involucra a esa neurona? 
  // Dado que no tenemos más información, seguiremos con nuestra interpretación inicial: agrupar por clave.
  // Y para las neuronas que no aparecen en el historial, no devolvemos nada. 
  // Sin embargo, para cumplir con el contrato, vamos a asumir que el historial incluye una entrada para cada neurona que queremos considerar, y si una neurona no tiene señales, entonces su clave aparecerá con un array vacío de calificaciones.
  // Pero nuestro código actualmente ignora las claves que no aparecen en el historial (porque no están en grupos). 
  // Cambiemos: primero, recogemos todas las claves que aparecen en el historial (aunque sea con una entrada que tenga t fuera de la ventana? no, ya filtramos).
  // Luego, para cada clave que apareció en el historial completo (antes de filtrar) pero no tiene entradas en la ventana, devolvemos 0.5.
  // Pero no tenemos el historial completo, solo el filtrado.
  // Vamos a cambiar el enfoque: vamos a agrupar por clave en el historial completo (sin filtrar por tiempo) para saber qué neuronas existen, y luego filtrar por tiempo para las calificaciones.
  // Pero el historial podría ser muy grande. Asumimos que no lo es.
  // Vamos a hacer:
  //   1. Obtener el conjunto de todas las claves en el historial (sin filtrar por tiempo).
  //   2. Para cada clave, filtrar sus entradas por ventana y calcular la desviación típica.
  //   3. Si no hay entradas en la ventana, usar 0.5.
  //
  // Vamos a reimplementar.
  const todasLasClaves = new Set<string>();
  for (const entry of historial) {
    todasLasClaves.add(entry.clave);
  }
  
  const gruposVentana: Record<string, number[]> = {};
  for (const entry of filtrado) {
    if (!gruposVentana[entry.clave]) {
      gruposVentana[entry.clave] = [];
    }
    gruposVentana[entry.clave].push(entry.calidad);
  }
  
  const resultado: Record<string, number> = {};
  for (const clave of todasLasClaves) {
    const valores = gruposVentana[clave] || [];
    if (valores.length === 0) {
      resultado[clave] = 0.5;
      continue;
    }
    const media = valores.reduce((sum, v) => sum + v, 0) / valores.length;
    const varianza = valores.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / valores.length;
    const desviacionTipica = Math.sqrt(varianza);
    let normalizado = desviacionTipica * 4;
    if (normalizado > 1) normalizado = 1;
    if (normalizado < 0) normalizado = 0;
    resultado[clave] = normalizado;
  }
  
  return resultado;
}

/**
 * Determina el estado vítreo de una neurona basado en su temperatura media.
 * @param temperaturaMedia - Valor entre 0 y 1
 * @returns 'fundido' si >= 0.6, 'subenfriado' si >= 0.25, sino 'vitreo'
 */
export function estadoDe(temperaturaMedia: number): EstadoVitreo {
  if (temperaturaMedia >= 0.6) {
    return 'fundido';
  }
  if (temperaturaMedia >= 0.25) {
    return 'subenfriado';
  }
  return 'vitreo';
}

/**
 * Crea un cristal (retícula de enlaces) a partir de una retícula de teselas.
 * @param r - La retícula de teselas
 * @param opc - Opciones opcionales: confianza y temperatura por neurona
 * @returns Un cristal con puentes, estado, temperatura, huella y coordinación
 */
export function cristalizar(
  r: Reticula,
  opc: { confianza?: Record<string, number>; temperatura?: Record<string, number> } = {}
): Cristal {
  // TODO: implement
  return {
    puentes: [],
    estado: 'vitreo',
    temperatura: {},
    huella: '',
    coordinacion: {},
  };
}