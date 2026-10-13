interface Punto {
  id: string;
  x: number;
  y: number;
}

interface Triangulo {
  a: Punto;
  b: Punto;
  c: Punto;
}

function contieneEnCircunscrito(t: Triangulo, p: Punto): boolean {
  const ax = t.a.x, ay = t.a.y;
  const bx = t.b.x, by = t.b.y;
  const cx = t.c.x, cy = t.c.y;
  const dx = p.x, dy = p.y;

  const det = (ax - dx) * ((by - dy) * (cx - cx + cy - dy) - (cy - dy) * (bx - dx + cx - cx))
            - (ay - dy) * ((bx - dx) * (cx - cx + cy - dy) - (cy - dy) * (cx - dx + cx - cx))
            + ((ax - dx) * (ax - dx) + (ay - dy) * (ay - dy)) * ((bx - dx) * (cy - dy) - (by - dy) * (cx - dx))
            - ((ax - dx) * (ax - dx) + (ay - dy) * (ay - dy)) * ((cx - dx) * (by - dy) - (cy - dy) * (bx - dx));

  return det > 0;
}

function ordenarArista(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function delaunay(puntos: Punto[]): Array<[string, string]> {
  if (puntos.length < 2) return [];
  
  // Eliminar duplicados (mismas x,y, mantener id menor)
  const puntosUnicos = [...new Map(puntos.map(p => [`${p.x},${p.y}`, p])).values()]
    .sort((a, b) => a.id.localeCompare(b.id));

  if (puntosUnicos.length === 2) {
    return [ordenarArista(puntosUnicos[0].id, puntosUnicos[1].id)];
  }

  // Encontrar super-triángulo
  let minX = puntosUnicos[0].x, maxX = puntosUnicos[0].x;
  let minY = puntosUnicos[0].y, maxY = puntosUnicos[0].y;
  for (const p of puntosUnicos) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  const deltaMax = Math.max(dx, dy);
  const midx = (minX + maxX) / 2;
  const midy = (minY + maxY) / 2;
  
  const p1 = {id: "__super1__", x: midx - 20 * deltaMax, y: midy - deltaMax};
  const p2 = {id: "__super2__", x: midx, y: midy + 20 * deltaMax};
  const p3 = {id: "__super3__", x: midx + 20 * deltaMax, y: midy - deltaMax};
  
  const triangulos: Triangulo[] = [{a: p1, b: p2, c: p3}];

  for (const punto of puntosUnicos) {
    const bordes: {[key: string]: Triangulo} = {};
    const triangulosMalos: Triangulo[] = [];
    
    for (const t of triangulos) {
      if (contieneEnCircunscrito(t, punto)) {
        triangulosMalos.push(t);
        // Agregar los tres bordes
        const aristas = [
          ordenarArista(t.a.id, t.b.id),
          ordenarArista(t.b.id, t.c.id),
          ordenarArista(t.c.id, t.a.id)
        ];
        for (const [a, b] of aristas) {
          const key = `${a},${b}`;
          if (bordes[key]) {
            delete bordes[key];
          } else {
            bordes[key] = t;
          }
        }
      }
    }
    
    // Eliminar triangulos malos
    triangulos.splice(
      triangulos.indexOf(triangulosMalos[0]), 
      triangulosMalos.length
    );
    
    // Re-triangular el agujero
    for (const key in bordes) {
      const [aId, bId] = key.split(",");
      const aPunto = puntosUnicos.find(p => p.id === aId) || 
                     (aId.startsWith("__super") ? {id: aId, x: 0, y: 0} : null);
      const bPunto = puntosUnicos.find(p => p.id === bId) || 
                     (bId.startsWith("__super") ? {id: bId, x: 0, y: 0} : null);
      if (aPunto && bPunto) {
        triangulos.push({a: aPunto, b: bPunto, c: punto});
      }
    }
  }

  // Eliminar triangulos que usan vertices del super-triangulo
  const triangulosFinales = triangulos.filter(t => 
    !(t.a.id.startsWith("__super") || t.b.id.startsWith("__super") || t.c.id.startsWith("__super"))
  );

  // Recopilar aristas únicas
  const aristasSet = new Set<string>();
  for (const t of triangulosFinales) {
    aristasSet.add(ordenarArista(t.a.id, t.b.id).join(","));
    aristasSet.add(ordenarArista(t.b.id, t.c.id).join(","));
    aristasSet.add(ordenarArista(t.c.id, t.a.id).join(","));
  }

  const aristas = Array.from(aristasSet)
    .map(s => s.split(",") as [string, string])
    .sort((a, b) => {
      if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
      return a[1].localeCompare(b[1]);
    });

  return aristas;
}

export function proyectar(lat: number, lon: number, lat0: number, lon0: number): {x: number; y: number} {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;
  const x = (lon - lon0) * Math.cos(toRad(lat0)) * R;
  const y = toRad(lat - lat0) * R;
  return {x, y};
}