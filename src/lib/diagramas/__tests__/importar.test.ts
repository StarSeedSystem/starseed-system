import { describe, it, expect } from 'vitest';
import { desdeDrawio, desdeExcalidraw, desdeMermaid, DiagramaIR } from '../importar';

describe('desdeDrawio', () => {
  it('should parse a simple draw.io XML', () => {
    const xml = `<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Node 1" shape="ellipse" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="30" as="geometry"/></mxCell><mxCell id="3" value="Node 2" shape="rectangle" vertex="1" parent="1"><mxGeometry x="100" y="50" width="80" height="30" as="geometry"/></mxCell><mxCell id="4" style="edgeStyle=orthogonalEdgeStyle" edge="1" source="2" target="3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;
    const result: DiagramaIR = desdeDrawio(xml);
    expect(result.nodos.length).toBe(2);
    expect(result.aristas.length).toBe(1);
    expect(result.grupos.length).toBe(0);
    expect(result.textos.length).toBe(2);
  });
});

describe('desdeExcalidraw', () => {
  it('should parse a simple Excalidraw JSON', () => {
    const json = `{
      "type": "excalidraw",
      "version": 2,
      "source": "https://excalidraw.com",
      "elements": [
        {
          "type": "rectangle",
          "x": 0,
          "y": 0,
          "width": 100,
          "height": 50,
          "strokeColor": "#000000",
          "backgroundColor": "#ffffff",
          "id": "1",
          "label": "Node 1"
        },
        {
          "type": "rectangle",
          "x": 150,
          "y": 0,
          "width": 100,
          "height": 50,
          "strokeColor": "#000000",
          "backgroundColor": "#ffffff",
          "id": "2",
          "label": "Node 2"
        },
        {
          "type": "arrow",
          "x": 100,
          "y": 25,
          "width": 50,
          "height": 0,
          "strokeColor": "#000000",
          "startBinding": { "elementId": "1", "side": "right" },
          "endBinding": { "elementId": "2", "side": "left" },
          "id": "3"
        }
      ],
      "appState": {
        "theme": "light",
        "viewBackgroundColor": "#ffffff"
      },
      "commitToStorage": {
        "nextEmptyShapeId": 4
      }
    }`;
    const result: DiagramaIR = desdeExcalidraw(json);
    expect(result.nodos.length).toBe(2);
    expect(result.aristas.length).toBe(1);
    expect(result.grupos.length).toBe(0);
    expect(result.textos.length).toBe(2);
  });
});

describe('desdeMermaid', () => {
  it('should parse a simple flowchart', () => {
    const texto = `flowchart TD
    A[Node 1] --> B[Node 2]`;
    const result: DiagramaIR = desdeMermaid(texto);
    console.log('Flowchart result:', result);
    expect(result.nodos.length).toBe(2);
    expect(result.aristas.length).toBe(1);
    expect(result.grupos.length).toBe(0);
    expect(result.textos.length).toBe(2);
  });

  // Debug test for edge parsing in flowchart
  it('should debug edge parsing', () => {
    const texto = `A[Node 1] --> B[Node 2]`;
    const arrowPattern = /\s*[-=>]+[>x]\s*/;
    const parts = texto.split(arrowPattern);
    console.log('Parts:', parts);
    if (parts.length >= 3) {
      const leftPart = parts[0];
      const rightPart = parts[2];
      console.log('Left part:', leftPart);
      console.log('Right part:', rightPart);
      const nodeRegex = /(\w+)\s*[\[\(\{]\s*([^\]\}]+)\s*[\]\}\)]/g;
      const leftMatch = nodeRegex.exec(leftPart);
      const rightMatch = nodeRegex.exec(rightPart);
      console.log('Left match:', leftMatch);
      console.log('Right match:', rightMatch);
      if (leftMatch && rightMatch) {
        const origen = leftMatch[1];
        const destino = rightMatch[1];
        console.log('Edge:', { origen, destino });
      }
    }
  });

  it('should parse a simple sequence diagram', () => {
    const texto = `sequenceDiagram
    A->>B: Hello`;
    const result: DiagramaIR = desdeMermaid(texto);
    expect(result.nodos.length).toBe(2);
    expect(result.aristas.length).toBe(1);
    expect(result.grupos.length).toBe(0);
    expect(result.textos.length).toBe(2);
  });
});

// Debug test for Mermaid regex
describe('debug mermaid regex', () => {
  it('should log node matches', () => {
    const texto = `flowchart TD
    A[Node 1] --> B[Node 2]`;
    const nodeRegex = /(\w+)\s*[\[\(\{]\s*([^\]\}]+)\s*[\]\}\)]/g;
    let match;
    const matches = [];
    while ((match = nodeRegex.exec(texto)) !== null) {
      matches.push({ id: match[1], label: match[2] });
    }
    console.log('Node matches:', matches);
    expect(matches.length).toBeGreaterThan(0);
  });
  it('should log edge matches', () => {
    const texto = `flowchart TD
    A[Node 1] --> B[Node 2]`;
    const edgeRegex = /([A-Z][0-9]*)\s*([\-=>]*)\s*([>x]*)\s*:?\s*([A-Z][0-9]*)/g;
    let match;
    const allMatches = [];
    const filteredMatches = [];
    while ((match = edgeRegex.exec(texto)) !== null) {
      const origen = match[1];
      const destino = match[4];
      const arrow = match[2] + match[3];
      allMatches.push({ origen, destino, arrow });
      if (arrow.match(/[-=>]+[>x]/)) {
        filteredMatches.push({ origen, destino });
      }
    }
    console.log('All edge matches:', allMatches);
    console.log('Filtered edge matches:', filteredMatches);
    expect(filteredMatches.length).toBeGreaterThan(0);
  });
});