// Importación pura de diagramas externos a una especificación común.
// Basado en los scripts MIT de diagram-design: drawio_extract.py,
// excalidraw_extract.py, mermaid_extract.py (licencia MIT, citados en
// architecture/diagramas.md y vendor/habilidades/diagram-design/).

export interface Nodo {
  id: string;
  etiqueta: string;
  forma?: string;
}

export interface Arista {
  id: string;
  fuente: string;
  destino: string;
  etiqueta: string;
}

export interface Grupo {
  id: string;
  etiqueta: string;
  nodos: string[];
}

export interface ResultadoDiagrama {
  nodos: Nodo[];
  aristas: Arista[];
  grupos: Grupo[];
  textos: string[];
}

function extraerAtributo(attrs: string, clave: string): string | undefined {
  const re = new RegExp(clave + '="([^"]*)"');
  const match = attrs.match(re);
  return match ? match[1] : undefined;
}

function limpiarTexto(texto: string | undefined): string {
  if (!texto) return "";
  return texto
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extraerBinding(el: unknown, clave: string): string | undefined {
  if (!el || typeof el !== "object") return undefined;
  const binding = (el as Record<string, unknown>)[clave];
  if (binding && typeof binding === "object" && (binding as Record<string, unknown>)["elementId"]) {
    return String((binding as Record<string, unknown>)["elementId"]);
  }
  return undefined;
}

function inferirFormaMermaid(expresion: string): string {
  if (expresion.includes("((")) return "circle";
  if (expresion.includes("[[")) return "subroutine";
  if (expresion.includes("{{")) return "hexagon";
  if (expresion.includes("([")) return "cylinder";
  if (expresion.includes("{")) return "rhombus";
  if (expresion.includes("(")) return "round";
  return "rect";
}

function inferirForma(attrs: string): string {
  const estilo = extraerAtributo(attrs, "style") || "";
  if (estilo.includes("shape=ellipse") || estilo.includes("ellipse")) return "ellipse";
  if (estilo.includes("shape=rhombus") || estilo.includes("rhombus")) return "rhombus";
  if (estilo.includes("shape=hexagon")) return "hexagon";
  if (estilo.includes("shape=triangle")) return "triangle";
  if (estilo.includes("shape=cylinder")) return "cylinder";
  if (estilo.includes("swimlane")) return "swimlane";
  return "rect";
}

const LIMITE_BYTES = 2 * 1024 * 1024;

function rechazarSiGrande(texto: string, contexto: string): void {
  if (Buffer.byteLength(texto, "utf8") > LIMITE_BYTES) {
    throw new Error(
      `${contexto}: entrada de ${Buffer.byteLength(texto, "utf8")} bytes excede 2 MiB`
    );
  }
}

function rechazarXmlExterno(xml: string): void {
  const mayus = xml.toUpperCase();
  if (mayus.includes("<!DOCTYPE")) {
    throw new Error("drawio: declaraciones DTD no soportadas");
  }
  if (mayus.includes("<!ENTITY")) {
    throw new Error("drawio: declaraciones de entidades externas no soportadas");
  }
}

export function desdeDrawio(xml: string): ResultadoDiagrama {
  rechazarSiGrande(xml, "drawio");
  rechazarXmlExterno(xml);
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const grupos: Grupo[] = [];
  const textos: string[] = [];

  // Regex básico de mxCell (nodo o arista). No usa DOMParser ni node:xml.
  const regexCelda = /<mxCell\s+([^>]*?)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = regexCelda.exec(xml)) !== null) {
    const attrs = m[1];
    const id = extraerAtributo(attrs, "id") || `n-${nodos.length + aristas.length}`;
    const valor = limpiarTexto(extraerAtributo(attrs, "value") || "");
    const esArista = attrs.includes('edge="1"');
    const esVertice = attrs.includes('vertex="1"') || (!esArista && !attrs.includes('edge="1"'));
    if (esArista) {
      const fuente = extraerAtributo(attrs, "source") || "";
      const destino = extraerAtributo(attrs, "target") || "";
      const etiqueta = limpiarTexto(extraerAtributo(attrs, "value") || "");
      aristas.push({ id, fuente, destino, etiqueta });
      if (etiqueta) textos.push(etiqueta);
    } else if (esVertice) {
      const forma = inferirForma(attrs);
      nodos.push({ id, etiqueta: valor, forma });
      if (valor) textos.push(valor);
    }
  }

  // Grupos: contenedores con parent que agrupan nodos. Simplificado: cualquier
  // nodo con parent se agrupa por ese parent.
  const mapaPadres = new Map<string, string[]>();
  // Volvemos a escanear para agrupar (segundo paso simple).
  const regexCelda2 = /<mxCell\s+([^>]*?)\/>/gi;
  while ((m = regexCelda2.exec(xml)) !== null) {
    const attrs = m[1];
    const id = extraerAtributo(attrs, "id") || "";
    const parent = extraerAtributo(attrs, "parent");
    if (parent && id) {
      const arr = mapaPadres.get(parent) || [];
      arr.push(id);
      mapaPadres.set(parent, arr);
    }
  }
  mapaPadres.forEach((hijos, padre) => {
    grupos.push({
      id: padre,
      etiqueta: padre,
      nodos: hijos.filter((h) => nodos.some((n) => n.id === h)),
    });
  });

  return { nodos, aristas, grupos, textos };
}

export function desdeExcalidraw(entrada: string | object): ResultadoDiagrama {
  const texto = typeof entrada === "string" ? entrada : JSON.stringify(entrada);
  rechazarSiGrande(texto, "excalidraw");
  const datos = typeof entrada === "string" ? JSON.parse(entrada) : entrada;
  if (typeof datos !== "object" || datos === null || datos["type"] !== "excalidraw") {
    throw new Error("excalidraw: no es una escena excalidraw (falta type: excalidraw)");
  }
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const grupos: Grupo[] = [];
  const textos: string[] = [];

  const elementos = Array.isArray(datos["elements"]) ? datos["elements"] : [];
  const mapaNodo = new Map<string, Nodo>();

  // Primera pasada: nodos.
  for (const el of elementos) {
    if (!el || typeof el !== "object") continue;
    const tipo = String(el["type"] || "");
    const id = String(el["id"] || "");
    if (tipo === "arrow" || tipo === "line") continue;
    const etiqueta = limpiarTexto(el["text"] || el["name"] || "");
    let forma = "rect";
    if (tipo === "ellipse") forma = "ellipse";
    else if (tipo === "diamond") forma = "rhombus";
    else if (tipo === "frame") forma = "frame";
    else if (tipo === "text") forma = "text";
    nodos.push({ id, etiqueta, forma });
    mapaNodo.set(id, { id, etiqueta, forma });
    if (etiqueta) textos.push(etiqueta);
  }

  // Segunda pasada: aristas (arrow/line).
  for (const el of elementos) {
    if (!el || typeof el !== "object") continue;
    const tipo = String(el["type"] || "");
    if (tipo !== "arrow" && tipo !== "line") continue;
    const id = String(el["id"] || `e-${aristas.length}`);
    const fuente = extraerBinding(el, "startBinding");
    const destino = extraerBinding(el, "endBinding");
    const etiqueta = limpiarTexto(el["text"] || "");
    aristas.push({ id, fuente: fuente || "", destino: destino || "", etiqueta });
    if (etiqueta) textos.push(etiqueta);
  }

  // Tercera pasada: grupos (frames y groupIds).
  const idsFrame = new Set<string>();
  for (const el of elementos) {
    if (String(el["type"]) === "frame" && el["id"]) {
      idsFrame.add(String(el["id"]));
    }
  }
  for (const idFrame of idsFrame) {
    const hijos: string[] = [];
    for (const el of elementos) {
      if (String(el["frameId"]) === idFrame && el["id"]) {
        hijos.push(String(el["id"]));
      }
    }
    grupos.push({ id: idFrame, etiqueta: idFrame, nodos: hijos.filter((h) => mapaNodo.has(h)) });
  }

  return { nodos, aristas, grupos, textos };
}

export function desdeMermaid(texto: string): ResultadoDiagrama {
  rechazarSiGrande(texto, "mermaid");
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const grupos: Grupo[] = [];
  const textos: string[] = [];

  // Eliminamos comentarios y directivas.
  const limpio = texto
    .split("\n")
    .map((l) => {
      const s = l.trim();
      if (s.startsWith("%%")) return "";
      return l;
    })
    .join("\n");

  const mapaNodo = new Map<string, Nodo>();
  const mapaForma = new Map<string, string>();

  // Flowchart / graph básico: declaraciones de nodos.
  // Regex simplificado para capturar declaraciones de forma explícita.
  const declNodo = /([A-Za-z0-9_][A-Za-z0-9_.:-]*)(?:\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\}|\{\{([^}]*)\}\}|\(\(([^)]*)\)\)|\[\[([^\]]*)\]\])/g;
  let dm: RegExpExecArray | null;
  while ((dm = declNodo.exec(limpio)) !== null) {
    const id = dm[1];
    const contenido = dm[2] || dm[3] || dm[4] || dm[5] || dm[6] || dm[7] || "";
    if (mapaNodo.has(id)) {
      mapaNodo.get(id)!.etiqueta = contenido || id;
    } else {
      const forma = inferirFormaMermaid(dm[0]);
      mapaNodo.set(id, { id, etiqueta: contenido || id, forma });
      nodos.push({ id, etiqueta: contenido || id, forma });
      if (contenido) textos.push(contenido);
      mapaForma.set(id, forma);
    }
  }

  // Extraer aristas por operadores básicos.
  const aristasRegex = /([A-Za-z0-9_][A-Za-z0-9_.:-]*)(?:\s*([.~=-]+)(?:\|(.*?)(?:\||\|))?\s*([A-Za-z0-9_][A-Za-z0-9_.:-]*))/g;
  // Regex más simple para links: A --> B, A-.-> B, etc.
  const aristaSimple = /([A-Za-z0-9_][A-Za-z0-9_.:-]*)([-=]+[>.]*|[.][-]+[>])(?:\s*\|([^|\n]+)\|)?\s*([A-Za-z0-9_][A-Za-z0-9_.:-]*)/g;
  while ((dm = aristaSimple.exec(limpio)) !== null) {
    const fuente = dm[1];
    const destino = dm[4];
    const etiqueta = (dm[3] || "").trim();
    const idArista = `a-${aristas.length}`;
    aristas.push({ id: idArista, fuente, destino, etiqueta });
    if (etiqueta) textos.push(etiqueta);
  }

  // Sequence diagram básico.
  const seqRegex = /([A-Za-z][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z][A-Za-z0-9_]*))?/g;
  // No lo implementamos en detalle para evitar errores; mantenemos
  // los nodos que ya capturamos por nombres en mensajes.

  return { nodos, aristas, grupos, textos };
}
