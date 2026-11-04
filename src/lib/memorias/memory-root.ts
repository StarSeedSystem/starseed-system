// Memory Root — tipo y lector de memory.manifest.json (CTR1104P, 2026-11-04)
// Módulo PURO: sin red, sin disco, sin procesos. Solo tipos y funciones de validación/normalización.
// Contrato: architecture/memoria-cerebros-sync.md §«Pendiente de implementar»

export const RAMAS_MEMORIA = [
  "soul",
  "ego",
  "skills",
  "style",
  "memory",
  "dream",
  "accounts",
  "tasks",
  "logs",
] as const;

export type RamaMemoria = (typeof RAMAS_MEMORIA)[number];

export type ScopeMemoria = "personal" | "perfil" | "grupo" | "publica";

export interface RamaMemoryRoot {
  path: string;
  archivos: string[];
}

export interface MemoryRoot {
  root: string;
  ramas: Record<RamaMemoria, RamaMemoryRoot>;
  manifest: Manifest;
}

export interface ManifestEntry {
  rama: RamaMemoria;
  archivo: string;
  tipo: string;
  scope: ScopeMemoria;
  hash: string;
}

export interface Manifest {
  version: number;
  entradas: ManifestEntry[];
}

export type ManifestParseResult =
  | { ok: true; datos: Manifest }
  | { ok: false; motivo: string };

export interface EntradaDescartada {
  entrada: unknown;
  motivo: string;
}

export interface ManifestNormalizado {
  validas: ManifestEntry[];
  descartadas: EntradaDescartada[];
}

const SCOPES_VALIDOS: ScopeMemoria[] = ["personal", "perfil", "grupo", "publica"];

export function validarRama(rama: string): rama is RamaMemoria {
  return RAMAS_MEMORIA.includes(rama as RamaMemoria);
}

export function validarScope(scope: string): scope is ScopeMemoria {
  return SCOPES_VALIDOS.includes(scope as ScopeMemoria);
}

function esRutaRelativaSegura(archivo: string): boolean {
  if (!archivo || typeof archivo !== "string") return false;
  if (archivo.startsWith("/")) return false;
  if (archivo.startsWith("..")) return false;
  if (archivo.includes("../")) return false;
  if (archivo.includes("\\")) return false;
  return true;
}

export function validarEntradaManifest(entrada: unknown): entrada is ManifestEntry {
  if (!entrada || typeof entrada !== "object") return false;
  const e = entrada as Record<string, unknown>;
  if (!validarRama(e.rama as string)) return false;
  if (typeof e.archivo !== "string" || !esRutaRelativaSegura(e.archivo)) return false;
  if (typeof e.tipo !== "string" || !e.tipo.trim()) return false;
  if (!validarScope(e.scope as string)) return false;
  if (typeof e.hash !== "string" || !e.hash.trim()) return false;
  return true;
}

export function parsearManifest(json: string): ManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, motivo: "JSON inválido" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, motivo: "El manifest debe ser un objeto" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.version !== "number" || !Number.isInteger(obj.version)) {
    return { ok: false, motivo: "Falta o inválida la versión" };
  }
  if (!Array.isArray(obj.entradas)) {
    return { ok: false, motivo: "El campo 'entradas' debe ser un array" };
  }
  return { ok: true, datos: { version: obj.version, entradas: obj.entradas as ManifestEntry[] } };
}

export function normalizarManifest(manifest: unknown): ManifestNormalizado {
  const validas: ManifestEntry[] = [];
  const descartadas: EntradaDescartada[] = [];

  if (!manifest || typeof manifest !== "object") {
    return { validas, descartadas: [{ entrada: manifest, motivo: "Manifest no es un objeto" }] };
  }

  const obj = manifest as Record<string, unknown>;
  const entradas = obj.entradas;
  if (!Array.isArray(entradas)) {
    return {
      validas,
      descartadas: [{ entrada: manifest, motivo: "Campo 'entradas' no es un array" }],
    };
  }

  for (const entrada of entradas) {
    if (validarEntradaManifest(entrada)) {
      validas.push(entrada);
    } else {
      let motivo = "Entrada inválida";
      if (!entrada || typeof entrada !== "object") {
        motivo = "No es un objeto";
      } else {
        const e = entrada as Record<string, unknown>;
        if (!validarRama(e.rama as string)) motivo = `Rama inválida: ${String(e.rama)}`;
        else if (typeof e.archivo !== "string" || !esRutaRelativaSegura(e.archivo))
          motivo = `Ruta de archivo inválida: ${String(e.archivo)}`;
        else if (typeof e.tipo !== "string" || !e.tipo.trim()) motivo = "Tipo vacío";
        else if (!validarScope(e.scope as string)) motivo = `Scope inválido: ${String(e.scope)}`;
        else if (typeof e.hash !== "string" || !e.hash.trim()) motivo = "Hash vacío";
      }
      descartadas.push({ entrada, motivo });
    }
  }

  return { validas, descartadas };
}