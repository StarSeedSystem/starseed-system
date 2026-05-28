/**
 * 🌌 StarSeed OS — Harmonic Force Graph Engine
 *
 * Motor de simulación física para el Living Graph 3D.
 * Implementa:
 * - Atracción armónica entre nodos conectados (Ley de Hooke armónica)
 * - Repulsión de Coulomb entre todos los nodos
 * - Gravedad hacia el centro
 * - Amortiguamiento progresivo
 *
 * Las fuerzas se modulan por:
 * - Peso de la conexión (más peso = más atracción)
 * - Frecuencia del nodo (frecuencias cercanas se atraen más)
 * - Capa activa (solo calcula fuerzas entre nodos visibles)
 */

import type { HarmonicConfig, GraphNode3D, GraphEdge3D } from './01-types';

// ========================================================================
// Configuración por defecto
// ========================================================================

export const DEFAULT_HARMONIC_CONFIG: HarmonicConfig = {
  harmonicAttraction: 0.008,
  repulsion: 80,
  connectionDistance: 300,
  damping: 0.92,
  centerGravity: 0.003,
  minVelocity: 0.5,
};

// ========================================================================
// 3D Vector helpers (lightweight, no THREE dependency)
// ========================================================================

interface Vec3 { x: number; y: number; z: number; }

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vNormalize(v: Vec3): Vec3 {
  const len = vLength(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vDistance(a: Vec3, b: Vec3): number {
  return vLength(vSub(a, b));
}

// ========================================================================
// Frequency-based modulation factors
// ========================================================================

/** Frecuencias base Solfeggio para modulación armónica */
const SOLFEGGIO = {
  UT: 396,   // Liberación
  RE: 417,   // Facilitación / Cambio
  MI: 528,   // Transformación / ADN
  FA: 639,   // Conexión / Relaciones
  SOL: 741,  // Expresión / Soluciones
  LA: 852,   // Despertar / Intuición
  SI: 963,   // Luz cósmica / Trascendencia
};

function harmonicModulation(freqA: number, freqB: number): number {
  // Dos nodos con frecuencias similares se atraen más
  const ratio = Math.min(freqA, freqB) / Math.max(freqA, freqB);
  // Mapear a [0.5, 1.5] — nodos armónicos se atraen más
  return 0.5 + ratio;
}

// ========================================================================
// Harmonic Force Engine
// ========================================================================

export class HarmonicForceEngine {
  private nodes: Map<string, GraphNode3D> = new Map();
  private edges: GraphEdge3D[] = [];
  private config: HarmonicConfig;
  private iteration = 0;
  private selectedNodeId: string | null = null;
  public stabilised = false;

  constructor(config?: Partial<HarmonicConfig>) {
    this.config = { ...DEFAULT_HARMONIC_CONFIG, ...config };
  }

  load(nodes: GraphNode3D[], edges: GraphEdge3D[]): void {
    this.nodes.clear();
    for (const node of nodes) {
      // Clone to avoid mutation of source data
      this.nodes.set(node.id, {
        ...node,
        position: { ...node.position },
        velocity: { ...node.velocity },
      });
    }
    this.edges = edges;
    this.iteration = 0;
    this.stabilised = false;
  }

  selectNode(id: string | null): void {
    this.selectedNodeId = id;
  }

  getNode(id: string): GraphNode3D | undefined {
    return this.nodes.get(id);
  }

  tick(): void {
    this.iteration++;
    const nodeArray = Array.from(this.nodes.values());
    if (nodeArray.length === 0) return;

    // Inicializar fuerzas acumuladas
    const forces: Map<string, Vec3> = new Map();
    for (const node of nodeArray) {
      forces.set(node.id, { x: 0, y: 0, z: 0 });
    }

    // ====================================================================
    // 1. ATRACCIÓN ARMÓNICA entre nodos conectados
    // ====================================================================
    for (const edge of this.edges) {
      const source = this.nodes.get(edge.source);
      const target = this.nodes.get(edge.target);
      if (!source || !target) continue;

      const delta = vSub(target.position, source.position);
      const distance = Math.max(vLength(delta), 1);

      // Solo atraer si están dentro del rango de conexión
      if (distance > this.config.connectionDistance) continue;

      // Dirección normalizada
      const dir = vNormalize(delta);

      // Fuerza de atracción armónica:
      // - Proporcional a la distancia (Hooke)
      // - Modulada por el peso de la conexión
      // - Modulada por la frecuencia armónica entre los dos nodos
      const harmonicFactor = harmonicModulation(edge.frequency, source.frequency);
      const attraction = distance * this.config.harmonicAttraction
        * edge.weight
        * harmonicFactor;

      // Si un nodo está seleccionado, sus conexiones se atraen más
      const selectionBoost = (
        source.id === this.selectedNodeId ||
        target.id === this.selectedNodeId
      ) ? 2.5 : 1.0;

      const force = vScale(dir, attraction * selectionBoost);

      // Aplicar fuerza a ambos nodos (acción-reacción)
      forces.get(edge.source)!.x += force.x;
      forces.get(edge.source)!.y += force.y;
      forces.get(edge.source)!.z += force.z;
      forces.get(edge.target)!.x -= force.x;
      forces.get(edge.target)!.y -= force.y;
      forces.get(edge.target)!.z -= force.z;
    }

    // ====================================================================
    // 2. REPULSIÓN DE COULOMB entre todos los nodos
    // ====================================================================
    for (let i = 0; i < nodeArray.length; i++) {
      for (let j = i + 1; j < nodeArray.length; j++) {
        const a = nodeArray[i];
        const b = nodeArray[j];
        const delta = vSub(b.position, a.position);
        const distance = Math.max(vLength(delta), 1);

        // Fuerza inversamente proporcional al cuadrado de la distancia
        const repulsionForce = this.config.repulsion / (distance * distance);

        // Modulada por el tamaño de los nodos (más grandes = más repulsión)
        const sizeFactor = (a.size + b.size) / 10;
        const force = vScale(vNormalize(delta), repulsionForce * sizeFactor);

        forces.get(a.id)!.x -= force.x;
        forces.get(a.id)!.y -= force.y;
        forces.get(a.id)!.z -= force.z;
        forces.get(b.id)!.x += force.x;
        forces.get(b.id)!.y += force.y;
        forces.get(b.id)!.z += force.z;
      }
    }

    // ====================================================================
    // 3. GRAVEDAD HACIA EL CENTRO
    // ====================================================================
    for (const node of nodeArray) {
      const distance = vLength(node.position);
      const centerForce = vScale(
        vNormalize(node.position),
        -this.config.centerGravity * node.mass * distance
      );
      forces.get(node.id)!.x += centerForce.x;
      forces.get(node.id)!.y += centerForce.y;
      forces.get(node.id)!.z += centerForce.z;
    }

    // ====================================================================
    // 4. APLICAR FUERZAS con amortiguamiento
    // ====================================================================
    let totalVelocity = 0;

    for (const node of nodeArray) {
      const force = forces.get(node.id)!;

      // Aceleración = Fuerza / Masa
      const acceleration = vScale(force, 1 / Math.max(node.mass, 0.1));

      // Velocidad con amortiguamiento
      node.velocity = vAdd(
        vScale(node.velocity, this.config.damping),
        acceleration,
      );

      // Limitar velocidad máxima (evita explosiones)
      const vel = vLength(node.velocity);
      if (vel > 20) {
        node.velocity = vScale(vNormalize(node.velocity), 20);
      }

      // Actualizar posición
      node.position = vAdd(node.position, node.velocity);

      totalVelocity += vLength(node.velocity);
    }

    // ====================================================================
    // 5. DETECTAR ESTABILIZACIÓN
    // ====================================================================
    const avgVelocity = totalVelocity / Math.max(nodeArray.length, 1);
    if (avgVelocity < 0.1 && this.iteration > 100) {
      this.stabilised = true;
    }

    // Ocasionalmente, si está estabilizado hace rato, dar un "pulse" de vida
    if (this.stabilised && this.iteration % 300 === 0) {
      this.stabilised = false;
    }
  }

  /** Obtiene el estado actual para render */
  getRenderState() {
    const nodes = Array.from(this.nodes.values());
    const edges = this.edges
      .map(e => ({
        source: this.nodes.get(e.source),
        target: this.nodes.get(e.target),
        weight: e.weight,
        frequency: e.frequency,
        type: e.type,
      }))
      .filter(e => e.source && e.target);

    return { nodes, edges };
  }

  /** Verifica si un edge está conectado al nodo seleccionado */
  isEdgeHighlighted(edge: { source?: GraphNode3D; target?: GraphNode3D }): number {
    if (!this.selectedNodeId) return 1.0; // Sin selección = todo visible
    if (!edge.source || !edge.target) return 0.1;

    // Direct connection: full brightness
    if (edge.source.id === this.selectedNodeId || edge.target.id === this.selectedNodeId) {
      return 1.0;
    }

    // Second degree connection: 60%
    const sourceEdges = this.edges.filter(e =>
      (e.source === edge.source?.id || e.target === edge.source?.id)
    );
    const targetEdges = this.edges.filter(e =>
      (e.source === edge.target?.id || e.target === edge.target?.id)
    );

    // Check if source or target connects to something that connects to selected
    const connectsToSelected = (edgeList: GraphEdge3D[]): boolean =>
      edgeList.some(e =>
        e.source === this.selectedNodeId || e.target === this.selectedNodeId
      );

    if (connectsToSelected(sourceEdges) || connectsToSelected(targetEdges)) {
      // Segundo grado
      const secondDegree = this.edges.filter(e => {
        if (e.source === edge.source?.id || e.target === edge.source?.id) {
          return sourceEdges.some(se =>
            (se.source === e.target || se.target === e.target)
          );
        }
        return false;
      });
      return secondDegree.length > 0 ? 0.8 : 0.6;
    }

    // Tercer grado: 30%
    const thirdDegree = this.edges.filter(e => {
      if (e.source === edge.source?.id || e.target === edge.source?.id) {
        const secondEdges = this.edges.filter(se =>
          (se.source === e.target || se.target === e.target)
        );
        return secondEdges.some(se =>
          se.source === this.selectedNodeId || se.target === this.selectedNodeId
        );
      }
      return false;
    });
    if (thirdDegree.length > 0) return 0.3;

    // No conectado: apenas visible
    return 0.08;
  }

  /** Variación de intensidad para la selección */
  getNodeOpacity(nodeId: string): number {
    if (!this.selectedNodeId) return 1.0;
    if (nodeId === this.selectedNodeId) return 1.0;

    // Check if directly connected
    const isConnected = this.edges.some(e =>
      (e.source === nodeId && e.target === this.selectedNodeId) ||
      (e.target === nodeId && e.source === this.selectedNodeId)
    );
    if (isConnected) return 0.9;

    return 0.25;
  }

  /** Distancia desde el nodo seleccionado */
  getDistanceFromSelected(nodeId: string): number {
    if (!this.selectedNodeId || nodeId === this.selectedNodeId) return 0;

    // BFS hasta 3 niveles para encontrar distancia
    const visited = new Set<string>();
    const queue: [string, number][] = [[nodeId, 0]];
    visited.add(nodeId);

    while (queue.length > 0) {
      const [current, dist] = queue.shift()!;
      if (current === this.selectedNodeId) return dist;

      const neighbors = this.edges
        .filter(e => e.source === current || e.target === current)
        .map(e => e.source === current ? e.target : e.source)
        .filter(id => !visited.has(id));

      if (dist < 3) {
        for (const neighbor of neighbors) {
          visited.add(neighbor);
          queue.push([neighbor, dist + 1]);
        }
      }
    }

    return Infinity;
  }
}