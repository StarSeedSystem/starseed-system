// Estructura y escena 3D de un diagrama de Diagram Design (skill MIT en vendor/habilidades/diagram-design):
// nodos, aristas y capas del SVG; capas/despiece/planta se apilan en Z y los grafos se reparten en el espacio.
// Contrato: architecture/diagramas.md §3-5 y §4-L; amplía starseed-xr.md. Módulo PURO: sin DOM, red ni disco.
export type Punto2 = { x: number; y: number }; export type Punto3 = { x: number; y: number; z: number };
export interface Caja2 { x: number; y: number; ancho: number; alto: number }
export interface NodoDiagrama { id: string; etiqueta: string; detalle?: string; forma: "rect" | "circulo" | "texto"; caja: Caja2; capa?: string; focal: boolean }
export interface AristaDiagrama { id: string; puntos: Punto2[]; desde?: string; hasta?: string; marcador: boolean }
export interface CapaDiagrama { id: string; nombre: string; nodos: string[] }
export interface EstructuraDiagrama { ancho: number; alto: number; nodos: NodoDiagrama[]; aristas: AristaDiagrama[]; capas: CapaDiagrama[] }
export type TipoEscena3D = "capas" | "despiece" | "planta" | "grafo" | "red" | "arbol";
export interface Nodo3D { id: string; etiqueta: string; forma: NodoDiagrama["forma"]; posicion: Punto3; tamano: Punto3; capa?: string; focal: boolean }
export interface Texto3D { id: string; texto: string; posicion: Punto3; tamano: number; billboard: true } export interface Arista3D { id: string; puntos: Punto3[]; marcador: boolean }
export interface Capa3D { id: string; nombre: string; z: number; nodos: string[] } export interface Escena3D { tipo: TipoEscena3D; nodos: Nodo3D[]; textos: Texto3D[]; aristas: Arista3D[]; capas: Capa3D[]; camara: { posicion: Punto3; objetivo: Punto3; fov: number } }
type Atributos = Record<string, string>;
const num = (a: Atributos, k: string, d = 0) => { const v = parseFloat(a[k]); return Number.isFinite(v) ? v : d };
const alfa = (v = "") => { const m = /rgba?\([^)]*?[,/]\s*([\d.]+)\s*\)/i.exec(v); return m ? Number(m[1]) : 1 };
const centro = (c: Caja2) => ({ x: c.x + c.ancho / 2, y: c.y + c.alto / 2 }); const area = (c: Caja2) => c.ancho * c.alto;
const dentro = (c: Caja2, p: Punto2, margen = 0) => p.x >= c.x - margen && p.x <= c.x + c.ancho + margen && p.y >= c.y - margen && p.y <= c.y + c.alto + margen;
function atributos(tag: string): Atributos {
  const out: Atributos = {}, re = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g; let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? ""; return out;
}
/** Puntos absolutos de un `d` de SVG (M, L, H, V, Q y C: los que usan las plantillas). */
function puntosDe(d: string): Punto2[] {
  const t = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [], ps: Punto2[] = []; let i = 0, x = 0, y = 0, cmd = ""; const n = () => Number(t[i++]);
  while (i < t.length) {
    if (/^[a-z]$/i.test(t[i])) cmd = t[i++];
    const r = cmd === cmd.toLowerCase(), c = cmd.toUpperCase();
    if (c === "M" || c === "L") { const a = n(), b = n(); x = r ? x + a : a; y = r ? y + b : b; ps.push({ x, y }); }
    else if (c === "H") { const a = n(); x = r ? x + a : a; ps.push({ x, y }); }
    else if (c === "V") { const b = n(); y = r ? y + b : b; ps.push({ x, y }); }
    else if (c === "Q" || c === "C") { const k = c === "Q" ? 2 : 4; for (let j = 0; j < k; j++) n(); const a = n(), b = n(); x = r ? x + a : a; y = r ? y + b : b; ps.push({ x, y }); } else i++;
  }
  return ps;
}
/** Del HTML+SVG de la skill: nodos (rect/círculo con su texto), aristas con marcador y capas (`g`). */
export function estructuraDeSvg(svg: string): EstructuraDiagrama {
  const vb = (() => { const v = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svg)?.[1]; return v ? v.trim().split(/[\s,]+/).map(Number) : []; })();
  const ancho = vb[2] > 0 ? vb[2] : 1000, alto = vb[3] > 0 ? vb[3] : 600;
  const nodos: NodoDiagrama[] = [], aristas: AristaDiagrama[] = [], capas: CapaDiagrama[] = [], pila: (string | undefined)[] = [], vistos = new Set<string>();
  let dentroDefs = 0;
  for (const tag of svg.match(/<\/?[a-zA-Z][^>]*>/g) ?? []) {
    const cierre = /^<\//.test(tag), nombre = /^<\/?\s*([a-zA-Z]+)/.exec(tag)?.[1].toLowerCase() ?? "";
    if (nombre === "defs") { dentroDefs += cierre ? -1 : 1; continue; }
    if (dentroDefs > 0) continue;
    const a = atributos(tag), capa = pila[pila.length - 1];
    if (nombre === "g") {
      if (cierre) { pila.pop(); continue; }
      const marca = `${a.id ?? ""} ${a.class ?? ""}`, esCapa = /capa|layer|zona|zone|nivel|plano/i.test(marca), id = esCapa ? a.id || `capa-${capas.length + 1}` : capa;
      if (esCapa) capas.push({ id, nombre: a["aria-label"] || a.id || `Capa ${capas.length + 1}`, nodos: [] });
      pila.push(id); continue;
    }
    if (cierre) continue;
    if (nombre === "rect" || nombre === "circle") {
      const r = nombre === "circle" ? num(a, "r") : 0;
      const x = nombre === "rect" ? num(a, "x") : num(a, "cx") - r, y = nombre === "rect" ? num(a, "y") : num(a, "cy") - r, w = nombre === "rect" ? num(a, "width", NaN) : r * 2, h = nombre === "rect" ? num(a, "height", NaN) : r * 2, clave = `${nombre}:${x},${y},${w},${h}:${capa ?? ""}`;
      if (!(w >= 24 && h >= 20) || vistos.has(clave) || (alfa(a.fill) < 0.12 && alfa(a.stroke) < 0.5)) continue;
      vistos.add(clave); const id = a.id || `nodo-${nodos.length + 1}`;
      nodos.push({ id, etiqueta: "", forma: nombre === "circle" ? "circulo" : "rect", caja: { x, y, ancho: w, alto: h }, capa, focal: /bf4520|accent|focal/i.test(`${a.fill ?? ""} ${a.stroke ?? ""}`) });
      if (capa) capas.find((c) => c.id === capa)?.nodos.push(id);
    } else if ((nombre === "line" || nombre === "path") && /marker-(?:end|start)/i.test(tag)) {
      const pts = nombre === "line" ? [{ x: num(a, "x1"), y: num(a, "y1") }, { x: num(a, "x2"), y: num(a, "y2") }] : puntosDe(a.d ?? "");
      if (pts.length >= 2) aristas.push({ id: a.id || `arista-${aristas.length + 1}`, puntos: pts, marcador: true });
    }
  }
  const sueltos: { texto: string; size: number; y: number; caja: Caja2 }[] = [];
  for (const m of Array.from(svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text\s*>/gi))) {
    const a = atributos(m[1]), texto = m[2].replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
    if (!texto || alfa(a.fill) < 0.2) continue;
    const size = num(a, "font-size", 12), px = num(a, "x"), py = num(a, "y"), anchor = a["text-anchor"] ?? "start", w = texto.length * size * 0.55, x = anchor === "middle" ? px - w / 2 : anchor === "end" ? px - w : px;
    sueltos.push({ texto, size, y: py - size * 0.8, caja: { x, y: py - size * 0.8, ancho: w, alto: size * 1.1 } });
  }
  const etiquetas = new Map<string, { texto: string; size: number; y: number }[]>();
  for (const t of sueltos) {
    const duenio = nodos.filter((n) => n.forma !== "texto" && dentro(n.caja, centro(t.caja), 4)).sort((p, q) => area(p.caja) - area(q.caja))[0];
    if (!duenio) { if (t.size >= 10) nodos.push({ id: `texto-${nodos.length + 1}`, etiqueta: t.texto, forma: "texto", caja: t.caja, focal: false }); continue; }
    const lista = etiquetas.get(duenio.id) ?? []; lista.push({ texto: t.texto, size: t.size, y: t.y }); etiquetas.set(duenio.id, lista);
  }
  for (const n of nodos) {
    const ts = etiquetas.get(n.id); if (!ts?.length) { n.etiqueta = n.etiqueta || n.id; continue; }
    const orden = [...ts].sort((a, b) => b.size - a.size || a.y - b.y), resto = orden.slice(1).sort((a, b) => a.y - b.y).map((t) => t.texto);
    n.etiqueta = orden[0].texto; if (resto.length) n.detalle = resto.join(" · ");
  }
  for (const ar of aristas) {
    const busca = (p: Punto2) => nodos.find((n) => n.forma !== "texto" && dentro(n.caja, p, 12))?.id; ar.desde = busca(ar.puntos[0]); ar.hasta = busca(ar.puntos[ar.puntos.length - 1]);
  }
  return { ancho, alto, nodos, aristas, capas };
}
/** Separa en el espacio los centros más cercanos que `minimo` (determinista, sin azar). */
function separar(pos: Map<string, Punto3>, minimo: number, iteraciones = 24): void {
  const ids = [...pos.keys()];
  for (let it = 0; it < iteraciones; it++) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = pos.get(ids[i]), b = pos.get(ids[j]); if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 0.001; if (d >= minimo) continue;
    const k = ((minimo - d) / d) * 0.5; a.x -= dx * k; a.y -= dy * k; a.z -= dz * k; b.x += dx * k; b.y += dy * k; b.z += dz * k;
  }
}
/** Coloca la estructura: capas/despiece/planta apilados en Z; grafos repartidos en el espacio. */
export function escena3d(estructura: EstructuraDiagrama, tipo: TipoEscena3D = "grafo"): Escena3D {
  const k = 12 / Math.max(estructura.ancho, estructura.alto, 1), solidos = estructura.nodos.filter((n) => n.forma !== "texto");
  const esGrafo = tipo === "grafo" || tipo === "red" || tipo === "arbol";
  const base = estructura.capas.length ? estructura.capas.map((c) => ({ id: c.id, nombre: c.nombre, nodos: [...c.nodos] })) : esGrafo ? [] : solidos.map((n) => ({ id: n.id, nombre: n.etiqueta || n.id, nodos: [n.id] }));
  const indice = new Map<string, number>(); base.forEach((c, i) => c.nodos.forEach((id) => indice.set(id, i)));
  const media = solidos.length ? solidos.reduce((s, n) => s + n.caja.alto * k, 0) / solidos.length : 1, sep = Math.max(0.6, media * 1.6);
  const zDe = (i: number) => (i - (Math.max(base.length, 1) - 1) / 2) * sep, dim = Math.max(0.5, ...solidos.map((n) => Math.max(n.caja.ancho, n.caja.alto) * k));
  const radio = Math.max(2, dim * Math.sqrt(Math.max(estructura.nodos.length, 1)) * 0.9), aureo = Math.PI * (3 - Math.sqrt(5));
  const fib = (i: number, n: number): Punto3 => {
    const y = n <= 1 ? 0 : 1 - (i / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), t = aureo * i;
    return n <= 1 ? { x: 0, y: 0, z: 0 } : { x: Math.cos(t) * r * radio, y: y * radio, z: Math.sin(t) * r * radio };
  };
  const destinos = new Map<string, Punto3>(); estructura.nodos.forEach((n, i) => { const c = centro(n.caja); destinos.set(n.id, esGrafo ? fib(i, estructura.nodos.length) : { x: (c.x - estructura.ancho / 2) * k, y: -(c.y - estructura.alto / 2) * k, z: zDe(indice.get(n.id) ?? 0) }); });
  if (esGrafo) separar(destinos, dim * 1.25);
  const nodos3: Nodo3D[] = estructura.nodos.map((n) => { const p = destinos.get(n.id) ?? { x: 0, y: 0, z: 0 }, prof = Math.max(0.04, Math.min(n.caja.ancho, n.caja.alto) * k * (esGrafo ? 0.35 : 0.06)); return { id: n.id, etiqueta: n.etiqueta || n.id, forma: n.forma, posicion: p, tamano: { x: n.caja.ancho * k, y: n.caja.alto * k, z: prof }, capa: n.capa, focal: n.focal }; });
  const textos: Texto3D[] = nodos3.map((n) => ({ id: `texto-${n.id}`, texto: n.etiqueta, posicion: { x: n.posicion.x, y: n.posicion.y + n.tamano.y / 2 + 0.14, z: n.posicion.z + n.tamano.z / 2 + 0.02 }, tamano: Math.max(0.16, Math.min(0.4, n.tamano.y * 0.3)), billboard: true }));
  const alPlano = (p: Punto2): Punto3 => ({ x: (p.x - estructura.ancho / 2) * k, y: -(p.y - estructura.alto / 2) * k, z: 0 });
  const aristas3: Arista3D[] = estructura.aristas.map((a) => { const d = a.desde ? destinos.get(a.desde) : undefined, h = a.hasta ? destinos.get(a.hasta) : undefined; return { id: a.id, puntos: d && h ? [d, h] : a.puntos.map(alPlano), marcador: a.marcador }; });
  const capas3: Capa3D[] = base.map((c, i) => ({ id: c.id, nombre: c.nombre, z: zDe(i), nodos: [...c.nodos] }));
  const d = Math.max(6, dim * 2, (sep * Math.max(base.length, 1)) / 2, esGrafo ? radio * 2.2 : 0);
  return { tipo, nodos: nodos3, textos, aristas: aristas3, capas: capas3, camara: { posicion: { x: d * 0.65, y: d * 0.45, z: d }, objetivo: { x: 0, y: 0, z: 0 }, fov: 45 } };
}
