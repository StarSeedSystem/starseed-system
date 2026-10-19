"use client";

import { type MeshState, type MeshNodeInfo } from "@/ai/astraura/mesh/types";
import { 
  RadioTower, 
  Thermometer, 
  Hash, 
  Link, 
  Zap, 
  Circle,
  Monitor,
  List,
  BarChart3,
  CircleHelp
} from "lucide-react";
import { useEffect, useState } from "react";

interface PanelReticulaProps {
  estado: MeshState;
}

export function PanelReticula({ estado }: PanelReticulaProps) {
  // Derive state in words from meshHealth.score
  const meshHealthScore = estado.meshHealth?.score ?? 0;
  let stateText: string;
  let stateMeaning: string;
  if (meshHealthScore > 0.7) {
    stateText = "vítreo";
    stateMeaning = "estable y congelada";
  } else if (meshHealthScore > 0.3) {
    stateText = "subenfriado";
    stateMeaning = "los puentes se recolocan lentamente";
  } else {
    stateText = "fundido";
    stateMeaning = "las señales cambian y la red se recoloca libremente";
  }

  // Temperature value for the bar (0 to 1)
  const temperature = meshHealthScore;

  // State for footprint (computed asynchronously)
  const [footprint, setFootprint] = useState<string | null>(null);
  const [footprintLoading, setFootprintLoading] = useState(true);

  // Compute bridges from edges (synchronous)
  const bridges = computeBridges(estado.nodes, estado.edges);

  // Compute coordination stats (synchronous)
  const { avgCoordination, maxCoordination, coordinationDetails } = 
    computeCoordination(estado.nodes, estado.edges);

  // Empty state: no nodes (or only self)
  const hasOtherNeurons = estado.nodes.some(node => !node.isSelf);
  const showEmpty = !hasOtherNeurons;

  // Compute footprint asynchronously
  useEffect(() => {
    let cancelled = false;
    const computeFootprintAsync = async () => {
      try {
        setFootprintLoading(true);
        const result = await computeFootprintInternal(estado.nodes, estado.edges);
        if (!cancelled) {
          setFootprint(result);
          setFootprintLoading(false);
        }
      } catch (error) {
        console.error("Error computing footprint:", error);
        if (!cancelled) {
          setFootprintLoading(false);
          // Set a fallback footprint
          setFootprint("error");
        }
      }
    };

    if (estado.nodes.length > 0 && estado.edges.length >= 0) {
      computeFootprintAsync();
    } else {
      setFootprintLoading(false);
      setFootprint("-");
    }

    return () => {
      cancelled = true;
    };
  }, [estado.nodes, estado.edges]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-sky-50 flex items-center gap-2">
        <RadioTower className="h-5 w-5 text-sky-300" />
        Sólido amorfo en tiempo real
      </h2>
      
      {/* Estado en palabras */}
      <div data-testid="estado-section" className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Circle className="h-4 w-4" 
            className={meshHealthScore > 0.7 
              ? "text-emerald-400" 
              : meshHealthScore > 0.3 
                ? "text-amber-400" 
                : "text-rose-400"} />
          <span data-testid="estado-text" className="text-white/90 font-medium">Estado: {stateText}</span>
        </div>
        <div className="text-xs text-white/50">{stateMeaning}</div>
      </div>
      
      {/* Temperatura en barra */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Thermometer data-testid="temperature-icon" className="h-4 w-4 text-sky-300" />
          <span className="text-white/90 font-medium">Temperatura media</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
          <div data-testid="temperature-bar" className={`bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400 h-full w-${temperature * 100}% transition-all duration-500`}></div>
        </div>
        <div className="text-xs text-white/50">
          {temperature > 0.7 
            ? "Baja volatilidad: la red está vítreo y estable" 
            : temperature > 0.3 
              ? "Volatilidad media: subenfriado" 
              : "Alta volatilidad: fundido, la red se recoloca activamente"}
        </div>
      </div>

      {/* Huella de la retícula */}
      {!showEmpty && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-sky-300" />
            <span className="text-white/90 font-medium">Huella de la retícula</span>
          </div>
          <div data-testid="footprint-section" className="flex items-center gap-3">
            <div className="flex flex-col items-start gap-1">
              <span className="text-xs text-white/40">Huella corta:</span>
              {footprintLoading ? (
                <span className="text-xs italic text-white/40">Calculando...</span>
              ) : (
                <code data-testid="footprint-code" className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">
                  {footprint ?? "-"}
                </code>
              )}
            </div>
            <div className="text-xs text-white/50">
              {/* We assume all neurons in our view have the same footprint (simplified) */}
              {estado.nodes.length} de {estado.nodes.length} neuronas comparten esta huella
            </div>
          </div>
        </div>
      )}

      {/* Puentes (enlaces) */}
      {!showEmpty && bridges.length > 0 && (
        <div data-testid="puentes-section" className="space-y-3">
          <div className="flex items-center gap-2">
            <Link className="h-4 w-4 text-sky-300" />
            <span className="text-white/90 font-medium">Puentes ordenados por coste</span>
          </div>
          <div data-testid="puentes-list" className="space-y-1">
            {bridges.slice(0, 5).map((bridge, index) => (
              <div key={index} className="flex items-center gap-3 text-xs text-white/50">
                <div className="flex-1">
                  {bridge.from} ↔ {bridge.to}
                </div>
                <div className="flex-1 text-center">
                  {bridge.medium}
                </div>
                <div className="flex-1 text-center">
                  {bridge.quality}%
                </div>
                <div className="flex-1 text-end">
                  {bridge.coste}
                </div>
              </div>
            ))}
            {bridges.length > 5 && (
              <div className="text-xs text-white/40 italic">
                y {bridges.length - 5} más...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coordinación de neuronas */}
      {!showEmpty && (
        <div data-testid="coordinacion-section" className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-300" />
            <span className="text-white/90 font-medium">Coordinación de neuronas</span>
          </div>
          <div data-testid="coordinacion-container" className="space-y-1">
            <div className="text-xs text-white/50">
              Coordinación media: {avgCoordination.toFixed(1)} / {Math.max(maxCoordination, 1)}
            </div>
            {coordinationDetails.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {coordinationDetails.slice(0, 3).map((detail, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div className="flex-1">
                      {detail.name}
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div className={`bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400 h-full w-${detail.ratio * 100}% transition-all duration-500`}></div>
                      </div>
                    </div>
                    <div className="text-xs text-white/40 ml-2">
                      ({detail.coordination}/{detail.max})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {showEmpty && (
        <div data-testid="empty-state" className="text-center py-8">
          <Zap className="h-6 w-6 text-sky-400 mb-3" />
          <p className="text-white/50">
            aún no llegó ninguna señal de otra neurona
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compute a simple footprint hash from nodes and edges.
 * We use the SubtleCrypto API available in the browser.
 */
async function computeFootprintInternal(
  nodes: MeshNodeInfo[],
  edges: { from: number; to: number; [key: string]: any }[]
): Promise<string> {
  // We'll create a string representation
  const nodeIds = nodes
    .map(node => node.num ?? 0)
    .sort((a, b) => a - b)
    .join(",");
  
  const edgeStrings = edges
    .map(edge => {
      const from = edge.from ?? 0;
      const to = edge.to ?? 0;
      return `${Math.min(from, to)}-${Math.max(from, to)}`;
    })
    .sort()
    .join(",");
  
  const inputString = `nodes:${nodeIds};edges:${edgeStrings}`;
  
  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(inputString);
  
  // Compute hash (SHA-256)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  // Return first 6 characters as short footprint
  return hashHex.slice(0, 6);
}

/**
 * Compute bridges from edges and nodes.
 * We assign placeholder values for medium, quality, and cost.
 */
function computeBridges(
  nodes: MeshNodeInfo[],
  edges: { from: number; to: number; [key: string]: any }[]
) {
  // Create a map from node num to display name
  const nodeMap = new Map<number, string>();
  nodes.forEach(node => {
    const name = node.shortName ?? node.id ?? String(node.num);
    nodeMap.set(node.num ?? 0, name);
  });

  return edges.map(edge => {
    const fromNum = edge.from ?? 0;
    const toNum = edge.to ?? 0;
    const fromName = nodeMap.get(fromNum) ?? String(fromNum);
    const toName = nodeMap.get(toNum) ?? String(toNum);

    // Placeholder values - in a real implementation, these would come from the mesh state
    const medium = "Desconocido"; // We don't have medium info in edge
    const quality = Math.floor(Math.random() * 100) + 1; // Placeholder random quality
    const coste = Math.floor(Math.random() * 10) + 1; // Placeholder random cost

    return {
      from: fromName,
      to: toName,
      medium,
      quality,
      coste
    };
  }).sort((a, b) => a.coste - b.coste); // Sort by cost ascending
}

/**
 * Compute coordination statistics for nodes.
 */
function computeCoordination(
  nodes: MeshNodeInfo[],
  edges: { from: number; to: number; [key: string]: any }[]
) {
  // Initialize coordination count for each node
  const coordinationMap = new Map<number, number>();
  nodes.forEach(node => {
    coordinationMap.set(node.num ?? 0, 0);
  });

  // Count edges for each node
  edges.forEach(edge => {
    const fromNum = edge.from ?? 0;
    const toNum = edge.to ?? 0;
    if (coordinationMap.has(fromNum)) {
      coordinationMap.set(fromNum, (coordinationMap.get(fromNum) || 0) + 1);
    }
    if (coordinationMap.has(toNum)) {
      coordinationMap.set(toNum, (coordinationMap.get(toNum) || 0) + 1);
    }
  });

  // Calculate stats
  let totalCoordination = 0;
  let maxCoordination = 0;
  const coordinationDetails: Array<{
    name: string;
    coordination: number;
    max: number;
    ratio: number;
  }> = [];

  nodes.forEach(node => {
    const num = node.num ?? 0;
    const coordination = coordinationMap.get(num) || 0;
    totalCoordination += coordination;
    if (coordination > maxCoordination) maxCoordination = coordination;

    // Determine max coordination based on node role
    // Role: "ROUTER" or "REPEATER" -> 6, else -> 4 (client default)
    const isRouter = node.role === "ROUTER" || node.role === "REPEATER";
    const maxForNode = isRouter ? 6 : 4;
    const ratio = Math.min(coordination / maxForNode, 1); // Cap at 1

    coordinationDetails.push({
      name: node.shortName ?? node.id ?? String(num),
      coordination,
      max: maxForNode,
      ratio
    });
  });

  const avgCoordination = nodes.length > 0 ? totalCoordination / nodes.length : 0;

  return {
    avgCoordination,
    maxCoordination,
    coordinationDetails: coordinationDetails
      .sort((a, b) => b.coordination - a.coordination) // Descending by coordination
  };
}