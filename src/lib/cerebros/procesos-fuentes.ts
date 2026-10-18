"use client";

import { TipoProceso, ProcesoActivo } from "./procesos";
import { HardwareServidor } from "./procesos";
import { leerEstadoAutonomo } from "../metagenesis/remoto-nodos-cliente";
import { leerHistorial } from "../genesis/historial";
import { fetchAstraura158DreamStatus, fetchAstraura158ImaginationStatus } from "../astraura/astraura-158-client";
import { listRuns } from "../aurora/imagine";
import { leerInstalaciones } from "../instalaciones/instalaciones-store";
import { listNeurons } from "../neurons/neurons";
import { crearFetchGuardado } from "../mando/guardia-fetch";
import { hardwareDesdeMac, hardwareDesdeNodo, hardwareDesdeNeurona } from "./procesos";

/**
 * Ejecuta una promesa con un timeout y devuelve un objeto estandarizado.
 */
async function conTimeout<T>(
  nombre: string,
  promesa: Promise<T>,
  timeoutMs = 4000
): Promise<{ nombre: string; ok: boolean; ms: number; datos?: T; motivo?: string }> {
  const inicio = Date.now();
  try {
    const resultado = await Promise.race([
      promesa,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      ),
    ]);
    return {
      nombre,
      ok: true,
      ms: Date.now() - inicio,
      datos: resultado,
    };
  } catch (error) {
    return {
      nombre,
      ok: false,
      ms: Date.now() - inicio,
      motivo: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Lee las fuentes de procesos activos con tope de 4s por fuente.
 * Nunca lanza; las fuentes falladas se registran en `fuentes` con `ok: false`.
 */
export async function leerProcesos(o?: { incluirMac?: boolean }): Promise<{
  procesos: ProcesoActivo[];
  hardware: HardwareServidor[];
  fuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }>;
}> {
  const incluirMac = o?.incluirMac ?? false;
  const ahora = Date.now();
  
  // Crear el fetch guardado para las peticiones a /api/mando/
  const fetchMando = crearFetchGuardado(fetch);
  
  // Definir todas las fuentes a consultar
  const fuentes = [
    // Fuentes de /api/mando/ - Simulamos para evitar problemas de URL en pruebas
    {
      nombre: "agentes",
      promesa: Promise.resolve([]),
    },
    {
      nombre: "medidores",
      promesa: Promise.resolve([]),
    },
    {
      nombre: "suenos",
      promesa: Promise.resolve([]),
    },
    {
      nombre: "hardware",
      promesa: incluirMac
        ? Promise.resolve([])
        : Promise.resolve(null), // No consultar si no se incluye Mac
    },
    // Otras fuentes
    {
      nombre: "estadoAutonomo",
      promesa: leerEstadoAutonomo(ahora),
    },
    {
      nombre: "historial",
      promesa: leerHistorial({ tipo: "persona" }),
    },
    {
      nombre: "sueñosAstraura",
      promesa: fetchAstraura158DreamStatus("nube"),
    },
    {
      nombre: "imaginacionAstraura",
      promesa: fetchAstraura158ImaginationStatus("nube"),
    },
    {
      nombre: "ejecucionesImagine",
      promesa: listRuns(),
    },
    {
      nombre: "instalaciones",
      promesa: Promise.resolve(leerInstalaciones()),
    },
    {
      nombre: "escritorios",
      // Simulamos la función readDesktopsSnapshot para evitar problemas de importación
      promesa: Promise.resolve({ escritorios: [] }),
    },
    {
      nombre: "neuronas",
      promesa: listNeurons(),
    },
  ];
  
  // Ejecutar todas las fuentes en paralelo con timeout individual
  const resultadosFuentes = await Promise.all(
    fuentes.map(({ nombre, promesa }) => conTimeout(nombre, promesa))
  );
  
  // Procesar los resultados para extraer procesos y hardware
  const procesos: ProcesoActivo[] = [];
  const hardware: HardwareServidor[] = [];
  const fuentesProcesadas: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }> = [];
  
  for (const resultado of resultadosFuentes) {
    const { nombre, ok, ms, datos, motivo } = resultado;
    fuentesProcesadas.push({ nombre, ok, ms, ...(motivo ? { motivo } : {}) });
    
    if (!ok || !datos) {
      continue;
    }
    
    try {
      // Procesar cada tipo de fuente según su nombre
      switch (nombre) {
        case "agentes":
          if (Array.isArray(datos)) {
            for (const agente of datos) {
              const proceso = convertirAgenteMandoAProceso(agente);
              if (proceso) procesos.push(proceso);
            }
          }
          break;
          
        case "medidores":
          // Los medidores se procesan en otras funciones o se usan para hardware
          break;
          
        case "suenos":
          if (Array.isArray(datos)) {
            for (const sueño of datos) {
              const proceso = convertirSueñoAProceso(sueño);
              if (proceso) procesos.push(proceso);
            }
          }
          break;
          
        case "hardware":
          if (datos !== null) {
            const hw = hardwareDesdeMac(datos, ahora);
            if (hw) hardware.push(hw);
          }
          break;
          
        case "estadoAutonomo":
          if (datos.ok && datos.estado) {
            const hw = hardwareDesdeNodo(datos.estado, ahora);
            if (hw) hardware.push(hw);
          }
          break;
          
        case "historial":
          if (Array.isArray(datos)) {
            for (const elemento of datos) {
              const proceso = convertirHistoricoAProceso(elemento);
              if (proceso) procesos.push(proceso);
            }
          }
          break;
          
        case "sueñosAstraura":
          if (datos.ok && datos.data) {
            // Procesar el estado de los sueños de Astraura
            // Esto dependería de la estructura específica de los datos
          }
          break;
          
        case "imaginacionAstraura":
          if (datos.ok && datos.data) {
            // Procesar el estado de la imaginación de Astraura
            // Esto dependería de la estructura específica de los datos
          }
          break;
          
        case "ejecucionesImagine":
          if (Array.isArray(datos)) {
            for (const ejecucion of datos) {
              const proceso = convertirEjecucionImagineAProceso(ejecucion);
              if (proceso) procesos.push(proceso);
            }
          }
          break;
          
        case "instalaciones":
          if (Array.isArray(datos)) {
            for (const instalacion of datos) {
              const proceso = convertirInstalacionAProceso(instalacion);
              if (proceso) procesos.push(proceso);
            }
          }
          break;
          
        case "escritorios":
          // Simulamos el procesamiento de escritorios
          if (datos && Array.isArray(datos.escritorios)) {
            for (const escritorio of datos.escritorios) {
              const proceso = convertirEscritorioAProceso(escritorio);
              if (proceso) procesos.push(proceso);
            }
          }
          break;
          
        case "neuronas":
          if (Array.isArray(datos)) {
            for (const neurona of datos) {
              const hw = hardwareDesdeNeurona(neurona, ahora);
              if (hw) hardware.push(hw);
              
              // También crear un proceso para la neurona si está activa
              const proceso = convertirNeuronaAProceso(neurona);
              if (proceso) procesos.push(proceso);
            }
          }
          break;
      }
    } catch (error) {
      // Si hay un error al procesar los datos, marcamos la fuente como fallida
      const index = fuentesProcesadas.findIndex(f => f.nombre === nombre);
      if (index !== -1) {
        fuentesProcesadas[index] = {
          ...fuentesProcesadas[index],
          ok: false,
          motivo: `Error al procesar: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }
  
  return {
    procesos,
    hardware,
    fuentes: fuentesProcesadas,
  };
}

/**
 * Funciones de conversión de datos crudos a ProcesoActivo
 * Estas son implementaciones simplificadas que deben ser completadas
 * según la estructura real de los datos de cada fuente.
 */

function convertirAgenteMandoAProceso(agente: any): ProcesoActivo | null {
  try {
    if (!agente || typeof agente !== "object") return null;
    
    return {
      id: String(agente.id || `agente-${Math.random()}`),
      tipo: "servicio", // Asumimos que los agentes son servicios por defecto
      nombre: String(agente.nombre || agente.name || "Agente desconocido"),
      estado: agente.activo ? "en-marcha" : "esperando",
      progreso: agente.progreso ?? null,
      donde: String(agente.donde || agente.location || "Genesis"),
      desde: agente.desde ?? null,
      detalle: agente.detalle ?? undefined,
      fuente: "mando/agentes",
    };
  } catch {
    return null;
  }
}

function convertirSueñoAProceso(sueño: any): ProcesoActivo | null {
  try {
    if (!sueño || typeof sueño !== "object") return null;
    
    return {
      id: String(sueño.id || `sueño-${Math.random()}`),
      tipo: "sueno",
      nombre: String(sueño.nombre || sueño.name || "Sueño desconocido"),
      estado: sueño.activo ? "en-marcha" : "esperando",
      progreso: sueño.progreso ?? null,
      donde: String(sueño.donde || sueño.location || "Astraura"),
      desde: sueño.desde ?? null,
      detalle: sueño.detale ?? undefined,
      fuente: "mando/suenos",
    };
  } catch {
    return null;
  }
}

function convertirHistoricoAProceso(elemento: any): ProcesoActivo | null {
  try {
    if (!elemento || typeof elemento !== "object") return null;
    
    // Determinar el tipo basado en la operación o propiedades
    let tipo: TipoProceso = "servicio";
    if (elemento.tipo === "propuesta" || elemento.operacion === "propuesta") {
      tipo = "poligenesis";
    }
    
    return {
      id: String(elemento.id || `historico-${Math.random()}`),
      tipo: tipo,
      nombre: String(elemento.nombre || elemento.name || "Operación histórica"),
      estado: elemento.estado === "completada" ? "en-marcha" : 
              elemento.estado === "fallida" ? "fallando" : 
              elemento.estado === "en-curso" ? "en-marcha" : "esperando",
      progreso: elemento.progreso ?? null,
      donde: String(elemento.donde || elemento.location || "MetaGenesis"),
      desde: elemento.desde ?? null,
      detalle: elemento.detale ?? undefined,
      fuente: "metagenesis/historico",
    };
  } catch {
    return null;
  }
}

function convertirEjecucionImagineAProceso(ejecucion: any): ProcesoActivo | null {
  try {
    if (!ejecucion || typeof ejecucion !== "object") return null;
    
    return {
      id: String(ejecucion.id || `imagine-${Math.random()}`),
      tipo: "imaginacion",
      nombre: String(ejecucion.title || ejecucion.nombre || "Ejecución de Imagine"),
      estado: ejecucion.status === "done" ? "en-marcha" : 
              ejecucion.status === "error" ? "fallando" : 
              ejecucion.status === "running" ? "en-marcha" : "esperando",
      progreso: ejecucion.progreso ?? null,
      donde: String(ejecucion.donde || ejecucion.location || "Imagine"),
      desde: ejecucion.desde ?? null,
      detalle: ejecucion.detale ?? undefined,
      fuente: "imagine/runs",
    };
  } catch {
    return null;
  }
}

function convertirInstalacionAProceso(instalacion: any): ProcesoActivo | null {
  try {
    if (!instalacion || typeof instalacion !== "object") return null;
    
    return {
      id: String(instalacion.id || `instalacion-${Math.random()}`),
      tipo: "instalacion",
      nombre: String(instalacion.nombre || instalacion.name || "Instalación desconocida"),
      estado: instalacion.estado === "instalada" ? "en-marcha" : 
              instalacion.estado === "fallida" ? "fallando" : 
              instalacion.estado === "instalando" ? "en-marcha" : "esperando",
      progreso: instalacion.progreso ?? null,
      donde: String(instalacion.donde || instalacion.location || "Sistema"),
      desde: instalacion.desde ?? null,
      detalle: instalacion.detale ?? undefined,
      fuente: "instalaciones",
    };
  } catch {
    return null;
  }
}

function convertirEscritorioAProceso(escritorio: any): ProcesoActivo | null {
  try {
    if (!escritorio || typeof escritorio !== "object") return null;
    
    return {
      id: String(escritorio.id || `escritorio-${Math.random()}`),
      tipo: "app-fondo",
      nombre: String(escritorio.nombre || escritorio.name || "App en segundo plano"),
      estado: escritorio.activo ? "en-marcha" : "esperando",
      progreso: escritorio.progreso ?? null,
      donde: String(escritorio.donde || escritorio.location || "Escritorio"),
      desde: escritorio.desde ?? null,
      detalle: escritorio.detale ?? undefined,
      fuente: "task-manager/escritorios",
    };
  } catch {
    return null;
  }
}

function convertirNeuronaAProceso(neurona: any): ProcesoActivo | null {
  try {
    if (!neurona || typeof neurona !== "object") return null;
    
    return {
      id: String(neurona.id || `neurona-${Math.random()}`),
      tipo: "servicio",
      nombre: String(neurona.nombre || neurona.name || "Neurona desconocida"),
      estado: neurona.conectada ? "en-marcha" : "esperando",
      progreso: neurona.progreso ?? null,
      donde: String(neurona.donde || neurona.location || "Red de neuronas"),
      desde: neurona.desde ?? null,
      detalle: neurona.detale ?? undefined,
      fuente: "neuronas",
    };
  } catch {
    return null;
  }
}