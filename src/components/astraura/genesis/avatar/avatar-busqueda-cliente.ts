"use client";

/**
 * avatar-busqueda-cliente.ts — el ÚNICO sitio del navegador que llama a
 * `/api/avatar-search`.
 * ----------------------------------------------------------------------------
 * Mismo idioma que `genesis-client.ts` declara de sí mismo: "use client"
 * explícito, y la regla de oro de todo cliente de este proyecto — NUNCA
 * lanza hacia la interfaz. Cualquier fallo (red caída, 401 sin sesión, 429
 * de cuota, 503 sin credenciales configuradas, 502 del proveedor, JSON
 * roto…) vuelve como `{ ok:false, candidatos:[], error, codigo }`, nunca
 * como una excepción — así el selector de cuerpo puede mostrar SIEMPRE el
 * mismo camino de vuelta al procedural sin un `try/catch` propio en cada
 * sitio que llame a esto.
 *
 * Sin claves aquí: la clave/credencial del proveedor vive SOLO en el
 * servidor (`src/app/api/avatar-search/route.ts`) — este fichero solo habla
 * con nuestro propio origen, igual que hace `/api/ai/openrouter` desde el
 * navegador.
 */

import type { FuenteAvatar } from "@/lib/astraura/genesis-types";
import { codigoDesdeEstadoHttp, type RespuestaBusquedaAvatar } from "./avatar-busqueda-logica";

const TIMEOUT_MS = 15_000;

/** Forma cruda del JSON que devuelve la ruta — todo `unknown` a propósito
 *  (nunca confiamos en la forma de una respuesta HTTP sin comprobarla). Un
 *  tipo con nombre en vez de `typeof data` evita un `let ... = null` cuyo
 *  reasignado dentro del propio `try` confunda al control-flow del
 *  compilador consigo mismo — más simple de leer, además. */
interface RespuestaCrudaServidor {
  ok?: unknown;
  candidatos?: unknown;
  error?: unknown;
}

/**
 * Busca avatares en línea para `consulta` (normalmente compuesta por
 * `componerConsultaAvatar`, pero también puede venir de lo que la persona
 * tecleó a mano en el buscador). Siempre devuelve una respuesta usable.
 */
export async function buscarAvataresEnLinea(consulta: string): Promise<RespuestaBusquedaAvatar> {
  const limpia = consulta.trim();
  if (!limpia) return { ok: false, candidatos: [], error: "Escribe o compón una búsqueda primero.", codigo: "entrada" };

  let res: Response;
  try {
    res = await fetch("/api/avatar-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consulta: limpia }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Ni status ni cuerpo que leer: sin conexión con NUESTRO servidor, no con el proveedor — pero desde
    // la interfaz "no se pudo buscar ahora mismo" se trata igual que un fallo del proveedor.
    return {
      ok: false,
      candidatos: [],
      error: e instanceof Error ? e.message : "Error de red al buscar el avatar.",
      codigo: "proveedor",
    };
  }

  let data: RespuestaCrudaServidor | null = null;
  try {
    data = (await res.json()) as RespuestaCrudaServidor;
  } catch {
    data = null;
  }

  if (!res.ok || !data || data.ok !== true) {
    const mensaje = (data && typeof data.error === "string" && data.error) || `El servidor respondió ${res.status}.`;
    return { ok: false, candidatos: [], error: mensaje, codigo: codigoDesdeEstadoHttp(res.status) };
  }

  const candidatos = Array.isArray(data.candidatos) ? (data.candidatos as FuenteAvatar[]) : [];
  return { ok: true, candidatos };
}
