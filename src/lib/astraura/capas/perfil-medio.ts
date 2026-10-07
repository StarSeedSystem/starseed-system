// Perfil del medio (Ola 1007C · CPA1007B): amplía `perfil-hardware.ts` con lo que
// pide el contrato `architecture/capas-autoadaptables.md` §4 (WebGPU, WASM, cuota
// de almacenamiento, plataforma instalada y 2.º plano) y da el presupuesto de
// disco/RAM por medio. Módulo PURO: el entorno se inyecta; `entornoDelNavegador()`
// lo lee del navegador con `typeof` defensivo.

import {
  medirPerfil,
  type EntornoMedicion,
  type PerfilHardware,
  type Plataforma,
} from "@/lib/astraura/perfil-hardware";

export type PlataformaMedio = Plataforma | "servidor";

export type CapaPapel =
  | "reflejo"
  | "memoria"
  | "palabra"
  | "razon"
  | "profunda"
  | "voz"
  | "adaptador";

/** Entorno inyectable: todo lo externo llega ya medido. */
export interface EntornoMedio extends EntornoMedicion {
  /** Límite de búfer de WebGPU en bytes; `null` = no hay WebGPU; `undefined` = no medido. */
  webgpuMaxBufferBytes?: number | null;
  wasmDisponible?: boolean;
  wasmSimd?: boolean;
  /** `crossOriginIsolated` del navegador (necesario para hilos WASM). */
  crossOriginIsolated?: boolean;
  cuotaBytes?: number | null;
  usoBytes?: number | null;
  persistente?: boolean;
  /** Disco libre en bytes, lo aporta el puente nativo (Tauri/móvil) o el servidor. */
  discoLibreBytes?: number | null;
  /** RAM libre en MB, la aporta el servidor o el puente nativo. */
  ramLibreMb?: number | null;
  /** Plataforma forzada («servidor» no se detecta con user-Agent). */
  plataformaForzada?: PlataformaMedio;
  /** Pestaña visible (`document.visibilityState === "visible"`); `false` = oculta. */
  visible?: boolean;
  /** Nivel de batería entre 0 y 1; `undefined`/`null` = desconocido. */
  bateriaNivel?: number | null;
  cargando?: boolean;
}

export interface PerfilMedio {
  base: PerfilHardware;
  plataforma: PlataformaMedio;
  webgpu: { disponible: boolean; maxBufferMb: number | null };
  wasm: { disponible: boolean; simd: boolean; hilos: boolean };
  almacenamiento: {
    cuotaMb: number | null;
    usoMb: number | null;
    libreMb: number | null;
    persistente: boolean;
  };
  bateria: { nivel: number | null; cargando: boolean | null; baja: boolean };
  /** RAM libre en MB, medida por el entorno (servidor o puente nativo). */
  ramLibreMb: number | null;
  saveData: boolean;
  tipoConexion: string | null;
  visible: boolean;
}

const MB = 1024 * 1024;

const aMb = (bytes: number | null | undefined): number | null =>
  typeof bytes === "number" && bytes >= 0 ? Math.floor(bytes / MB) : null;

/** Mide el medio a partir del entorno inyectado. Nunca lee globales. */
export function perfilDelMedio(e: EntornoMedio): PerfilMedio {
  const base = medirPerfil(e);
  const plataforma: PlataformaMedio = e.plataformaForzada ?? base.plataforma;
  const nivelBateria =
    typeof e.bateriaNivel === "number" && e.bateriaNivel >= 0 && e.bateriaNivel <= 1
      ? e.bateriaNivel
      : null;
  const cuotaMb = aMb(e.cuotaBytes);
  const usoMb = aMb(e.usoBytes);
  // El puente nativo/servidor aporta disco libre real y manda sobre la cuota del navegador.
  const libreMb =
    aMb(e.discoLibreBytes) ??
    (cuotaMb !== null && usoMb !== null ? Math.max(0, cuotaMb - usoMb) : cuotaMb);
  return {
    base,
    plataforma,
    webgpu: {
      disponible: typeof e.webgpuMaxBufferBytes === "number" && e.webgpuMaxBufferBytes > 0,
      maxBufferMb: aMb(e.webgpuMaxBufferBytes),
    },
    wasm: {
      disponible: e.wasmDisponible === true,
      simd: e.wasmSimd === true,
      hilos: e.crossOriginIsolated === true,
    },
    almacenamiento: { cuotaMb, usoMb, libreMb, persistente: e.persistente === true },
    bateria: {
      nivel: nivelBateria,
      cargando: typeof e.cargando === "boolean" ? e.cargando : null,
      baja: nivelBateria !== null ? nivelBateria < 0.2 : e.bateriaBaja === true,
    },
    ramLibreMb:
      typeof e.ramLibreMb === "number" && e.ramLibreMb >= 0 ? Math.floor(e.ramLibreMb) : null,
    saveData: e.saveData === true,
    tipoConexion: typeof e.effectiveType === "string" ? e.effectiveType : null,
    visible: e.visible !== false,
  };
}

export interface PresupuestoMedio {
  disco_mb: number;
  ram_mb: number | null;
  capas_guardables: CapaPapel[];
  segundo_plano: boolean;
  motivo: string;
}

export interface AjustesPresupuesto {
  /** Tope de disco en MB editable en Ajustes; manda sobre el calculado. */
  topeDiscoMb?: number;
}

const CAPAS_SERVIDOR: CapaPapel[] = [
  "reflejo",
  "memoria",
  "palabra",
  "razon",
  "profunda",
  "voz",
  "adaptador",
];

/** Tabla de §4: límites por defecto en MB (editables desde Ajustes). */
const WEB_REFLEJO_MB = 12;
const PWA_TOTAL_MB = 1024;
const NATIVO_TOPE_MB = 8 * 1024;
const NATIVO_FRACTION = 0.15;

/** ¿Está el medio en 2.º plano? §4: pestaña oculta, batería < 20 % o saveData. */
export function enSegundoPlano(p: PerfilMedio): boolean {
  if (!p.visible) return true;
  if (p.bateria.baja && p.bateria.cargando !== true) return true;
  return p.saveData;
}

/** Presupuesto de disco/RAM y capas guardables según la tabla del contrato §4. */
export function presupuestoMedio(p: PerfilMedio, ajustes?: AjustesPresupuesto): PresupuestoMedio {
  const segundoPlano = enSegundoPlano(p);
  let disco_mb: number;
  let ram_mb: number | null;
  let capas: CapaPapel[];
  let motivo: string;

  switch (p.plataforma) {
    case "servidor": {
      // Servidor (Oracle, propios): todo lo que quepa en RAM.
      // La RAM libre llega por `ramLibreMb` del entorno; sin ella, se estima con deviceMemory.
      ram_mb =
        p.ramLibreMb ?? (p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024 * 0.7) : null);
      disco_mb = p.almacenamiento.cuotaMb ?? 0;
      capas = [...CAPAS_SERVIDOR];
      motivo = "servidor: guarda todo lo que quepa en RAM (§4)";
      break;
    }
    case "tauri":
    case "android":
    case "ios": {
      // App nativa: hasta el 15 % del disco libre con tope de 8 GB.
      const libre = p.almacenamiento.libreMb ?? 0;
      disco_mb = Math.min(Math.floor(libre * NATIVO_FRACTION), NATIVO_TOPE_MB);
      ram_mb = p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024 * 0.4) : 512;
      capas = ["reflejo", "memoria", "palabra", "razon"];
      motivo = "app nativa: 15 % del disco libre (tope 8 GB); profunda en el servidor (§4)";
      break;
    }
    case "pwa": {
      // PWA instalada: reflejo completo, memoria 270M y palabra 1,7B (≤ 1 GB).
      disco_mb = p.almacenamiento.persistente
        ? Math.min(p.almacenamiento.libreMb ?? PWA_TOTAL_MB, PWA_TOTAL_MB)
        : 0;
      ram_mb = p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024 * 0.3) : null;
      capas = p.almacenamiento.persistente ? ["reflejo", "memoria", "palabra"] : ["reflejo"];
      motivo = p.almacenamiento.persistente
        ? "PWA con almacenamiento persistente: hasta 1 GB (§4)"
        : "PWA sin persist() concedido: solo reflejo en caché (§4)";
      break;
    }
    default: {
      // Web, visita: reflejo con Needle de 2 a 6 capas (≤ 12 MB en caché del navegador).
      disco_mb = WEB_REFLEJO_MB;
      // Palabra 1,7B por WebGPU solo si hay ≥ 4 GB de RAM (el consentimiento se pide aparte).
      const ramOk = (p.base.ramGb ?? 0) >= 4;
      ram_mb = p.webgpu.disponible && ramOk ? 1536 : 0;
      capas = ["reflejo"];
      motivo = "web de visita: solo reflejo ≤ 12 MB; lo demás va a pares o servidores (§4)";
      break;
    }
  }

  if (typeof ajustes?.topeDiscoMb === "number" && ajustes.topeDiscoMb >= 0) {
    disco_mb = Math.min(disco_mb, ajustes.topeDiscoMb);
  }

  if (segundoPlano) {
    // En 2.º plano solo corre el reflejo; lo demás va a otro dispositivo o servidor.
    capas = capas.includes("reflejo") ? ["reflejo"] : [];
    ram_mb = 0;
    const causa = !p.visible ? "pestaña oculta" : p.saveData ? "saveData activo" : "batería < 20 %";
    motivo = `2.º plano (${causa}): solo corre el reflejo (§4)`;
  }

  return { disco_mb, ram_mb, capas_guardables: capas, segundo_plano: segundoPlano, motivo };
}

// ---- Lectura defensiva del navegador (única parte no pura, todo envuelto en typeof) ----

interface NavParcial {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent?: string;
  gpu?: { requestAdapter?: () => Promise<unknown> };
  storage?: {
    estimate?: () => Promise<{ quota?: number; usage?: number }>;
    persisted?: () => Promise<boolean>;
  };
  connection?: { saveData?: boolean; effectiveType?: string };
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
  matchMedia?: (q: string) => { matches: boolean };
}

async function medirWebGPU(n: NavParcial): Promise<number | null> {
  try {
    if (typeof n.gpu?.requestAdapter !== "function") return null;
    const adapter = (await n.gpu.requestAdapter()) as { limits?: { maxBufferSize?: number } } | null;
    const lim = adapter?.limits?.maxBufferSize;
    return typeof lim === "number" && lim > 0 ? lim : null;
  } catch {
    return null;
  }
}

function medirWasmSimd(): boolean {
  try {
    if (typeof WebAssembly !== "object" || typeof WebAssembly.validate !== "function") return false;
    // Módulo mínimo con una instrucción SIMD v128 (i8x16.splat) para detectar soporte real.
    const moduloSimd = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0x1a, 0x0b,
    ]);
    return WebAssembly.validate(moduloSimd);
  } catch {
    return false;
  }
}

/** Lee el entorno del navegador con `typeof` defensivo; en servidor devuelve el esqueleto. */
export async function entornoDelNavegador(): Promise<EntornoMedio> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { userAgent: "", esTauri: false, esPWA: false, plataformaForzada: "servidor" };
  }
  const nav = navigator as unknown as NavParcial;
  const ventana = window as unknown as { __TAURI__?: unknown; crossOriginIsolated?: boolean };
  let cuota: number | null = null;
  let uso: number | null = null;
  let persistente = false;
  try {
    if (typeof nav.storage?.estimate === "function") {
      const est = await nav.storage.estimate();
      cuota = typeof est.quota === "number" ? est.quota : null;
      uso = typeof est.usage === "number" ? est.usage : null;
    }
    if (typeof nav.storage?.persisted === "function") persistente = await nav.storage.persisted();
  } catch {
    /* sin cuota fiable */
  }
  let bateriaNivel: number | null = null;
  let cargando: boolean | undefined;
  try {
    if (typeof nav.getBattery === "function") {
      const b = await nav.getBattery();
      bateriaNivel = b.level;
      cargando = b.charging;
    }
  } catch {
    /* sin API de batería */
  }
  const matchMediaFn = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null;
  return {
    userAgent: navigator.userAgent ?? "",
    esTauri: typeof ventana.__TAURI__ !== "undefined",
    esPWA: matchMediaFn !== null && matchMediaFn("(display-mode: standalone)").matches,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    webgpuMaxBufferBytes: await medirWebGPU(nav),
    wasmDisponible: typeof WebAssembly === "object",
    wasmSimd: medirWasmSimd(),
    crossOriginIsolated: ventana.crossOriginIsolated === true,
    cuotaBytes: cuota,
    usoBytes: uso,
    persistente,
    saveData: nav.connection?.saveData === true,
    effectiveType: nav.connection?.effectiveType,
    bateriaNivel,
    cargando,
    visible: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  };
}
