/**
 * Tests de coherencia de persona/voz + detección de idioma (Adenda 112).
 * Ejecuta: npx tsx scripts/test-persona-coherence.ts
 */
import {
  PERSONA_REFERENCE_PRESETS, ENGINE_SUPPORTS_REF, engineSupportsRef, presetById,
  personaToStyle, resolvePersonaForEngine, activePersona, getPersonaCoherence, setPersonaCoherence,
  type PortablePersona,
} from "../src/lib/aurora/persona-coherence";
import { detectLang, resolveLang, LANG_OPTIONS } from "../src/lib/aurora/lang-detect";

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed++; console.log("  OK  " + label); }
  else { failed++; console.log("  XX  " + label); }
}

const VALID_EMOTIONS = ["alegre", "serena", "dulce", "seria", "entusiasta", "empatica", "misteriosa", "juguetona"];
const REF_ENGINES = ["voxcpm", "voicebox", "gpt-sovits", "omnivoice", "openvoice2"] as const;
const NOREF_ENGINES = ["browser", "kokoro", "kitten", "bark", "xai"] as const;

function main() {
  // Integridad de presets
  const ids = PERSONA_REFERENCE_PRESETS.map((p) => p.id);
  check("presets: ids únicos", new Set(ids).size === ids.length);
  check("presets: >=8 disponibles", PERSONA_REFERENCE_PRESETS.length >= 8);
  check("presets: emoción válida", PERSONA_REFERENCE_PRESETS.every((p) => VALID_EMOTIONS.includes(p.emotion)));
  check("presets: rate/pitch en 0.5..2", PERSONA_REFERENCE_PRESETS.every((p) => p.rate >= 0.5 && p.rate <= 2 && p.pitch >= 0.5 && p.pitch <= 2));
  check("presets: energía 0..100", PERSONA_REFERENCE_PRESETS.every((p) => p.energy >= 0 && p.energy <= 100));
  check("presets: todos con referencia de audio", PERSONA_REFERENCE_PRESETS.every((p) => !!p.audioRefId));

  const calida = presetById("calida")!;

  // personaToStyle preserva carácter
  const style = personaToStyle(calida);
  check("personaToStyle: emoción preservada", style.emotion === calida.emotion);
  check("personaToStyle: tono preservado", style.tone === calida.tone);
  check("personaToStyle: persona = nombre", style.persona === calida.name);
  check("personaToStyle: rate/pitch/energy mapeados", style.rate === calida.rate && style.pitch === calida.pitch && style.energy === calida.energy);

  // El carácter se PRESERVA en cualquier motor (coherencia)
  for (const eng of [...REF_ENGINES, ...NOREF_ENGINES]) {
    const r = resolvePersonaForEngine(calida, eng as any);
    if (r.style.emotion !== calida.emotion || r.style.tone !== calida.tone) { check(`carácter preservado en ${eng}`, false); }
    else check(`carácter (emoción/tono) preservado en ${eng}`, true);
  }

  // audioRef SOLO en motores que clonan
  for (const eng of REF_ENGINES) {
    const r = resolvePersonaForEngine(calida, eng);
    check(`${eng}: usa referencia de audio`, r.usesRef === true && r.audioRef === calida.audioRefId);
  }
  for (const eng of NOREF_ENGINES) {
    const r = resolvePersonaForEngine(calida, eng);
    check(`${eng}: NO usa referencia (mantiene parámetros)`, r.usesRef === false && r.audioRef === undefined);
  }
  check("ENGINE_SUPPORTS_REF coherente con engineSupportsRef", REF_ENGINES.every((e) => engineSupportsRef(e)) && NOREF_ENGINES.every((e) => !engineSupportsRef(e)));

  // Cambiar de motor conserva el mismo carácter (misma persona → mismo style)
  const a = resolvePersonaForEngine(calida, "kokoro");
  const b = resolvePersonaForEngine(calida, "gpt-sovits");
  check("cambio de motor: mismo carácter, distinta capacidad de ref", JSON.stringify(a.style) === JSON.stringify(b.style) && a.usesRef === false && b.usesRef === true);

  // Estado + persona activa
  setPersonaCoherence({ presetId: "energica", custom: undefined, langMode: "" });
  check("estado: preset guardado", getPersonaCoherence().presetId === "energica");
  check("activePersona: resuelve el preset", activePersona().id === "energica");
  const custom: PortablePersona = { id: "mia", name: "Mía", emotion: "dulce", tone: "propia", energy: 60, rate: 1, pitch: 1 };
  setPersonaCoherence({ custom });
  check("activePersona: la custom tiene prioridad", activePersona().id === "mia");
  setPersonaCoherence({ custom: undefined, presetId: undefined });
  check("activePersona: cae a neutra por defecto", activePersona().id === "neutra");

  // ── Detección de idioma ──
  check("detecta español", detectLang("Hola, ¿cómo estás? Muchas gracias por la ayuda") === "es");
  check("detecta inglés", detectLang("Hello, how are you? Thanks for the help please") === "en");
  check("detecta portugués", detectLang("Olá, você está bem? Muito obrigado então") === "pt");
  check("detecta francés", detectLang("Bonjour, comment ça va? Merci pour être là") === "fr");
  check("detecta alemán", detectLang("Hallo, wie ist das? Ich danke dir, nicht schlecht") === "de");
  check("detecta italiano", detectLang("Ciao, come sono le cose? Grazie molto perché") === "it");
  check("texto vacío → sin idioma", detectLang("") === "");
  check("texto sin señal → sin idioma", detectLang("12345 :) xyz") === "");

  // resolveLang
  check("resolveLang auto detecta", resolveLang("", "Hello how are you please") === "en");
  check("resolveLang fijo respeta", resolveLang("es", "Hello how are you") === "es");
  check("resolveLang auto sin señal → fallback", resolveLang("", "??? 42", "es") === "es");
  check("LANG_OPTIONS incluye automático + varios", LANG_OPTIONS[0].code === "" && LANG_OPTIONS.length >= 6);

  console.log(`\n${passed} pasan / ${failed} fallan`);
  if (failed > 0) process.exit(1);
}
main();
