import { siguienteSeguro } from "./siguiente-seguro";
import { manejarCallbackError, type ResultadoCallback } from "./manejar-callback-error";

export interface ResultadoHandler {
  redirectTo: string;
}

export interface CallbackInput {
  code: string | null;
  next: string | null;
  origin: string;
  exchangeFn: (code: string) => Promise<{ error?: unknown }>;
}

export async function manejarCallback(input: CallbackInput): Promise<ResultadoHandler> {
  const { code, next, origin, exchangeFn } = input;
  const nextSeguro = siguienteSeguro(next, "/escritorios");

  if (code) {
    try {
      const { error } = await exchangeFn(code);
      const resultado: ResultadoCallback = manejarCallbackError(error as never);
      if (resultado.ok) {
        return { redirectTo: `${origin}${nextSeguro}` };
      }
      return { redirectTo: `${origin}/login?error=auth-callback` };
    } catch (e) {
      manejarCallbackError(e as never);
      return { redirectTo: `${origin}/login?error=auth-callback` };
    }
  }
  return { redirectTo: `${origin}/login?error=auth-callback` };
}