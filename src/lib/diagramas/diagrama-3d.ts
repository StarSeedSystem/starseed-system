// Conversión pura de estructura SVG a escena 3D.
// Extrae nodos, aristas, capas y grupos desde un SVG de diagramas
// (basado en los ejemplos de diagram-design). Sin DOM, sin red, sin Three.js.
// El componente pinta con @react-three/fiber en escena-compartida.

export type TipoForma = "rect" | "circle" | "ellipse" | "path" | "line" | "text" | "grupo" | "otro";

export interface NodoSvg {
  id: string;
  tipo: TipoForma;
  etiqueta: string;
  x: number;
  y: number;
  w: number;
  h: number;
  grupo?: string;
  capa?: string;
  atributos: Record<string, string>;
}

export interface AristaSvg {
  id: string;
  tipo: "path" | "line";
  puntos: [number, number][];
  marcador?: string;
  etiqueta: string;
}

export interface CapaSvg {
  id: string;
  nombre: string;
  nodos: string[];
}

export interface EstructuraSvg {
  nodos: NodoSvg[];
  aristas: AristaSvg[];
  capas: CapaSvg[];
  grupos: string[];
  vista?: { x: number; y: number; w: number; h: number };
}

export type TipoEscena3d =
  | "capas"
  | "despiece"
  | "planta-axonometrica"
  | "grafo"
  | "hibrido";

export interface Nodo3d {
  id: string;
  tipo: TipoForma;
  etiqueta: string;
  posicion: [number, number, number];
  rotacion: [number, number, number];
  escala: [number, number, number];
  mirarACamara: boolean;
  capa?: string;
  grupo?: string;
}

export interface Arista3d {
  id: string;
  puntos: [number, number, number][];
  etiqueta: string;
}

export interface Escena3d {
  tipo: TipoEscena3d;
  nodos: Nodo3d[];
  aristas: Arista3d[];
  camara: { posicion: [number, number, number]; objetivo: [number, number, number] };
  separacionZ: number;
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/px$/i, ""));
  return Number.isNaN(n) ? 0 : n;
}

function extraerAtributo(attrs: string, clave: string): string | undefined {
  const re = new RegExp(clave + '\\s*=\\s*"([^"]*)"');
  const m = attrs.match(re);
  if (m) return m[1];
  const re2 = new RegExp(clave + "\\s*=\\s*'([^']*)'");
  const m2 = attrs.match(re2);
  if (m2) return m2[1];
  return undefined;
}

function extraerTexto(svg: string): string {
  return svg
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esCapa(g: string): boolean {
  const attrs = g.match(/<g\b([^>]*)>/i)?.[1] || "";
  const id = (extraerAtributo(attrs, "id") || "").toLowerCase();
  const cls = (extraerAtributo(attrs, "class") || "").toLowerCase();
  return id.includes("capa") || cls.includes("capa") || id.startsWith("layer");
}

function extraerRutaPath(d: string): [number, number][] {
  const nums = d.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const pts: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) {
    pts.push([num(nums[i]), num(nums[i + 1])]);
  }
  return pts;
}

function recolectarGrupos(svg: string): string[] {
  const grupos = new Set<string>();
  const re = /<g\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const id = extraerAtributo(m[1], "id");
    if (id) grupos.add(id);
  }
  return Array.from(grupos);
}

function extraerVista(svg: string): EstructuraSvg["vista"] {
  const vb = extraerAtributo(svg.match(/<svg\b([^>]*)>/i)?.[1] || "", "viewBox");
  if (vb) {
    const p = vb.split(/[\s,]+/).map((x) => num(x));
    if (p.length === 4) return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  const w = num(extraerAtributo(svg.match(/<svg\b([^>]*)>/i)?.[1] || "", "width"));
  const h = num(extraerAtributo(svg.match(/<svg\b([^>]*)>/i)?.[1] || "", "height"));
  if (w && h) return { x: 0, y: 0, w, h };
  return undefined;
}

export function estructuraDeSvg(svg: string): EstructuraSvg {
  const nodos: NodoSvg[] = [];
  const aristas: AristaSvg[] = [];
  const capas: CapaSvg[] = [];
  const gruposSet = new Set<string>();

  // Extraer grupos y marcar capas
  const reGrupo = /<g\b([^>]*)>([\s\S]*?)<\/g>/gi;
  let gm: RegExpExecArray | null;
  let capaIdx = 0;
  while ((gm = reGrupo.exec(svg)) !== null) {
    const attrs = gm[1];
    const gid = extraerAtributo(attrs, "id") || `g-${capaIdx++}`;
    gruposSet.add(gid);
    if (esCapa(gm[0])) {
      const nodosCap: string[] = [];
      // Buscar nodos dentro de este grupo
      const contenido = gm[2];
      const reNodo = /<(rect|circle|ellipse|text|path|line)\b([^>]*)/gi;
      let nm: RegExpExecArray | null;
      while ((nm = reNodo.exec(contenido)) !== null) {
        const nid = extraerAtributo(nm[2], "id") || `n-${nodos.length}`;
        nodosCap.push(nid);
      }
      capas.push({ id: gid, nombre: extraerAtributo(attrs, "id") || gid, nodos: nodosCap });
    }
  }

  // Rect
  const reRect = /<rect\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = reRect.exec(svg)) !== null) {
    const attrs = m[1];
    const id = extraerAtributo(attrs, "id") || `rect-${nodos.length}`;
    const x = num(extraerAtributo(attrs, "x"));
    const y = num(extraerAtributo(attrs, "y"));
    const w = num(extraerAtributo(attrs, "width"));
    const h = num(extraerAtributo(attrs, "height"));
    let grupo: string | undefined;
    for (const g of gruposSet) {
      if (svg.includes(`id="${g}"`) && svg.indexOf(`id="${g}"`) < m.index) {
        // heurística simple
      }
    }
    // buscar grupo contenedor simple
    const antes = svg.slice(0, m.index);
    const ultimoG = [...antes.matchAll(/<g\b([^>]*)>/gi)].pop();
    if (ultimoG) {
      const gattrs = ultimoG[1];
      if (!antes.includes("</g>") || (antes.lastIndexOf("<g") > antes.lastIndexOf("</g>"))) {
        grupo = extraerAtributo(gattrs, "id") || undefined;
      }
    }
    let capa: string | undefined;
    for (const c of capas) {
      if (c.nodos.includes(id)) { capa = c.id; break; }
    }
    nodos.push({ id, tipo: "rect", etiqueta: "", x, y, w, h, grupo, capa, atributos: {} });
  }

  // Circle
  const reCircle = /<circle\b([^>]*)\/?>/gi;
  while ((m = reCircle.exec(svg)) !== null) {
    const attrs = m[1];
    const id = extraerAtributo(attrs, "id") || `circle-${nodos.length}`;
    const cx = num(extraerAtributo(attrs, "cx"));
    const cy = num(extraerAtributo(attrs, "cy"));
    const r = num(extraerAtributo(attrs, "r")) || num(extraerAtributo(attrs, "rx"));
    const antes = svg.slice(0, m.index);
    const ultimoG = [...antes.matchAll(/<g\b([^>]*)>/gi)].pop();
    let grupo: string | undefined;
    if (ultimoG && (antes.lastIndexOf("<g") > antes.lastIndexOf("</g>"))) {
      grupo = extraerAtributo(ultimoG[1], "id") || undefined;
    }
    let capa: string | undefined;
    for (const c of capas) {
      if (c.nodos.includes(id)) { capa = c.id; break; }
    }
    nodos.push({ id, tipo: "circle", etiqueta: "", x: cx - r, y: cy - r, w: r * 2, h: r * 2, grupo, capa, atributos: {} });
  }

  // Texto agrupado / suelto
  const reTexto = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  while ((m = reTexto.exec(svg)) !== null) {
    const attrs = m[1];
    const id = extraerAtributo(attrs, "id") || `text-${nodos.length}`;
    const x = num(extraerAtributo(attrs, "x"));
    const y = num(extraerAtributo(attrs, "y"));
    const etiqueta = extraerTexto(m[2]);
    const antes = svg.slice(0, m.index);
    const ultimoG = [...antes.matchAll(/<g\b([^>]*)>/gi)].pop();
    let grupo: string | undefined;
    if (ultimoG && (antes.lastIndexOf("<g") > antes.lastIndexOf("</g>"))) {
      grupo = extraerAtributo(ultimoG[1], "id") || undefined;
    }
    let capa: string | undefined;
    for (const c of capas) {
      if (c.nodos.includes(id)) { capa = c.id; break; }
    }
    nodos.push({ id, tipo: "text", etiqueta, x, y, w: etiqueta.length * 6, h: 12, grupo, capa, atributos: {} });
  }

  // Path con posible marcador (arista)
  const rePath = /<path\b([^>]*)\/?>/gi;
  while ((m = rePath.exec(svg)) !== null) {
    const attrs = m[1];
    const id = extraerAtributo(attrs, "id") || `path-${aristas.length}`;
    const d = extraerAtributo(attrs, "d") || "";
    const marcador = extraerAtributo(attrs, "marker-end") || extraerAtributo(attrs, "marker-start");
    const puntos = extraerRutaPath(d);
    aristas.push({ id, tipo: "path", puntos, marcador, etiqueta: "" });
  }

  // Line
  const reLine = /<line\b([^>]*)\/?>/gi;
  while ((m = reLine.exec(svg)) !== null) {
    const attrs = m[1];
    const id = extraerAtributo(attrs, "id") || `line-${aristas.length}`;
    const x1 = num(extraerAtributo(attrs, "x1"));
    const y1 = num(extraerAtributo(attrs, "y1"));
    const x2 = num(extraerAtributo(attrs, "x2"));
    const y2 = num(extraerAtributo(attrs, "y2"));
    aristas.push({ id, tipo: "line", puntos: [[x1, y1], [x2, y2]], etiqueta: "" });
  }

  return { nodos, aristas, capas, grupos: Array.from(gruposSet), vista: extraerVista(svg) };
}

function centro(n: NodoSvg): [number, number] {
  return [n.x + n.w / 2, n.y + n.h / 2];
}

function separarSinSolaparse(nodos: NodoSvg[], radioBase: number): [number, number, number][] {
  const posiciones: [number, number, number][] = nodos.map((n) => {
    const c = centro(n);
    return [c[0] * 0.01, c[1] * 0.01, 0];
  });
  // Repartir en anillo 3D simple sin solaparse mucho
  for (let i = 0; i < nodos.length; i++) {
    const angulo = (i / Math.max(1, nodos.length)) * Math.PI * 2;
    const radio = radioBase + (i % 3) * radioBase * 0.4;
    posiciones[i] = [Math.cos(angulo) * radio, Math.sin(angulo) * radio, (i % 2) * 0.5];
  }
  return posiciones;
}

export function escena3d(estructura: EstructuraSvg, tipo: TipoEscena3d = "capas"): Escena3d {
  const nodos: Nodo3d[] = [];
  const aristas: Arista3d[] = [];
  const separacionZ = tipo === "despiece" ? 2.2 : tipo === "planta-axonometrica" ? 1.6 : tipo === "capas" ? 1.4 : 1.0;

  if (tipo === "capas" || tipo === "despiece" || tipo === "planta-axonometrica") {
    // Apilar por capas en Z con separación proporcional
    const ordenCapas = estructura.capas.length > 0 ? estructura.capas.map((c) => c.id) : ["__sin_capa__"];
    const mapaPorCapa = new Map<string, NodoSvg[]>();
    for (const capaId of ordenCapas) mapaPorCapa.set(capaId, []);
    mapaPorCapa.set("__sin_capa__", []);
    for (const n of estructura.nodos) {
      const c = n.capa || "__sin_capa__";
      if (!mapaPorCapa.has(c)) mapaPorCapa.set(c, []);
      mapaPorCapa.get(c)!.push(n);
    }
    let z = 0;
    for (const capaId of Array.from(mapaPorCapa.keys())) {
      const lista = mapaPorCapa.get(capaId)!;
      for (const n of lista) {
        const c = centro(n);
        nodos.push({
          id: n.id,
          tipo: n.tipo,
          etiqueta: n.etiqueta,
          posicion: [c[0] * 0.01, (tipo === "planta-axonometrica" ? -c[1] * 0.01 : c[1] * 0.01), z],
          rotacion: tipo === "despiece" ? [0.2, 0.3, 0] : tipo === "planta-axonometrica" ? [-Math.PI / 6, Math.PI / 4, 0] : [0, 0, 0],
          escala: [1, 1, 1],
          mirarACamara: n.tipo === "text",
          capa: n.capa,
          grupo: n.grupo,
        });
      }
      z += separacionZ;
    }
  } else if (tipo === "grafo" || tipo === "hibrido") {
    const pos = separarSinSolaparse(estructura.nodos, 3.0);
    for (let i = 0; i < estructura.nodos.length; i++) {
      const n = estructura.nodos[i];
      nodos.push({
        id: n.id,
        tipo: n.tipo,
        etiqueta: n.etiqueta,
        posicion: pos[i],
        rotacion: [0, 0, 0],
        escala: [1, 1, 1],
        mirarACamara: n.tipo === "text",
        capa: n.capa,
        grupo: n.grupo,
      });
    }
  }

  // Aristas en 3D
  for (const a of estructura.aristas) {
    if (a.puntos.length >= 2) {
      const p3: [number, number, number][] = a.puntos.slice(0, 20).map((p, idx) => [p[0] * 0.01, p[1] * 0.01, idx * 0.05]);
      aristas.push({ id: a.id, puntos: p3, etiqueta: a.etiqueta });
    }
  }

  return {
    tipo,
    nodos,
    aristas,
    camara: { posicion: [8, 6, 12], objetivo: [0, 0, 2] },
    separacionZ,
  };
}
