// Tipos exactos del §7
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

// Etiquetas en español
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

// Funciones a implementar
export function porcentaje(usado: number | null, total: number | null): number | null {
  if (usado === null || total === null || total <= 0) {
    return null;
  }
  return Math.round((usado / total) * 100 * 10) / 10; // Redondeo a 1 decimal
}

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

export function avisosHardware(
  lista: HardwareServidor[],
  u: UmbralesProcesos
): Array<{ servidor: string; medida: 'cpu' | 'ram' | 'disco' | 'bateria'; valor: number; umbral: number }> {
  const avisos: Array<{ servidor: string; medida: 'cpu' | 'ram' | 'disco' | 'bateria'; valor: number; umbral: number }> = [];

  for (const servidor of lista) {
    // CPU check
    if (servidor.cpuPct !== null && servidor.cpuPct >= u.cpu) {
      avisos.push({
        servidor: servidor.nombre,
        medida: 'cpu',
        valor: servidor.cpuPct,
        umbral: u.cpu
      });
    }

    // RAM check
    if (servidor.ramUsadaMb !== null && servidor.ramTotalMb !== null) {
      const ramPorcentaje = porcentaje(servidor.ramUsadaMb, servidor.ramTotalMb);
      if (ramPorcentaje !== null && ramPorcentaje >= u.ram) {
        avisos.push({
          servidor: servidor.nombre,
          medida: 'ram',
          valor: ramPorcentaje,
          umbral: u.ram
        });
      }
    }

    // Disco check (percentage used)
    if (servidor.discoTotalGb !== null && servidor.discoLibreGb !== null) {
      const usado = servidor.discoTotalGb - servidor.discoLibreGb;
      const discoPorcentaje = porcentaje(usado, servidor.discoTotalGb);
      if (discoPorcentaje !== null && discoPorcentaje >= u.disco) {
        avisos.push({
          servidor: servidor.nombre,
          medida: 'disco',
          valor: discoPorcentaje,
          umbral: u.disco
        });
      }
    }

    // Batería check (alert when BELOW threshold AND not charging)
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

export function hardwareDesdeMac(r: unknown, ahora: number): HardwareServidor | null {
  // Defensive programming: check if r is an object
  if (r === null || typeof r !== 'object') {
    return null;
  }

  // Type assertion to access properties
  const data = r as {
    cpuPct?: number | null;
    nucleos?: number | null;
    carga?: number | null;
    ramUsadaMb?: number | null;
    ramTotalMb?: number | null;
    gpuPct?: number | null;
    gpuNombre?: string | null;
    discoLibreGb?: number | null;
    discoTotalGb?: number | null;
    bateriaPct?: number | null;
    cargando?: boolean | null;
    medidoEn?: number | null;
    fuente?: string;
    nombre?: string;
    id?: string;
  };

  // Check if the object has at least one of the expected properties
  // If it's an empty object, return null as per test expectations
  const hasExpectedProperties =
    data.cpuPct !== undefined ||
    data.nucleos !== undefined ||
    data.carga !== undefined ||
    data.ramUsadaMb !== undefined ||
    data.ramTotalMb !== undefined ||
    data.gpuPct !== undefined ||
    data.gpuNombre !== undefined ||
    data.discoLibreGb !== undefined ||
    data.discoTotalGb !== undefined ||
    data.bateriaPct !== undefined ||
    data.cargando !== undefined ||
    data.fuente !== undefined ||
    data.nombre !== undefined ||
    data.id !== undefined;

  if (!hasExpectedProperties) {
    return null;
  }

  // Generate id if not provided
  const id = data.id || `mac-${ahora}`;
  
  // Use provided nombre or default to "Esta Mac"
  const nombre = data.nombre || "Esta Mac";
  
  // Use provided fuente or default to "/api/mando/hardware"
  const fuente = data.fuente || "/api/mando/hardware";

  return {
    id,
    nombre,
    tipo: "mac",
    cpuPct: data.cpuPct !== undefined ? data.cpuPct : null,
    nucleos: data.nucleos !== undefined ? data.nucleos : null,
    carga: data.carga !== undefined ? data.carga : null,
    ramUsadaMb: data.ramUsadaMb !== undefined ? data.ramUsadaMb : null,
    ramTotalMb: data.ramTotalMb !== undefined ? data.ramTotalMb : null,
    gpuPct: data.gpuPct !== undefined ? data.gpuPct : null,
    gpuNombre: data.gpuNombre !== undefined ? data.gpuNombre : null,
    discoLibreGb: data.discoLibreGb !== undefined ? data.discoLibreGb : null,
    discoTotalGb: data.discoTotalGb !== undefined ? data.discoTotalGb : null,
    bateriaPct: data.bateriaPct !== undefined ? data.bateriaPct : null,
    cargando: data.cargando !== undefined ? data.cargando : null,
    medidoEn: ahora, // Always use the provided timestamp
    fuente
  };
}

export function hardwareDesdeNodo(n: unknown, ahora: number): HardwareServidor | null {
  // Defensive programming: check if n is a non-null object
  if (n === null || typeof n !== 'object') {
    return null;
  }

  // Type assertion to access properties
  const data = n as {
    nodo?: string;
    medio?: string;
    ram_libre_mb?: number | null;
    disco_gb?: number | null;
    cpu_pct?: number | null;
    ram_total_mb?: number | null;
    disco_total_gb?: number | null;
    nucleos?: number | null;
    carga?: number | null;
  };

  // Check if the object has at least one of the expected properties
  // If it's an empty object, return null as per test expectations
  const hasExpectedProperties =
    data.nodo !== undefined ||
    data.medio !== undefined ||
    data.ram_libre_mb !== undefined ||
    data.disco_gb !== undefined ||
    data.cpu_pct !== undefined ||
    data.ram_total_mb !== undefined ||
    data.disco_total_gb !== undefined ||
    data.nucleos !== undefined ||
    data.carga !== undefined;

  if (!hasExpectedProperties) {
    return null;
  }

  // Calculate ram usada if we have both total and libre
  let ramUsadaMb: number | null = null;
  let ramTotalMb: number | null = null;
  
  if (data.ram_total_mb !== null && data.ram_total_mb !== undefined) {
    ramTotalMb = data.ram_total_mb;
    if (data.ram_libre_mb !== null && data.ram_libre_mb !== undefined) {
      ramUsadaMb = data.ram_total_mb - data.ram_libre_mb;
    }
  }

  return {
    id: data.nodo ? `a1-${data.nodo}` : `a1-${ahora}`,
    nombre: data.nodo || `Nodo ${ahora}`,
    tipo: "a1",
    cpuPct: data.cpu_pct !== undefined ? data.cpu_pct : null,
    nucleos: data.nucleos !== undefined ? data.nucleos : null,
    carga: data.carga !== undefined ? data.carga : null,
    ramUsadaMb,
    ramTotalMb,
    gpuPct: null, // GPU not available in NodoVista
    gpuNombre: null, // GPU name not available in NodoVista
    discoLibreGb: null, // Not directly available in NodoVista
    discoTotalGb: data.disco_total_gb !== undefined ? data.disco_total_gb : null,
    bateriaPct: null, // Battery not available in NodoVista
    cargando: null, // Charging status not available in NodoVista
    medidoEn: ahora,
    fuente: "MetaGenesis nodo"
  };
}

export function hardwareDesdeNeurona(n: unknown, ahora: number): HardwareServidor | null {
  // Defensive programming: check if n is a non-null object
  if (n === null || typeof n !== 'object') {
    return null;
  }

  // Type assertion to access properties
  const data = n as {
    capabilities?: {
      bateria?: {
        level?: number | null;
        charging?: boolean | null;
      };
      cuota_almacenamiento?: {
        usado?: number | null;
        total?: number | null;
      };
    };
  };

  // Check if the object has the capabilities property
  // If it doesn't have capabilities at all, return null as per test expectations
  if (!data.capabilities) {
    return null;
  }

  // Extract battery info
  const bateriaLevel = data.capabilities?. bateria?.level !== null && data.capabilities?. bateria?.level !== undefined 
    ? data.capabilities?. bateria?.level 
    : null;
    
  const bateriaCharging = data.capabilities?. bateria?.charging !== null && data.capabilities?. bateria?.charging !== undefined 
    ? data.capabilities?. bateria?.charging 
    : null;

  return {
    id: `neurona-${ahora}`,
    nombre: "Neurona Desconocida",
    tipo: "neurona",
    cpuPct: null, // CPU not available in neuron_devices
    nucleos: null, // Nucleos not available in neuron_devices
    carga: null, // Carga not available in neuron_devices
    ramUsadaMb: null, // RAM not available in neuron_devices
    ramTotalMb: null, // RAM not available in neuron_devices
    gpuPct: null, // GPU not available in neuron_devices
    gpuNombre: null, // GPU name not available in neuron_devices
    discoLibreGb: null, // Storage info not mapped to these fields
    discoTotalGb: null, // Storage info not mapped to these fields
    bateriaPct: bateriaLevel,
    cargando: bateriaCharging,
    medidoEn: ahora,
    fuente: "neuron_devices.capabilities"
  };
}