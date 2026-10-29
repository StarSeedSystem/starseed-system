"use strict";

// Módulo PURO: estructuraDeSvg(svg) saca nodos (rect, círculo, texto agrupados),
// aristas (path/line con marcador) y capas (grupos `g` con id o clase de capa)
// y escena3d(estructura, tipo) coloca: tipos de capas, despiece y planta axonométrica
// apilados en Z con separación proporcional; tipos de grafo repartidos en 3D sin
// solaparse; textos siempre de cara a la cámara.
// Basado en los contratos: architecture/diagramas.md (secciones 1–3, 5) y
// vendor/habilidades/diagram-design/SKILL.md.
// Solo SVG; sin red, sin DOM, sin `any`; textos en español con acentos.

type Rect = { tipo: "rect"; id: string; ancho: number; alto: number; x: number; y: number; rx?: number; fill?: string; stroke?: string; texto?: string; }
type Circulo = { tipo: "circulo"; id: string; r: number; cx: number; cy: number; fill?: string; stroke?: string; texto?: string; }
type Texto = { tipo: "texto"; id: string; x: number; y: number; contenido: string; fuente?: string; tamano?: number; fill?: string; stroke?: string; }
type Nodo = Rect | Circulo | Texto;

type Arista = { tipo: "arista"; id: string; de: string; hacia: string; path?: string; stroke?: string; marcador?: string; texto?: string; }

type Grupo = { tipo: "grupo"; id: string; clase?: string; transform?: string; children: (Nodo | Arista | Grupo)[]; }
type Capa = { tipo: "capa"; id: string; clase?: string; tipoCapa?: string; apilado?: number; ]

export interface EstructuraSvg {
  nodos: Record<string, Nodo>;
  aristas: Record<string, Arista>;
  grupos: Record<string, Grupo>;
  capas: Capa[];
  definiciones: { id: string; elemento: string; atributos?: Record<string, string> }[];
}

// Extraer elementos SVG de un string con vistaBox dada a un DOM DOMParser.
function aDomParser(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) throw new Error(`XML SVG mal formado: ${parserError.textContent}`);
  return doc;
}

function extraerNodos(raiz: Element): Record<string, Nodo> {
  const nodos: Record<string, Nodo> = {};
  const rects = raiz.querySelectorAll("rect");
  for (const r of rects) {
    const id = r.id || `"rect-${Math.random().toString(36).slice(2)}"`;
    nodos[id] = {
      tipo: "rect",
      id,
      ancho: Number(r.getAttribute("width")) || 0,
      alto: Number(r.getAttribute("alto")) || Number(r.getAttribute("height")) || 0,
      x: Number(r.getAttribute("x")) || 0,
      y: Number(r.getAttribute("y")) || 0,
      rx: r.getAttribute("rx") ? Number(r.getAttribute("rx")) : undefined,
      fill: r.getAttribute("fill") || undefined,
      stroke: r.getAttribute("stroke") || undefined,
      texto: r.textContent?.trim() || undefined,
    };
  }

  const circs = raiz.querySelectorAll("circle");
  for (const c of circs) {
    const id = c.id || `"circulo-${Math.random().toString(36).slice(2)}"`;
    nodos[id] = {
      tipo: "circulo",
      id,
      r: Number(c.getAttribute("r")) || 0,
      cx: Number(c.getAttribute("cx")) || 0,
      cy: Number(c.getAttribute("cy")) || 0,
      fill: c.getAttribute("fill") || undefined,
      stroke: c.getAttribute("stroke") || undefined,
      texto: c.textContent?.trim() || undefined,
    };
  }

  const textos = raiz.querySelectorAll("text");
  for (const t of textos) {
    const id = t.id || `"texto-${Math.random().toString(36).slice(2)}"`;
    nodos[id] = {
      tipo: "texto",
      id,
      x: Number(t.getAttribute("x")) || 0,
      y: Number(t.getAttribute("y")) || 0,
      contenido: t.textContent?.trim() || "",
      fuente: t.getAttribute("font-family") || undefined,
      tamano: t.getAttribute("font-size") ? Number(t.getAttribute("font-size")) : undefined,
      fill: t.getAttribute("fill") || undefined,
      stroke: t.getAttribute("stroke") || undefined,
    };
  }

  return nodos;
}

function extraerAristas(raiz: Element): Record<string, Arista> {
  const aristas: Record<string, Arista> = {};
  const paths = raiz.querySelectorAll("path:not(:has(.ignore))");
  for (const p of paths) {
    const id = p.id || `"arista-${Math.random().toString(36).slice(2)}"`;
    const markerEnd = p.getAttribute("marker-end");
    aristas[id] = {
      tipo: "arista",
      id,
      de: p.getAttribute("data-de") || "",
      hacia: p.getAttribute("data-hacia") || "",
      path: p.getAttribute("d") || undefined,
      stroke: p.getAttribute("stroke") || undefined,
      marcador: markerEnd ? markerEnd.split("#").pop() : undefined,
      texto: p.textContent?.trim() || undefined,
    };
  }

  const lines = raiz.querySelectorAll("line:not(:has(.ignore))");
  for (const l of lines) {
    const id = l.id || `"arista-${Math.random().toString(36).slice(2)}"`;
    const markerEnd = l.getAttribute("marker-end");
    aristas[id] = {
      tipo: "arista",
      id,
      de: l.getAttribute("x1") && l.getAttribute("y1") ? `${l.getAttribute("x1")},${l.getAttribute("y1")}` : "",
      hacia: l.getAttribute("x2") && l.getAttribute("y2") ? `${l.getAttribute("x2")},${l.getAttribute("y2")}` : "",
      path: l.getAttribute("d") || undefined,
      stroke: l.getAttribute("stroke") || undefined,
      marcador: markerEnd ? markerEnd.split("#").pop() : undefined,
      texto: l.textContent?.trim() || undefined,
    };
  }

  return aristas;
}

function extraerGrupos(raiz: Element): Record<string, Grupo> {
  const grupos: Record<string, Grupo> = {};
  const gruposG = raiz.querySelectorAll("g:not(:has(.ignore))");
  for (const g of gruposG) {
    const id = g.id || `"grupo-${Math.random().toString(36).slice(2)}"`;
    const clase = g.getAttribute("class") || undefined;
    const transform = g.getAttribute("transform") || undefined;
    grupos[id] = { tipo: "grupo", id, clase, transform, children: [] };
  }

  return grupos;
}

function extraerCapas(raiz: Element): Capa[] {
  const capas: Capa[] = [];
  const gruposG = raiz.querySelectorAll("g:not(:has(.ignore))");

  for (const g of gruposG) {
    const id = g.id;
    if (!id) continue;

    const clase = g.getAttribute("class") || "";
    const tipoCapa = g.getAttribute("data-tipo-capa") || undefined;

    const apilado = clase.includes("apilado") ? 1 : clase.includes("base") ? 0 : clase.includes("superior") ? 2 : undefined;

    capas.push({ tipo: "capa", id, clase, tipoCapa, apilado });
  }

  return capas;
}

function extraerDefiniciones(raiz: Element): { id: string; elemento: string; atributos?: Record<string, string> }[] {
  const defs = raiz.querySelector("defs");
  if (!defs) return [];

  const definiciones: { id: string; elemento: string; atributos?: Record<string, string> }[] = [];
  const hijos = defs.children;

  for (let i = 0; i < hijos.length; i++) {
    const hijo = hijos[i];
    const id = hijo.id || `"def-${i}"`;
    const elemento = hijo.tagName.toLowerCase();

    const atributos: Record<string, string> = {};
    for (let j = 0; j < hijo.attributes.length; j++) {
      const attr = hijo.attributes[j];
      if (attr.name !== "id") {
        atributos[attr.name] = attr.value;
      }
    }

    definiciones.push({ id, elemento, atributos });
  }

  return definiciones;
}

export function estructuraDeSvg(svg: string): EstructuraSvg {
  const doc = aDomParser(svg);
  const raiz = doc.documentElement;

  if (!raiz || raiz.tagName.toLowerCase() !== "svg") {
    throw new Error("El SVG debe ser un elemento raíz <svg>");
  }

  return {
    nodos: extraerNodos(raiz),
    aristas: extraerAristas(raiz),
    grupos: extraerGrupos(raiz),
    capas: extraerCapas(raiz),
    definiciones: extraerDefiniciones(raiz),
  };
}

function asignarPosicion3D(nodo: Nodo, zIndex: number, tipo: string): { posicion: [number, number, number]; rotacion: [number, number, number] } {
  const baseZ = zIndex * 10;

  let x = 0, y = 0, rotY = 0;

  if (nodo.tipo === "rect") {
    x = nodo.x + nodo.ancho / 2;
    y = -nodo.y - nodo.alto / 2;
    rotY = 0;
  } else if (nodo.tipo === "circulo") {
    x = nodo.cx;
    y = -nodo.cy;
    rotY = 0;
  } else if (nodo.tipo === "texto") {
    x = nodo.x;
    y = -nodo.y;
    rotY = 0;
  }

  if (tipo === "arbol") {
    rotY = Math.random() * Math.PI * 2;
  } else if (tipo === "red") {
    const hash = nodo.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    rotY = (hash % 360) * (Math.PI / 180);
  }

  return {
    posicion: [x, y, baseZ],
    rotacion: [0, rotY, 0],
  };
}

function asignarPosicion3DArista(arista: Arista, zIndex: number): { posicion: [number, number, number]; rotacion: [number, number, number] } {
  const baseZ = zIndex * 10;
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;

  if (arista.de) {
    const [dx, dy] = arista.de.split(",").map(Number);
    x1 = dx;
    y1 = -dy;
  }

  if (arista.hacia) {
    const [dx, dy] = arista.hacia.split(",").map(Number);
    x2 = dx;
    y2 = -dy;
  } else if (arista.path) {
    const path = arista.path;
    const regexM = /M\s*([\d.-]+)\s*([\d.-]+)/g;
    let match;
    while ((match = regexM.exec(path)) !== null) {
      x1 = Number(match[1]);
      y1 = Number(match[2]);
    }
    const regexL = /L\s*([\d.-]+)\s*([\d.-]+)/g;
    while ((match = regexL.exec(path)) !== null) {
      x2 = Number(match[1]);
      y2 = Number(match[2]);
    }
  }

  return {
    posicion: [(x1 + x2) / 2, -(y1 + y2) / 2, baseZ],
    rotacion: [0, 0, 0],
  };
}

function calcularApilado(capas: Capa[]): Map<string, number> {
  const apiladoMap = new Map<string, number>();

  capas.forEach((capa) => {
    if (capa.apilado !== undefined) {
      apiladoMap.set(capa.id, capa.apilado);
    }
  });

  return apiladoMap;
}

function distribuirGrupos3D(grupos: Grupo[], apiladoMap: Map<string, number>): Map<string, { posicion: [number, number, number]; rotacion: [number, number, number] }> {
  const grupos3D: Map<string, { posicion: [number, number, number]; rotacion: [number, number, number] }> = new Map();

  grupos.forEach((grupo) => {
    const apilado = apiladoMap.get(grupo.id) || 1;
    const angulo = Math.random() * Math.PI * 2;
    const radio = 100 + apilado * 30;

    grupos3D.set(grupo.id, {
      posicion: [Math.cos(angulo) * radio, Math.sin(angulo) * radio, apilado * 10],
      rotacion: [0, angulo, 0],
    });
  });

  return grupos3D;
}

export function escena3d(estructura: EstructuraSvg, tipo: string): {
  nodos3D: Record<string, { posicion: [number, number, number]; rotacion: [number, number, number]; tipo: string }>};
  aristas3D: Record<string, { posicion: [number, number, number]; rotacion: [number, number, number]; tipo: string }>};
  capas3D: Array<{ id: string; posicion: [number, number, number]; rotacion: [number, number, number]; tipo: string }>;
  grupos3D: Record<string, { posicion: [number, number, number]; rotacion: [number, number, number] }>;
} {
  const apiladoMap = calcularApilado(estructura.capas);
  const grupos3D = distribuirGrupos3D(Object.values(estructura.grupos), apiladoMap);

  const nodos3D: Record<string, { posicion: [number, number, number]; rotacion: [number, number, number]; tipo: string }> = {};
  const aristas3D: Record<string, { posicion: [number, number, number]; rotacion: [number, number, number]; tipo: string }> = {};

  Object.entries(estructura.nodos).forEach(([id, nodo]) => {
    const apilado = apiladoMap.get(id) || 1;
    const { posicion, rotacion } = asignarPosicion3D(nodo, apilado, tipo);
    nodos3D[id] = { posicion, rotacion, tipo: nodo.tipo };
  });

  Object.entries(estructura.aristas).forEach(([id, arista]) => {
    const apilado = apiladoMap.get(id) || 1;
    const { posicion, rotacion } = asignarPosicion3DArista(arista, apilado);
    aristas3D[id] = { posicion, rotacion, tipo: arista.tipo };
  });

  const capas3D = estructura.capas.map((capa) => {
    const apilado = capa.apilado || 1;
    const angulo = Math.random() * Math.PI * 2;
    const radio = 200 + apilado * 50;

    return {
      id: capa.id,
      posicion: [Math.cos(angulo) * radio, Math.sin(angulo) * radio, apilado * 10],
      rotacion: [0, angulo, 0],
      tipo: capa.tipoCapa || "generico",
    };
  });

  return {
    nodos3D,
    aristas3D,
    capas3D,
    grupos3D: grupos3D as Record<string, { posicion: [number, number, number]; rotacion: [number, number, number] }>,
  };
}
