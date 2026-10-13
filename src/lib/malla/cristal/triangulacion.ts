export interface Punto {
  id: string;
  x: number;
  y: number;
}

export function proyectar(lat: number, lon: number, lat0: number, lon0: number): { x: number; y: number } {
  const R = 6371000;
  const dLat = (lat - lat0) * Math.PI / 180;
  const dLon = (lon - lon0) * Math.PI / 180;
  const x = R * dLon * Math.cos(lat0 * Math.PI / 180);
  const y = R * dLat;
  return { x, y };
}

export function delaunay(puntos: Punto[]): Array<[string, string]> {
  if (puntos.length < 2) return [];

  const puntosUnicos = new Map<string, Punto>();
  for (const p of puntos) {
    const key = `${p.x},${p.y}`;
    if (!puntosUnicos.has(key) || puntosUnicos.get(key)!.id > p.id) {
      puntosUnicos.set(key, p);
    }
  }
  const unicos = Array.from(puntosUnicos.values());

  if (unicos.length === 1) return [];
  if (unicos.length === 2) {
    return [[unicos[0].id, unicos[1].id].sort() as [string, string]];
  }

  const sorted = [...unicos].sort((a, b) => a.id.localeCompare(b.id));

  const areColinear = (p1: Punto, p2: Punto, p3: Punto): boolean => {
    const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    return Math.abs(cross) < 1e-10;
  };

  const allColinear = sorted.every((_, i, arr) => {
    if (i < 2) return true;
    return areColinear(arr[0], arr[1], arr[i]);
  });

  if (allColinear) {
    const edges: Array<[string, string]> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      edges.push([sorted[i].id, sorted[i + 1].id]);
    }
    return edges;
  }

  const findCircumcenter = (p1: Punto, p2: Punto, p3: Punto): { x: number; y: number; r2: number } => {
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < 1e-10) {
      return { x: 0, y: 0, r2: Infinity };
    }
    const ux = ((p1.x ** 2 + p1.y ** 2) * (p2.y - p3.y) + (p2.x ** 2 + p2.y ** 2) * (p3.y - p1.y) + (p3.x ** 2 + p3.y ** 2) * (p1.y - p2.y)) / d;
    const uy = ((p1.x ** 2 + p1.y ** 2) * (p3.x - p2.x) + (p2.x ** 2 + p2.y ** 2) * (p1.x - p3.x) + (p3.x ** 2 + p3.y ** 2) * (p2.x - p1.x)) / d;
    const r2 = (p1.x - ux) ** 2 + (p1.y - uy) ** 2;
    return { x: ux, y: uy, r2 };
  };

  const pointInCircle = (p: Punto, center: { x: number; y: number; r2: number }): boolean => {
    const dist2 = (p.x - center.x) ** 2 + (p.y - center.y) ** 2;
    return dist2 <= center.r2 + 1e-10;
  };

  const minX = Math.min(...sorted.map(p => p.x));
  const maxX = Math.max(...sorted.map(p => p.x));
  const minY = Math.min(...sorted.map(p => p.y));
  const maxY = Math.max(...sorted.map(p => p.y));
  const dx = maxX - minX;
  const dy = maxY - minY;
  const deltaMax = Math.max(dx, dy);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const supra: Punto[] = [
    { id: 'supra1', x: midX - 20 * deltaMax, y: midY - deltaMax },
    { id: 'supra2', x: midX, y: midY + 20 * deltaMax },
    { id: 'supra3', x: midX + 20 * deltaMax, y: midY - deltaMax },
  ];

  type Triangulo = [Punto, Punto, Punto];
  const triangles: Triangulo[] = [[supra[0], supra[1], supra[2]]];

  for (const p of sorted) {
    const bad: Triangulo[] = [];
    for (const t of triangles) {
      const center = findCircumcenter(t[0], t[1], t[2]);
      if (center.r2 === Infinity) continue;
      if (pointInCircle(p, center)) {
        bad.push(t);
      }
    }

    if (bad.length === 0) continue;

    const poly: Array<[string, string]> = [];
    for (const t of bad) {
      const edges = [
        [t[0].id, t[1].id],
        [t[1].id, t[2].id],
        [t[2].id, t[0].id],
      ];
      for (const e of edges) {
        const [a, b] = e[0] < e[1] ? [e[0], e[1]] : [e[1], e[0]];
        const idx = poly.findIndex((pe) => pe[0] === a && pe[1] === b);
        if (idx === -1) {
          poly.push([a, b]);
        } else {
          poly.splice(idx, 1);
        }
      }
    }

    for (const t of bad) {
      const idx = triangles.findIndex(tt => tt === t);
      if (idx !== -1) triangles.splice(idx, 1);
    }

    const pointMap = new Map(sorted.map(p => [p.id, p]));
    pointMap.set(supra[0].id, supra[0]);
    pointMap.set(supra[1].id, supra[1]);
    pointMap.set(supra[2].id, supra[2]);

    for (const e of poly) {
      const p1 = pointMap.get(e[0])!;
      const p2 = pointMap.get(e[1])!;
      triangles.push([p, p1, p2]);
    }
  }

  const edgesSet = new Set<string>();
  const result: Array<[string, string]> = [];

  for (const t of triangles) {
    if (t[0].id.startsWith('supra') || t[1].id.startsWith('supra') || t[2].id.startsWith('supra')) continue;

    const e1 = t[0].id < t[1].id ? [t[0].id, t[1].id] : [t[1].id, t[0].id];
    const e2 = t[1].id < t[2].id ? [t[1].id, t[2].id] : [t[2].id, t[1].id];
    const e3 = t[2].id < t[0].id ? [t[2].id, t[0].id] : [t[0].id, t[2].id];

    for (const e of [e1, e2, e3]) {
      const key = `${e[0]}|${e[1]}`;
      if (!edgesSet.has(key)) {
        edgesSet.add(key);
        result.push(e as [string, string]);
      }
    }
  }

  result.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return result;
}