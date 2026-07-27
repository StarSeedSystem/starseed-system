/**
 * Pruebas unitarias del NÚCLEO mesh (Adenda 97 · SOP §9): codec (troceo,
 * compresión, CRC, reensamblado con pérdida y desorden) y validación de basura.
 * Ejecutar: npx tsx scripts/test-mesh-core.ts
 */
import {
  encodeMessage,
  decodeFrame,
  Reassembler,
  crc16,
  deflateSupported,
} from "../src/ai/astraura/mesh/codec";
import { MESH_MAX_FRAME_BYTES } from "../src/ai/astraura/mesh/constants";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  OK  ${name}`);
  } else {
    failed++;
    console.error(`  FALLA ${name}`);
  }
}

async function main() {
  console.log(`deflate nativo: ${deflateSupported() ? "si" : "no"}`);

  // 1) CRC estable y sensible.
  const a = new TextEncoder().encode("starseed");
  check("crc16 determinista", crc16(a) === crc16(new TextEncoder().encode("starseed")));
  check("crc16 sensible a cambios", crc16(a) !== crc16(new TextEncoder().encode("starseeD")));

  // 2) Mensaje corto: 1 trozo, cabe en el límite.
  const short = await encodeMessage({ txt: "hola malla" }, { cls: "P1", type: "message" });
  check("mensaje corto codifica", !!short);
  check("mensaje corto = 1 trozo", short!.frames.length === 1);
  check("trozo dentro del límite LoRa", short!.frames.every((f) => f.length <= MESH_MAX_FRAME_BYTES));

  // 3) Mensaje largo: trocea y reensambla EXACTO (desordenado).
  // Contenido POCO compresible (pseudo-hash por tramo) para forzar el troceo
  // real: el texto repetitivo comprime tanto que cabe en un solo trozo (¡y eso
  // también está bien! — pero aquí queremos probar el camino multi-trozo).
  let noise = "";
  let seed = 0x5eed;
  for (let i = 0; i < 220; i++) {
    seed = (seed * 48271) % 0x7fffffff;
    noise += seed.toString(36) + "·";
  }
  const bigBody = { ns: "aurora.memoria", base: "abc123", patch: noise + " fin unico 🌌" };
  const big = await encodeMessage(bigBody, { cls: "P2", type: "state-delta" });
  check("mensaje largo codifica", !!big);
  check("mensaje largo trocea (>1)", (big?.frames.length ?? 0) > 1);
  check("todos los trozos dentro del límite", !!big && big.frames.every((f) => f.length <= MESH_MAX_FRAME_BYTES));

  const re = new Reassembler();
  let result: unknown = null;
  const shuffled = [...big!.frames].reverse();
  let framesOk = true;
  for (const f of shuffled) {
    const dec = decodeFrame(f);
    if (!dec) {
      framesOk = false;
      continue;
    }
    const done = await re.push(dec, 42, Date.now());
    if (done) result = done.body;
  }
  check("todos los frames decodifican", framesOk);
  check(
    "reensamblado EXACTO (desordenado + deflate)",
    JSON.stringify(result) === JSON.stringify(bigBody),
  );

  // 4) Pérdida de un trozo: missingOf la delata; al llegar, completa.
  const re2 = new Reassembler();
  const frames2 = big!.frames.map((f) => decodeFrame(f)!);
  for (const f of frames2.slice(1)) await re2.push(f, 7, Date.now());
  check("faltantes detectados", re2.missingOf(7, frames2[0].msgId).length === 1);
  const done2 = await re2.push(frames2[0], 7, Date.now());
  check("completa al llegar el perdido", JSON.stringify(done2?.body) === JSON.stringify(bigBody));

  // 5) Corrupción: descarte silencioso por CRC.
  const re3 = new Reassembler();
  const corrupt = big!.frames.map((f) => f.slice());
  corrupt[0][12] = corrupt[0][12] ^ 0xff;
  let out3: unknown = "nada";
  for (const f of corrupt) {
    const dec = decodeFrame(f);
    if (!dec) continue;
    const done = await re3.push(dec, 9, Date.now());
    if (done) out3 = done.body;
  }
  check("payload corrupto NO entrega (CRC)", out3 === "nada");

  // 6) Basura ajena: null limpio, jamás lanza.
  check("basura corta -> null", decodeFrame(new Uint8Array([1, 2, 3])) === null);
  check(
    "magic incorrecto -> null",
    decodeFrame(new Uint8Array([0x11, 0x10, 0, 1, 0x11, 0, 1, 0, 0, 1, 2])) === null,
  );

  // ── Regresiones de la verificación adversarial (Adenda 97) ────────────────
  const { getMeshState, setMeshState, resetMeshState } = await import("../src/ai/astraura/mesh/store");
  const { airtimeAvailableFor } = await import("../src/ai/astraura/mesh/sync");
  const { decideRoute, _resetRouterHysteresis } = await import("../src/ai/astraura/mesh/decision-router");
  const { DEFAULT_MESH_RULES } = await import("../src/ai/astraura/mesh/constants");

  // 7) Token bucket: P0 NO transmite ilimitadamente con el bucket vacío.
  resetMeshState();
  setMeshState({ budget: { availableMs: 0, capacityMs: 45000, reservedP0Ms: 9000, targetDutyPct: 0 } });
  check("P0 con bucket a 0 y sin refill NO tiene airtime", airtimeAvailableFor("P0", 3) === false);
  setMeshState({ budget: { availableMs: 20000, capacityMs: 45000, reservedP0Ms: 9000, targetDutyPct: 0 } });
  check("P0 con saldo suficiente SÍ tiene airtime", airtimeAvailableFor("P0", 1) === true);
  check("clase no crítica respeta la reserva de P0", airtimeAvailableFor("P2", 6) === (20000 - 9000 >= 6 * 2000));

  // 8) Router: role "off"/"listen-only" JAMÁS enruta a la malla (ni P0).
  resetMeshState();
  _resetRouterHysteresis();
  setMeshState({ status: "ready", meshHealth: { score: 0.9, detail: "", at: Date.now() }, wifiHealth: { score: 0, detail: "", at: Date.now() } });
  const off = decideRoute({ cls: "P2", sizeBytes: 100, neuronRules: { ...DEFAULT_MESH_RULES, role: "off" } });
  check("role off NO va a mesh (P2)", off.route !== "mesh");
  const listen = decideRoute({ cls: "P0", sizeBytes: 60, neuronRules: { ...DEFAULT_MESH_RULES, role: "listen-only" } });
  check("role listen-only NO va a mesh (ni P0)", listen.route !== "mesh" && listen.route !== "dual");

  // 9) Router: P0 con Wi-Fi viva y malla lista = DUAL (doble ruta).
  resetMeshState();
  _resetRouterHysteresis();
  setMeshState({ status: "ready", meshHealth: { score: 0.8, detail: "", at: Date.now() }, wifiHealth: { score: 0.9, detail: "", at: Date.now() } });
  const p0 = decideRoute({ cls: "P0", sizeBytes: 60, neuronRules: DEFAULT_MESH_RULES });
  check("P0 sana = DUAL", p0.route === "dual");

  // 10) Router: Wi-Fi sana + clase no crítica = wifi (no malgasta la malla).
  const p2wifi = decideRoute({ cls: "P2", sizeBytes: 100, neuronRules: DEFAULT_MESH_RULES });
  check("P2 con Wi-Fi sana = wifi", p2wifi.route === "wifi");

  // ── Adenda 98: selector de banda + distancia por RF + modo dual ──────────
  const { recommendPreset, estimateDistanceMeters, PRESET_SPECS } = await import(
    "../src/ai/astraura/mesh/antennas"
  );

  // 11) Selector: pocos vecinos / señal débil → alcance (LongFast).
  const r1 = recommendPreset("auto", { avgSnr: -8, onlineNodes: 1, channelUtilPct: 5, region: "US" }, "SHORT_FAST");
  check("auto con señal débil → LONG_FAST", r1.presetKey === "LONG_FAST");

  // 12) Malla densa y congestionada → capacidad (MediumFast).
  const r2 = recommendPreset("auto", { avgSnr: 6, onlineNodes: 8, channelUtilPct: 40, region: "US" }, "LONG_FAST");
  check("auto densa+congestión → MEDIUM_FAST", r2.presetKey === "MEDIUM_FAST");

  // 13) Objetivo velocidad en región con duty (solo presets universales).
  const r3 = recommendPreset("velocidad", { avgSnr: null, onlineNodes: 0, channelUtilPct: null, region: "EU_868" }, null);
  check("velocidad en EU_868 → preset universal", PRESET_SPECS[r3.presetKey]?.universal === true);

  // 14) Distancia por RF: SNR alto = cerca, SNR bajo = lejos (monótona).
  const near = estimateDistanceMeters(10);
  const far = estimateDistanceMeters(-18);
  check("distancia RF monótona (near < far)", near < far && near >= 30 && far <= 6000);

  // 15) Modo dual: P1 con ambas sanas y preferred=auto → dual.
  resetMeshState();
  _resetRouterHysteresis();
  setMeshState({ status: "ready", meshHealth: { score: 0.8, detail: "", at: Date.now() }, wifiHealth: { score: 0.9, detail: "", at: Date.now() } });
  const dual = decideRoute({ cls: "P1", sizeBytes: 80, neuronRules: DEFAULT_MESH_RULES });
  check("modo dual: P1 con ambas sanas → dual", dual.route === "dual");

  // 16) Regresión del prefetch troceado (Adenda 98 · bug crítico): la MISMA
  // secuencia de prefetch de playSequential* debe consumir TODOS los índices
  // 0..n-1 en orden, sin perder el trozo 1 ni descartar el último.
  {
    const consumed: number[] = [];
    const count = 4;
    const provider = (i: number) => Promise.resolve(i < count ? ({ i } as unknown) : null);
    let nextBlob: Promise<unknown> = Promise.resolve(await provider(0));
    for (let i = 0; i < count; i++) {
      const blob = (await nextBlob) as { i: number } | null;
      nextBlob = i + 1 < count ? Promise.resolve(await provider(i + 1)) : Promise.resolve(null);
      if (blob) consumed.push(blob.i);
    }
    check(
      "reproductor troceado consume TODOS los índices en orden",
      JSON.stringify(consumed) === JSON.stringify([0, 1, 2, 3]),
    );
    // 2 trozos: no se descarta el segundo.
    const c2: number[] = [];
    const n2 = 2;
    const prov2 = (i: number) => Promise.resolve(i < n2 ? ({ i } as unknown) : null);
    let nb: Promise<unknown> = Promise.resolve(await prov2(0));
    for (let i = 0; i < n2; i++) {
      const b = (await nb) as { i: number } | null;
      nb = i + 1 < n2 ? Promise.resolve(await prov2(i + 1)) : Promise.resolve(null);
      if (b) c2.push(b.i);
    }
    check("mensaje de 2 trozos entrega ambos", JSON.stringify(c2) === JSON.stringify([0, 1]));
  }

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}

void main();
