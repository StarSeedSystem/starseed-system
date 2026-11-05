// StarSeed OS — Memory Roots · Merge por hash/scope (PURO, determinista).
// Decide qué SUBIR (solo en local), qué BAJAR (solo en destino), qué es
// CONFLICTO (mismo archivo, hashes distintos en los dos lados) y qué NO se
// toca por `scope`. Sin I/O. Contrato: architecture/memoria-cerebros-sync.md.

import type { BranchTipo } from "../memory-sync/manifest";

/** Una memoria del contrato portátil; `archivo` es la clave de identidad. */
export interface RamaMerge {
  rama: string;
  tipo: BranchTipo;
  archivo: string;
  scope?: string;
  hash?: string;
}

/** Qué propone el motor para una memoria concreta. */
export type AccionMerge = "subir" | "bajar" | "conflicto" | "intacto" | "sinSync";

/** La decisión de una única memoria, con los datos para explicarla. */
export interface EntradaMerge {
  archivo: string;
  rama: string;
  tipo: BranchTipo;
  accion: AccionMerge;
  scopeLocal?: string; scopeDestino?: string;
  hashLocal?: string; hashDestino?: string;
}

/** Plan completo del merge + resumen por acción. */
export interface PlanMerge {
  ramas: EntradaMerge[];
  subir: number; bajar: number; conflictos: number;
  intactos: number; sinSync: number;
}

/** Opciones del merge: scopes que jamás se propagan a otro lado. */
export interface OpcionesMerge {
  scopesProtegidos?: readonly string[];
}

/** Scope efectivo: lo que no se declara se compara como «global». */
function scopeDe(scope: string | undefined): string {
  return scope?.trim() || "global";
}

/** Índice por `archivo` (clave de identidad); el duplicado primero gana. */
function indexar(ramas: readonly RamaMerge[]): Map<string, RamaMerge> {
  const porArchivo = new Map<string, RamaMerge>();
  for (const r of ramas)
    if (r.archivo && !porArchivo.has(r.archivo)) porArchivo.set(r.archivo, r);
  return porArchivo;
}

/** Comparación de hashes; la ausencia cuenta como cadena vacía. */
function accionPorHash(hashLocal: string | undefined, hashDestino: string | undefined): "intacto" | "conflicto" {
  return (hashLocal ?? "") === (hashDestino ?? "") ? "intacto" : "conflicto";
}

/**
 * Planifica el merge bidireccional entre el manifiesto LOCAL y el del DESTINO.
 * Nunca toca disco ni red: devuelve el plan y quien lo ejecuta. Reglas: 1)
 * scope protegido o distinto en los dos lados → «sinSync» (no se toca); 2)
 * solo en local → «subir» / solo en destino → «bajar»; 3) hash igual a ambos
 * lados (incluida la ausencia) → «intacto»; 4) hash distinto → «conflicto».
 */
export function planificarMerge(
  local: readonly RamaMerge[],
  destino: readonly RamaMerge[],
  opciones: OpcionesMerge = {},
): PlanMerge {
  const porArchivoLocal = indexar(local);
  const porArchivoDestino = indexar(destino);
  const claves = new Set<string>([...porArchivoLocal.keys(), ...porArchivoDestino.keys()]);

  const ramas: EntradaMerge[] = [];
  for (const archivo of claves) {
    const enLocal = porArchivoLocal.get(archivo);
    const enDestino = porArchivoDestino.get(archivo);
    const bando = enLocal ?? (enDestino as RamaMerge);
    ramas.push({
      archivo,
      rama: bando.rama,
      tipo: bando.tipo,
      accion: decidirAccion(enLocal, enDestino, opciones),
      scopeLocal: enLocal?.scope,
      scopeDestino: enDestino?.scope,
      hashLocal: enLocal?.hash,
      hashDestino: enDestino?.hash,
    });
  }

  // Orden estable por archivo: el plan es idéntico en cada llamada.
  ramas.sort((a, b) => (a.archivo === b.archivo ? 0 : a.archivo < b.archivo ? -1 : 1));

  const por = (accion: AccionMerge) => ramas.filter((r) => r.accion === accion).length;

  return {
    ramas,
    subir: por("subir"), bajar: por("bajar"), conflictos: por("conflicto"),
    intactos: por("intacto"), sinSync: por("sinSync"),
  };
}

/** Scope primero (no se toca), luego subir/bajar y por último el hash. */
function decidirAccion(enLocal: RamaMerge | undefined, enDestino: RamaMerge | undefined, opciones: OpcionesMerge): AccionMerge {
  const scopeLocal = scopeDe(enLocal?.scope);
  const scopeDestino = scopeDe(enDestino?.scope);
  const protegidos = opciones.scopesProtegidos ?? [];
  if (
    protegidos.includes(scopeLocal) ||
    protegidos.includes(scopeDestino) ||
    scopeLocal !== scopeDestino
  ) {
    return "sinSync";
  }
  if (!enDestino) return "subir";
  if (!enLocal) return "bajar";
  return accionPorHash(enLocal.hash, enDestino.hash);
}
