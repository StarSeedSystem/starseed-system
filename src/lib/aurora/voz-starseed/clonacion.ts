/**
 * Tipos y funciones para la clonación de voz con permiso.
 * Este módulo es puro y no depende de efectos externos.
 */

export type PermisoVoz = {
  /** Identificador único del permiso */
  id: string;
  /** Cuenta que posee la voz original */
  titular: string;
  /** Cuenta a la que se concede el permiso */
  concedidoA: string;
  /** Usos permitidos (personal, grupo, comunidad, público, comercial) */
  para: string[];
  /** Timestamp de inicio del permiso (en ms) */
  desde: number;
  /** Timestamp de fin del permiso (opcional, indefinido si no se especifica) */
  hasta?: number;
  /** Indica si el permiso ha sido revocado */
  revocado?: boolean;
};

/** Tipo de uso de la voz */
export type UsoVoz = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

/**
 * Determina si se puede clonar una voz según los permisos y el contexto.
 * @param solicitante - Quien solicita clonar la voz
 * @param titular - Dueño de la voz original
 * @param uso - Uso previsto para la voz clonada
 * @param permisos - Lista de permisos disponibles
 * @param ahora - Timestamp actual (en ms)
 * @returns { ok: true } si se permite, o { ok: false, motivo: string } si no se permite
 */
export function puedeClonar({
  solicitante,
  titular,
  uso,
  permisos,
  ahora,
}: {
  solicitante: string;
  titular: string;
  uso: UsoVoz;
  permisos: PermisoVoz[];
  ahora: number;
}): { ok: true } | { ok: false; motivo: string } {
  // La voz propia siempre puede ser clonada
  if (solicitante === titular) {
    return { ok: true };
  }

  // Busca un permiso válido que cubra el uso solicitado
  const permisoValido = permisos.find(
    (p) =>
      !p.revocado && // No revocado
      p.desde <= ahora && // Ya commenced
      (p.hasta === undefined || ahora <= p.hasta) && // No expirado
      p.para.includes(uso) // Cubre el uso
  );

  if (permisoValido) {
    return { ok: true };
  }

  return {
    ok: false,
    motivo: `No hay permiso válido para el uso "${uso}" de la voz de ${titular}.`,
  };
}

/**
 * Etiqueta un audio como clonado añadiendo metadatos de clonación y marca de agua.
 * @param metadatos - Metadatos originales del audio
 * @returns Metadatos con los campos de clonación añadidos
 * 
 * Nota: Esta implementación asume que la marca de agua no está disponible,
 * por lo que se marca como "pendiente". En una implementación real,
 * se debería verificar la disponibilidad de la marca de agua y establecer
 * "audioseal" cuando esté disponible.
 * 
 * Además, el campo "autorizadoPor" se omite porque requiere información
 * sobre quién concedió el permiso, la cual no está disponible en esta
 * función pura. En el contexto de uso, esta información debería provenir
 * del permiso que autorizó la clonación.
 */
export function etiquetarAudio(metadatos: Record<string, unknown>): Record<string, unknown> {
  return {
    ...metadatos,
    clonada: true,
    marcaAgua: "pendiente",
    // En una implementación completa, se añadiría autorizadoPor basado en el permiso
  };
}