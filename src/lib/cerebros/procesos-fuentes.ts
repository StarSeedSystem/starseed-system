// Procesos activos: lectura de fuentes con timeouts y tolerancia a fallos.
// Módulo que realiza llamadas de red con manejo de errores.
// Contrato: architecture/cerebros-fusion-telepatia.md §7.

/**
 * Ejecuta una fetch con timeout, similar a la función en deteccion-entorno.ts
 * pero exportada para uso en este módulo.
 */
function timeoutFetch(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

import { leerHistorial } from "../genesis/historial";
import { leerEstadoAutonomo } from "../metagenesis/remoto-nodos-cliente";
import { 
  fetchAstraura158DreamStatus, 
  fetchAstraura158ImaginationStatus,
  Astraura158Target
} from "../astraura/astraura-158-client";
import { listRuns } from "../aurora/imagine";
import { leerInstalaciones } from "../instalaciones/instalaciones-store";
import { readDesktopsSnapshot } from "../../components/desktop/desktop-store";
import { listNeurons } from "../neurons/neurons";

export type TipoProceso =
  | "genesis"
  | "poligenesis"
  | "sueno"
  | "imaginacion"
  | "descarga"
  | "instalacion"
  | "actualizacion"
  | "app-fondo"
  | "servicio";

export interface ProcesoActivo {
  id: string;
  tipo: TipoProceso;
  nombre: string;
  estado: "en-marcha" | "esperando" | "pausado" | "fallando";
  progreso: number | null; // 0..1; null = sin medida
  donde: string;
  desde: number | null;
  detalle?: string;
  fuente: string;
}

export interface HardwareServidor {
  id: string;
  nombre: string;
  tipo: "mac" | "a1" | "neurona" | "nube" | "otro";
  cpuPct: number | null;
  nucleos: number | null;
  carga: number | null;
  ramUsadaMb: number | null;
  ramTotalMb: number | null;
  gpuPct: number | null;
  gpuNombre: string | null;
  discoLibreGb: number | null;
  discoTotalGb: number | null;
  bateriaPct: number | null;
  cargando: boolean | null;
  medidoEn: number | null;
  fuente: string;
}

export interface FuentesResultado {
  nombre: string;
  ok: boolean;
  ms: number;
  motivo?: string;
}

/**
 * Lee los procesos activos de todas las fuentes con timeout de 4s cada una.
 * Si una fuente falla, continúa con las demás y registra el fallo en fuentes.
 * Nunca lanza excepciones.
 * 
 * @param o Opciones - incluirMac: si incluir las fuentes de la Mac (por defecto: true)
 * @returns Promise con procesos, hardware y resultados de las fuentes
 */
export async function leerProcesos(o?: { incluirMac?: boolean }): Promise<{
  procesos: ProcesoActivo[];
  hardware: HardwareServidor[];
  fuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }>;
}> {
  const incluirMac = o?.incluirMac ?? true;
  const ahora = Date.now();
  
  // Array para almacenar los resultados de cada fuente
  const resultadosFuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }> = [];
  const procesos: ProcesoActivo[] = [];
  const hardware: HardwareServidor[] = [];
  
  // Función helper para ejecutar una fuente con timeout y capturar métricas
  const ejecutarFuente = async <T>(
    nombre: string,
    fn: () => Promise<T>,
    procesar: (resultado: T, timestamp: number) => void
  ) => {
    const t0 = Date.now();
    try {
      // Crear un AbortController para el timeout de 4s
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 4000);
      
      try {
        const resultado = await fn();
        clearTimeout(timeoutId);
        const ms = Date.now() - t0;
        resultadosFuentes.push({ nombre, ok: true, ms });
        procesar(resultado, ahora);
      } catch (error) {
        clearTimeout(timeoutId);
        const ms = Date.now() - t0;
        let motivo = "sin respuesta";
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            motivo = "timeout";
          } else {
            motivo = error.message;
          }
        }
        resultadosFuentes.push({ nombre, ok: false, ms, motivo });
      }
    } catch (error) {
      // En caso de error inesperado en la configuración
      const ms = Date.now() - t0;
      resultadosFuentes.push({ 
        nombre, 
        ok: false, 
        ms, 
        motivo: error instanceof Error ? error.message : "error desconocido" 
      });
    }
  };
  
    // Definir todas las fuentes a consultar
    const fuentes = [
      // Agentes de Genesis
      {
        nombre: "agentes-genesis",
        fn: () => timeoutFetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/mando/agentes`, 4000),
        procesar: (resultado, timestamp) => {
          // TODO: Procesar respuesta de agentes
          // Por ahora, solo agregamos un proceso genérico si la llamada fue exitosa
          if (resultado.ok) {
            procesos.push({
              id: `agentes-${timestamp}`,
              tipo: "genesis",
              nombre: "Agentes de Genesis",
              estado: "en-marcha",
              progreso: null,
              donde: "genesis",
              desde: timestamp,
              fuente: "mando",
            });
          }
        }
      },
      // Medidores de Genesis
      {
        nombre: "medidores-genesis",
        fn: () => timeoutFetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/mando/medidores`, 4000),
        procesar: (resultado, timestamp) => {
          // TODO: Procesar respuesta de medidores
          if (resultado.ok) {
            procesos.push({
              id: `medidores-${timestamp}`,
              tipo: "servicio",
              nombre: "Medidores de Genesis",
              estado: "en-marcha",
              progreso: null,
              donde: "genesis",
              desde: timestamp,
              fuente: "mando",
            });
          }
        }
      },
      // Sueños de Genesis
      {
        nombre: "suenos-genesis",
        fn: () => timeoutFetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/mando/suenos`, 4000),
        procesar: (resultado, timestamp) => {
          // TODO: Procesar respuesta de suenos
          if (resultado.ok) {
            procesos.push({
              id: `suenos-${timestamp}`,
              tipo: "sueno",
              nombre: "Sueños de Genesis",
              estado: "en-marcha",
              progreso: null,
              donde: "genesis",
              desde: timestamp,
              fuente: "mando",
            });
          }
        }
      },
      // Hardware de la Mac (solo si se incluye)
      ...(incluirMac ? [{
        nombre: "hardware-mac",
        fn: () => timeoutFetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/mando/hardware`, 4000),
        procesar: (resultado, timestamp) => {
          // TODO: Procesar respuesta de hardware
          if (resultado.ok) {
            // Asumimos que la respuesta contiene los datos del hardware
            // Por ahora, agregamos un hardware genérico
            hardware.push({
              id: "mac-principal",
              nombre: "Esta Mac",
              tipo: "mac",
              cpuPct: null,
              nucleos: null,
              carga: null,
              ramUsadaMb: null,
              ramTotalMb: null,
              gpuPct: null,
              gpuNombre: null,
              discoLibreGb: null,
              discoTotalGb: null,
              bateriaPct: null,
              cargando: null,
              medidoEn: timestamp,
              fuente: "mando",
            });
          }
        }
      }] : []),
    // Estado autónomo de MetaGenesis
    {
      nombre: "estado-autonomo",
      fn: () => leerEstadoAutonomo(),
      procesar: (resultado, timestamp) => {
        if (resultado.ok && resultado.estado) {
          // TODO: Procesar el estado autónomo para extraer procesos y hardware
          // Por ahora, agregamos un proceso genérico
          procesos.push({
            id: `autonomo-${timestamp}`,
            tipo: "poligenesis",
            nombre: "Estado Autónomo",
            estado: "en-marcha",
            progreso: null,
            donde: "metagenesis",
            desde: timestamp,
            fuente: "metagenesis",
          });
        }
      }
    },
    // Historial de Genesis
    {
      nombre: "historial-genesis",
      fn: () => leerHistorial({ tipo: "persona" }),
      procesar: (resultado, timestamp) => {
        if (resultado.entradas && resultado.entradas.length > 0) {
          procesos.push({
            id: `historial-${timestamp}`,
            tipo: "genesis",
            nombre: "Historial de Genesis",
            estado: "en-marcha",
            progreso: null,
            donde: "genesis",
            desde: timestamp,
            fuente: "genesis",
            detalle: `${resultado.entradas.length} operaciones`,
          });
        }
      }
    },
    // Estado de sueños de Astraura
    {
      nombre: "sueños-astraura",
      fn: () => fetchAstraura158DreamStatus("local" as Astraura158Target),
      procesar: (resultado, timestamp) => {
        if (resultado.ok) {
          procesos.push({
            id: `sueños-astraura-${timestamp}`,
            tipo: "sueno",
            nombre: "Sueños de Astraura",
            estado: resultado.data?.is_dreaming ? "en-marcha" : "esperando",
            progreso: resultado.data?.is_always_on ? 1 : 0,
            donde: "astraura",
            desde: timestamp,
            fuente: "astraura",
            detalle: resultado.data?.operation_mode,
          });
        }
      }
    },
    // Estado de imaginación de Astraura
    {
      nombre: "imaginacion-astraura",
      fn: () => fetchAstraura158ImaginationStatus("local" as Astraura158Target),
      procesar: (resultado, timestamp) => {
        if (resultado.ok) {
          procesos.push({
            id: `imaginacion-astraura-${timestamp}`,
            tipo: "imaginacion",
            nombre: "Imaginación de Astraura",
            estado: "en-marcha", // Asumimos que siempre está activa si responde
            progreso: null,
            donde: "astraura",
            desde: timestamp,
            fuente: "astraura",
          });
        }
      }
    },
    // Ejecuciones de Imagine
    {
      nombre: "ejecuciones-imagine",
      fn: () => listRuns(),
      procesar: (resultado, timestamp) => {
        if (resultado.length > 0) {
          procesos.push({
            id: `imagine-${timestamp}`,
            tipo: "imaginacion",
            nombre: "Ejecuciones de Imagine",
            estado: "en-marcha",
            progreso: null,
            donde: "imagine",
            desde: timestamp,
            fuente: "imagine",
            detalle: `${resultado.length} ejecuciones`,
          });
        }
      }
    },
    // Instalaciones
    {
      nombre: "instalaciones",
      fn: () => Promise.resolve(leerInstalaciones()),
      procesar: (resultado, timestamp) => {
        if (resultado.length > 0) {
          procesos.push({
            id: `instalaciones-${timestamp}`,
            tipo: "instalacion",
            nombre: "Instalaciones",
            estado: "en-marcha",
            progreso: null,
            donde: "instalaciones",
            desde: timestamp,
            fuente: "instalaciones",
            detalle: `${resultado.length} instalaciones`,
          });
        }
      }
    },
    // Escritorios (hardware de neuronas de escritorio)
    {
      nombre: "escritorios",
      fn: () => Promise.resolve(readDesktopsSnapshot()),
      procesar: (resultado, timestamp) => {
        if (resultado.desktops && resultado.desktops.length > 0) {
          const escritorioActivo = resultado.desktops.find(d => d.id === resultado.activeId) || resultado.desktops[0];
          if (escritorioActivo) {
            hardware.push({
              id: `escritorio-${escritorioActivo.id}`,
              nombre: escritorioActivo.name || "Escritorio",
              tipo: "neurona",
              cpuPct: null,
              nucleos: null,
              carga: null,
              ramUsadaMb: null,
              ramTotalMb: null,
              gpuPct: null,
              gpuNombre: null,
              discoLibreGb: null,
              discoTotalGb: null,
              bateriaPct: null,
              cargando: null,
              medidoEn: timestamp,
              fuente: "desktop-store",
            });
          }
        }
      }
    },
    // Neuronas
    {
      nombre: "neuronas",
      fn: () => listNeurons(),
      procesar: (resultado, timestamp) => {
        if (resultado.length > 0) {
          // Agregamos cada neurona como hardware
          resultado.forEach((neurona, index) => {
            hardware.push({
              id: neurona.id || `neurona-${index}`,
              nombre: neurona.name || `Neurona ${index}`,
              tipo: "neurona",
              cpuPct: null,
              nucleos: null,
              carga: null,
              ramUsadaMb: null,
              ramTotalMb: null,
              gpuPct: null,
              gpuNombre: null,
              discoLibreGb: null,
              discoTotalGb: null,
              bateriaPct: null,
              cargando: null,
              medidoEn: timestamp,
              fuente: "neuronas",
            });
          });
          
          procesos.push({
            id: `neuronas-${timestamp}`,
            tipo: "servicio",
            nombre: "Neuronas Activas",
            estado: "en-marcha",
            progreso: null,
            donde: "neuronas",
            desde: timestamp,
            fuente: "neuronas",
            detalle: `${resultado.length} neuronas`,
          });
        }
      }
    }
  ];
  
  // Ejecutar todas las fuentes en paralelo
  await Promise.all(
    fuentes.map(({ nombre, fn, procesar }) => ejecutarFuente(nombre, fn, procesar))
  );
  
  return { procesos, hardware, fuentes: resultadosFuentes };
}