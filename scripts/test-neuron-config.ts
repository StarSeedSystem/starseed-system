/**
 * Tests de logs por neurona + prueba de modelos propios (Adenda 114).
 * Ejecuta: npx tsx scripts/test-neuron-config.ts
 */
import {
  logNeuron, getNeuronLogs, clearNeuronLogs, MAX_LOGS_PER_NEURON,
} from "../src/lib/neurons/neuron-logs";
import { probeCustomModel, type CustomModel } from "../src/ai/astraura/custom-models";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}

function mk(access: CustomModel["access"], patch: Partial<CustomModel> = {}): CustomModel {
  return { id: "x", name: "M", kind: "llm", access, at: 0, ...patch };
}

async function main() {
  const A = "neuron-A";
  const B = "neuron-B";
  clearNeuronLogs(A); clearNeuronLogs(B);

  // Registro básico + orden (más reciente primero)
  logNeuron(A, "info", "arranque");
  logNeuron(A, "sync", "sincronizó cerebros");
  logNeuron(A, "server", "ofreciendo internet público");
  const la = getNeuronLogs(A);
  check("registra 3 eventos", la.length === 3);
  check("más reciente primero", la[0].msg === "ofreciendo internet público");
  check("conserva el nivel", la[0].level === "server");

  // Aislamiento entre neuronas
  logNeuron(B, "net", "conectada");
  check("neuronas aisladas (B tiene 1)", getNeuronLogs(B).length === 1 && getNeuronLogs(A).length === 3);

  // Buffer circular acotado
  clearNeuronLogs(A);
  for (let i = 0; i < MAX_LOGS_PER_NEURON + 30; i++) logNeuron(A, "info", `evento ${i}`);
  const capped = getNeuronLogs(A);
  check("acota al máximo por neurona", capped.length === MAX_LOGS_PER_NEURON);
  check("descarta los más viejos", capped[0].msg === `evento ${MAX_LOGS_PER_NEURON + 30 - 1}` && !capped.some((e) => e.msg === "evento 0"));

  // Limpieza
  clearNeuronLogs(A);
  check("limpia la bitácora", getNeuronLogs(A).length === 0);

  // Entradas inválidas ignoradas
  logNeuron("", "info", "sin id");
  logNeuron(A, "info", "");
  check("ignora deviceId o msg vacíos", getNeuronLogs(A).length === 0);

  // ── Prueba de modelos propios (ramas sin red) ──
  const r1 = await probeCustomModel(mk("mcp", {}));
  check("MCP sin servidor → falla con mensaje", r1.ok === false && /MCP/.test(r1.msg));
  const r2 = await probeCustomModel(mk("api", {}));
  check("API sin endpoint → falla con mensaje", r2.ok === false && /endpoint/i.test(r2.msg));
  const r3 = await probeCustomModel(mk("mcp", { mcpServer: "voz-mcp" }));
  check("MCP con nombre (no URL) → registrado", r3.ok === true && /registrado/i.test(r3.msg));
  const r4 = await probeCustomModel(mk("local", {}));
  check("local sin endpoint → falla", r4.ok === false);

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
