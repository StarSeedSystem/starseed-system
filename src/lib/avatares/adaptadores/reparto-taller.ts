import type { Hierro } from "@/lib/avatares/adn/optimizacion";
import { capacidadesDe } from "@/lib/avatares/adn/optimizacion";
import type { Requisito3D } from "@/lib/avatares/adn/motores";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";
import type { PlanOptimizacion } from "@/lib/avatares/adn/optimizacion";
import { planOptimizacion, resolucionPara } from "@/lib/avatares/adn/optimizacion";
import type { PeticionPlan } from "@/lib/avatares/adn/canalizacion";
import { planificar } from "@/lib/avatares/adn/canalizacion";
import type { Esqueleto } from "@/lib/avatares/adn/adn";
import type { Partida } from "@/lib/avatares/adn/canalizacion";

const NEURON_CAPACIDADES_3D_KEY = "starseed.neuron.capacidades3d";

/**
 * Convierte las capacidades de una neurona en un Hierro para el cálculo de capacidades 3D.
 * 
 * @param caps Capacidades de la neurona detectadas
 * @returns Hierro que representa el hardware relevante para generación 3D
 */
function calcularHierro(caps: NeuronCapabilities): Hierro {
  // Determinar tipo de GPU
  let gpu: Hierro["gpu"] = "ninguna";
  const gpuVendor = caps.gpuVendor?.toLowerCase() || "";
  if (gpuVendor.includes("nvidia")) {
    gpu = "nvidia";
  } else if (gpuVendor.includes("apple")) {
    gpu = "apple";
  }
  
  // Memoria RAM (en GB)
  const ramGB = caps.memoryGb ?? 0;
  
  // VRAM (en GB) - para Apple usamos null (memoria unificada), para NVIDIA intentamos estimar
  let vramGB: Hierro["vramGB"] = null;
  if (gpu === "nvidia") {
    // Intentamos extraer VRAM del nombre de la GPU si está disponible
    const gpuRenderer = caps.gpuRenderer?.toLowerCase() || "";
    // Esta es una aproximación muy básica; en un sistema real tendríamos mejor detección
    if (gpuRenderer.includes("rtx 4090") || gpuRenderer.includes("rtx 3090")) {
      vramGB = 24;
    } else if (gpuRenderer.includes("rtx 4080") || gpuRenderer.includes("rtx 3080")) {
      vramGB = 12;
    } else if (gpuRenderer.includes("rtx 4070") || gpuRenderer.includes("rtx 3070")) {
      vramGB = 10;
    } else if (gpuRenderer.includes("rtx 4060") || gpuRenderer.includes("rtx 3060")) {
      vramGB = 8;
    } else if (gpuRenderer.includes("gtx 1080") || gpuRenderer.includes("gtx 980")) {
      vramGB = 6;
    } else {
      // Valor por defecto conservador para GPUs NVIDIA desconocidas
      vramGB = 8;
    }
  }
  // Para Apple y otras GPUs, vramGB permanece null (indicando que no es NVIDIA o memoria unificada)
  
  // Blender: verificamos si está disponible (en un sistema real, esto vendría de detección de software)
  const blender = false; // Placeholder - en una implementación real, se detectaría si Blender está instalado
  
  // Permite espacio HF: esto vendría de los permisos o configuración del usuario
  const permiteEspacioHf = false; // Placeholder
  
  // Clave externa: esto vendría de la configuración de claves de API y permisos
  const claveExterna = false; // Placeholder
  
  return {
    gpu,
    ramGB,
    vramGB,
    blender,
    permiteEspacioHf,
    claveExterna,
  };
}

/**
 * Publica las capacidades de generación 3D de una neurona.
 * Esta función debería llamarse al arrancar y cuando cambian las capacidades.
 * 
 * @param neuronId ID de la neurona
 * @param caps Capacidades actuales de la neurona
 */
export function publicarCapacidadesTaller(neuronId: string, caps: NeuronCapabilities): void {
  // Calculamos las capacidades de generación 3D
  const hierro = calcularHierro(caps);
  const capabilities = capacidadesDe(hierro);
  
  // Guardamos en localStorage usando el mecanismo de preferencias sincronizadas
  // Siguiendo el patrón de los archivos existentes en el códigobase
  if (typeof window !== "undefined") {
    const storageKey = `${NEURON_CAPACIDADES_3D_KEY}.${neuronId}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(capabilities));
    } catch (e) {
      // En entornos de prueba o si falla el almacenamiento, continuamos sin guardar
      console.warn(`No se pudieron guardar las capacidades 3D para la neurona ${neuronId}:`, e);
    }
  }
}

/**
 * Obtiene las capacidades de generación 3D publicadas por una neurona.
 * 
 * @param neuronId ID de la neurona
 * @returns Capacidades de generación 3D de la neurona, o null si no están disponibles
 */
export function obtenerCapacidadesTaller(neuronId: string): Requisito3D[] | null {
  if (typeof window !== "undefined") {
    const storageKey = `${NEURON_CAPACIDADES_3D_KEY}.${neuronId}`;
    try {
      const capsJson = window.localStorage.getItem(storageKey);
      return capsJson ? JSON.parse(capsJson) : null;
    } catch (e) {
      console.warn(`No se pudieron leer las capacidades 3D para la neurona ${neuronId}:`, e);
      return null;
    }
  }
  return null;
}

/**
 * Calcula tanto el Hierro como las capacidades de generación 3D de una neurona.
 * Esta es la función principal que debería usarse para obtener las capacidades actuales.
 * 
 * @param caps Capacidades actuales de la neurona
 * @returns Objeto con tanto el Hierro como las capacidades derivadas
 */
export function obtenerHierroYCapacidades(caps: NeuronCapabilities): { hierro: Hierro; capabilities: Requisito3D[] } {
  const hierro = calcularHierro(caps);
  const capabilities = capacidadesDe(hierro);
  return { hierro, capabilities };
}

/**
 * Elige la mejor neurona para manejar un encargo de generación 3D.
 * 
 * @param encargo Descripción del trabajo a realizar
 * @param neuronas Lista de neuronas disponibles
 * @returns Objeto con la neurona elegida y la razón, o null si ninguna puede manejarlo
 */
export function elegirNeurona(
  encargo: {
    destino: Destino3D;
    partida: Partida;
    esqueleto: Esqueleto;
    region: string | null;
    comercial: boolean;
    permitirDePago: boolean;
    detallar?: boolean;
    prioridad?: "calidad" | "rapidez";
    cerrada?: boolean;
  },
  neuronas: Array<{
    id: string;
    capabilities: NeuronCapabilities;
    // En un sistema real, también tendría permisos, settings, etc.
  }>
): { neurona: string | null; motivo: string } {
  // Si no hay neuronas, retornamos inmediatamente
  if (neuronas.length === 0) {
    return { neurona: null, motivo: "No hay neuronas disponibles" };
  }
  
  // Primero, filtramos las neuronas que pueden manejar el encargo
  const neuronasCapaces: Array<{
    id: string;
    capabilities: NeuronCapabilities;
    plan: ReturnType<typeof planificar>;
  }> = [];
  
  for (const neurona of neuronas) {
    // Obtenemos las capacidades de generación 3D de esta neurona
    // Primero intentamos obtenerlas del almacenamiento, si no están disponibles, las calculamos
    let capabilities = obtenerCapacidadesTaller(neurona.id);
    if (capabilities === null) {
      const { capabilities: calcCapabilities } = obtenerHierroYCapacidades(neurona.capabilities);
      capabilities = calcCapabilities;
    }
    
    // Construimos la petición para el planificador
    const peticion: PeticionPlan = {
      partida: encargo.partida,
      esqueleto: encargo.esqueleto,
      capacidades: capabilities,
      region: encargo.region,
      comercial: encargo.comercial,
      permitirDePago: encargo.permitirDePago,
      detallar: encargo.detallar,
      prioridad: encargo.prioridad,
      cerrada: encargo.cerrada,
    };
    
    // Calculamos el plan para esta neurona
    const plan = planificar(peticion);
    
    // Si el plan es listo (todas las etapas necesarias tienen motor o están saltadas válidamente),
    // entonces esta neurona puede manejar el encargo
    if (plan.listo) {
      neuronasCapaces.push({ ...neurona, plan });
    }
  }
  
  // Si ninguna neurona puede manejar el encargo, devolvemos una razón
  if (neuronasCapaces.length === 0) {
    // Construimos un mensaje explicativo basado en qué falta comúnmente
    let motivo = "Ninguna neurona disponible puede manejar este encargo. ";
    
    // Verificamos qué recursos faltan en general
    const tieneNeuronaCon32gbRam = neuronas.some(n => n.capabilities.memoryGb && n.capabilities.memoryGb >= 32);
    const tieneNeuronaNvidia = neuronas.some(n => n.capabilities.gpuVendor?.toLowerCase().includes("nvidia"));
    
    if (!tieneNeuronaCon32gbRam && !tieneNeuronaNvidia) {
      motivo += "No hay neuronas con Mac de 32 GB ni GPU NVIDIA.";
    } else if (!tieneNeuronaCon32gbRam) {
      motivo += "No hay neuronas con Mac de 32 GB disponibles.";
    } else if (!tieneNeuronaNvidia) {
      motivo += "No hay neuronas con GPU NVIDIA disponibles.";
    } else {
      motivo += "Las neuronas disponibles no tienen los recursos específicos necesarios para este tipo de trabajo.";
    }
    
    return { neurona: null, motivo };
  }
  
  // Entre las neuronas capaces, elegimos la mejor según los criterios:
  // 1. Primero las de la misma cuenta (en un sistema real, verificaríamos el owner)
  // 2. Luego las que su grupo/comunidad ofreció (en un sistema real, verificaríamos grupos/comunidades)
  // 3. Entre ellas, la que deja el plan listo con más fidelidad y menos carga
  
  // Como no tenemos información de cuenta/grupo en esta simplified implementation,
  // vamos directamente al criterio de fidelidad y carga
  
  // Definimos una puntuación para cada plan:
  // - Más fidelidad es mejor (usamos la fidelidad del motor elegido en la etapa de generar)
  // - Menos carga es mejor (usamos inversamente el tiempo aproximado o consumo de recursos)
  const neuronaMejor = neuronasCapaces.reduce((mejor, actual) => {
    // Calculamos fidelidad del plan (promedio de fidelidad de los motores usados)
    let fidelidadTotal = 0;
    let conteoEtapas = 0;
    
    for (const paso of actual.plan.pasos) {
      if (!paso.saltada && paso.motor) {
        fidelidadTotal += paso.motor.fidelidad ?? 0;
        conteoEtapas++;
      }
    }
    const fidelidadPromedio = conteoEtapas > 0 ? fidelidadTotal / conteoEtapas : 0;
    
    // Calculamos carga del plan (inverso del tiempo aproximado - menos tiempo es mejor)
    let cargaTotal = 0;
    let conteoEtapasConTiempo = 0;
    
    for (const paso of actual.plan.pasos) {
      if (!paso.saltada && paso.motor && paso.motor.minutosAprox !== undefined) {
        cargaTotal += paso.motor.minutosAprox;
        conteoEtapasConTiempo++;
      }
    }
    const cargaPromedio = conteoEtapasConTiempo > 0 ? cargaTotal / conteoEtapasConTiempo : 0;
    // Menos carga es mejor, así que usamos el negativo para la comparación
    // O podemos hacer que menor carga directa sea mejor en la comparación
    
    // Para simplificar, vamos a usar una combinación donde:
    // - Primero maximizamos fidelidad
    // - Luego minimizamos carga (tiempo)
    if (actual === neuronasCapaces[0]) {
      return actual;
    }
    
    if (fidelidadPromedio > (mejor.fidelidadPromedio ?? 0)) {
      return { ...actual, fidelidadPromedio, cargaPromedio };
    } else if (fidelidadPromedio === (mejor.fidelidadPromedio ?? 0)) {
      // En caso de empate en fidelidad, preferimos menos carga
      if (cargaPromedio < (mejor.cargaPromedio ?? Infinity)) {
        return { ...actual, fidelidadPromedio, cargaPromedio };
      }
    }
    
    return mejor;
  }, { 
    ...neuronasCapaces[0], 
    fidelidadPromedio: 0, 
    cargaPromedio: Infinity 
  });
  
  // Construimos el motivo de la elección
  const motivo = `Seleccionada neurona ${neuronaMejor.id} por ofrecer el mejor equilibrio de fidelidad y eficiencia para el destino ${encargo.destino}.`;
  
  return { neurona: neuronaMejor.id, motivo };
}