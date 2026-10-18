import { v4 as uuidv4 } from 'uuid';

// Tipos
export type TipoAlcance = 'capacidad' | 'app' | 'volumen';

export interface Alcance {
  tipo: TipoAlcance;
  id: string;
}

export interface Sesion {
  id: string;
  anfitrion: string;
  invitado: string;
  alcance: Alcance;
  inicio: number; // timestamp de inicio de la sesión
  vence: number; // timestamp de expiración
   revocada: boolean; // inicialmente false, puede cambiar a true con revocar
}

/**
 * Crea una nueva sesión de préstamo.
 * @param anfitrion - ID del anfitrión (quien presta el recurso)
 * @param invitado - ID del invitado (quien usa el recurso)
 * @param alcance - Tipo y ID del recurso que se presta
 * @param duracionMs - Duración de la sesión en milisegundos
 * @param ahora - Timestamp actual (inyectable para pruebas)
 * @param generadorId - Función opcional para generar el ID de la sesión (inyectable para pruebas)
 * @returns Nueva sesión con ID aleatorio, fecha de vencimiento y estado no revocado
 */
export function crearSesion(
  {
    anfitrion,
    invitado,
    alcance,
    duracionMs,
    ahora,
  }: {
    anfitrion: string;
    invitado: string;
    alcance: Alcance;
    duracionMs: number;
    ahora: number;
  },
  generadorId: () => string = () => uuidv4()
): Sesion {
  return {
    id: generadorId(),
    anfitrion,
    invitado,
    alcance,
    inicio: ahora,
    vence: ahora + duracionMs,
    revocada: false,
  };
}

/**
 * Verifica si una sesión permite realizar una acción en un momento dado.
 * @param sesion - Sesión a verificar
 * @param accion - Acción que se intenta realizar (por ahora, solo se considera el acceso al recurso)
 * @param ahora - Timestamp actual (inyectable para pruebas)
 * @returns true si la sesión es válida, no revocada y no ha expirado
 */
export function permitido(
  sesion: Sesion,
  accion: string, // Por ahora, cualquier acción está permitida si la sesión es válida
  ahora: number
): boolean {
  return !sesion.revocada && ahora < sesion.vence;
}

/**
 * Revoca una sesión, marcándola como no válida para futuras acciones.
 * @param sesion - Sesión a revocar
 * @returns Nueva sesión con el estado revocada establecido a true
 */
export function revocar(sesion: Sesion): Sesion {
  return { ...sesion, revocada: true };
}

/**
 * Genera un aviso para el anfitrión sobre las sesiones activas.
 * @param sesiones - Array de sesiones relacionadas con el anfitrión
 * @param ahora - Timestamp actual (inyectable para pruebas)
 * @returns Array de objetos que representan lo que el anfitrión debe ver en pantalla:
 *          quién está usando qué recurso y desde cuándo (tiempo transcurrido en la sesión)
 */
export function avisoAnfitrion(
  sesiones: Sesion[],
  ahora: number
): {
  invitado: string;
  recursoTipo: TipoAlcance;
  recursoId: string;
  inicio: number;
  duracionTranscurrida: number;
}[] {
  return sesiones
    .filter(sesion => !sesion.revocada && ahora < sesion.vence)
    .map(sesion => ({
      invitado: sesion.invitado,
      recursoTipo: sesion.alcance.tipo,
      recursoId: sesion.alcance.id,
      inicio: sesion.inicio,
      duracionTranscurrida: ahora - sesion.inicio,
    }));
}