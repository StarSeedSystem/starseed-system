import { siguienteSeguro } from "./siguiente-seguro";

export type ResultadoCallbackOAuth =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

type ExchangeCodeForSession = (code: string) => Promise<{ error: { message: string } | null }>;

const RUTA_POR_DEFECTO = "/escritorios";

function traducirErrorExchange(mensaje: string | null | undefined): string {
  const s = (mensaje || "").toLowerCase();
  if (s.includes("invalid") && s.includes("code")) return "Código de autenticación inválido o expirado.";
  if (s.includes("expired")) return "Código de autenticación inválido o expirado.";
  if (s.includes("already")) return "La sesión ya existe. Recarga la página.";
  return mensaje || "No se pudo completar la autenticación. Intenta de nuevo.";
}

export async function procesarCallbackOAuth(
  code: string,
  next: string,
  exchangeCodeForSession: ExchangeCodeForSession,
): Promise<ResultadoCallbackOAuth> {
  const rutaSegura = siguienteSeguro(next, RUTA_POR_DEFECTO);
  try {
    const { error } = await exchangeCodeForSession(code);
    if (!error) return { ok: true, redirectTo: rutaSegura };
    return { ok: false, error: traducirErrorExchange(error.message) };
  } catch {
    return { ok: false, error: "Error de red." };
  }
}