import { BranchTipo, BRANCH_TIPOS } from "../memory-sync/manifest";

/**
 * Representa la raíz de una memoria (Memory Root).
 * Un memory root es una carpeta con ramas (subcarpetas) por tipo de memoria.
 */
export interface MemoryRoot {
  id: string;
  name: string;
  uri: string; // Ruta relativa, URL de Drive, etc.
  kind: "local" | "gdrive" | "remote";
  branches: MemoryRootBranch[];
  lastSync?: string;
}

/**
 * Una rama dentro de un Memory Root.
 */
export interface MemoryRootBranch {
  rama: string;
  tipo: BranchTipo;
  archivo: string; // Ruta relativa dentro del root
  scope?: string;
  hash?: string;
  status?: "ok" | "error";
  errorReason?: string;
}

/**
 * Resultado de la lectura y validación de un manifiesto.
 */
export interface ManifestReadResult {
  manifest?: MemoryRoot;
  errors: string[];
  isValid: boolean;
}

/**
 * Lee y normaliza un objeto JSON (memory.manifest.json) al tipo MemoryRoot.
 * Sigue el contrato de architecture/memoria-cerebros-sync.md.
 * No lanza nunca, devuelve los errores encontrados.
 */
export function readMemoryManifest(
  raw: any,
  uri: string = "",
  kind: MemoryRoot["kind"] = "local"
): ManifestReadResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { errors: ["El manifiesto no es un objeto válido"], isValid: false };
  }

  // Validación básica del contrato
  if (raw.kind !== "memory_root") {
    errors.push(`Tipo de manifiesto inválido: ${raw.kind}. Se esperaba "memory_root".`);
  }

  const name = typeof raw.name === "string" ? raw.name : "Sin nombre";
  const id = typeof raw.id === "string" ? raw.id : Math.random().toString(36).substring(7);

  const branches: MemoryRootBranch[] = [];
  const rawBranches = Array.isArray(raw.branches) ? raw.branches : [];

  rawBranches.forEach((b: any, index: number) => {
    const rama = typeof b.rama === "string" ? b.rama.trim() : "";
    const archivo = typeof b.archivo === "string" ? b.archivo.trim() : "";
    const tipoRaw = typeof b.tipo === "string" ? b.tipo.toLowerCase() : "";
    
    // Validación de campos obligatorios
    if (!rama || !archivo) {
      errors.push(`Rama en índice ${index} descartada: falta "rama" o "archivo".`);
      return;
    }

    // Normalización de tipo
    let tipo: BranchTipo = "memory";
    if ((BRANCH_TIPOS as readonly string[]).includes(tipoRaw)) {
      tipo = tipoRaw as BranchTipo;
    } else {
      // Si no se entiende el tipo, se usa 'memory' por defecto pero se podría anotar
      // En este caso el prompt dice: "lo que no se entiende se descarta con su motivo"
      // Pero si el tipo es lo único que falla, ¿descartamos la rama entera? 
      // El prompt dice "entradas con hash, scope, ruta relativa; lo que no se entiende se descarta"
      errors.push(`Rama "${rama}" descartada: tipo "${tipoRaw}" no reconocido.`);
      return;
    }

    branches.push({
      rama,
      tipo,
      archivo,
      scope: typeof b.scope === "string" ? b.scope : undefined,
      hash: typeof b.hash === "string" ? b.hash : undefined,
      status: "ok"
    });
  });

  const manifest: MemoryRoot = {
    id,
    name,
    uri,
    kind,
    branches,
    lastSync: raw.sync?.last_sync || raw.lastSync
  };

  return {
    manifest,
    errors,
    isValid: errors.length === 0 && branches.length > 0
  };
}
