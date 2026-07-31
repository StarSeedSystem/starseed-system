/**
 * Tests del registro y recomendador de integraciones (Adenda 110).
 * Ejecuta: npx tsx scripts/test-integration-registry.ts
 */
import {
  INTEGRATIONS,
  CATEGORIES,
  OS_SYSTEMS,
  integrationsByCategory,
  topFor,
  isDirectlyIntegrable,
  integrationById,
} from "../src/lib/integrations/integration-registry";
import {
  pickForCategory,
  recommendAll,
  recommendBySystem,
  summarizeRegistry,
} from "../src/lib/integrations/integration-recommend";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}

function main() {
  // Integridad estructural
  const ids = INTEGRATIONS.map((i) => i.id);
  check("sin ids de integración duplicados", new Set(ids).size === ids.length);
  check("todas las categorías referenciadas existen", INTEGRATIONS.every((i) => CATEGORIES.some((c) => c.id === i.category)));
  check("toda categoría tiene ≥1 integración", CATEGORIES.every((c) => integrationsByCategory(c.id).length >= 1));
  check("toda categoría tiene como mucho 1 top", CATEGORIES.every((c) => integrationsByCategory(c.id).filter((i) => i.top).length <= 1));
  check("toda categoría resuelve un topFor", CATEGORIES.every((c) => !!topFor(c.id)));
  check("todos los sistemas de categoría son válidos", CATEGORIES.every((c) => OS_SYSTEMS.some((s) => s.id === c.system)));
  check("todas las URLs son https", INTEGRATIONS.every((i) => i.url.startsWith("https://")));
  check("todos los campos clave presentes", INTEGRATIONS.every((i) => !!i.id && !!i.name && !!i.purpose && !!i.license && !!i.why && !!i.security));
  check("registro amplio (>55 opciones)", INTEGRATIONS.length > 55);
  check("cubre los 7 sistemas del OS", OS_SYSTEMS.length === 7 && new Set(CATEGORIES.map((c) => c.system)).size === 7);

  // Clasificación de licencia
  check("isDirectlyIntegrable: MIT sí", isDirectlyIntegrable(integrationById("ollama")!));
  check("isDirectlyIntegrable: AGPL no", !isDirectlyIntegrable(integrationById("decidim")!));
  check("isDirectlyIntegrable: no-comercial no", !isDirectlyIntegrable(integrationById("xtts-v2")!));

  // Recomendador por defecto
  const all = recommendAll();
  check("recommendAll: una recomendación por categoría", all.length === CATEGORIES.length);
  check("recommendAll: cada pick es válido", all.every((p) => !!p.pick && p.pick.category === p.category.id));
  check("por defecto respeta el top (búsqueda → Meilisearch)", pickForCategory("search")!.pick.id === "meilisearch");
  check("por defecto respeta el top (voz clon → Chatterbox)", pickForCategory("voice-clone")!.pick.id === "chatterbox");

  // Preferencia permisiva: almacenamiento top Garage (AGPL) → cambia a SeaweedFS (Apache)
  const storageDefault = pickForCategory("storage");
  const storagePermissive = pickForCategory("storage", { preferPermissive: true });
  check("storage por defecto = Garage (AGPL)", storageDefault!.pick.id === "garage");
  check("storage permisivo cambia a opción integrable", isDirectlyIntegrable(storagePermissive!.pick));
  check("storage permisivo abandona Garage (AGPL)", storagePermissive!.pick.id !== "garage");
  check("storage permisivo elige opción permisiva conocida", ["seaweedfs", "syncthing", "helia-ipfs"].includes(storagePermissive!.pick.id));
  check("storage permisivo deja nota explicativa", !!storagePermissive!.note);

  // Preferencia local: en TTS, la opción local/navegador se mantiene o sube
  const ttsLocal = pickForCategory("tts", { preferLocal: true });
  check("tts preferLocal es local/navegador", ttsLocal!.pick.access === "local" || ttsLocal!.pick.access === "browser");

  // Por sistema
  const ia = recommendBySystem("ia");
  check("recommendBySystem(ia) devuelve varias categorías", ia.length >= 5);
  check("recommendBySystem(ia): todas del sistema ia", ia.every((p) => p.category.system === "ia"));

  // Resumen
  const s = summarizeRegistry();
  check("resumen: total coincide", s.total === INTEGRATIONS.length);
  check("resumen: 7 sistemas", s.systems === 7);
  check("resumen: mayoría permisivas (>0.5)", s.permissiveShare > 0.5);
  check("resumen: cuenta usados en StarSeed > 0", s.usedInStarSeed > 0);

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
