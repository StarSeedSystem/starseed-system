/** VEN1115L · tipos de la ventana de control (costura 3 del trabajo «control entre neuronas, fases 2–3»). */

import type { ReactNode } from "react";
import type { FuentePedida } from "@/lib/control-remoto/fuente-pantalla";
import type { MetricasCalidad } from "@/lib/control-remoto/calidad";

export { type FuentePedida };

export type EntradaControl =
    | { tipo: "gesto"; dedos: { id: number; puntos: [number, number, number][] }[]; sigue: boolean }
    | { tipo: "tecla"; cual: string }
    | { tipo: "volumen"; flujo: "multimedia" | "llamada" | "timbre" | "alarma"; nivel: number }
    | { tipo: "brillo"; nivel: number }
    | { tipo: "texto"; texto: string };

export interface PropsVentanaControl {
    nombre: string;
    modo: "flotante" | "pagina";
    estado: "conectando" | "en-vivo" | "pausa-local" | "sin-pantalla" | "cerrada";
    motivo?: string;
    flujo: MediaStream | null;
    /** CTL1118M: la pantalla por la malla se enseña en este lienzo (sin vídeo). */
    lienzo?: HTMLCanvasElement | null;
    pantalla: { ancho: number; alto: number; giro: 0 | 90 | 180 | 270 } | null;
    nivel: "ver" | "controlar";
    capacidades: { gestos: boolean; maxDedos: number; teclas: string[]; volumen: boolean; brillo: boolean; texto: boolean };
    aparato: { volumen?: Record<string, number>; brillo?: number; bateria?: number; cargando?: boolean; red?: { wifi: boolean; datos: boolean; bluetooth: boolean } } | null;
    latenciaMs?: number;
    fps?: number;
    /** CTL1119B: métricas de calidad calculadas (fps, rtt, kbps, resolución, codec, calidad, pérdidas, medio). */
    calidad?: MetricasCalidad;
    /** CTL1117A · S3: hora máxima de la sesión (ms epoch); la ventana avisa con cuenta atrás los últimos 5 min. */
    caduca?: number;
    /** CTL1117A · S3: un clic para renovar/reabrir la sesión. */
    alReabrir?: () => void;
    alEnviar: (e: EntradaControl) => void;
    alCerrar: () => void;
    fuentePedida?: FuentePedida;
    /** CTL1118M: por dónde van de verdad los cuadros. */
  via?: "webrtc" | "malla";
  enlaceVia?: string | null;
  fuenteReal?: "accesibilidad" | "proyeccion" | null;
    avisoFuente?: string | null | undefined;
    alCambiarFuente?: (f: FuentePedida) => void;
    /** CTL1118F · la persona pide la pantalla fluida con la sesión en marcha (no reabre nada; la acepta la persona EN el aparato). */
    alPedirFluida?: () => void;
    /** CTL1117B · el indicador y el selector del medio de transmisión (lo monta quien conoce la sesión). */
    ranuraMedio?: ReactNode;
    /** CTL1117I · color público de la neurona controlada (junto a su nombre). */
    color?: string;
    /** CTL1117I · MI color público: el de la onda de mis clics y el de «Tus toques». */
    miColor?: string;
    /** Participantes y selecciones compartidas con color único por usuario en esta sesión. */
    participantesSeleccion?: { id: string; nombre: string; colorPreferido?: string }[];
    seleccionesActivas?: {
        usuarioId: string;
        nombre: string;
        textoSeleccionado?: string;
        rango?: { x: number; y: number; w: number; h: number };
        colorPreferido?: string;
    }[];
}

export type Giro = 0 | 90 | 180 | 270;
