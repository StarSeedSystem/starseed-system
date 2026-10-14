// Malla cristalina SiO₂ amorfa: cristalización pura, sin node:* ni Supabase

import { tipo } from "arktype";
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
  COORDINACION_BASE,
  coordinacionDe,
  claveSenal,
  distanciaPorSenal,
  posicionesEstimadas,
  delaunay,
} from "./tipos";
import { huellaReticula, senalesDeReticula } from "./teselas";

// --- Funciones puras ---

export function temperaturaDe(
  historial: Array<{ clave: string; t: number; calidad: number }>,
  ventanaMs = 120000,
  ahora: number
): Record<string, number> {
  // Agrupar historial por clave (neurona)
  const historialPorNeurona: Record<string, Array<{ t: number; calidad: number }>> = {};
  
  for (const entrada of historial) {
    if (!historialPorNeurona[entrada.clave]) {
      historialPorNeurona[entrada.clave] = [];
    }
    historialPorNeurona[entrada.clave].push({ t: entrada.t, calidad: entrada.calidad });
  }
  
  // Filtrar por ventana de tiempo y calcular desviación típica normalizada
  const temperaturas: Record<string, number> = {};
  
  for (const [clave, senales] of Object.entries(historialPorNeurona)) {
    // Filtrar señales dentro de la ventana
    const senalesVentana = senales.filter(
      (s) => s.t >= ahora - ventanaMs && s.t <= ahora
    );
    
    if (senalesVentana.length === 0) {
      temperaturas[clave] = 0.5; // Sin historial → 0.5
      continue;
    }
    
    // Calcular media de calidad
    const suma = senalesVentana.reduce((acc, s) => acc + s.calidad, 0);
    const media = suma / senalesVentana.length;
    
    // Calcular varianza
    const sumaCuadradosDiferencias = senalesVentana.reduce(
      (acc, s) => acc + Math.pow(s.calidad - media, 2),
      0
    );
    const varianza = sumaCuadradosDiferencias / senalesVentana.length;
    const desviacionTipica = Math.sqrt(varianza);
    
    // Normalizar a 0-1 con 0.25 → 1
    // Esto significa que 0.25 se mapea a 0 y 1 se mapea a 1
    // Fórmula: (x - 0.25) / (1 - 0.25) = (x - 0.25) / 0.75
    let normalizada = (desviacionTipica - 0.25) / 0.75;
    
    // Asegurar que esté en el rango [0, 1]
    normalizada = Math.max(0, Math.min(1, normalizada));
    
    temperaturas[clave] = normalizada;
  }
  
  return temperaturas;
}

export function estadoDe(temperaturaMedia: number): EstadoVitreo {
  if (temperaturaMedia >= 0.6) {
    return 'fundido';
  }
  if (temperaturaMedia >= 0.25) {
    return 'subenfriado';
  }
  return 'vitreo';
}

export function cristalizar(
  r: Reticula,
  opc: { confianza?: Record<string, number>; temperatura?: Record<string, number> } = {}
): Cristal {
  const { confianza = {}, temperatura = {} } = opc;
  
  // 1. Obtener neuronas de la retícula
  const neuronas: NeuronaReticula[] = Object.values(r.teselas).map(t => t.neurona);
  
  // 2. Obtener señales medidas
  const senales = senalesDeReticula(r);
  
  // 3. Calcular posiciones estimadas
  const posiciones = posicionesEstimadas(neuronas, senales);
  
  // 4. Convertir posiciones a puntos para Delaunay
  const puntos: Punto[] = [];
  for (const neurona of neuronas) {
    const pos = posiciones[neurona.id];
    if (pos) {
      puntos.push({ id: neurona.id, x: pos.x, y: pos.y });
    }
  }
  
  // 5. Obtener aristas de Delaunay
  const aristasDelaunay = delaunay(puntos);
  
  // 6. Generar candidatos: señales medidas + aristas de Delaunay sin señal medida
  const candidatos: Array<{
    a: string;
    b: string;
    medio: Medio;
    coste: number;
  }> = [];
  
  // Añadir señales medidas como candidatos
  for (const senal of senales) {
    const clave = claveSenal(senal);
    const distancia = distanciaPorSenal(senal);
    
    if (distancia !== null) {
      // Coste basado en distancia (normalizado)
      // Asumimos que 300m es el máximo razonable para wifi/ble, 15000m para lora
      let maxDistancia = 300;
      if (senal.medio === 'lora') {
        maxDistancia = 15000;
      } else if (senal.medio === 'ble') {
        maxDistancia = 50;
      }
      
      // Normalizar distancia a [0,1] donde 0 es mejor (más cercano) y 1 es peor (más lejano)
      const costeDistancia = Math.min(1, distancia / maxDistancia);
      
      candidatos.push({
        a: senal.de,
        b: senal.a,
        medio: senal.medio,
        coste: costeDistancia
      });
    }
  }
  
  // Añadir aristas de Delaunay que no tengan señal medida
  const senalesConMedida = new Set(
    senales.map(s => claveSenal(s))
  );
  
  for (const [aId, bId] of aristasDelaunay) {
    // Verificar si ya existe una señal medida entre estas neuronas
    const claveAB = `${aId}|${bId}`;
    const claveBA = `${bId}|${aId}`;
    
    if (senalesConMedida.has(claveAB) || senalesConMedida.has(claveBA)) {
      continue; // Ya tiene señal medida, pasar al siguiente
    }
    
    // Encontrar las neuronas para verificar si comparten un medio con alcance
    const neuronaA = neuronas.find(n => n.id === aId);
    const neuronaB = neuronas.find(n => n.id === bId);
    
    if (!neuronaA || !neuronaB) {
      continue;
    }
    
    // Encontrar medios compartidos
    const mediosCompartidos = neuronaA.medios.filter(m => 
      neuronaB.medios.includes(m)
    );
    
    if (mediosCompartidos.length === 0) {
      continue; // No comparten ningún medio
    }
    
    // Para cada medio compartido, verificar si está dentro del alcance
    let mejorMedio: Medio | null = null;
    let mejorCoste = 1; // Iniciar con el peor posible
    
    for (const medio of mediosCompartidos) {
      // Calcular distancia estimada entre las neuronas usando sus posiciones
      const posA = posiciones[neuronaA.id];
      const posB = posiciones[neuronaB.id];
      
      if (!posA || !posB) {
        continue;
      }
      
      const distancia = Math.sqrt(
        Math.pow(posA.x - posB.x, 2) + 
        Math.pow(posA.y - posB.y, 2)
      );
      
      // Verificar si el medio puede alcanzar esa distancia
      let alcanceMaximo = 0;
      switch (medio) {
        case 'lora':
          alcanceMaximo = 15000; // 15 km
          break;
        case 'wifi-lan':
        case 'wifi-mesh':
          alcanceMaximo = 300; // 300 m
          break;
        case 'ble':
          alcanceMaximo = 50; // 50 m
          break;
        case 'webrtc':
          alcanceMaximo = 100; // 100 m (WebRTC típico)
          break;
        case 'reticulum':
          alcanceMaximo = 1000; // 1 km
          break;
        case 'serie':
          alcanceMaximo = 10; // 10 m
          break;
        case 'servidor':
          alcanceMaximo = Infinity; // Servidor siempre alcanza
          break;
        case 'nfc':
          alcanceMaximo = 0.1; // 10 cm
          break;
        default:
          alcanceMaximo = 100; // Default
      }
      
      if (distancia <= alcanceMaximo) {
        // Calcular coste basado en distancia normalizada
        const costeDistancia = distancia / alcanceMaximo;
        
        // Queremos el medio con menor coste (mejor)
        if (costeDistancia < mejorCoste) {
          mejorCoste = costeDistancia;
          mejorMedio = medio;
        }
      }
    }
    
    if (mejorMedio !== null) {
      candidatos.push({
        a: aId,
        b: bId,
        medio: mejorMedio,
        coste: mejorCoste
      });
    }
  }
  
  // 7. Kruskal por coste (desempate a, b, medio) para garantizar conexión
  // Ordenar candidatos por coste, luego por a, luego por b, luego por medio
  candidatos.sort((c1, c2) => {
    if (c1.coste !== c2.coste) return c1.coste - c2.coste;
    if (c1.a !== c2.a) return c1.a.localeCompare(c2.a);
    if (c1.b !== c2.b) return c1.b.localeCompare(c2.b);
    if (c1.medio !== c2.medio) {
      const medioOrder: Record<Medio, number> = {
        'lora': 0, 'ble': 1, 'wifi-lan': 2, 'wifi-mesh': 3, 
        'webrtc': 4, 'reticulum': 5, 'serie': 6, 'servidor': 7, 'nfc': 8
      };
      return (medioOrder[c1.medio] || 99) - (medioOrder[c2.medio] || 99);
    }
    return 0;
  });
  
  // Unión-Find para Kruskal
  const padre: Record<string, string> = {};
  const rango: Record<string, number> = {};
  
  const encontrar = (x: string): string => {
    if (padre[x] !== x) {
      padre[x] = encontrar(padre[x]);
    }
    return padre[x];
  };
  
  const unir = (x: string, y: string): boolean => {
    const rx = encontrar(x);
    const ry = encontrar(y);
    if (rx === ry) return false;
    
    if (rango[rx] < rango[ry]) {
      padre[rx] = ry;
    } else if (rango[rx] > rango[ry]) {
      padre[ry] = rx;
    } else {
      padre[ry] = rx;
      rango[rx]++;
    }
    return true;
  };
  
  // Inicializar Unión-Find
  for (const neurona of neuronas) {
    padre[neurona.id] = neurona.id;
    rango[neurona.id] = 0;
  }
  
  const puentesSeleccionados: Puente[] = [];
  
  // Aplicar Kruskal
  for (const candidato of candidatos) {
    if (unir(candidato.a, candidato.b)) {
      puentesSeleccionados.push({
        a: candidato.a,
        b: candidato.b,
        medio: candidato.medio,
        coste: candidato.coste
      });
    }
  }
  
  // 8. Añadir candidatos que cierren un triángulo con puentes ya elegidos
  // Mientras ambos extremos estén por debajo de su coordinación objetivo
  
  // Calcular coordinación objetivo para cada neurona
  const coordinacionObjetivo: Record<string, number> = {};
  for (const neurona of neuronas) {
    let base = coordinacionDe(neurona);
    
    // Aplicar defectos
    let defecto = 0;
    
    // +1 si la neurona está 'fundida' (temperatura ≥ 0.6)
    const temp = temperatura[neurona.id] || 0.5;
    if (temp >= 0.6) {
      defecto += 1;
    }
    
    // -1 si su mejor candidato restante cuesta > 0.7
    // Para simplificar, usamos una aproximación: si tiene pocos candidatos buenos
    const buenosCandidatos = candidatos.filter(c => 
      (c.a === neurona.id || c.b === neurona.id) && c.coste <= 0.7
    ).length;
    
    if (buenosCandidatos === 0) {
      defecto -= 1;
    }
    
    coordinacionObjetivo[neurona.id] = Math.max(1, base + defecto);
  }
  
  // Contar puentes actuales por neurona
  const puentesPorNeurona: Record<string, number> = {};
  for (const neurona of neuronas) {
    puentesPorNeurona[neurona.id] = 0;
  }
  
  for (const puente of puentesSeleccionados) {
    puentesPorNeurona[puente.a]++;
    puentesPorNeurona[puente.b]++;
  }
  
  // Ordenar candidatos restantes por coste
  const candidatosRestantes = candidatos.filter(c => 
    !puentesSeleccionados.some(p => 
      (p.a === c.a && p.b === c.b && p.medio === c.medio) ||
      (p.a === c.b && p.b === c.a && p.medio === c.medio)
    )
  );
  
  candidatosRestantes.sort((c1, c2) => {
    if (c1.coste !== c2.coste) return c1.coste - c2.coste;
    if (c1.a !== c2.a) return c1.a.localeCompare(c2.a);
    if (c1.b !== c2.b) return c1.b.localeCompare(c2.b);
    return 0;
  });
  
  // Añadir candidatos que cierren un triángulo
  for (const candidato of candidatosRestantes) {
    // Verificar si añadir este candidato cerraría un triángulo
    // (es decir, si ya existe un camino de longitud 2 entre a y b)
    const yaConectadosPorDosSaltos = puentesSeleccionados.some(p1 => 
      puentesSeleccionados.some(p2 => 
        // p1 conecta a con x, p2 conecta x con b
        ((p1.a === candidato.a && p1.b === candidato.b) || 
         (p1.b === candidato.a && p1.a === candidato.b)) &&
        ((p2.a === candidato.a && p2.b === candidato.b) || 
         (p2.b === candidato.a && p2.a === candidato.b)) &&
        // x es el nodo intermedio
        ((p1.a === candidato.a && p1.b !== candidato.a && p1.b !== candidato.b && 
          p2.a === p1.b && p2.b === candidato.b) ||
         (p1.a === candidato.b && p1.b !== candidato.a && p1.b !== candidato.b && 
          p2.a === p1.b && p2.b === candidato.a) ||
         (p1.b === candidato.a && p1.a !== candidato.a && p1.a !== candidato.b && 
          p2.b === p1.a && p2.a === candidato.b) ||
         (p1.b === candidato.b && p1.a !== candidato.a && p1.a !== candidato.b && 
          p2.b === p1.a && p2.a === candidato.a))
      )
    );
    
    if (!yaConectadosPorDosSaltos) {
      continue; // No cierra un triángulo
    }
    
    // Verificar que ambos extremos estén por debajo de su coordinación objetivo
    if (
      puentesPorNeurona[candidato.a] < coordinacionObjetivo[candidato.a] &&
      puentesPorNeurona[candidato.b] < coordinacionObjetivo[candidato.b]
    ) {
      // Añadir el puente
      puentesSeleccionados.push({
        a: candidato.a,
        b: candidato.b,
        medio: candidato.medio,
        coste: candidato.coste
      });
      
      puentesPorNeurona[candidato.a]++;
      puentesPorNeurona[candidato.b]++;
    }
  }
  
  // 9. Entre dos neuronas, mantener solo un puente (el de menor coste)
  // Agrupar por par de neuronas (sin importar el orden)
  const puentesPorPar: Record<string, Puente[]> = {};
  
  for (const puente of puentesSeleccionados) {
    const clave = puente.a < puente.b 
      ? `${puente.a}|${puente.b}` 
      : `${puente.b}|${puente.a}`;
    
    if (!puentesPorPar[clave]) {
      puentesPorPar[clave] = [];
    }
    puentesPorPar[clave].push(puente);
  }
  
  // Para cada par, mantener solo el puente de menor coste
  const puentesFinales: Puente[] = [];
  
  for (const [clave, puentes] of Object.entries(puentesPorPar)) {
    if (puentes.length === 0) continue;
    
    // Ordenar por coste y tomar el primero
    puentes.sort((p1, p2) => p1.coste - p2.coste);
    puentesFinales.push(puentes[0]);
  }
  
  // 10. Calcular estado = estadoDe(media de temperatura)
  const temperaturas = Object.values(temperatura);
  const temperaturaMedia = temperaturas.length > 0 
    ? temperaturas.reduce((sum, t) => sum + t, 0) / temperaturas.length 
    : 0.5;
  
  const estado = estadoDe(temperaturaMedia);
  
  // 11. huella = huellaReticula(r) + ':' + número de puentes
  const huellaBase = huellaReticula(r);
  const huella = `${huellaBase}:${puentesFinales.length}`;
  
  // 12. coordenación actual (número de puentes por neurona)
  const coordinacionActual: Record<string, number> = {};
  for (const neurona of neuronas) {
    coordinacionActual[neurona.id] = 0;
  }
  
  for (const puente of puentesFinales) {
    coordinacionActual[puente.a] = (coordinacionActual[puente.a] || 0) + 1;
    coordinacionActual[puente.b] = (coordinacionActual[puente.b] || 0) + 1;
  }
  
  return {
    puentes: puentesFinales,
    estado,
    temperatura,
    huella,
    coordinacion: coordinacionActual
  };
}