// Decide el destino tras el callback de autenticación (puro).
export function destinoCallbackAuth(
  tieneCodigo: boolean,
  intercambioCorrecto: boolean,
  siguiente: string,
): string {
  if (tieneCodigo && intercambioCorrecto) return siguiente;
  return "/login?error=auth-callback";
}
