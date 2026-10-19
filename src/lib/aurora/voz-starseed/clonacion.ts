export type PermisoVoz = {
  id: string;
  titular: string;
  concedidoA: string;
  para: string[];
  desde: number;
  hasta?: number;
  revocado?: boolean;
};

export type UsoVoz = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

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
  if (solicitante === titular) {
    return { ok: true };
  }

  const permisoValido = permisos.find(
    (p) =>
      !p.revocado &&
      p.desde <= ahora &&
      (p.hasta === undefined || ahora <= p.hasta) &&
      p.para.includes(uso)
  );

  if (permisoValido) {
    return { ok: true };
  }

  return {
    ok: false,
    motivo: `No hay permiso válido para el uso "${uso}" de la voz de ${titular}.`,
  };
}

export function etiquetarAudio(meta: Record<string, unknown>): Record<string, unknown> {
  return {
    ...meta,
    clonada: true,
    marcaAgua: "pendiente",
    // We don't have the autorizadoPor in the meta, so we leave it out for now.
    // In a real implementation, we would need to pass the permission or the autorizador.
  };
}