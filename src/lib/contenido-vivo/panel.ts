/**
 * Piezas puras del panel «Contenido vivo» (CVV1028, tarea H).
 * Contrato architecture/contenido-vivo.md §§1-3: niveles, selección y cotización.
 * Sin React, sin red y sin `node:*`.
 */
import { CATALOGO_RUTAS, TAREAS_VIVAS } from "./catalogo-rutas";
import { elegirRuta, servicioConectado, type ContextoVivo } from "./rutas";
import type { NivelVivo, Ruta, TareaViva } from "./tipos";

/** Un nivel del contrato, con las tareas que agrupa en el panel. */
export interface NivelPanel {
  id: NivelVivo;
  nombre: string;
  descripcion: string;
  tareas: TareaViva[];
}

/** Los tres niveles, en el orden del contrato §1. */
export const NIVELES_PANEL: readonly NivelPanel[] = [
  { id: 1, nombre: "3D vivo", descripcion: "Una pieza 3D con la que se juega y nunca atrapa el scroll.", tareas: ["escena-3d"] },
  { id: 2, nombre: "Película e imágenes", descripcion: "Un solo movimiento de cámara, fotos y bucles vivos.", tareas: ["fotograma-clave", "foto", "clip-pelicula", "foto-viva"] },
  { id: 3, nombre: "Gráficos vivos", descripcion: "Diagramas dibujados en código que se mueven en bucle.", tareas: ["grafico-vivo"] },
];

/** Ruta elegida por tarea; una tarea sin ruta disponible no aparece. */
export type SeleccionRutas = Partial<Record<TareaViva, string>>;

/** Lo que recibe `onConfirmar` cuando el usuario dice «sí». */
export interface ConfirmacionContenidoVivo {
  totalCreditos: number;
  seleccion: SeleccionRutas;
  niveles: NivelVivo[];
}

/** Tareas de los niveles activos, en el orden del panel. */
export function tareasDeNiveles(niveles: readonly NivelVivo[]): TareaViva[] {
  return NIVELES_PANEL.filter((nivel) => niveles.includes(nivel.id)).flatMap((nivel) => nivel.tareas);
}

/** Ruta que propone el selector para cada tarea, sin inventar candidatos. */
export function elegidasIniciales(contexto: ContextoVivo): SeleccionRutas {
  const seleccion: SeleccionRutas = {};
  for (const tarea of TAREAS_VIVAS) {
    const elegida = elegirRuta(tarea, contexto);
    if (elegida) seleccion[tarea] = elegida.ruta.id;
  }
  return seleccion;
}

/** Créditos que cuesta generar las tareas activas con las rutas elegidas. */
export function cotizarSeleccion(seleccion: SeleccionRutas, tareas: readonly TareaViva[]): number {
  return tareas.reduce((total, tarea) => {
    const ruta = CATALOGO_RUTAS.find((candidata) => candidata.id === seleccion[tarea]);
    return total + (ruta?.creditosPorUnidad ?? 0);
  }, 0);
}

/** Un externo que pide conector o cuenta y aún no está conectado en este ámbito. */
export function necesitaConectar(ruta: Ruta, contexto: ContextoVivo): boolean {
  const pideCuenta = ruta.requiere.includes("conector") || ruta.requiere.includes("cuenta");
  return ruta.tipo === "externo" && pideCuenta && !servicioConectado(ruta, contexto);
}
