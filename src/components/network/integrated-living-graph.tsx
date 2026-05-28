// src/components/network/integrated-living-graph.tsx
'use client';

/**
 * Re-exporta la Gráfica Viva geométrica unificada.
 *
 * Una sola visualización integra:
 *   - la memoria unificada (OpenHuman tree/FTS/KV)
 *   - agentes, providers y modelos
 *   - skills, tools y MCPs (Hermes)
 *   - sentidos del Exocórtex
 *
 * Las "capas" son tipos de CONEXIÓN, no gráficas superpuestas:
 *   uso · dependencia · exposición · configuración · memoria ·
 *   percepción · referencia · descubrimiento · manual.
 *
 * El usuario puede crear nuevas conexiones entre cualesquiera dos
 * nodos activando el modo "Conectar nodos".
 */

import { LivingGraph } from './living-graph';

export function IntegratedLivingGraph({ className }: { className?: string }) {
  return <LivingGraph className={className} />;
}
