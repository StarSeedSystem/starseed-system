// Perfil de hardware del dispositivo (Ola HW-1 · Astraura 1.58), funciones
// puras: el entorno se inyecta. Nivel local y dónde razona cada capa.

export type NivelHardware = "pleno" | "justo" | "minimo" | "remoto";
export type Arquitectura = "arm64" | "x86_64" | "desconocida";
export type Plataforma = "web" | "pwa" | "tauri" | "android" | "ios";
export type Conexion = "rapida" | "lenta" | "sin";

export interface PerfilHardware {
  nivel: NivelHardware;
  nucleos: number;
  ramGb: number | null;
  arq: Arquitectura;
  plataforma: Plataforma;
  bateria: boolean;
  conexion: Conexion;
}

export interface EntornoMedicion {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent: string;
  esTauri: boolean;
  esPWA: boolean;
  saveData?: boolean;
  effectiveType?: string;
  bateriaBaja?: boolean;
}

const NATIVAS: ReadonlySet<Plataforma> = new Set(["tauri", "android", "ios"]);

function detectarPlataforma(e: EntornoMedicion): Plataforma {
  if (e.esTauri) return "tauri";
  const ua = e.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return e.esPWA ? "pwa" : "web";
}

function detectarArq(ua: string): Arquitectura {
  const s = ua.toLowerCase();
  if (/arm|aarch64|apple/.test(s)) return "arm64";
  if (/x86_64|x64|amd64|intel/.test(s)) return "x86_64";
  return "desconocida";
}

function detectarConexion(e: EntornoMedicion): Conexion {
  if (e.saveData === true) return "lenta";
  const t = (e.effectiveType ?? "").toLowerCase();
  return t === "slow-2g" || t === "2g" || t === "3g" ? "lenta" : "rapida";
}

function nivelBase(ram: number | null, nucleos: number): NivelHardware | null {
  if (ram === null) return null;
  if (ram >= 12 && nucleos >= 4) return "pleno";
  if (ram >= 6 && nucleos >= 2) return "justo";
  return ram >= 3 ? "minimo" : "remoto";
}

export function medirPerfil(e: EntornoMedicion): PerfilHardware {
  const nucleos = Math.max(1, Math.floor(e.hardwareConcurrency ?? 1));
  const plataforma = detectarPlataforma(e);
  const ram = typeof e.deviceMemory === "number" && e.deviceMemory > 0 ? e.deviceMemory : null;
  let nivel = nivelBase(ram, nucleos);
  if (nivel === null) {
    // Sin RAM fiable (Safari/Firefox): decidir por núcleos.
    nivel = nucleos >= 8 ? "justo" : nucleos >= 4 ? "minimo" : "remoto";
  }
  // Un navegador puro (web/pwa sin Tauri) no puede lanzar llama-server.
  if (!NATIVAS.has(plataforma)) nivel = "remoto";
  if (e.bateriaBaja === true && nivel !== "remoto") {
    nivel = nivel === "pleno" ? "justo" : nivel === "justo" ? "minimo" : "remoto";
  }
  return {
    nivel,
    nucleos,
    ramGb: ram,
    arq: detectarArq(e.userAgent),
    plataforma,
    bateria: e.bateriaBaja === true,
    conexion: detectarConexion(e),
  };
}

export interface DondeRazona {
  needle: "local" | "backend";
  jev: "red";
  bitnet: "local" | "vecino" | "nube" | "ninguno";
}

/** Dónde razona cada capa de la Trinidad según el perfil medido. */
export function dondeRazona(p: PerfilHardware): DondeRazona {
  const needle = NATIVAS.has(p.plataforma) ? "local" : "backend";
  let bitnet: DondeRazona["bitnet"];
  if ((p.nivel === "pleno" || p.nivel === "justo") && NATIVAS.has(p.plataforma)) {
    bitnet = "local";
  } else if (p.nivel === "minimo") {
    bitnet = "vecino";
  } else {
    bitnet = "nube";
  }
  if (p.conexion === "sin" && bitnet !== "local") bitnet = "ninguno";
  return { needle, jev: "red", bitnet };
}

export interface AjustesBitnet {
  hilos: number;
  ctx: number;
  paralelo: number;
}

/** Misma tabla que el backend de Astraura (hilos/contexto/slots por RAM). */
export function ajustesBitnet(p: PerfilHardware): AjustesBitnet {
  const ram = p.ramGb;
  if (ram !== null && ram <= 8.5) return { hilos: 2, ctx: 2048, paralelo: 1 };
  if (ram === null || ram <= 16.5) {
    return { hilos: Math.min(4, Math.max(1, Math.floor(p.nucleos / 2))), ctx: 4096, paralelo: 2 };
  }
  return { hilos: Math.min(6, p.nucleos), ctx: 4096, paralelo: 3 };
}
