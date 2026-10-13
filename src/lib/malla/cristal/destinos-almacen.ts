// Malla cristalina SiO₂ amorfa: destinos de almacenamiento puros, sin node:* ni Supabase
import { Dato } from './tipos';

export interface DestinoAlmacen {
  id: string;
  tipo: 'aparato' | 'cerebro' | 'biblioteca' | 'servidor';
  motor: string;
  publico: boolean;
  cerebroId?: string;
}

export function destinosDe(dato: Dato, e: {
  politicaContexto: string[];
  disponibles: DestinoAlmacen[];
  elegidosPorDato?: string[];
  motoresReales: string[]
}): {
  guardar: DestinoAlmacen[];
  descartados: Array<{id: string; motivo: string}>
} {
  // 1. Determinar qué destinos están solicitados
  const solicitados = e.elegidosPorDato ?? e.politicaContexto;
  
  // 2. Crear un mapa de disponibles por ID para búsqueda rápida
  const disponiblesMap = new Map<string, DestinoAlmacen>();
  for (const destino of e.disponibles) {
    disponiblesMap.set(destino.id, destino);
  }
  
  // 3. Filtrar y ordenar los destinos solicitados que existen
  const destinosSolicitadosExistentes: DestinoAlmacen[] = [];
  const descartados: Array<{id: string; motivo: string}> = [];
  
  for (const idSolicitado of solicitados) {
    const destino = disponiblesMap.get(idSolicitado);
    if (!destino) {
      descartados.push({ id: idSolicitado, motivo: 'destino no disponible' });
      continue;
    }
    
    // 4. Aplicar reglas de descarte
    let motivoDescarte: string | null = null;
    
    // Regla: dato privado/interno no puede ir a destino público
    if ((dato.clase === 'privado' || dato.clase === 'interno') && destino.publico) {
      motivoDescarte = 'destino público no permitido para dato privado/interno';
    }
    // Regla: motor no implementado
    else if (!e.motoresReales.includes(destino.motor)) {
      motivoDescarte = 'aún sin motor de guardado';
    }
    // 'aparato' siempre es válido, pero todavía aplicamos las reglas anteriores
    
    if (motivoDescarte) {
      descartados.push({ id: destino.id, motivo: motivoDescarte });
    } else {
      destinosSolicitadosExistentes.push(destino);
    }
  }
  
  return {
    guardar: destinosSolicitadosExistentes,
    descartados
  };
}