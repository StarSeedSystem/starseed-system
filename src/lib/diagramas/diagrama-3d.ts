// Diagrama 3D: extracción pura de estructura SVG y colocación en escena 3D.
// Módulo PURO (sin DOM, sin red, sin procesos). Contrato: architecture/diagramas.md §5 (3D y XR).
// Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/), citada en el contrato.
// Regla del área: contenido = entidad única; estética basada en geometría sagrada (φ, Fibonacci).

export interface NodoSVG { id: string; tipo: "rect" | "circulo" | "texto"; x: number; y: number; ancho?: number; alto?: number; texto?: string; capa?: string; }
export interface AristaSVG { id: string; fuente: string; destino: string; tipo: "line" | "path"; marcador?: string; capa?: string; }
export interface CapaSVG { id: string; tipo: string; nodos: string[]; }
export interface EstructuraDiagrama { nodos: NodoSVG[]; aristas: AristaSVG[]; capas: CapaSVG[]; textos: string[]; }
export type TipoEscena3D = "capas" | "despiece" | "axonometrica" | "grafo";
export interface Escena3D { tipo: TipoEscena3D; nodos: Array<{ id: string; x: number; y: number; z: number; rotacion?: number }>; aristas: Array<{ fuente: string; destino: string; puntos: Array<[number, number, number]> }>; capas: Array<{ id: string; zBase: number; color?: string }>; textos: string[]; }

/** Extrae nodos (rect, círculo, texto agrupados), aristas (path/line con marcador) y capas (grupos `g` con id/clase de capa) de un SVG. */
export function estructuraDeSvg(svg: string): EstructuraDiagrama {
  const nodos: NodoSVG[] = []; const aristas: AristaSVG[] = []; const capas: CapaSVG[] = []; const textos: string[] = [];
  let m: RegExpExecArray | null;
  const rectRe = /<rect\s+([^>]*?)\/>/gi;
  while ((m = rectRe.exec(svg)) !== null) {
    const a = m[1]; const id = (a.match(/id=["']([^"']+)["']/i)?.[1] || `r-${nodos.length}`);
    nodos.push({ id, tipo: "rect", x: +(a.match(/x=["']?([^"'\s>]+)["']/i)?.[1] || 0) || 0, y: +(a.match(/y=["']?([^"'\s>]+)["']/i)?.[1] || 0) || 0, ancho: +(a.match(/width=["']?([^"'\s>]+)["']/i)?.[1] || 10) || 0, alto: +(a.match(/height=["']?([^"'\s>]+)["']/i)?.[1] || 10) || 0 });
  }
  const circleRe = /<circle\s+([^>]*?)\/>/gi;
  while ((m = circleRe.exec(svg)) !== null) {
    const a = m[1]; const id = (a.match(/id=["']([^"']+)["']/i)?.[1] || `c-${nodos.length}`); const cx = +(a.match(/cx=["']?([^"'\s>]+)["']/i)?.[1] || 0) || 0; const cy = +(a.match(/cy=["']?([^"'\s>]+)["']/i)?.[1] || 0) || 0; const r = +(a.match(/r=["']?([^"'\s>]+)["']/i)?.[1] || 5) || 5;
    nodos.push({ id, tipo: "circulo", x: cx - r, y: cy - r, ancho: r * 2, alto: r * 2 });
  }
  const textRe = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
  while ((m = textRe.exec(svg)) !== null) {
    const bloque = m[0]; const contenido = m[1].replace(/<tspan[^>]*>[\s\S]*?<\/tspan>/gi, "").trim(); const id = (bloque.match(/id=["']([^"']+)["']/i)?.[1] || `t-${nodos.length}`);
    if (contenido) textos.push(contenido);
    nodos.push({ id, tipo: "texto", x: +(bloque.match(/x=["']?([^"'\s>]+)["']/i)?.[1] || 0) || 0, y: +(bloque.match(/y=["']?([^"'\s>]+)["']/i)?.[1] || 0) || 0, texto: contenido || undefined });
  }
  const pathRe = /<path\s+([^>]*?)\/>/gi;
  while ((m = pathRe.exec(svg)) !== null) {
    const a = m[1]; const id = (a.match(/id=["']([^"']+)["']/i)?.[1] || `p-${aristas.length}`);
    aristas.push({ id, fuente: (a.match(/data-fuente=["']([^"']+)["']/i)?.[1] || ""), destino: (a.match(/data-destino=["']([^"']+)["']/i)?.[1] || a.match(/data-fuente=["']([^"']+)["']/i)?.[1] || ""), tipo: "path", marcador: a.match(/marker-end=["']([^"']+)["']/i)?.[1] || undefined });
  }
  const lineRe = /<line\s+([^>]*?)\/>/gi;
  while ((m = lineRe.exec(svg)) !== null) {
    const a = m[1]; const id = (a.match(/id=["']([^"']+)["']/i)?.[1] || `l-${aristas.length}`); const x1 = (a.match(/x1=["']?([^"'\s>]+)["']/i)?.[1] || ""); const y1 = (a.match(/y1=["']?([^"'\s>]+)["']/i)?.[1] || ""); const x2 = (a.match(/x2=["']?([^"'\s>]+)["']/i)?.[1] || ""); const y2 = (a.match(/y2=["']?([^"'\s>]+)["']/i)?.[1] || "");
    aristas.push({ id, fuente: `${x1},${y1}`, destino: `${x2},${y2}` || `${x1},${y1}`, tipo: "line", marcador: a.match(/marker-end=["']([^"']+)["']/i)?.[1] || undefined });
  }
  const capaRe = /<g\b[^>]*?\b(?:id=["']([^"']+)["']|class=["']([^"']*?\b(?:layer|capa|grupo|group)\b[^"']*)["'])\s*[^>]*>[\s\S]*?<\/g>/gi;
  const capaIds = new Set<string>();
  while ((m = capaRe.exec(svg)) !== null) {
    const idC = m[1] || `capa-${capas.length}`; if (capaIds.has(idC)) continue; capaIds.add(idC);
    const bloqueCapa = m[0];
    const nodosEnCapa = nodos.filter((n) => bloqueCapa.includes(`id="${n.id}"`)).map((n) => n.id);
    capas.push({ id: idC, tipo: "grupo", nodos: nodosEnCapa.length ? nodosEnCapa : ["*"] });
  }
  return { nodos, aristas, capas, textos };
}

/** Coloca tipos de capas, despiece y planta axonométrica apilados en Z con separación proporcional (φ); grafo repartido en 3D sin solaparse; textos de cara. */
export function escena3d(estructura: EstructuraDiagrama, tipo: TipoEscena3D = "capas"): Escena3D {
  const PHI = 1.618033988749895;
  const nodos3d = estructura.nodos.map((n, i) => ({ id: n.id, x: n.x, y: n.y, z: tipo === "capas" ? (i % 3) * 15 * PHI : tipo === "despiece" ? (i * 8) / PHI : tipo === "axonometrica" ? 0 : i * 10, rotacion: tipo === "grafo" ? i * 0.45 : 0 }));
  const aristas3d = estructura.aristas.map((a) => {
    const fuente = nodos3d.find((n) => n.id === a.fuente) || nodos3d[0]; const destino = nodos3d.find((n) => n.id === a.destino) || nodos3d[nodos3d.length - 1] || nodos3d[0];
    return { fuente: a.fuente, destino: a.destino, puntos: [[fuente.x, fuente.y, fuente.z], [destino.x, destino.y, destino.z]] as Array<[number, number, number]> };
  });
  const capas3d = estructura.capas.map((c, i) => ({ id: c.id, zBase: i * 20 * PHI, color: i % 2 === 0 ? "#007FFF" : (i % 3 === 1 ? "#10B981" : "#FFBF00") }));
  return { tipo, nodos: nodos3d, aristas: aristas3d, capas: capas3d, textos: estructura.textos };
}
