export interface Punto {
  id: string;
  x: number;
  y: number;
}

/**
 * Elimina puntos duplicados (mismas x,y) conservando el de menor id
 */
function eliminarDuplicados(puntos: Punto[]): Punto[] {
  const mapa = new Map<string, Punto>();
  for (const p of puntos) {
    const key = `${p.x},${p.y}`;
    if (!mapa.has(key) || p.id < mapa.get(key)!.id) {
      mapa.set(key, p);
    }
  }
  return Array.from(mapa.values());
}

/**
 * Determina si un punto está dentro del circunscrito de un triángulo
 */
function enCircunscrito(pt: Punto, p1: Punto, p2: Punto, p3: Punto): boolean {
  // Manejar casos degenerados (puntos colineales)
  const area = Math.abs((p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2);
  if (area < 1e-10) return false;
  
  // Calcular circunscrito usando coordenadas baricéntricas
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-10) return false;
  
  const ux = ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) + 
              (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) + 
              (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) / d;
              
  const uy = ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) + 
              (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) + 
              (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) / d;
  
  // Radio al cuadrado
  const dx = p1.x - ux;
  const dy = p1.y - uy;
  const rSquared = dx * dx + dy * dy;
  
  // Distancia del punto al centro
  const ddx = pt.x - ux;
  const ddy = pt.y - uy;
  const distSquared = ddx * ddx + ddy * ddy;
  
  return distSquared <= rSquared + 1e-10;
}

/**
 * Triangulación de Delaunay usando el algoritmo de Bowyer-Watson
 */
export function delaunay(puntosIniciales: Punto[]): Array<[string, string]> {
  // Eliminar duplicados
  const puntos = eliminarDuplicados(puntosIniciales);
  
  // Casos especiales
  if (puntos.length < 2) return [];
  if (puntos.length === 2) {
    const id1 = puntos[0].id < puntos[1].id ? puntos[0].id : puntos[1].id;
    const id2 = puntos[0].id < puntos[1].id ? puntos[1].id : puntos[0].id;
    return [[id1, id2]];
  }
  
  // Ordenar puntos por id para garantizar determinismo
  puntos.sort((a, b) => a.id.localeCompare(b.id));
  
  // Encontrar bounds para crear supertriángulo
  let minX = puntos[0].x, maxX = puntos[0].x;
  let minY = puntos[0].y, maxY = puntos[0].y;
  
  for (const p of puntos) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  
  const dx = maxX - minX;
  const dy = maxY - minY;
  const deltaMax = Math.max(dx, dy);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  
  // Coordenadas del supertriángulo
  const pA = {id: "SUPER-A", x: midX - 100 * deltaMax, y: midY - 100 * deltaMax};
  const pB = {id: "SUPER-B", x: midX, y: midY + 100 * deltaMax};
  const pC = {id: "SUPER-C", x: midX + 100 * deltaMax, y: midY - 100 * deltaMax};
  
  // Inicializar triangulación con el supertriángulo
  let triangulos = [[pA, pB, pC]];
  
  // Procesar cada punto
  for (const punto of puntos) {
    // Encontrar triángulos cuyo circunscrito contiene el punto
    const poligono: {p1: Punto, p2: Punto}[] = [];
    const nuevosTriangulos: [Punto, Punto, Punto][] = [];
    
    for (const [p1, p2, p3] of triangulos) {
      if (enCircunscrito(punto, p1, p2, p3)) {
        // Añadir aristas del triángulo al polígono
        poligono.push({p1: p1, p2: p2});
        poligono.push({p1: p2, p2: p3});
        poligono.push({p1: p3, p2: p1});
      } else {
        // Mantener triángulo
        nuevosTriangulos.push([p1, p2, p3]);
      }
    }
    
    // Eliminar aristas duplicadas del polígono
    const aristasUnicas = new Map<string, {p1: Punto, p2: Punto}>();
    for (const edge of poligono) {
      const key = edge.p1.id < edge.p2.id 
        ? `${edge.p1.id}-${edge.p2.id}` 
        : `${edge.p2.id}-${edge.p1.id}`;
      if (aristasUnicas.has(key)) {
        aristasUnicas.delete(key);
      } else {
        aristasUnicas.set(key, edge);
      }
    }
    
    // Crear nuevos triángulos desde el punto hacia las aristas del polígono
    for (const edge of aristasUnicas.values()) {
      nuevosTriangulos.push([edge.p1, edge.p2, punto]);
    }
    
    triangulos = nuevosTriangulos;
  }
  
  // Eliminar triángulos que contengan vértices del supertriángulo
  triangulos = triangulos.filter(
    t => !t.some(p => p.id.startsWith("SUPER-"))
  );
  
  // Si no quedan triángulos (caso colineal), devolver cadena ordenada
  if (triangulos.length === 0 && puntos.length >= 2) {
    const aristas: Array<[string, string]> = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const id1 = puntos[i].id < puntos[i+1].id ? puntos[i].id : puntos[i+1].id;
      const id2 = puntos[i].id < puntos[i+1].id ? puntos[i+1].id : puntos[i].id;
      aristas.push([id1, id2]);
    }
    return aristas;
  }
  
  // Extraer aristas únicas
  const aristasSet = new Set<string>();
  for (const [p1, p2, p3] of triangulos) {
    const aristas = [
      [p1.id, p2.id],
      [p2.id, p3.id],
      [p3.id, p1.id]
    ];
    
    for (const [id1, id2] of aristas) {
      const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
      aristasSet.add(key);
    }
  }
  
  // Convertir a array y ordenar
  const resultado: Array<[string, string]> = [];
  for (const key of aristasSet) {
    const [id1, id2] = key.split("-");
    resultado.push([id1, id2]);
  }
  
  // Ordenar por primer id, luego por segundo id
  resultado.sort((a, b) => {
    if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
    return a[1].localeCompare(b[1]);
  });
  
  return resultado;
}

/**
 * Proyección equirectangular de coordenadas geográficas a metros
 */
export function proyectar(lat: number, lon: number, lat0: number, lon0: number): {x: number; y: number} {
  const R = 6371000; // Radio de la Tierra en metros
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const lat0Rad = lat0 * Math.PI / 180;
  const lon0Rad = lon0 * Math.PI / 180;
  
  const x = R * (lonRad - lon0Rad) * Math.cos(lat0Rad);
  const y = R * (latRad - lat0Rad);
  
  return {x, y};
}