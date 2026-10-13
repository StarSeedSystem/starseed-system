// Tipos para procesos activos y hardware
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

// Calcula porcentaje de uso con redondeo a 1 decimal
export function porcentaje(usado: number | null, total: number | null): number | null {
  if (usado === null || total === null || total <= 0) {
    return null;
  }
  return Math.round((usado / total) * 1000) / 10; // Redondeo a 1 decimal
}

// Umbrales por defecto para avisos de hardware
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

// Genera avisos de hardware basado en umbrales
export function avisosHardware(
  lista: HardwareServidor[],
  u: UmbralesProcesos
): Array<{ 
  servidor: string; 
  medida: 'cpu' | 'ram' | 'disco' | 'bateria'; 
  valor: number; 
  umbral: number 
}> {
  const avisos: Array<{ 
    servidor: string; 
    medida: 'cpu' | 'ram' | 'disco' | 'bateria'; 
    valor: number; 
    umbral: number 
  }> = [];

  for (const servidor of lista) {
    // CPU: avisa cuando supera el umbral
    if (servidor.cpuPct !== null && servidor.cpuPct > u.cpu) {
      avisos.push({
        servidor: servidor.nombre,
        medida: 'cpu',
        valor: servidor.cpuPct,
        umbral: u.cpu
      });
    }

    // RAM: avisa cuando supera el umbral
    if (servidor.ramUsadaMb !== null && servidor.ramTotalMb !== null && servidor.ramTotalMb > 0) {
      const ramPct = porcentaje(servidor.ramUsadaMb, servidor.ramTotalMb);
      if (ramPct !== null && ramPct > u.ram) {
        avisos.push({
          servidor: servidor.nombre,
          medida: 'ram',
          valor: ramPct,
          umbral: u.ram
        });
      }
    }

    // Disco: avisa cuando el porcentaje de uso supera el umbral
    if (servidor.discoLibreGb !== null && servidor.discoTotalGb !== null && servidor.discoTotalGb > 0) {
      const discoUsadoGb = servidor.discoTotalGb - servidor.discoLibreGb;
      const discoPct = porcentaje(discoUsadoGb, servidor.discoTotalGb);
      if (discoPct !== null && discoPct > u.disco) {
        avisos.push({
          servidor: servidor.nombre,
          medida: 'disco',
          valor: discoPct,
          umbral: u.disco
        });
      }
    }

    // Batería: avisa cuando está POR DEBAJO del umbral Y no está cargando
    if (
      servidor.bateriaPct !== null && 
      servidor.cargando !== null && 
      !servidor.cargando && // Solo avisa si NO está cargando
      servidor.bateriaPct < u.bateria
    ) {
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

// Convierte respuesta de /api/mando/hardware a HardwareServidor (defensivo)
export function hardwareDesdeMac(r: unknown, ahora: number): HardwareServidor | null {
  if (
    !r ||
    typeof r !== 'object' ||
    Array.isArray(r)
  ) {
    return null;
  }

  const hardware = r as {
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
  };

  return {
    id: `mac-${ahora}`, // ID temporal basado en timestamp
    nombre: "Esta Mac",
    tipo: "mac",
    cpuPct: hardware.cpuPct ?? null,
    nucleos: hardware.nucleos ?? null,
    carga: hardware.carga ?? null,
    ramUsadaMb: hardware.ramUsadaMb ?? null,
    ramTotalMb: hardware.ramTotalMb ?? null,
    gpuPct: hardware.gpuPct ?? null,
    gpuNombre: hardware.gpuNombre ?? null,
    discoLibreGb: hardware.discoLibreGb ?? null,
    discoTotalGb: hardware.discoTotalGb ?? null,
    bateriaPct: hardware.bateriaPct ?? null,
    cargando: hardware.cargando ?? null,
    medidoEn: hardware.medidoEn ?? ahora,
    fuente: "/api/mando/hardware"
  };
}

// Convierte datos de nodo de MetaGenesis a HardwareServidor (defensivo)
export function hardwareDesdeNodo(n: unknown, ahora: number): HardwareServidor | null {
  if (
    !n ||
    typeof n !== 'object' ||
    Array.isArray(n)
  ) {
    return null;
  }

  const nodo = n as {
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

  // Calcular RAM usada si tenemos total y libre
  let ramUsadaMb: number | null = null;
  if (nodo.ram_total_mb !== null && nodo.ram_libre_mb !== null) {
    ramUsadaMb = nodo.ram_total_mb - nodo.ram_libre_mb;
  }

  return {
    id: nodo.nodo ?? `nodo-${ahora}`,
    nombre: nodo.nodo ?? `nodo-${ahora}`,
    tipo: "a1",
    cpuPct: nodo.cpu_pct ?? null,
    nucleos: nodo.nucleos ?? null,
    carga: nodo.carga ?? null,
    ramUsadaMb: ramUsadaMb,
    ramTotalMb: nodo.ram_total_mb ?? null,
    gpuPct: null, // No disponible en nodos A1
    gpuNombre: null,
    discoLibreGb: null, // No disponible directamente
    discoTotalGb: nodo.disco_total_gb ?? null,
    bateriaPct: null, // No disponible en nodos A1
    cargando: null, // No disponible en nodos A1
    medidoEn: ahora,
    fuente: "MetaGenesis nodo"
  };
}

// Convierte capabilities de neurona a HardwareServidor (defensivo)
export function hardwareDesdeNeurona(n: unknown, ahora: number): HardwareServidor | null {
  if (
    !n ||
    typeof n !== 'object' ||
    Array.isArray(n)
  ) {
    return null;
  }

  const neurona = n as {
    capabilities?: {
      bateria?: {
        level?: number | null;
        charging?: boolean | null;
      };
      cuota_almacenamiento?: number | null; // En GB
    };
  };

  return {
    id: "neurona-desconocida", // No tenemos ID específico en capabilities
    nombre: "Neurona de navegador",
    tipo: "neurona",
    cpuPct: null, // No disponible en neuronas
    nucleos: null,
    carga: null,
    ramUsadaMb: null, // No disponible en neuronas
    ramTotalMb: null, // No disponible en neuronas
    gpuPct: null, // No disponible en neuronas
    gpuNombre: null,
    discoLibreGb: null, // No disponible directamente
    discoTotalGb: neurona.capabilities?.cuota_almacenamiento ?? null,
    bateriaPct: neurona.capabilities?.bateria?.level ?? null,
    cargando: neurona.capabilities?.bateria?.charging ?? null,
    medidoEn: ahora,
    fuente: "neuron_devices.capabilities"
  };
}