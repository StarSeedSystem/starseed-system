"use client";

/**
 * CLONACIÓN DE VOZ CON PERMISO (Ola 1018V · Voz de Astraura + VoiceStudio)
 * ─────────────────────────────────────────────────────────────────────────────
 * Implementa la clonación de voz con permiso registrado, marca de agua y
 * etiqueta «voz clonada» según el contrato architecture/voz-voicestudio.md.
 */

export interface PermisoVoz {
  id: string;
  titular: string; // cuenta dueña de la voz
  concedidoA: string; // cuenta a quien se concede el permiso
  para: string[]; // usos permitidos (ej: "personal", "grupo", "comunidad", "publico", "comercial")
  desde: string; // fecha ISO 8601
  hasta?: string; // fecha ISO 8601 opcional
  revocado?: boolean; // si el permiso fue revocado
}

export interface ResultadoPuedeClonar {
  ok: boolean;
  motivo: string;
}

export interface MetaAudio {
  clonada?: boolean;
  marcaAgua?: "audioseal" | "pendiente";
  autorizadoPor?: string; // quién autorizó la clonación
  // otros metadatos de audio...
}

/**
 * Determina si se puede clonar una voz basado en los permisos.
 * La voz propia siempre se puede clonar; la ajena solo con permiso vigente que cubra ese uso.
 */
export function puedeClonar({
  solicitante,
  titular,
  uso,
  permisos,
  ahora,
}: {
  solicitante: string; // cuenta que solicita clonar
  titular: string; // cuenta dueña de la voz
  uso: string; // uso previsto (ej: "personal", "grupo", etc.)
  permisos: PermisoVoz[]; // array de permisos disponibles
  ahora: string; // timestamp actual en ISO 8601
}): ResultadoPuedeClonar {
  // Si es la misma persona (voz propia), siempre se puede clonar
  if (solicitante === titular) {
    return { ok: true, motivo: "Voz propia" };
  }

  // Buscar permisos válidos para este solicitante y uso
  const permisoValido = permisos.find(
    (p) =>
      p.titular === titular && // el permiso pertenece al titular
      p.concedidoA === solicitante && // concedido al solicitante
      p.para.includes(uso) && // cubre el uso solicitado
      !p.revocado && // no revocado
      new Date(p.desde) <= new Date(ahora) && // vigente desde
      (!p.hasta || new Date(p.hasta) >= new Date(ahora)) // vigente hasta (si tiene hasta)
  );

  if (permisoValido) {
    return { ok: true, motivo: "Permiso vigente y válido" };
  }

  // Determinar el motivo específico de denegación
  const permisoExistente = permisos.find(
    (p) => p.titular === titular && p.concedidoA === solicitante
  );

  if (!permisoExistente) {
    return { ok: false, motivo: "No existe permiso para este solicitante" };
  }

  const permisoRevocado = permisos.find(
    (p) =>
      p.titular === titular &&
      p.concedidoA === solicitante &&
      p.revocado
  );

  if (permisoRevocado) {
    return { ok: false, motivo: "Permiso revocado" };
  }

  const permisoNoCubreUso = permisos.find(
    (p) =>
      p.titular === titular &&
      p.concedidoA === solicitante &&
      !p.revocado &&
      !p.para.includes(uso)
  );

  if (permisoNoCubreUso) {
    return { ok: false, motivo: `El permiso no cubre el uso: ${uso}` };
  }

  const permisoCaducado = permisos.find(
    (p) =>
      p.titular === titular &&
      p.concedidoA === solicitante &&
      !p.revocado &&
      ((new Date(p.desde) > new Date(ahora)) ||
        (p.hasta && new Date(p.hasta) < new Date(ahora)))
  );

  if (permisoCaducado) {
    return { ok: false, motivo: "Permiso caducado" };
  }

  return { ok: false, motivo: "Motivo desconocido" };
}

/**
 * Añade metadata de clonación al audio.
 * Si no hay marca de agua disponible, el audio se marca «pendiente» y 
 * NO se publica fuera de lo personal.
 */
export function etiquetarAudio(meta: MetaAudio): MetaAudio {
  return {
    ...meta,
    clonada: true,
    marcaAgua: meta.marcaAgua ?? "pendiente", // si no se especifica, es pendiente
    autorizadoPor: meta.autorizadoPor ?? "sistema", // por defecto el sistema autoriza
  };
}