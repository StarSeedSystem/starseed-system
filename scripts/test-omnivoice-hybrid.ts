/**
 * Unit tests (tsx) del MOTOR HÍBRIDO OMNIVOICE (Adenda 77-voz).
 * Ejecuta:  npx tsx scripts/test-omnivoice-hybrid.ts
 *
 * Cubre los invariantes de contrato que NO deben romperse nunca:
 *   · design attrs → array POSICIONAL de 15 con LITERALES EXACTOS (parte china);
 *   · `du` calculado = clamp(palabras*0.42+1, 2, 30);
 *   · clone → array POSICIONAL de 12;
 *   · parser de estado del daemon local;
 *   · mapeo de idioma al nombre del Space.
 */

import {
  buildDesignData,
  buildCloneData,
  estimateDuration,
  mapLangToSpace,
  parseDaemonStatus,
} from "@/lib/aurora/tts-oss/omnivoice-hybrid";
import {
  planVoiceChunks,
  chunkBudgetFor,
  splitTextForVoice,
} from "@/lib/aurora/tts-oss/neural-tts";
import {
  DEFAULT_ASTRAURA_VOICE,
  mapDesignAttrsToSpace,
  sanitizeAstrauraVoice,
  type AstrauraVoiceConfig,
  type AstrauraDesignAttributes,
} from "@/lib/aurora/tts-oss/voice-config";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, extra !== undefined ? extra : "");
  }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });
}

// ── 1) DESIGN → 15 posicional con literales exactos + du ──────────────────────
console.log("\n[1] /_design_fn → 15 parámetros posicionales exactos");
{
  const omni: AstrauraVoiceConfig = sanitizeAstrauraVoice({
    generation_mode: "voice_design",
    voice_design_attributes: {
      gender: "Female / 女",
      age: "Young Adult / 青年",
      pitch: "Moderate Pitch / 中音调",
      style: "Auto",
      accent: "Auto",
    },
    playback_parameters: { speed: 1.0, normalize_text: true, allow_non_verbal_symbols: true },
    privacy_mode: "hybrid_allow_cloud",
  });
  const text = "Hola, soy Aurora y esta es mi voz."; // 8 palabras
  const data = buildDesignData(text, omni, "Spanish");

  ok("longitud = 15", data.length === 15, data.length);
  eq("[0] text", data[0], text);
  eq("[1] lang", data[1], "Spanish");
  eq("[2] ns = 32", data[2], 32);
  eq("[3] gs = 2.0", data[3], 2.0);
  eq("[4] dn = true", data[4], true);
  eq("[5] sp = 1.0", data[5], 1.0);
  // du = clamp(8*0.42+1, 2, 30) = 4.36 → redondeado 4.4
  eq("[6] du (8 palabras → 4.4)", data[6], 4.4);
  eq("[7] pp = true", data[7], true);
  eq("[8] po = true", data[8], true);
  eq("[9] gender literal EXACTO", data[9], "Female / 女");
  eq("[10] age literal EXACTO", data[10], "Young Adult / 青年");
  eq("[11] pitch literal EXACTO", data[11], "Moderate Pitch / 中音调");
  eq("[12] style", data[12], "Auto");
  eq("[13] english_accent", data[13], "Auto");
  eq("[14] chinese_dialect", data[14], "Auto");
}

// ── 1b) HERMIONE (acento británico, tono agudo) ──────────────────────────────
console.log("\n[1b] Diseño de Hermione (acento British, tono alto)");
{
  const omni = sanitizeAstrauraVoice({
    voice_design_attributes: {
      gender: "Female / 女",
      age: "Young Adult / 青年",
      pitch: "High Pitch / 高音调",
      style: "Auto",
      accent: "British Accent / 英国口音",
    },
  });
  const data = buildDesignData("Vamos a resolverlo juntos.", omni, "Spanish");
  eq("[11] pitch High", data[11], "High Pitch / 高音调");
  eq("[13] english_accent British", data[13], "British Accent / 英国口音");
}

// ── 2) du: fórmula clamp(palabras*0.42+1, 2, 30) ─────────────────────────────
console.log("\n[2] estimateDuration = clamp(palabras*0.42+1, 2, 30)");
{
  eq("1 palabra → 2 (mín)", estimateDuration("Hola"), 2); // 1.42 → clamp 2
  eq("7 palabras → 3.9", estimateDuration("uno dos tres cuatro cinco seis siete"), 3.9);
  // 100 palabras → 43 → clamp 30
  eq("100 palabras → 30 (máx)", estimateDuration(Array(100).fill("x").join(" ")), 30);
}

// ── 3) CLONE → 12 posicional ─────────────────────────────────────────────────
console.log("\n[3] /_clone_fn → 12 parámetros posicionales");
{
  const omni = sanitizeAstrauraVoice({
    generation_mode: "voice_cloning",
    voice_cloning: { enabled: true, reference_prompt_path: "https://x/y.wav", reference_transcript: "muestra" },
    playback_parameters: { speed: 1.1, normalize_text: true, allow_non_verbal_symbols: true },
    instruct: "voz cálida",
  });
  const ref = { path: "/tmp/ref.wav", meta: { _type: "gradio.FileData" } };
  const data = buildCloneData("Hola mundo bonito", omni, "Spanish", ref);
  ok("longitud = 12", data.length === 12, data.length);
  eq("[0] text", data[0], "Hola mundo bonito");
  eq("[1] lang", data[1], "Spanish");
  eq("[2] ref_aud (FileData)", data[2], ref);
  eq("[3] ref_text", data[3], "muestra");
  eq("[4] instruct", data[4], "voz cálida");
  eq("[5] ns = 32", data[5], 32);
  eq("[6] gs = 2.0", data[6], 2.0);
  eq("[7] dn = true", data[7], true);
  eq("[8] sp = 1.1", data[8], 1.1);
  eq("[9] du (3 palabras → 2.3)", data[9], 2.3); // 3*0.42+1=2.26 → 2.3
  eq("[10] pp = true", data[10], true);
  eq("[11] po = true", data[11], true);
}

// ── 3b) símbolos no verbales OFF → se limpian del texto ──────────────────────
console.log("\n[3b] allow_non_verbal_symbols OFF → limpia [risas] del texto");
{
  const omni = sanitizeAstrauraVoice({
    playback_parameters: { speed: 1, normalize_text: true, allow_non_verbal_symbols: false },
  });
  const data = buildDesignData("Hola [risas] qué tal", omni, "Spanish");
  ok("texto sin corchetes", !String(data[0]).includes("["), data[0]);
}

// ── 4) parser de estado del daemon ───────────────────────────────────────────
console.log("\n[4] parseDaemonStatus (contrato del daemon local)");
{
  const good = parseDaemonStatus({
    ok: true,
    ready: true,
    engine: "omnivoice.cpp",
    model: "omnivoice-q4.gguf",
    tier: "balanced",
    backend: "metal",
    warm: true,
    sampleRate: 24000,
  });
  ok("ready:true parseado", good?.ready === true, good);
  ok("engine correcto", good?.engine === "omnivoice.cpp", good?.engine);
  ok("sampleRate 24000", good?.sampleRate === 24000, good?.sampleRate);

  const halfway = parseDaemonStatus({ ok: true, ready: false, engine: "omnivoice.cpp", reasons: ["falta modelo"] });
  ok("ready:false (instalado a medias)", halfway?.ready === false, halfway);
  ok("reasons preservadas", JSON.stringify(halfway?.reasons) === JSON.stringify(["falta modelo"]), halfway?.reasons);

  ok("basura → null", parseDaemonStatus("nope") === null);
  ok("null → null", parseDaemonStatus(null) === null);
  ok("objeto vacío sin ready → null", parseDaemonStatus({}) === null);
}

// ── 5) mapeo de idioma ───────────────────────────────────────────────────────
console.log("\n[5] mapLangToSpace");
{
  eq("es → Spanish", mapLangToSpace("es"), "Spanish");
  eq("es-ES → Spanish", mapLangToSpace("es-ES"), "Spanish");
  eq("en → English", mapLangToSpace("en"), "English");
  eq("Spanish (nombre) → Spanish", mapLangToSpace("Spanish"), "Spanish");
  eq("desconocido → Spanish (defecto)", mapLangToSpace("xx"), "Spanish");
  eq("vacío → Spanish", mapLangToSpace(undefined), "Spanish");
}

// ── 6) mapDesignAttrsToSpace: sanea a literales exactos ──────────────────────
console.log("\n[6] mapDesignAttrsToSpace (defensivo → literales exactos / Auto)");
{
  // `age: "basura"` es intencionadamente inválido (prueba de saneado defensivo).
  const m = mapDesignAttrsToSpace({
    gender: "Female / 女",
    age: "basura",
    pitch: "High Pitch / 高音调",
    style: "Auto",
    accent: "British Accent / 英国口音",
  } as unknown as Partial<AstrauraDesignAttributes>);
  eq("gender válido", m.gender, "Female / 女");
  eq("age inválido → Auto", m.age, "Auto");
  eq("pitch válido", m.pitch, "High Pitch / 高音调");
  eq("accent válido", m.english_accent, "British Accent / 英国口音");
  eq("chinese_dialect siempre Auto", m.chinese_dialect, "Auto");
  const def = mapDesignAttrsToSpace(undefined);
  eq("undefined → todo Auto", [def.gender, def.age, def.pitch], ["Auto", "Auto", "Auto"]);
}

// ── 7) default de cuenta = voz de Aurora ─────────────────────────────────────
console.log("\n[7] DEFAULT_ASTRAURA_VOICE = voz cálida de Aurora");
{
  eq("gender", DEFAULT_ASTRAURA_VOICE.voice_design_attributes.gender, "Female / 女");
  eq("age", DEFAULT_ASTRAURA_VOICE.voice_design_attributes.age, "Young Adult / 青年");
  // Tono AGUDO a propósito: es el mismo `pitch` que llevan las semillas curadas
  // de Aurora y Hermione (openvoice2.ts) — voz femenina joven y luminosa. Si la
  // cuenta arrancara en "Moderate", el diseño por defecto y la semilla que se
  // clona no casarían y la voz cambiaría según la vía usada.
  eq("pitch", DEFAULT_ASTRAURA_VOICE.voice_design_attributes.pitch, "High Pitch / 高音调");
  eq("privacy híbrido", DEFAULT_ASTRAURA_VOICE.privacy_mode, "hybrid_allow_cloud");
}

// ── 8) Plan de trozos: arranque rápido + menos peticiones ────────────────────
// Contrato de LATENCIA y CONTINUIDAD (fix 2026-08-09): el PRIMER trozo es corto
// (Aurora empieza a hablar antes) y los siguientes largos (menos viajes al Space
// ⇒ menos costuras). Los cortes caen siempre en final de frase.
console.log("\n[8] planVoiceChunks → primer trozo corto, resto largos");
{
  const frase = "Esta es una frase de prueba con cuerpo suficiente para medir. ";
  const largo = frase.repeat(12); // ~740 caracteres

  const chunks = planVoiceChunks(largo, { first: 120, rest: 360 });
  ok("hay más de un trozo", chunks.length > 1, chunks.map((c) => c.length));
  ok("el primero es CORTO (arranque rápido)", chunks[0].length <= 120, chunks[0].length);
  ok(
    "algún trozo posterior aprovecha el presupuesto largo",
    chunks.slice(1).some((c) => c.length > 120),
    chunks.map((c) => c.length),
  );
  ok("ningún trozo excede su presupuesto", chunks.every((c, i) => c.length <= (i === 0 ? 120 : 360)));
  ok("ningún trozo vacío", chunks.every((c) => c.trim().length > 0));
  eq("no se pierde ni se inventa texto", chunks.join(" ").replace(/\s+/g, " ").trim(), largo.replace(/\s+/g, " ").trim());
  ok(
    "los cortes respetan finales de frase",
    chunks.slice(0, -1).every((c) => /[.!?…]["»”)]?$/.test(c.trim())),
    chunks,
  );

  // Menos peticiones que el troceo histórico de tope único (220).
  ok(
    "agrupar por frases reduce el nº de peticiones",
    planVoiceChunks(largo, { first: 160, rest: 380 }).length < splitTextForVoice(largo).length,
  );

  // Texto corto → una sola locución (nada que encadenar).
  eq("texto corto → 1 trozo", planVoiceChunks("Hola, soy Aurora.", { first: 160, rest: 380 }).length, 1);
  eq("vacío → sin trozos", planVoiceChunks("   ", { first: 160, rest: 380 }), []);
  // Compatibilidad: tope único = troceo histórico.
  eq(
    "first === rest reproduce splitTextForVoice",
    planVoiceChunks(largo, { first: 220, rest: 220 }),
    splitTextForVoice(largo),
  );
}

// ── 9) Presupuesto por motor y RUTA ──────────────────────────────────────────
// La nube paga un peaje enorme por petición (cola del Space) ⇒ trozos largos.
// El daemon local calcula ~6-7× tiempo real ⇒ trozos cortos o se pasa de su
// watchdog. Por eso el presupuesto depende de la RUTA congelada, no solo del motor.
console.log("\n[9] chunkBudgetFor → nube trozos largos, local trozos cortos");
{
  const nube = chunkBudgetFor("omnivoice", { route: "cloud", preferLocal: false });
  const local = chunkBudgetFor("omnivoice", { route: "local", preferLocal: true });
  ok("local < nube (watchdog del daemon)", local.rest < nube.rest, { local, nube });
  ok("el primer trozo siempre es el más corto", nube.first < nube.rest && local.first < local.rest);
  ok("openvoice2 (Space) usa trozos largos", chunkBudgetFor("openvoice2").rest >= 300);
  eq("motor por endpoint → troceo histórico", chunkBudgetFor("voxcpm"), { first: 220, rest: 220 });
}

console.log(`\n${failed === 0 ? "✅" : "❌"} OmniVoice hybrid — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
