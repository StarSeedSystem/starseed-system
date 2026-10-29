// ════════════════════════════════════════════════════════════════
// openrefine — cliente para OpenRefine 3.10.1
// ----------------------------------------------------------------
// Integra con OpenRefine local en 127.0.0.1:3333.
// Usa el proxy de Next.js (/api/integrations/proxy) para evitar CORS.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, cleanEndpoint, extra } from "./_proxy";

const DEFAULT_ENDPOINT = "http://127.0.0.1:3333";

// ── tipos de receta ────────────────────────────────────────────────

const OPERACIONES_BLANCAS: readonly string[] = [
  "text-transform",
  "mass-edit",
  "column-removal",
  "column-rename",
  "column-split",
  "column-addition",
  "blank-down",
  "fill-down",
  "row-removal",
  "multivalued-cell-split",
  "join",
  "column-reorder",
] as const;

type OperacionBlanca = typeof OPERACIONES_BLANCAS[number];

function operacionEstaEnBlanca(op: string): op is OperacionBlanca {
  return OPERACIONES_BLANCAS.includes(op as OperacionBlanca);
}

function validarReceta(receta: unknown): { ok: boolean; error?: string } {
  if (!receta || typeof receta !== "object") return { ok: false, error: "La receta debe ser un objeto." };
  const r = receta as Record<string, unknown>;

  // R5 y R9: debe declarar datos: "publicos"
  if (r.datos !== "publicos") return { ok: false, error: "La receta debe declarar 'datos: \"publicos\"' (R5, R9)." };

  // tope de 100 operaciones
  const ops = Array.isArray(r.operations) ? r.operations : [];
  if (ops.length > 100) return { ok: false, error: "Tope de 100 operaciones superado." };

  // tope de 200 KB
  const opsJson = JSON.stringify(r);
  if (opsJson.length > 200 * 1024) return { ok: false, error: "La receta supera los 200 KB." };

  // whitelist de ops
  for (const op of ops) {
    if (typeof op !== "object" || op === null || !("op" in op)) {
      return { ok: false, error: `Operación desconocida o inválida.` };
    }
    const opName = (op as { op: string }).op;
    if (!operacionEstaEnBlanca(opName)) {
      return {
        ok: false,
        error: `Operación fuera de la lista blanca: "${opName}"`,
      };
    }
  }

  // expresiones deben empezar solo por grel:
  function todasExpresionesGrel(ops: readonly unknown[]): boolean {
    for (const op of ops) {
      if (typeof op === "string") {
        if (!op.startsWith("grel:")) return false;
      }
      if (typeof op === "object" && op !== null) {
        const opStr = JSON.stringify(op);
        // si tiene expresión, debe empezar por grel:
        if (opStr.includes('"expression"') || opStr.includes('"expr"')) {
          const exprMatch = opStr.match(/"(expression|expr)"\s*:\s*"([^"]*)"/);
          if (exprMatch && !exprMatch[2].startsWith("grel:")) return false;
        }
      }
    }
    return true;
  }

  // validar que hay al menos una expresión grel y ninguna expresión prohibida
  if (!todasExpresionesGrel(ops)) {
    return { ok: false, error: "Las expresiones de la receta deben empezar por 'grel:'." };
  }

  // rechazar jython:, clojure:, core/column-addition-by-fetching-urls
  for (const op of ops) {
    if (typeof op === "string") {
      if (op.startsWith("jython:") || op.startsWith("clojure:") || op === "core/column-addition-by-fetching-urls") {
        return { ok: false, error: `Operación prohibida: "${op}"` };
      }
    }
    if (typeof op === "object" && op !== null) {
      const opStr = JSON.stringify(op);
      if (opStr.startsWith('"jython:') || opStr.startsWith('"clojure:') || opStr.includes('"core/column-addition-by-fetching-urls"')) {
        return { ok: false, error: "Operación prohibida detectada en la receta." };
      }
    }
  }

  return { ok: true };
}

export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  const ep = cleanEndpoint(cfg.endpoint || DEFAULT_ENDPOINT);

  // Rechazar hosts que no sean loopback a menos que haya token de pasarela
  try {
    const url = new URL(ep);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "::1") {
      const cfgExtra = extra(cfg, "extra");
      if (!cfgExtra) {
        return { ok: false, error: `Host no permitido: ${ep}. Solo se permite loopback a menos que la configuración traiga token de pasarela.` };
      }
    }
  } catch {
    // URL inválida, intentaremos la llamada y fallará después
  }

  return proxyFetch({
    id: "openrefine-health",
    endpoint: ep,
    method: "GET",
    path: "/command/core/get-version",
  });
}

// ── get CSRF token ─────────────────────────────────────────────────

export async function getCsrfToken(cfg: IntegrationConfig): Promise<IntegrationResult<string>> {
  const ep = cleanEndpoint(cfg.endpoint || DEFAULT_ENDPOINT);
  return proxyFetch({
    id: "openrefine-csrf",
    endpoint: ep,
    method: "POST",
    path: "/command/core/get-csrf-token",
  });
}

// ── crear proyecto ─────────────────────────────────────────────────

export async function crearProyecto(
  cfg: IntegrationConfig,
  csv: string,
  projectName: string
): Promise<IntegrationResult<string>> {
  const ep = cleanEndpoint(cfg.endpoint || DEFAULT_ENDPOINT);

  const form = new FormData();
  form.append("project-file", new Blob([csv], { type: "text/csv" }), "data.csv");
  form.append("project-name", projectName);
  form.append("format", "csv");
  form.append("options", JSON.stringify({}));

  return proxyFetch({
    id: "openrefine-create",
    endpoint: ep,
    method: "POST",
    path: "/command/core/create-project-from-upload",
    body: form,
  });
}

// ── aplicar operaciones ─────────────────────────────────────────────

export async function aplicarOperaciones(
  cfg: IntegrationConfig,
  projectId: string,
  operations: unknown[]
): Promise<IntegrationResult> {
  const ep = cleanEndpoint(cfg.endpoint || DEFAULT_ENDPOINT);

  return proxyFetch({
    id: "openrefine-apply",
    endpoint: ep,
    method: "POST",
    path: `/command/core/apply-operations?project=${projectId}`,
    body: { operations },
  });
}

// ── exportar filas ─────────────────────────────────────────────────

export async function exportarFilas(
  cfg: IntegrationConfig,
  projectId: string,
  formato: "csv" | "json" | "xml" | "html",
  engine?: string
): Promise<IntegrationResult<Blob>> {
  const ep = cleanEndpoint(cfg.endpoint || DEFAULT_ENDPOINT);

  return proxyFetch<Blob>({
    id: "openrefine-export",
    endpoint: ep,
    method: "POST",
    path: "/command/core/export-rows",
    body: { project: projectId, format: formato, engine },
  });
}

// ── borrar proyecto ────────────────────────────────────────────────

export async function borrarProyecto(cfg: IntegrationConfig, projectId: string): Promise<IntegrationResult> {
  const ep = cleanEndpoint(cfg.endpoint || DEFAULT_ENDPOINT);

  return proxyFetch({
    id: "openrefine-delete",
    endpoint: ep,
    method: "POST",
    path: "/command/core/delete-project",
    body: { project: projectId },
  });
}

// ── limpiar: token → crear proyecto → aplicar → exportar → BORRAR ─────

export interface LimpiarOptions {
  csv: string;
  receta: unknown;
  formato?: "csv" | "json" | "xml" | "html";
}

export interface LimpiarResultado {
  proyectoId?: string;
  datosExportados?: Blob;
  ok: boolean;
  error?: string;
}

export async function limpiar(
  cfg: IntegrationConfig,
  { csv, receta, formato = "csv" }: LimpiarOptions
): Promise<LimpiarResultado> {
  const ep = cleanEndpoint(cfg.endpoint || DEFAULT_ENDPOINT);

  // 1. Validar receta
  const valid = validarReceta(receta);
  if (!valid.ok) return { ok: false, error: valid.error };

  // 2. Obtener CSRF token
  const csrf = await getCsrfToken(cfg);
  if (!csrf.ok) return { ok: false, error: `No se obtuvo token CSRF: ${csrf.error}` };

  // 3. Crear proyecto
  const crear = await crearProyecto(cfg, csv, "Limpiado por StarSeed");
  if (!crear.ok) return { ok: false, error: `No se pudo crear el proyecto: ${crear.error}` };
  const proyectoId = crear.data;
  if (!proyectoId) return { ok: false, error: "Proyecto creado pero sin ID." };

  // 4. Aplicar operaciones
  const aplicar = await aplicarOperaciones(cfg, proyectoId, receta as unknown[]);
  if (!aplicar.ok) {
    await borrarProyecto(cfg, proyectoId);
    return { ok: false, error: `Error al aplicar operaciones: ${aplicar.error}`, proyectoId };
  }

  // 5. Exportar filas
  const fmt = formato || "csv";
  const exportar = await exportarFilas(cfg, proyectoId, fmt);
  if (!exportar.ok) {
    await borrarProyecto(cfg, proyectoId);
    return { ok: false, error: `Error al exportar: ${exportar.error}`, proyectoId };
  }

  // 6. Borrar proyecto siempre (aunque todo haya funcionado)
  await borrarProyecto(cfg, proyectoId);

  return {
    ok: true,
    proyectoId,
    datosExportados: exportar.data as Blob,
  };
}