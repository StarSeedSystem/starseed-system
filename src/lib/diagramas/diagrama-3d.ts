// Estructura y escena 3D de un diagrama (PURO): del SVG a nodos, aristas y capas, y de ahí a
// una colocación espacial determinista. No toca DOM, red ni disco.
// Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/, assets/
// example-layers.html y example-architecture.html); contrato: architecture/diagramas.md §3-4.

export type FormaSvg = "rect" | "circulo" | "texto";
export type TipoEscena3d = "capas" | "despiece" | "axonometria" | "grafo";
export type Vec3 = [number, number, number];

export interface NodoSvg { id: string; etiqueta: string; forma: FormaSvg; x: number; y: number; ancho: number; alto: number; capa?: string }
export interface AristaSvg { id: string; fuente: string; destino: string; conMarcador: boolean }
export interface CapaSvg { id: string; etiqueta: string; indice: number; nodos: string[] }
export interface EstructuraSvg { nodos: NodoSvg[]; aristas: AristaSvg[]; capas: CapaSvg[]; textos: string[]; ancho: number; alto: number }
export interface Nodo3d { id: string; etiqueta: string; forma: FormaSvg; posicion: Vec3; tamano: Vec3; capa?: string }
export interface Arista3d { id: string; fuente: string; destino: string }
export interface Etiqueta3d { id: string; texto: string; posicion: Vec3; miraCamara: true }
export interface Capa3d { id: string; etiqueta: string; z: number }
export interface Escena3d {
  tipo: TipoEscena3d; nodos: Nodo3d[]; aristas: Arista3d[]; etiquetas: Etiqueta3d[]; capas: Capa3d[];
  camara: { posicion: Vec3; objetivo: Vec3 }; escala: number;
}

type Clase = "g" | "rect" | "circle" | "text" | "line" | "path";
interface Trozo { i: number; clase: Clase; attrs: string; cuerpo: string }

function attr(attrs: string, clave: string): string | undefined {
  return attrs.match(new RegExp(`\\b${clave}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
}
function num(attrs: string, clave: string, def = 0): number {
  const v = attr(attrs, clave);
  const n = v === undefined ? NaN : Number.parseFloat(v);
  return Number.isFinite(n) ? n : def;
}
function limpiar(texto: string): string {
  return texto.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function trozos(svg: string): Trozo[] {
  const salida: Trozo[] = [];
  const patrones: [Clase, RegExp][] = [
    ["g", /<g\b([^>]*)>/gi], ["rect", /<rect\b([^>]*?)\/?>/gi], ["circle", /<circle\b([^>]*?)\/?>/gi],
    ["text", /<text\b([^>]*)>([\s\S]*?)<\/text>/gi], ["line", /<line\b([^>]*?)\/?>/gi], ["path", /<path\b([^>]*?)\/?>/gi],
  ];
  for (const [clase, re] of patrones) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(svg)) !== null) salida.push({ i: m.index, clase, attrs: m[1], cuerpo: m[2] ?? "" });
  }
  return salida.sort((a, b) => a.i - b.i);
}

function esCapa(attrs: string): boolean {
  return Boolean(attr(attrs, "id")) || /capa|layer/i.test(attr(attrs, "class") ?? "");
}

function primerPunto(d: string): [number, number] | null {
  const n = d.match(/-?\d*\.?\d+/g);
  return n && n.length >= 2 ? [Number(n[0]), Number(n[1])] : null;
}

function finDePath(d: string): [number, number] {
  const t = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  let x = 0, y = 0, cmd = "", i = 0;
  const n = () => Number(t[i++]);
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) { cmd = t[i++]; if (cmd === "Z" || cmd === "z") continue; }
    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();
    if (c === "H") { const a = n(); x = rel ? x + a : a; }
    else if (c === "V") { const a = n(); y = rel ? y + a : a; }
    else if (c === "Q") { n(); n(); const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (c === "C") { n(); n(); n(); n(); const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (c === "A") { n(); n(); n(); n(); n(); const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else { const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; }
  }
  return [x, y];
}

function masCercano(nodos: NodoSvg[], p: [number, number]): string {
  let id = "", mejor = Infinity;
  for (const n of nodos) {
    const d = (n.x + n.ancho / 2 - p[0]) ** 2 + (n.y + n.alto / 2 - p[1]) ** 2;
    if (d < mejor) { mejor = d; id = n.id; }
  }
  return id;
}

export function estructuraDeSvg(svg: string): EstructuraSvg {
  const firma = svg.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const vb = (attr(firma, "viewBox") ?? "").split(/[\s,]+/).map(Number);
  const ancho = vb.length === 4 && vb[2] > 0 ? vb[2] : 1000;
  const alto = vb.length === 4 && vb[3] > 0 ? vb[3] : 600;
  const nodos: NodoSvg[] = [], aristas: AristaSvg[] = [], capas: CapaSvg[] = [], textos: string[] = [];
  const rotulos: { texto: string; x: number; y: number; tamano: number; capa?: string }[] = [];
  const candidatas: { id: string; inicio: [number, number]; fin: [number, number] }[] = [];
  const cajas = new Map<string, NodoSvg>();
  const tamanoRotulo = new Map<string, number>();
  let capa: string | undefined, cuenta = 0;

  for (const t of trozos(svg)) {
    if (t.clase === "g") {
      if (esCapa(t.attrs)) {
        capa = attr(t.attrs, "id") ?? `capa-${capas.length}`;
        capas.push({ id: capa, etiqueta: limpiar(attr(t.attrs, "data-etiqueta") ?? capa), indice: capas.length, nodos: [] });
      }
    } else if (t.clase === "text") {
      const texto = limpiar(t.cuerpo);
      if (texto) { textos.push(texto); rotulos.push({ texto, x: num(t.attrs, "x"), y: num(t.attrs, "y"), tamano: num(t.attrs, "font-size", 10), capa }); }
    } else if (t.clase === "rect" || t.clase === "circle") {
      const anchoN = t.clase === "rect" ? num(t.attrs, "width") : num(t.attrs, "r") * 2;
      const altoN = t.clase === "rect" ? num(t.attrs, "height") : num(t.attrs, "r") * 2;
      const fondo = anchoN >= ancho * 0.9 && altoN >= alto * 0.9;
      if (fondo || /%/.test(attr(t.attrs, "width") ?? "") || altoN < 18 || anchoN < 24) continue;
      const x = t.clase === "rect" ? num(t.attrs, "x") : num(t.attrs, "cx") - num(t.attrs, "r");
      const y = t.clase === "rect" ? num(t.attrs, "y") : num(t.attrs, "cy") - num(t.attrs, "r");
      const clave = `${t.clase}|${x}|${y}|${anchoN}|${altoN}`;
      if (cajas.has(clave)) continue;
      const id = attr(t.attrs, "id") ?? `nodo-${cuenta++}`;
      const nodo: NodoSvg = { id, etiqueta: "", forma: t.clase === "circle" ? "circulo" : "rect", x, y, ancho: anchoN, alto: altoN, capa };
      nodos.push(nodo); cajas.set(clave, nodo);
      if (capa) capas.find((c) => c.id === capa)?.nodos.push(id);
    } else if (attr(t.attrs, "marker-end") || attr(t.attrs, "marker-start")) {
      const id = attr(t.attrs, "id") ?? `arista-${candidatas.length}`;
      if (t.clase === "line") candidatas.push({ id, inicio: [num(t.attrs, "x1"), num(t.attrs, "y1")], fin: [num(t.attrs, "x2"), num(t.attrs, "y2")] });
      else { const d = attr(t.attrs, "d") ?? "", ini = primerPunto(d); if (ini) candidatas.push({ id, inicio: ini, fin: finDePath(d) }); }
    }
  }

  for (const r of rotulos) {
    let mejor: NodoSvg | null = null, area = Infinity;
    for (const n of nodos) {
      if (r.x < n.x || r.x > n.x + n.ancho || r.y < n.y || r.y > n.y + n.alto) continue;
      const a = n.ancho * n.alto;
      if (a < area) { area = a; mejor = n; }
    }
    if (mejor && r.tamano >= (tamanoRotulo.get(mejor.id) ?? 0)) { mejor.etiqueta = r.texto; tamanoRotulo.set(mejor.id, r.tamano); }
    else if (!mejor && r.tamano >= 12) {
      const id = `texto-${cuenta++}`, anchoT = Math.max(24, r.texto.length * r.tamano * 0.6);
      nodos.push({ id, etiqueta: r.texto, forma: "texto", x: r.x, y: r.y - r.tamano, ancho: anchoT, alto: r.tamano * 1.4, capa: r.capa });
      if (r.capa) capas.find((c) => c.id === r.capa)?.nodos.push(id);
    }
  }
  for (const c of candidatas) {
    const fuente = masCercano(nodos, c.inicio), destino = masCercano(nodos, c.fin);
    if (fuente && destino && fuente !== destino) aristas.push({ id: c.id, fuente, destino, conMarcador: true });
  }
  return { nodos, aristas, capas, textos, ancho, alto };
}

const ESCALA = 0.01;

function inferirCapas(nodos: NodoSvg[]): CapaSvg[] {
  const bandas: { y: number; nodos: NodoSvg[] }[] = [];
  for (const n of [...nodos].sort((a, b) => a.y - b.y)) {
    const centro = n.y + n.alto / 2;
    const banda = bandas.find((b) => Math.abs(b.y - centro) <= 24);
    if (banda) banda.nodos.push(n); else bandas.push({ y: centro, nodos: [n] });
  }
  return bandas.map((b, i) => ({
    id: `banda-${i}`, indice: i, nodos: b.nodos.map((n) => n.id),
    etiqueta: b.nodos.find((n) => n.etiqueta)?.etiqueta ?? `Capa ${i + 1}`,
  }));
}

function tamanoDe(n: NodoSvg): Vec3 {
  return [Math.max(0.16, n.ancho * ESCALA), Math.max(0.12, n.alto * ESCALA), 0.08];
}

export function escena3d(estructura: EstructuraSvg, tipo: TipoEscena3d): Escena3d {
  const porId = new Map(estructura.nodos.map((n) => [n.id, n]));
  const capas = tipo === "grafo" ? [] : estructura.capas.length ? estructura.capas : inferirCapas(estructura.nodos);
  const nodos: Nodo3d[] = [], etiquetas: Etiqueta3d[] = [], capas3d: Capa3d[] = [];
  const altoMedio = estructura.nodos.length ? estructura.nodos.reduce((s, n) => s + n.alto, 0) / estructura.nodos.length : 40;
  const sep = Math.max(0.5, altoMedio * ESCALA * 1.618);
  const n = estructura.nodos.length;
  const radio = Math.max(2, Math.sqrt(Math.max(1, n)) * 0.9);

  if (tipo === "grafo") {
    const dorado = Math.PI * (3 - Math.sqrt(5));
    estructura.nodos.forEach((nodo, i) => {
      const y = n <= 1 ? 0 : 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y)), ang = dorado * i;
      const pos: Vec3 = [Math.cos(ang) * r * radio, y * radio * 0.62, Math.sin(ang) * r * radio];
      nodos.push({ id: nodo.id, etiqueta: nodo.etiqueta, forma: nodo.forma, posicion: pos, tamano: tamanoDe(nodo), capa: nodo.capa });
      if (nodo.etiqueta) etiquetas.push({ id: `et-${nodo.id}`, texto: nodo.etiqueta, posicion: [pos[0], pos[1] + 0.34, pos[2]], miraCamara: true });
    });
  } else {
    capas.forEach((c, i) => {
      const z = (i - (capas.length - 1) / 2) * sep;
      const desfase = tipo === "despiece" ? i * 0.4 : tipo === "axonometria" ? z * 0.35 : 0;
      const desfaseY = tipo === "despiece" ? desfase * 0.618 : tipo === "axonometria" ? z * 0.2 : 0;
      capas3d.push({ id: c.id, etiqueta: c.etiqueta, z });
      etiquetas.push({ id: `et-${c.id}`, texto: c.etiqueta, posicion: [-(estructura.ancho / 2) * ESCALA - 0.9, 0, z], miraCamara: true });
      for (const id of c.nodos) {
        const nodo = porId.get(id);
        if (!nodo) continue;
        const tam = tamanoDe(nodo);
        const pos: Vec3 = [(nodo.x + nodo.ancho / 2 - estructura.ancho / 2) * ESCALA + desfase, (estructura.alto / 2 - nodo.y - nodo.alto / 2) * ESCALA + desfaseY, z];
        nodos.push({ id: nodo.id, etiqueta: nodo.etiqueta, forma: nodo.forma, posicion: pos, tamano: tam, capa: nodo.capa });
        if (nodo.etiqueta) etiquetas.push({ id: `et-${nodo.id}`, texto: nodo.etiqueta, posicion: [pos[0], pos[1] + tam[1] / 2 + 0.12, pos[2] + 0.02], miraCamara: true });
      }
    });
    for (const nodo of estructura.nodos) {
      if (capas.some((c) => c.nodos.includes(nodo.id))) continue;
      const tam = tamanoDe(nodo);
      const pos: Vec3 = [(nodo.x + nodo.ancho / 2 - estructura.ancho / 2) * ESCALA, (estructura.alto / 2 - nodo.y - nodo.alto / 2) * ESCALA, 0];
      nodos.push({ id: nodo.id, etiqueta: nodo.etiqueta, forma: nodo.forma, posicion: pos, tamano: tam, capa: nodo.capa });
      if (nodo.etiqueta) etiquetas.push({ id: `et-${nodo.id}`, texto: nodo.etiqueta, posicion: [pos[0], pos[1] + tam[1] / 2 + 0.12, 0.02], miraCamara: true });
    }
  }

  const ids = new Set(nodos.map((x) => x.id));
  const aristas = estructura.aristas.filter((a) => ids.has(a.fuente) && ids.has(a.destino)).map((a) => ({ id: a.id, fuente: a.fuente, destino: a.destino }));
  const profundidad = tipo === "grafo" ? radio * 2.4 : Math.max(4, sep * capas.length * 0.9 + altoMedio * ESCALA * 2);
  const alturaCamara = tipo === "grafo" ? radio * 0.4 : tipo === "axonometria" ? Math.max(2, sep * capas.length) : 1.4;
  return {
    tipo, nodos, aristas, etiquetas, capas: capas3d,
    camara: { posicion: [0, alturaCamara, profundidad], objetivo: [0, 0, 0] }, escala: ESCALA,
  };
}
