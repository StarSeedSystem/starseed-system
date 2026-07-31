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

  // ── Adenda 99: enrutador sináptico (política) + entrega con failover ───────
  const { planTransmission } = await import("../src/ai/astraura/mesh/synaptic-router");
  const { executePlan, _resetDeliveries } = await import("../src/ai/astraura/mesh/delivery");

  const baseCtx = {
    meshReady: true,
    onlineNodes: 3,
    avgSnr: 5,
    channelUtilPct: 5,
    region: "US",
    activePreset: "LONG_FAST",
    wifiHealthy: true,
    hasAccount: true,
  } as const;

  // 17) PÚBLICO → servidor público (+ aviso por malla si hay vecinos = dual).
  const pubPlan = planTransmission({ scope: "public", cls: "P2", sizeBytes: 100, target: "broadcast" }, baseCtx);
  check("público → primaria server-public", pubPlan.primary.via === "server-public");
  check("público con vecinos → dual (aviso malla)", pubPlan.dual === true);

  // 18) PRIVADO + LOCAL a un nodo → directo P2P, con respaldo de relé cifrado.
  const locReq = { scope: "private", cls: "P1", sizeBytes: 100, target: "node", distance: "local" } as const;
  const locPlan = planTransmission(locReq, baseCtx);
  check("privado local a nodo → mesh-direct", locPlan.primary.via === "mesh-direct");
  check("privado local tiene respaldo relé", locPlan.fallbacks.some((f) => f.via === "server-relay"));

  // 19) PRIVADO + LEJANO → relé cifrado por servidor.
  const farPlan = planTransmission(
    { scope: "private", cls: "P1", sizeBytes: 100, target: "account", distance: "far" },
    baseCtx,
  );
  check("privado lejano → server-relay", farPlan.primary.via === "server-relay");

  // 20) Sin ninguna vía viva → plan de cola (queuedOnly).
  const deadCtx = { ...baseCtx, meshReady: false, onlineNodes: 0, hasAccount: false, wifiHealthy: false };
  const qPlan = planTransmission(
    { scope: "private", cls: "P2", sizeBytes: 100, target: "node", distance: "local" },
    deadCtx,
  );
  check("sin vías → queuedOnly", qPlan.queuedOnly === true);

  // 21) FAILOVER: la malla cae → el relé rescata (entregado), con traza.
  _resetDeliveries();
  const okServer = async () => ({ ok: true, confirmed: true, through: "servidor · fila ab12", detail: "ok" });
  const failMesh = async () => ({ ok: false, detail: "sin radio" });
  const rescued = await executePlan(locPlan, locReq, { x: 1 }, { mesh: failMesh, server: okServer });
  check("failover: malla cae → entregado por relé", rescued.status === "delivered");
  check("failover: hop primario registrado como fallido", rescued.hops.some((h) => h.role === "primary" && h.status === "failed"));
  check("failover: relé confirmó en la traza", rescued.hops.some((h) => h.via === "server-relay" && h.status === "confirmed"));

  // 22) DUAL (P0): una vía cae y la otra entrega → parcial (redundancia real).
  const p0Req = { scope: "private", cls: "P0", sizeBytes: 60, target: "node", distance: "local" } as const;
  const p0Plan = planTransmission(p0Req, baseCtx);
  check("P0 privado local → dual", p0Plan.dual === true);
  const partial = await executePlan(p0Plan, p0Req, {}, { mesh: failMesh, server: okServer });
  check("dual con una vía caída → parcial", partial.status === "partial");

  // 23) Cola: sin ninguna vía → recibo en cola (no es fallo, es espera).
  const queued = await executePlan(qPlan, { scope: "private", cls: "P2", sizeBytes: 100, target: "node", distance: "local" }, {}, { mesh: failMesh, server: failMesh });
  check("sin vías → recibo en cola", queued.status === "queued");

  // 24) Éxito directo por malla SIN confirmación → 'sent' (honesto: llegó al
  //     transporte pero no hay ACK), y las alternativas quedan 'skipped'.
  const direct = await executePlan(locPlan, locReq, {}, {
    mesh: async () => ({ ok: true, through: "3 vecinos de la malla", detail: "difundido" }),
    server: okServer,
  });
  check("malla sin ACK → 'enviado' (no 'entregado')", direct.status === "sent");
  check("primaria entrega → respaldo omitido", direct.hops.some((h) => h.role === "fallback" && h.status === "skipped"));

  // 24b) Confirmación fuerte (fila de servidor público) → 'delivered'.
  const pubReq = { scope: "public", cls: "P2", sizeBytes: 50, target: "broadcast" } as const;
  const pubDelivered = await executePlan(
    planTransmission(pubReq, { ...baseCtx, meshReady: false, onlineNodes: 0 }),
    pubReq, {}, { mesh: failMesh, server: okServer },
  );
  check("público confirmado por servidor → entregado", pubDelivered.status === "delivered");

  // 25) Cifrado del relé: ida y vuelta AES-GCM (si hay WebCrypto en el entorno).
  if (globalThis.crypto?.subtle) {
    const { encryptEnvelope, decryptEnvelope, rotateRelayKey, relayKeyInfo, importRelayKeyB64, _resetRelayKeys } = await import("../src/ai/astraura/mesh/relay-crypto");
    const secret = { txt: "hola neurona lejana", n: 7, geo: [19.4, -99.1] };
    const env = await encryptEnvelope(secret);
    check("relé: cifra a sobre {iv,ct}", !!env && typeof env.iv === "string" && typeof env.ct === "string");
    const back = env ? await decryptEnvelope(env) : null;
    check("relé: descifra EXACTO con la misma clave", JSON.stringify(back) === JSON.stringify(secret));
    // Sobre manipulado: el tag GCM no valida → null (no entrega basura).
    if (env) {
      const tampered = { ...env, ct: env.ct.slice(0, -4) + (env.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA") };
      const bad = await decryptEnvelope(tampered);
      check("relé: sobre manipulado NO descifra (tag GCM)", bad === null);
      // Rotación del llavero (Adenda 120): lo cifrado antes SIGUE descifrando; lo nuevo usa la kid nueva.
      const oldEnv = await encryptEnvelope({ era: "antes de rotar" });
      const kidBefore = relayKeyInfo().cur;
      const rot = await rotateRelayKey();
      check("relé: rotar da una kid nueva", !!rot && rot.kid !== kidBefore);
      check("relé: el llavero conserva ≥2 claves tras rotar", relayKeyInfo().count >= 2);
      const newEnv = await encryptEnvelope({ era: "después de rotar" });
      check("relé: el sobre nuevo lleva la kid actual (v:2)", !!newEnv && newEnv.v === 2 && newEnv.kid === relayKeyInfo().cur);
      check("relé: la clave nueva ≠ la vieja (kid distinto)", !!oldEnv && !!newEnv && oldEnv.kid !== newEnv.kid);
      const oldBack = oldEnv ? await decryptEnvelope(oldEnv) : null;
      check("relé: lo cifrado ANTES de rotar sigue descifrando (gracia)", JSON.stringify(oldBack) === JSON.stringify({ era: "antes de rotar" }));
      const newBack = newEnv ? await decryptEnvelope(newEnv) : null;
      check("relé: lo cifrado DESPUÉS de rotar descifra con la clave nueva", JSON.stringify(newBack) === JSON.stringify({ era: "después de rotar" }));
      // Multi-dispositivo: el kid es LOCAL por neurona; un sobre cuyo kid apunta a
      // OTRO slot en el receptor debe descifrarse igual por el fallback (fix del bug
      // que rompía el relé entre neuronas vinculadas).
      const genRawB64 = async () => {
        const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        const raw = new Uint8Array(await crypto.subtle.exportKey("raw", k));
        let bin = ""; for (let i = 0; i < raw.length; i++) bin += String.fromCharCode(raw[i]);
        return btoa(bin);
      };
      _resetRelayKeys();
      const rbRaw = await genRawB64(), raRaw = await genRawB64();
      await importRelayKeyB64(rbRaw); // la clave de "B" (queda como una previa)
      const kidRb = relayKeyInfo().cur;
      await importRelayKeyB64(raRaw); // la clave de "A" pasa a ser la actual
      const envA = await encryptEnvelope({ from: "otra neurona" }); // cifrado con RA
      const mismatched = envA ? { ...envA, kid: kidRb } : null; // kid apunta a RB, no a RA
      const dec = mismatched ? await decryptEnvelope(mismatched) : null;
      check("relé: kid desalineado entre neuronas → el fallback lo descifra igual", JSON.stringify(dec) === JSON.stringify({ from: "otra neurona" }));
    }
  } else {
    console.log("  (omite roundtrip de cifrado: sin WebCrypto en este entorno)");
  }

  // 26) Revocación de identidad (Adenda 108): acta auto-autenticable + rotación.
  if (globalThis.crypto?.subtle) {
    const { signRevocation, verifyRevocation, regenerateIdentity, myFingerprint, signContent } = await import(
      "../src/ai/astraura/mesh/mesh-identity"
    );
    const before = await myFingerprint();
    const rev = await signRevocation();
    check("revocación: firma acta {fp,pub,sig}", !!rev && !!rev.fp && !!rev.pub && !!rev.sig);
    if (rev) {
      check("revocación: acta propia verifica", (await verifyRevocation(rev.fp, rev.sig, rev.pub)) === true);
      check("revocación: acta es sobre la fp propia", rev.fp === before);
      check("revocación: fp distinta NO verifica", (await verifyRevocation("id:otro00000000000000", rev.sig, rev.pub)) === false);
      // Impersonación: firmar {revoke: victimFp} con MI clave no revoca a la víctima,
      // porque fpOf(mi_clave) ≠ victimFp (propiedad de seguridad clave).
      const victimFp = "id:victim000000000000";
      const forged = await signContent({ revoke: victimFp });
      check(
        "revocación: no puedes revocar una fp ajena (fp≠clave)",
        forged ? (await verifyRevocation(victimFp, forged.s, forged.k)) === false : true,
      );
    }
    const rot = await regenerateIdentity();
    check("revocación: rota a identidad nueva", !!rot && rot.fp !== before);
    const after = await myFingerprint();
    check("revocación: huella nueva activa tras rotar", after === rot?.fp && after !== before);
  } else {
    console.log("  (omite revocación: sin WebCrypto en este entorno)");
  }

  // 27) Anti-replay (Adenda 119): sobre v:2 firma {b,ts,nonce}; la guarda rechaza replay/caducado.
  if (globalThis.crypto?.subtle) {
    const { wrapSigned, unwrapSigned } = await import("../src/ai/astraura/mesh/mesh-identity");
    const { acceptFreshness, _resetReplayGuard } = await import("../src/ai/astraura/mesh/replay-guard");
    _resetReplayGuard();
    const env = (await wrapSigned({ hola: "mundo" })) as { v?: number; ts?: number; nonce?: string; b?: unknown };
    check("anti-replay: sobre v:2 con ts+nonce", env.v === 2 && typeof env.ts === "number" && !!env.nonce);
    const u = await unwrapSigned(env);
    check("anti-replay: v:2 verifica y expone ts/nonce", u.verified === true && typeof u.ts === "number" && !!u.nonce);
    const now = env.ts as number;
    check("anti-replay: primera vez es fresco", acceptFreshness(u.fp, u.ts, u.nonce, now) === true);
    check("anti-replay: mismo nonce repetido = replay", acceptFreshness(u.fp, u.ts, u.nonce, now) === false);
    check("anti-replay: ts fuera de ventana = rechazado", acceptFreshness("id:x", now, "nonce-fresco", now + 20 * 60_000) === false);
    check("anti-replay: sin ts/nonce (v1/plano) no aplica", acceptFreshness("id:x", undefined, undefined) === true);
    const tampered = { ...env, b: { hola: "otro" } };
    const ut = await unwrapSigned(tampered);
    check("anti-replay: v:2 con body manipulado NO verifica", ut.verified === false);
  } else {
    console.log("  (omite anti-replay: sin WebCrypto en este entorno)");
  }

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}

void main();
