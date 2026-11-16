export interface ResultadoCallback {
  ok: boolean;
  error?: string;
  errorParams?: { error: string };
}

export function manejarCallbackError(error: unknown): ResultadoCallback {
  if (!error) {
    return { ok: true };
  }
  const mensaje = error instanceof Error ? error.message : "Error de autenticación";
  return {
    ok: false,
    error: mensaje,
    errorParams: { error: "auth-callback" },
  };
}