/**
 * Tests del recomendador de modelos por capacidades (Adenda 109).
 * Ejecuta: npx tsx scripts/test-model-recommend.ts
 */
import type { NeuronCapabilities } from "../src/lib/neurons/neurons";
import {
  fitFor,
  classifyDeviceTier,
  describeReq,
  runsRemotely,
  LOCAL_LLM_SPECS,
  SERVER_LLM_SPECS,
  LOCAL_VOICE_SPECS,
} from "../src/ai/astraura/model-requirements";
import { recommendModels, availableNow } from "../src/ai/astraura/model-recommend";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}

const highEnd: NeuronCapabilities = { platform: "macOS", browser: "Chrome 148", cores: 12, memoryGb: 32, webgpu: true, gpuRenderer: "Apple M3 Max", gpuVendor: "Apple", installedApp: true, ollama: true };
const midNoApp: NeuronCapabilities = { platform: "Windows", browser: "Edge 140", cores: 8, memoryGb: 16, webgpu: true, gpuRenderer: "Intel(R) Iris(R) Xe Graphics", gpuVendor: "Intel", installedApp: false };
const lowMobile: NeuronCapabilities = { platform: "Android", browser: "Chrome 148", cores: 4, memoryGb: 4, webgpu: false, gpuRenderer: "Adreno (TM) 730", installedApp: false };
const unknown: NeuronCapabilities = { platform: "Linux" };

function main() {
  // Gama del dispositivo
  check("gama alta detectada (32GB/12c/M3)", classifyDeviceTier(highEnd) === "alto");
  check("gama media detectada (16GB/8c/Iris)", classifyDeviceTier(midNoApp) === "medio");
  const lowTier = classifyDeviceTier(lowMobile);
  check("móvil 4GB → gama baja o mínima", lowTier === "bajo" || lowTier === "minimo");

  // Servidor: siempre encaja (corre en el servidor), en cualquier dispositivo
  for (const s of SERVER_LLM_SPECS) {
    check(`servidor ${s.id} → ideal en móvil`, fitFor(lowMobile, s).level === "ideal" && fitFor(lowMobile, s).fits);
    check(`servidor ${s.id} corre remoto`, runsRemotely(s));
  }

  // Local WebGPU en un dispositivo sin WebGPU → insuficiente (no ejecutable)
  const webllm = LOCAL_LLM_SPECS.find((s) => s.id === "webllm")!;
  check("WebLLM sin WebGPU → insuficiente", fitFor(lowMobile, webllm).level === "insuficiente" && !fitFor(lowMobile, webllm).fits);
  check("WebLLM en gama alta → encaja", fitFor(highEnd, webllm).fits);

  // Ollama grande necesita mucho: en gama media (16GB/no-dedicada) NO debe ser ideal
  const ollamaLarge = LOCAL_LLM_SPECS.find((s) => s.id === "ollama-large")!;
  check("Ollama 13B en 16GB/Iris no es ideal", fitFor(midNoApp, ollamaLarge).level !== "ideal");
  check("Ollama 13B en gama alta encaja", fitFor(highEnd, ollamaLarge).fits);

  // Voz ligera (Piper) encaja incluso en gama baja
  const piper = LOCAL_VOICE_SPECS.find((s) => s.id === "piper")!;
  check("Piper encaja en gama baja", fitFor(lowMobile, piper).fits);

  // Disponibilidad ahora
  check("WebLLM disponible ahora en gama alta (webgpu)", availableNow(highEnd, webllm, true));
  check("Voz local NO disponible sin app instalada", !availableNow(midNoApp, piper, false));
  check("Voz local disponible con app instalada", availableNow(highEnd, piper, true));

  // Recomendación: gama alta + app instalada → estrategia LOCAL, best local y disponible
  const rHigh = recommendModels(highEnd, { osInstalled: true, hasAccount: true });
  check("gama alta + app → estrategia local", rHigh.strategy === "local");
  check("gama alta: mejor LLM es local", !runsRemotely(rHigh.llm.best.spec));
  check("gama alta: mejor LLM disponible ahora", rHigh.llm.best.availableNow);
  check("gama alta: bestServer es StarSeed", rHigh.llm.bestServer.spec.access === "starseed");
  check("gama alta: voz best local disponible", !runsRemotely(rHigh.voz.best.spec) && rHigh.voz.best.availableNow);

  // Recomendación: gama media SIN app → estrategia SERVIDOR (best remoto)
  const rMid = recommendModels(midNoApp, { osInstalled: false, hasAccount: true });
  check("media sin app → estrategia servidor", rMid.strategy === "servidor");
  check("media sin app: mejor LLM corre remoto", runsRemotely(rMid.llm.best.spec));
  check("media sin app: best es StarSeed", rMid.llm.best.spec.access === "starseed");
  check("media: aún sugiere un bestLocal para cuando instale", !!rMid.llm.bestLocal);

  // Recomendación: móvil bajo → servidor
  const rLow = recommendModels(lowMobile, { osInstalled: false, hasAccount: true });
  check("móvil bajo → estrategia servidor", rLow.strategy === "servidor");
  check("móvil bajo: LLM best remoto", runsRemotely(rLow.llm.best.spec));

  // Capacidades desconocidas → no rompe, da una recomendación de servidor
  const rUnk = recommendModels(unknown, {});
  check("caps desconocidas → recomendación válida", !!rUnk.llm.best && !!rUnk.voz.best);
  check("caps desconocidas → servidor por defecto", rUnk.strategy === "servidor");

  // describeReq legible
  check("describeReq local menciona RAM", /GB RAM/.test(describeReq(webllm)));
  check("describeReq servidor menciona servidor", /servidor/i.test(describeReq(SERVER_LLM_SPECS[0])));

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
