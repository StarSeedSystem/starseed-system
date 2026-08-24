/**
 * Tests de las funciones PURAS del proveedor Astraura 1.58-bit (Adenda 153):
 * transcripción single-turn, parser SSE y mapeo de personalidades.
 */
import { describe, expect, it } from "vitest";
import {
  ASTRAURA_158_PERSONAS,
  buildAstraura158Prompt,
  modelToPersona158,
  normalizeAstraura158Base,
  parseAstrauraSseLine,
  persona158For,
} from "@/ai/providers/astraura-158";
import type { ChatMessage } from "@/ai/providers/types";

describe("buildAstraura158Prompt", () => {
  it("un solo mensaje de usuario ⇒ prompt literal y system_prompt del OS", () => {
    const out = buildAstraura158Prompt([
      { role: "system", content: "Eres Aurora." },
      { role: "user", content: "Hola" },
    ]);
    expect(out.system_prompt).toBe("Eres Aurora.");
    expect(out.prompt).toBe("Hola");
  });

  it("con historial ⇒ la transcripción va al system_prompt y el prompt es SOLO el último mensaje", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "S1" },
      { role: "user", content: "¿Qué es BitNet?" },
      { role: "assistant", content: "Un modelo ternario." },
      { role: "system", content: "S2" },
      { role: "user", content: "¿Y por qué 1.58?" },
    ];
    const out = buildAstraura158Prompt(msgs);
    expect(out.system_prompt).toContain("S1");
    expect(out.system_prompt).toContain("S2");
    expect(out.system_prompt).toContain("Usuario: ¿Qué es BitNet?");
    expect(out.system_prompt).toContain("Astraura: Un modelo ternario.");
    // Lo esencial: el `prompt` es EXACTAMENTE la pregunta, sin transcripción.
    expect(out.prompt).toBe("¿Y por qué 1.58?");
  });

  /**
   * Adenda 159 · regresión del bucle de plantillas.
   * El backend soberano decide por SUBCADENA sobre `prompt` si contesta con una
   * plantilla determinista en vez de llamar al modelo. Si el historial viaja
   * dentro de `prompt`, basta que «quién eres» haya aparecido una vez —incluso
   * en una respuesta anterior de la IA— para que TODOS los mensajes siguientes
   * devuelvan la misma plantilla. Verificado contra el backend real.
   */
  it("el historial NUNCA contamina el prompt con disparadores de plantilla", () => {
    const out = buildAstraura158Prompt([
      { role: "user", content: "quién eres" },
      { role: "assistant", content: "Yo soy Astraura, el sistema cognitivo de 1.58 bits." },
      { role: "user", content: "cuánto es dos más dos" },
    ]);
    expect(out.prompt).toBe("cuánto es dos más dos");
    expect(out.prompt.toLowerCase()).not.toContain("quién eres");
    expect(out.prompt.toLowerCase()).not.toContain("astraura");
    // El modelo sigue viendo la conversación: está en el contexto, no en la pregunta.
    expect(out.system_prompt).toContain("quién eres");
  });

  it("recorta los turnos MÁS ANTIGUOS cuando el historial excede el presupuesto", () => {
    const big = "x".repeat(6000);
    const out = buildAstraura158Prompt([
      { role: "user", content: `viejo ${big}` },
      { role: "assistant", content: `respuesta ${big}` },
      { role: "user", content: "reciente" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "final" },
    ]);
    expect(out.system_prompt).toContain("Usuario: reciente");
    expect(out.system_prompt).toContain("Astraura: ok");
    expect(out.system_prompt).not.toContain("viejo");
    expect(out.prompt).toBe("final");
  });

  it("sin mensajes de usuario ⇒ prompt vacío", () => {
    expect(buildAstraura158Prompt([{ role: "system", content: "solo sistema" }]).prompt).toBe("");
  });
});

describe("parseAstrauraSseLine", () => {
  it("parsea eventos `data: {...}`", () => {
    expect(parseAstrauraSseLine('data: {"type":"token","token":"Ho"}')).toEqual({ type: "token", token: "Ho" });
    expect(parseAstrauraSseLine('data: {"type":"done","full_text":"Hola"}')?.full_text).toBe("Hola");
  });
  it("ignora vacíos, comentarios, [DONE] y JSON roto", () => {
    expect(parseAstrauraSseLine("")).toBeNull();
    expect(parseAstrauraSseLine(": keep-alive")).toBeNull();
    expect(parseAstrauraSseLine("data: [DONE]")).toBeNull();
    expect(parseAstrauraSseLine("data: {nope")).toBeNull();
    expect(parseAstrauraSseLine('data: {"sin":"type"}')).toBeNull();
  });
});

describe("persona158For / modelToPersona158", () => {
  it("mapea personalidades del OS a las 1.58 afines", () => {
    expect(persona158For({ id: "preset-aurora", name: "Aurora" })).toBe("aurora");
    expect(persona158For({ id: "c9fe", name: "Hermione" })).toBe("hermione");
    expect(persona158For({ id: "preset-poeta-ciberdelica", name: "Poeta Ciberdélica" })).toBe("kallisti");
    expect(persona158For({ id: "preset-analista-precisa", name: "Analista Precisa" })).toBe("logos");
    expect(persona158For({ id: "preset-guardiana-serena", name: "Guardiana Serena" })).toBe("atenea");
    expect(persona158For({ id: "preset-exploradora-curiosa", name: "Exploradora Curiosa" })).toBe("hermes");
    expect(persona158For({ id: "preset-mentora-sabia", name: "Mentora Sabia" })).toBe("mnemosyne");
    expect(persona158For({ id: "preset-complice-creativa", name: "Cómplice Creativa" })).toBe("oneiros");
    expect(persona158For({ id: "x", name: "Ingeniera de hardware" })).toBe("hephaestus");
    expect(persona158For({ id: "x", name: "Cualquiera" })).toBe("astraura_prime");
    expect(persona158For(null)).toBe("astraura_prime");
  });
  it("respeta un id explícito válido", () => {
    expect(persona158For({ name: "Aurora", persona158: "logos" })).toBe("logos");
    expect(persona158For({ name: "Aurora", persona158: "inventada" })).toBe("aurora");
  });
  it("convierte ids de modelo", () => {
    expect(modelToPersona158("astraura-158/hermes")).toBe("hermes");
    expect(modelToPersona158("astraura-158/auto")).toBeUndefined();
    expect(modelToPersona158("astraura-158/nadie")).toBeUndefined();
    expect(modelToPersona158(undefined)).toBeUndefined();
  });
  it("todas las personalidades del catálogo son mapeables", () => {
    for (const p of ASTRAURA_158_PERSONAS) expect(modelToPersona158(`astraura-158/${p.id}`)).toBe(p.id);
  });
});

describe("normalizeAstraura158Base", () => {
  it("quita barras finales y admite rutas relativas", () => {
    expect(normalizeAstraura158Base("http://127.0.0.1:8000/")).toBe("http://127.0.0.1:8000");
    expect(normalizeAstraura158Base("/api/ai/astraura-158//")).toBe("/api/ai/astraura-158");
    expect(normalizeAstraura158Base("")).toBe("http://127.0.0.1:8000");
  });
});

/* ═══════════════ Adenda 154 · menciones @persona + trazas del enjambre ═══════════════ */

import {
  applyMentions158,
  collectAstraura158Event,
  collectAstraura158FromJson,
  detectMentions158,
  emptyAstraura158Collected,
  hasAstraura158Collected,
  mentionsSystemNote,
  readAstraura158Sse,
  type ChatPreferences,
} from "@/ai/providers/astraura-158";

describe("detectMentions158", () => {
  it("sin menciones ⇒ single y lista vacía", () => {
    expect(detectMentions158("hola, ¿qué tal?")).toEqual({ personas: [], mode: "single" });
    expect(detectMentions158("")).toEqual({ personas: [], mode: "single" });
  });
  it("una mención (insensible a mayúsculas y acentos) ⇒ single con esa persona", () => {
    expect(detectMentions158("@Hermes busca noticias de BitNet")).toEqual({ personas: ["hermes"], mode: "single" });
    expect(detectMentions158("@LOGOS, demuéstralo")).toEqual({ personas: ["logos"], mode: "single" });
    expect(detectMentions158("@Génesis ¿quién eres?").personas).toEqual(["astraura_prime"]);
    expect(detectMentions158("@hefesto optimiza el kernel").personas).toEqual(["hephaestus"]);
    expect(detectMentions158("@Athena audita esto").personas).toEqual(["atenea"]);
  });
  it("≥2 menciones ⇒ multi_dialogue, en orden y sin duplicados", () => {
    const r = detectMentions158("@Hermes y @Logos, y otra vez @hermes: debatid");
    expect(r.personas).toEqual(["hermes", "logos"]);
    expect(r.mode).toBe("multi_dialogue");
  });
  it("«coral» en el texto ⇒ coral_synthesis", () => {
    expect(detectMentions158("@Aurora @Mnemosyne @Oneiros modo coral").mode).toBe("coral_synthesis");
    expect(detectMentions158("Síntesis CORAL con @Kallisti").mode).toBe("coral_synthesis");
  });
  it("ignora menciones desconocidas y correos", () => {
    expect(detectMentions158("@nadie @alex@starseed.org").personas).toEqual([]);
    expect(detectMentions158("escribe a alex@hermes.org").personas).toEqual([]);
    expect(detectMentions158("escribe a alex@hermes.org y avisa a @Hermes").personas).toEqual(["hermes"]);
  });
  it("las menciones con puntuación final no rompen el alias", () => {
    expect(detectMentions158("@Hermes. @Logos, @Atenea!").personas).toEqual(["hermes", "logos", "atenea"]);
  });
});

describe("applyMentions158 / mentionsSystemNote", () => {
  const base: ChatPreferences = {
    personaId: "aurora", selected_personalities: ["aurora"], multi_personality_mode: "single",
    response_style: "analytical", web_data_enabled: true, client: "starseed-os",
  };
  it("sin menciones ⇒ preferencias intactas", () => {
    const r = applyMentions158(base, "aurora", { personas: [], mode: "single" });
    expect(r.prefs).toBe(base);
    expect(r.persona).toBe("aurora");
    expect(mentionsSystemNote({ personas: [], mode: "single" }, "aurora")).toBe("");
  });
  it("una mención en single ⇒ esa personalidad lidera el turno", () => {
    const r = applyMentions158(base, "aurora", { personas: ["hermes"], mode: "single" });
    expect(r.persona).toBe("hermes");
    expect(r.prefs.personaId).toBe("hermes");
    expect(r.prefs.selected_personalities).toEqual(["hermes"]);
    expect(r.prefs.multi_personality_mode).toBe("single");
    expect(mentionsSystemNote({ personas: ["hermes"], mode: "single" }, "hermes")).toMatch(/Hermes/);
  });
  it("multi_dialogue ⇒ la personalidad del modelo va primera si no fue mencionada", () => {
    const r = applyMentions158(base, "aurora", { personas: ["hermes", "logos"], mode: "multi_dialogue" });
    expect(r.prefs.selected_personalities).toEqual(["aurora", "hermes", "logos"]);
    expect(r.prefs.multi_personality_mode).toBe("multi_dialogue");
    expect(r.prefs.personaId).toBe("aurora");
  });
  it("coral ⇒ no duplica la personalidad del modelo si ya fue mencionada", () => {
    const r = applyMentions158(base, "aurora", { personas: ["logos", "aurora"], mode: "coral_synthesis" });
    expect(r.prefs.selected_personalities).toEqual(["logos", "aurora"]);
    expect(r.prefs.multi_personality_mode).toBe("coral_synthesis");
    expect(mentionsSystemNote({ personas: ["logos", "aurora"], mode: "coral_synthesis" }, "aurora")).toMatch(/CORAL/);
  });
});

describe("collectAstraura158Event", () => {
  it("recoge plan, trazas, herramientas y personalidades (dedupe)", () => {
    const acc = emptyAstraura158Collected();
    expect(hasAstraura158Collected(acc)).toBe(false);
    collectAstraura158Event(acc, { type: "branching_plan", plan: { total_branches: 5 }, active_personalities: ["Hermes", "Aurora"] });
    collectAstraura158Event(acc, {
      type: "agent_traces",
      traces: [
        { agent: "Hermes (Web)", color: "#10b981", thoughts: ["buscando", "verificando"] },
        { agent: "Hermes (Web)", thoughts: ["verificando", "listo"] },
        { nope: true },
      ],
      tool_executions: [
        { tool: "browser_navigate", target: "https://x.y", success: true, summary: "Extraídos 120 caracteres" },
        { tool: "deep_web_research", success: false },
        { sin: "tool" },
      ],
      participating_personalities: [{ id: "hermes", name: "Hermes", color: "#10b981" }, { id: "logos", name: "Logos" }],
    });
    collectAstraura158Event(acc, { type: "multi_personality_start", personalities: [{ id: "logos", name: "Logos", color: "#3b82f6" }] });
    collectAstraura158Event(acc, { type: "done", full_text: "x", personalities_involved: ["aurora", "kallisti"] });
    collectAstraura158Event(acc, { type: "token", token: "ignorado" });

    expect(acc.plan).toEqual({ total_branches: 5 });
    expect(acc.traces).toEqual([{ agent: "Hermes (Web)", color: "#10b981", thoughts: ["buscando", "verificando", "listo"] }]);
    expect(acc.tools).toEqual([
      { tool: "browser_navigate", target: "https://x.y", success: true, summary: "Extraídos 120 caracteres" },
      { tool: "deep_web_research", success: false },
    ]);
    expect(acc.personalities.map((p) => p.id)).toEqual(["hermes", "aurora", "logos", "kallisti"]);
    // Logos: el color llegó en un evento posterior y se completó sin duplicar.
    expect(acc.personalities.find((p) => p.id === "logos")?.color).toBe("#3b82f6");
    expect(acc.personalities.find((p) => p.id === "aurora")?.name).toBe("Aurora");
    expect(hasAstraura158Collected(acc)).toBe(true);
  });
  it("extrae trazas de una respuesta JSON no-stream", () => {
    const c = collectAstraura158FromJson({ response: "hola", branching_plan: { a: 1 }, agent_traces: [{ agent: "Logos", thoughts: "razonando" }], tool_executions: [] });
    expect(c.plan).toEqual({ a: 1 });
    expect(c.traces).toEqual([{ agent: "Logos", thoughts: ["razonando"] }]);
    expect(collectAstraura158FromJson(null).traces).toEqual([]);
  });
});

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

describe("readAstraura158Sse", () => {
  it("acumula tokens y recoge el enjambre aunque los eventos lleguen partidos en chunks", async () => {
    const res = sseResponse([
      'data: {"type":"branching_plan","plan":{"total_branches":3,"total_agents":2},"active_personalities":["Aurora"]}\n\n',
      'data: {"type":"agent_traces","traces":[{"agent":"Mnemosyne","color":"#a855f7","thoughts":["recordando"]}],"tool_executions":[{"tool":"memory_search","success":true,"summary":"3 nodos"}],"participating_personalities":[{"id":"aurora","name":"Aurora"}]}\n\n',
      'data: {"type":"multi_personality_start","personalities":[{"id":"aurora","name":"Aurora","color":"#ec4899"},{"id":"logos","name":"Logos","color":"#3b82f6"}]}\n\n',
      'data: {"type":"token","token":"Ho"}\n\ndata: {"type":"tok',
      'en","token":"la"}\n\n',
      ': keep-alive\n\n',
      'data: {"type":"done","full_text":"Hola","personalities_involved":["aurora","logos"]}',
    ]);
    const seen: string[] = [];
    const out = await readAstraura158Sse(res, (d) => seen.push(d));
    expect(out.text).toBe("Hola");
    expect(seen).toEqual(["Ho", "la"]);
    expect(out.involved).toEqual(["aurora", "logos"]);
    expect(out.collected.plan).toEqual({ total_branches: 3, total_agents: 2 });
    expect(out.collected.traces).toEqual([{ agent: "Mnemosyne", color: "#a855f7", thoughts: ["recordando"] }]);
    expect(out.collected.tools).toEqual([{ tool: "memory_search", success: true, summary: "3 nodos" }]);
    expect(out.collected.personalities.map((p) => p.id)).toEqual(["aurora", "logos"]);
    expect(out.collected.personalities[0].color).toBe("#ec4899");
    expect(out.events).toBe(6);
  });
  it("sin tokens usa full_text de done; un evento error lanza", async () => {
    const out = await readAstraura158Sse(sseResponse(['data: {"type":"done","full_text":"Determinista"}\n\n']));
    expect(out.text).toBe("Determinista");
    expect(hasAstraura158Collected(out.collected)).toBe(false);
    await expect(readAstraura158Sse(sseResponse(['data: {"type":"error","message":"motor caído"}\n\n']))).rejects.toThrow(/motor caído/);
  });
});
