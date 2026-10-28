// Diagrama 3D puro: de la estructura de un SVG a una escena que se gira y se recorre.
// Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/,
// assets/example-layers.html y example-architecture.html), citada en architecture/diagramas.md §3 y §4.
export type FormaSvg = "rect" | "circulo" | "texto";
export type TipoEscena = "capas" | "despiece" | "axonometrica" | "grafo" | "arbol" | "flujo" | "red";
export interface NodoSvg { id: string; etiqueta: string; forma: FormaSvg; x: number; y: number; ancho: number; alto: number; capa?: string }
export interface AristaSvg { id: string; fuente: string; destino: string; x1: number; y1: number; x2: number; y2: number; etiqueta: string }
export interface CapaSvg { id: string; etiqueta: string; nodos: string[] }
export interface EstructuraSvg { nodos: NodoSvg[]; aristas: AristaSvg[]; capas: CapaSvg[]; textos: string[]; ancho: number; alto: number }
export interface Nodo3D { id: string; etiqueta: string; forma: FormaSvg; pos: [number, number, number]; tamano: [number, number, number]; color: string; capa?: string; miraCamara: boolean }
export interface Arista3D { id: string; fuente: string; destino: string }
export interface Escena3D { tipo: string; nodos: Nodo3D[]; aristas: Arista3D[]; separacion: number; radio: number; miraCamara: boolean }
const PALETA = ["#00F0FF", "#7C5CFF", "#FFBF00", "#10B981", "#DC143C", "#F08A59"];
const CAPA = /capa|layer|grupo|group|nivel/i, NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const attr = (attrs: string, clave: string): string | undefined =>
  new RegExp(`(?:^|\\s)${clave}\\s*=\\s*["']([^"']*)["']`, "i").exec(attrs)?.[1];
const num = (valor: string | undefined, def = 0): number => {
  const n = Number.parseFloat(valor ?? ""); return Number.isFinite(n) ? n : def;
};
const limpiarTexto = (texto: string): string => texto.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
interface TextoSvg { x: number; y: number; texto: string; fuente: number }
interface Tramo { capa: CapaSvg; desde: number }
/** Extremos de un `d` de path sin DOM: primera M y punto final, con comandos absolutos y relativos. */
function extremos(d: string): [number, number, number, number] | null {
  const tramos = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? [];
  let x = 0, y = 0, sx = 0, sy = 0, inicio: [number, number] | null = null;
  for (const t of tramos) {
    const c = t[0], rel = c === c.toLowerCase(), mayus = c.toUpperCase(), n = (t.slice(1).match(NUM) ?? []).map(Number);
    if (mayus === "M" || mayus === "L") { for (let i = 0; i + 1 < n.length; i += 2) { x = rel ? x + n[i] : n[i]; y = rel ? y + n[i + 1] : n[i + 1]; if (!inicio) inicio = [x, y]; } if (mayus === "M") { sx = x; sy = y; } }
    else if (mayus === "H") for (const v of n) x = rel ? x + v : v;
    else if (mayus === "V") for (const v of n) y = rel ? y + v : v;
    else if (mayus === "Z") { x = sx; y = sy; }
    else { const k = ({ C: 6, S: 4, Q: 4, T: 2, A: 7 } as Record<string, number>)[mayus] ?? 2; for (let i = 0; i + k <= n.length; i += k) { x = rel ? x + n[i + k - 2] : n[i + k - 2]; y = rel ? y + n[i + k - 1] : n[i + k - 1]; } }
  }
  return inicio ? [inicio[0], inicio[1], x, y] : null;
}
const centro = (n: NodoSvg): [number, number] => [n.x + n.ancho / 2, n.y + n.alto / 2];
const distancia2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;
export function estructuraDeSvg(svg: string): EstructuraSvg {
  const vista = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number) ?? [];
  const ancho = vista[2] || 1000, alto = vista[3] || 600;
  const nodos: NodoSvg[] = [], capas: CapaSvg[] = [], textos: TextoSvg[] = [], marcos: (Tramo | null)[] = [], etiquetas = new Map<string, number>();
  const aristas: { id: string; x1: number; y1: number; x2: number; y2: number; etiqueta: string }[] = [];
  const etiquetaTexto = (attrs: string): string => limpiarTexto(attr(attrs, "aria-label") ?? attr(attrs, "data-nombre") ?? "");
  const capaActual = (): CapaSvg | undefined => [...marcos].reverse().find((m): m is Tramo => !!m)?.capa;
  const textosSvg = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi; let tm: RegExpExecArray | null;
  while ((tm = textosSvg.exec(svg)) !== null) { const texto = limpiarTexto(tm[2]); if (texto) textos.push({ x: num(attr(tm[1], "x")), y: num(attr(tm[1], "y")), texto, fuente: num(attr(tm[1], "font-size"), 10) }); }
  const etiquetasSvg = /<(\/?)(rect|circle|line|path|g)\b([^>]*)>/gi; let m: RegExpExecArray | null;
  while ((m = etiquetasSvg.exec(svg)) !== null) {
    const cierre = m[1] === "/", tag = m[2].toLowerCase(), attrs = m[3];
    if (tag === "g") {
      if (cierre) marcos.pop();
      else {
        const id = attr(attrs, "id") ?? "", clase = attr(attrs, "class") ?? "";
        const capa = id || CAPA.test(clase) || CAPA.test(attr(attrs, "data-capa") ?? "") ? { id: id || `capa-${capas.length}`, etiqueta: etiquetaTexto(attrs) || id, nodos: [] } : null;
        if (capa) capas.push(capa); marcos.push(capa ? { capa, desde: m.index } : null);
      }
      continue;
    }
    if (tag === "rect") {
      const wr = attr(attrs, "width") ?? "", hr = attr(attrs, "height") ?? "";
      if (/%/.test(wr) || /%/.test(hr) || /url\(/i.test(attr(attrs, "fill") ?? "")) continue;
      const w = num(wr), h = num(hr); if (w < 8 || h < 8) continue;
      const nodo: NodoSvg = { id: attr(attrs, "id") ?? `n-${nodos.length}`, etiqueta: etiquetaTexto(attrs), forma: "rect", x: num(attr(attrs, "x")), y: num(attr(attrs, "y")), ancho: w, alto: h };
      const capa = capaActual(); if (capa) { nodo.capa = capa.id; capa.nodos.push(nodo.id); } nodos.push(nodo);
    } else if (tag === "circle") {
      const r = num(attr(attrs, "r")); if (r < 3) continue;
      const nodo: NodoSvg = { id: attr(attrs, "id") ?? `n-${nodos.length}`, etiqueta: etiquetaTexto(attrs), forma: "circulo", x: num(attr(attrs, "cx")) - r, y: num(attr(attrs, "cy")) - r, ancho: r * 2, alto: r * 2 };
      const capa = capaActual(); if (capa) { nodo.capa = capa.id; capa.nodos.push(nodo.id); } nodos.push(nodo);
    } else if (attr(attrs, "marker-end") || attr(attrs, "marker-start")) {
      const e = tag === "path" ? extremos(attr(attrs, "d") ?? "") : null;
      aristas.push({ id: attr(attrs, "id") ?? `a-${aristas.length}`, x1: e ? e[0] : num(attr(attrs, "x1")), y1: e ? e[1] : num(attr(attrs, "y1")), x2: e ? e[2] : num(attr(attrs, "x2")), y2: e ? e[3] : num(attr(attrs, "y2")), etiqueta: etiquetaTexto(attrs) });
    }
  }
  for (const t of textos) {
    const dentro = nodos.filter((n) => t.x >= n.x - 3 && t.x <= n.x + n.ancho + 3 && t.y >= n.y - 3 && t.y <= n.y + n.alto + 3);
    if (dentro.length) {
      const n = dentro.sort((a, b) => a.ancho * a.alto - b.ancho * b.alto)[0];
      if (t.fuente > (etiquetas.get(n.id) ?? -1)) { n.etiqueta = t.texto; etiquetas.set(n.id, t.fuente); }
    } else nodos.push({ id: `texto-${nodos.length}`, etiqueta: t.texto, forma: "texto", x: t.x - Math.max(8, t.texto.length * 3), y: t.y - 8, ancho: Math.max(16, t.texto.length * 6), alto: 16 });
  }
  const finales = nodos.filter((n) => n.forma === "texto" || !!n.etiqueta);
  const asignar = (x: number, y: number): string => {
    let mejor = "", d = Number.POSITIVE_INFINITY;
    for (const n of finales) { const [cx, cy] = centro(n), dd = distancia2(x, y, cx, cy); if (dd < d) { d = dd; mejor = n.id; } }
    return d <= 140 ** 2 ? mejor : "";
  };
  const resultado: AristaSvg[] = aristas.map((a) => ({ ...a, fuente: asignar(a.x1, a.y1), destino: asignar(a.x2, a.y2) }));
  for (const capa of capas) capa.nodos = capa.nodos.filter((id) => finales.some((n) => n.id === id));
  return { nodos: finales, aristas: resultado, capas, textos: textos.map((t) => t.texto), ancho, alto };
}
const ES_CAPAS = new Set(["capas", "despiece", "axonometrica", "pila", "stack", "exploded"]);
export function escena3d(estructura: EstructuraSvg, tipo: TipoEscena | string = "grafo"): Escena3D {
  const fuente = estructura.nodos;
  if (!fuente.length) return { tipo, nodos: [], aristas: [], separacion: 0, radio: 0, miraCamara: true };
  const escala = 10 / Math.max(estructura.ancho, estructura.alto, 1);
  const lado = (n: NodoSvg): [number, number, number] => [Math.max(0.2, n.ancho * escala), Math.max(0.2, n.alto * escala), 0.08];
  const color = (n: NodoSvg, i: number) => PALETA[(n.capa ? estructura.capas.findIndex((c) => c.id === n.capa) : i) % PALETA.length] ?? PALETA[0];
  if (ES_CAPAS.has(tipo)) {
    const orden = estructura.capas.filter((c) => c.nodos.length).map((c) => c.id);
    const ids = orden.length ? orden : [...fuente].sort((a, b) => a.y - b.y).map((n) => n.id);
    const separacion = Math.max(0.3, (fuente.reduce((s, n) => s + n.alto, 0) / fuente.length) * escala / 1.618);
    const z = new Map(ids.map((id, i) => [id, i * separacion]));
    const nodos = fuente.map((n, i): Nodo3D => ({ id: n.id, etiqueta: n.etiqueta, forma: n.forma, tamano: lado(n), color: color(n, i), capa: n.capa, miraCamara: true,
      pos: [(n.x + n.ancho / 2 - estructura.ancho / 2) * escala, -(n.y + n.alto / 2 - estructura.alto / 2) * escala, z.get(n.capa ?? n.id) ?? i * separacion] }));
    return { tipo, nodos, aristas: aristas3d(estructura, nodos), separacion, radio: Math.max(...nodos.map((n) => Math.abs(n.pos[2]))), miraCamara: true };
  }
  const n = fuente.length, angulo = Math.PI * (3 - Math.sqrt(5));
  const radio = n === 1 ? 0 : Math.max(2.4, Math.max(...fuente.map((x) => Math.max(x.ancho, x.alto) * escala)) * Math.sqrt(n) * 0.9);
  const nodos = fuente.map((nodo, i): Nodo3D => {
    const y = n === 1 ? 0 : 1 - ((i + 0.5) * 2) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), t = i * angulo;
    return { id: nodo.id, etiqueta: nodo.etiqueta, forma: nodo.forma, tamano: lado(nodo), color: color(nodo, i), capa: nodo.capa, miraCamara: true, pos: [Math.cos(t) * r * radio, y * radio, Math.sin(t) * r * radio] };
  });
  return { tipo, nodos, aristas: aristas3d(estructura, nodos), separacion: 0, radio, miraCamara: true };
}
function aristas3d(estructura: EstructuraSvg, nodos: Nodo3D[]): Arista3D[] {
  const ids = new Set(nodos.map((n) => n.id));
  return estructura.aristas.filter((a) => ids.has(a.fuente) && ids.has(a.destino) && a.fuente !== a.destino).map((a) => ({ id: a.id, fuente: a.fuente, destino: a.destino }));
}
