// Tipos definidos en §7
export type TipoProceso = "genesis" | "poligenesis" | "sueno" | "imaginacion" | "descarga" | "instalacion"
  | "actualizacion" | "app-fondo" | "servicio";

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

// Etiquetas en español para cada tipo de proceso
export const ETIQUETA_TIPO: Record<TipoProceso, string> = {
  genesis: "Genesis",
  poligenesis: "PoliGenesis",
  sueno: "Sueños",
  imaginacion: "Imaginación",
  descarga: "Descargas",
  instalacion: "Instalaciones",
  actualizacion: "Actualizaciones",
  "app-fondo": "Apps en segundo plano",
  servicio: "Servicios"
};

// Función para calcular porcentaje usado
export function porcentaje(usado: number | null, total: number | null): number | null {
  if (usado === null || total === null || total <= 0) {
    return null;
  }
  return Math.round((usado / total) * 100 * 10) / 10; // Redondeo a 1 decimal
}

// Umbrales por defecto para avisos
export interface UmbralesProcesos {
  cpu: number;
  ram: number;
  disco: number;
  bateria: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesProcesos = {
  cpu: 85,
  ram: 90,
  disco: 90,
  bateria: 20
};

// Función para generar avisos de hardware
export function avisosHardware(lista: HardwareServidor[], u: UmbralesProcesos): Array<{ servidor: string; medida: 'cpu' | 'ram' | 'disco' | 'bateria'; valor: number; umbral: number }> {
  const avisos: Array<{ servidor: string; medida: 'cpu' | 'ram' | 'disco' | 'bateria'; valor: number; umbral: number }> = [];
  
  for (const servidor of lista) {
    // CPU
    if (servidor.cpuPct !== null && servidor.cpuPct > u.cpu) {
      avisos.push({
        servidor: servidor.nombre,
        medida: 'cpu',
        valor: servidor.cpuPct,
        umbral: u.cpu
      });
    }
    
    // RAM
    if (servidor.ramUsadaMb !== null && servidor.ramTotalMb !== null && servidor.ramTotalMb > 0) {
      const ramPct = (servidor.ramUsadaMb / servidor.ramTotalMb) * 100;
      if (ramPct > u.ram) {
        avisos.push({
          servidor: servidor.nombre,
          medida: 'ram',
          valor: ramPct,
          umbral: u.ram
        });
      }
    }
    
    // Disco
    if (servidor.discoLibreGb !== null && servidor.discoTotalGb !== null && servidor.discoTotalGb > 0) {
      const discoUsadoGb = servidor.discoTotalGb - servidor.discoLibreGb;
      const discoPct = (discoUsadoGb / servidor.discoTotalGb) * 100;
      if (discoPct > u.disco) {
        avisos.push({
          servidor: servidor.nombre,
          medida: 'disco',
          valor: discoPct,
          umbral: u.disco
        });
      }
    }
    
    // Batería (solo avisa por DEBAJO del umbral y solo si no está cargando)
    if (servidor.bateriaPct !== null && servidor.cargando === false && servidor.bateriaPct < u.bateria) {
      avisos.push({
        servidor: servidor.nombre,
        medida: 'bateria',
        valor: servidor.bateriaPct,
        umbral: u.bateria
      });
    }
  }
  
  return avisos;
}

// Funciones para crear HardwareServidor desde diferentes fuentes
export function hardwareDesdeMac(r: unknown, ahora: number): HardwareServidor | null {
  if (!r || typeof r !== 'object') {
    return null;
  }
  
  const hw = r as {
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
  };
  
  return {
    id: 'mac-' + (hw.medidoEn || Date.now()),
    nombre: 'Esta Mac',
    tipo: 'mac',
    cpuPct: hw.cpuPct,
    nucleos: hw.nucleos,
    carga: hw.carga,
    ramUsadaMb: hw.ramUsadaMb,
    ramTotalMb: hw.ramTotalMb,
    gpuPct: hw.gpuPct,
    gpuNombre: hw.gpuNombre,
    discoLibreGb: hw.discoLibreGb,
    discoTotalGb: hw.discoTotalGb,
    bateriaPct: hw.bateriaPct,
    cargando: hw.cargando,
    medidoEn: hw.medidoEn,
    fuente: '/api/mando/hardware'
  };
}

export function hardwareDesdeNodo(n: unknown, ahora: number): HardwareServidor | null {
  if (!n || typeof n !== 'object') {
    return null;
  }
  
  const nodo = n as {
    nodo: string;
    medio: string;
    ram_libre_mb: number | null;
    disco_gb: number | null;
    cpu_pct: number | null;
    ram_total_mb: number | null;
    disco_total_gb: number | null;
    nucleos: number | null;
    carga: number | null;
  };
  
  // Calcular ram usada = total - libre solo si hay total
  let ramUsadaMb: number | null = null;
  if (nodo.ram_total_mb !== null && nodo.ram_libre_mb !== null) {
    ramUsadaMb = nodo.ram_total_mb - nodo.ram_libre_mb;
  }
  
  return {
    id: 'nodo-' + nodo.nodo,
    nombre: nodo.nodo,
    tipo: 'a1', // Según la tabla en §7.2, A1 corresponde a nodos de MetaGenesis
    cpuPct: nodo.cpu_pct,
    nucleos: nodo.nucleos,
    carga: nodo.carga,
    ramUsadaMb: ramUsadaMb,
    ramTotalMb: nodo.ram_total_mb,
    gpuPct: null, // No disponible en nodos A1 según documentación
    gpuNombre: null,
    discoLibreGb: null, // No disponible directamente, tenemos disco_gb que parece ser total
    discoTotalGb: nodo.disco_total_gb,
    bateriaPct: null, // No batería en servidores A1
    cargando: null,
    medidoEn: ahora,
    fuente: 'nodo-metagenesis'
  };
}

export function hardwareDesdeNeurona(n: unknown, ahora: number): HardwareServidor | null {
  if (!n || typeof n !== 'object') {
    return null;
  }
  
  const neurona = n as {
    capabilities: {
      bateria: {
        level: number | null;
        charging: boolean | null;
      };
      cuota_almacenamiento: number | null; // En MB según contexto
    };
  };
  
  return {
    id: 'neurona-' + Math.random().toString(36).substr(2, 9), // ID temporal ya que no hay ID estable en capabilities
    nombre: 'Neurona del navegador',
    tipo: 'neurona',
    cpuPct: null, // CPU y GPU dicen «sin medida en este aparato» según documentación
    nucleos: null,
    carga: null,
    ramUsadaMb: null, // No se especifica RAM en capabilities
    ramTotalMb: null,
    gpuPct: null,
    gpuNombre: null,
    discoLibreGb: null, // No se especifica almacenamiento libre
    discoTotalGb: neurona.capabilities.cuota_almacenamiento ? neurona.capabilities.cuota_almacenamiento / 1024 : null, // Convertir MB a GB
    bateriaPct: neurona.capabilities.bateria.level,
    cargando: neurona.capabilities.bateria.charging,
    medidoEn: ahora,
    fuente: 'neuron_devices.capabilities'
  };
}