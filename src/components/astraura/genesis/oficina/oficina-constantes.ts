/**
 * oficina-constantes.ts — Números compartidos por toda `genesis/oficina/`.
 *
 * PORTADO DE HERMES3D (MIT, © 2026 Luke The Dev, github.com/iamlukethedev/Hermes3D
 * — ver `LICENSE-hermes3d.md` en esta misma carpeta): el CONCEPTO de "salas con
 * radio derivado de cuánta gente cabe, dispuestas en una cuadrícula navegable" —
 * no sus números. Hermes3D dibuja un plano de oficina pixel a pixel con muebles
 * colocados a mano (`core/constants.ts` allí define `CANVAS_W/H`, posiciones fijas
 * de sala de servidores, gimnasio, cabina telefónica...). Nuestro contrato
 * (`SalaOficina` en genesis-types.ts) no tiene ni furniture ni coordenadas: solo
 * id/nombre/actividad. Así que aquí no hay un plano fijo que portar — hay que
 * DERIVAR uno, determinista, de cualquier lista de salas que el backend mande.
 */

/** Seres por metro de radio de sala, a efectos de dimensionar cada sala según
 * cuántos ocupantes tiene AHORA — una sala con más gente se ve más grande, no
 * porque el backend lo diga sino porque es cierto (igual que `mundo-layout.ts`
 * dimensiona una región por sus miembros reales, nunca por un tamaño inventado). */
export const RADIO_SALA_BASE = 2.6;
export const RADIO_SALA_POR_OCUPANTE = 0.62;
export const RADIO_SALA_MAXIMO = 6.5;

/** Separación entre centros de sala en la cuadrícula del plano. Mayor que
 * `RADIO_SALA_MAXIMO * 2` para que dos salas llenas nunca se toquen. */
export const ESPACIADO_SALA = 15;

/** Vestíbulo: dónde esperan los ocupantes con `salaId` nulo o que apunta a una
 * sala que ya no existe en `estado.salas` (referencia colgante — el backend
 * puede mandar datos a medio actualizar; la oficina no debe romperse por eso,
 * solo mostrar a ese ser en un sitio neutro y digno). */
export const RADIO_VESTIBULO_BASE = 2.2;
export const RADIO_VESTIBULO_POR_OCUPANTE = 0.28;
export const MARGEN_VESTIBULO = 8;

/** Radio visual de cada ocupante — mismo orden de magnitud que `RADIO_POR_DEFECTO`
 * en avatar-ser.tsx, algo menor porque aquí caben decenas a la vez en una sala. */
export const RADIO_OCUPANTE = 0.5;

/** Cuánto del radio de una sala se usa para repartir ocupantes dentro (deja
 * margen entre el ocupante más externo y la pared/contorno de la sala). */
export const FRACCION_RADIO_OCUPABLE = 0.62;

/** Velocidad de traslado hacia la posición objetivo — constante de suavizado
 * exponencial (frames por segundo "efectivos" del lerp), mismo estilo que el
 * retargeting de cámara en `mundo-escena-3d.tsx` (`Math.min(1, delta*4)`) pero
 * como tasa continua para que el paso no dependa del framerate real. */
export const VELOCIDAD_TRASLADO_OCUPANTE = 2.6;

/** Altura de la "columna de actividad" de una sala a actividad 1.0, y su radio. */
export const ALTURA_COLUMNA_ACTIVIDAD = 3.2;
export const RADIO_COLUMNA_ACTIVIDAD = 0.28;

export const COLOR_FONDO_OFICINA = "#05070d";
