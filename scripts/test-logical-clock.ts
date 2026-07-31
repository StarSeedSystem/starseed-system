/**
 * Tests del reloj lógico de Lamport (Adenda 115).
 * Ejecuta: npx tsx scripts/test-logical-clock.ts
 */
import { tick, observe, current, compareLamport, _reset } from "../src/ai/astraura/mesh/logical-clock";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}

function main() {
  _reset(0);
  check("tick incrementa (1)", tick() === 1);
  check("tick incrementa (2)", tick() === 2);
  check("current no incrementa", current() === 2 && current() === 2);

  // observe = max(local, remoto) + 1
  check("observe(10) → 11", observe(10) === 11);
  check("observe(5) < local → 12", observe(5) === 12);
  check("observe negativo se trata como 0", observe(-3) === 13);
  check("observe(NaN) se trata como 0", observe(Number.NaN) === 14);
  check("tras observe, tick sigue desde ahí", tick() === 15);

  // Orden causal
  const items = [
    { lc: 3, at: 100 },
    { lc: 1, at: 999 },
    { lc: 2, at: 50 },
    { lc: 2, at: 10 }, // mismo lc → desempata por at
  ];
  const sorted = [...items].sort(compareLamport);
  check("ordena por lc ascendente", sorted[0].lc === 1 && sorted[3].lc === 3);
  check("desempate por at con mismo lc", sorted[1].at === 10 && sorted[2].at === 50);

  // Sin lc va primero (lc tratado como -1)
  const withMissing = [{ lc: 5, at: 1 }, { at: 2 } as { lc?: number; at: number }];
  const s2 = [...withMissing].sort(compareLamport);
  check("ítems sin lc se ordenan antes", s2[0].lc === undefined);

  // Persistencia lógica: reset baja el contador
  _reset(100);
  check("reset fija el valor", current() === 100 && tick() === 101);

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
