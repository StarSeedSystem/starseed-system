export interface PermisoVoz {
  id: string;
  titular: string; // cuenta dueña de la voz
  concedidoA: string; // cuenta a quien se concede el permiso
  para: string[]; // usos permitidos (ej: "personal", "grupo", "comunidad", "publico", "comercial")
  desde: Date; // fecha de inicio de validez
  hasta?: Date; // fecha de fin de validez (opcional)
  revocado: boolean; // si el permiso ha sido revocado
}

/**
 * Determina si se puede clonar una voz dada la solicitud y los permisos.
 * La voz propia siempre puede clonarse.
 * Para voz ajena, se requiere un permiso vigente que cubra el uso solicitado.
 * @param opciones - Objeto con solicitante, titular, uso, permisos y momento actual
 * @returns Objeto con ok (booleano) y motivo (string)
 */
export function puedeClonar(opciones: {
  solicitante: string;
  titular: string;
  uso: string;
  permisos: PermisoVoz[];
  ahora: Date;
}): { ok: boolean; motivo: string } {
  const { solicitante, titular, uso, permisos, ahora } = opciones;

  // La voz propia siempre puede clonarse
  if (solicitante === titular) {
    return { ok: true, motivo: "Voz propia" };
  }

  // Buscar un permiso válido para la voz ajena
  const permisoValido = permisos.find((p) => {
    return (
      p.titular === titular && // El permiso es de la voz que se quiere clonar
      p.concedidoA === solicitante && // El permiso se concede al solicitante
      p.para.includes(uso) && // El uso solicitado está permitido
      p.desde <= ahora && // El permiso ya empezó
      (!p.hasta || p.hasta >= ahora) && // El permiso no ha vencido (o no tiene fecha de fin)
      !p.revocado // El permiso no ha sido revocado
    );
  });

  if (permisoValido) {
    return { ok: true, motivo: "Permiso válido" };
  }

  return {
    ok: false,
    motivo: "Permiso inválido o inexistente para el uso solicitado",
  };
}

/**
 * Etiqueta un audio como clonado, añadiendo metadatos de clonación y marca de agua.
 * Si no hay marca de agua disponible, se marca como "pendiente" y no se publica fuera de lo personal.
 * @param meta - Metadatos originales del audio
 * @param autorizador - ID de la cuenta que autorizó la clonación (titular del permiso)
 * @returns Metadatos actualizados con clonada: true, marcaAgua y autorizador
 */
export function etiquetarAudio(meta: Record<string, unknown>, autorizador: string): Record<string, unknown> {
  // En una implementación real, aquí se verificaría la disponibilidad de una marca de agua (e.g., Audioseal).
  // Por ahora, asumimos que no está disponible y marcamos como "pendiente".
  // Según la tarea: si no hay marca de agua disponible, el audio se marca "pendiente" y no se publica fuera de lo personal.
  return {
    ...meta,
    clonada: true,
    marcaAgua: "pendiente",
    autorizador,
  };
}