// Malla cristalina SiO₂ amorfa: cristalización (algoritmo puro)
// Funciones puras, sin node:* ni Supabase

import type { 
  NeuronaReticula, 
  SenalMedida, 
  Tesela, 
  Reticula, 
  Medio, 
  EstadoVitreo,
  Puente,
  Cristal
} from "./tipos";
import { senalesDeReticula } from "./teselas";
import { delaunay } from "./triangulacion";
import { costeSenal, CAPACIDAD_KBPS } from "./coste";
import { huellaReticula } from "./teselas";
import { coordinacionDe } from "./tipos";

export const RANGOS_MEDIO: Record<Medio, number> = {
  lora: 15000, // 15 km en metros
  ble: 50,     // 50 m
  'wifi-lan': 300, // 300 m
  'wifi-mesh': 300, // asumimos mismo que wifi-lan
  webrtc: 300, // asumimos mismo que wifi-lan para LAN
  reticulum: 10000, // 10 km? arbitrario
  serie: 10,   // 10 m
  nfc: 0.2,    // 0.2 m
  servidor: 0,   // no se usa para Delaunay (alambrico o de corto alcance muy limitado)
};

// Función para calcular la distancia entre dos puntos
function distancia(p1: {x: number; y: number}, p2: {x: number; y: number}): number {
  return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
}

// Función para obtener la posición estimada de una neurona (si la tiene)
function posicionEstimada(neurona: NeuronaReticula): {x: number; y: number} | null {
  if (neurona.posicion) {
    return { x: neurona.posicion.x, y: neurona.posicion.y };
  }
  return null;
}

// Función para obtener el medio de mayor capacidad compartido por dos neuronas que esté dentro de rango
function mejorMedioCompartido(n1: NeuronaReticula, n2: NeuronaReticula, dist: number): Medio | null {
  // Intersección de medios
  const mediosComunes = n1.medios.filter(m => n2.medios.includes(m));
  // Filtrar por alcance
  const mediosAlcance = mediosComunes.filter(m => dist <= RANGOS_MEDIO[m]);
  if (mediosAlcance.length === 0) return null;
  // Elegir el de mayor capacidad
  return mediosAlcance.reduce((a, b) => 
    CAPACIDAD_KBPS[a] > CAPACIDAD_KBPS[b] ? a : b
  );
}

// Función para calcular la temperatura media de la retícula
function temperaturaMedia(temperaturas: Record<string, number>): number {
  const vals = Object.values(temperaturas);
  if (vals.length === 0) return 0.5;
  const sum = vals.reduce((a, b) => a + b, 0);
  return sum / vals.length;
}

export function temperaturaDe(
  historial: Array<{clave: string; t: number; calidad: number}>,
  ventanaMs = 120000,
  ahora: number
): Record<string, number> {
  // Agrupar historial por clave (neurona)
  const grupos: Record<string, number[]> = {};
  for (const h of historial) {
    if (h.t >= ahora - ventanaMs && h.t <= ahora) {
      if (!grupos[h.clave]) grupos[h.clave] = [];
      grupos[h.clave].push(h.calidad);
    }
  }
  // Para cada neurona, calcular std y luego temperatura
  const resultado: Record<string, number> = {};
  for (const [clave, calidades] of Object.entries(grupos)) {
    if (calidades.length === 0) {
      // Este caso no debería ocurrir porque solo entramos si hay al menos una señal
      resultado[clave] = 0.5;
      continue;
    }
    // Calcular media
    const media = calidades.reduce((a, b) => a + b, 0) / calidades.length;
    // Calcular varianza
    const varianza = calidades.reduce((acc, c) => acc + (c - media)**2, 0) / calidades.length;
    const std = Math.sqrt(varianza);
    // Mapear std a [0,1] de modo que std=0 -> 0, std=0.5 -> 1
    let temp = std * 2;
    if (temp > 1) temp = 1;
    if (temp < 0) temp = 0;
    resultado[clave] = temp;
  }
  // Las neuronas que no aparecen en el historial pero están en la retícula? 
  // Esta función solo recibe historial, así que no sabemos sobre otras neuronas.
  // Devolvemos solo las que tienen historial en la ventana.
  return resultado;
}

export function estadoDe(temperaturaMedia: number): EstadoVitreo {
  if (temperaturaMedia >= 0.6) return 'fundido';
  if (temperaturaMedia >= 0.25) return 'subenfriado';
  return 'vitreo';
}

export function cristalizar(
  r: Reticula,
  opc: {
    confianza?: Record<string, number>;
    temperatura?: Record<string, number>;
  } = {}
): Cristal {
  // Paso 0: Obtener todas las neuronas de la retícula
  const neuronas: NeuronaReticula[] = [];
  const visto = new Set<string>();
  for (const tesela of Object.values(r.teselas)) {
    if (!visto.has(tesela.neurona.id)) {
      visto.add(tesela.neurona.id);
      neuronas.push(tesela.neurona);
    }
  }

  // Paso 1: Obtener temperatura por neurona (de opc.temperatura o por defecto 0.5)
  const temperatura: Record<string, number> = {};
  for (const n of neuronas) {
    temperatura[n.id] = opc.temperatura?.[n.id] ?? 0.5;
  }

  // Paso 2: Calcular estado de la retícula a partir de la temperatura media
  const tempMedia = Object.values(temperatura).reduce((a, b) => a + b, 0) / Math.max(1, neuronas.length);
  const estado = estadoDe(tempMedia);

  // Paso 3: Generar aristas candidatas a partir de señales medidas
  const senales = senalesDeReticula(r);
  const aristasCandidatas: Puente[] = [];
  for (const s of senales) {
    const confA = opc.confianza?.[s.de] ?? 1;
    const confB = opc.confianza?.[s.a] ?? 1;
    const confianza = Math.min(confA, confB);
    const coste = costeSenal(s, confianza);
    aristasCandidatas.push({
      a: s.de,
      b: s.a,
      medio: s.medio,
      coste
    });
  }

  // Paso 4: Generar aristas candidatas a partir de triangulación de Delaunay
  // (sobre posiciones estimadas sin señal medida)
  // 4.1: Crear conjunto de pares de neuronas que ya tienen señal medida (en cualquier dirección)
  const paresConSenal = new Set<string>();
  for (const s of senales) {
    const id1 = s.de;
    const id2 = s.a;
    const clave = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
    paresConSenal.add(clave);
  }

  // 4.2: Obtener posiciones estimadas de las neuronas
  const puntos: { id: string; x: number; y: number }[] = [];
  for (const n of neuronas) {
    const pos = posicionEstimada(n);
    if (pos) {
      puntos.push({ id: n.id, x: pos.x, y: pos.y });
    }
  }

  // 4.3: Calcular triangulación de Delaunay
  const aristasDelaunay = delaunay(puntos); // devuelve Array<[string, string]>

  // 4.4: Para cada arista en la triangulación, si no tiene señal medida y los extremos comparten un medio con alcance, crear candidata
  for (const [id1, id2] of aristasDelaunay) {
    // Ordenar para tener consistencia
    const aId = id1 < id2 ? id1 : id2;
    const bId = id1 < id2 ? id2 : id1;
    const clavePar = `${aId}|${bId}`;
    // Si ya tiene señal medida, skip
    if (paresConSenal.has(clavePar)) continue;

    // Buscar las neuronas completas
    const neurona1 = neuronas.find(n => n.id === aId);
    const neurona2 = neuronas.find(n => n.id === bId);
    if (!neurona1 || !neurona2) continue; // debería pasar

    // Calcular distancia
    const dist = distancia({ x: neurona1.posicion?.x ?? 0, y: neurona1.posicion?.y ?? 0 }, 
                           { x: neurona2.posicion?.x ?? 0, y: neurona2.posicion?.y ?? 0 });
    // Nota: si la neurona no tiene posición, ya no estaría en puntos, así que aquí ambas tienen posición

    // Encontrar medios comunes que estén dentro de alcance
    const mediosComunes = neurona1.medios.filter(m => neurona2.medios.includes(m));
    const mediosAlcance = mediosComunes.filter(m => dist <= RANGOS_MEDIO[m]);
    if (mediosAlcance.length === 0) continue;

    // Elegir el medio de mayor capacidad
    const medioElegido = mediosAlcance.reduce((a, b) => 
      CAPACIDAD_KBPS[a] > CAPACIDAD_KBPS[b] ? a : b
    );

    // Crear arista candidata con costo fijo 0.8
    aristasCandidatas.push({
      a: aId,
      b: bId,
      medio: medioElegido,
      coste: 0.8
    });
  }

  // Paso 5: Aplicar algoritmo de Kruskal para garantizar conexión (bosque de expansión mínima)
  // 5.1: Ordenar las aristas candidatas por costo, luego por a, b, medio
  const aristasOrdenadas = [...aristasCandidatas].sort((a, b) => {
    if (a.coste !== b.coste) return a.coste - b.coste;
    if (a.a !== b.a) return a.a.localeCompare(b.a);
    if (a.b !== b.b) return a.b.localeCompare(b.b);
    return a.medio.localeCompare(b.medio);
  });

  // 5.2: Estructura de union-find (disjoint set)
  const padre: Record<string, string> = {};
  const rango: Record<string, number> = {};
  function hacerSet(id: string) {
    padre[id] = id;
    rango[id] = 0;
  }
  function encontrar(id: string): string {
    if (padre[id] !== id) {
      padre[id] = encontrar(padre[id]); // compresión de camino
    }
    return padre[id];
  }
  function unir(id1: string, id2: string): void {
    const raiz1 = encontrar(id1);
    const raiz2 = encontrar(id2);
    if (raiz1 === raiz2) return;
    // Unión por rango
    if (rango[raiz1] < rango[raiz2]) {
      padre[raiz1] = raiz2;
    } else if (rango[raiz1] > rango[raiz2]) {
      padre[raiz2] = raiz1;
    } else {
      padre[raiz2] = raiz1;
      rango[raiz1]++;
    }
  }

  // Inicializar cada neurona como un conjunto
  for (const n of neuronas) {
    hacerSet(n.id);
  }

  // 5.3: Aplicar Kruskal
  const puentesKruskal: Puente[] = [];
  for (const edge of aristasOrdenadas) {
    const raizA = encontrar(edge.a);
    const raizB = encontrar(edge.b);
    if (raizA !== raizB) {
      unir(edge.a, edge.b);
      puentesKruskal.push(edge);
    }
  }

  // Paso 6: Intentar añadir aristas que cierren un triángulo
  // 6.1: Construir lista de adyacencia a partir de los puentes de Kruskal
  const adyacencia: Record<string, Set<string>> = {};
  for (const n of neuronas) {
    adyacencia[n.id] = new Set();
  }
  for (const p of puentesKruskal) {
    adyacencia[p.a].add(p.b);
    adyacencia[p.b].add(p.a);
  }

  // 6.2: Marcar qué aristas fueron usadas en Kruskal para excluirlas de la consideración de triángulo
  const usadasEnKruskal = new Set<string>();
  for (const p of puentesKruskal) {
    // Usamos una clave que identifique la arista sin importar el orden de a y b
    const claveIdA = p.a < p.b ? p.a : p.b;
    const claveIdB = p.a < p.b ? p.b : p.a;
    const clave = `${claveIdA}|${claveIdB}|${p.medio}`;
    usadasEnKruskal.add(clave);
  }

  // 6.3: Lista de aristas para considerar en el paso de triángulo (las que no fueron usadas en Kruskal)
  const aristasParaTriangulo = aristasOrdenadas.filter(edge => {
    const claveIdA = edge.a < edge.b ? edge.a : edge.b;
    const claveIdB = edge.a < edge.b ? edge.b : edge.a;
    const clave = `${claveIdA}|${claveIdB}|${edge.medio}`;
    return !usadasEnKruskal.has(clave);
  });

  // 6.4: Aristas adicionales que vamos a aceptar (que cierran triángulo y no exceden la coordinación)
  const puentesAdicionales: Puente[] = [];

  // 6.5: Para cada arista en orden, verificar si cierra un triángulo y si ambos extremos tienen grado menor que su objetivo
  for (const edge of aristasParaTriangulo) {
    const a = edge.a;
    const b = edge.b;
    // Verificar si forma un triángulo: existe c tal que (a,c) y (b,c) están en adyacencia
    let esTriangulo = false;
    // Iteramos sobre los vecinos de a
    for (const c of adyacencia[a]) {
      if (adyacencia[b].has(c)) {
        esTriangulo = true;
        break;
      }
    }
    if (!esTriangulo) continue;

    // Obtener las neuronas
    const neuronaA = neuronas.find(n => n.id === a);
    const neuronaB = neuronas.find(n => n.id === b);
    if (!neuronaA || !neuronaB) continue;

    // Calcular objetivo de coordinación (base, sin defecto por simplicidad)
    const objA = coordinacionDe(neuronaA);
    const objB = coordinacionDe(neuronaB);

    // Grado actual en el conjunto de puentes elegido (Kruskal + los adicionales que ya hemos añadido en este bucle)
    const gradoA = adyacencia[a].size;
    const gradoB = adyacencia[b].size;

    if (gradoA < objA && gradoB < objB) {
      // Aceptar esta arista
      puentesAdicionales.push(edge);
      // Actualizar adyacencia
      adyacencia[a].add(b);
      adyacencia[b].add(a);
    }
  }

  // 6.6: Combinar los puentes de Kruskal y los adicionales
  const puentesFinales = [...puentesKruskal, ...puentesAdicionales];

  // 6.7: Calcular el registro de coordinación (objetivo base para cada neurona)
  const coordinacion: Record<string, number> = {};
  for (const n of neuronas) {
    coordinacion[n.id] = coordinacionDe(n);
  }

  // Devolver el cristal
  return {
    puentes: puentesFinales,
    estado,
    temperatura,
    huella: huellaReticula(r),
    coordinacion
  };
}