import type { BranchTipo, MemoryBranch, MemoryManifest } from "../memory-sync/manifest";

/**
 * Motor de fusión de dos `memory.manifest.json` (local y destino) por `hash` y
 * `scope`. Puro: sin red, sin disco y sin reloj, así que es determinista.
 * Contrato: `architecture/memoria-cerebros-sync.md` §«Pendiente de implementar».
 */

/** Qué hacer con una memoria al fusionar los dos manifiestos. */
export type MergeAction = "subir" | "bajar" | "conflicto" | "sin_cambios" | "omitido_por_scope";

/** Una memoria del resultado, con el porqué de su acción. */
export interface MergeEntry {
  archivo: string;
  rama: string;
  tipo: BranchTipo;
  /** Scope normalizado (`global` cuando el manifiesto no lo trae). */
  scope: string;
  hashLocal?: string;
  hashDestino?: string;
  accion: MergeAction;
  motivo: string;
}

export interface MergeOptions {
  /** Scopes que este destino NO sincroniza (sin distinguir mayúsculas ni espacios). */
  scopesOmitidos?: readonly string[];
}

export interface MergeResult {
  entradas: MergeEntry[];
  subir: MergeEntry[];
  bajar: MergeEntry[];
  conflictos: MergeEntry[];
  sinCambios: MergeEntry[];
  omitidos: MergeEntry[];
  resumen: {
    subir: number;
    bajar: number;
    conflictos: number;
    sinCambios: number;
    omitidos: number;
  };
}

function normScope(scope?: string): string {
  return (scope ?? "").trim().toLowerCase() || "global";
}

function normHash(hash?: string): string | undefined {
  return (hash ?? "").trim() || undefined;
}

function indexar(branches: readonly MemoryBranch[]): Map<string, MemoryBranch> {
  const mapa = new Map<string, MemoryBranch>();
  for (const b of branches) if (b.archivo.trim()) mapa.set(b.archivo.trim(), b);
  return mapa;
}

function decidir(local: MemoryBranch | undefined, destino: MemoryBranch | undefined, omitidos: ReadonlySet<string>): { accion: MergeAction; motivo: string } {
  const scopeLocal = normScope(local?.scope);
  const scopeDestino = normScope(destino?.scope);
  if (omitidos.has(scopeLocal) || omitidos.has(scopeDestino)) return { accion: "omitido_por_scope", motivo: "scope omitido por el destino" };
  if (!destino) return { accion: "subir", motivo: "solo existe en local" };
  if (!local) return { accion: "bajar", motivo: "solo existe en destino" };
  if (scopeLocal !== scopeDestino) return { accion: "omitido_por_scope", motivo: `scopes distintos (${scopeLocal} ≠ ${scopeDestino})` };
  const hashLocal = normHash(local.hash);
  const hashDestino = normHash(destino.hash);
  if (hashLocal && hashDestino && hashLocal !== hashDestino) return { accion: "conflicto", motivo: "mismo archivo con hashes distintos" };
  return { accion: "sin_cambios", motivo: "sin diferencias demostrables por hash" };
}

export function mergeMemoryRoots(
  local: MemoryManifest,
  destino: MemoryManifest,
  opciones: MergeOptions = {},
): MergeResult {
  const omitidos = new Set((opciones.scopesOmitidos ?? []).map(normScope));
  const locales = indexar(local.branches);
  const destinos = indexar(destino.branches);
  const archivos = [...new Set([...locales.keys(), ...destinos.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const entradas: MergeEntry[] = archivos.map((archivo) => {
    const ramaLocal = locales.get(archivo);
    const ramaDestino = destinos.get(archivo);
    const referencia = (ramaLocal ?? ramaDestino)!;
    const { accion, motivo } = decidir(ramaLocal, ramaDestino, omitidos);
    return {
      archivo, rama: referencia.rama, tipo: referencia.tipo, scope: normScope(referencia.scope),
      hashLocal: normHash(ramaLocal?.hash), hashDestino: normHash(ramaDestino?.hash), accion, motivo,
    };
  });

  const de = (accion: MergeAction) => entradas.filter((e) => e.accion === accion);
  const subir = de("subir"), bajar = de("bajar"), conflictos = de("conflicto");
  const sinCambios = de("sin_cambios"), omitidosResultado = de("omitido_por_scope");
  return {
    entradas, subir, bajar, conflictos, sinCambios,
    omitidos: omitidosResultado,
    resumen: {
      subir: subir.length, bajar: bajar.length, conflictos: conflictos.length,
      sinCambios: sinCambios.length, omitidos: omitidosResultado.length,
    },
  };
}
