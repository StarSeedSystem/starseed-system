// ══════════════════════════════════════════════════════════════
// Cliente del navegador para los vínculos externos — Ola 281 · E3 (2026-09-07)
// Capa de acceso a la API `/api/externos/vinculos` (E1) desde componentes
// React. El token completo SOLO se maneja en memoria durante su creación:
// estas funciones lo devuelven UNA vez y nunca lo persisten ni loguean.
// ══════════════════════════════════════════════════════════════
import type {
  AmbitoTipo,
  PermisosVinculo,
  Vinculo,
} from "@/lib/externos/tipos";

/** Ámbito sobre el que actúa el panel (tipo + id + nombre opcional). */
export interface AmbitoExterno {
  tipo: AmbitoTipo;
  id: string;
  nombre?: string;
}

/** Petición para crear un vínculo (token lo genera el servidor). */
export interface PeticionCrearVinculo {
  nombre: string;
  permisos: PermisosVinculo;
  caducaEnDias: number | null;
}

/** Resultado de crear: el vínculo persistido más su token EN CLARO (única vez). */
export interface VinculoCreado {
  vinculo: Vinculo;
  token: string;
}

export interface ResultadoLista {
  ok: boolean;
  vinculos: Vinculo[];
  error?: string;
}

export interface ResultadoCrear {
  ok: boolean;
  creado?: VinculoCreado;
  error?: string;
}

export interface ResultadoRevocar {
  ok: boolean;
  error?: string;
}

const URL_VINCULOS = "/api/externos/vinculos";

/** Lee el JSON de una respuesta; devuelve null si el cuerpo no es JSON. */
async function leerJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Lista los vínculos ACTIVOS de un ámbito. Nunca lanza; degrade a lista vacía. */
export async function listarVinculos(ambito: AmbitoExterno): Promise<ResultadoLista> {
  const q = new URLSearchParams({ ambito_tipo: ambito.tipo, ambito_id: ambito.id });
  try {
    const res = await fetch(`${URL_VINCULOS}?${q.toString()}`, { cache: "no-store" });
    const data = await leerJson<{ ok?: boolean; vinculos?: Vinculo[]; error?: string }>(res);
    if (!data || data.ok === false || !Array.isArray(data.vinculos)) {
      return { ok: false, vinculos: [], error: data?.error ?? `Respuesta inválida (${res.status}).` };
    }
    return { ok: true, vinculos: data.vinculos };
  } catch (err) {
    return { ok: false, vinculos: [], error: err instanceof Error ? err.message : "Error de red." };
  }
}

/** Crea un vínculo y devuelve su token EN CLARO una única vez. */
export async function crearVinculoCliente(
  ambito: AmbitoExterno,
  datos: PeticionCrearVinculo,
): Promise<ResultadoCrear> {
  try {
    const res = await fetch(URL_VINCULOS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ambito_tipo: ambito.tipo,
        ambito_id: ambito.id,
        nombre: datos.nombre,
        permisos: datos.permisos,
        caducaEnDias: datos.caducaEnDias,
      }),
    });
    const data = await leerJson<{ ok?: boolean; vinculo?: Vinculo; token?: string; error?: string }>(res);
    if (!data || data.ok === false || !data.vinculo || typeof data.token !== "string") {
      return { ok: false, error: data?.error ?? `Respuesta inválida (${res.status}).` };
    }
    return { ok: true, creado: { vinculo: data.vinculo, token: data.token } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de red." };
  }
}

/** Revoca un vínculo por su id (borrado lógico: queda `revocado_en`). */
export async function revocarVinculo(id: string): Promise<ResultadoRevocar> {
  try {
    const res = await fetch(`${URL_VINCULOS}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await leerJson<{ ok?: boolean; error?: string }>(res);
    if (!data || data.ok === false) {
      return { ok: false, error: data?.error ?? `Respuesta inválida (${res.status}).` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de red." };
  }
}

/** Origen actual + `/api/externos/v1`: la URL pública que usan los clientes. */
export function urlApiV1(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/externos/v1`;
}

/**
 * Ejemplo `curl` listo para copiar: llama a `/api/externos/v1/chat` con un
 * Bearer `ssk_<prefijo>…` y un cuerpo de chat. Solo usa el PREFIJO (nunca el
 * token completo) fuera del instante de creación.
 */
export function ejemploCurl(prefijo: string, _ambito: AmbitoExterno): string {
  const url = `${urlApiV1()}/chat`;
  return [
    `curl -X POST "${url}" \\`,
    `  -H "Authorization: Bearer ssk_${prefijo}_…" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{ "mensaje": "Hola, ¿qué tal?" }'`,
  ].join("\n");
}

/** Resumen legible de los permisos concedidos (para chips y listas). */
export function resumenPermisos(p: PermisosVinculo): string[] {
  const etiquetas: Record<keyof PermisosVinculo, string> = {
    leer: "leer",
    escribir: "escribir",
    hablar: "hablar",
    memoria: "memoria",
    herramientas: "herramientas",
  };
  return (Object.keys(etiquetas) as (keyof PermisosVinculo)[]).filter((k) => p[k] === true).map((k) => etiquetas[k]);
}