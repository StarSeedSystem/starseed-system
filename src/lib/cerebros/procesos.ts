// Procesos activos del cerebro: tipos, hardware de cada servidor y avisos.
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §7.

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

export type EstadoProceso = "en-marcha" | "esperando" | "pausado" | "fallando";

export interface ProcesoActivo {
  id: string;
  tipo: TipoProceso;
  nombre: string;
  estado: EstadoProceso;
  progreso: number | null; // 0..1; null = sin medida
  donde: string;
  desde: number | null;
  detalle?: string;
  fuente: string;
}

export type TipoServidor = "mac" | "a1" | "neurona" | "nube" | "otro";

export interface HardwareServidor {
  id: string;
  nombre: string;
  tipo: TipoServidor;
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

export const ETIQUETA_TIPO: Record<TipoProceso, string> = {
  genesis: "Genesis",
  poligenesis: "PoliGenesis",
  sueno: "Sueños",
  imaginacion: "Imaginación",
  descarga: "Descargas",
  instalacion: "Instalaciones",
  actualizacion: "Actualizaciones",
  "app-fondo": "Apps en segundo plano",
  servicio: "Servicios",
};

export interface UmbralesProcesos {
  cpu: number;
  ram: number;
  disco: number;
  bateria: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesProcesos = { cpu: 85, ram: 90, disco: 90, bateria: 20 };

export interface AvisoHardware {
  servidor: string;
  medida: "cpu" | "ram" | "disco" | "bateria";
  valor: number;
  umbral: number;
}

/** Porcentaje usado/total redondeado a 1 decimal; null si falta algo o total ≤ 0. */
export function porcentaje(usado: number | null, total: number | null): number | null {
  if (usado == null || total == null || total <= 0) return null;
  return Math.round((usado / total) * 1000) / 10;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function registro(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/** Avisos por encima del umbral (batería por debajo y solo si no carga); null nunca avisa. */
export function avisosHardware(lista: HardwareServidor[], u: UmbralesProcesos): AvisoHardware[] {
  const avisos: AvisoHardware[] = [];
  for (const h of lista) {
    const ramPct = porcentaje(h.ramUsadaMb, h.ramTotalMb);
    const { discoLibreGb, discoTotalGb } = h;
    const discoUsadoGb =
      discoLibreGb != null && discoTotalGb != null ? discoTotalGb - discoLibreGb : null;
    const discoPct = porcentaje(discoUsadoGb, discoTotalGb);
    if (h.cpuPct != null && h.cpuPct >= u.cpu)
      avisos.push({ servidor: h.nombre, medida: "cpu", valor: h.cpuPct, umbral: u.cpu });
    if (ramPct != null && ramPct >= u.ram)
      avisos.push({ servidor: h.nombre, medida: "ram", valor: ramPct, umbral: u.ram });
    if (discoPct != null && discoPct >= u.disco)
      avisos.push({ servidor: h.nombre, medida: "disco", valor: discoPct, umbral: u.disco });
    if (h.bateriaPct != null && h.cargando === false && h.bateriaPct <= u.bateria)
      avisos.push({ servidor: h.nombre, medida: "bateria", valor: h.bateriaPct, umbral: u.bateria });
  }
  return avisos;
}

/** Lee la respuesta de `/api/mando/hardware` (§7.1), de forma defensiva. */
export function hardwareDesdeMac(r: unknown, ahora: number): HardwareServidor | null {
  const o = registro(r);
  if (!o) return null;
  return {
    id: texto(o.id) ?? "esta-mac",
    nombre: texto(o.nombre) ?? "Esta Mac",
    tipo: "mac",
    cpuPct: numero(o.cpuPct),
    nucleos: numero(o.nucleos),
    carga: numero(o.carga),
    ramUsadaMb: numero(o.ramUsadaMb),
    ramTotalMb: numero(o.ramTotalMb),
    gpuPct: numero(o.gpuPct),
    gpuNombre: texto(o.gpuNombre),
    discoLibreGb: numero(o.discoLibreGb),
    discoTotalGb: numero(o.discoTotalGb),
    bateriaPct: numero(o.bateriaPct),
    cargando: typeof o.cargando === "boolean" ? o.cargando : null,
    medidoEn: numero(o.medidoEn) ?? ahora,
    fuente: "mando",
  };
}

/** Lee un `NodoVista` de MetaGenesis; RAM usada = total − libre solo si hay total. */
export function hardwareDesdeNodo(n: unknown, ahora: number): HardwareServidor | null {
  const o = registro(n);
  if (!o) return null;
  const nodo = texto(o.nodo);
  if (!nodo) return null;
  const ramTotalMb = numero(o.ram_total_mb);
  const ramLibreMb = numero(o.ram_libre_mb);
  const ramUsadaMb = ramTotalMb != null && ramLibreMb != null ? ramTotalMb - ramLibreMb : null;
  return {
    id: nodo,
    nombre: nodo,
    tipo: texto(o.medio) === "movil" || texto(o.medio) === "navegador" ? "neurona" : "a1",
    cpuPct: numero(o.cpu_pct),
    nucleos: numero(o.nucleos),
    carga: numero(o.carga),
    ramUsadaMb,
    ramTotalMb,
    gpuPct: null,
    gpuNombre: null,
    discoLibreGb: numero(o.disco_gb),
    discoTotalGb: numero(o.disco_total_gb),
    bateriaPct: null,
    cargando: null,
    medidoEn: ahora,
    fuente: "metagenesis",
  };
}

/** Lee las capabilities de una neurona (`neuron_devices`); CPU y GPU no se miden aquí. */
export function hardwareDesdeNeurona(n: unknown, ahora: number): HardwareServidor | null {
  const o = registro(n);
  if (!o) return null;
  const caps = registro(o.capabilities) ?? registro(o.capacidades) ?? o;
  const bat = registro(caps.battery) ?? registro(caps.bateria);
  const quo = registro(caps.quota) ?? registro(caps.cuota);
  const id = texto(o.id) ?? texto(o.device_id) ?? texto(o.nombre) ?? "neurona";
  return {
    id,
    nombre: texto(o.nombre) ?? id,
    tipo: "neurona",
    cpuPct: null,
    nucleos: null,
    carga: null,
    ramUsadaMb: null,
    ramTotalMb: null,
    gpuPct: null,
    gpuNombre: null,
    discoLibreGb: numero(quo?.libre_gb) ?? numero(quo?.free_gb),
    discoTotalGb: numero(quo?.total_gb),
    bateriaPct: numero(bat?.level),
    cargando: typeof bat?.charging === "boolean" ? bat.charging : null,
    medidoEn: ahora,
    fuente: "neuron_devices",
  };
}
