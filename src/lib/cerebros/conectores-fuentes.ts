import { listConnectors } from '../connectors/store';
import { INTEGRATIONS, loadIntegrationConfig } from '../integrations';
import { loadAbilities, type Ability, abilitiesFor } from '../abilities/abilities';
import { type AbilityLink } from '../abilities/abilities';


// Tipos
export type TipoConector = 'conector' | 'integracion' | 'mcp' | 'cuenta-externa' | 'canal';
export type EstadoConector = 'conectado' | 'falta-clave' | 'disponible' | 'error';

export interface ConectorCerebro {
  id: string;
  nombre: string;
  tipo: TipoConector;
  estado: EstadoConector;
  enCerebro: boolean;
  enlace: string;
}

// Función para obtener la clave de preferencias de conectores para un cerebro
export function claveConectores(brainId: string): string {
  return `starseed.brain.${brainId}.conectores`;
}

// Función para leer un valor JSON de localStorage de forma segura
export function leerJsonLocal<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Función principal
export async function leerFuentesConectores(brainId: string | null): Promise<{
  fuentes: ConectorCerebro[];
  avisos: string[];
}> {
  const avisos: string[] = [];
  const fuentes: ConectorCerebro[] = [];

  if (!brainId) {
    // Si no hay brainId, no podemos leer fuentes específicas del cerebro
    // Pero aún podemos leer las fuentes globales (conectores, integraciones, etc.)
    // Sin embargo, el contrato asume que brainId está presente cuando se llama.
    // Devolvemos vacío y un aviso.
    avisos.push('No se proporcionó brainId');
    return { fuentes, avisos };
  }

  // 1. listConnectors() -> tipo: conector
  try {
    const conectores = listConnectors();
    for (const { connector, config, status } of conectores) {
      const tipo: TipoConector = 'conector';
      const estado: EstadoConector = 
        status === 'connected' ? 'conectado' :
        status === 'needs-auth' ? 'falta-clave' :
        status === 'available' ? 'disponible' :
        'error';
      const enlace = '/conexiones'; // Enlace genérico para conectores
      // Determinar si está en el cerebro: verificar en las preferencias del cerebro
      const enCerebro = estáConectorEnCerebro(brainId, connector.id);
      fuentes.push({
        id: connector.id,
        nombre: connector.name,
        tipo,
        estado,
        enCerebro,
        enlace,
      });
    }
  } catch (error) {
    avisos.push(`Error al leer listConnectors: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 2. INTEGRATIONS + loadIntegrationConfig(id, brainId) -> tipo: integracion
  try {
    for (const integracion of INTEGRATIONS) {
       const { id, label } = integracion;
      let config = null;
      try {
        config = await loadIntegrationConfig(id, brainId);
      } catch (e) {
        // Si falla la carga de configuración, continuamos pero marcamos como error
        avisos.push(`Error al cargar configuración de integración ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      const tipo: TipoConector = 'integracion';
      // Determinar estado: si tiene configuración y está habilitada
      const estado: EstadoConector = config && config.enabled ? 'conectado' : 'disponible';
      const enlace = `/integraciones/${id}`; // Asumimos que existe una ruta para configurar cada integración
      const enCerebro = estáIntegracionEnCerebro(brainId, id);
       fuentes.push({
         id,
         nombre: label,
         tipo,
         estado,
         enCerebro,
         enlace,
       });
    }
  } catch (error) {
    avisos.push(`Error al procesar INTEGRATIONS: ${error instanceof Error ? error.message : String(error)}`);
  }

   // 3. loadAbilities() + ability_links del cerebro -> tipo: mcp
   try {
     const abilities = await loadAbilities();
     // Obtener los enlaces de habilidades para este cerebro
     const links: AbilityLink[] = await abilitiesFor("cerebro", brainId);
     // Crear un mapa de enlaces por ref para búsqueda rápido
     const enlacesPorRef = new Map<string, AbilityLink>();
     for (const link of links) {
       const key = `${link.kind}:${link.ref}`;
       enlacesPorRef.set(key, link);
     }
     for (const ability of abilities) {
       // Solo considerar habilidades que sean de tipo MCP (o según corresponda)
       // Según el contrato, loadAbilities() marca enlazadas las de ability_links de este cerebro
       // Asumimos que todas las abilities en el catálogo pueden ser vinculadas, pero solo aquellas en ability_links están enlazadas
       const key = `${ability.kind}:${ability.ref}`;
       const enlazada = enlacesPorRef.has(key);
       const tipo: TipoConector = 'mcp';
       const estado: EstadoConector = enlazada ? 'conectado' : 'disponible';
       const enlace = `/habilidades/${ability.ref}`; // Enlace a la habilidad en el catálogo
       const enCerebro = enlazada; // Si está enlazada, entonces está en el cerebro
       fuentes.push({
         id: key, // Usamos kind:ref como id único para la habilidad
         nombre: ability.name,
         tipo,
         estado,
         enCerebro,
         enlace,
       });
     }
   } catch (error) {
     avisos.push(`Error al procesar loadAbilities y ability_links: ${error instanceof Error ? error.message : String(error)}`);
   }

  // 4. fetch('/api/externos/vinculos') filtrando ámbito este cerebro -> tipo: cuenta-externa
  try {
    const respuesta = await fetch('/api/externos/vinculos');
    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}: ${respuesta.statusText}`);
    }
    const vinculos = await respuesta.json();
    // Asumimos que vinculos es un array de objetos con al menos: id, nombre, ambito, estado
    for (const vinculo of vinculos) {
      // Filtrar por ámbito igual a brainId
      if (vinculo.ambito !== brainId) continue;
      const tipo: TipoConector = 'cuenta-externa';
      // Determinar estado basado en el estado del vínculo
      const estado: EstadoConector = 
        vinculo.estado === 'activo' ? 'conectado' :
        vinculo.estado === 'pendiente' ? 'disponible' :
        vinculo.estado === 'error' ? 'error' :
        'disponible'; // default
      const enlace = `/externos/vinculos/${vinculo.id}`; // Enlace para configurar el vínculo
      const enCerebro = estáVinculoEnCerebro(brainId, vinculo.id);
      fuentes.push({
        id: vinculo.id,
        nombre: vinculo.nombre,
        tipo,
        estado,
        enCerebro,
        enlace,
      });
    }
  } catch (error) {
    avisos.push(`Error al fetch /api/externos/vinculos: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 5. localStorage['starseed.brain.<id>.channels'] -> tipo: canal
  try {
    const canalesKey = `starseed.brain.${brainId}.channels`;
    const canales = leerJsonLocal<{ useGlobal?: boolean; channelIds?: string[] }>(canalesKey);
    if (canales && canales.channelIds && Array.isArray(canales.channelIds)) {
      for (const canalId of canales.channelIds) {
        // Necesitamos obtener el nombre del canal desde algún sitio
        // Asumimos que existe una lista global de canales o podemos obtenerlo de otra forma
        // Por ahora, usamos el ID como nombre si no tenemos más información
        const tipo: TipoConector = 'canal';
        // Determinar estado: asumimos que si está en la lista, está disponible y conectado
        const estado: EstadoConector = 'conectado'; // o podemos tener un estado más complejo
        const enlace = `/canales/${canalId}`; // Enlace para configurar el canal
        const enCerebro = true; // Si está en la lista de canales del cerebro, está en el cerebro
        fuentes.push({
          id: canalId,
          nombre: canalId, // Mejorar si tenemos un mapa de nombres
          tipo,
          estado,
          enCerebro,
          enlace,
        });
      }
    }
  } catch (error) {
    avisos.push(`Error al leer canales del cerebro: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Eliminar duplicados por id (manteniendo la primera aparición)
  const idsVistos = new Set<string>();
  const fuentesUnicas: ConectorCerebro[] = [];
  for (const fuente of fuentes) {
    if (!idsVistos.has(fuente.id)) {
      idsVistos.add(fuente.id);
      fuentesUnicas.push(fuente);
    }
  }

  return { fuentes: fuentesUnicas, avisos };
}

// Funciones auxiliares para verificar si un conector/integración/vinculo está en el cerebro

function estáConectorEnCerebro(brainId: string, conectorId: string): boolean {
  const clave = claveConectores(brainId);
  const valor = leerJsonLocal<Record<string, boolean>>(clave);
  return !!valor && !!valor[conectorId];
}

function estáIntegracionEnCerebro(brainId: string, integracionId: string): boolean {
  // Asumimos que las integraciones por cerebro se guardan en starseed.brain.<id>.integration.<id>
  const clave = `starseed.brain.${brainId}.integration.${integracionId}`;
  const valor = leerJsonLocal<{ enabled?: boolean }>(clave);
  return !!valor && !!valor.enabled;
}



function estáVinculoEnCerebro(brainId: string, vinculoId: string): boolean {
  // Asumimos que los vinculos por cerebro se guardan en starseed.brain.<id>.vinculos.<id>
  const clave = `starseed.brain.${brainId}.vinculos.${vinculoId}`;
  const valor = leerJsonLocal<{ activo?: boolean }>(clave);
  return !!valor && !!valor.activo;
}