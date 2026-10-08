// Perfil del medio (Ola 1007C · Astraura capas autoadaptables: Needle 3, Bonsai 1.58, BitNet)
// Funciones puras con entorno inyectable (EntornoMedio). Ref. capas-autoadaptables.md §4.

export type Medio = "web" | "pwa" | "nativo" | "servidor";
export type Plataforma = "web" | "pwa" | "tauri" | "android" | "ios";

export interface PerfilMedio {
  webgpu: { disponible: boolean; maxBufferSize?: number };
  wasm: {
    simd: boolean;
    workers: boolean;
    crossOriginIsolated: boolean;
    performanceNow?: number;
  };
  storage: {
    cuota: number | null;
    uso: number | null;
    persist: boolean;
  };
  plataforma: Plataforma;
  bateria: boolean;
  saveData: boolean;
  conexion: "rapida" | "lenta" | "sin";
  visibilidad: boolean;
  segundo_plano: boolean;
  // Campos heredados del perfil de hardware para compatibilidad
  nivel: "pleno" | "justo" | "minimo" | "remoto";
  nucleos: number;
  ramGb: number | null;
  arq: "arm64" | "x86_64" | "desconocida";
}

export interface EntornoMedio {
  // WebGPU y capacidades gráficas
  getWebGLRenderingContext?: () => unknown;
  navigator?: {
    deviceMemory?: number;
    userAgent?: string;
    platform?: string;
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
    storage?: {
      estimate?: () => {
        quota?: number;
        usage?: number;
      };
    };
    getBattery?: () => {
      level?: number;
    };
    visibilityState?: string;
    // Detección WASM/SIMD/hilos
    crossOriginIsolated?: boolean;
    // API web
    canPlayType?: (type: string) => boolean | null;
    // Detectar si estamos en PWA
    standalone?: boolean;
    // Detección de plataforma
    userAgent?: string;
    // Detectar Tauri
    __TAURI__?: boolean;
  };
}

function esTexto(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function detectarPlataforma(e: EntornoMedio): Plataforma {
  if (e.navigator?.__TAURI__) return "tauri";
  const ua = esTexto(e.navigator?.userAgent) ? e.navigator.userAgent.toLowerCase() : "";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return e.navigator?.standalone ? "pwa" : "web";
}

function detectarConexion(e: EntornoMedio): PerfilMedio["conexion"] {
  if (e.navigator?.connection?.saveData === true) return "lenta";
  const t = esTexto(e.navigator?.connection?.effectiveType)
    ? e.navigator.connection.effectiveType.toLowerCase()
    : "";
  return t === "slow-2g" || t === "2g" || t === "3g" ? "lenta" : "rapida";
}

export function medirPerfil(e: EntornoMedio): PerfilMedio {
  const plataforma = detectarPlataforma(e);
  const webgpu = {
    disponible: !!e.getWebGLRenderingContext,
    maxBufferSize: undefined as number | undefined,
  };

  const wasm = {
    simd: false,
    workers: false,
    crossOriginIsolated: e.navigator?.crossOriginIsolated ?? false,
    performanceNow: typeof performance?.now === "function" ? performance.now() : undefined,
  };

  const storage = {
    cuota: null as number | null,
    uso: null as number | null,
    persist: false,
  };

    const est = e.navigator?.storage?.estimate?.();
    if (est instanceof Promise) {
      est.then((result) => {
        if (esNumero(result.quota)) storage.cuota = result.quota;
        if (esNumero(result.usage)) storage.uso = result.usage;
      }).catch(() => {});
    } else if (esNumero(est?.quota)) {
      storage.cuota = est.quota;
      if (esNumero(est?.usage)) storage.uso = est.usage;
    }

    const persist = e.navigator?.storage?.persist?.();
    if (persist instanceof Promise) {
      persist.then((ok) => {
        storage.persist = ok;
      }).catch(() => {});
    } else if (persist) {
      storage.persist = persist;
    }

  const bateria = (() => {
    if (!e.navigator?.getBattery) return false;
    const battery = e.navigator.getBattery();
    if (battery instanceof Promise) {
      battery.then((b) => {
        storage.persist = b.level !== undefined && b.level > 0.2;
      }).catch(() => {});
      return false;
    }
    return battery.level !== undefined && battery.level > 0.2;
  })();

  const saveData = e.navigator?.connection?.saveData ?? false;
  const conexion = detectarConexion(e);
  const visibilidad = e.navigator?.visibilityState !== "hidden";

  return {
    webgpu,
    wasm,
    storage,
    plataforma,
    bateria,
    saveData,
    conexion,
    visibilidad,
    segundo_plano: false,
    nivel: "remoto",
    nucleos: 1,
    ramGb: null,
    arq: "desconocida",
  };
}

export interface PresupuestoMedio {
  disco_mb: number;
  ram_mb: number;
  capas_guardables: readonly string[];
  segundo_plano: boolean;
  motivo: string;
}

export function presupuestoMedio(
  perfil: PerfilMedio,
  ajustes?: Partial<{ reflejoCapas: number; memoriaCapas: number; palabraCapas: number; razonCapas: number; profundaCapas: number }>,
): PresupuestoMedio {
  const reflejoCapas = ajustes?.reflejoCapas ?? 0;
  const memoriaCapas = ajustes?.memoriaCapas ?? 0;
  const palabraCapas = ajustes?.palabraCapas ?? 0;
  const razonCapas = ajustes?.razonCapas ?? 0;
  const profundaCapas = ajustes?.profundaCapas ?? 0;

  const esWeb = perfil.plataforma === "web";
  const esPwa = perfil.plataforma === "pwa";
  const esNativo = perfil.plataforma === "nativo";
  const esServidor = perfil.plataforma === "servidor";

  const EXCLUIR_SEGUNDO_PLANO = () => perfil.segundo_plano || perfil.bateria === false || perfil.saveData === true || perfil.conexion === "sin";

  const RAM_MB = () => (perfil.ramGb ?? 0) * 1024;

  if (EXCLUIR_SEGUNDO_PLANO()) {
    return {
      disco_mb: 0,
      ram_mb: 0,
      capas_guardables: [],
      segundo_plano: true,
      motivo: "2.º plano o batería baja o saveData o sin conexión",
    };
  }

  const presupuesto: PresupuestoMedio = {
    disco_mb: 0,
    ram_mb: 0,
    capas_guardables: [],
    segundo_plano: false,
    motivo: "",
  };

  if (esWeb) {
    const maxReflejoWeb = perfil.webgpu.disponible ? 6 : 2;
    const reflejo = Math.min(reflejoCapas, maxReflejoWeb);
    presupuesto.disco_mb = reflejo * 2;
    presupuesto.capas_guardables = ["reflejo"];
    presupuesto.motivo = "Web, solo reflejo con hasta 6 capas Needle (≤ 12 MB)";
  } else if (esPwa) {
    presupuesto.disco_mb = 1024;
    presupuesto.capas_guardables = ["reflejo", "memoria", "palabra"];
    presupuesto.motivo = "PWA instalada, reflejo completo + memoria + palabra (≤ 1 GB)";
  } else if (esNativo) {
    const discoLibre = perfil.storage.cuota !== null ? perfil.storage.cuota - (perfil.storage.uso ?? 0) : 8 * 1024;
    const maxNativo = Math.min(discoLibre, 8 * 1024);
    presupuesto.disco_mb = maxNativo;
    presupuesto.capas_guardables = ["reflejo", "memoria", "palabra", "razon"].slice(0, Math.floor(maxNativo / 2048));
    presupuesto.motivo = "Nativo, hasta el 15 % del disco libre (tope de 8 GB)";
  } else if (esServidor) {
    presupuesto.disco_mb = 0;
    presupuesto.capas_guardables = ["reflejo", "memoria", "palabra", "razon", "profunda", "voz", "adaptador"];
    presupuesto.motivo = "Servidor, todo lo que quepa en RAM";
  }

  presupuesto.ram_mb = RAM_MB();

  return presupuesto;
}
