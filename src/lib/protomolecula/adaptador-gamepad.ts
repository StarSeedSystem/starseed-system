/**
 * Protomolécula · ADAPTADOR GAMEPAD (F6, contrato §4.4). Convierte cada mensaje de un mando de juego
 * en `{ fuente, bruto }`, que es lo que recibe `vinculos-control.ts#procesar`.
 *
 * El acceso del navegador se INYECTA: este módulo nunca toca `navigator` por su cuenta. La interfaz
 * llama a `pedirAccesoGamepad(navigator)` SOLO cuando la persona pulsa «Conectar mandos» (es ahí cuando
 * el navegador pide el permiso) y, si no hay Gamepad API, enseña el motivo: no se finge ningún mando.
 * Hoy no hay ningún mando real conectado ni probado: las pruebas usan entradas simuladas.
 */
import type { FuenteControl } from "./vinculos-control";

export type FuenteGamepad = Extract<FuenteControl, { tipo: "gamepad" }>;
export interface MensajeGamepad { fuente: FuenteGamepad; bruto: number }
export interface EventoMensajeGamepad { data: number | null }
/** Lo mínimo de `Gamepad` que se usa (el real del navegador encaja). */
export interface EntradaGamepad {
  index: number;
  id: string;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
  timestamp: number;
}
/** Lo mínimo de `Navigator` para Gamepad. */
export interface NavegadorGamepad {
  getGamepads?: () => Gamepad[];
}
export type ResultadoAcceso = { ok: true; acceso: NavegadorGamepad } | { ok: false; motivo: string };

export const SIN_GAMEPAD = "Este navegador no ofrece Gamepad API";
export const SIN_PERMISO = "No hay permiso para usar mandos de juego en este sitio: actívalo en los ajustes del navegador";

/** Saber si hay Gamepad API sin pedir permiso (para pintar el botón o el motivo). */
export const hayGamepad = (nav?: NavegadorGamepad | null): boolean => typeof nav?.getGamepads === "function";

/** Solo al pulsar «Conectar mandos». */
export async function pedirAccesoGamepad(nav?: NavegadorGamepad | null): Promise<ResultadoAcceso> {
  const pedir = nav?.getGamepads;
  if (typeof pedir !== "function") return { ok: false, motivo: SIN_GAMEPAD };
  try {
    // Llamada síncrona, pero la envolvemos en Promise para consistencia
    const gamepads = pedir.call(nav);
    return { ok: true, acceso: { getGamepads: () => gamepads } };
  } catch (e) {
    const nombre = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
    if (nombre === "NotAllowedError" || nombre === "SecurityError") return { ok: false, motivo: SIN_PERMISO };
    return { ok: false, motivo: `El navegador no pudo acceder a Gamepad${nombre ? ` (${nombre})` : ""}` };
  }
}

/** Estado de un mando para detectar cambios y limitar a 60 Hz. */
export interface EstadoMando {
  timestamp: number;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
}

/**
 * Convierte el estado del mando en mensajes para ejes y botones.
 * Solo se envían cambios desde el último estado y se limita a 60 Hz (~16.67 ms).
 */
export function procesarGamepad(
  juego: EntradaGamepad,
  estadoAnterior: EstadoMando | null,
  ahora: number,
  alMensaje: (m: MensajeGamepad) => void,
  indice: number,
): EstadoMando {
  // Limitar a 60 Hz: si no ha pasado suficiente tiempo, no procesar
  if (estadoAnterior !== null && ahora - estadoAnterior.timestamp < 16) {
    return estadoAnterior;
  }

  const ejeCambio = 0.01; // Umbral para considerar cambio en eje
  const botonesCambio = estadoAnterior === null 
    ? juego.buttons.map((_, i) => true) 
    : juego.buttons.map((b, i) => 
        b.pressed !== estadoAnterior.buttons[i].pressed || 
        Math.abs(b.value - estadoAnterior.buttons[i].value) > 0.01
      );
  const ejesCambio = estadoAnterior === null
    ? juego.axes.map((_, i) => true)
    : juego.axes.map((a, i) => 
        Math.abs(a - estadoAnterior.axes[i]) > ejeCambio
      );

  // Emitir cambios en ejes
  juego.axes.forEach((valor, eje) => {
    if (ejesCambio[eje]) {
      const mensaje: MensajeGamepad = {
        fuente: { tipo: "gamepad", control: "eje", numero: eje, indice },
        bruto: (valor + 1) / 2 // Normalizar de [-1,1] a [0,1] para consistencia con otros adaptadores
      };
      alMensaje(mensaje);
    }
  });

  // Emitir cambios en botones
  juego.buttons.forEach((boton, botonIndex) => {
    if (botonesCambio[botonIndex]) {
      const mensaje: MensajeGamepad = {
        fuente: { tipo: "gamepad", control: "boton", numero: botonIndex, indice },
        bruto: boton.pressed ? 1 : 0
      };
      alMensaje(mensaje);
    }
  });

  // Devolver el estado actual para la próxima comparación
  return {
    timestamp: ahora,
    axes: [...juego.axes],
    buttons: [...juego.buttons.map(b => ({ pressed: b.pressed, value: b.value }))]
  };
}

/** Nombre con el que se guarda el aparato en el vínculo (el id si el navegador no da nombre). */
export const nombreEntrada = (e: EntradaGamepad): string => (e.id && e.id.trim()) || e.index.toString();

/**
 * Escucha todas las entradas conectadas y las que se enchufen después (por polling).
 * Devuelve la función que lo desconecta todo; tras llamarla no llega nada más.
 */
export function conectarGamepad(
  acceso: NavegadorGamepad,
  alMensaje: (m: MensajeGamepad) => void,
  ahora: () => number,
  alCambiarDispositivos?: (nombres: string[]) => void,
): () => void {
  let activo = true;
  const estados = new Map<number, EstadoMando>();
  const anteriores: EntradaGamepad[] = [];

  const bucle = () => {
    if (!activo) return;
    try {
      const gamepadsRaw = acceso.getGamepads?.() ?? [];
      const gamepads: EntradaGamepad[] = gamepadsRaw
        .filter((gp): gp is Gamepad => gp !== null)
        .map((gp, indice) => ({
          index: indice,
          id: gp.id || indice.toString(),
          axes: [...gp.axes],
          buttons: gp.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
          timestamp: gp.timestamp,
        }));
      const idsActuales = new Set<string>();
      gamepads.forEach((gp, indice) => {
        if (!gp) return;
        idsActuales.add(gp.id);
        const estadoPrev = estados.get(indice);
        const nuevoEstado = procesarGamepad(gp, estadoPrev ?? null, ahora(), alMensaje, indice);
        estados.set(indice, nuevoEstado);
      });
      // Detectar desconexiones
      anteriores.forEach((gp, indice) => {
        if (gp && !idsActuales.has(gp.id)) {
          estados.delete(indice);
        }
      });
      // Actualizar la lista anterior
      anteriores.length = 0;
      anteriores.push(...gamepads);
      // Notificar cambios de dispositivos si se proporciona callback
      if (alCambiarDispositivos) {
        const nombres = gamepads.map(gp => gp.id);
        alCambiarDispositivos(nombres);
      }
    } catch (e) {
      console.error("Error en bucle de gamepad:", e);
    }
    // Solicitar próximo cuadro de animación para mantener ~60 Hz
    if (activo) {
      requestAnimationFrame(bucle);
    }
  };

  // Iniciar el bucle
  requestAnimationFrame(bucle);

  // Devolver función para detener el bucle
  return () => {
    activo = false;
  };
};