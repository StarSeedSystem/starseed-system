export interface DiagramaIR {
  nodos: { id: string; label: string }[];
  aristas: { origen: string; destino: string; label?: string }[];
  grupos: string[];
  textos: string[];
}

export function desdeDrawio(xml: string): DiagramaIR {
  const nodos: { id: string; label: string }[] = [];
  const aristas: { origen: string; destino: string; label?: string }[] = [];
  const grupos: string[] = [];
  const textos: string[] = [];

  try {
    // Extract all mxCell tags (self-closing or with content)
    const mxCellRegex = /<mxCell\s+([^>]*)\/>|<mxCell\s+([^>]*)>[\s\S]*?<\/mxCell>/g;
    let match;
    while ((match = mxCellRegex.exec(xml)) !== null) {
      const attrString = match[1] || match[2];
      if (!attrString) continue;

      // Parse attributes
      const attrs: Record<string, string> = {};
      attrString.replace(/(\w+)=["']([^"']*)["']/g, (_, key, value) => {
        attrs[key] = value;
      });

      const id = attrs.id || '';
      const value = attrs.value || '';
      const vertex = attrs.vertex;
      const edge = attrs.edge;

      if (vertex === '1') {
        // It's a node
        const label = value || id;
        nodos.push({ id, label });
        textos.push(label);
      } else if (edge === '1') {
        // It's an edge
        const source = attrs.source || '';
        const target = attrs.target || '';
        // Extract label from value
        const label = value || undefined;
        if (source && target) {
          aristas.push({ origen: source, destino: target, label });
          if (label) {
            textos.push(label);
          }
        }
      }
    }

    // We don't handle groups in this simple implementation
  } catch (e) {
    // If parsing fails, return empty
    console.error('Error parsing draw.io XML:', e);
  }

  // Remove duplicate texts
  const uniqueTextos = [...new Set(textos)];

  return {
    nodos,
    aristas,
    grupos,
    textos: uniqueTextos,
  };
}

export function desdeExcalidraw(json: string): DiagramaIR {
  const nodos: { id: string; label: string }[] = [];
  const aristas: { origen: string; destino: string; label?: string }[] = [];
  const grupos: string[] = [];
  const textos: string[] = [];

  try {
    const data = JSON.parse(json);
    const elements = data.elements || [];

    for (const element of elements) {
      const id = element.id || '';
      const type = element.type || '';
      const label = element.label || '';

      if (type === 'rectangle' || type === 'ellipse' || type === 'diamond') {
        // It's a node
        const nodeLabel = label || id;
        nodos.push({ id, label: nodeLabel });
        textos.push(nodeLabel);
      } else if (type === 'arrow') {
        // It's an edge
        const source = element.startBinding?.elementId || '';
        const target = element.endBinding?.elementId || '';
        const edgeLabel = label || undefined;
        if (source && target) {
          aristas.push({ origen: source, destino: target, label: edgeLabel });
          if (edgeLabel) {
            textos.push(edgeLabel);
          }
        }
      }
      // We ignore other types for simplicity
    }

    // We don't handle groups in this simple implementation
  } catch (e) {
    console.error('Error parsing Excalidraw JSON:', e);
  }

  // Remove duplicate texts
  const uniqueTextos = [...new Set(textos)];

  return {
    nodos,
    aristas,
    grupos,
    textos: uniqueTextos,
  };
}

export function desdeMermaid(texto: string): DiagramaIR {
  const nodos: { id: string; label: string }[] = [];
  const aristas: { origen: string; destino: string; label?: string }[] = [];
  const textos: string[] = [];

  // Split into lines and skip the header line (flowchart TD, sequenceDiagram, etc.)
  const lines = texto.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  // Skip lines that start with flowchart or sequenceDiagram (the header)
  const contentLines = lines.filter(line => !line.startsWith('flowchart') && !line.startsWith('sequenceDiagram'));

  // Parse nodes: look for patterns like A[label], B(label), C{label} or plain IDs
  const nodeIdRegex = /(\w+)(?:\s*[\[\(\{]\s*([^\]\}]+)\s*[\]asterxml])?/g;
  for (const line of contentLines) {
    nodeIdRegex.lastIndex = 0;
    let match;
    while ((match = nodeIdRegex.exec(line)) !== null) {
      const id = match[1];
      const label = match[2] || id;
      // Avoid duplicates
      if (!nodos.some(n => n.id === id)) {
        nodos.push({ id, label });
        textos.push(label);
      }
    }
  }

  // Parse edges: split by arrow patterns and extract node IDs from left and right
  const arrowPattern = /\s*[-=>]+[>x]\s*/;
  const nodeIdRegex = /(\w+)(?:\s*[\[\(\{]\s*([^\]\}]+)\s*[\]\}\)])?/g;
  for (const line of contentLines) {
    // Debug: log the line and parts
    console.log('Processing line:', line);
    // Split the line by the arrow pattern, keeping the separator
    const parts = line.split(arrowPattern);
    console.log('Parts:', parts);
    if (parts.length >= 2) {
      // We have at least one arrow: left, right
      const leftPart = parts[0];
      const rightPart = parts[1];
      // Extract node ID from leftPart and rightPart using the nodeId regex
      nodeIdRegex.lastIndex = 0;
      const leftMatch = nodeIdRegex.exec(leftPart);
      nodeIdRegex.lastIndex = 0;
      const rightMatch = nodeIdRegex.exec(rightPart);
      console.log('Left match:', leftMatch);
      console.log('Right match:', rightMatch);
      if (leftMatch && rightMatch) {
        const origen = leftMatch[1];
        const labelLeft = leftMatch[2] || leftMatch[1];
        const destino = rightMatch[1];
        const labelRight = rightMatch[2] || rightMatch[1];
        // Avoid self-loops? Not necessary for now
        console.log('Pushing edge:', { origen, destino });
        aristas.push({ origen, destino });
        // We don't use the labels for edges in the result, but we could if needed.
      }
    }
    // If there are multiple arrows, we could process more, but for simplicity we take the first.
  }

  // Remove duplicate texts
  const uniqueTextos = [...new Set(textos)];

  const result = {
    nodos,
    aristas,
    grupos: [], // We don't handle groups in this simple implementation
    textos: uniqueTextos,
  };
  console.log('Result:', result);
  return result;
}