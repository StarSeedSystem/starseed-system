/**
 * categorizacion-antenas — Clasificación pura multiantena y multicapa de señales P2P (2026-11-27).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Categoriza y ordena las señales detectadas por capa de acceso (mis aparatos, nodos privados,
 * nodos públicos/comunitarios y antenas independientes del entorno) y extrae el desglose de
 * antenas independientes y capacidades de malla de cada señal.
 *
 * Puro: sin DOM, sin red, sin `node:*`. Nunca lanza.
 */

import type { DetectedSignal } from "@/ai/astraura/mesh/signals";

export type CategoriaSenal = "mis-aparatos" | "nodos-privados" | "nodos-publicos" | "antenas-entorno";

export type CapaMalla = "privada" | "cuenta" | "comunidad" | "publica";

export type TipoAntenaIndependiente =
  | "wifi-lan"
  | "wifi-direct"
  | "ble"
  | "lora"
  | "webrtc-p2p"
  | "rele-ip"
  | "usb-serie"
  | "reticulum-meshcore";

export interface AntenaIndependiente {
  tipo: TipoAntenaIndependiente;
  etiqueta: string;
  estado: "activa" | "disponible" | "en-espera" | "no-disponible";
  capa: CapaMalla;
  acceso: "privado" | "publico";
  capacidades: string[];
}

export const ORDEN_CATEGORIAS: readonly CategoriaSenal[] = [
  "mis-aparatos",
  "nodos-privados",
  "nodos-publicos",
  "antenas-entorno",
];

export const META_CATEGORIA: Record<CategoriaSenal, { etiqueta: string; descripcion: string }> = {
  "mis-aparatos": {
    etiqueta: "Mis aparatos y neuronas",
    descripcion: "Tus neuronas (apellido), cada aparato con su ID único, color, estado de sincronización y sus antenas.",
  },
  "nodos-privados": {
    etiqueta: "Nodos y vínculos privados",
    descripcion: "Malla directa en red local, enlaces directos cifrados y nodos de confianza privados.",
  },
  "nodos-publicos": {
    etiqueta: "Neuronas y nodos públicos",
    descripcion: "Red comunitaria StarSeed: nodos públicos que ofrecen relevo, internet compartido o servicios.",
  },
  "antenas-entorno": {
    etiqueta: "Antenas y espectro del entorno",
    descripcion: "Señales de radios independientes (Wi-Fi, Bluetooth LE, LoRa, USB/Serie, Reticulum/MeshCore).",
  },
};

/** Clasifica una señal detectada en su categoría principal. Pura. */
export function clasificarCategoriaSenal(s: DetectedSignal): CategoriaSenal {
  if (s.id.startsWith("aparato:") || s.starseed?.ownAccount) {
    if (s.id.startsWith("lan:") || s.id.startsWith("local:") || s.id.startsWith("ble-dir:") || s.id.startsWith("wifi-dir:")) {
      return "nodos-privados";
    }
    return "mis-aparatos";
  }
  if (s.id.startsWith("lan:") || s.id.startsWith("local:") || s.starseed?.via === "direct-link") {
    return "nodos-privados";
  }
  if (s.starseed?.publico || s.starseed?.offersPublic || s.antenna === "relay") {
    return "nodos-publicos";
  }
  if (s.antenna === "lora" && s.compatible) {
    return "nodos-publicos";
  }
  return "antenas-entorno";
}

/** Extrae la lista ordenada de antenas independientes y capas mesh declaradas en una señal. Pura. */
export function extraerAntenasIndependientes(s: DetectedSignal): AntenaIndependiente[] {
  const out: AntenaIndependiente[] = [];
  const caps = (s.starseed?.capabilities ?? []).map((c) => c.toLowerCase());
  const metricas = s.metrics.map((m) => `${m.label} ${m.value}`.toLowerCase());
  const acceso: "privado" | "publico" = s.starseed?.publico || s.starseed?.offersPublic ? "publico" : "privado";
  const capa: CapaMalla = s.starseed?.ownAccount
    ? "cuenta"
    : s.starseed?.offersPublic || s.starseed?.publico
      ? "publica"
      : s.antenna === "lora"
        ? "comunidad"
        : "privada";

  const add = (a: AntenaIndependiente) => {
    if (!out.some((x) => x.tipo === a.tipo)) out.push(a);
  };

  if (s.antenna === "ip" || s.id.startsWith("lan:") || metricas.some((m) => m.includes("wi-fi") || m.includes("ethernet") || m.includes("lan") || m.includes("dirección"))) {
    add({
      tipo: "wifi-lan",
      etiqueta: "Wi-Fi / LAN IP",
      estado: s.quality === 0 ? "no-disponible" : "activa",
      capa,
      acceso,
      capacidades: s.starseed?.offersPublic ? ["salida internet", "relevo IP"] : ["malla local", "tráfico IP"],
    });
  }

  if (s.id.startsWith("wifi-dir:") || caps.some((c) => c.includes("wi-fi directo") || c.includes("wifi-direct")) || metricas.some((m) => m.includes("wi-fi direct"))) {
    add({
      tipo: "wifi-direct",
      etiqueta: "Wi-Fi Directo P2P",
      estado: "activa",
      capa: "privada",
      acceso: "privado",
      capacidades: ["enlace directo", "alta velocidad sin router"],
    });
  }

  if (s.antenna === "ble" || s.id.startsWith("ble-dir:") || caps.some((c) => c.includes("bluetooth") || c.includes("ble")) || metricas.some((m) => m.includes("rssi"))) {
    add({
      tipo: "ble",
      etiqueta: "Bluetooth LE",
      estado: s.quality != null && s.quality > 0 ? "activa" : "disponible",
      capa,
      acceso: s.starseed ? acceso : "privado",
      capacidades: ["proximidad", "descubrimiento sin internet"],
    });
  }

  if (s.antenna === "lora" || caps.some((c) => c.includes("lora") || c.includes("malla")) || (s.starseed?.onlineCount ?? 0) > 0) {
    add({
      tipo: "lora",
      etiqueta: "Radio LoRa (Meshtastic)",
      estado: s.antenna === "lora" ? "activa" : "disponible",
      capa: s.starseed?.ownAccount ? "cuenta" : "comunidad",
      acceso: "publico",
      capacidades: ["largo alcance sin operadores", "saltos mesh"],
    });
  }

  if (caps.some((c) => c.includes("webrtc") || c.includes("p2p") || c.includes("sincronización")) || metricas.some((m) => m.includes("ruta") || m.includes("webrtc"))) {
    add({
      tipo: "webrtc-p2p",
      etiqueta: "Canal WebRTC P2P",
      estado: s.starseed?.online ? "activa" : "en-espera",
      capa: s.starseed?.ownAccount ? "cuenta" : capa,
      acceso,
      capacidades: ["control remoto", "sync de archivos", "mensajería directa"],
    });
  }

  if (s.antenna === "relay" || caps.some((c) => c.includes("relé") || c.includes("relevo") || c.includes("internet público"))) {
    add({
      tipo: "rele-ip",
      etiqueta: "Relé StarSeed / Internet compartido",
      estado: s.starseed?.online ? "activa" : "disponible",
      capa: s.starseed?.offersPublic || s.starseed?.publico ? "publica" : "cuenta",
      acceso: s.starseed?.offersPublic || s.starseed?.publico ? "publico" : "privado",
      capacidades: [
        "puente entre subredes",
        ...(s.starseed?.offersPublic ? ["comparte salida a internet"] : []),
      ],
    });
  }

  if (s.antenna === "serial") {
    add({
      tipo: "usb-serie",
      etiqueta: "Radio USB / Serie",
      estado: "disponible",
      capa: "privada",
      acceso: "privado",
      capacidades: ["puerto físico", "pasarela radio"],
    });
  }

  if (caps.some((c) => c.includes("reticulum") || c.includes("meshcore"))) {
    add({
      tipo: "reticulum-meshcore",
      etiqueta: "Reticulum / MeshCore",
      estado: "disponible",
      capa: "comunidad",
      acceso: "publico",
      capacidades: ["enrutamiento criptográfico", "interoperabilidad universal"],
    });
  }

  if (out.length === 0) {
    add({
      tipo: s.antenna === "account" ? "webrtc-p2p" : "rele-ip",
      etiqueta: s.antennaLabel.split(" (")[0] || s.antennaLabel,
      estado: s.starseed?.online ? "activa" : "en-espera",
      capa,
      acceso,
      capacidades: s.starseed?.capabilities.slice(0, 3) ?? ["señal detectada"],
    });
  }

  return out;
}

export interface GrupoSenalesCategorizado {
  categoria: CategoriaSenal;
  etiqueta: string;
  descripcion: string;
  items: DetectedSignal[];
}

/** Agrupa y ordena una lista de señales por categoría multicapa. Pura. */
export function agruparYOrdenarSenales(senales: readonly DetectedSignal[]): GrupoSenalesCategorizado[] {
  const buckets = new Map<CategoriaSenal, DetectedSignal[]>();
  for (const c of ORDEN_CATEGORIAS) buckets.set(c, []);
  for (const s of senales) {
    const cat = clasificarCategoriaSenal(s);
    buckets.get(cat)!.push(s);
  }
  return ORDEN_CATEGORIAS.map((categoria) => {
    const meta = META_CATEGORIA[categoria];
    const items = [...(buckets.get(categoria) ?? [])].sort((a, b) => {
      const qa = a.quality == null ? -1 : a.quality;
      const qb = b.quality == null ? -1 : b.quality;
      if (qb !== qa) return qb - qa;
      return a.label.localeCompare(b.label, "es");
    });
    return {
      categoria,
      etiqueta: meta.etiqueta,
      descripcion: meta.descripcion,
      items,
    };
  }).filter((g) => g.items.length > 0);
}
