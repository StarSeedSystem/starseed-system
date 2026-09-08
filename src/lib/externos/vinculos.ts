// ══════════════════════════════════════════════════════════════
// Vínculos externos (tokens de acceso) por ámbito — Ola 281 · E1
// Lógica de servidor. El token completo solo se ve UNA vez al crear;
// en base solo vive su hash sha256 y un prefijo visible de 8 caracteres.
// ══════════════════════════════════════════════════════════════
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";


// (2026-09-08) Los tipos y las funciones puras vivían aquí, pero este módulo
// importa `node:crypto` (hashea los tokens) y un componente de cliente
// importaba de él el VALOR `PERMISOS_DEFECTO`: webpack arrastraba `node:crypto`
// al paquete del navegador y el despliegue de producción moría con
// «UnhandledSchemeError: Reading from "node:crypto"». Ahora viven en
// `./tipos.ts` (puro) y se reexportan desde aquí para no romper ningún import.
import {
  AMBITO_TIPOS,
  PERMISOS_DEFECTO,
  esAmbitoTipo,
  estaVigente,
  validarPermisos,
  type AmbitoTipo,
  type PermisosVinculo,
  type TokenGenerado,
  type Vinculo,
} from "@/lib/externos/tipos";

export {
  AMBITO_TIPOS,
  PERMISOS_DEFECTO,
  esAmbitoTipo,
  estaVigente,
  validarPermisos,
  type AmbitoTipo,
  type PermisosVinculo,
  type TokenGenerado,
  type Vinculo,
};


/** Fila cruda de la tabla (incluye token_hash; solo para uso interno). */
interface FilaVinculo extends Vinculo {
  token_hash: string;
}

/** Genera `ssk_<prefijo 8>_<aleatorio 32 hex>` y su hash sha256. */
export function generarToken(): TokenGenerado {
  const prefijo = randomBytes(4).toString("hex"); // 8 caracteres visibles
  const aleatorio = randomBytes(16).toString("hex"); // 32 hex
  const token = `ssk_${prefijo}_${aleatorio}`;
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, prefijo, hash };
}


/**
 * Resuelve el vínculo a partir del token EN CLARO (el que llega en la cabecera
 * Authorization). Se hashea igual que al crear y se busca por `token_hash`: el
 * token completo jamás vive en la base. Devuelve null si el token es desconocido
 * o ya no está vigente (revocado o caducado) — nunca lanza.
 */
export async function resolverToken(
  supabase: SupabaseClient,
  token: string,
): Promise<{ vinculo: Vinculo; owner: string } | null> {
  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase
    .from("os_vinculos_externos")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  const fila = data as FilaVinculo;
  if (!estaVigente(fila)) return null;
  return { vinculo: aVinculo(fila), owner: fila.owner };
}

function aVinculo(fila: FilaVinculo): Vinculo {
  const { token_hash: _omitido, ...resto } = fila;
  return { ...resto, permisos: validarPermisos(fila.permisos) };
}

export interface DatosCrearVinculo {
  ambito_tipo: AmbitoTipo;
  ambito_id?: string;
  nombre: string;
  permisos?: unknown;
  caducaEnDias?: number | null;
}

/**
 * Crea el vínculo y devuelve el token EN CLARO una única vez.
 * En la tabla solo quedan prefijo + hash.
 */
export async function crearVinculo(
  supabase: SupabaseClient,
  owner: string,
  datos: DatosCrearVinculo,
): Promise<{ vinculo: Vinculo; token: string }> {
  if (!esAmbitoTipo(datos.ambito_tipo)) throw new Error("Ámbito no válido.");
  const nombre = (datos.nombre ?? "").trim().slice(0, 120);
  if (!nombre) throw new Error("El nombre es obligatorio.");
  const { token, prefijo, hash } = generarToken();
  const expira_en =
    datos.caducaEnDias && datos.caducaEnDias > 0
      ? new Date(Date.now() + datos.caducaEnDias * 86_400_000).toISOString()
      : null;
  const { data, error } = await supabase
    .from("os_vinculos_externos")
    .insert({
      owner,
      ambito_tipo: datos.ambito_tipo,
      ambito_id: (datos.ambito_id ?? "").slice(0, 200),
      nombre,
      prefijo,
      token_hash: hash,
      permisos: validarPermisos(datos.permisos),
      expira_en,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { vinculo: aVinculo(data as FilaVinculo), token };
}
