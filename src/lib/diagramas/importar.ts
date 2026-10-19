type Nodos = Array<{ id: string; label: string; shape?: string; parent?: string; depth?: number; x?: number; y?: number; w?: number; h?: number; fill?: string; stroke?: string; fontColor?: string; dashed?: boolean; rounded?: boolean; container?: boolean; children?: string[]; link?: string; attrs?: Record<string, string>; inDegree?: number; outDegree?: number }>;

type Aristas = Array<{ id: string; source?: string; target?: string; label: string; dashed?: boolean; bidirectional?: boolean; undirected?: boolean; styleName?: string; waypoints?: number; stroke?: string }>;

type Grupos = Array<{ id: string; label: string; shape?: string; parent?: string; depth?: number; x?: number; y?: number; w?: number; h?: number; fill?: string; stroke?: string; fontColor?: string; dashed?: boolean; rounded?: boolean; container?: boolean; children?: string[]; link?: string; attrs?: Record<string, string>; inDegree?: number; outDegree?: number }>;

type Textos = Array<{ id: string; content: string; shape?: string; parent?: string; depth?: number; x?: number; y?: number; w?: number; h?: number; fill?: string; stroke?: string; fontColor?: string; dashed?: boolean; rounded?: boolean; container?: boolean; children?: string[]; link?: string; attrs?: Record<string, string>; inDegree?: number; outDegree?: number }>;

export type DiagramRepresentation = {
  nodos: Nodos;
  aristas: Aristas;
  grupos: Grupos;
  textos: Textos;
};

export function desdeDrawio(xml: string): DiagramRepresentation {
  if (xml.length > 2 * 1024 * 1024) {
    throw new Error("Entrada draw.io excede el límite de 2 MB");
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    
    if (doc.querySelector("mxGraphModel")) {
      return parseDrawioMxGraphModel(doc);
    }
    
    if (doc.querySelector("mxfile")) {
      return parseDrawioMxFile(doc);
    }
    
    throw new Error("XML draw.io no contiene mxGraphModel o mxfile");
  } catch (error) {
    throw new Error(`Error al parsear XML draw.io: ${error instanceof Error ? error.message : 'Desconocido'}`);
  }
}

function parseDrawioMxGraphModel(doc: Document): DiagramRepresentation {
  const root = doc.querySelector("mxGraphModel");
  const pages = root ? Array.from(root.querySelectorAll("diagram")) : [];
  
  let allNodes: Nodos = [];
  let allEdges: Aristas = [];
  let allGroups: Grupos = [];
  let allTexts: Textos = [];
  
  pages.forEach(page => {
    const nodes: Nodos = [];
    const edges: Aristas = [];
    const groups: Grupos = [];
    const texts: Textos = [];
    
    const mxCells = Array.from(page.querySelectorAll("mxCell"));
    
    const cellMap = new Map<string, any>();
    mxCells.forEach(cell => {
      const id = cell.getAttribute("id");
      const value = cell.getAttribute("value") || "";
      const style = cell.getAttribute("style") || "";
      const parent = cell.getAttribute("parent");
      const vertex = cell.getAttribute("vertex") === "1";
      const edge = cell.getAttribute("edge") === "1";
      
      cellMap.set(id, { id, value, style, parent, vertex, edge, cell });
    });
    
    mxCells.forEach(cell => {
      const id = cell.getAttribute("id");
      const value = cell.getAttribute("value") || "";
      const style = cell.getAttribute("style") || "";
      const parent = cell.getAttribute("parent");
      const vertex = cell.getAttribute("vertex") === "1";
      const edge = cell.getAttribute("edge") === "1";
      const geometry = cell.querySelector("mxGeometry");
      
      if (!vertex || edge) return;
      
      const cleanedValue = cleanLabel(value);
      const parsedStyle = parseStyle(style);
      
      const node: any = {
        id,
        label: cleanedValue,
        shape: classifyShape(parsedStyle),
        parent,
        x: parseFloat(geometry?.getAttribute("x") || "0"),
        y: parseFloat(geometry?.getAttribute("y") || "0"),
        w: parseFloat(geometry?.getAttribute("width") || "0"),
        h: parseFloat(geometry?.getAttribute("height") || "0"),
        fill: parsedStyle.fillColor || "",
        stroke: parsedStyle.strokeColor || "",
        fontColor: parsedStyle.fontColor || "",
        dashed: parsedStyle.dashed === "1",
        rounded: parsedStyle.rounded === "1",
        container: parsedStyle.container === "1" || parsedStyle.shape === "swimlane",
        link: cell.getAttribute("link") || "",
        attrs: extractAttrs(cell)
      };
      
      nodes.push(node as any);
      
      if (cleanedValue && cleanedValue.trim()) {
        const text: any = {
          ...node,
          content: cleanedValue,
          id: `text-${id}`
        };
        texts.push(text as any);
      }
      
      if (parsedStyle.container || parsedStyle.shape === "swimlane") {
        const group: any = {
          ...node,
          id: `group-${id}`
        };
        groups.push(group as any);
      }
    });
    
    mxCells.forEach(cell => {
      const id = cell.getAttribute("id");
      const parent = cell.getAttribute("parent");
      const source = cell.getAttribute("source");
      const target = cell.getAttribute("target");
      const edge = cell.getAttribute("edge") === "1";
      
      if (!edge) return;
      
      const value = cell.getAttribute("value") || "";
      const style = cell.getAttribute("style") || "";
      const cleanedValue = cleanLabel(value);
      const parsedStyle = parseStyle(style);
      
      const parentCell = cellMap.get(parent || "");
      const sourceCell = source ? cellMap.get(source) : null;
      const targetCell = target ? cellMap.get(target) : null;
      
      const edgeObj: any = {
        id,
        source: sourceCell?.id,
        target: targetCell?.id,
        label: cleanedValue,
        dashed: parsedStyle.dashed === "1",
        bidirectional: parsedStyle.startArrow === "classic" && parsedStyle.endArrow === "classic",
        undirected: parsedStyle.startArrow === "none" && parsedStyle.endArrow === "none",
        styleName: parsedStyle.shape || parsedStyle.edgeStyle || "",
        stroke: parsedStyle.strokeColor || ""
      };
      
      edges.push(edgeObj as any);
      
      if (cleanedValue && cleanedValue.trim()) {
        const text: any = {
          id: `text-edge-${id}`,
          content: cleanedValue,
          shape: "text",
          parent: id,
          source: sourceCell?.id,
          target: targetCell?.id
        };
        texts.push(text as any);
      }
    });
    
    allNodes = allNodes.concat(nodes);
    allEdges = allEdges.concat(edges);
    allGroups = allGroups.concat(groups);
    allTexts = allTexts.concat(texts);
  });
  
  return {
    nodos: allNodes,
    aristas: allEdges,
    grupos: allGroups,
    textos: allTexts
  };
}

function parseDrawioMxFile(doc: Document): DiagramRepresentation {
  const mxfiles = Array.from(doc.querySelectorAll("mxfile"));
  let allNodes: Nodos = [];
  let allEdges: Aristas = [];
  let allGroups: Grupos = [];
  let allTexts: Textos = [];
  
  mxfiles.forEach(mxfile => {
    const diagrams = Array.from(mxfile.querySelectorAll("diagram"));
    if (diagrams.length === 0) {
      const graph = mxfile.querySelector("mxGraphModel");
      if (graph) {
        diagrams.push(graph as Element);
      }
    }
    
    diagrams.forEach(diagram => {
      const result = parseDrawioMxGraphModel(diagram as Element);
      allNodes = allNodes.concat(result.nodos);
      allEdges = allEdges.concat(result.aristas);
      allGroups = allGroups.concat(result.grupos);
      allTexts = allTexts.concat(result.textos);
    });
  });
  
  return {
    nodos: allNodes,
    aristas: allEdges,
    grupos: allGroups,
    textos: allTexts
  };
}

export function desdeExcalidraw(json: string): DiagramRepresentation {
  if (json.length > 2 * 1024 * 1024) {
    throw new Error("Entrada Excalidraw excede el límite de 2 MB");
  }
  
  try {
    const data = JSON.parse(json);
    
    if (!data.type || data.type !== "excalidraw") {
      throw new Error("JSON no es un archivo de Excalidraw válido");
    }
    
    if (!data.elements) {
      throw new Error("Archivo Excalidraw no contiene elementos");
    }
    
    return parseExcalidrawElements(data.elements, data.name || "");
  } catch (error) {
    throw new Error(`Error al parsear JSON Excalidraw: ${error instanceof Error ? error.message : 'Desconocido'}`);
  }
}

function parseExcalidrawElements(elements: any[], name: string): DiagramRepresentation {
  let allNodes: Nodos = [];
  let allEdges: Aristas = [];
  let allGroups: Grupos = [];
  let allTexts: Textos = [];
  
  const liveElements = elements.filter(el => !el.isDeleted);
  
  const nodeMap = new Map<string, any>();
  
  liveElements.forEach(element => {
    const id = element.id;
    const type = element.type;
    
    if (type === "text") {
      return;
    }
    
    if (type === "frame" || type === "magicframe") {
      const node: any = {
        id,
        label: element.name || `Frame-${name.length + 1}`, 
        shape: "frame",
        container: true,
        x: element.x || 0,
        y: element.y || 0,
        w: element.width || 0,
        h: element.height || 0,
        fill: element.backgroundColor || "",
        stroke: element.strokeColor || "",
        fontColor: element.fontSize ? "" : ""
      };
      nodeMap.set(id, node);
      allNodes.push(node as any);
      allGroups.push(node as any);
      return;
    }
    
    if (type === "rectangle" || type === "ellipse" || type === "diamond" || type === "image" || type === "embeddable" || type === "iframe") {
      const shapeMap: Record<string, string> = {
        "rectangle": "rect",
        "ellipse": "ellipse",
        "diamond": "rhombus",
        "image": "image",
        "embeddable": "embed",
        "iframe": "embed"
      };
      
      const parent = element.containerId || element.groupId;
      const node: any = {
        id,
        label: element.text?.content || "",
        shape: shapeMap[type] || "rect",
        container: false,
        x: element.x || 0,
        y: element.y || 0,
        w: element.width || 0,
        h: element.height || 0,
        fill: element.backgroundColor || "",
        stroke: element.strokeColor || "",
        fontColor: element.fontSize ? "" : ""
      };
      
      if (parent) {
        node.parent = parent;
      }
      
      nodeMap.set(id, node);
      allNodes.push(node as any);
      
      if (element.text?.content) {
        const text: any = {
          ...node,
          content: element.text.content,
          id: `text-${id}`
        };
        allTexts.push(text as any);
      }
      
      return;
    }
  });
  
  liveElements.forEach(element => {
    const id = element.id;
    const type = element.type;
    
    if (type !== "arrow" && type !== "line") {
      return;
    }
    
    const sourceBinding = element.startBinding?.elementId;
    const targetBinding = element.endBinding?.elementId;
    
    const source = sourceBinding && nodeMap.has(sourceBinding) ? sourceBinding : null;
    const target = targetBinding && nodeMap.has(targetBinding) ? targetBinding : null;
    
    const isArrow = type === "arrow";
    const startArrowhead = element.startArrowhead;
    const endArrowhead = element.endArrowhead;
    
    const edge: any = {
      id,
      source,
      target,
      label: element.text?.content || "",
      dashed: element.strokeStyle === "dashed" || element.strokeStyle === "dotted",
      bidirectional: isArrow && startArrowhead && endArrowhead,
      undirected: isArrow && !startArrowhead && !endArrowhead,
      stroke: element.strokeColor || ""
    };
    
    allEdges.push(edge as any);
    
    if (element.text?.content) {
      const text: any = {
        id: `text-edge-${id}`,
        content: element.text.content,
        shape: "text",
        parent: id,
        source,
        target
      };
      allTexts.push(text as any);
    }
    
    if (source && nodeMap.has(source)) {
      nodeMap.get(source).outDegree = (nodeMap.get(source).outDegree || 0) + 1;
    }
    
    if (target && nodeMap.has(target)) {
      nodeMap.get(target).inDegree = (nodeMap.get(target).inDegree || 0) + 1;
    }
  });
  
  allNodes.forEach(node => {
    const parent = node.parent;
    if (parent && nodeMap.has(parent)) {
      if (!nodeMap.get(parent).children) {
        nodeMap.get(parent).children = [];
      }
      nodeMap.get(parent).children.push(node.id);
      nodeMap.get(parent).container = true;
    }
  });
  
  const uniqueGroups = allGroups.filter((group, index, self) =>
    index === self.findIndex(g => g.id === group.id)
  );
  
  return {
    nodos: allNodes,
    aristas: allEdges,
    grupos: uniqueGroups,
    textos: allTexts
  };
}

export function desdeMermaid(text: string): DiagramRepresentation {
  if (text.length > 2 * 1024 * 1024) {
    throw new Error("Entrada Mermaid excede el límite de 2 MB");
  }
  
  if (!text.trim()) {
    throw new Error("Entrada Mermaid vacía");
  }
  
  try {
    return parseMermaidText(text);
  } catch (error) {
    throw new Error(`Error al parsear texto Mermaid: ${error instanceof Error ? error.message : 'Desconocido'}`);
  }
}

function parseMermaidText(text: string): DiagramRepresentation {
  let allNodes: Nodos = [];
  let allEdges: Aristas = [];
  let allGroups: Grupos = [];
  let allTexts: Textos = [];
  
  const lines = text.split('\n');
  const nodeMap = new Map<string, any>();
  const edgeList: any[] = [];
  
  const flowchartRegex = /^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\s*$/i;
  const sequenceRegex = /^\s*sequenceDiagram\s*$/i;
  const stateRegex = /^\s*stateDiagram-v2\s*$/i;
  const erRegex = /^\s*erDiagram\s*$/i;
  
  let currentDiagram: string | null = null;
  let currentDirection = "TD";
  
  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    
    if (flowchartRegex.test(trimmed)) {
      currentDiagram = "flowchart";
      return;
    }
    
    if (sequenceRegex.test(trimmed)) {
      currentDiagram = "sequenceDiagram";
      return;
    }
    
    if (stateRegex.test(trimmed)) {
      currentDiagram = "stateDiagram-v2";
      return;
    }
    
    if (erRegex.test(trimmed)) {
      currentDiagram = "erDiagram";
      return;
    }
    
    if (currentDiagram === "flowchart" || currentDiagram === "graph") {
      parseFlowchartLine(trimmed, lineIndex, nodeMap, edgeList, allNodes, allEdges, allGroups, allTexts);
    } else if (currentDiagram === "sequenceDiagram") {
      parseSequenceDiagramLine(trimmed, lineIndex, nodeMap, edgeList, allNodes, allEdges, allGroups, allTexts);
    } else if (currentDiagram === "stateDiagram-v2") {
      parseStateDiagramLine(trimmed, lineIndex, nodeMap, edgeList, allNodes, allEdges, allGroups, allTexts);
    } else if (currentDiagram === "erDiagram") {
      parseErDiagramLine(trimmed, lineIndex, nodeMap, edgeList, allNodes, allEdges, allGroups, allTexts);
    }
  });
  
  return {
    nodos: allNodes,
    aristas: allEdges,
    grupos: allGroups,
    textos: allTexts
  };
}

function parseFlowchartLine(
  line: string,
  lineIndex: number,
  nodeMap: Map<string, any>,
  edgeList: any[],
  allNodes: Nodos,
  allEdges: Aristas,
  allGroups: Grupos,
  allTexts: Textos
): void {
  const directionMatch = line.match(/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\s*$/i);
  if (directionMatch) {
    return;
  }
  
  const subgraphMatch = line.match(/^\s*subgraph\s+([\w.-]+)\s*$/i);
  if (subgraphMatch) {
    const groupId = subgraphMatch[1];
    const group: any = {
      id: groupId,
      label: cleanMermaidLabel(groupId),
      shape: "container",
      container: true
    };
    nodeMap.set(groupId, group);
    allGroups.push(group as any);
    return;
  }
  
  const endMatch = line.match(/^\s*end\s*$/i);
  if (endMatch) {
    return;
  }
  
  const edgeOperators = line.match(/([<]?[--]{2,}|[-]?[=]{2,}>|[-]?[--]{3,}>|[-]?[-]{2,}[ox]|[<]?[=]{2,}>|[<]?[-]{2,}>|[-]?[=]{2,}<|[<]?[-]{2,}<|[-]?[-]{3,}<|[<]?[=]{2,}<|[<]?[-]{2,}<)/g);
  if (edgeOperators) {
    const parts = splitMermaidLineByOperators(line);
    const validGroups = parts.filter(part => part.trim()).map(part => {
      const parsed = parseMermaidNodeExpression(part.trim());
      if (parsed) {
        const [nodeId, label, shape] = parsed;
        if (!nodeMap.has(nodeId)) {
          const node: any = {
            id: nodeId,
            label: label || nodeId,
            shape: shape || "rect"
          };
          nodeMap.set(nodeId, node);
          allNodes.push(node as any);
        }
        return nodeId;
      }
      return null;
    }).filter(id => id !== null);
    
    if (validGroups.length >= 2) {
      for (let i = 0; i < validGroups.length - 1; i++) {
        const source = validGroups[i];
        const target = validGroups[i + 1];
        const operator = edgeOperators[i] || "-->";
        
        const style = operator.includes("~") ? "invisible" :
                     operator.includes(".") ? "dashed" :
                     operator.includes("=") ? "thick" : "solid";
        
        const arrowhead = operator.endsWith("x") ? "cross" :
                         operator.endsWith("o") ? "circle" : "arrow";
        
        const undirected = operator.includes(">") && !operator.includes("<");
        const bidirectional = operator.includes("<") && operator.includes(">");
        
        const edge: any = {
          id: `e${allEdges.length + 1}`,
          source,
          target,
          style,
          arrowhead,
          bidirectional,
          undirected
        };
        
        edgeList.push(edge as any);
      }
    }
    
    return;
  }
  
  const nodeExpression = parseMermaidNodeExpression(line);
  if (nodeExpression) {
    const [nodeId, label, shape] = nodeExpression;
    if (!nodeMap.has(nodeId)) {
      const node: any = {
        id: nodeId,
        label: label || nodeId,
        shape: shape || "rect"
      };
      nodeMap.set(nodeId, node);
      allNodes.push(node as any);
    }
  }
}

function splitMermaidLineByOperators(line: string): string[] {
  const operators = line.match(/([<]?[--]{2,}|[-]?[=]{2,}>|[-]?[--]{3,}>|[-]?[--]{2,}[ox]|[<]?[=]{2,}>|[<]?[-]{2,}>|[-]?[=]{2,}<|[<]?[-]{2,}<|[-]?[=]{2,}<|[-]?[--]{3,}<|[<]?[=]{2,}<|[<]?[-]{2,}<|[-]?[=]{2,}<)/g) || [];
  if (operators.length === 0) {
    return [line];
  }
  
  const parts: string[] = [];
  let lastIndex = 0;
  
  operators.forEach((operator, index) => {
    const operatorIndex = line.indexOf(operator, lastIndex);
    if (operatorIndex > lastIndex) {
      parts.push(line.substring(lastIndex, operatorIndex));
    }
    lastIndex = operatorIndex + operator.length;
  });
  
  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }
  
  return parts.filter(part => part.trim());
}

function parseMermaidNodeExpression(expression: string): [string, string, string] | null {
  const cleaned = expression.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  
  const match = cleaned.match(/^([\w.:-]+)(?:\s*(?:\[@{[^}]*\}))?/);
  if (!match) return null;
  
  const nodeId = match[1];
  let label = nodeId;
  let shape = "rect";
  
  const rest = cleaned.substring(match[0].length).trim();
  if (rest) {
    const expanded = parseMermaidExpandedAttributes(rest);
    if (expanded) {
      label = expanded[0] || label;
      shape = expanded[1] || shape;
    } else {
      const shapeDelimiters = [
        ["(((", ")))", "circle"],
        ["((", "))", "circle"],
        ["([", "])", "stadium"],
        ["{{", "}}", "hexagon"],
        ["([", ")]", "cylinder"],
        ["[[", "]]", "subroutine"],
        ["[/", "/]", "parallelogram"],
        ["[\\", "\\]", "parallelogram"],
        ["[/", "\\]", "trapezoid"],
        ["[\\", "/]", "trapezoid"],
        ["[", "]", "rect"],
        ["(", ")", "round"],
        ["{", "}", "rhombus"],
        [">", "]", "asymmetric"]
      ];
      
      for (const [open, close, shapeName] of shapeDelimiters) {
        if (rest.startsWith(open) && rest.endsWith(close)) {
          const innerText = rest.substring(open.length, rest.length - close.length);
          label = cleanMermaidLabel(innerText);
          shape = shapeName;
          break;
        }
      }
    }
  }
  
  return [nodeId, label, shape];
}

function parseMermaidExpandedAttributes(text: string): [string, string] | null {
  const attrRegex = /\s*@\{([^}]*)\}/;
  const match = text.match(attrRegex);
  if (!match) return null;
  
  const attrText = match[1];
  const attrs: Record<string, string> = {};
  
  attrText.split(',').forEach(part => {
    const [key, value] = part.split(':').map(s => s.trim());
    if (key && value) {
      attrs[key] = value;
    }
  });
  
  const shapeName = attrs.shape?.toLowerCase();
  const shapeMap: Record<string, string> = {
    "rect": "rect",
    "rectangle": "rect",
    "proc": "rect",
    "process": "rect",
    "rounded": "round",
    "event": "round",
    "stadium": "stadium",
    "pill": "stadium",
    "terminal": "stadium",
    "circle": "circle",
    "circ": "circle",
    "sm-circ": "circle",
    "small-circle": "circle",
    "start": "circle",
    "dbl-circ": "circle",
    "double-circle": "circle",
    "fr-circ": "circle",
    "framed-circle": "circle",
    "stop": "circle",
    "cyl": "cylinder",
    "cylinder": "cylinder",
    "database": "cylinder",
    "db": "cylinder",
    "h-cyl": "cylinder",
    "horizontal-cylinder": "cylinder",
    "lin-cyl": "cylinder",
    "lined-cylinder": "cylinder",
    "diam": "rhombus",
    "decision": "rhombus",
    "diamond": "rhombus",
    "question": "rhombus",
    "hex": "hexagon",
    "hexagon": "hexagon",
    "prepare": "hexagon",
    "fr-rect": "subroutine",
    "framed-rectangle": "subroutine",
    "subproc": "subroutine",
    "subprocess": "subroutine",
    "subroutine": "subroutine",
    "lean-r": "parallelogram",
    "lean-l": "parallelogram",
    "in-out": "parallelogram",
    "lean-right": "parallelogram",
    "lean-left": "parallelogram",
    "out-in": "parallelogram",
    "trap-t": "trapezoid",
    "trap-b": "trapezoid",
    "trapezoid": "trapezoid",
    "inv-trapezoid": "trapezoid",
    "manual": "trapezoid",
    "priority": "trapezoid"
  };
  
  const shape = shapeName ? shapeMap[shapeName] || shapeName : "rect";
  const label = attrs.label || "";
  
  return [label, shape];
}

function cleanMermaidLabel(text: string): string {
  if (!text) return "";
  
  text = text.trim();
  if (text.startsWith("\"") && text.endsWith("\"")) {
    text = text.substring(1, text.length - 1);
  }
  
  if (text.startsWith("`") && text.endsWith("`")) {
    text = text.substring(1, text.length - 1);
  }
  
  text = text.replace(/\\\"/g, '"').replace(/\\\'/g, "'");
  
  return text;
}

function parseSequenceDiagramLine(
  line: string,
  lineIndex: number,
  nodeMap: Map<string, any>,
  edgeList: any[],
  allNodes: Nodos,
  allEdges: Aristas,
  allGroups: Grupos,
  allTexts: Textos
): void {
  const participantRegex = /^(?:create\s+)?(participant|actor)\s+(?:\"([^\"]+)\"|'([^']+)'|([\w.:-]+))(?:\s+as\s+(.+))?$/i;
  const messageRegex = /^([\w.:.-]+(?:\s+[\w.:.-]+)*?)\s*(?:\(\))?\s*(<<--?>>|--?>>|--?>|--?\)|--?x)\s*[+-]?\s*(?:\(\))?([\w.:.-]+(?:\s+[\w.:.-]+)*?)\s*:\s*(.*)$/; 
  
  const participantMatch = line.match(participantRegex);
  if (participantMatch) {
    const kind = participantMatch[1].toLowerCase();
    const quoted = participantMatch[2] || participantMatch[3];
    const bare = participantMatch[4];
    const alias = participantMatch[5];
    
    let nodeId: string;
    let nodeLabel: string;
    
    if (quoted !== null) {
      nodeId = alias || quoted;
      nodeLabel = quoted;
    } else {
      nodeId = bare;
      nodeLabel = alias || bare;
    }
    
    const node: any = {
      id: nodeId,
      label: nodeLabel,
      shape: kind === "actor" ? "actor" : "lifeline"
    };
    
    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, node);
      allNodes.push(node as any);
    }
    
    return;
  }
  
  const messageMatch = line.match(messageRegex);
  if (messageMatch) {
    const source = messageMatch[1];
    const token = messageMatch[2];
    const target = messageMatch[3];
    const label = messageMatch[4] || "";
    
    if (!nodeMap.has(source)) {
      const node: any = {
        id: source,
        label: source,
        shape: "lifeline"
      };
      nodeMap.set(source, node);
      allNodes.push(node as any);
    }
    
    if (!nodeMap.has(target)) {
      const node: any = {
        id: target,
        label: target,
        shape: "lifeline"
      };
      nodeMap.set(target, node);
      allNodes.push(node as any);
    }
    
    const arrowhead = token.endsWith("x") ? "cross" :
                     token.endsWith(")") ? "async" :
                     token.endsWith(">>" ) ? "arrow" : "none";
    
    const edge: any = {
      id: `e${edgeList.length + 1}`,
      source,
      target,
      label: label || "",
      arrowhead,
      bidirectional: token.startsWith("<<"),
      undirected: arrowhead === "none"
    };
    
    edgeList.push(edge as any);
    allEdges.push(edge as any);
    
    if (label) {
      const text: any = {
        id: `text-${edge.id}`,
        content: label,
        shape: "text",
        parent: edge.id
      };
      allTexts.push(text as any);
    }
    
    return;
  }
}

function parseStateDiagramLine(
  line: string,
  lineIndex: number,
  nodeMap: Map<string, any>,
  edgeList: any[],
  allNodes: Nodos,
  allEdges: Aristas,
  allGroups: Grupos,
  allTexts: Textos
): void {
  const compositeMatch = line.match(/^\s*state\s+([\w.:-]+)\s*\{$/);
  if (compositeMatch) {
    const groupId = compositeMatch[1];
    const group: any = {
      id: groupId,
      label: groupId,
      shape: "container",
      container: true
    };
    nodeMap.set(groupId, group);
    allGroups.push(group as any);
    return;
  }
  
  if (line.match(/^\s*}/)) {
    return;
  }
  
  const descriptionMatch = line.match(/^\s*([\w.:-]+)\s*:\s*(.+)$/);
  if (descriptionMatch) {
    const nodeId = descriptionMatch[1];
    const label = descriptionMatch[2];
    
    const node: any = {
      id: nodeId,
      label: label || nodeId,
      shape: "state"
    };
    
    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, node);
      allNodes.push(node as any);
    }
    
    return;
  }
  
  const arrowMatch = line.match(/^\s*(?:([\w.:.-]+))?\s*(-->)\s*(?:([\w.:.-]+))?\s*(?::\s*(.*))?$/);
  if (arrowMatch) {
    const source = arrowMatch[1] || "";
    const target = arrowMatch[3] || "";
    const label = arrowMatch[4] || "";
    
    if (source && !nodeMap.has(source)) {
      const node: any = {
        id: source,
        label: source,
        shape: "state"
      };
      nodeMap.set(source, node);
      allNodes.push(node as any);
    }
    
    if (target && !nodeMap.has(target)) {
      const node: any = {
        id: target,
        label: target,
        shape: "state"
      };
      nodeMap.set(target, node);
      allNodes.push(node as any);
    }
    
    if (source && target) {
      const edge: any = {
        id: `e${edgeList.length + 1}`,
        source,
        target,
        label: label || "",
        style: "solid"
      };
      
      edgeList.push(edge as any);
      allEdges.push(edge as any);
      
      if (label) {
        const text: any = {
          id: `text-${edge.id}`,
          content: label,
          shape: "text",
          parent: edge.id
        };
        allTexts.push(text as any);
      }
    }
    
    return;
  }
}

function parseErDiagramLine(
  line: string,
  lineIndex: number,
  nodeMap: Map<string, any>,
  edgeList: any[],
  allNodes: Nodos,
  allEdges: Aristas,
  allGroups: Grupos,
  allTexts: Textos
): void {
  if (line.match(/^\s*}/)) {
    return;
  }
  
  const entityMatch = line.match(/^\s*([\w.:-]+)\s*\{$/);
  if (entityMatch) {
    const entityId = entityMatch[1];
    const entity: any = {
      id: entityId,
      label: entityId,
      shape: "table",
      container: true
    };
    nodeMap.set(entityId, entity);
    allNodes.push(entity as any);
    allGroups.push(entity as any);
    return;
  }
  
  const fieldMatch = line.match(/^\s*([\w.:-]+)\s*:\s*(.+)$/);
  if (fieldMatch) {
    return;
  }
  
  const relationshipMatch = line.match(/^\s*([\w.:.-]+)\s*(--|\.\.)\s*([\w.:.-]+)(?::\s*(.*))?$/);
  if (relationshipMatch) {
    const source = relationshipMatch[1];
    const cardinality = relationshipMatch[2];
    const target = relationshipMatch[3];
    const label = relationshipMatch[4] || "";
    
    if (!nodeMap.has(source)) {
      const node: any = {
        id: source,
        label: source,
        shape: "table"
      };
      nodeMap.set(source, node);
      allNodes.push(node as any);
    }
    
    if (!nodeMap.has(target)) {
      const node: any = {
        id: target,
        label: target,
        shape: "table"
      };
      nodeMap.set(target, node);
      allNodes.push(node as any);
    }
    
    const edge: any = {
      id: `e${edgeList.length + 1}`,
      source,
      target,
      label: label || `${cardinality} relationship`,
      style: cardinality === ".." ? "dashed" : "solid",
      arrowhead: "cardinality",
      undirected: true
    };
    
    edgeList.push(edge as any);
    allEdges.push(edge as any);
    
    return;
  }
}

function cleanLabel(value: string): string {
  if (!value) return "";
  
  value = value.replace(/<br\s*\/?>/gi, "\n");
  value = value.replace(/<\/?p\s*>/gi, "\n");
  value = value.replace(/<\/?div\s*>/gi, "\n");
  
  value = value.replace(/<[^>]+>/g, "");
  
  return value
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(line => line)
    .join("\n")
    .trim();
}

function parseStyle(style: string): any {
  const styles: Record<string, string> = {};
  
  if (!style) return styles;
  
  style.split(";").forEach(part => {
    const [key, value] = part.split("=").map(s => s.trim());
    if (key && value) {
      styles[key] = value;
    } else if (key) {
      styles[key] = "1";
    }
  });
  
  return styles;
}

function classifyShape(style: any): string {
  const shapeKeys = [
    ["swimlane", "swimlane"],
    ["ellipse", "ellipse"],
    ["rhombus", "rhombus"],
    ["triangle", "triangle"],
    ["cylinder", "cylinder"],
    ["cylinder3", "cylinder"],
    ["hexagon", "hexagon"],
    ["cloud", "cloud"],
    ["actor", "actor"],
    ["umlActor", "actor"],
    ["note", "note"],
    ["card", "card"],
    ["step", "step"],
    ["process", "process"],
    ["parallelogram", "parallelogram"],
    ["document", "document"],
    ["datastore", "cylinder"],
    ["umlLifeline", "lifeline"],
    ["umlFrame", "frame"],
    ["table", "table"],
    ["tableRow", "table-row"],
    ["partialRectangle", "table-row"],
    ["image", "image"],
    ["text", "text"],
    ["group", "group"]
  ];
  
  for (const [key, name] of shapeKeys) {
    if (style.shape === key || style.shape?.startsWith(key)) {
      return name;
    }
  }
  
  for (const [prefix, family] of [
    ["mxgraph.aws", "aws"],
    ["mxgraph.azure", "azure"],
    ["mxgraph.gcp", "gcp"],
    ["mxgraph.kubernetes", "kubernetes"],
    ["mxgraph.cisco", "network"],
    ["mxgraph.veeam", "infra"],
    ["mxgraph.flowchart", "flowchart"],
    ["mxgraph.bpmn", "bpmn"],
    ["mxgraph.er", "er"],
    ["mxgraph.sysml", "uml"],
    ["mxgraph.archimate", "archimate"]
  ]) {
    if (style.shape?.startsWith(prefix)) {
      return `icon:${family}`;
    }
  }
  
  if (style.ellipse === "1") {
    return "ellipse";
  }
  
  return "rect";
}

function extractAttrs(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  
  Array.from(element.attributes).forEach(attr => {
    if (!["id", "value", "style", "parent", "vertex", "edge", "label", "link"].includes(attr.name)) {
      attrs[attr.name] = attr.value;
    }
  });
  
  return attrs;
}
