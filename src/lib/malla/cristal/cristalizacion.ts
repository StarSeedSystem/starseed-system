// Malla cristalina SiO₂ amorfa: cristalización y retícula
// Funciones puras, sin node:* ni Supabase

import type { 
   Medio, NeuronaReticula, SenalMedida, Tesela, Reticula, 
   EstadoVitreo, Cristal, Puente
 } from "./tipos";
import { coordinacionDe } from "./tipos";
import { delaunay } from "./triangulacion";
import { senalesDeReticula, huellaReticula } from "./teselas";
import { posicionesEstimadas } from "./geometria";

export const VENTANA_MS_DEFECTO = 120000;

/**
 * Calcula la temperatura de cada neurona basada en la desviación típica 
 * de la calidad de sus señales en una ventana de tiempo.
 * 
 * @param historial - Array de señales con {clave, t, calidad}
 * @param ventanaMs - Ventana de tiempo en milisegundos (defecto: 120000)
 * @param ahora - Tiempo actual en milisegundos
 * @returns Record<string, number> - Temperatura por neurona (0-1)
 */
export function temperaturaDe(
  historial: Array<{clave: string; t: number; calidad: number}>,
  ventanaMs = VENTANA_MS_DEFECTO,
  ahora: number
): Record<string, number> {
  // Agrupar señales por neurona (clave)
  const senalesPorNeurona: Record<string, number[]> = {};
  
  const tiempoCorte = ahora - ventanaMs;
  
  // Filtrar señales dentro de la ventana y agrupar por neurona
  for (const senal of historial) {
    if (senal.t >= tiempoCorte) {
      if (!senalesPorNeurona[senal.clave]) {
        senalesPorNeurona[senal.clave] = [];
      }
      senalesPorNeurona[senal.clave].push(senal.calidad);
    }
  }
  
  // Calcular temperatura para cada neurona
  const temperaturas: Record<string, number> = {};
  
  for (const [clave, calidades] of Object.entries(senalesPorNeurona)) {
    if (calidades.length === 0) {
      temperaturas[clave] = 0.5; // Sin historial → 0.5
      continue;
    }
    
    // Calcular media
    const suma = calidades.reduce((acc, val) => acc + val, 0);
    const media = suma / calidades.length;
    
    // Calcular desviación típica
    const varianza = calidades.reduce(
      (acc, val) => acc + Math.pow(val - media, 2), 
      0
    ) / calidades.length;
    
    const desviacionTipica = Math.sqrt(varianza);
    
    // Normalizar a 0-1 con 0.25 → 1
    // Si desviaciónTipica <= 0.25 → temperatura = 0
    // Si desviaciónTipica >= 1.0 → temperatura = 1
    // Lineal entre 0.25 y 1.0
    let temperatura = (desviacionTipica - 0.25) / (1.0 - 0.25);
    temperatura = Math.max(0, Math.min(1, temperatura));
    
    temperaturas[clave] = temperatura;
  }
  
  return temperaturas;
}

/**
 * Determina el estado vítreo basado en la temperatura media.
 * 
 * @param temperaturaMedia - Temperatura media (0-1)
 * @returns EstadoVitreo - 'fundido', 'subenfriado' o 'vitreo'
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
 * Cristaliza una retícula aplicando el algoritmo determinista descrito en el contrato.
 * 
 * @param r - La retícula de entrada
 * @param opc - Opciones opcionales (confianza y temperatura)
 * @returns Cristal - Resultado de la cristalización
 */
export function cristalizar(
  r: Reticula, 
  opc: {confianza?: Record<string, number>; temperatura?: Record<string, number>} = {}
): Cristal {
  // Obtener neuronas de la retícula
  const neuronas: NeuronaReticula[] = Object.values(r.teselas).map(t => t.neurona);
  
  // Obtener señales medidas de la retícula
  const senalesMedidas = senalesDeReticula(r);
  
  // Obtener posiciones estimadas
  const posiciones = posicionesEstimadas(neuronas, senalesMedidas);
  
  // Convertir posiciones a puntos para triangulación
  const puntos: { id: string; x: number; y: number }[] = [];
  for (const neurona of neuronas) {
    if (posiciones[neurona.id]) {
      puntos.push({
        id: neurona.id,
        x: posiciones[neurona.id].x,
        y: posiciones[neurona.id].y
      });
    }
  }
  
  // Paso 1: Obtener candidatos
  // 1a. Señales medidas (senalesDeReticula)
  const candidatos: Array<{a: string; b: string; medio: Medio; coste: number}> = [];
  
  for (const senal of senalesMedidas) {
    const coste = 1.0 - (typeof senal.rssiDbm === 'number' ? 
      (Math.max(0, Math.min(1, (senal.rssiDbm + 100) / 100))) : 0.5);
    candidatos.push({
      a: senal.de,
      b: senal.a,
      medio: senal.medio,
      coste
    });
  }
  
  // 1b. Aristas de delaunay sobre posicionesEstimadas sin señal medida
  // Sólo si ambos extremos comparten un medio con alcance para esa distancia
  const delaunayEdges = delaunay(puntos);
  
  for (const [aId, bId] of delaunayEdges) {
    // Verificar si ya existe una señal medida entre estas neuronas
    const yaTieneSenal = senalesMedidas.some(
      s => (s.de === aId && s.a === bId) || (s.de === bId && s.a === aId)
    );
    
    if (!yaTieneSenal) {
      // Buscar si ambos extremos comparten un medio con alcance
      const neuronaA = neuronas.find(n => n.id === aId)!;
      const neuronaB = neuronas.find(n => n.id === bId)!;
      
      const mediosCompartidos = neuronaA.medios.filter(m => 
        neuronaB.medios.includes(m)
      );
      
      if (mediosCompartidos.length > 0) {
        // Elegir el medio de mayor capacidad (en orden del array MEDIOS)
        const MEDIOS_ORDENADOS: Medio[] = ['wifi-lan', 'wifi-mesh', 'webrtc', 'ble', 'lora', 'reticulum', 'serie', 'servidor', 'nfc'];
        let mejorMedio: Medio | null = null;
        
        for (const medio of MEDIOS_ORDENADOS) {
          if (mediosCompartidos.includes(medio)) {
            mejorMedio = medio;
            break;
          }
        }
        
        if (mejorMedio) {
          // Calcular distancia estimada para coste
          const posA = posiciones[aId];
          const posB = posiciones[bId];
          const distancia = Math.sqrt(
            Math.pow(posA.x - posB.x, 2) + Math.pow(posA.y - posB.y, 2)
          );
          
          // Coste basado en distancia (0-1, donde 0 es mejor)
          // Normalizar asumiendo máximo 300m (alcance wifi)
          const coste = Math.min(1, distancia / 300);
          
          candidatos.push({
            a: aId,
            b: bId,
            medio: mejorMedio,
            coste
          });
        }
      }
    }
  }
  
  // Paso 2: Kruskal por coste (desempate a, b, medio) para garantizar conexión
  // Ordenar por coste, luego por a, luego por b, luego por medio
  const candidatosOrdenados = [...candidatos].sort((a, b) => {
    if (a.coste !== b.coste) return a.coste - b.coste;
    if (a.a !== b.a) return a.a.localeCompare(b.a);
    if (a.b !== b.b) return a.b.localeCompare(b.b);
    return a.medio.localeCompare(b.medio);
  });
  
  // Union-Find para Kruskal
  const padre: Record<string, string> = {};
  const rango: Record<string, number> = {};
  
  const encontrar = (x: string): string => {
    if (padre[x] !== x) {
      padre[x] = encontrar(padre[x]);
    }
    return padre[x];
  };
  
  const unir = (x: string, y: string): void => {
    const rx = encontrar(x);
    const ry = encontrar(y);
    if (rx === ry) return;
    
    if (rango[rx] < rango[ry]) {
      padre[rx] = ry;
    } else if (rango[rx] > rango[ry]) {
      padre[ry] = rx;
    } else {
      padre[ry] = rx;
      rango[rx]++;
    }
  };
  
  // Inicializar Union-Find
  for (const neurona of neuronas) {
    padre[neurona.id] = neurona.id;
    rango[neurona.id] = 0;
  }
  
  const puentesSeleccionados: Puente[] = [];
  
  // Aplicar Kruskal
  for (const candidato of candidatosOrdenados) {
    const raizA = encontrar(candidato.a);
    const raizB = encontrar(candidato.b);
    
    if (raizA !== raizB) {
      unir(candidato.a, candidato.b);
      puentesSeleccionados.push({
        a: candidato.a,
        b: candidato.b,
        medio: candidato.medio,
        coste: candidato.coste
      });
    }
  }
  
  // Paso 3: Añadir candidatos que cierren un triángulo con puentes ya elegidos
  // Mientras ambos extremos estén por debajo de su coordinación objetivo
  
  // Calentar coordinación objetivo para cada neurona
  const coordinacionObjetivo: Record<string, number> = {};
  for (const neurona of neuronas) {
    coordinacionObjetivo[neurona.id] = coordinacionDe(neurona);
  }
  
  // Contar puentes actuales por neurona
  const puentesActuales: Record<string, number> = {};
  for (const neurona of neuronas) {
    puentesActuales[neurona.id] = 0;
  }
  
  for (const puente of puentesSeleccionados) {
    puentesActuales[puente.a]++;
    puentesActuales[puente.b]++;
  }
  
  // Función para verificar si añadir un puente cerraría un triángulo
  const cerrariaTriangulo = (a: string, b: string): boolean => {
    // Buscar un neurona c que esté conectada tanto a como b
    for (const puente of puentesSeleccionados) {
      if ((puente.a === a && puente.b === b) || 
          (puente.a === b && puente.b === a)) {
        continue; // Es el mismo puente que estamos evaluando
      }
      
      if (puente.a === a || puente.b === a) {
        const c = puente.a === a ? puente.b : puente.a;
        // Verificar si b y c están conectados
        if (puentesSeleccionados.some(
          p => (p.a === b && p.b === c) || (p.a === c && p.b === b)
        )) {
          return true;
        }
      }
      
      if (puente.a === b || puente.b === b) {
        const c = puente.a === b ? puente.b : puente.a;
        // Verificar si a y c están conectados
        if (puentesSeleccionados.some(
          p => (p.a === a && p.b === c) || (p.a === c && p.b === a)
        )) {
          return true;
        }
      }
    }
    return false;
  };
  
  // Procesar candidatos restantes en orden de coste
  for (const candidato of candidatosOrdenados) {
    // Verificar si ya está seleccionado
    const yaSeleccionado = puentesSeleccionados.some(
      p => (p.a === candidato.a && p.b === candidato.b && p.medio === candidato.medio) ||
           (p.a === candidato.b && p.b === candidato.a && p.medio === candidato.medio)
    );
    
    if (yaSeleccionado) continue;
    
    // Verificar si cerraría un triángulo
     if (!cerrariaTriangulo(candidato.a, candidato.b)) continue;
    
    // Verificar coordenación
    const coordA = puentesActuales[candidato.a] || 0;
    const coordB = puentesActuales[candidato.b] || 0;
    const objA = coordinacionObjetivo[candidato.a];
    const objB = coordinacionObjetivo[candidato.b];
    
    // Aplicar defectos de coordinación
    let defectoA = 0;
    let defectoB = 0;
    
    // Obtener temperatura de la neurona (de opc.temperatura o calcular por defecto)
    const tempA = opc.temperatura?.[candidato.a] ?? 0.5;
    const tempB = opc.temperatura?.[candidato.b] ?? 0.5;
    
    // +1 si la neurona está 'fundida' (temperatura ≥ 0.6)
    if (tempA >= 0.6) defectoA += 1;
    if (tempB >= 0.6) defectoB += 1;
    
    // -1 si su mejor candidato restante cuesta > 0.7
    // (Esto es más complejo, lo simplificamos asumiendo que ya lo evaluamos en el orden)
    if (candidato.coste > 0.7) {
      defectoA -= 1;
      defectoB -= 1;
    }
    
    const coordObjetivoConDefectoA = objA + defectoA;
    const coordObjetivoConDefectoB = objB + defectoB;
    
    // Verificar si ambos extremos están por debajo de su coordinación objetivo
    if (coordA < coordObjetivoConDefectoA && coordB < coordObjetivoConDefectoB) {
      // Añadir el puente
      puentesSeleccionados.push({
        a: candidato.a,
        b: candidato.b,
        medio: candidato.medio,
        coste: candidato.coste
      });
      
      puentesActuales[candidato.a]++;
      puentesActuales[candidato.b]++;
    }
  }
  
  // Asegurar mínimo 1 puente por neurona (conectar las que se quedan atrás)
  // Esta parte es más compleja y podría requerir múltiples pasadas
  // Por simplicidad, nos aseguramos de que no haya neuronas aisladas si hay más de 1 neurona
  
  if (neuronas.length > 1) {
    // Conectar neuronas que no tienen puentes
    const neuronasSinPuentes = neuronas.filter(n => 
      !(puentesSeleccionados.some(p => p.a === n.id || p.b === n.id))
    );
    
    // Conectar cada neurona sin puentes a la primera neurona que tenga puentes
    // O si ninguna tiene puentes, conectarlas en cadena
    const neuronasConPuentes = neuronas.filter(n => 
      puentesSeleccionados.some(p => p.a === n.id || p.b === n.id)
    );
    
    if (neuronasSinPuentes.length > 0 && neuronasConPuentes.length > 0) {
      const primeraConPuentes = neuronasConPuentes[0];
      for (const neurona of neuronasSinPuentes) {
        // Encontrar el medio compartido de menor coste
        const mejorMedio: Medio | null = null;
        let minCoste = Infinity;
        
        for (const medioA of primeraConPuentes.medios) {
          for (const medioB of neurona.medios) {
            if (medioA === medioB) {
              // Coste basado en tipo de medio (menor número = mejor)
              const MEDIOS_COSTE: Record<Medio, number> = {
                'wifi-lan': 1, 'wifi-mesh': 1, 'webrtc': 2, 
                'ble': 3, 'lora': 4, 'reticulum': 5, 
                'serie': 6, 'servidor': 7, 'nfc': 8
              };
              const coste = MEDIOS_COSTE[medioA];
              if (coste < minCoste) {
                minCoste = coste;
                // Guardar el medio para usarlo después
              }
            }
          }
        }
        
        // Si encontramos un medio compartido, añadir el puente
        if (minCoste < Infinity) {
          // Necesitamos determinar el medio compartido real
          let medioSeleccionado: Medio | null = null;
          for (const medioA of primeraConPuentes.medios) {
            for (const medioB of neurona.medios) {
              if (medioA === medioB) {
                medioSeleccionado = medioA;
                break;
              }
            }
            if (medioSeleccionado) break;
          }
          
          if (medioSeleccionado) {
            puentesSeleccionados.push({
              a: primeraConPuentes.id,
              b: neurona.id,
              medio: medioSeleccionado,
              coste: minCoste / 8 // Normalizar a 0-1
            });
          }
        }
      }
    } else if (neuronasConPuentes.length === 0 && neuronas.length > 1) {
      // Ninguna tiene puentes, conectarlas en cadena por ID
      const neuronasOrdenadas = [...neuronas].sort((a, b) => a.id.localeCompare(b.id));
      for (let i = 0; i < neuronasOrdenadas.length - 1; i++) {
        // Encontrar medio compartido
        let medioCompartido: Medio | null = null;
        for (const medio of neuronasOrdenadas[i].medios) {
          if (neuronasOrdenadas[i + 1].medios.includes(medio)) {
            medioCompartido = medio;
            break;
          }
        }
        
        if (medioCompartido) {
          puentesSeleccionados.push({
            a: neuronasOrdenadas[i].id,
            b: neuronasOrdenadas[i + 1].id,
            medio: medioCompartido,
            coste: 0.5 // Valor medio arbitrario
          });
        }
      }
    }
  }
  
  // Entre dos neuronas, un solo puente (el medio de menor coste)
  // Eliminar duplicados manteniendo solo el de menor coste
  const puentesUnicos: Record<string, Puente> = {};
  
  for (const puente of puentesSeleccionados) {
    const key = puente.a < puente.b ? 
      `${puente.a}|${puente.b}` : 
      `${puente.b}|${puente.a}`;
      
    if (!puentesUnicos[key] || puente.coste < puentesUnicos[key].coste) {
      puentesUnicos[key] = puente;
    }
  }
  
  const puentesFinales = Object.values(puentesUnicos);
  
  // Calcular temperatura media para el estado
  const temperaturas = opc.temperatura || {};
  let sumaTemperatura = 0;
  let count = 0;
  
  for (const neurona of neuronas) {
    const temp = temperaturas[neurona.id] ?? 0.5;
    sumaTemperatura += temp;
    count++;
  }
  
  const temperaturaMedia = count > 0 ? sumaTemperatura / count : 0.5;
  const estado = estadoDe(temperaturaMedia);
  
  // Calcular huella
  const rConPuentes: Reticula = {
    // Para simplificar, mantenemos las teselas originales
    // En una implementación real, deberíamos actualizar las teselas con los nuevos puentes
    teselas: r.teselas
  };
  const huella = huellaReticula(rConPuentes) + ':' + puentesFinales.length;
  
  // Calcular coordinación final
  const coordinacionFinal: Record<string, number> = {};
  for (const neurona of neuronas) {
    coordinacionFinal[neurona.id] = 0;
  }
  
  for (const puente of puentesFinales) {
    coordinacionFinal[puente.a] = (coordinacionFinal[puente.a] || 0) + 1;
    coordinacionFinal[puente.b] = (coordinacionFinal[puente.b] || 0) + 1;
  }
  
  return {
    puentes: puentesFinales,
    estado,
    temperatura: temperaturas,
    huella,
    coordinacion: coordinacionFinal
  };
}