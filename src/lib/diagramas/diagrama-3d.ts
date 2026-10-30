// src/lib/diagramas/diagrama-3d.ts
// Del SVG de un diagrama (skill MIT diagram-design, vendor/habilidades/diagram-design/,
// citada en architecture/diagramas.md §3) a una escena 3D pura. Sin DOM, red ni disco.
// Capas, despiece y axonométrica se apilan en Z; los grafos se reparten en una esfera de
// Fibonacci sin solaparse. Los textos siempre miran a la cámara.
export type FormaNodo = "rect" | "circulo" | "texto";
export type TipoEscena = "capas" | "despiece" | "axonometrica" | "grafo";
export type Vec3 = [number, number, number];
export interface NodoSvg { id: string; etiqueta: string; forma: FormaNodo; x: number; y: number; ancho: number; alto: number; capa?: string }
export interface AristaSvg { id: string; de: string; a: string; marcador: boolean }
export interface CapaSvg { id: string; etiqueta: string; nodos: string[] }
export interface EstructuraDiagrama { nodos: NodoSvg[]; aristas: AristaSvg[]; capas: CapaSvg[]; ancho: number; alto: number }
export interface Nodo3D { id: string; texto: string; forma: FormaNodo; posicion: Vec3; tamano: Vec3; capa: string; caraCamara: boolean }
export interface Arista3D { id: string; de: string; a: string }
export interface Capa3D { id: string; etiqueta: string; z: number }
export interface Escena3D { tipo: TipoEscena; nodos: Nodo3D[]; aristas: Arista3D[]; capas: Capa3D[]; distancia: number }
interface Etiqueta { tag: string; attrs: string; cuerpo: string; indice: number }
interface RangoCapa { id: string; etiqueta: string; ini: number; fin: number }
const reNum = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const esNumero = (v: string) => /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(v.trim());
function atributo(attrs: string, clave: string): string { return attrs.match(new RegExp(`\\b${clave}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? ""; }
function numero(attrs: string, clave: string, def = 0): number { const n = parseFloat(atributo(attrs, clave)); return Number.isFinite(n) ? n : def; }
function textoLimpio(html: string): string { return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim(); }
function leerEtiquetas(svg: string, tag: string): Etiqueta[] {
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}>)`, "gi");
  const out: Etiqueta[] = [];
  for (let m = re.exec(svg); m; m = re.exec(svg)) out.push({ tag, attrs: m[1], cuerpo: m[2] ?? "", indice: m.index });
  return out;
}
function rangosDeCapa(svg: string): RangoCapa[] {
  const out: RangoCapa[] = [], re = /<g\b([^>]*(?:capa|layer)[^>]*)>([\s\S]*?)<\/g>/gi;
  for (let m = re.exec(svg); m; m = re.exec(svg)) out.push({ id: atributo(m[1], "id") || atributo(m[1], "class") || `capa-${out.length + 1}`, etiqueta: atributo(m[1], "aria-label") || atributo(m[1], "id") || `Capa ${out.length + 1}`, ini: m.index, fin: m.index + m[0].length });
  return out;
}
function puntosDePath(d: string): { ini: [number, number]; fin: [number, number] } | null {
  const re = /([MLHVCQmlhvcq])\s*([^MLHVCQmlhvcq]*)/g;
  let x = 0, y = 0, ini: [number, number] | null = null, m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const c = m[1].toUpperCase(), rel = m[1] !== c, n = (m[2].match(reNum) || []).map(Number);
    if ((c === "M" || c === "L") && n.length >= 2) { x = rel ? x + n[0] : n[0]; y = rel ? y + n[1] : n[1]; if (!ini) ini = [x, y]; }
    else if (c === "H" && n.length) x = rel ? x + n[0] : n[0];
    else if (c === "V" && n.length) y = rel ? y + n[0] : n[0];
    else if ((c === "Q" || c === "C") && n.length >= 2) { x = rel ? x + n[n.length - 2] : n[n.length - 2]; y = rel ? y + n[n.length - 1] : n[n.length - 1]; }
  }
  return ini ? { ini, fin: [x, y] } : null;
}
function nodoMasCercano(nodos: NodoSvg[], x: number, y: number): NodoSvg | null {
  const d = (n: NodoSvg) => (n.x + n.ancho / 2 - x) ** 2 + (n.y + n.alto / 2 - y) ** 2;
  return nodos.filter((n) => n.forma !== "texto").sort((a, b) => d(a) - d(b))[0] ?? null;
}
function capasEfectivas(e: EstructuraDiagrama): { capas: CapaSvg[]; nivel: Map<string, number> } {
  const nivel = new Map<string, number>();
  if (e.capas.length) { e.capas.forEach((c, i) => c.nodos.forEach((id) => nivel.set(id, i))); return { capas: e.capas, nivel }; }
  const ys = [...new Set(e.nodos.filter((n) => n.forma !== "texto").map((n) => Math.round(n.y)))].sort((a, b) => a - b);
  const capas = ys.map((y, i) => ({ id: `capa-${i}`, etiqueta: `Capa ${i + 1}`, nodos: e.nodos.filter((n) => Math.abs(n.y - y) < 1).map((n) => n.id) }));
  e.nodos.forEach((n) => {
    let mejor = 0;
    ys.forEach((y, i) => { if (Math.abs(n.y - y) < Math.abs(n.y - (ys[mejor] ?? y))) mejor = i; });
    nivel.set(n.id, mejor);
  });
  return { capas, nivel };
}
function clasificar(tipo: string): TipoEscena {
  const t = tipo.toLowerCase();
  return /(capa|layer|pila|stack)/.test(t) ? "capas" : /(despiece|explos|teardown)/.test(t) ? "despiece" : /(axonometr|planta|plano|isometric)/.test(t) ? "axonometrica" : "grafo";
}
function escenaApilada(e: EstructuraDiagrama, tipo: TipoEscena): Escena3D {
  const { capas, nivel } = capasEfectivas(e);
  const escala = 10 / Math.max(1, e.ancho, e.alto);
  const altoMax = Math.max(0.6, ...e.nodos.filter((n) => n.forma !== "texto").map((n) => n.alto * escala));
  const sep = Math.max(0.7, altoMax * 1.5);
  const nodos = e.nodos.map((n): Nodo3D => {
    const k = nivel.get(n.id) ?? 0, axo = tipo === "axonometrica" ? k * sep * 0.3 : 0;
    return { id: n.id, texto: n.etiqueta, forma: n.forma, capa: n.capa ?? "", caraCamara: true, posicion: [(n.x + n.ancho / 2 - e.ancho / 2) * escala + axo, (e.alto / 2 - n.y - n.alto / 2) * escala + axo * 0.5, k * sep], tamano: [Math.max(0.35, n.ancho * escala), Math.max(0.3, n.alto * escala), 0.12] };
  });
  return { tipo, nodos, aristas: e.aristas.map((a) => ({ id: a.id, de: a.de, a: a.a })), capas: capas.map((c, i) => ({ id: c.id, etiqueta: c.etiqueta, z: i * sep })), distancia: Math.max(7, 6 + capas.length * sep) };
}
function escenaGrafo(e: EstructuraDiagrama): Escena3D {
  const total = e.nodos.length || 1, radio = Math.max(3.2, Math.sqrt(total) * 1.7), escala = 10 / Math.max(1, e.ancho, e.alto);
  const nodos = e.nodos.map((n, i): Nodo3D => {
    const y = total === 1 ? 0 : 1 - (i / (total - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), phi = i * Math.PI * (3 - Math.sqrt(5));
    return { id: n.id, texto: n.etiqueta, forma: n.forma, capa: n.capa ?? "", caraCamara: true, posicion: total === 1 ? [0, 0, 0] : [Math.cos(phi) * r * radio, y * radio, Math.sin(phi) * r * radio], tamano: [Math.max(0.4, n.ancho * escala), Math.max(0.32, n.alto * escala), 0.12] };
  });
  return { tipo: "grafo", nodos, aristas: e.aristas.map((a) => ({ id: a.id, de: a.de, a: a.a })), capas: [], distancia: radio * 2.4 };
}
export function estructuraDeSvg(svg: string): EstructuraDiagrama {
  const v = (svg.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1].match(reNum) || []).map(Number);
  const ancho = v[2] > 0 ? v[2] : 1000, alto = v[3] > 0 ? v[3] : 600;
  const rangos = rangosDeCapa(svg), nodos: NodoSvg[] = [];
  let seq = 0;
  const capaDe = (i: number) => rangos.find((r) => i > r.ini && i < r.fin)?.id;
  const formas = [...leerEtiquetas(svg, "rect"), ...leerEtiquetas(svg, "circle")].sort((a, b) => a.indice - b.indice);
  for (const f of formas) {
    const esRect = f.tag === "rect";
    if (esRect && !esNumero(atributo(f.attrs, "width"))) continue;
    const r = numero(f.attrs, "r"), x = esRect ? numero(f.attrs, "x") : numero(f.attrs, "cx") - r, y = esRect ? numero(f.attrs, "y") : numero(f.attrs, "cy") - r;
    nodos.push({ id: atributo(f.attrs, "id") || `nodo-${++seq}`, etiqueta: "", forma: esRect ? "rect" : "circulo", x, y, ancho: esRect ? numero(f.attrs, "width") : r * 2, alto: esRect ? numero(f.attrs, "height") : r * 2, capa: capaDe(f.indice) });
  }
  for (const t of leerEtiquetas(svg, "text")) {
    const etiqueta = textoLimpio(t.cuerpo) || atributo(t.attrs, "aria-label");
    if (!etiqueta) continue;
    const x = numero(t.attrs, "x"), y = numero(t.attrs, "y");
    const host = nodos.find((n) => x >= n.x && x <= n.x + n.ancho && y >= n.y && y <= n.y + n.alto) ?? nodoMasCercano(nodos, x, y);
    if (host && !host.etiqueta) host.etiqueta = etiqueta;
    else if (!host) { const tam = numero(t.attrs, "font-size", 12); nodos.push({ id: atributo(t.attrs, "id") || `texto-${++seq}`, etiqueta, forma: "texto", x: x - etiqueta.length * tam * 0.3, y: y - tam, ancho: etiqueta.length * tam * 0.6, alto: tam * 1.2, capa: capaDe(t.indice) }); }
  }
  const aristas: AristaSvg[] = [];
  for (const c of [...leerEtiquetas(svg, "line"), ...leerEtiquetas(svg, "path")].sort((a, b) => a.indice - b.indice)) {
    if (!/marker-(?:end|start)\s*=\s*["']?\s*url\(/i.test(c.attrs)) continue;
    const p = c.tag === "line" ? { ini: [numero(c.attrs, "x1"), numero(c.attrs, "y1")] as [number, number], fin: [numero(c.attrs, "x2"), numero(c.attrs, "y2")] as [number, number] } : puntosDePath(atributo(c.attrs, "d"));
    if (!p) continue;
    const a = nodoMasCercano(nodos, p.ini[0], p.ini[1]), b = nodoMasCercano(nodos, p.fin[0], p.fin[1]);
    if (a && b && a.id !== b.id) aristas.push({ id: atributo(c.attrs, "id") || `arista-${aristas.length + 1}`, de: a.id, a: b.id, marcador: true });
  }
  return { nodos, aristas, capas: rangos.map((r) => ({ id: r.id, etiqueta: r.etiqueta, nodos: nodos.filter((n) => n.capa === r.id).map((n) => n.id) })), ancho, alto };
}
export function escena3d(estructura: EstructuraDiagrama, tipo = "grafo"): Escena3D {
  const clase = clasificar(tipo);
  return clase === "grafo" ? escenaGrafo(estructura) : escenaApilada(estructura, clase);
}
