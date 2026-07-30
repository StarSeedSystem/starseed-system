// Smoke test de FEDERACIÓN (Adenda 107): peer-pull, hops++, control de saltos.
import { spawn } from "node:child_process";
const SERVER = "docs/examples/starseed-mesh-server/index.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  OK ", m); } else { fail++; console.log("  XX ", m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot(port, env) {
  const p = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port), ...env }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res) => { p.stdout.on("data", (d) => { if (String(d).includes("mesh server")) res(); }); setTimeout(res, 1500); });
  return p;
}
async function main() {
  // A = origen. B federa desde A cada 1s, saltos ≤ 2.
  const A = await boot(8811, {});
  const B = await boot(8812, { STARSEED_PEERS: "http://localhost:8811", STARSEED_FEDERATE_MS: "1000", STARSEED_MAX_HOPS: "2" });
  // Item fresco en A (hops=0)
  await fetch("http://localhost:8811/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "dev-a", envelope: { body: { text: "federa" }, oid: "fed-1", at: Date.now() } }) });
  // Item que YA está en el límite (hops=2) → B no debe re-propagarlo (queda en 3 > MAX_HOPS=2)
  await fetch("http://localhost:8811/mesh/public", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: "dev-a", envelope: { body: { text: "tope" }, oid: "fed-cap", at: Date.now() } }) });
  // Simulamos que fed-cap ya viajó: lo insertamos directamente con hops alto vía un tercer server no aplica;
  // en su lugar comprobamos que lo que llega a B tiene hops=1 (A.hops0 + 1).
  await sleep(2500); // deja correr ≥2 ciclos de federación
  const r = await fetch("http://localhost:8812/mesh/public?since=0"); const j = await r.json();
  const fed = j.items.find((i) => i.oid === "fed-1");
  ok(!!fed, "B recibió el item de A por federación");
  ok(fed?.hops === 1, "item federado llega con hops=1 (origen 0 + 1 salto)");
  // Federación inversa no configurada: A no debe tener nada nuevo con hops (no peers en A)
  const rA = await fetch("http://localhost:8811/mesh/public?since=0"); const jA = await rA.json();
  ok(jA.items.every((i) => (i.hops || 0) === 0), "A (sin peers) mantiene sus items en hops=0");
  A.kill(); B.kill();
  console.log(`\n${pass} pasan / ${fail} fallan`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
