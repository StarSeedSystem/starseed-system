import { ProcesoActivo, HardwareServidor } from './procesos';
import { leerEstadoAutonomo } from '@/lib/metagenesis/remoto-nodos-cliente';
import { leerHistorial } from '@/lib/genesis/historial';
import { propuestasDe } from '@/lib/genesis/entidades';
import { fetchAstraura158DreamStatus, fetchAstraura158ImaginationStatus } from '@/lib/astraura/astraura-158-client';
import { listRuns } from '@/lib/imagine/runs';
import { leerDesktopsSnapshot } from '@/lib/desktop/snapshot';
import { listNeurons } from '@/lib/neuron/neuronas';
import { leerInstalaciones } from '@/lib/instalaciones/store';

// Tipos auxiliares
interface FuenteResultado {
  nombre: string;
  ok: boolean;
  ms: number;
  motivo?: string;
}

// Función auxiliar para aplicar timeout a una promesa
function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de ${ms} ms`)), ms)
    ),
  ]);
}

// Función para mapear datos de agentes a ProcesoActivo (simplificado)
function mapearAgentesADatosProcesos(agentes: any[]): ProcesoActivo[] {
  // TODO: Implementar mapeo real basado en el formato de datos de /api/mando/agentes
  return agentes.map((agente: any, index: number) => ({
    id: agente.id || `agente-${index}`,
    tipo: 'genesis' as const,
    nombre: agente.titulo || 'Agente Genesis',
    estado: agente.activa ? 'en-marcha' : 'esperando',
    progreso: null,
    donde: agente.donde || '',
    desde: agente.inicio ? Date.parse(agente.inicio) : null,
    detalle: agente.ultimaAccion,
    fuente: 'mando/agentes',
  }));
}

// Función para mapear datos de medidores (latidos) a ProcesoActivo (simplificado)
function mapearLatidosADatosProcesos(latidos: any[]): ProcesoActivo[] {
  // TODO: Implementar mapeo real basado en el formato de datos de /api/mando/medidores
  return latidos.map((latido: any, index: number) => ({
    id: latido.id || `latido-${index}`,
    tipo: 'servicio' as const,
    nombre: latido.modelo || 'Servicio',
    estado: latido.fase === 'escribiendo' ? 'en-marcha' : 'esperando',
    progreso: null,
    donde: latido.donde || '',
    desde: latido.fecha ? Date.parse(latido.fecha) : null,
    detalle: latido.accion,
    fuente: 'mando/medidores',
  }));
}

// Función para mapear datos de nodos de MetaGenesis a HardwareServidor (simplificado)
function mapearNodosADatosHardware(nodos: any[]): HardwareServidor[] {
  // TODO: Implementar mapeo real basado en el formato de EstadoAutonomo.nodos
  return nodos.map((nodo: any, index: number) => ({
    id: nodo.nodo || `nodo-${index}`,
    nombre: nodo.etiqueta || `Nodo ${index}`,
    tipo: nodo.medio === 'mac' ? 'mac' : nodo.medio === 'a1' ? 'a1' : 'neurona',
    cpuPct: nodo.cpuPct ?? null,
    nucleos: nodo.nucleos ?? null,
    carga: nodo.carga ?? null,
    ramUsadaMb: nodo.ramUsadaMb ?? null,
    ramTotalMb: nodo.ramTotalMb ?? null,
    gpuPct: null,
    gpuNombre: null,
    discoLibreGb: nodo.discoGb ?? null,
    discoTotalGb: nodo.discoTotalGb ?? null,
    bateriaPct: null,
    cargando: null,
    medidoEn: nodo.haceMs ? Date.now() - nodo.haceMs : null,
    fuente: 'metagenesis',
  }));
}

// Función para mapear datos de hardware de Mac a HardwareServidor (simplificado)
function mapearHardwareMacADatosHardware(hardwareMac: any): HardwareServidor {
  // TODO: Implementar mapeo real basado en el formato de HardwareMac
  return {
    id: 'esta-mac',
    nombre: 'Esta Mac',
    tipo: 'mac',
    cpuPct: hardwareMac.cpuPct ?? null,
    nucleos: hardwareMac.nucleos ?? null,
    carga: hardwareMac.carga ?? null,
    ramUsadaMb: hardwareMac.ramUsadaMb ?? null,
    ramTotalMb: hardwareMac.ramTotalMb ?? null,
    gpuPct: hardwareMac.gpuPct ?? null,
    gpuNombre: hardwareMac.gpuNombre ?? null,
    discoLibreGb: hardwareMac.discoLibreGb ?? null,
    discoTotalGb: hardwareMac.discoTotalGb ?? null,
    bateriaPct: hardwareMac.bateriaPct ?? null,
    cargando: hardwareMac.cargando ?? null,
    medidoEn: hardwareMac.medidoEn ?? null,
    fuente: 'mando/hardware',
  };
}

export async function leerProcesos(o?: { incluirMac?: boolean }): Promise<{
  procesos: ProcesoActivo[];
  hardware: HardwareServidor[];
  fuentes: FuenteResultado[];
}> {
  const incluirMac = o?.incluirMac ?? true;
  const resultados: FuenteResultado[] = [];
  const procesos: ProcesoActivo[] = [];
  const hardware: HardwareServidor[] = [];

  // Definir las fuentes a leer en paralelo
  const fuentesPromesas = [
    // Agentes de Genesis: /api/mando/agentes
    conTimeout(fetch('/api/mando/agentes').then(r => r.json()), 4000)
      .then((data: any) => {
        resultados.push({ nombre: 'agentes', ok: true, ms: 0 }); // ms se calculará realmente
        return mapearAgentesADatosProcesos(data.sesiones || []);
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'agentes', ok: false, ms: 0, motivo: error.message });
        return [];
      }),
    // Medidores de Genesis: /api/mando/medidores
    conTimeout(fetch('/api/mando/medidores').then(r => r.json()), 4000)
      .then((data: any) => {
        resultados.push({ nombre: 'medidores', ok: true, ms: 0 });
        return mapearLatidosADatosProcesos(data.latidos || []);
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'medidores', ok: false, ms: 0, motivo: error.message });
        return [];
      }),
    // Estado autónomo de MetaGenesis
    conTimeout(leerEstadoAutonomo(), 4000)
      .then((result: any) => {
        resultados.push({ nombre: 'estado-autonomo', ok: result.ok, ms: 0 });
        if (result.ok) {
          // Extraer nodos y orquestadores para procesos y hardware
          const nodos = result.estado.nodos || [];
          const hardwareDesdeNodos = mapearNodosADatosHardware(nodos);
          // También podemos extraer los orquestadores como procesos?
          // Por ahora, solo devolvemos hardware
          return { hardware: hardwareDesdeNodos, procesos: [] as ProcesoActivo[] };
        }
        return { hardware: [], procesos: [] };
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'estado-autonomo', ok: false, ms: 0, motivo: error.message });
        return { hardware: [], procesos: [] };
      }),
    // Historial de PoliGenesis
    conTimeout(leerHistorial(), 4000)
      .then((historial: any) => {
        resultados.push({ nombre: 'historial', ok: true, ms: 0 });
        // TODO: mapear historial a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'historial', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Propuestas de mis entidades
    conTimeout(propuestasDe(), 4000)
      .then((propuestas: any) => {
        resultados.push({ nombre: 'propuestas', ok: true, ms: 0 });
        // TODO: mapear propuestas a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'propuestas', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Sueños: /api/mando/suenos
    conTimeout(fetch('/api/mando/suenos').then(r => r.json()), 4000)
      .then((data: any) => {
        resultados.push({ nombre: 'sueños', ok: true, ms: 0 });
        // TODO: mapear sueños a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'sueños', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Estado de sueño de Astraura
    conTimeout(fetchAstraura158DreamStatus(), 4000)
      .then((status: any) => {
        resultados.push({ nombre: 'astraura-sueno', ok: true, ms: 0 });
        // TODO: mapear status a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'astraura-sueno', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Estado de imaginación de Astraura
    conTimeout(fetchAstraura158ImaginationStatus(), 4000)
      .then((status: any) => {
        resultados.push({ nombre: 'astraura-imaginacion', ok: true, ms: 0 });
        // TODO: mapear status a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'astraura-imaginacion', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Lista de runs de imagine
    conTimeout(listRuns(), 4000)
      .then((runs: any) => {
        resultados.push({ nombre: 'imagine-runs', ok: true, ms: 0 });
        // TODO: mapear runs a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'imagine-runs', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Instalaciones
    conTimeout(leerInstalaciones(), 4000)
      .then((instalaciones: any) => {
        resultados.push({ nombre: 'instalaciones', ok: true, ms: 0 });
        // TODO: mapear instalaciones a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'instalaciones', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Actualizaciones: /api/library/actualizaciones
    conTimeout(fetch('/api/library/actualizaciones').then(r => r.json()), 4000)
      .then((data: any) => {
        resultados.push({ nombre: 'actualizaciones', ok: true, ms: 0 });
        // TODO: mapear actualizaciones a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'actualizaciones', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Escritorios en segundo plano
    conTimeout(leerDesktopsSnapshot(), 4000)
      .then((desktops: any) => {
        resultados.push({ nombre: 'escritorios', ok: true, ms: 0 });
        // TODO: mapear escritorios a ProcesoActivo
        return [] as ProcesoActivo[];
      })
      .catch((error: any) => {
        resultados.push({ nombre: 'escritorios', ok: false, ms: 0, motivo: error.message });
        return [] as ProcesoActivo[];
      }),
    // Tareas del task manager
    // TODO: importar y usar task-manager.ts
    // Neuronas con visible=false
    // TODO: importar y usar usePresenciaNeuronas
  ];

  // Si se incluye la Mac, agregar la lectura de hardware de la Mac
  if (incluirMac) {
    fuentesPromesas.push(
      // Hardware de la Mac: /api/mando/hardware
      conTimeout(fetch('/api/mando/hardware').then(r => r.json()), 4000)
        .then((data: any) => {
          resultados.push({ nombre: 'mando-hardware', ok: true, ms: 0 });
          const hardwareMac = mapearHardwareMacADatosHardware(data);
          return { hardware: [hardwareMac], procesos: [] as ProcesoActivo[] };
        })
        .catch((error: any) => {
          resultados.push({ nombre: 'mando-hardware', ok: false, ms: 0, motivo: error.message });
          return { hardware: [], procesos: [] };
        })
    );
  }

  // Ejecutar todas las promesas en paralelo
  const resultadosPromesas = await Promise.all(fuentesPromesas);

  // Recopilar los procesos y hardware de cada fuente
  for (const resultado of resultadosPromesas) {
    procesos.push(...resultado.procesos);
    hardware.push(...resultado.hardware);
  }

  // Eliminar duplicados por id? (opcional)
  // Por ahora, dejamos todos

  return { procesos, hardware, fuentes: resultados };
}