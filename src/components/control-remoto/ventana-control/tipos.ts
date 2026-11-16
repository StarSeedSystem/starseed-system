/** VEN1115L · tipos de la ventana de control (costura 3 del trabajo «control entre neuronas, fases 2–3»). */

import type { FuentePedida } from "@/lib/control-remoto/fuente-pantalla";

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
    pantalla: { ancho: number; alto: number; giro: 0 | 90 | 180 | 270 } | null;
    nivel: "ver" | "controlar";
    capacidades: { gestos: boolean; maxDedos: number; teclas: string[]; volumen: boolean; brillo: boolean; texto: boolean };
    aparato: { volumen?: Record<string, number>; brillo?: number; bateria?: number; cargando?: boolean; red?: { wifi: boolean; datos: boolean; bluetooth: boolean } } | null;
    latenciaMs?: number;
    fps?: number;
    alEnviar: (e: EntradaControl) => void;
    alCerrar: () => void;
    fuentePedida?: FuentePedida;
    fuenteReal?: "accesibilidad" | "proyeccion" | null;
    avisoFuente?: string | null;
    alCambiarFuente?: (f: FuentePedida) => void;
}

export type Giro = 0 | 90 | 180 | 270;
