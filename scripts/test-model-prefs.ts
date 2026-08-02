// scripts/test-model-prefs.ts — Tests de las preferencias unificadas de modelo (Adenda 129).
// Ejecutar: npx tsx scripts/test-model-prefs.ts
// Las funciones persisten en localStorage → shim mínimo de window ANTES de importar.
const store: Record<string, string> = {};
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  },
  dispatchEvent: () => true,
};
(globalThis as any).CustomEvent = class { constructor(public type: string, public opts?: any) {} };

import {
  getModelPreferences, saveModelPreferences, _resetModelPreferences,
  recommendedOrder, effectiveOrder, accessBias,
  llmSourceAccessClass, voiceEngineAccessClass, DEFAULT_MODEL_PREFERENCE,
} from "../src/lib/astraura/model-preferences";
import { AUTO_ENDPOINT_ORDER } from "../src/lib/aurora/tts-oss/engine-registry";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}
const eq = (a: any[], b: any[]) => JSON.stringify(a) === JSON.stringify(b);

function main() {
  _resetModelPreferences();

  // get / save
  check("default canónico", eq(getModelPreferences().order, ["local", "starseed", "api-free", "api-external"]));
  const s = saveModelPreferences({ order: ["api-free", "local", "starseed", "api-external"], mode: "fixed" });
  check("save + persiste", s.updatedAt > 0 && eq(getModelPreferences().order, s.order));

  // effectiveOrder (fixed = base; perTask; exclusiones)
  check("fixed → base tal cual", eq(effectiveOrder(), ["api-free", "local", "starseed", "api-external"]));
  saveModelPreferences({ perTask: { code: ["local", "starseed"] } });
  check("perTask(code)", eq(effectiveOrder({ task: "code" }), ["local", "starseed"]));
  check("exclusión → accessBias 0", accessBias("api-free", { task: "code" }) === 0);

  // accessBias default (auto)
  _resetModelPreferences();
  check("bias local=4/starseed=3/free=2/ext=1",
    accessBias("local") === 4 && accessBias("starseed") === 3 && accessBias("api-free") === 2 && accessBias("api-external") === 1);

  // recommendedOrder
  check("GPU alto+local → local 1º", recommendedOrder({ tier: "alto", hasLocal: true })[0] === "local");
  check("offline → local,starseed", eq(recommendedOrder({ online: false }).slice(0, 2), ["local", "starseed"]));
  check("gama baja sin local → api-free 1º", recommendedOrder({ tier: "bajo", hasLocal: false })[0] === "api-free");
  check("sin señales = canónico", eq(recommendedOrder({}), DEFAULT_MODEL_PREFERENCE.order));

  // Mapeo LLM
  check("chrome-ai/ollama-local/webllm → local",
    ["chrome-ai", "ollama-local", "webllm"].every((x) => llmSourceAccessClass(x) === "local"));
  check("ollama-CLOUD → api-free", llmSourceAccessClass("ollama-cloud") === "api-free");
  check("openrouter-free/pollinations → api-free",
    ["openrouter-free", "pollinations-text"].every((x) => llmSourceAccessClass(x) === "api-free"));
  check("openai/anthropic/xai/custom → api-external",
    ["openai-paid", "anthropic-paid", "my-xai", "custom-x"].every((x) => llmSourceAccessClass(x) === "api-external"));

  // Mapeo VOZ
  check("voxcpm/kokoro/browser → local",
    ["voxcpm", "voicebox", "bark", "gpt-sovits", "kokoro", "browser", "kitten"].every((x) => voiceEngineAccessClass(x) === "local"));
  check("omnivoice/openvoice2 → starseed",
    ["omnivoice", "openvoice2"].every((x) => voiceEngineAccessClass(x) === "starseed"));
  check("xai → api-external", voiceEngineAccessClass("xai") === "api-external");

  // Equivalencia con hoy: el reorden por sesgo con default NO cambia el orden AUTO de voz.
  const reordered = [...AUTO_ENDPOINT_ORDER]
    .map((id, i) => ({ id, i, bias: accessBias(voiceEngineAccessClass(id)) }))
    .sort((a, b) => b.bias - a.bias || a.i - b.i).map((x) => x.id);
  check("voz default = AUTO_ENDPOINT_ORDER", eq(reordered, [...AUTO_ENDPOINT_ORDER]));

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
