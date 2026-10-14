import { reenviarTurno, validarEndpoint } from "@/lib/astraura-bots/adaptadores/invitado-servidor";
import { cookies } from "next/headers";

/**
 * Configuración de ruta de Next.js
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Maneja peticiones POST para proxy de bots invitados AG-UI
 * - Requiere sesión obligatoria (verificada mediante cookies de Supabase)
 * - Solo acepta POST
 * - Valida el endpoint antes de reenviar
 * - Proxyea la solicitud al endpoint AG-UI y devuelve el flujo de eventos
 */
export async function POST(request: Request) {
  // Verificar sesión obligatoria mediante cookies de Supabase
  const cookieStore = cookies();
  const supabaseCookie = cookieStore.get("sb:token") || cookieStore.get("sb:session-token");
  
  if (!supabaseCookie) {
    return new Response("Unauthorized: Session required", { status: 401 });
  }
  
  try {
    const { endpoint, cabecera, mensajes, contexto } = await request.json();
    
    // Validar que el endpoint esté presente y sea una cadena
    if (!endpoint || typeof endpoint !== "string") {
      return new Response("Invalid endpoint: must be a non-empty string", { status: 400 });
    }
    
    // Validar el endpoint con la guardia SSRF
    const isValidEndpoint = await validarEndpoint(endpoint);
    if (!isValidEndpoint) {
      return new Response("Invalid endpoint: must be a secure HTTPS URL with no private/internal IPs", { status: 400 });
    }
    
    // Validar mensajes
    if (!Array.isArray(mensajes)) {
      return new Response("Invalid messages: must be an array", { status: 400 });
    }
    
    for (const mensaje of mensajes) {
      if (!mensaje || typeof mensaje !== "object" || 
          typeof mensaje.role !== "string" || typeof mensaje.content !== "string") {
        return new Response("Invalid message format: each message must have role and content strings", { status: 400 });
      }
    }
    
    // Validar contexto (debe ser un objeto)
    if (!contexto || typeof contexto !== "object" || Array.isArray(contexto)) {
      return new Response("Invalid context: must be an object", { status: 400 });
    }
    
    // reenviarTurno ya validará que el contexto no contenga memoria personal
    // (en la práctica, esto sería manejado a nivel de la persona antes de llegar aquí)
    
    // Reenviar el turno y devolver el flujo de eventos
    const stream = await reenviarTurno({
      endpoint,
      cabecera, // Nombre de la variable de entorno con el token de autorización
      mensajes,
      contextoPermitido: contexto,
    });
    
    // Devolver el flujo como respuesta
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Error in invitado proxy:", error);
    
    // Manejar diferentes tipos de errores
    if (error.message?.includes("Authorization token not found")) {
      return new Response("Internal server error: Authorization configuration missing", { status: 500 });
    }
    
    if (error.message?.includes("Request timeout")) {
      return new Response("Gateway timeout: AG-UI endpoint did not respond within 60 seconds", { status: 504 });
    }
    
    if (error.message?.includes("Invalid endpoint")) {
      return new Response(`Bad request: ${error.message}`, { status: 400 });
    }
    
    // Error genérico
    return new Response("Internal server error", { status: 500 });
  }
}