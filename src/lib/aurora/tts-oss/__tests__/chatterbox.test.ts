/**
 * VZR1011B — Chatterbox en el registro de motores y en Spaces públicos.
 *
 * Sin red ni GPU: la red, el disco y el reloj del cliente se inyectan
 * (`ChatterboxDeps`). Los contratos de los Spaces son los que devolvió
 * `/gradio_api/info` en el sondeo real del 2026-10-24 (recortados a lo que se usa).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHATTERBOX_APARTAR_MS,
  CHATTERBOX_LOCAL_BASE,
  CHATTERBOX_SPACES_INTEGRADOS,
  _reiniciarChatterboxParaPruebas,
  clasificarContratoChatterbox,
  construirDatosChatterbox,
  descubrirSpacesChatterbox,
  estadoChatterbox,
  exageracionPara,
  idiomaChatterbox,
  latenciaMedidaChatterbox,
  marcarResultadoChatterbox,
  ordenarSpacesChatterbox,
  semillaEstable,
  sintetizarChatterbox,
  turnoSinPrimerSonido,
  type ChatterboxDeps,
} from "@/lib/aurora/tts-oss/chatterbox";
import {
  markVoiceIdentitySpoke,
  setVoiceIdentity,
  type FrozenVoiceIdentity,
} from "@/lib/aurora/tts-oss/voice-identity";
import {
  AUTO_ENDPOINT_ORDER,
  VOICE_ENGINE_REGISTRY,
  buildVoiceChain,
  listVoiceEngines,
} from "@/lib/aurora/tts-oss/engine-registry";
import { getVoiceConfig, isNeuralEngine, isVoiceEngineId } from "@/lib/aurora/tts-oss/voice-config";
import { applyVoiceChainPriority, completarPrioridad } from "@/lib/aurora/tts-oss/omnivoice-web-router";
import { safeRemove, safeSet } from "@/lib/safe-storage";

// ── Contratos reales (sondeo del 2026-10-24) ────────────────────────────────

const LITERAL_IDIOMAS =
  "Literal['ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh']";
const FILE_DEFAULT = { path: "/tmp/gradio/x/fr_f1.flac", meta: { _type: "gradio.FileData" } };

const INFO_MULTILINGUE = {
  named_endpoints: {
    "/on_language_change": {
      parameters: [
        { parameter_name: "lang", component: "Dropdown", python_type: { type: LITERAL_IDIOMAS }, parameter_default: "fr" },
        { parameter_name: "current_ref", component: "Audio", python_type: { type: "filepath" }, parameter_default: FILE_DEFAULT },
        { parameter_name: "current_text", component: "Textbox", python_type: { type: "str" }, parameter_default: "Le mois" },
      ],
    },
    "/generate_tts_audio": {
      parameters: [
        { parameter_name: "text_input", component: "Textbox", python_type: { type: "str" }, parameter_default: "Le mois dernier" },
        { parameter_name: "language_id", component: "Dropdown", python_type: { type: LITERAL_IDIOMAS }, parameter_default: "fr" },
        { parameter_name: "audio_prompt_path_input", component: "Audio", python_type: { type: "filepath" }, parameter_default: FILE_DEFAULT },
        { parameter_name: "exaggeration_input", component: "Slider", python_type: { type: "float" }, parameter_default: 0.5 },
        { parameter_name: "temperature_input", component: "Slider", python_type: { type: "float" }, parameter_default: 0.8 },
        { parameter_name: "seed_num_input", component: "Number", python_type: { type: "float" }, parameter_default: 0 },
        { parameter_name: "cfgw_input", component: "Slider", python_type: { type: "float" }, parameter_default: 0.5 },
      ],
    },
  },
};

const INFO_INGLES = {
  named_endpoints: {
    "/generate_tts_audio": {
      parameters: [
        { parameter_name: "text_input", component: "Textbox", python_type: { type: "str" }, parameter_default: "Now let's" },
        { parameter_name: "audio_prompt_path_input", component: "Audio", python_type: { type: "filepath" }, parameter_default: FILE_DEFAULT },
        { parameter_name: "exaggeration_input", component: "Slider", python_type: { type: "float" }, parameter_default: 0.5 },
        { parameter_name: "temperature_input", component: "Slider", python_type: { type: "float" }, parameter_default: 0.8 },
        { parameter_name: "seed_num_input", component: "Number", python_type: { type: "float" }, parameter_default: 0 },
        { parameter_name: "cfgw_input", component: "Slider", python_type: { type: "float" }, parameter_default: 0.5 },
        { parameter_name: "vad_trim_input", component: "Checkbox", python_type: { type: "bool" }, parameter_default: false },
      ],
    },
  },
};

/** Turbo: sin dial de exageración → no es el contrato que usamos. */
const INFO_TURBO = {
  named_endpoints: {
    "/generate": {
      parameters: [
        { parameter_name: "text", component: "Textbox", python_type: { type: "str" } },
        { parameter_name: "audio_prompt_path", component: "Audio", python_type: { type: "filepath" } },
        { parameter_name: "temperature", component: "Slider", python_type: { type: "float" } },
      ],
    },
  },
};

// ── Dobles ───────────────────────────────────────────────────────────────────

function wavBase64(): string {
  const bytes = new Uint8Array(64);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // «RIFF»
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // «WAVE»
  return Buffer.from(bytes).toString("base64");
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

interface Escenario {
  /** Respuesta del servicio local: «vivo» (audio real), «simulado» (sin audio) o «apagado». */
  local?: "vivo" | "simulado" | "apagado";
  /** Spaces (por base) que devuelven audio. */
  spacesQueHablan?: string[];
  /** Rutas → respuesta para el descubrimiento. */
  rutas?: Record<string, unknown>;
}

function montar(esc: Escenario = {}) {
  const almacen = new Map<string, string>();
  let reloj = 1_000_000;
  const llamadasGradio: { base: string; fn: string; data: unknown[] }[] = [];
  const medidas: { tipo: string; valor: number; idioma?: string }[] = [];
  const pedidas: string[] = [];
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    pedidas.push(url);
    if (url.startsWith(CHATTERBOX_LOCAL_BASE)) {
      if ((esc.local ?? "apagado") === "apagado") throw new TypeError("Failed to fetch");
      if (url.endsWith("/salud")) return json({ dispositivo: "cpu", modelos_cargados: [], marca_agua_perth: true, estado: "activo" });
      if (url.endsWith("/generar")) {
        const cuerpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(cuerpo.texto).toBeTypeOf("string");
        return json({
          audio_base64: esc.local === "vivo" ? wavBase64() : null,
          factor_tiempo_real: esc.local === "vivo" ? 2.5 : 0,
          marca_agua_perth: true,
        });
      }
    }
    const r = esc.rutas?.[url];
    if (r !== undefined) return json(r);
    return new Response("no", { status: 404 });
  });
  const deps: Partial<ChatterboxDeps> = {
    fetch: fetchFalso,
    ahora: () => reloj,
    leer: (k) => almacen.get(k) ?? null,
    escribir: (k, v) => {
      almacen.set(k, v);
    },
    llamarGradio: async (base, fn, data) => {
      llamadasGradio.push({ base, fn, data });
      reloj += 4_000; // la cola del Space tarda
      return (esc.spacesQueHablan ?? []).includes(base) ? [{ url: `${base}/gradio_api/file=out.wav` }] : null;
    },
    audioDeSalida: async (out) => (out ? new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: "audio/wav" }) : null),
    anotar: (tipo, valor, idioma) => {
      medidas.push({ tipo, valor, idioma: idioma || undefined });
    },
  };
  return {
    deps,
    almacen,
    llamadasGradio,
    medidas,
    pedidas,
    avanzar: (ms: number) => {
      reloj += ms;
    },
  };
}

const MTL = CHATTERBOX_SPACES_INTEGRADOS[0];
const ING = CHATTERBOX_SPACES_INTEGRADOS[1];

// ── Identidad del mensaje (turno) para la medida por turno (SGO1024B) ────────

/** Token fijo del mensaje de prueba (el que `neuralSpeak` congela por turno). */
const TOKEN_MENSAJE = 7;

/** Identidad congelada mínima, como la produce `beginMessageVoiceIdentity`. */
function identidadMensaje(
  spoke: boolean,
  engine: "chatterbox" | "openvoice2" = "chatterbox",
): FrozenVoiceIdentity {
  return {
    token: TOKEN_MENSAJE,
    engine,
    settings: { lang: "es" },
    params: { rate: 1, pitch: 1, volume: 0.8, energy: 50 },
    playbackMod: null,
    fingerprint: "prueba",
    spoke,
  };
}

beforeEach(() => _reiniciarChatterboxParaPruebas());
afterEach(() => setVoiceIdentity(null)); // el turno no se cuela en la prueba siguiente

// ── Contrato y piezas puras ──────────────────────────────────────────────────

describe("contrato real de los Spaces de Chatterbox", () => {
  it("reconoce el Multilingual (es incluido) y mapea los parámetros por nombre", () => {
    const sp = clasificarContratoChatterbox("x/Chatterbox-Multilingual-TTS", "https://x.hf.space", "5.29.0", INFO_MULTILINGUE);
    expect(sp).not.toBeNull();
    expect(sp?.familia).toBe("multilingue");
    expect(sp?.fn).toBe("generate_tts_audio");
    expect(sp?.parametros).toEqual(MTL.parametros);
    expect(sp?.idiomas).toContain("es");
    expect(sp?.idiomas).toHaveLength(23);
    expect(sp?.fijos).toEqual({ temperature_input: 0.8 });
  });

  it("reconoce el de inglés (Gradio 6) y guarda sus valores fijos", () => {
    const sp = clasificarContratoChatterbox("x/Chatterbox", "https://y.hf.space", "6.3.0", INFO_INGLES);
    expect(sp?.familia).toBe("ingles");
    expect(sp?.idiomas).toEqual(["en"]);
    expect(sp?.fijos).toEqual({ temperature_input: 0.8, vad_trim_input: false });
  });

  it("descarta Gradio 4 (sin /gradio_api/call) y funciones sin exageración", () => {
    expect(clasificarContratoChatterbox("a/b", "https://a.hf.space", "4.44.1", INFO_MULTILINGUE)).toBeNull();
    expect(clasificarContratoChatterbox("a/b", "https://a.hf.space", "6.0.2", INFO_TURBO)).toBeNull();
    expect(clasificarContratoChatterbox("a/b", "https://a.hf.space", "5.0.0", null)).toBeNull();
  });

  it("construye los datos en el orden del contrato, sin referencia de voz", () => {
    const datos = construirDatosChatterbox(MTL, { texto: "Hola", idioma: "es", exageracion: 0.65, cfg: 0.3, semilla: 42 });
    expect(datos).toEqual(["Hola", "es", null, 0.65, 0.8, 42, 0.3]);
    const ingles = construirDatosChatterbox(ING, { texto: "Hi", idioma: "en", exageracion: 0.5, cfg: 0.5, semilla: 7 });
    expect(ingles).toEqual(["Hi", null, 0.5, 0.8, 7, 0.5, false]);
  });

  it("la emoción se dosifica con la exageración (y baja el CFG cuando sube)", () => {
    expect(exageracionPara()).toEqual({ exageracion: 0.5, cfg: 0.5 });
    expect(exageracionPara("serena").exageracion).toBeLessThan(0.5);
    expect(exageracionPara("entusiasta")).toEqual({ exageracion: 0.8, cfg: 0.3 });
    expect(exageracionPara("entusiasta", 100).exageracion).toBe(0.9); // techo: los extremos son inestables
    expect(exageracionPara("serena", 0).exageracion).toBe(0.25);
    expect(exageracionPara("desconocida", 50).exageracion).toBe(0.5);
  });

  it("idioma y semilla: es-ES → es, semilla estable y distinta por personalidad", () => {
    expect(idiomaChatterbox("es-ES")).toBe("es");
    expect(idiomaChatterbox(undefined)).toBe("es");
    expect(semillaEstable("aurora")).toBe(semillaEstable("aurora"));
    expect(semillaEstable("aurora")).not.toBe(semillaEstable("hermione"));
    expect(semillaEstable()).toBeGreaterThan(0);
  });
});

// ── Cliente: local primero, Spaces después ───────────────────────────────────

describe("cliente Chatterbox", () => {
  it("con el servicio local vivo habla él y no toca ningún Space", async () => {
    const m = montar({ local: "vivo", spacesQueHablan: [MTL.base] });
    const r = await sintetizarChatterbox("Hola, soy Astraura.", { idioma: "es-ES", emocion: "alegre" }, m.deps);
    expect(r.via).toBe("local");
    expect(r.blob).toBeInstanceOf(Blob);
    expect(r.factorTiempoReal).toBe(2.5);
    expect(m.llamadasGradio).toHaveLength(0);
    expect(m.medidas.map((x) => x.tipo)).toEqual(["primer-sonido", "tiempo-real-voz"]);
    expect(estadoChatterbox(m.deps)).toBe("listo");
  });

  it("(SGO1024B) el «primer-sonido» es UNA medida por turno y con idioma, no una por trozo", async () => {
    setVoiceIdentity(identidadMensaje(false)); // trozo 0 del mensaje: mide
    const m = montar({ local: "vivo" });
    const r0 = await sintetizarChatterbox("Hola, soy Astraura.", { idioma: "es-ES" }, m.deps);
    expect(r0.via).toBe("local");
    const primeras = m.medidas.filter((x) => x.tipo === "primer-sonido");
    expect(primeras).toHaveLength(1);
    expect(primeras[0].idioma).toBe("es"); // «es-ES» → el idioma base que viaja al motor
    expect(m.medidas.find((x) => x.tipo === "tiempo-real-voz")?.idioma).toBe("es");
    // El trozo 0 ganó: `neuralSpeakChunked` marca el mensaje como hablado y los
    // trozos 2..N ya no falsean la mediana con medidas de más.
    markVoiceIdentitySpoke(TOKEN_MENSAJE);
    expect(turnoSinPrimerSonido()).toBe(false);
    await sintetizarChatterbox("Mi segundo trozo del mismo mensaje.", { idioma: "es-ES" }, m.deps);
    expect(m.medidas.filter((x) => x.tipo === "primer-sonido")).toHaveLength(1);
  });

  it("(SGO1024B) una identidad congelada de OTRO motor no apaga la medida del turno propio", async () => {
    const m = montar({ local: "vivo" });
    setVoiceIdentity(identidadMensaje(true, "openvoice2"));
    expect(turnoSinPrimerSonido()).toBe(true);
    const r = await sintetizarChatterbox("Hola de nuevo.", { idioma: "es" }, m.deps);
    expect(r.via).toBe("local");
    expect(m.medidas.filter((x) => x.tipo === "primer-sonido")).toHaveLength(1);
    expect(m.medidas.find((x) => x.tipo === "primer-sonido")?.idioma).toBe("es");
  });

  it("si el local está en modo simulado (sin audio) pasa al Space multilingüe para español", async () => {
    const m = montar({ local: "simulado", spacesQueHablan: [MTL.base] });
    const r = await sintetizarChatterbox("Hola, soy Astraura.", { idioma: "es", personalityId: "aurora" }, m.deps);
    expect(r.via).toBe("space");
    expect(r.endpoint).toBe(MTL.id);
    expect(m.llamadasGradio).toHaveLength(1);
    const [llamada] = m.llamadasGradio;
    expect(llamada.fn).toBe("generate_tts_audio");
    expect(llamada.data[1]).toBe("es");
    expect(llamada.data[2]).toBeNull(); // nunca se clona aquí
    expect(llamada.data[5]).toBe(semillaEstable("aurora"));
    expect(r.latenciaMs).toBe(4_000);
    expect(latenciaMedidaChatterbox(m.deps)).toContain("Space 4,0 s");
  });

  it("un Space que falla se aparta 6 h y se prueba el siguiente; a las 6 h vuelve", async () => {
    const otro = { ...MTL, id: "comunidad/Chatterbox-Multilingual-TTS", base: "https://comunidad.hf.space", origen: "descubierto" as const };
    const m = montar({ local: "apagado", spacesQueHablan: [otro.base] });
    m.almacen.set("starseed.aurora.chatterbox.discovery.v1", JSON.stringify({ at: 1_000_000, spaces: [MTL, ING, otro] }));
    const r = await sintetizarChatterbox("Hola.", { idioma: "es" }, m.deps);
    expect(r.endpoint).toBe(otro.id);
    expect(m.llamadasGradio.map((l) => l.base)).toEqual([MTL.base, otro.base]);
    // El oficial queda apartado: el orden de ahora ya no lo incluye y el sano va delante.
    expect(ordenarSpacesChatterbox("es", m.deps).map((s) => s.id)).toEqual([otro.id]);
    m.avanzar(CHATTERBOX_APARTAR_MS + 1);
    expect(ordenarSpacesChatterbox("es", m.deps).map((s) => s.id)).toEqual([otro.id, MTL.id]);
  });

  it("entre Spaces sanos manda la latencia medida en esta neurona", () => {
    const rapido = { ...MTL, id: "a/rapido", base: "https://a-rapido.hf.space", origen: "descubierto" as const };
    const m = montar();
    m.almacen.set("starseed.aurora.chatterbox.discovery.v1", JSON.stringify({ at: 1_000_000, spaces: [rapido] }));
    marcarResultadoChatterbox(MTL.id, true, 9_000, m.deps);
    marcarResultadoChatterbox(rapido.id, true, 2_000, m.deps);
    expect(ordenarSpacesChatterbox("es", m.deps).map((s) => s.id)).toEqual([rapido.id, MTL.id]);
    // El de inglés no entra para español.
    expect(ordenarSpacesChatterbox("es", m.deps).some((s) => s.id === ING.id)).toBe(false);
  });

  it("sin servicio local, un texto de más de 300 caracteres no se manda a un Space", async () => {
    const m = montar({ local: "apagado", spacesQueHablan: [MTL.base] });
    const r = await sintetizarChatterbox("a".repeat(301), { idioma: "es" }, m.deps);
    expect(r).toMatchObject({ blob: null, motivo: "texto-largo" });
    expect(m.llamadasGradio).toHaveLength(0);
  });

  it("estado: nuevo → fuera cuando todo está apartado → vuelve al pasar el plazo", async () => {
    const m = montar({ local: "apagado" });
    expect(estadoChatterbox(m.deps)).toBe("nuevo");
    const r = await sintetizarChatterbox("Hello there.", { idioma: "en" }, m.deps);
    expect(r).toMatchObject({ blob: null, motivo: "fallo" });
    expect(m.llamadasGradio.map((l) => l.base)).toEqual([ING.base, MTL.base]);
    expect(estadoChatterbox(m.deps)).toBe("fuera");
    m.avanzar(10 * 60_000 + 1); // el servicio local se vuelve a probar a los 10 min
    expect(estadoChatterbox(m.deps)).toBe("dormido");
  });
});

// ── Descubrimiento con la API pública de HF ─────────────────────────────────

describe("descubrimiento de Spaces públicos", () => {
  const API = "https://huggingface.co/api/spaces?search=";

  it("busca, filtra (solo gradio y públicos) y sondea el contrato real", async () => {
    const m = montar({
      rutas: {
        [`${API}chatterbox&limit=60`]: [
          { id: "ResembleAI/Chatterbox", likes: 1762, sdk: "gradio" },
          { id: "OLAVAUD/Chatterbox_Unlimited", likes: 44, sdk: "gradio" },
          { id: "Jimmi42/chatterbox-tts-apple-silicon", likes: 34, sdk: "static" },
          { id: "privado/Chatterbox", likes: 9, sdk: "gradio", private: true },
        ],
        [`${API}Chatterbox-Multilingual-TTS&limit=60`]: [{ id: "rahul7star/Chatterbox-Multilingual-TTS", likes: 11, sdk: "gradio" }],
        "https://olavaud-chatterbox-unlimited.hf.space/config": { version: "5.35.0" },
        "https://olavaud-chatterbox-unlimited.hf.space/gradio_api/info": INFO_INGLES,
        "https://rahul7star-chatterbox-multilingual-tts.hf.space/config": { version: "4.44.0" },
      },
    });
    const snap = await descubrirSpacesChatterbox({ force: true }, m.deps);
    const ids = snap.spaces.map((s) => s.id);
    expect(ids.slice(0, 2)).toEqual([MTL.id, ING.id]); // los integrados siempre
    expect(ids).toContain("OLAVAUD/Chatterbox_Unlimited");
    expect(ids).not.toContain("rahul7star/Chatterbox-Multilingual-TTS"); // Gradio 4
    expect(m.pedidas.some((u) => u.includes("jimmi42") || u.includes("privado"))).toBe(false);
    expect(m.almacen.has("starseed.aurora.chatterbox.discovery.v1")).toBe(true);
  });

  it("si HF no responde no guarda nada (se reintenta la próxima vez)", async () => {
    const m = montar();
    const snap = await descubrirSpacesChatterbox({ force: true }, m.deps);
    expect(snap.spaces.map((s) => s.id)).toEqual([MTL.id, ING.id]);
    expect(m.almacen.has("starseed.aurora.chatterbox.discovery.v1")).toBe(false);
  });
});

// ── Registro de motores y cadena AUTO ────────────────────────────────────────

describe("registro y cadena de voz", () => {
  const CLAVE_SALUD = "starseed.aurora.chatterbox.health.v1";
  afterEach(() => safeRemove(CLAVE_SALUD));

  it("la ficha de Chatterbox es honesta: MIT, español, clonación y emociones", () => {
    const f = VOICE_ENGINE_REGISTRY.chatterbox;
    expect(f).toMatchObject({ id: "chatterbox", license: "MIT", spanish: true, cloning: true, emotions: true, requiresEndpoint: false });
    expect(f.requirements?.join(" ")).toMatch(/marca de agua Perth/);
    expect(f.requirements?.join(" ")).toMatch(/consentimiento/);
    expect(isNeuralEngine("chatterbox")).toBe(true);
    expect(isVoiceEngineId("chatterbox")).toBe(true);
  });

  it("OpenVoice V2 es MIT con uso comercial libre (ya no «CC-BY-NC»)", () => {
    expect(VOICE_ENGINE_REGISTRY.openvoice2.license).toMatch(/^MIT/);
    expect(VOICE_ENGINE_REGISTRY.openvoice2.license).not.toMatch(/NC/);
  });

  it("orden AUTO: detrás de OmniVoice y OpenVoice, sin quitar a nadie", () => {
    const antes = ["voice158", "vibevoice", "voxcpm", "voicebox", "gpt-sovits", "bark", "omnivoice", "openvoice2"];
    for (const id of antes) expect(AUTO_ENDPOINT_ORDER).toContain(id);
    expect(AUTO_ENDPOINT_ORDER.indexOf("chatterbox")).toBeGreaterThan(AUTO_ENDPOINT_ORDER.indexOf("omnivoice"));
    expect(AUTO_ENDPOINT_ORDER.indexOf("chatterbox")).toBeGreaterThan(AUTO_ENDPOINT_ORDER.indexOf("openvoice2"));
  });

  it("cadena en instalación cero: omnivoice → openvoice2 → chatterbox → kokoro", () => {
    const cfg = { ...getVoiceConfig(), engine: "browser" as const, auto: true };
    const cadena = buildVoiceChain(cfg, null);
    expect(cadena).toEqual(["omnivoice", "openvoice2", "chatterbox", "kokoro"]);
    // Y la jerarquía de la ventana de voz no lo manda detrás de Kokoro.
    const ordenada = applyVoiceChainPriority(cadena);
    expect(ordenada.indexOf("chatterbox")).toBeLessThan(ordenada.indexOf("kokoro"));
    expect(ordenada.indexOf("chatterbox")).toBeGreaterThan(ordenada.indexOf("omnivoice"));
  });

  it("con todo apartado la cadena lo salta sin coste y la UI lo da por inalcanzable", () => {
    const fuera = Date.now() + 60 * 60_000;
    const salud: Record<string, { badUntil: number }> = { local: { badUntil: fuera } };
    for (const s of CHATTERBOX_SPACES_INTEGRADOS) salud[s.id] = { badUntil: fuera };
    safeSet(CLAVE_SALUD, JSON.stringify(salud));
    const cfg = { ...getVoiceConfig(), engine: "browser" as const, auto: true };
    expect(buildVoiceChain(cfg, null)).toEqual(["omnivoice", "openvoice2", "kokoro"]);
    const fila = listVoiceEngines(cfg).find((r) => r.meta.id === "chatterbox");
    expect(fila?.availability).toBe("unreachable");
  });

  it("la UI enseña la latencia MEDIDA en cuanto existe", () => {
    safeSet(CLAVE_SALUD, JSON.stringify({ local: { lastOkAt: Date.now(), latenciaMs: 1_200 } }));
    const cfg = { ...getVoiceConfig(), engine: "browser" as const, auto: true };
    const fila = listVoiceEngines(cfg).find((r) => r.meta.id === "chatterbox");
    expect(fila?.meta.latency).toBe("medida aquí: local 1,2 s");
    expect(VOICE_ENGINE_REGISTRY.chatterbox.latency).not.toContain("medida aquí"); // la ficha no se toca
  });

  it("un orden guardado de antes conserva lo que la persona ordenó y suma Chatterbox detrás de OpenVoice", () => {
    const viejo = ["kokoro", "openvoice2", "omnivoice", "voicebox", "voxcpm", "bark", "gpt-sovits", "kitten", "browser"];
    const nuevo = completarPrioridad(viejo);
    // (VOZ1024B) La voz 1.58-bit y VibeVoice entran delante, su sitio en el registro.
    expect(nuevo).toEqual(["voice158", "vibevoice", "kokoro", "openvoice2", "chatterbox", "omnivoice", "voicebox", "voxcpm", "bark", "gpt-sovits", "kitten", "browser"]);
    expect(completarPrioridad("roto")).toEqual([]);
    expect(completarPrioridad(["inventado"])).toEqual([]);
  });
});
