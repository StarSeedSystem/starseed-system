/**
 * Unit tests (tsx) del CLIENTE OPENVOICE V2 (Adenda V2-VOZ).
 * Ejecuta:  npx tsx scripts/test-openvoice2.ts
 *
 * SIN RED: solo funciones PURAS (mapeos de estilo, esquema de config, parser del
 * protocolo de cola por WebSocket y validación del contrato con fixtures). Cubre
 * los invariantes que no deben romperse:
 *   · styleForLang / resolveOpenVoice2Style → estilos EXACTOS del Space;
 *   · seedKindFor → arquetipo por personalidad (Hermione/Aurora);
 *   · sanitizeOpenVoiceConfig → esquema `openvoice { style, seed_version, use_seed }`;
 *   · parseQueueMessage → mensajes send_hash/send_data/estimation/process_completed;
 *   · validateOpenVoice2Contract → contrato fn_index=1 con 4 parámetros.
 */

import {
  styleForLang,
  resolveOpenVoice2Style,
  seedKindFor,
  parseQueueMessage,
  validateOpenVoice2Contract,
  OPENVOICE2_STYLES,
  OPENVOICE2_SEED_SPECS,
} from "@/lib/aurora/tts-oss/openvoice2";
import { sanitizeOpenVoiceConfig, sanitizeAstrauraVoice } from "@/lib/aurora/tts-oss/voice-config";
import { emotionStyleFor } from "@/lib/aurora/tts-oss/openvoice2";
import {
  spaceIdToHost,
  looksLikeV2Design,
  looksLikeV1Predict,
  emotionsFromLiteral,
  OPENVOICE_BUILTIN_ENDPOINTS,
} from "@/lib/aurora/tts-oss/openvoice-discovery";

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

// ── 1) Mapeo de estilo por idioma ────────────────────────────────────────────
console.log("\n[1] styleForLang → estilo base por idioma");
{
  eq("es → es_default", styleForLang("es"), "es_default");
  eq("es-ES → es_default", styleForLang("es-ES"), "es_default");
  eq("en → en_us", styleForLang("en"), "en_us");
  eq("fr → fr_default", styleForLang("fr"), "fr_default");
  eq("ja → jp_default", styleForLang("ja"), "jp_default");
  eq("zh → zh_default", styleForLang("zh"), "zh_default");
  eq("ko → kr_default", styleForLang("ko"), "kr_default");
  eq("desconocido → en_default", styleForLang("xx"), "en_default");
  eq("vacío → es_default (default)", styleForLang(undefined), "es_default");
}

// ── 2) resolveOpenVoice2Style (pista > personalidad > idioma) ────────────────
console.log("\n[2] resolveOpenVoice2Style → prioridad correcta");
{
  eq(
    "styleHint válido gana",
    resolveOpenVoice2Style({ styleHint: "en_br", lang: "es", personalityId: "preset-aurora" }),
    "en_br",
  );
  eq(
    "styleHint inválido se ignora → idioma",
    resolveOpenVoice2Style({ styleHint: "no_existe", lang: "es" }),
    "es_default",
  );
  eq(
    "Hermione (uuid) → en_br",
    resolveOpenVoice2Style({ personalityId: "c9fe7030-fc68-49c6-a705-58f7900887f9", lang: "es" }),
    "en_br",
  );
  eq(
    "Hermione (nombre) → en_br",
    resolveOpenVoice2Style({ personalityId: "preset-hermione", lang: "es" }),
    "en_br",
  );
  eq(
    "Aurora (es) → es_default",
    resolveOpenVoice2Style({ personalityId: "preset-aurora", lang: "es" }),
    "es_default",
  );
  ok(
    "todos los estilos resueltos están en el enum EXACTO",
    (["es", "en", "fr", "ja", "zh", "ko", "xx"] as const).every((l) =>
      (OPENVOICE2_STYLES as readonly string[]).includes(styleForLang(l)),
    ),
  );
}

// ── 3) seedKindFor → arquetipo por personalidad ──────────────────────────────
console.log("\n[3] seedKindFor → semilla curada por personalidad");
{
  eq("hermione uuid", seedKindFor("c9fe7030-fc68-49c6-a705-58f7900887f9"), "hermione");
  eq("nombre con 'hermione'", seedKindFor("Hermione Granger"), "hermione");
  eq("aurora", seedKindFor("preset-aurora"), "aurora");
  eq("desconocida → null", seedKindFor("preset-mentora-sabia"), null);
  eq("vacío → null", seedKindFor(undefined), null);
  ok(
    "seed Hermione: mujer joven, agudo, británico (INSPIRADO, no real)",
    OPENVOICE2_SEED_SPECS.hermione.attrs.accent === "British Accent / 英国口音" &&
      OPENVOICE2_SEED_SPECS.hermione.attrs.gender === "Female / 女",
  );
  ok(
    "seed Aurora: mujer joven, US neutro, tono medio",
    OPENVOICE2_SEED_SPECS.aurora.attrs.accent === "American Accent / 美式口音" &&
      OPENVOICE2_SEED_SPECS.aurora.attrs.pitch === "Moderate Pitch / 中音调",
  );
}

// ── 4) Esquema de config `openvoice` ─────────────────────────────────────────
console.log("\n[4] sanitizeOpenVoiceConfig → esquema opcional, migración suave");
{
  eq("undefined → undefined", sanitizeOpenVoiceConfig(undefined), undefined);
  eq("objeto vacío → undefined", sanitizeOpenVoiceConfig({}), undefined);
  eq(
    "estilo válido + use_seed",
    sanitizeOpenVoiceConfig({ style: "en_br", use_seed: true }),
    { style: "en_br", use_seed: true },
  );
  eq(
    "estilo inválido se descarta",
    sanitizeOpenVoiceConfig({ style: "no_existe", use_seed: false }),
    { use_seed: false },
  );
  eq(
    "seed_version se normaliza a entero",
    sanitizeOpenVoiceConfig({ seed_version: 2.9 }),
    { seed_version: 2 },
  );
  // Integración en la config completa (no rompe migraciones existentes).
  {
    const full = sanitizeAstrauraVoice({ openvoice: { style: "es_default", use_seed: true } });
    ok("sanitizeAstrauraVoice conserva openvoice válido", full.openvoice?.style === "es_default");
    const legacy = sanitizeAstrauraVoice({ generation_mode: "voice_design" });
    ok("config legada SIN openvoice sigue válida (undefined)", legacy.openvoice === undefined);
  }
}

// ── 5) Parser del protocolo de cola (WebSocket) con fixtures ─────────────────
console.log("\n[5] parseQueueMessage → mensajes de la cola Gradio 3.x");
{
  eq("send_hash", parseQueueMessage('{"msg":"send_hash"}'), { kind: "send_hash" });
  eq("send_data", parseQueueMessage({ msg: "send_data" }), { kind: "send_data" });
  eq(
    "estimation con rank/eta",
    parseQueueMessage('{"msg":"estimation","rank":0,"rank_eta":0.32}'),
    { kind: "estimation", rank: 0, eta: 0.32 },
  );
  eq("process_starts", parseQueueMessage('{"msg":"process_starts"}'), { kind: "process_starts" });
  eq(
    "process_completed success + output",
    parseQueueMessage(
      '{"msg":"process_completed","success":true,"output":{"data":["info",{"name":"/tmp/a.wav"}]}}',
    ),
    { kind: "process_completed", success: true, output: { data: ["info", { name: "/tmp/a.wav" }] } },
  );
  eq(
    "process_completed FALLIDO (contrato real observado en vivo)",
    parseQueueMessage('{"msg":"process_completed","success":false,"output":{"error":null}}'),
    { kind: "process_completed", success: false, output: { error: null } },
  );
  eq("queue_full", parseQueueMessage('{"msg":"queue_full"}'), { kind: "queue_full" });
  eq("json corrupto → unknown", parseQueueMessage("no-json"), { kind: "unknown", msg: "" });
  eq("msg desconocido", parseQueueMessage('{"msg":"foo"}'), { kind: "unknown", msg: "foo" });
}

// ── 6) Validación del contrato con fixtures ──────────────────────────────────
console.log("\n[6] validateOpenVoice2Contract → detecta cambios de contrato");
{
  // Contrato REAL sondeado en vivo (2026-07-20): 4 params en fn_index=1.
  const good = {
    unnamed_endpoints: {
      "1": {
        parameters: [
          { label: "Text Prompt" },
          { label: "Style" },
          { label: "Reference Audio" },
          { label: "Agree" },
        ],
      },
    },
  };
  ok("contrato correcto → true", validateOpenVoice2Contract(good) === true);

  const changed = {
    unnamed_endpoints: {
      "1": { parameters: [{ label: "Text" }, { label: "Voice" }, { label: "Speed" }] },
    },
  };
  ok("nº de params distinto → false (contrato cambió)", validateOpenVoice2Contract(changed) === false);

  const renamed = {
    unnamed_endpoints: {
      "1": {
        parameters: [
          { label: "Prompt" },
          { label: "Timbre" }, // no menciona 'style'
          { label: "Reference Audio" },
          { label: "Agree" },
        ],
      },
    },
  };
  ok("etiqueta clave cambiada → false", validateOpenVoice2Contract(renamed) === false);

  ok("forma desconocida → true (optimista, no degradar)", validateOpenVoice2Contract({}) === true);
  ok("null → true (optimista)", validateOpenVoice2Contract(null) === true);
}

// ── DESCUBRIMIENTO (Adenda 79): clasificadores y emociones — puros, sin red ──
{
  ok("spaceIdToHost oficial", spaceIdToHost("myshell-ai/OpenVoiceV2") === "myshell-ai-openvoicev2");
  ok(
    "spaceIdToHost con guiones bajos",
    spaceIdToHost("naveenk-ai/openvoice_voicecloning_win") === "naveenk-ai-openvoice-voicecloning-win",
  );

  const v2ep = {
    parameters: [
      { label: "Text Prompt", python_type: { type: "str" }, component: "Textbox" },
      { label: "Style", python_type: { type: "Option from: [('en_default', 'en_default'), ('es_default', 'es_default')]" }, component: "Dropdown" },
      { label: "Reference Audio", python_type: { type: "str" }, component: "Audio" },
      { label: "Agree", python_type: { type: "bool" }, component: "Checkbox" },
    ],
  };
  ok("looksLikeV2Design acepta el contrato oficial", looksLikeV2Design(v2ep) === true);
  ok("looksLikeV2Design rechaza 3 params", looksLikeV2Design({ parameters: v2ep.parameters.slice(0, 3) }) === false);

  const v1ep = {
    parameters: [
      { label: "Text to speak", python_type: { type: "str" } },
      { label: "Style", python_type: { type: "Literal['default', 'whispering', 'cheerful', 'terrified', 'angry', 'sad', 'friendly']" } },
      { label: "Reference Audio", python_type: { type: "filepath" } },
      { label: "Tau", python_type: { type: "float" } },
    ],
  };
  ok("looksLikeV1Predict acepta el contrato de emociones", looksLikeV1Predict(v1ep) === true);
  ok("looksLikeV1Predict rechaza el V2", looksLikeV1Predict(v2ep) === false);

  const ems = emotionsFromLiteral("Literal['default', 'cheerful', 'sad']");
  ok("emotionsFromLiteral extrae 3", ems.length === 3 && ems.includes("cheerful"));

  ok("builtins ≥ 3 (oficial + duplicado + v1 vivo)", OPENVOICE_BUILTIN_ENDPOINTS.length >= 3);
  ok(
    "builtin v1 con emociones",
    OPENVOICE_BUILTIN_ENDPOINTS.some((e) => e.kind === "v1-predict" && (e.emotions?.length ?? 0) >= 5),
  );

  // Emoción por carácter + emoción viva del usuario.
  ok("Hermione → cheerful", emotionStyleFor({ personalityId: "preset-hermione" }) === "cheerful");
  ok("Aurora → friendly", emotionStyleFor({ personalityId: "preset-aurora" }) === "friendly");
  ok("mood triste manda → sad", emotionStyleFor({ personalityId: "preset-aurora", mood: "triste" }) === "sad");
  ok("mood alegre → cheerful", emotionStyleFor({ personalityId: "x", mood: "alegre" }) === "cheerful");
  ok("tenso JAMÁS angry", emotionStyleFor({ personalityId: "x", mood: "tenso" }) !== "angry");
  ok(
    "styleHint válido manda",
    emotionStyleFor({ personalityId: "preset-aurora", styleHint: "whispering" }) === "whispering",
  );
  ok(
    "available restringe",
    emotionStyleFor({ personalityId: "preset-hermione", available: ["default", "sad"] }) === "default",
  );
}

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? "✅" : "❌"} OpenVoice V2 — ${passed} OK, ${failed} fallos\n`);
if (failed > 0) process.exit(1);
