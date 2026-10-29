// Estructura de un SVG de Diagram Design → escena 3D/XR. Módulo PURO: sin DOM, sin red
// ni disco. Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/),
// citada en architecture/diagramas.md §3-4.
export type TipoDiagrama3d = "capas" | "despiece" | "planta" | "grafo";
export type FormaSvg = "rect" | "circulo" | "texto"; export type Vec3 = [number, number, number];
export interface NodoSvg { id: string; forma: FormaSvg; texto: string; x: number; y: number; ancho: number; alto: number; capa: string | null; focal: boolean } export interface AristaSvg { id: string; desde: string | null; hasta: string | null; etiqueta: string } export interface CapaSvg { id: string; etiqueta: string; orden: number; nodos: string[] }
export interface EstructuraSvg { nodos: NodoSvg[]; aristas: AristaSvg[]; capas: CapaSvg[]; ancho: number; alto: number }
export interface Nodo3d { id: string; texto: string; posicion: Vec3; tamano: Vec3; color: string; focal: boolean; billboard: true } export interface Arista3d { id: string; desde: Vec3; hasta: Vec3 }
export interface Escena3d { tipo: TipoDiagrama3d; nodos: Nodo3d[]; aristas: Arista3d[]; capas: { id: string; etiqueta: string; z: number; separacion: number }[]; camara: Vec3; textos: "billboard" } type Texto = { x: number; y: number; ancho: number; alto: number; texto: string; tam: number; capa: string | null };
const ACENTO = "#FFBF00", BASE = "#007FFF", ESCALA = 10, PALETA = ["#007FFF", "#10B981", "#FFBF00", "#DC143C"];
function atributos(cadena: string): Record<string, string> {
  const salida: Record<string, string> = {}, re = /([\w:-]+)\s*=\s*"([^"]*)"/g; let m: RegExpExecArray | null;
  while ((m = re.exec(cadena)) !== null) salida[m[1].toLowerCase()] = m[2];
  return salida;
}
function numero(valor: string | undefined, porDefecto = 0): number { const n = Number.parseFloat(valor ?? ""); return Number.isFinite(n) ? n : porDefecto; } function dimension(valor: string | undefined, base: number): number { const n = numero(valor); return valor?.trim().endsWith("%") ? (base * n) / 100 : n; }
function textoPlano(html: string): string { return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim(); }
function esCapa(attrs: Record<string, string>): boolean { return /(?:^|[\s_-])(capa|layer)/i.test(`${attrs.id ?? ""} ${attrs.class ?? ""}`) || /^l\d+$/i.test(attrs.id ?? ""); } function extremosPath(d: string): { inicio: [number, number]; fin: [number, number] } | null {
  let x = 0, y = 0, inicio: [number, number] | null = null;
  const re = /([A-Za-z])([^A-Za-z]*)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const c = m[1].toUpperCase(), nums = (m[2].match(/-?\d*\.?\d+/g) || []).map(Number), rel = m[1] !== c;
    if (c === "H" && nums.length) x = rel ? x + nums[nums.length - 1] : nums[nums.length - 1];
    else if (c === "V" && nums.length) y = rel ? y + nums[nums.length - 1] : nums[nums.length - 1];
    else if (c !== "Z" && nums.length >= 2) { const px = nums[nums.length - 2], py = nums[nums.length - 1]; x = rel ? x + px : px; y = rel ? y + py : py; }
    if (!inicio) inicio = [x, y];
  }
  return inicio ? { inicio, fin: [x, y] as [number, number] } : null;
}
function textosDeSvg(svg: string): Texto[] {
  const salida: Texto[] = [], re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const attrs = atributos(m[1] || ""), texto = textoPlano(m[2] || ""), tam = numero(attrs["font-size"], 12), x = numero(attrs.x), y = numero(attrs.y);
    if (texto && tam <= 24) salida.push({ x: x - tam * texto.length * 0.3, y: y - tam, ancho: tam * texto.length * 0.6, alto: tam * 1.2, texto, tam, capa: null });
  }
  return salida;
}
export function estructuraDeSvg(svg: string): EstructuraSvg {
  const vb = atributos((svg.match(/<svg\b([^>]*)>/i) || [])[1] || "")["viewbox"] || "";
  const numsVb = vb.split(/[\s,]+/).map(Number), ancho = numsVb[2] || 1000, alto = numsVb[3] || 600;
  const nodos: NodoSvg[] = [], tramos: { id: string; inicio: [number, number]; fin: [number, number] }[] = [], pila: (string | null)[] = [], ordenCapas: string[] = [];
  const capaActual = () => { for (let i = pila.length - 1; i >= 0; i--) if (pila[i]) return pila[i]; return null; };
  const re = /<(\/?)(g|rect|circle|path|line)\b([^>]*?)(\/?)>/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const cierre = m[1] === "/", etiqueta = m[2].toLowerCase(), attrs = atributos(m[3] || "");
    if (etiqueta === "g") {
      if (cierre) pila.pop();
      else { const capa = esCapa(attrs) ? (attrs.id || `capa-${ordenCapas.length + 1}`) : null; if (capa && !ordenCapas.includes(capa)) ordenCapas.push(capa); pila.push(capa); }
      continue;
    }
    if (cierre) continue;
    if (etiqueta === "rect" || etiqueta === "circle") {
      const forma: FormaSvg = etiqueta === "rect" ? "rect" : "circulo", r = numero(attrs.r);
      const an = etiqueta === "rect" ? dimension(attrs.width, ancho) : r * 2, al = etiqueta === "rect" ? dimension(attrs.height, alto) : r * 2;
      const x = etiqueta === "rect" ? dimension(attrs.x, ancho) : numero(attrs.cx) - r, y = etiqueta === "rect" ? dimension(attrs.y, alto) : numero(attrs.cy) - r;
      if ((an >= ancho * 0.98 && al >= alto * 0.98) || an < 20 || al < 20) continue;
      const marca = `${attrs.fill ?? ""} ${attrs.stroke ?? ""} ${attrs.class ?? ""}`;
      nodos.push({ id: attrs.id || `${forma}-${nodos.length + 1}`, forma, texto: "", x, y, ancho: an, alto: al, capa: capaActual(), focal: /bf4520|accent|focal/i.test(marca) });
      continue;
    }
    if (!attrs["marker-end"] && !attrs["marker-start"]) continue;
    const extremos = etiqueta === "line"
      ? { inicio: [numero(attrs.x1), numero(attrs.y1)] as [number, number], fin: [numero(attrs.x2), numero(attrs.y2)] as [number, number] }
      : extremosPath(attrs.d || "");
    if (!extremos) continue;
    tramos.push({ id: attrs.id || `arista-${tramos.length + 1}`, inicio: extremos.inicio, fin: extremos.fin });
  }
  agruparTextos(nodos, textosDeSvg(svg));
  const buscar = (p: [number, number]) => nodos.find((n) => p[0] >= n.x - 8 && p[0] <= n.x + n.ancho + 8 && p[1] >= n.y - 8 && p[1] <= n.y + n.alto + 8)?.id ?? null;
  const aristas: AristaSvg[] = tramos.map((t) => ({ id: t.id, desde: buscar(t.inicio), hasta: buscar(t.fin), etiqueta: "" }));
  return { nodos, aristas, capas: deducirCapas(nodos, ordenCapas, ancho), ancho, alto };
}
function agruparTextos(nodos: NodoSvg[], textos: Texto[]): void {
  const tam = new Map<string, number>();
  for (const t of textos) {
    const cx = t.x + t.ancho / 2, cy = t.y + t.alto / 2, caja = nodos.find((n) => cx >= n.x && cx <= n.x + n.ancho && cy >= n.y && cy <= n.y + n.alto);
    if (caja) { if (t.tam > (tam.get(caja.id) ?? 0)) { caja.texto = t.texto; tam.set(caja.id, t.tam); } }
    else if (t.tam >= 13 && t.texto.length > 2) nodos.push({ id: `texto-${nodos.length + 1}`, forma: "texto", texto: t.texto, x: t.x, y: t.y, ancho: t.ancho, alto: t.alto, capa: t.capa, focal: false });
  }
}
function deducirCapas(nodos: NodoSvg[], ordenCapas: string[], ancho: number): CapaSvg[] {
  if (ordenCapas.length) return ordenCapas.map((id, i) => ({ id, etiqueta: id, orden: i, nodos: nodos.filter((n) => n.capa === id).map((n) => n.id) }));
  const filas = new Map<number, NodoSvg[]>(); for (const n of nodos) { const clave = Math.round(n.y / 4) * 4; filas.set(clave, [...(filas.get(clave) ?? []), n]); }
  const bandas = [...filas.entries()].filter(([, ns]) => ns.some((n) => n.ancho >= ancho * 0.5)).sort((a, b) => a[0] - b[0]);
  if (bandas.length < 2) return [];
  return bandas.map(([, ns], i) => ({ id: `fila-${i + 1}`, etiqueta: ns[0]?.texto || `Capa ${i + 1}`, orden: i, nodos: ns.map((n) => n.id) }));
}
function repartir(ns: NodoSvg[]): Nodo3d[] {
  if (!ns.length) return [];
  const esc = ns.map((x) => [Math.max(x.ancho * 0.01, 0.18), Math.max(x.alto * 0.01, 0.18), 0.16] as Vec3);
  const lado = Math.max(...esc.map((t) => Math.max(t[0], t[1]))), paso = Math.max(0.6, lado * 1.5);
  const cubo = Math.max(1, Math.ceil(Math.cbrt(ns.length))), fondo = Math.ceil(ns.length / (cubo * cubo));
  return ns.map((x, i) => {
    const ix = i % cubo, iy = Math.floor(i / cubo) % cubo, iz = Math.floor(i / (cubo * cubo));
    return { id: x.id, texto: x.texto || x.id, posicion: [(ix - (cubo - 1) / 2) * paso, (iy - (cubo - 1) / 2) * paso, (iz - (fondo - 1) / 2) * paso], tamano: esc[i], color: x.focal ? ACENTO : BASE, focal: x.focal, billboard: true };
  });
}
export function escena3d(estructura: EstructuraSvg, tipo: TipoDiagrama3d): Escena3d {
  const escala = ESCALA / Math.max(estructura.ancho || 1, estructura.alto || 1);
  const centro = (n: NodoSvg): Vec3 => [(n.x + n.ancho / 2 - estructura.ancho / 2) * escala, (estructura.alto / 2 - (n.y + n.alto / 2)) * escala, 0];
  const tamano = (n: NodoSvg): Vec3 => [Math.max(n.ancho * escala, 0.18), Math.max(n.alto * escala, 0.18), 0.16];
  const aristas = (nodos: Nodo3d[]): Arista3d[] => {
    const porId = new Map(nodos.map((n) => [n.id, n]));
    return estructura.aristas.map((a) => ({ id: a.id, desde: (a.desde && porId.get(a.desde)?.posicion) || [0, 0, 0], hasta: (a.hasta && porId.get(a.hasta)?.posicion) || [0, 0, 0] }));
  };
  if (tipo === "grafo") { const nodos = repartir(estructura.nodos); return { tipo, nodos, aristas: aristas(nodos), capas: [], camara: [0, 3, ESCALA * 1.8], textos: "billboard" }; }
  const capas = estructura.capas.length ? estructura.capas : [{ id: "capa-1", etiqueta: "Diagrama", orden: 0, nodos: estructura.nodos.map((n) => n.id) }];
  const altoMax = Math.max(0.3, ...estructura.nodos.map((n) => n.alto * escala));
  const sep = altoMax * (tipo === "despiece" ? 2.2 : tipo === "planta" ? 1.35 : 1.1), nodos: Nodo3d[] = [];
  const capas3d = capas.map((capa, i) => {
    const z = (i - (capas.length - 1) / 2) * sep;
    for (const id of capa.nodos) {
      const n = estructura.nodos.find((x) => x.id === id); if (!n) continue;
      const p = centro(n), ax = tipo === "planta" ? z * 0.45 : 0, ay = tipo === "planta" ? -z * 0.28 : 0;
      nodos.push({ id: n.id, texto: n.texto || n.id, posicion: [p[0] + ax, p[1] + ay, z], tamano: tamano(n), color: n.focal ? ACENTO : PALETA[i % PALETA.length], focal: n.focal, billboard: true });
    }
    return { id: capa.id, etiqueta: capa.etiqueta, z, separacion: sep };
  });
  return { tipo, nodos, aristas: aristas(nodos), capas: capas3d, camara: [ESCALA * 0.7, ESCALA * 0.5, ESCALA * 1.5], textos: "billboard" };
}
