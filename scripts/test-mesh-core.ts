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
    check("anti-replay: primera vez es fresco", acceptFreshness(u.fp, u.ts, u.nonce, "item-A", now) === true);
    check("anti-replay: mismo nonce + MISMO id = re-entrega legítima", acceptFreshness(u.fp, u.ts, u.nonce, "item-A", now) === true);
    check("anti-replay: mismo nonce + DISTINTO id = replay", acceptFreshness(u.fp, u.ts, u.nonce, "item-B", now) === false);
    check("anti-replay: ts fuera de ventana = rechazado", acceptFreshness("id:x", now, "nonce-fresco", "item-C", now + 20 * 60_000) === false);
    check("anti-replay: sin ts/nonce (v1/plano) no aplica", acceptFreshness("id:x", undefined, undefined, "item-D") === true);
    const tampered = { ...env, b: { hola: "otro" } };
    const ut = await unwrapSigned(tampered);
    check("anti-replay: v:2 con body manipulado NO verifica", ut.verified === false);
  } else {
    console.log("  (omite anti-replay: sin WebCrypto en este entorno)");
  }

  // 28) Identidad soberana PORTÁTIL (Adenda 121): clave maestra + certificado + export/import + ANCLA de confianza.
  if (globalThis.crypto?.subtle) {
    const M = await import("../src/ai/astraura/mesh/master-identity");
    M._resetMasterKey();
    const fpA = await M.masterFingerprint();
    check("maestra: crea huella de cuenta (acct:)", !!fpA && fpA.startsWith("acct:"));
    const certA = await M.signDeviceCert("id:dispositivo0001", "acct-uuid-123");
    check("maestra: firma certificado de dispositivo", !!certA && certA.deviceFp === "id:dispositivo0001" && certA.mfp === fpA);
    check("maestra: cert válido verifica contra la maestra esperada", certA && fpA ? (await M.verifyDeviceCert(certA, fpA)) === true : false);
    if (certA && fpA) {
      check("maestra: cert manipulado (device) NO verifica", (await M.verifyDeviceCert({ ...certA, deviceFp: "id:otro" }, fpA)) === false);
      check("maestra: cert manipulado (cuenta) NO verifica", (await M.verifyDeviceCert({ ...certA, account: "acct-otra" }, fpA)) === false);
      check("maestra: cert sin la maestra esperada NO verifica (ancla)", (await M.verifyDeviceCert(certA, "acct:otra00000000000")) === false);
    }
    // Portabilidad: exportar cifrado, OLVIDAR (reset borra memoria+almacenamiento), reimportar.
    const pass = "passphrase-larga-123";
    const blob = await M.exportMasterKeyEncrypted(pass);
    check("maestra: exporta blob cifrado (v:2)", !!blob && blob.v === 2 && typeof blob.ct === "string" && blob.mfp === fpA);
    check("maestra: exportar exige passphrase mínima", (await M.exportMasterKeyEncrypted("corta")) === null);
    M._resetMasterKey();
    check("maestra: importar con passphrase incorrecta falla", blob ? (await M.importMasterKeyEncrypted(blob, "passphrase-incorrecta-larga")) === null : false);
    const okImp = blob ? await M.importMasterKeyEncrypted(blob, pass) : null;
    check("maestra: importar con passphrase correcta restaura la MISMA huella", !!okImp && okImp.fp === fpA);
    const certA2 = await M.signDeviceCert("id:dispositivo0002", "acct-uuid-123");
    check("maestra: tras reimportar, la restaurada FIRMA (misma mfp)", certA2 && fpA ? (certA2.mfp === fpA && (await M.verifyDeviceCert(certA2, fpA)) === true) : false);
    // ANCLA DE CONFIANZA: una maestra AJENA que reclama la misma cuenta se rechaza contra la esperada.
    M._resetMasterKey();
    const fpB = await M.masterFingerprint();
    const certB = await M.signDeviceCert("id:dispositivo0001", "acct-uuid-123");
    const bSelf = certB && fpB ? await M.verifyDeviceCert(certB, fpB) : false;
    const bVsA = certB && fpA ? await M.verifyDeviceCert(certB, fpA) : true;
    check("maestra: maestra AJENA autoconsistente pero rechazada contra la esperada", !!certB && fpB !== fpA && bSelf === true && bVsA === false);
    // Blob con mpub INTERCAMBIADA (privada ≠ mpub) NO importa.
    if (blob && certB) {
      const swapped = { ...blob, mpub: certB.mpub, mfp: certB.mfp };
      check("maestra: blob con mpub intercambiada (priv≠mpub) NO importa", (await M.importMasterKeyEncrypted(swapped, pass)) === null);
    }
    // Rotación + auto-revocación de la maestra (Adenda 122).
    M._resetMasterKey();
    const rfpA = await M.masterFingerprint();
    const rcertOld = await M.signDeviceCert("id:dev-rot", "acct-rot");
    const rev = await M.signMasterRevocation();
    check("maestra: firma su auto-revocación", !!rev && rev.mfp === rfpA);
    check("maestra: revocación propia verifica", rev ? (await M.verifyMasterRevocation(rev.mfp, rev.sig, rev.mpub)) === true : false);
    check("maestra: revocación con mfp ajeno NO verifica", rev ? (await M.verifyMasterRevocation("acct:ajena0000000000", rev.sig, rev.mpub)) === false : false);
    const rot = await M.regenerateMasterKey();
    check("maestra: rota a una huella NUEVA (oldFp/newFp)", !!rot && !!rot.newFp && rot.oldFp === rfpA && rot.newFp !== rfpA);
    check("maestra: cert de la maestra VIEJA NO verifica contra la NUEVA", rcertOld && rot ? (await M.verifyDeviceCert(rcertOld, rot.newFp)) === false : false);
    const rcertNew = await M.signDeviceCert("id:dev-rot2", "acct-rot");
    check("maestra: cert de la maestra NUEVA verifica contra la nueva huella", rcertNew && rot ? (rcertNew.mfp === rot.newFp && (await M.verifyDeviceCert(rcertNew, rot.newFp)) === true) : false);
    check("maestra: la revocación de la rotación es la de la maestra VIEJA", !!rot && !!rot.revocation && rot.revocation.mfp === rfpA);
  } else {
    console.log("  (omite identidad portátil: sin WebCrypto en este entorno)");
  }

  // 29) Cifrado POR-DESTINATARIO (Adenda 124 · #mesh4): ECDH P-256 → HKDF-SHA256 →
  //     AES-GCM. SOLO el destinatario abre el sobre v:3; tener el llavero COMPARTIDO
  //     no basta. Aditivo y retrocompatible con los sobres v:1/2.
  if (globalThis.crypto?.subtle) {
    const RC = await import("../src/ai/astraura/mesh/recipient-crypto");
    const RK = await import("../src/ai/astraura/mesh/relay-crypto");

    // Identidad de cifrado LOCAL = "B" (el destinatario). "A" cifra hacia la pública de B.
    RC._resetEncryptionKeys();
    const B = await RC.getOrCreateEncryptionKey();
    const bPub = await RC.myEncryptionPublicKey();
    check("recipient: crea/persiste par ECDH y expone su pública", !!B && !!bPub && !!bPub.x && !!bPub.y);
    const secretB = { txt: "solo para B", n: 3, geo: [19.4, -99.1] };
    const envB = bPub ? await RC.encryptEnvelopeFor(bPub, secretB) : null;
    check(
      "recipient: A cifra a B → sobre v:3 {epk,iv,ct}",
      !!envB && envB.v === 3 && !!envB.epk && typeof envB.iv === "string" && typeof envB.ct === "string",
    );

    // (a) Roundtrip EXACTO: B (identidad local) descifra su propio sobre.
    const backB = envB ? await RC.decryptEnvelopeFor(envB) : null;
    check("recipient: B descifra EXACTO su propio sobre v:3", JSON.stringify(backB) === JSON.stringify(secretB));

    // (c) ct manipulado → null (el tag GCM no valida, aunque seamos B).
    if (envB) {
      const tampered = { ...envB, ct: envB.ct.slice(0, -4) + (envB.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA") };
      const bad = await RC.decryptEnvelopeFor(tampered);
      check("recipient: sobre v:3 con ct manipulado NO descifra (tag GCM)", bad === null);
    }

    // (d) Despacho de relay-crypto: un v:3 se abre por delegación; un v:2 COMPARTIDO sigue leyéndose.
    const viaDispatch = envB ? await RK.decryptEnvelope(envB) : null;
    check("recipient: relay-crypto.decryptEnvelope despacha el v:3", JSON.stringify(viaDispatch) === JSON.stringify(secretB));
    const legacy = await RK.encryptEnvelope({ compartido: "llavero", k: 9 });
    check("recipient: (compat) el sobre COMPARTIDO sigue siendo v:1/2", !!legacy && (legacy.v === 1 || legacy.v === 2));
    const legacyBack = legacy ? await RK.decryptEnvelope(legacy) : null;
    check(
      "recipient: (compat) relay-crypto abre el sobre compartido v:2",
      JSON.stringify(legacyBack) === JSON.stringify({ compartido: "llavero", k: 9 }),
    );

    // (b) PROPIEDAD NUCLEAR: quien tiene SOLO el llavero compartido (no la privada
    //     ECDH de B) NO abre el sobre v:3 de B. Simulamos a "C": aseguramos que posee
    //     el llavero compartido, OLVIDAMOS la clave ECDH de B (memoria+almacenamiento)
    //     y generamos una identidad de cifrado NUEVA. El llavero compartido (otro
    //     módulo) queda intacto — es exactamente "solo tengo el llavero compartido".
    await RK.getOrCreateRelayKey(); // C posee el llavero compartido
    RC._resetEncryptionKeys();
    const C = await RC.getOrCreateEncryptionKey();
    const cPub = await RC.myEncryptionPublicKey();
    check(
      "recipient: C es una identidad de cifrado DISTINTA de B",
      !!C && !!cPub && !!bPub && (cPub.x !== bPub.x || cPub.y !== bPub.y),
    );
    const cViaFor = envB ? await RC.decryptEnvelopeFor(envB) : "no-null";
    check("recipient: NÚCLEO — quien NO es B no abre el v:3 (deriveBits distinto)", cViaFor === null);
    const cViaDispatch = envB ? await RK.decryptEnvelope(envB) : "no-null";
    check("recipient: NÚCLEO — el poseedor del llavero COMPARTIDO no abre un v:3 ajeno", cViaDispatch === null);

    // epub ATADA a la identidad soberana: la firma esig cubre {owner,epub} (mesh-identity).
    const MI = await import("../src/ai/astraura/mesh/mesh-identity");
    RC._resetEncryptionKeys();
    const epubClaim = await RC.myEncryptionPublicKey();
    const claim = epubClaim ? await MI.signIdentityClaim("acct-uuid-xyz", epubClaim) : null;
    check(
      "recipient: reclamación firmada transporta epub + esig",
      !!claim && !!claim.epub && !!claim.esig && claim.owner === "acct-uuid-xyz",
    );
    if (claim && claim.epub && claim.esig) {
      check("recipient: verifyEpub ACEPTA epub avalada por la identidad", (await MI.verifyEpub(claim.owner, claim.epub, claim.esig, claim.pub)) === true);
      check("recipient: verifyEpub RECHAZA con owner cambiado", (await MI.verifyEpub("acct-otra", claim.epub, claim.esig, claim.pub)) === false);
      // Sustitución de epub: la firma no la cubre → rechazo (epub ligada a la identidad).
      RC._resetEncryptionKeys();
      const fakeEpub = await RC.myEncryptionPublicKey();
      check(
        "recipient: verifyEpub RECHAZA una epub SUSTITUIDA (firma no la cubre)",
        fakeEpub ? (await MI.verifyEpub(claim.owner, fakeEpub, claim.esig, claim.pub)) === false : false,
      );
    }
  } else {
    console.log("  (omite cifrado por-destinatario: sin WebCrypto en este entorno)");
  }

  // 30) Cert de dispositivo con relayDeviceId (Adenda 126): re-habilita CON SEGURIDAD el
  //     direccionamiento v:3 POR-DISPOSITIVO cerrando el CRÍTICO de la Adenda 125. La
  //     maestra ATA {deviceFp ↔ account ↔ relayDeviceId}; el ancla TOFU account→mfp impide
  //     que una maestra AJENA reclame el device_id de otra cuenta.
  if (globalThis.crypto?.subtle) {
    const M = await import("../src/ai/astraura/mesh/master-identity");

    // (a) Firma atando relayDeviceId → verifica contra la maestra PROPIA y liga los 3 campos.
    M._resetMasterKey();
    const mfp = await M.masterFingerprint();
    const cert = await M.signDeviceCert("id:disp-relay-01", "acct-uuid-777", "dev-relay-aaa");
    check(
      "devcert: firma atando deviceFp+account+relayDeviceId",
      !!cert && cert.deviceFp === "id:disp-relay-01" && cert.account === "acct-uuid-777" && cert.relayDeviceId === "dev-relay-aaa" && cert.mfp === mfp,
    );
    check(
      "devcert: verifica contra la maestra esperada (ancla + relayDeviceId)",
      cert && mfp ? (await M.verifyDeviceCert(cert, mfp)) === true : false,
    );

    // (b) Ancla equivocada → rechazo (la ancla de confianza es imprescindible).
    check(
      "devcert: ancla mfp equivocada NO verifica (ancla)",
      cert ? (await M.verifyDeviceCert(cert, "acct:equivocada00000")) === false : false,
    );

    // (d) Manipular relayDeviceId / account / deviceFp rompe la verificación (todo va firmado).
    if (cert && mfp) {
      check("devcert: relayDeviceId manipulado NO verifica", (await M.verifyDeviceCert({ ...cert, relayDeviceId: "dev-relay-bbb" }, mfp)) === false);
      check("devcert: account manipulado NO verifica", (await M.verifyDeviceCert({ ...cert, account: "acct-otra" }, mfp)) === false);
      check("devcert: deviceFp manipulado NO verifica", (await M.verifyDeviceCert({ ...cert, deviceFp: "id:otro" }, mfp)) === false);
    }

    // (c) Cert de una maestra ATACANTE (otra clave) rechazado contra el mfp FIJADO (TOFU):
    //     autoconsistente consigo misma, pero no puede suplantar el ancla de la cuenta legítima.
    const pinnedMfp = mfp; // ancla previamente fijada para la cuenta legítima
    M._resetMasterKey(); // ← ahora somos OTRA maestra (la del atacante)
    const attackerMfp = await M.masterFingerprint();
    const attackerCert = await M.signDeviceCert("id:disp-relay-01", "acct-uuid-777", "dev-relay-aaa");
    let attackerRejected = false;
    if (attackerCert && pinnedMfp && attackerMfp) {
      attackerRejected =
        attackerMfp !== pinnedMfp &&
        (await M.verifyDeviceCert(attackerCert, attackerMfp)) === true && // consistente consigo misma
        (await M.verifyDeviceCert(attackerCert, pinnedMfp)) === false; // pero NO contra el ancla fijado
    }
    check("devcert: maestra ATACANTE autoconsistente pero rechazada contra el mfp fijado (TOFU)", attackerRejected);

    // Retrocompat: un cert SIN relayDeviceId (forma de la Adenda 121) sigue verificando; e
    // inyectarle un relayDeviceId a posteriori rompe la firma (el campo no estaba firmado).
    M._resetMasterKey();
    const legacyMfp = await M.masterFingerprint();
    const legacyCert = await M.signDeviceCert("id:disp-legacy", "acct-legacy");
    check(
      "devcert: cert SIN relayDeviceId (retrocompat) verifica sus campos",
      !!legacyCert && legacyCert.relayDeviceId === undefined && !!legacyMfp && (await M.verifyDeviceCert(legacyCert, legacyMfp)) === true,
    );
    check(
      "devcert: cert viejo con relayDeviceId INYECTADO NO verifica (no estaba firmado)",
      legacyCert && legacyMfp ? (await M.verifyDeviceCert({ ...legacyCert, relayDeviceId: "dev-inyectado" }, legacyMfp)) === false : false,
    );
  } else {
    console.log("  (omite cert de dispositivo con relayDeviceId: sin WebCrypto en este entorno)");
  }

  // 31) CADUCIDAD del certificado de dispositivo (seguimiento adversarial Adenda 126):
  //     verifyDeviceCert FIRMABA `iat` pero no lo comprobaba → un cert viejo podía re-inyectarse
  //     (replay) sin límite. Ahora un cert RANCIO o en el FUTURO implausible se rechaza; un `iat`
  //     ausente/0 sigue siendo válido (retrocompat). Para probar la caducidad con FIRMA VÁLIDA se
  //     retrocede/adelanta `Date.now` SOLO durante la firma (signDeviceCert sella iat=Date.now())
  //     y se restaura antes de verificar (verifyDeviceCert compara contra el reloj REAL). Así el
  //     rechazo es atribuible a la caducidad y NO a una firma rota: un cert con iat MUTADO a mano
  //     fallaría por firma igualmente, y el test no probaría nada nuevo.
  if (globalThis.crypto?.subtle) {
    const M = await import("../src/ai/astraura/mesh/master-identity");
    const DAY = 24 * 60 * 60_000;
    const realNow = Date.now;

    // (b) Cert FRESCO (iat por defecto = ahora) verifica contra su propia mfp.
    M._resetMasterKey();
    const mfp = await M.masterFingerprint();
    const fresh = await M.signDeviceCert("id:disp-fresco", "acct-caduc", "dev-fresco");
    check(
      "caducidad: cert FRESCO (iat por defecto) SÍ verifica",
      fresh && mfp ? (await M.verifyDeviceCert(fresh, mfp)) === true : false,
    );

    // (a) Cert con iat RANCIO (ahora − 200 días), FIRMADO válidamente bajo un reloj retrasado.
    let staleCert: Awaited<ReturnType<typeof M.signDeviceCert>> = null;
    try {
      Date.now = () => realNow() - 200 * DAY;
      staleCert = await M.signDeviceCert("id:disp-rancio", "acct-caduc", "dev-rancio");
    } finally {
      Date.now = realNow; // restaura el reloj real ANTES de verificar
    }
    check(
      "caducidad: cert con iat RANCIO (200 días) se RECHAZA",
      staleCert && mfp ? (await M.verifyDeviceCert(staleCert, mfp)) === false : false,
    );

    // (c) Cert con iat en el FUTURO lejano (ahora + 200 días) se rechaza (más allá del skew de 24 h).
    let futureCert: Awaited<ReturnType<typeof M.signDeviceCert>> = null;
    try {
      Date.now = () => realNow() + 200 * DAY;
      futureCert = await M.signDeviceCert("id:disp-futuro", "acct-caduc", "dev-futuro");
    } finally {
      Date.now = realNow; // restaura el reloj real ANTES de verificar
    }
    check(
      "caducidad: cert con iat en el FUTURO lejano se RECHAZA (skew)",
      futureCert && mfp ? (await M.verifyDeviceCert(futureCert, mfp)) === false : false,
    );
  } else {
    console.log("  (omite caducidad de cert de dispositivo: sin WebCrypto en este entorno)");
  }

  // 32) FAN-OUT multi-destinatario v:3 (Adenda 128, seguimiento del #mesh4): un sobre v:3
  //     INDEPENDIENTE por destinatario. Núcleo verificable SIN Supabase: cada destinatario
  //     abre EL SUYO y un NO-destinatario no abre ninguno. El INSERT de filas (uploadRelayMulti/
  //     Group) necesita Supabase → integración aparte; aquí se cubren sus guardas de entrada y
  //     los resolutores puros. decryptEnvelopeFor usa SIEMPRE la identidad LOCAL, así que para
  //     "ser" B o C al descifrar se guarda/restaura su blob JWK (safeGet/safeSet round-trip en
  //     memoria fuera del navegador).
  if (globalThis.crypto?.subtle) {
    const RC = await import("../src/ai/astraura/mesh/recipient-crypto");
    const SR = await import("../src/ai/astraura/mesh/server-relay");
    const { safeGet, safeSet } = await import("../src/lib/safe-storage");
    const ENC_KEY_LS = "starseed.mesh.enc-identity.v1"; // clave persistida de recipient-crypto

    RC._resetEncryptionKeys();
    await RC.getOrCreateEncryptionKey();
    const bPub = await RC.myEncryptionPublicKey();
    const bBlob = safeGet(ENC_KEY_LS); // captura la privada de B

    RC._resetEncryptionKeys();
    await RC.getOrCreateEncryptionKey();
    const cPub = await RC.myEncryptionPublicKey();
    check("fan-out: B y C son identidades de cifrado distintas",
      !!bPub && !!cPub && (bPub.x !== cPub.x || bPub.y !== cPub.y));

    const msg = { txt: "fan-out a B y C", n: 42, geo: [19.4, -99.1] };
    const envs = bPub && cPub ? await RC.encryptEnvelopeForMany([{ pub: bPub }, { pub: cPub }], msg) : [];
    check("fan-out: UN sobre v:3 por destinatario", envs.length === 2 && envs.every((e) => e.v === 3));
    check("fan-out: cada sobre es independiente (epk/iv distintos)",
      envs.length === 2 && envs[0].epk.x !== envs[1].epk.x && envs[0].iv !== envs[1].iv);

    // Local = C (última generada): abre SU sobre (idx1), NO el de B (idx0).
    check("fan-out: C descifra SU sobre (idx1)",
      JSON.stringify(await RC.decryptEnvelopeFor(envs[1])) === JSON.stringify(msg));
    check("fan-out: C NO abre el sobre de B (no-destinatario)",
      (await RC.decryptEnvelopeFor(envs[0])) === null);

    // Reinstala B → simétrico: B abre el suyo (idx0), no el de C (idx1).
    RC._resetEncryptionKeys();
    if (bBlob) safeSet(ENC_KEY_LS, bBlob);
    await RC.getOrCreateEncryptionKey();
    check("fan-out: B descifra SU sobre (idx0)",
      JSON.stringify(await RC.decryptEnvelopeFor(envs[0])) === JSON.stringify(msg));
    check("fan-out: B NO abre el sobre de C (no-destinatario)",
      (await RC.decryptEnvelopeFor(envs[1])) === null);

    // Destinatario con pub inválida se OMITE (entrega parcial); lista vacía → sin sobres.
    const partial = bPub
      ? await RC.encryptEnvelopeForMany([{ pub: bPub }, { pub: { kty: "oops" } as unknown as JsonWebKey }], msg)
      : [];
    check("fan-out: pub inválida se omite (parcial=1)", partial.length === 1 && partial[0].v === 3);
    check("fan-out: lista vacía → sin sobres", (await RC.encryptEnvelopeForMany([], msg)).length === 0);

    // Resolutor puro (sin Supabase): omite desconocidos + dedup.
    check("fan-out: encryptionKeysFor([]) = []", SR.encryptionKeysFor([]).length === 0);
    check("fan-out: encryptionKeysFor(desconocidos) dedup+omite",
      SR.encryptionKeysFor(["nadie", "nadie"]).length === 0);

    // Guardas de uploadRelayMulti/groupRecipients que NO tocan Supabase (retorno temprano).
    type Env = Parameters<typeof SR.uploadRelayMulti>[0];
    const envMsg: Env = { cls: "P2", ptype: "message", body: msg };
    const r0 = await SR.uploadRelayMulti(envMsg, []);
    check("fan-out: uploadRelayMulti sin destinatarios → {0,0}", r0.sent === 0 && r0.failed === 0);
    const rBlank = await SR.uploadRelayMulti(envMsg, ["", ""]);
    check("fan-out: uploadRelayMulti destinatarios vacíos → {0,0}", rBlank.sent === 0 && rBlank.failed === 0);
    check("fan-out: groupRecipients('') = [] (guarda)", (await SR.groupRecipients("")).length === 0);

    RC._resetEncryptionKeys(); // no arrastrar identidad de cifrado a otros grupos
  } else {
    console.log("  (omite fan-out multi-destinatario: sin WebCrypto en este entorno)");
  }

  // 33) REVOCACIÓN EXPLÍCITA de un cert de dispositivo CONCRETO (device-revocation): retira el cert
  //     de un DISPOSITIVO (por su id estable relayDeviceId/deviceFp, NO la firma → PERSISTE tras la
  //     re-emisión) SIN revocar la identidad soberana ni la maestra. Acta AUTO-AUTENTICABLE y ANCLADA.
  if (globalThis.crypto?.subtle) {
    const M = await import("../src/ai/astraura/mesh/master-identity");

    // (a) Firma→verifica ida y vuelta: el acta de la maestra propia verifica contra su ancla.
    M._resetMasterKey();
    const mfp = await M.masterFingerprint();
    const certA = await M.signDeviceCert("id:disp-crl-A", "acct-crl", "dev-crl-A");
    const certB = await M.signDeviceCert("id:disp-crl-B", "acct-crl", "dev-crl-B");
    const idA = certA ? await M.deviceCertId(certA) : "";
    const idB = certB ? await M.deviceCertId(certB) : "";
    check("crl-cert: deviceCertId estable y distingue emisiones", !!idA && !!idB && idA !== idB);
    const acta = idA ? await M.signDeviceCertRevocation(idA) : null;
    check("crl-cert: firma acta {certId,mfp,mpub,iat,sig}", !!acta && acta.certId === idA && acta.mfp === mfp && !!acta.mpub && !!acta.sig);
    check("crl-cert: acta propia verifica contra el ancla esperada", acta && mfp ? (await M.verifyDeviceCertRevocation(acta, mfp)) === true : false);

    // (b) Un certId revocado hace que verifyDeviceCert devuelva false (predicado síncrono);
    //     sin el predicado, el MISMO cert sigue verificando (retrocompat).
    const revoked = new Set<string>([idA]);
    const isRev = (id: string) => revoked.has(id);
    check("crl-cert: cert válido SIN predicado sigue verificando (retrocompat)", certA && mfp ? (await M.verifyDeviceCert(certA, mfp)) === true : false);
    check("crl-cert: cert revocado con predicado NO verifica", certA && mfp ? (await M.verifyDeviceCert(certA, mfp, { isCertRevoked: isRev })) === false : false);

    // (c) Revocar el cert A NO revoca el cert B (dispositivos distintos → certIds distintos).
    check("crl-cert: revocar A NO revoca B", certB && mfp ? (await M.verifyDeviceCert(certB, mfp, { isCertRevoked: isRev })) === true : false);

    // (c2) RE-EMISIÓN: re-firmar el cert del MISMO dispositivo (misma relayDeviceId, firma NUEVA) da
    //      el MISMO certId (id de dispositivo estable) → la revocación SIGUE aplicándose; no se evade
    //      re-publicando el cert. Regresión clave de la revisión adversarial Adenda 128.
    const certAre = await M.signDeviceCert("id:disp-crl-A", "acct-crl", "dev-crl-A");
    const idAre = certAre ? await M.deviceCertId(certAre) : "";
    check("crl-cert: re-emisión conserva el certId estable (firma nueva, mismo dispositivo)",
      !!idAre && idAre === idA && !!certAre && certAre.sig !== (certA ? certA.sig : ""));
    check("crl-cert: cert RE-EMITIDO de un dispositivo revocado SIGUE rechazado",
      certAre && mfp ? (await M.verifyDeviceCert(certAre, mfp, { isCertRevoked: isRev })) === false : false);

    // (d) Acta MANIPULADA (certId cambiado) NO verifica (la firma cubre el certId).
    if (acta && mfp) check("crl-cert: acta con certId manipulado NO verifica", (await M.verifyDeviceCertRevocation({ ...acta, certId: idB }, mfp)) === false);

    // (e) Acta con ANCLA equivocada rechazada (una maestra ajena no revoca el cert de otro).
    check("crl-cert: acta con ancla equivocada NO verifica (ancla)", acta ? (await M.verifyDeviceCertRevocation(acta, "acct:equivocada00000")) === false : false);

    // (f) Maestra ATACANTE: firma su PROPIA acta del mismo certId; verifica consigo misma pero NO
    //     contra el ancla de la cuenta legítima (no puede forzar la revocación del cert ajeno).
    const legitMfp = mfp;
    M._resetMasterKey(); // ahora somos otra maestra (atacante)
    const attackerMfp = await M.masterFingerprint();
    const attackerActa = idA ? await M.signDeviceCertRevocation(idA) : null;
    let attackerRejected = false;
    if (attackerActa && attackerMfp && legitMfp) {
      attackerRejected =
        attackerMfp !== legitMfp &&
        (await M.verifyDeviceCertRevocation(attackerActa, attackerMfp)) === true &&
        (await M.verifyDeviceCertRevocation(attackerActa, legitMfp)) === false;
    }
    check("crl-cert: maestra ATACANTE no puede revocar el cert ajeno (ancla)", attackerRejected);
  } else {
    console.log("  (omite revocación explícita de cert: sin WebCrypto en este entorno)");
  }

  // 34) DRENADO de BANDEJA DE RELÉ y REVOCACIONES: invariantes de paginación ASC + watermark.
  //     Núcleo verificable SIN Supabase (se simula la tabla y el bucle tal como los implementan
  //     pullRelayInbox / refreshRevocations): blinda contra la PÉRDIDA en ráfaga y el ENTIERRO.
  {
    const PAGE = 100;
    const me = "meDev";
    type Row = { id: string; at: number; dev: string; kind: string; recipient: string | null };
    const rows: Row[] = [];
    for (let i = 0; i < 250; i++) rows.push({ id: `d${String(i).padStart(4, "0")}`, at: 1000 + i, dev: "other", kind: "data", recipient: null });
    for (let i = 0; i < 30; i++) rows.push({ id: `c${i}`, at: 1000 + i, dev: "other", kind: "revocation-cert", recipient: null }); // ruido que ocupaba cupo
    for (let i = 0; i < 30; i++) rows.push({ id: `m${i}`, at: 1000 + i, dev: me, kind: "data", recipient: null });          // propias

    // Fiel a pullRelayInbox: ASC por (at,id), filtra kind='data', cursor = max at de TODO lo drenado.
    const drain = (since: number, maxPages: number): { items: string[]; next: number } => {
      const elig = rows.filter((r) => r.kind === "data" && r.at >= since).sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : 1));
      const items: string[] = []; let cursor = since;
      for (let p = 0; p < maxPages; p++) {
        const page = elig.slice(p * PAGE, p * PAGE + PAGE);
        if (!page.length) break;
        for (const r of page) { if (r.at > cursor) cursor = r.at; if (r.dev === me) continue; if (r.recipient && r.recipient !== me) continue; items.push(r.id); }
        if (page.length < PAGE) break;
      }
      return { items, next: cursor };
    };
    const delivered = new Set<string>(); let wm = 0;
    for (let poll = 0; poll < 5; poll++) { const { items, next } = drain(wm, 2); wm = Math.max(wm, next); for (const id of items) delivered.add(id); } // tope 2 pág → reparte en ciclos
    check("inbox: ráfaga de 250 se entrega ENTERA (drenado ASC + watermark al borde drenado)", delivered.size === 250);
    check("inbox: revocation-cert NO se entrega (filtro kind='data')", ![...delivered].some((id) => id.startsWith("c")));
    check("inbox: lo propio (device_id === me) NO se entrega", ![...delivered].some((id) => id.startsWith("m")));

    // Contraste: el algoritmo VIEJO (DESC + limit 50 + watermark al más nuevo) enterraba los viejos.
    const oldPull = (since: number) => {
      const got = rows.filter((r) => r.at >= since).sort((a, b) => (b.at - a.at) || (a.id < b.id ? 1 : -1)).slice(0, 50);
      let next = since; for (const r of got) next = Math.max(next, r.at);
      return { items: got.filter((r) => r.dev !== me && r.kind === "data").map((r) => r.id), next };
    };
    const old = new Set<string>(); let owm = 0;
    for (let poll = 0; poll < 5; poll++) { const { items, next } = oldPull(owm); owm = Math.max(owm, next); for (const id of items) old.add(id); }
    check("inbox (regresión): el algoritmo viejo PERDÍA mensajes en ráfaga", old.size < 250);

    // Revocaciones: 600 actas de flooder + 1 legítima (la más ANTIGUA: no antedatable por debajo).
    const LEGIT = "fp-legit-comprometida";
    const revs = [{ id: "rL", fp: LEGIT, at: 500 }, ...Array.from({ length: 600 }, (_, i) => ({ id: `rF${i}`, fp: `fp-flood-${i}`, at: 600 + i }))];
    const worst = [...revs.filter((r) => r.fp !== LEGIT), revs.find((r) => r.fp === LEGIT)!]; // peor orden físico: flood primero
    check("revocación (regresión): limit(500) sin orden PODÍA no ver la legítima", !new Set(worst.slice(0, 500).map((r) => r.fp)).has(LEGIT));
    const newSet = new Set<string>(); const ord = [...revs].sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : 1));
    for (let p = 0; p < 50; p++) { const page = ord.slice(p * PAGE, p * PAGE + PAGE); if (!page.length) break; for (const r of page) newSet.add(r.fp); if (page.length < PAGE) break; }
    check("revocación: el drenado ASC paginado SIEMPRE aprende la revocación legítima", newSet.has(LEGIT));
  }

  // 35) Adenda 149 · Ola 3: la RUTA PREFERIDA de la pestaña «Señales» es POR
  //     PERSONALIDAD (`decideRoute({ personaId })`). Al FINAL del archivo a
  //     propósito: es el único bloque que necesita un `window.localStorage`
  //     simulado (la puerta de antenas lee los overrides de disco), y así ese
  //     shim no puede contaminar a ningún otro test. Se restaura en `finally`.
  {
    const fake = new Map<string, string>();
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = "window" in g;
    const prevWindow = g.window;
    g.window = {
      localStorage: {
        getItem: (k: string) => fake.get(k) ?? null,
        setItem: (k: string, v: string) => void fake.set(k, v),
        removeItem: (k: string) => void fake.delete(k),
      },
      dispatchEvent: () => true,
    };
    try {
      // Regla guardada: la personalidad "p-mesh" fija la antena LoRa en ruta "mesh".
      fake.set("starseed.neuron.device-id", "dev-test");
      fake.set(
        "starseed.astraura.neuron-persona.v1",
        JSON.stringify({ "dev-test": { "p-mesh": { senales: { porAntena: { lora: { ruta: "mesh" } } } } } }),
      );
      resetMeshState();
      _resetRouterHysteresis();
      setMeshState({
        status: "ready",
        meshHealth: { score: 0.8, detail: "", at: Date.now() },
        wifiHealth: { score: 0.9, detail: "", at: Date.now() },
      });
      // SIN personalidad rigen los defaults «*» (no hay ninguno) → Wi-Fi sana = wifi.
      const sinPersona = decideRoute({ cls: "P2", sizeBytes: 100, neuronRules: DEFAULT_MESH_RULES });
      check("señales: sin personalidad manda «*» (Wi-Fi sana → wifi)", sinPersona.route === "wifi");
      // CON la personalidad, su regla más específica gana y fuerza la malla.
      _resetRouterHysteresis();
      const conPersona = decideRoute({
        cls: "P2",
        sizeBytes: 100,
        neuronRules: DEFAULT_MESH_RULES,
        personaId: "p-mesh",
      });
      check(
        "señales: la ruta preferida de la personalidad fuerza mesh",
        conPersona.route === "mesh" && conPersona.reason === "mesh-forced-by-rule",
      );
      // Otra personalidad SIN reglas propias no hereda las ajenas: sigue en wifi.
      _resetRouterHysteresis();
      const otraPersona = decideRoute({
        cls: "P2",
        sizeBytes: 100,
        neuronRules: DEFAULT_MESH_RULES,
        personaId: "p-otra",
      });
      check("señales: otra personalidad sin reglas NO hereda la ruta ajena", otraPersona.route === "wifi");
    } finally {
      if (hadWindow) g.window = prevWindow;
      else delete g.window;
      resetMeshState();
      _resetRouterHysteresis();
    }
  }

  // ── Adenda 150: inventario REAL multi-antena + anillo de precisión ────────
  {
    const S = await import("../src/ai/astraura/mesh/signals");
    const base = {
      status: "ready" as const,
      transport: "serial" as const,
      nodes: [],
      edges: [],
      wifiHealth: { score: 0, detail: "", at: 0 },
      meshHealth: { score: 0, detail: "", at: 0 },
      decisions: [],
      queue: { pending: 0, byClass: { P0: 0, P1: 0, P2: 0, P3: 0 } },
      budget: { availableMs: 0, capacityMs: 1, reservedP0Ms: 0, targetDutyPct: 1 },
      region: "EU_868",
      updatedAt: 0,
    };
    const NOW = 1_800_000_000_000;

    // Sin fuentes no se inventa NADA (y sin `navigator` tampoco hay portadora IP).
    const vacio = S.collectDetectedSignals({ mesh: { ...base, status: "disconnected", transport: null }, now: NOW });
    check("señales detectadas: sin fuentes reales, lista VACÍA", vacio.length === 0);

    // (a) Nodo LoRa con GPS en ambos extremos → posición REAL y halo pequeño.
    const self = { num: 1, lastHeard: NOW, presence: "online" as const, isSelf: true, lat: 41.3874, lon: 2.1686 };
    const conGps = S.collectDetectedSignals({
      mesh: {
        ...base,
        self,
        nodes: [self, { num: 2, lastHeard: NOW, presence: "online" as const, snr: 8, rssi: -70, lat: 41.3919, lon: 2.1686 }],
      },
      now: NOW,
    });
    const gpsSig = conGps.find((s) => s.id === "lora:2");
    check("señales: nodo con GPS de ambos extremos se coloca por GPS", gpsSig?.placement.mode === "gps");
    check(
      "señales: distancia GPS real ≈ 500 m (0,0045° de latitud)",
      !!gpsSig && Math.abs((gpsSig.placement.distanceM ?? 0) - 497) < 30,
    );
    check("señales: el halo GPS es PEQUEÑO (<0,1 del radio)", (gpsSig?.placement.accuracyFrac ?? 1) < 0.1);
    check("señales: el rumbo con GPS es real (norte ⇒ ángulo ≈ −90°)",
      !!gpsSig && Math.abs(gpsSig.placement.angleRad + Math.PI / 2) < 0.05);

    // (b) Nodo LoRa SIN GPS pero con SNR → distancia por RF, rumbo desconocido.
    const soloRf = S.collectDetectedSignals({
      mesh: { ...base, nodes: [{ num: 7, lastHeard: NOW, presence: "online" as const, snr: 8 }] },
      now: NOW,
    });
    const rfSig = soloRf[0];
    check("señales: sin GPS pero con SNR ⇒ modo RF", rfSig?.placement.mode === "rf");
    check("señales: el modo RF SÍ da distancia en metros", typeof rfSig?.placement.distanceM === "number");
    check("señales: el halo RF es mayor que el del GPS",
      (rfSig?.placement.accuracyFrac ?? 0) > (gpsSig?.placement.accuracyFrac ?? 1));
    const sectorLora = S.ANTENNA_SECTOR.lora;
    check("señales: sin rumbo, la señal cae DENTRO del sector de su antena",
      !!rfSig && Math.abs(rfSig.placement.angleRad - sectorLora.center) <= sectorLora.half);

    // (c) Sin GPS y sin métrica ⇒ sector puro, halo GRANDE, calidad null.
    const sinNada = S.collectDetectedSignals({
      mesh: { ...base, nodes: [{ num: 9, lastHeard: NOW, presence: "online" as const }] },
      now: NOW,
    });
    check("señales: sin métrica alguna, calidad = null (no se inventa)", sinNada[0]?.quality === null);
    check("señales: sin posición ni RF ⇒ modo sector", sinNada[0]?.placement.mode === "sector");
    check("señales: el halo sin posición es GRANDE (≥0,3 del radio)", (sinNada[0]?.placement.accuracyFrac ?? 0) >= 0.3);
    check("señales: sin posición NO se afirma distancia en metros", sinNada[0]?.placement.distanceM === null);

    // Determinismo: mismas entradas ⇒ misma colocación (nada de Math.random).
    const a1 = S.collectDetectedSignals({ mesh: { ...base, nodes: [{ num: 42, lastHeard: NOW, presence: "online" as const, snr: -3 }] }, now: NOW });
    const a2 = S.collectDetectedSignals({ mesh: { ...base, nodes: [{ num: 42, lastHeard: NOW, presence: "online" as const, snr: -3 }] }, now: NOW });
    check("señales: colocación DETERMINISTA (mismo id ⇒ mismo ángulo)",
      a1[0]?.placement.angleRad === a2[0]?.placement.angleRad && a1[0]?.placement.radiusFrac === a2[0]?.placement.radiusFrac);

    // Simulador: SIEMPRE etiquetado (jamás pasa por señal real).
    const sim = S.collectDetectedSignals({
      mesh: { ...base, transport: "simulator", nodes: [{ num: 3, lastHeard: NOW, presence: "online" as const, snr: 5 }] },
      now: NOW,
    });
    check("señales: el simulador va SIEMPRE etiquetado", sim[0]?.simulated === true && /SIMULADOR/.test(sim[0]?.signalType ?? ""));

    // (d) Faro del relé: es StarSeed, sin RF ⇒ sector y calidad por frescura.
    const faro = S.collectDetectedSignals({
      mesh: base,
      beacons: [{ deviceId: "dev-x", label: "Neurona vecina", region: "EU_868", preset: "LONG_FAST", onlineCount: 2, at: NOW - 60_000, own: false, offersPublic: true, port: 8443 }],
      now: NOW,
    });
    check("señales: el faro declara cuenta StarSeed", faro[0]?.starseed?.via === "relay-beacon");
    check("señales: el faro NO afirma distancia física", faro[0]?.placement.distanceM === null && faro[0]?.placement.mode === "sector");
    check("señales: faro con puerto público ⇒ «Añadir como servidor» habilitado",
      faro[0]?.actions.some((a) => a.id === "add-server" && a.enabled) === true);

    // (e) Neurona de la cuenta: datos PÚBLICOS + compatible.
    const cuenta = S.collectDetectedSignals({
      mesh: base,
      neurons: [
        { id: "n-1", name: "Portátil", kind: "laptop", online: true, lastSeenMs: NOW - 5_000, platform: "Linux", capabilities: ["WebGPU (IA local)"], isThisDevice: false },
        { id: "n-me", name: "Esta", kind: "desktop", online: true, lastSeenMs: NOW, capabilities: [], isThisDevice: true },
      ],
      now: NOW,
    });
    check("señales: la neurona de la cuenta aparece con sus datos públicos",
      cuenta.length === 1 && cuenta[0].starseed?.via === "neuron-registry" && cuenta[0].starseed?.ownAccount === true);
    check("señales: ESTA neurona NO se pinta como señal (es el centro)", !cuenta.some((s) => s.id === "neuron:n-me"));

    // (f) BLE genérico: se muestra AUNQUE NO sea compatible, con su RSSI real.
    const bleList = S.collectDetectedSignals({
      mesh: base,
      ble: [{ id: "ble-abc", name: "Auriculares", rssi: -62, txPower: null, uuids: [], at: NOW - 1000, viaPicker: false }],
      now: NOW,
    });
    check("señales: el BLE ajeno SE MUESTRA aunque no sea compatible",
      bleList.length === 1 && bleList[0].compatible === false);
    check("señales: el BLE con RSSI real SÍ tiene calidad", typeof bleList[0]?.quality === "number");
    check("señales: el BLE incompatible ofrece igualmente una opción real",
      bleList[0]?.actions.some((a) => a.id === "connect-ble" && a.enabled) === true);
    const blePicker = S.collectDetectedSignals({
      mesh: base,
      ble: [{ id: "ble-p", name: null, rssi: null, txPower: null, uuids: [], at: NOW, viaPicker: true }],
      now: NOW,
    });
    check("señales: BLE del selector (sin RSSI) NO finge calidad ni distancia",
      blePicker[0]?.quality === null && blePicker[0]?.placement.distanceM === null);

    // Normalizaciones de calidad acotadas a 0..1.
    check("señales: SNR fuera de rango se acota a 0..1",
      S.qualityFromSnr(-90) === 0 && S.qualityFromSnr(90) === 1);
    check("señales: RSSI fuera de rango se acota a 0..1",
      S.qualityFromRssi(-200) === 0 && S.qualityFromRssi(0) === 1);
    check("señales: mejor calidad ⇒ más cerca del centro",
      S.qualityFromRssi(-50) > S.qualityFromRssi(-100));

    // Orden: mejor calidad primero, «sin métrica» al final.
    const orden = S.collectDetectedSignals({
      mesh: {
        ...base,
        nodes: [
          { num: 11, lastHeard: NOW, presence: "online" as const, snr: -15 },
          { num: 12, lastHeard: NOW, presence: "online" as const, snr: 9 },
          { num: 13, lastHeard: NOW, presence: "online" as const },
        ],
      },
      now: NOW,
    });
    check("señales: se ordenan por calidad y las sin métrica van al final",
      orden[0]?.id === "lora:12" && orden[orden.length - 1]?.id === "lora:13");

    // Resumen por antena (para cabeceras y estados vacíos).
    const resumen = S.summarizeByAntenna(conGps);
    check("señales: el resumen por antena cuenta bien la familia LoRa",
      resumen.find((r) => r.antenna === "lora")?.count === 1);
  }

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}

void main();
