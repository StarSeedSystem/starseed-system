// Smoke test de FEDERACIÓN (Adenda 107/108): peer-pull, hops++, saltos, cuarentena.
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";
const SERVER = "docs/examples/starseed-mesh-server/index.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  OK ", m); } else { fail++; console.log("  XX ", m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// boot: acumula stdout+stderr en `logs` para poder observar avisos (cuarentena).
async function boot(port, env) {
  const p = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port), ...env }, stdio: ["ignore", "pipe", "pipe"] });
  p.logs = "";
  p.stdout.on("data", (d) => { p.logs += String(d); });
  p.stderr.on("data", (d) => { p.logs += String(d); });
  await new Promise((res) => { const t = setInterval(() => { if (p.logs.includes("mesh server")) { clearInterval(t); res(); } }, 50); setTimeout(() => { clearInterval(t); res(); }, 1500); });
  return p;
}
function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function makeSigned(body) {
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const sig = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, bytes);
  return { v: 1, b: body, s: b64url(sig), k: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, f: "id:test" };
}
const post = (port, body) => fetch(`http://localhost:${port}/mesh/public`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function main() {
  // ── Escenario 1: federación básica + hops ──
  const A = await boot(8811, {});
  const B = await boot(8812, { STARSEED_PEERS: "http://localhost:8811", STARSEED_FEDERATE_MS: "1000", STARSEED_MAX_HOPS: "2" });
  await post(8811, { device_id: "dev-a", envelope: { body: { text: "federa" }, oid: "fed-1", at: Date.now() } });
  await sleep(2500);
  let r = await fetch("http://localhost:8812/mesh/public?since=0"); let j = await r.json();
  const fed = j.items.find((i) => i.oid === "fed-1");
  ok(!!fed, "B recibió el item de A por federación");
  ok(fed?.hops === 1, "item federado llega con hops=1 (origen 0 + 1 salto)");
  const rA = await fetch("http://localhost:8811/mesh/public?since=0"); const jA = await rA.json();
  ok(jA.items.every((i) => (i.hops || 0) === 0), "A (sin peers) mantiene sus items en hops=0");
  A.kill(); B.kill();

  // ── Escenario 2: cuarentena de un par que reenvía firmas inválidas (VERIFY) ──
  // C sirve contenido SIN firma; D federa de C en modo VERIFY con umbral bajo.
  const C = await boot(8813, {});
  const D = await boot(8814, { STARSEED_PEERS: "http://localhost:8813", STARSEED_FEDERATE_MS: "700", STARSEED_VERIFY: "1", STARSEED_PEER_MAX_BAD: "2", STARSEED_PEER_QUARANTINE_MS: "10000" });
  // 4 ítems SIN firma en C → en VERIFY, D los cuenta como "malos" (4 - 0 > 2 → cuarentena).
  for (let i = 0; i < 4; i++) await post(8813, { device_id: "dev-c", envelope: { body: { text: `plano ${i}` }, oid: `bad-${i}`, at: Date.now() + i } });
  await sleep(1600); // ≥2 ciclos de federación de D
  ok(/cuarentena/i.test(D.logs), "D pone en cuarentena al par con firmas inválidas");
  r = await fetch("http://localhost:8814/mesh/public?since=0"); j = await r.json();
  ok(j.items.length === 0, "D no federó contenido sin firma (VERIFY lo descarta)");
  // Nuevo ítem VÁLIDO (firmado) en C: como C está en cuarentena, D no lo trae durante el enfriamiento.
  const signed = await makeSigned({ text: "válido pero en cuarentena" });
  await post(8813, { device_id: "dev-c", envelope: { body: signed, oid: "good-late", at: Date.now() + 100 } });
  await sleep(1600);
  r = await fetch("http://localhost:8814/mesh/public?since=0"); j = await r.json();
  ok(!j.items.some((i) => i.oid === "good-late"), "par en cuarentena: ni su contenido válido llega hasta que expira");
  C.kill(); D.kill();

  // ── Escenario 3: descubrimiento de pares (PEX, Adenda 116) ──
  // A conoce a C. B conoce a A y hace PEX → debe descubrir a C por la lista /peers de A.
  const cUrl = "http://localhost:8823";
  const aUrl = "http://localhost:8821";
  const Ap = await boot(8821, { STARSEED_PEERS: cUrl, STARSEED_FEDERATE_MS: "5000" });
  const Cp = await boot(8823, {});
  const Bp = await boot(8822, { STARSEED_PEERS: aUrl, STARSEED_PEX: "1", STARSEED_MAX_PEERS: "8", STARSEED_FEDERATE_MS: "700", STARSEED_SELF_URL: "http://localhost:8822" });
  await sleep(1800); // deja correr ciclos de federación + PEX de B
  r = await fetch("http://localhost:8822/peers"); j = await r.json();
  ok(Array.isArray(j.peers) && j.peers.includes(aUrl), "B mantiene su par inicial (A)");
  ok(j.peers.some((p) => p.replace(/\/$/, "") === cUrl), "B descubrió a C por PEX (desde /peers de A)");
  Ap.kill(); Bp.kill(); Cp.kill();

  console.log(`\n${pass} pasan / ${fail} fallan`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
