import { NextResponse } from "next/server";

export function manejarCatchCallback(
  error: unknown,
  origin: string,
  next: string
): NextResponse {
  const mensaje =
    error instanceof Error ? error.message : "Error en el proceso de autenticación";
  return NextResponse.redirect(
    `${origin}/login?error=callback-error&msg=${encodeURIComponent(mensaje)}`
  );
}