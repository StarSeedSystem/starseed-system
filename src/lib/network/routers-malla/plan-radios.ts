import { PERFILES_WIFI, CanalWifi } from '@/ai/astraura/mesh/camr/regulacion';

export interface RadioRouter {
  id: string;
  banda: '2g' | '5g' | '6g';
  anchosMhz: number[];
}

export interface RouterMalla {
  id: string;
  radios: RadioRouter[];
}

export interface PlanRadiosInput {
  region: string;
  routers: RouterMalla[];
  troncales: Array<[string, string]>;
  ocupacion?: Record<number, number>;
}

export interface TroncalResult {
  a: string;
  b: string;
  banda: '5g' | '6g' | '2g';
  canal: number;
  anchoMhz: number;
  pireDbm: number;
}

export interface ClienteResult {
  router: string;
  banda: '2g';
  canal: number;
}

export interface PlanRadiosOutput {
  troncales: TroncalResult[];
  clientes: ClienteResult[];
  avisos: string[];
}

export function planRadios(e: PlanRadiosInput): PlanRadiosOutput {
  const avisos: string[] = [];
  
  // Handle unknown region -> use EU profile
  const perfil = PERFILES_WIFI[e.region] || PERFILES_WIFI.EU;
  if (!PERFILES_WIFI[e.region]) {
    avisos.push(`Región desconocida '${e.region}', usando perfil EU`);
  }
  
  // Extract available channels by band
  const canales2g = perfil.g24;
  const canales5g = perfil.g5;
  const canales6g = perfil.g6;
  
  // Map router IDs to their radios for quick lookup
  const routerRadiosMap = new Map<string, RadioRouter[]>();
  for (const router of e.routers) {
    routerRadiosMap.set(router.id, router.radios);
  }
  
  // Helper to check if a router has a radio of specific band
  const tieneRadio = (routerId: string, banda: '2g' | '5g' | '6g'): boolean => {
    const radios = routerRadiosMap.get(routerId) || [];
    return radios.some(radio => radio.banda === banda);
  };
  
  // Helper to get supported widths for a router's radio
  const getAnchosSoportados = (routerId: string, banda: '2g' | '5g' | '6g'): number[] => {
    const radios = routerRadiosMap.get(routerId) || [];
    const radio = radios.find(r => r.banda === banda);
    return radio ? radio.anchosMhz : [];
  };
  
  // Process troncales (router-to-router links)
  const troncalesResult: TroncalResult[] = [];
  
  // Build list of troncales that need processing
  const troncalesParaProcesar = [...e.troncales];
  
  // Simple greedy algorithm for channel assignment (simplified DSatur)
  // We'll process links in order and assign the best available channel
  const asignaciones: { [key: string]: number } = {} // "a-b" -> canal
  
  // Helper to get link key
  const getLinkKey = (a: string, b: string): string => {
    return `${a}-${b}`;
  };
  
  // Helper to check if two links interfere (share a router)
  const linksInterfieren = (link1: [string, string], link2: [string, string]): boolean => {
    const [a1, b1] = link1;
    const [a2, b2] = link2;
    return a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2;
  };
  
  // Process each troncal
  for (const [routerAId, routerBId] of troncalesParaProcesar) {
    const linkKey = getLinkKey(routerAId, routerBId);
    
    // Determine band preference: 6g > 5g > 2g
    let bandaSeleccionada: '5g' | '6g' | '2g' = '2g'; // Default
    let motivoAviso = '';
    
    if (tieneRadio(routerAId, '6g') && tieneRadio(routerBId, '6g')) {
      bandaSeleccionada = '6g';
    } else if (tieneRadio(routerAId, '5g') && tieneRadio(routerBId, '5g')) {
      bandaSeleccionada = '5g';
    } else {
      bandaSeleccionada = '2g';
      motivoAviso = `Enlace ${routerAId}-${routerBId}: usando 2g por falta de 5g/6g en alguno de los routers`;
    }
    
    if (motivoAviso) {
      avisos.push(motivoAviso);
    }
    
    // Get already assigned channels for interfering links
    const canalesOcupadosPorInterferencia: number[] = [];
    for (const [key, canal] of Object.entries(asignaciones)) {
      const [linkedA, linkedB] = key.split('-') as [string, string];
      if (linksInterfieren([routerAId, routerBId], [linkedA, linkedB])) {
        canalesOcupadosPorInterferencia.push(canal);
      }
    }
    
    // Select channel based on band and occupation
    let canalSeleccionado: number;

    if (bandaSeleccionada === '2g') {
      // For clients in 2g, use alternating 1/6/11 - handled separately
      // For troncales in 2g, we can use any channel
      const canalesDisponibles = canales2g
        .filter(c => !canalesOcupadosPorInterferencia.includes(c.canal))
        .map(c => c.canal);
      
        if (canalesDisponibles.length > 0) {
        // Prefer less occupied channels
        // If channel not in ocupacion object, assume it's fully occupied (1.0) 
        // as a conservative estimate
        const mejorCanal = canalesDisponibles.reduce((best, canal) => {
          const ocupacion = e.ocupacion ? (e.ocupacion[canal] ?? 1.0) : 1.0;
          const bestOcupacion = e.ocupacion ? (e.ocupacion[best] ?? 1.0) : 1.0;
          return ocupacion < bestOcupacion ? canal : best;
        });
        canalSeleccionado = mejorCanal;
      } else {
        // Fallback to any channel if all are occupied by interference
        canalSeleccionado = canales2g[0].canal;
      }
    } else {
      // For 5g and 6g troncales
      const canalesBanda = bandaSeleccionada === '5g' ? canales5g : canales6g;
      const canalesDisponibles = canalesBanda
        .filter(c => !canalesOcupadosPorInterferencia.includes(c.canal))
        .map(c => c.canal);
  
       if (canalesDisponibles.length > 0) {
        // Prefer less occupied channels
        // If channel not in ocupacion object, assume it's fully occupied (1.0) 
        // as a conservative estimate
        const mejorCanal = canalesDisponibles.reduce((best, canal) => {
          const ocupacion = e.ocupacion ? (e.ocupacion[canal] ?? 1.0) : 1.0;
          const bestOcupacion = e.ocupacion ? (e.ocupacion[best] ?? 1.0) : 1.0;
          return ocupacion < bestOcupacion ? canal : best;
        });
        canalSeleccionado = mejorCanal;
        } else {
        // Fallback to any channel if all are occupied by interference
        const primerosCanales = canalesBanda.slice(0, 3);
        const mejorCanal = primerosCanales.reduce((best, canal) => {
          const ocupacion = e.ocupacion ? (e.ocupacion[canal.canal] ?? 1.0) : 1.0;
          const bestOcupacion = e.ocupacion ? (e.ocupacion[best.canal] ?? 1.0) : 1.0;
          return ocupacion < bestOcupacion ? canal : best;
        });
        canalSeleccionado = mejorCanal.canal;
      }
    }
    
    // Determine width
    let anchoSeleccionado = 20; // Default
    
    if (bandaSeleccionada === '5g' || bandaSeleccionada === '6g') {
      // Get maximum width supported by both routers
      const anchos1 = getAnchosSoportados(routerAId, bandaSeleccionada as '5g' | '6g');
      const anchos2 = getAnchosSoportados(routerBId, bandaSeleccionada as '5g' | '6g');
      
      // Find common supported widths
      const comunes: number[] = [];
      for (const ancho1 of anchos1) {
        for (const ancho2 of anchos2) {
          if (ancho1 === ancho2) {
            comunes.push(ancho1);
          }
        }
      }
      
      if (comunes.length > 0) {
        // Sort descending to try largest first
        comunes.sort((a, b) => b - a);
        
        // For 5g: apply width restrictions based on available blocks
        // Simplified implementation
        if (bandaSeleccionada === '5g') {
          // Count how many consecutive 20MHz blocks are free around this channel
          // This is a simplified version - real implementation would be more complex
          anchoSeleccionado = comunes[0]; // Start with largest
          
          // Apply restrictions: 80 if ≥3 blocks free, 40 if not, 20 if not
          // For simplicity, we'll just check if we can use the requested width
          // In a full implementation, we'd check spectrum availability
        } else {
          // For 6g, use the largest common width
          anchoSeleccionado = comunes[0];
        }
      }
      // If no common widths, keep default 20
    }
    
    // Get PIRE from the selected channel
    let pireSeleccionado = 20; // Default
    const canalesBanda = bandaSeleccionada === '5g' ? canales5g : 
                        bandaSeleccionada === '6g' ? canales6g : 
                        canales2g;
    
    const canalInfo = canalesBanda.find(c => c.canal === canalSeleccionado);
    if (canalInfo) {
      pireSeleccionado = canalInfo.pireDbm;
    }
    
    // Store assignment
    asignaciones[linkKey] = canalSeleccionado;
    
    // Add to result
    troncalesResult.push({
      a: routerAId,
      b: routerBId,
      banda: bandaSeleccionada,
      canal: canalSeleccionado,
      anchoMhz: anchoSeleccionado,
      pireDbm: pireSeleccionado
    });
  }
  
  // Process clientes (device connections in 2g band)
  // Assign channels 1, 6, 11 alternately per router
  const clientesResult: ClienteResult[] = [];
  
  // Track which client number we're assigning (for alternating across routers)
  let clienteNumero = 0;
  
  for (const router of e.routers) {
    // Only process if router has 2g radio
    if (tieneRadio(router.id, '2g')) {
      // Assign channel: 0->1, 1->6, 2->11, then repeat
      const canalesCliente = [1, 6, 11];
      const canalSeleccionado = canalesCliente[clienteNumero % 3];
      
      clientesResult.push({
        router: router.id,
        banda: '2g',
        canal: canalSeleccionado
      });
      
      // Increment for next router
      clienteNumero++;
    }
  }
  
  return {
    troncales: troncalesResult,
    clientes: clientesResult,
    avisos
  };
}