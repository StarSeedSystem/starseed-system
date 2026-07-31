/**
 * Tests del gestor de descargas + registro de modelos propios (Adenda 113).
 * Ejecuta: npx tsx scripts/test-model-downloads.ts
 */
import {
  downloadLabel, _ingest, downloadTasksSnapshot, taskFor, lastCompletedDownload, DOWNLOADABLE,
} from "../src/ai/astraura/model-downloads";
import {
  addCustomModel, listCustomModels, customModelsByKind, updateCustomModel, removeCustomModel,
} from "../src/ai/astraura/custom-models";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}

function main() {
  // Etiquetas + fuentes descargables
  check("downloadLabel conoce webllm", downloadLabel("webllm").includes("WebLLM"));
  check("downloadLabel desconocido → id", downloadLabel("zzz") === "zzz");
  check("DOWNLOADABLE incluye chrome-ai", (DOWNLOADABLE as readonly string[]).includes("chrome-ai"));

  // Ciclo de una descarga: progreso → hecho
  _ingest({ sourceId: "webllm", pct: 0, label: "Preparando…" });
  check("tarea creada en estado downloading", taskFor("webllm")?.state === "downloading");
  _ingest({ sourceId: "webllm", pct: 42 });
  check("progreso actualizado (42%)", taskFor("webllm")?.pct === 42);
  _ingest({ sourceId: "webllm", done: true });
  check("al terminar → estado done", taskFor("webllm")?.state === "done");
  check("al terminar → pct 100", taskFor("webllm")?.pct === 100);
  check("lastCompleted ok = true", lastCompletedDownload()?.ok === true && lastCompletedDownload()?.sourceId === "webllm");

  // Descarga con error
  _ingest({ sourceId: "smollm3-webgpu", pct: 10 });
  _ingest({ sourceId: "smollm3-webgpu", done: true, error: "sin espacio" });
  check("error → estado error", taskFor("smollm3-webgpu")?.state === "error");
  check("error → lastCompleted ok false", lastCompletedDownload()?.ok === false && lastCompletedDownload()?.error === "sin espacio");

  // pct fuera de rango se acota
  _ingest({ sourceId: "sipp-local", pct: 250 });
  check("pct acotado a 100", taskFor("sipp-local")?.pct === 100);
  _ingest({ sourceId: "sipp-local", pct: -5 });
  check("pct acotado a 0", taskFor("sipp-local")?.pct === 0);

  // Snapshot ordenado (más reciente primero) y sin sourceId no crea tarea
  const snap = downloadTasksSnapshot();
  check("snapshot devuelve las tareas", snap.length >= 3);
  _ingest({ pct: 5 } as any);
  check("evento sin sourceId no crea tarea", downloadTasksSnapshot().length === snap.length);

  // ── Modelos propios ──
  const before = listCustomModels().length;
  const local = addCustomModel({ name: "Mi Ollama", kind: "llm", access: "local", endpoint: "http://localhost:11434", model: "llama3.2" });
  const api = addCustomModel({ name: "Mi API", kind: "llm", access: "api", endpoint: "https://api.example.com", apiKeyRef: "MI_CLAVE", model: "gpt-x" });
  const mcp = addCustomModel({ name: "Mi MCP voz", kind: "voice", access: "mcp", mcpServer: "voz-mcp" });
  check("añade 3 modelos propios", listCustomModels().length === before + 3);
  check("acceso local guardado", local.access === "local" && local.endpoint === "http://localhost:11434");
  check("acceso api guardado", api.access === "api" && api.apiKeyRef === "MI_CLAVE");
  check("acceso mcp guardado", mcp.access === "mcp" && mcp.mcpServer === "voz-mcp");
  check("filtra por tipo voz", customModelsByKind("voice").some((m) => m.id === mcp.id) && !customModelsByKind("voice").some((m) => m.id === local.id));

  // Acceso inválido → local; kind inválido → llm
  const weird = addCustomModel({ name: "Raro", kind: "zzz" as any, access: "zzz" as any });
  check("acceso inválido cae a local", weird.access === "local");
  check("kind inválido cae a llm", weird.kind === "llm");

  // Update + remove
  updateCustomModel(local.id, { model: "qwen2.5" });
  check("update aplica el patch", listCustomModels().find((m) => m.id === local.id)?.model === "qwen2.5");
  removeCustomModel(local.id); removeCustomModel(api.id); removeCustomModel(mcp.id); removeCustomModel(weird.id);
  check("remove limpia los añadidos", listCustomModels().length === before);

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
