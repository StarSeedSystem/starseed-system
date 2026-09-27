import { nombreLimpio } from "@/ai/astraura/mesh/radar-fusion";
import type {
  DispositivoMallaRow,
  EstadoEnlace,
} from "@/lib/network/malla-neuronas";

export interface NeuronaEnMapa {
  neuronId: string;
  nombre: string;
  pos: [number, number, number];
  color: string;
  estado: EstadoEnlace;
  etiqueta: string;
}

export function posicionesNeuronas(
  filas: DispositivoMallaRow[],
): NeuronaEnMapa[] {
  return filas
    .filter((fila) => !fila.esEsteDispositivo && fila.online)
    .map((fila) => convertirFila(fila));
}

function convertirFila(fila: DispositivoMallaRow): NeuronaEnMapa {
  const radio = radioDe(fila);
  const angulo = anguloDe(fila.neuronId);
  return {
    neuronId: fila.neuronId,
    nombre: nombreLimpio(fila.nombre),
    pos: [Math.cos(angulo) * radio, 0.6, Math.sin(angulo) * radio],
    color: COLORES[fila.enlace.estado],
    estado: fila.enlace.estado,
    etiqueta: etiquetaDe(fila),
  };
}

const COLORES: Record<EstadoEnlace, string> = {
  conectado: "#34d399",
  conectando: "#fbbf24",
  fallido: "#fb7185",
  "sin-vinculo": "#94a3b8",
};

function radioDe(fila: DispositivoMallaRow): number {
  if (fila.enlace.estado === "conectando") return 8;
  if (fila.enlace.estado === "fallido") return 9;
  if (fila.enlace.estado === "sin-vinculo") return 10;
  const latencia = Math.max(0, Math.min(fila.enlace.latenciaMs ?? 300, 300));
  const radio = 3 + (latencia / 300) * 4;
  return fila.enlace.ruta?.clase === "misma-red-local"
    ? Math.min(radio, 4)
    : radio;
}

function anguloDe(id: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < id.length; i += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16_777_619);
  }
  return ((hash >>> 0) / 0x1_0000_0000) * Math.PI * 2;
}

function etiquetaDe(fila: DispositivoMallaRow): string {
  const { estado, motivo, latenciaMs, ruta } = fila.enlace;
  if (estado === "conectando") return "conectando…";
  if (estado === "fallido") return `fallido: ${motivo?.trim() || "sin dato"}`;
  if (estado === "sin-vinculo") return "en línea, sin enlace P2P";
  const latencia = latenciaMs == null ? "sin dato" : `${Math.round(latenciaMs)} ms`;
  const trayecto = ruta == null ? "" : ` · ${ETIQUETAS_RUTA[ruta.clase]}`;
  return `conectado · ${latencia}${trayecto}`;
}

const ETIQUETAS_RUTA = {
  "misma-red-local": "misma red local",
  "internet-directo": "internet directo (NAT)",
  "reenviado-turn": "reenviado por servidor TURN",
  desconocida: "ruta desconocida",
} as const;
