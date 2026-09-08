// ══════════════════════════════════════════════════════════════
// Vínculos externos — parte PURA, apta para el navegador (2026-09-08)
// ──────────────────────────────────────────────────────────────
// Por qué existe este archivo: `src/lib/externos/vinculos.ts` importa
// `node:crypto` en la primera línea (hashea los tokens), así que es un módulo
// SOLO de servidor. `src/components/externos/nuevo-vinculo.tsx` importaba de
// él el VALOR `PERMISOS_DEFECTO`, y eso arrastraba `node:crypto` al paquete
// del navegador: el despliegue de producción del 2026-09-08 (21:45 UTC) murió
// con «Module build failed: UnhandledSchemeError: Reading from "node:crypto"
// is not handled by plugins». Ni `tsc` ni vitest lo ven — solo `next build`.
// Aquí viven los tipos y las funciones que NO tocan crypto ni Supabase, para
// que el cliente importe de aquí y el servidor siga importando de `vinculos.ts`
// (que las reexporta, así ningún import existente se rompe).
// ══════════════════════════════════════════════════════════════

export type AmbitoTipo =
  | "cuenta" | "chat" | "personalidad" | "agente"
  | "cerebro" | "carpeta" | "memoria" | "perfil";

export const AMBITO_TIPOS: readonly AmbitoTipo[] = [
  "cuenta", "chat", "personalidad", "agente",
  "cerebro", "carpeta", "memoria", "perfil",
] as const;

export interface PermisosVinculo {
  leer: boolean;
  escribir: boolean;
  hablar: boolean;
  memoria: boolean;
  herramientas: boolean;
}

export const PERMISOS_DEFECTO: PermisosVinculo = {
  leer: true,
  escribir: false,
  hablar: false,
  memoria: false,
  herramientas: false,
};

/** Vínculo tal y como se expone: NUNCA incluye el hash del token. */
export interface Vinculo {
  id: string;
  owner: string;
  ambito_tipo: AmbitoTipo;
  ambito_id: string;
  nombre: string;
  prefijo: string;
  permisos: PermisosVinculo;
  expira_en: string | null;
  ultimo_uso: string | null;
  usos: number;
  creado_en: string;
  revocado_en: string | null;
  origen: string;
}

export interface TokenGenerado {
  token: string;
  prefijo: string;
  hash: string;
}

function esBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/**
 * Limpia permisos arbitrarios: solo se aceptan booleanos reales; cualquier
 * clave ausente o con basura cae al valor por defecto (restrictivo).
 */
export function validarPermisos(bruto: unknown): PermisosVinculo {
  const base: PermisosVinculo = { ...PERMISOS_DEFECTO };
  if (!bruto || typeof bruto !== "object") return base;
  const o = bruto as Record<string, unknown>;
  for (const clave of Object.keys(PERMISOS_DEFECTO) as (keyof PermisosVinculo)[]) {
    const v = o[clave];
    if (esBool(v)) base[clave] = v;
  }
  return base;
}

/** Vigente = no revocado y sin caducidad vencida (null = sin caducidad). */
export function estaVigente(
  v: Pick<Vinculo, "revocado_en" | "expira_en">,
  ahora: Date = new Date(),
): boolean {
  if (v.revocado_en) return false;
  if (v.expira_en && new Date(v.expira_en).getTime() <= ahora.getTime()) return false;
  return true;
}

export function esAmbitoTipo(v: unknown): v is AmbitoTipo {
  return typeof v === "string" && (AMBITO_TIPOS as readonly string[]).includes(v);
}
