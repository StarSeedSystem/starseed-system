/**
 * conectores/protocolos-universales — configuración local de protocolos universales, antenas
 * y capas de malla P2P (Reticulum/LXMF, Meshtastic, MeshCore, Wi-Fi Direct, Titanio, WebRTC, BLE).
 *
 * Módulo PURO: sin red, sin secretos, persistido por neurona (nunca se sincroniza entre dispositivos).
 */

export const PROTOCOLOS_UNIVERSALES_KEY = "starseed.malla.protocolos-universales.v1";
export const EVENTO_PROTOCOLOS_UNIVERSALES = "starseed:malla-protocolos-cambio";

export type FamiliaProtocoloUniversal =
  | "reticulum"
  | "meshtastic"
  | "meshcore"
  | "wifi-direct"
  | "titanio"
  | "webrtc"
  | "ble"
  | "red-local"
  | "personalizado";

export type RolTransmisionProtocolo =
  | "control-bajo-consumo"
  | "hibrido"
  | "datos-alta-velocidad"
  | "almacen-publico";

export interface ConfigProtocoloMalla {
  id: string;
  nombre: string;
  familia: FamiliaProtocoloUniversal;
  habilitado: boolean;
  rol: RolTransmisionProtocolo;
  prioridad: number;
  endpoint: string;
  frecuenciaMHz?: number;
  region?: string;
  canal?: string;
  mtuBytes: number;
  permiteCapaPublica: boolean;
  permiteCapaPrivada: boolean;
  formatosAdmitidos: string[];
}

export interface AjustesMallaUniversal {
  version: 1;
  modoMultiAntenaSimultanea: boolean;
  autoEnrutamientoInteligente: boolean;
  routersAutoEnrutables: boolean;
  compartirAlmacenamientoPublico: boolean;
  cuotaPublicaMb: number;
  protocolos: Record<string, ConfigProtocoloMalla>;
}

const PROTOCOLOS_BASE: ConfigProtocoloMalla[] = [
  {
    id: "red-local",
    nombre: "Red local / LAN (UDP/TCP P2P)",
    familia: "red-local",
    habilitado: true,
    rol: "datos-alta-velocidad",
    prioridad: 96,
    endpoint: "mdns://starseed.local",
    mtuBytes: 48_000,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["json", "binario", "jpeg-cuadro", "archivo-chunk", "modelo-ia"],
  },
  {
    id: "wifi-direct",
    nombre: "Wi-Fi Direct / AWDL / Aware",
    familia: "wifi-direct",
    habilitado: true,
    rol: "datos-alta-velocidad",
    prioridad: 92,
    endpoint: "p2p://auto",
    mtuBytes: 48_000,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["json", "binario", "jpeg-cuadro", "video-stream", "archivo-chunk"],
  },
  {
    id: "titanio",
    nombre: "Malla Titanio P2P",
    familia: "titanio",
    habilitado: true,
    rol: "hibrido",
    prioridad: 85,
    endpoint: "titanio://auto",
    mtuBytes: 1400,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["json", "cbor", "binario", "archivo-chunk"],
  },
  {
    id: "webrtc",
    nombre: "WebRTC P2P directo",
    familia: "webrtc",
    habilitado: true,
    rol: "datos-alta-velocidad",
    prioridad: 82,
    endpoint: "ice://auto",
    mtuBytes: 16_384,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["json", "datachannel", "video-stream", "audio-stream"],
  },
  {
    id: "reticulum",
    nombre: "Reticulum (RNS · LXMF · RNode)",
    familia: "reticulum",
    habilitado: true,
    rol: "control-bajo-consumo",
    prioridad: 78,
    endpoint: "rns://localhost:37428",
    region: "GLOBAL",
    mtuBytes: 500,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["lxmf", "cbor", "json", "binario-compacto"],
  },
  {
    id: "meshcore",
    nombre: "MeshCore (LoRa multi-salto)",
    familia: "meshcore",
    habilitado: true,
    rol: "control-bajo-consumo",
    prioridad: 72,
    endpoint: "meshcore://serial-ble",
    frecuenciaMHz: 915,
    region: "US",
    canal: "starseed-core",
    mtuBytes: 255,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["json", "binario-compacto", "baliza"],
  },
  {
    id: "meshtastic",
    nombre: "Meshtastic (LoRa · Serial/BLE/HTTP)",
    familia: "meshtastic",
    habilitado: true,
    rol: "control-bajo-consumo",
    prioridad: 70,
    endpoint: "http://127.0.0.1:4403",
    frecuenciaMHz: 915,
    region: "US",
    canal: "LongFast",
    mtuBytes: 237,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["protobuf", "json", "telemetria", "texto"],
  },
  {
    id: "ble",
    nombre: "Bluetooth Low Energy (GATT)",
    familia: "ble",
    habilitado: true,
    rol: "control-bajo-consumo",
    prioridad: 64,
    endpoint: "ble://gatt-auto",
    mtuBytes: 512,
    permiteCapaPublica: true,
    permiteCapaPrivada: true,
    formatosAdmitidos: ["json", "binario", "baliza"],
  },
];

export function configUniversalPorDefecto(): AjustesMallaUniversal {
  const protocolos: Record<string, ConfigProtocoloMalla> = {};
  for (const p of PROTOCOLOS_BASE) {
    protocolos[p.id] = { ...p, formatosAdmitidos: [...p.formatosAdmitidos] };
  }
  return {
    version: 1,
    modoMultiAntenaSimultanea: true,
    autoEnrutamientoInteligente: true,
    routersAutoEnrutables: true,
    compartirAlmacenamientoPublico: false,
    cuotaPublicaMb: 512,
    protocolos,
  };
}

function esRegistro(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

const FAMILIAS_VALIDAS = new Set<FamiliaProtocoloUniversal>([
  "reticulum",
  "meshtastic",
  "meshcore",
  "wifi-direct",
  "titanio",
  "webrtc",
  "ble",
  "red-local",
  "personalizado",
]);

const ROLES_VALIDOS = new Set<RolTransmisionProtocolo>([
  "control-bajo-consumo",
  "hibrido",
  "datos-alta-velocidad",
  "almacen-publico",
]);

function limpiarTexto(v: unknown, fallback: string, max = 120): string {
  if (typeof v !== "string") return fallback;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return t ? t.slice(0, max) : fallback;
}

export function sanearConfigUniversal(raw: unknown): AjustesMallaUniversal {
  const base = configUniversalPorDefecto();
  if (!esRegistro(raw)) return base;
  const protos: Record<string, ConfigProtocoloMalla> = { ...base.protocolos };
  if (esRegistro(raw.protocolos)) {
    for (const [clave, valor] of Object.entries(raw.protocolos)) {
      if (!esRegistro(valor)) continue;
      const id = limpiarTexto(valor.id ?? clave, "", 48).toLowerCase();
      if (!id || !/^[a-z0-9._-]+$/.test(id)) continue;
      const previo = protos[id];
      const familia: FamiliaProtocoloUniversal =
        typeof valor.familia === "string" && FAMILIAS_VALIDAS.has(valor.familia as FamiliaProtocoloUniversal)
          ? (valor.familia as FamiliaProtocoloUniversal)
          : (previo?.familia ?? "personalizado");
      const rol: RolTransmisionProtocolo =
        typeof valor.rol === "string" && ROLES_VALIDOS.has(valor.rol as RolTransmisionProtocolo)
          ? (valor.rol as RolTransmisionProtocolo)
          : (previo?.rol ?? "hibrido");
      const prioridad =
        typeof valor.prioridad === "number" && Number.isFinite(valor.prioridad)
          ? Math.max(1, Math.min(100, Math.round(valor.prioridad)))
          : (previo?.prioridad ?? 50);
      const mtuBytes =
        typeof valor.mtuBytes === "number" && Number.isFinite(valor.mtuBytes)
          ? Math.max(64, Math.min(1_048_576, Math.round(valor.mtuBytes)))
          : (previo?.mtuBytes ?? 1200);
      const formatos = Array.isArray(valor.formatosAdmitidos)
        ? valor.formatosAdmitidos
            .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
            .map((f) => f.trim().slice(0, 32))
            .slice(0, 16)
        : (previo?.formatosAdmitidos ?? ["json", "binario"]);
      const frec =
        typeof valor.frecuenciaMHz === "number" && Number.isFinite(valor.frecuenciaMHz) && valor.frecuenciaMHz > 0
          ? Math.round(valor.frecuenciaMHz * 100) / 100
          : previo?.frecuenciaMHz;
      protos[id] = {
        id,
        nombre: limpiarTexto(valor.nombre, previo?.nombre ?? id, 80),
        familia,
        habilitado: typeof valor.habilitado === "boolean" ? valor.habilitado : (previo?.habilitado ?? true),
        rol,
        prioridad,
        endpoint: limpiarTexto(valor.endpoint, previo?.endpoint ?? "", 160),
        ...(frec !== undefined ? { frecuenciaMHz: frec } : {}),
        ...(valor.region !== undefined ? { region: limpiarTexto(valor.region, "", 24) } : previo?.region ? { region: previo.region } : {}),
        ...(valor.canal !== undefined ? { canal: limpiarTexto(valor.canal, "", 48) } : previo?.canal ? { canal: previo.canal } : {}),
        mtuBytes,
        permiteCapaPublica:
          typeof valor.permiteCapaPublica === "boolean" ? valor.permiteCapaPublica : (previo?.permiteCapaPublica ?? true),
        permiteCapaPrivada:
          typeof valor.permiteCapaPrivada === "boolean" ? valor.permiteCapaPrivada : (previo?.permiteCapaPrivada ?? true),
        formatosAdmitidos: formatos.length ? formatos : ["binario"],
      };
    }
  }
  const cuota =
    typeof raw.cuotaPublicaMb === "number" && Number.isFinite(raw.cuotaPublicaMb)
      ? Math.max(64, Math.min(102_400, Math.round(raw.cuotaPublicaMb)))
      : base.cuotaPublicaMb;
  return {
    version: 1,
    modoMultiAntenaSimultanea:
      typeof raw.modoMultiAntenaSimultanea === "boolean"
        ? raw.modoMultiAntenaSimultanea
        : base.modoMultiAntenaSimultanea,
    autoEnrutamientoInteligente:
      typeof raw.autoEnrutamientoInteligente === "boolean"
        ? raw.autoEnrutamientoInteligente
        : base.autoEnrutamientoInteligente,
    routersAutoEnrutables:
      typeof raw.routersAutoEnrutables === "boolean"
        ? raw.routersAutoEnrutables
        : base.routersAutoEnrutables,
    compartirAlmacenamientoPublico:
      typeof raw.compartirAlmacenamientoPublico === "boolean"
        ? raw.compartirAlmacenamientoPublico
        : base.compartirAlmacenamientoPublico,
    cuotaPublicaMb: cuota,
    protocolos: protos,
  };
}

export function leerConfigUniversal(): AjustesMallaUniversal {
  if (typeof window === "undefined") return configUniversalPorDefecto();
  try {
    const raw = window.localStorage.getItem(PROTOCOLOS_UNIVERSALES_KEY);
    return raw ? sanearConfigUniversal(JSON.parse(raw)) : configUniversalPorDefecto();
  } catch {
    return configUniversalPorDefecto();
  }
}

export function guardarConfigUniversal(cfg: AjustesMallaUniversal): AjustesMallaUniversal {
  const saneada = sanearConfigUniversal(cfg);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PROTOCOLOS_UNIVERSALES_KEY, JSON.stringify(saneada));
      window.dispatchEvent(new CustomEvent(EVENTO_PROTOCOLOS_UNIVERSALES, { detail: saneada }));
    } catch {
      /* almacenamiento lleno */
    }
  }
  return saneada;
}

export type ObjetivoEnrutamiento = "senal-control" | "contenido-pesado" | "flujo-vivo" | "difusion-publica";

/** Ordena los protocolos habilitados para una tarea y capa concretas. */
export function ordenarProtocolosPorTarea(
  cfg: AjustesMallaUniversal,
  objetivo: ObjetivoEnrutamiento,
  capa: "publica" | "privada" | "comunidad",
): ConfigProtocoloMalla[] {
  const lista = Object.values(cfg.protocolos).filter((p) => {
    if (!p.habilitado) return false;
    if (capa === "privada") return p.permiteCapaPrivada;
    return p.permiteCapaPublica;
  });
  const pesoRol = (r: RolTransmisionProtocolo): number => {
    if (objetivo === "senal-control") return r === "control-bajo-consumo" ? 40 : r === "hibrido" ? 20 : 0;
    if (objetivo === "flujo-vivo" || objetivo === "contenido-pesado") {
      return r === "datos-alta-velocidad" ? 40 : r === "hibrido" ? 25 : 0;
    }
    return r === "almacen-publico" ? 35 : r === "hibrido" ? 25 : 15;
  };
  return lista.sort((a, b) => b.prioridad + pesoRol(b.rol) - (a.prioridad + pesoRol(a.rol)));
}
