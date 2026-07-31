/**
 * Tests de la lógica de inicio/actualizaciones (Adenda 111).
 * Ejecuta: npx tsx scripts/test-startup-updates.ts
 */
import {
  catalogIds, catalogSignature, getStartupState, setStartupState, shouldShowUpdates,
  updateReason, markUpdatesSeen, snoozeUpdates, newIntegrationsSince, newModelIdsSince, DEFAULT_STARTUP,
} from "../src/lib/astraura/startup-updates";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}

function reset() {
  setStartupState({ firstRunDone: false, lastSig: undefined, lastCatalog: undefined, snoozeUntil: 0, autoUpdate: true, strategy: "auto" });
}

function main() {
  // Firma y catálogo
  const sig1 = catalogSignature();
  check("firma determinista", sig1 === catalogSignature());
  const ids = catalogIds();
  check("catalogIds prefijados (L:/V:/I:)", ids.some((x) => x.startsWith("L:")) && ids.some((x) => x.startsWith("V:")) && ids.some((x) => x.startsWith("I:")));
  check("catálogo amplio (>90 ids)", ids.length > 90);

  // Estado por defecto
  reset();
  const st = getStartupState();
  check("por defecto autoUpdate ON", st.autoUpdate === true);
  check("por defecto estrategia auto", st.strategy === "auto");

  // Primera vez → debe mostrarse
  check("primera vez → shouldShow true", shouldShowUpdates() === true);
  check("motivo primera vez", updateReason() === "primera-vez");

  // Snooze suprime aunque sea primera vez
  reset();
  snoozeUpdates(60_000);
  check("snooze suprime la ventana", shouldShowUpdates(Date.now()) === false);
  check("tras el snooze vuelve a mostrarse", shouldShowUpdates(Date.now() + 61_000) === true);

  // Marcar visto → no reaparece; motivo al día
  reset();
  markUpdatesSeen({ autoUpdate: false, strategy: "local" });
  check("tras visto → shouldShow false", shouldShowUpdates() === false);
  check("tras visto → motivo al-día", updateReason() === "al-dia");
  check("visto guarda lastSig = firma actual", getStartupState().lastSig === catalogSignature());
  check("preferencias guardadas (autoUpdate false)", getStartupState().autoUpdate === false);
  check("preferencias guardadas (estrategia local)", getStartupState().strategy === "local");

  // Simular catálogo cambiado (lastSig viejo) → reaparece con motivo novedades
  setStartupState({ lastSig: "viejo-000" });
  check("catálogo cambiado → shouldShow true", shouldShowUpdates() === true);
  check("catálogo cambiado → motivo novedades", updateReason() === "novedades");

  // Novedades: si lastCatalog omite una integración, aparece como nueva
  const someIntegrationId = ids.find((x) => x.startsWith("I:"))!.slice(2);
  const withoutOne = catalogIds().filter((x) => x !== "I:" + someIntegrationId);
  setStartupState({ firstRunDone: true, lastCatalog: withoutOne });
  const news = newIntegrationsSince();
  check("newIntegrationsSince detecta la integración omitida", news.some((i) => i.id === someIntegrationId));
  check("newIntegrationsSince no infla (solo la omitida)", news.length === 1);

  // Nuevos modelos: si lastCatalog omite un modelo, aparece
  const someModel = ids.find((x) => x.startsWith("L:"))!;
  setStartupState({ firstRunDone: true, lastCatalog: catalogIds().filter((x) => x !== someModel) });
  check("newModelIdsSince detecta el modelo omitido", newModelIdsSince().includes(someModel));

  // Primera ejecución: sin lastCatalog no reporta falsas novedades
  reset();
  check("primera vez: sin novedades falsas (integraciones)", newIntegrationsSince().length === 0);
  check("primera vez: sin novedades falsas (modelos)", newModelIdsSince().length === 0);

  reset();
  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
