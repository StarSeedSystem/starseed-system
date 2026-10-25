// Del SVG de un diagrama a una escena 3D que se gira y se recorre (architecture/diagramas.md §3.5).
// Extrae nodos, aristas y capas con un lector tolerante y, sin DOM ni red, coloca la escena:
// capas, despiece y planta apilados en Z con separación proporcional; los grafos, repartidos en 3D.
// Los textos llevan `billboard` para mirar siempre a la cámara. Skill MIT diagram-design
// (vendor/habilidades/diagram-design/): sus ejemplos `example-layers.html` y `example-architecture.html`
// fijan las heurísticas de bandas, zonas y cajas. Módulo PURO, sin `any`.

export type TipoEscenaDiagrama = "capas" | "despiece" | "planta" | "grafo";
export type TipoNodoDiagrama = "rect" | "circulo" | "texto";

export interface NodoDiagrama {
  id: string;
  tipo: TipoNodoDiagrama;
  /** Centro del nodo en coordenadas del SVG (y hacia abajo). */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  texto: string;
  capa: string | null;
}

export interface AristaDiagrama {
  id: string;
  desde: string;
  hasta: string;
}

export interface CapaDiagrama {
  id: string;
  nombre: string;
  nodos: string[];
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface EstructuraDiagrama {
  nodos: NodoDiagrama[];
  aristas: AristaDiagrama[];
  capas: CapaDiagrama[];
  ancho: number;
  alto: number;
}

export type Vec3D = [number, number, number];

export interface Nodo3D {
  id: string;
  texto: string;
  pos: Vec3D;
  tamano: Vec3D;
  color: string;
  capa: string | null;
  /** El texto se pinta como sprite: siempre de cara a la cámara. */
  billboard: boolean;
}

export interface Arista3D {
  id: string;
  desde: Vec3D;
  hasta: Vec3D;
}

export interface Escena3D {
  tipo: TipoEscenaDiagrama;
  nodos: Nodo3D[];
  aristas: Arista3D[];
  separacion: number;
}

const numero = (v: string | undefined, porDefecto = 0): number => {
  const n = Number.parseFloat((v ?? "").replace(/[^\d.+-eE]/g, ""));
  return Number.isFinite(n) ? n : porDefecto;
};
const atributos = (texto: string): Record<string, string> => {
  const o: Record<string, string> = {};
  for (const m of texto.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) o[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return o;
};
const textoPlano = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
const rangos = (html: string, etiqueta: string): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  const re = new RegExp(`<${etiqueta}\\b[^>]*>[\\s\\S]*?<\\/${etiqueta}\\s*>`, "gi");
  for (const m of html.matchAll(re)) out.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return out;
};
const ES_CAPA = /(?:^|[-_\s])(capa|layer|zona|zone|grupo|group|stack)(?:$|[-_\s])/i;
const CAPA_NOMBRE = /^(?:capa|layer|zona|zone|grupo|group|stack|banda|fila)[-_\s]?\d*$/i;

interface Grupo { id: string; inicio: number; fin: number; }
function gruposDeCapa(html: string): Grupo[] {
  const out: Grupo[] = [];
  const re = /<g\b([^>]*)>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const a = atributos(m[1]);
    const clave = `${a.id ?? ""} ${a.class ?? ""} ${a["data-capa"] ?? ""}`.trim();
    if (!ES_CAPA.test(clave)) continue;
    let nivel = 1;
    const re2 = /<(\/?)g\b[^>]*>/gi;
    re2.lastIndex = re.lastIndex;
    let c: RegExpExecArray | null = null;
    while ((c = re2.exec(html))) {
      nivel += c[1] ? -1 : 1;
      if (nivel === 0) break;
    }
    out.push({ id: (a.id || a.class || "capa").split(/\s+/)[0], inicio: re.lastIndex, fin: c?.index ?? html.length });
  }
  return out;
}

interface TextoLeido { i: number; x: number; y: number; texto: string; tam: number; }
const leerTextos = (html: string, defs: Array<[number, number]>): TextoLeido[] => {
  const out: TextoLeido[] = [];
  for (const m of html.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text\s*>/gi)) {
    const i = m.index ?? 0;
    if (defs.some(([a, b]) => i >= a && i < b)) continue;
    const a = atributos(m[1]);
    const texto = textoPlano(m[2]);
    if (texto) out.push({ i, x: numero(a.x), y: numero(a.y), texto, tam: numero(a["font-size"], 10) });
  }
  return out;
};

interface RectLeido extends NodoDiagrama { i: number; fill: string; stroke: string; }
function leerRects(html: string, defs: Array<[number, number]>): RectLeido[] {
  const out: RectLeido[] = [];
  const vistos = new Set<string>();
  for (const m of html.matchAll(/<rect\b([^>]*)>/gi)) {
    const i = m.index ?? 0;
    if (defs.some(([a, b]) => i >= a && i < b)) continue;
    const a = atributos(m[1]);
    if (!a.width || !a.height || a.width === "100%" || a.height === "100%") continue;
    const w = numero(a.width), h = numero(a.height);
    const clave = [numero(a.x), numero(a.y), w, h].map((n) => Math.round(n)).join(":");
    if (w < 8 || h < 8 || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ i, tipo: "rect", x: numero(a.x) + w / 2, y: numero(a.y) + h / 2, ancho: w, alto: h,
      texto: "", capa: null, id: a.id ?? "", fill: a.fill ?? "", stroke: a.stroke ?? "" });
  }
  return out;
}

const contiene = (n: { x: number; y: number; ancho: number; alto: number }, t: { x: number; y: number }) =>
  t.x >= n.x - n.ancho / 2 - 2 && t.x <= n.x + n.ancho / 2 + 2 && t.y >= n.y - n.alto / 2 - 7 && t.y <= n.y + n.alto / 2 + 2;

/** [inicio, fin) del primer SVG de primer nivel, contando anidados. */
function limitesSvg(html: string): [number, number] | null {
  const re = /<\/?svg\b[^>]*>/gi;
  let inicio = -1, nivel = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const cierre = m[0][1] === "/";
    if (inicio < 0) { if (cierre) continue; inicio = m.index; }
    nivel += cierre ? -1 : /\/\s*>$/.test(m[0]) ? 0 : 1;
    if (nivel === 0) return [inicio, m.index + m[0].length];
  }
  return null;
}

type Vec2D = [number, number];
/** Extremos de un `path` en coordenadas absolutas (M/L/H/V/C/S/Q/A, con relativos). */
function extremosPath(d: string): { desde: Vec2D; hasta: Vec2D } | null {
  const partes = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  let desde: Vec2D | null = null;
  while (i < partes.length) {
    if (/[a-zA-Z]/.test(partes[i])) {
      cmd = partes[i++];
      if (cmd === "Z" || cmd === "z") { x = sx; y = sy; continue; }
    }
    const rel = cmd === cmd.toLowerCase(), c = cmd.toUpperCase();
    const n = (k: number) => Number(partes[i + k] ?? "0");
    if (c === "M" || c === "L" || c === "T") {
      if (i + 1 >= partes.length) break;
      x = (rel ? x : 0) + n(0); y = (rel ? y : 0) + n(1);
      if (c === "M") { sx = x; sy = y; desde = desde ?? [x, y]; cmd = rel ? "l" : "L"; }
      i += 2;
    } else if (c === "H") { x = (rel ? x : 0) + n(0); i += 1; }
    else if (c === "V") { y = (rel ? y : 0) + n(0); i += 1; }
    else if (c === "C") { x = (rel ? x : 0) + n(4); y = (rel ? y : 0) + n(5); i += 6; }
    else if (c === "S" || c === "Q") { x = (rel ? x : 0) + n(2); y = (rel ? y : 0) + n(3); i += 4; }
    else if (c === "A") { x = (rel ? x : 0) + n(5); y = (rel ? y : 0) + n(6); i += 7; }
    else i += 1;
  }
  return desde ? { desde, hasta: [x, y] } : null;
}

/** Extrae la estructura del primer SVG del documento: nodos, aristas marcadas y capas. */
export function estructuraDeSvg(svg: string): EstructuraDiagrama {
  const limites = limitesSvg(svg);
  const html = limites ? svg.slice(...limites) : svg;
  const vb = /viewBox\s*=\s*["']([^"']+)["']/i.exec(html)?.[1].split(/[\s,]+/).map(Number) ?? [];
  const ancho = vb.length === 4 && vb[2] > 0 ? vb[2] : 1000;
  const alto = vb.length === 4 && vb[3] > 0 ? vb[3] : 600;
  const defs = rangos(html, "defs");
  const textos = leerTextos(html, defs);
  const rects = leerRects(html, defs);
  const esBanda = (r: RectLeido) => r.ancho >= ancho * 0.5 && r.alto >= 24 && r.alto <= 140;
  const esZona = (r: RectLeido) => !esBanda(r) && r.ancho >= 100 && r.alto >= 80 && r.ancho <= ancho * 0.9 && /rgba?\([^)]*?\.\d+\)/i.test(r.fill);
  const bandas = rects.filter((r) => esBanda(r) || esZona(r));
  const usados = new Set<string>();
  const idUnico = (base: string) => {
    const b = base || "capa";
    let id = b, k = 2;
    while (usados.has(id)) id = `${b}-${k++}`;
    usados.add(id);
    return id;
  };
  const nodos: NodoDiagrama[] = [];
  const indice = new Map<NodoDiagrama, number>();
  for (const r of rects) {
    if (bandas.includes(r) || r.ancho < 18 || r.alto < 16) continue;
    const n: NodoDiagrama = { id: r.id || `n${nodos.length + 1}`, tipo: "rect", x: r.x, y: r.y, ancho: r.ancho, alto: r.alto, texto: "", capa: null };
    nodos.push(n);
    indice.set(n, r.i);
  }
  for (const m of html.matchAll(/<circle\b([^>]*)>/gi)) {
    const i = m.index ?? 0;
    if (defs.some(([a, b]) => i >= a && i < b)) continue;
    const a = atributos(m[1]), r = numero(a.r);
    if (r < 3) continue;
    const n: NodoDiagrama = { id: a.id || `n${nodos.length + 1}`, tipo: "circulo", x: numero(a.cx), y: numero(a.cy), ancho: r * 2, alto: r * 2, texto: "", capa: null };
    nodos.push(n);
    indice.set(n, i);
  }
  const grupos = gruposDeCapa(html);
  const capas: CapaDiagrama[] = bandas.map((b) => ({ id: idUnico(b.id || "banda"), nombre: "", nodos: [], x: b.x - b.ancho / 2, y: b.y - b.alto / 2, ancho: b.ancho, alto: b.alto }));
  const capaDeGrupo = new Map<string, CapaDiagrama>();
  for (const g of grupos) {
    const caja = rects.filter((r) => r.i >= g.inicio && r.i < g.fin);
    if (!caja.length) continue;
    const x = Math.min(...caja.map((r) => r.x - r.ancho / 2)), y = Math.min(...caja.map((r) => r.y - r.alto / 2));
    const x2 = Math.max(...caja.map((r) => r.x + r.ancho / 2)), y2 = Math.max(...caja.map((r) => r.y + r.alto / 2));
    const c: CapaDiagrama = { id: idUnico(g.id), nombre: g.id, nodos: [], x, y, ancho: x2 - x, alto: y2 - y };
    capas.push(c);
    capaDeGrupo.set(g.id, c);
  }
  const nombres = new Map<CapaDiagrama, string[]>();
  for (const t of textos) {
    const dueno = nodos.filter((n) => contiene(n, t)).sort((a, b) => a.ancho * a.alto - b.ancho * b.alto)[0];
    if (dueno) { dueno.texto = dueno.texto ? `${dueno.texto} · ${t.texto}` : t.texto; continue; }
    const capa = capas.filter((c) => contiene(c, t)).sort((a, b) => a.ancho * a.alto - b.ancho * b.alto)[0];
    if (capa) { nombres.set(capa, [...(nombres.get(capa) ?? []), t.texto]); continue; }
    if (t.tam < 11) continue;
    const n: NodoDiagrama = { id: `n${nodos.length + 1}`, tipo: "texto", x: t.x, y: t.y, ancho: Math.max(10, t.texto.length * t.tam * 0.55), alto: t.tam * 1.6, texto: t.texto, capa: null };
    nodos.push(n);
    indice.set(n, t.i);
  }
  capas.forEach((c, i) => { c.nombre = (nombres.get(c) ?? []).join(" · ") || c.nombre || `Capa ${i + 1}`; });
  for (const n of nodos) {
    const capa = capas.find((c) => contiene(c, n));
    if (capa) { n.capa = capa.id; capa.nodos.push(n.id); continue; }
    const i = indice.get(n) ?? -1;
    const g = grupos.filter((gp) => i >= gp.inicio && i < gp.fin).sort((a, b) => (a.fin - a.inicio) - (b.fin - b.inicio))[0];
    const c = g ? capaDeGrupo.get(g.id) : undefined;
    if (c) { n.capa = c.id; c.nodos.push(n.id); }
  }
  const aristas: AristaDiagrama[] = [];
  const vistas = new Set<string>();
  const nodoEn = (x: number, y: number): NodoDiagrama | null => {
    let mejor: NodoDiagrama | null = null, dmin = Infinity;
    for (const n of nodos) {
      const dx = Math.max(n.x - n.ancho / 2 - x, 0, x - n.x - n.ancho / 2);
      const dy = Math.max(n.y - n.alto / 2 - y, 0, y - n.y - n.alto / 2);
      const d = Math.hypot(dx, dy);
      if (d < dmin) { dmin = d; mejor = n; }
    }
    return dmin <= 32 ? mejor : null;
  };
  const unir = (a: Vec2D, b: Vec2D, id: string) => {
    const desde = nodoEn(...a), hasta = nodoEn(...b);
    if (!desde || !hasta || desde.id === hasta.id) return;
    const clave = `${desde.id}>${hasta.id}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    aristas.push({ id: id || `a${aristas.length + 1}`, desde: desde.id, hasta: hasta.id });
  };
  for (const m of html.matchAll(/<(line|path)\b([^>]*)>/gi)) {
    const i = m.index ?? 0;
    if (defs.some(([a, b]) => i >= a && i < b)) continue;
    const a = atributos(m[2]);
    const fin = !!a["marker-end"], inicio = !!a["marker-start"];
    if (!fin && !inicio) continue;
    if (m[1].toLowerCase() === "line") {
      const p: Vec2D = [numero(a.x1), numero(a.y1)], q: Vec2D = [numero(a.x2), numero(a.y2)];
      unir(inicio && !fin ? q : p, inicio && !fin ? p : q, a.id ?? "");
    } else {
      const ext = extremosPath(a.d ?? "");
      if (ext) unir(inicio && !fin ? ext.hasta : ext.desde, inicio && !fin ? ext.desde : ext.hasta, a.id ?? "");
    }
  }
  return { nodos, aristas, capas, ancho, alto };
}

const ESCALA = 1 / 90;
/** Paleta armónica del OS: familia Trinity con φ, sin colores nuevos inventados. */
const PALETA = ["#7C5CFF", "#14B8A6", "#FFBF00", "#DC143C", "#007FFF", "#10B981", "#A855F7", "#F97316"];
const red = (n: number) => Math.round(n * 1000) / 1000;
const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function filasDeNodos(nodos: NodoDiagrama[]): CapaDiagrama[] {
  const filas: NodoDiagrama[][] = [];
  for (const n of [...nodos].sort((a, b) => a.y - b.y)) {
    const fila = filas.find((f) => Math.abs(f[0].y - n.y) <= Math.max(28, n.alto));
    if (fila) fila.push(n);
    else filas.push([n]);
  }
  return filas.map((f, i) => {
    const x = Math.min(...f.map((n) => n.x - n.ancho / 2)), y = Math.min(...f.map((n) => n.y - n.alto / 2));
    const x2 = Math.max(...f.map((n) => n.x + n.ancho / 2)), y2 = Math.max(...f.map((n) => n.y + n.alto / 2));
    return { id: `fila-${i + 1}`, nombre: f.map((n) => n.texto).filter(Boolean).join(" · ") || `Nivel ${i + 1}`, nodos: f.map((n) => n.id), x, y, ancho: x2 - x, alto: y2 - y };
  });
}

function aristas3D(aristas: AristaDiagrama[], nodos: Nodo3D[]): Arista3D[] {
  const porId = new Map(nodos.map((n) => [n.id, n.pos]));
  const out: Arista3D[] = [];
  for (const a of aristas) {
    const desde = porId.get(a.desde), hasta = porId.get(a.hasta);
    if (desde && hasta) out.push({ id: a.id, desde, hasta });
  }
  return out;
}

/** Coloca la estructura en 3D según el tipo de diagrama. */
export function escena3d(estructura: EstructuraDiagrama, tipo: TipoEscenaDiagrama = "grafo"): Escena3D {
  const { ancho, alto, nodos, aristas, capas } = estructura;
  const mx = (x: number) => red((x - ancho / 2) * ESCALA);
  const my = (y: number) => red((alto / 2 - y) * ESCALA);
  const tamano = (n: NodoDiagrama): Vec3D => [
    red(acotar(n.ancho * ESCALA, 0.4, 4)),
    red(acotar(n.alto * ESCALA, 0.22, 3)),
    red(acotar(Math.min(n.ancho, n.alto) * ESCALA * 0.12, 0.12, 0.4)),
  ];
  const color = (n: NodoDiagrama, i: number) => {
    const idx = capas.findIndex((c) => c.id === n.capa);
    return PALETA[(idx >= 0 ? idx : i) % PALETA.length];
  };
  if (tipo === "grafo") {
    const rmax = Math.max(0.4, ...nodos.map((n) => Math.hypot(...tamano(n)) / 2));
    const radio = Math.max(2.6, rmax * Math.sqrt(Math.max(1, nodos.length)) * 2);
    const oro = Math.PI * (3 - Math.sqrt(5));
    const puestos: Nodo3D[] = nodos.map((n, i) => {
      const y = nodos.length <= 1 ? 0 : 1 - (2 * i) / (nodos.length - 1);
      const r = Math.sqrt(Math.max(0, 1 - y * y)), a = oro * i;
      return {
        id: n.id, texto: n.texto,
        pos: [red(Math.cos(a) * r * radio), red(y * radio * 0.72), red(Math.sin(a) * r * radio)],
        tamano: tamano(n), color: color(n, i), capa: n.capa, billboard: n.texto.trim().length > 0,
      };
    });
    return { tipo, nodos: puestos, aristas: aristas3D(aristas, puestos), separacion: red(radio) };
  }
  const grupos = capas.length >= 2 ? capas : filasDeNodos(nodos);
  const orden = [...grupos].sort((a, b) => b.y - a.y);
  const zDe = new Map<string, number>();
  let z = 0;
  for (const c of orden) {
    const paso = acotar(c.alto * ESCALA * 0.55, 0.22, 1.6) * (tipo === "despiece" ? 2.4 : tipo === "planta" ? 0.8 : 1.15);
    zDe.set(c.id, z + paso / 2);
    z += paso;
  }
  const separacion = grupos.length > 1 ? red(z / (grupos.length - 1)) : 0;
  if (tipo === "capas") {
    const puestos: Nodo3D[] = orden.map((c, i) => ({
      id: `capa:${c.id}`, texto: c.nombre,
      pos: [mx(c.x + c.ancho / 2), my(c.y + c.alto / 2), red(zDe.get(c.id) ?? 0)],
      tamano: [red(acotar(c.ancho * ESCALA * 0.92, 0.8, 9)), red(acotar(c.alto * ESCALA * 0.5, 0.3, 3)), 0.14],
      color: PALETA[i % PALETA.length], capa: c.id, billboard: c.nombre.trim().length > 0,
    }));
    return { tipo, nodos: puestos, aristas: [], separacion };
  }
  const capaDe = new Map<string, CapaDiagrama>();
  for (const c of grupos) for (const id of c.nodos) capaDe.set(id, c);
  const puestos: Nodo3D[] = nodos.map((n, i) => {
    const c = capaDe.get(n.id) ?? grupos.find((g) => g.id === n.capa);
    const t = tamano(n);
    return {
      id: n.id, texto: n.texto,
      pos: [mx(n.x), my(n.y), red(zDe.get(c?.id ?? "") ?? 0)],
      tamano: tipo === "planta" ? [t[0], t[1], 0.05] : t,
      color: color(n, i), capa: n.capa, billboard: n.texto.trim().length > 0,
    };
  });
  return { tipo, nodos: puestos, aristas: aristas3D(aristas, puestos), separacion };
}
