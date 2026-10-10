import { describe, expect, it } from "vitest";
import { MOMENTO_LIBRE } from "@/lib/actualizaciones/momento";
import { politicaPorDefecto } from "@/lib/actualizaciones/politica";
import { siguienteEstado } from "@/lib/actualizaciones/planificador";
import { planAplicar, sanearApunte } from "../aplicacion";
import { evaluarCalidad, eventoDeCalidad, factorTiempoReal, rms, tasaErrorPalabras } from "../calidad";
import { AJUSTES_POR_DEFECTO, decidirMejora, sanearAjustes, type ContextoMejora } from "../decision";
import { compararVersionLibre, detectarMejoras, type Hallazgo } from "../hallazgos";
import { construirInforme, informeVacio } from "../informe";
import { REGISTRO_SISTEMAS, sistemaPorId } from "../registro";
import type { HuellaAparato } from "../tipos";

const MAC: HuellaAparato = {
  neuronaId: "mac",
  nombre: "Mac M1",
  sistema: "macos",
  ramMb: 16384,
  ramEsCota: false,
  discoLibreMb: 80_000,
  cuotaWebLibreMb: null,
  nucleos: 8,
  gpu: { familia: "apple", vramMb: null },
  aceleraciones: ["cpu", "metal"],
  aceleracionesInferidas: false,
  medios: ["servidor"],
  enLinea: true,
  medida: "sondeo",
};

const PC_CUDA: HuellaAparato = { ...MAC, neuronaId: "pc", nombre: "PC Linux", sistema: "linux", ramMb: 65536, gpu: { familia: "nvidia", vramMb: 24576 }, aceleraciones: ["cpu", "cuda", "vulkan"], nucleos: 16 };

const ctx = (extra: Partial<ContextoMejora> = {}): ContextoMejora => ({
  politica: { ...politicaPorDefecto("os"), servicios: { modo: "automatica-todas" }, modelos: { modo: "automatica-todas" } },
  ahoraH: 12,
  esNeuronaElegida: false,
  momento: MOMENTO_LIBRE,
  enUso: [],
  ...extra,
});

function hallazgosMac(instaladas: Record<string, { version: string }>, remotas: Record<string, { version: string | null; fecha?: string | null; verificable?: boolean }>): Hallazgo[] {
  return detectarMejoras({
    registro: REGISTRO_SISTEMAS,
    huella: MAC,
    instaladas,
    remotas: Object.fromEntries(Object.entries(remotas).map(([k, v]) => [k, { fecha: null, ...v }])),
    otras: [PC_CUDA],
  });
}

const buscar = (hs: Hallazgo[], id: string): Hallazgo => {
  const h = hs.find((x) => x.sistema.id === id);
  if (!h) throw new Error(`sin hallazgo ${id}`);
  return h;
};

describe("comparar versiones sin inventar orden", () => {
  it.each([
    ["v0.40.1", "v0.40.2", "nueva"],
    ["0.40.2", "v0.40.2", "igual"],
    ["0.40.10", "0.40.9", "anterior"],
    ["2026-07-23", "2026-09-01", "nueva"],
    ["1.2.0-rc1", "1.2.0", "nueva"],
    ["66e7802", "66e7802aabbcc", "igual"],
    ["66e7802", "1939ad2", "nueva"],
    ["20250606v2pro", "20251001v3", "desconocida"],
    [null, "1.0", "desconocida"],
  ] as const)("%s → %s = %s", (a, b, esperado) => {
    expect(compararVersionLibre(a, b)).toBe(esperado);
  });
});

describe("hallazgos por neurona", () => {
  const hs = hallazgosMac(
    { "omnivoice-cpp": { version: "a1b2c3d" }, "whisper-cpp": { version: "v1.9.5" }, ollama: { version: "0.40.1" }, piper: { version: "v1.8.0" } },
    { "omnivoice-cpp": { version: "b549668" }, "whisper-cpp": { version: "v1.9.5" }, ollama: { version: "v0.40.2", verificable: true }, "vibeasr-cpp": { version: "66e7802", verificable: true } },
  );

  it("versión nueva de lo instalado; al día lo que coincide", () => {
    expect(buscar(hs, "ollama").estado).toBe("nueva-version");
    expect(buscar(hs, "omnivoice-cpp").estado).toBe("nueva-version");
    expect(buscar(hs, "whisper-cpp").estado).toBe("al-dia");
  });

  it("sistema mejor que cabe → instalable-nuevo; uno peor que lo instalado no se lista", () => {
    // VibeASR (preferencia 4) mejora a whisper.cpp (3) en voz-asr y cabe en la Mac.
    expect(buscar(hs, "vibeasr-cpp").estado).toBe("instalable-nuevo");
    // Kitten (2) no mejora a OmniVoice (4).
    expect(hs.find((h) => h.sistema.id === "kitten-tts")).toBeUndefined();
  });

  it("mejora que no cabe aquí dice dónde sí; si no mejora lo que ya usas, ni se lista", () => {
    // Nada de imagen/vídeo instalado: Wan 2.2 (CUDA) no cabe en la Mac y sí en el PC.
    const w = buscar(hs, "wan-2.2");
    expect(w.estado).toBe("no-cabe");
    expect(w.alternativa?.neuronaId).toBe("pc");
    // GPT-SoVITS (4) no mejora a OmniVoice (4), que ya está instalado.
    expect(hs.find((h) => h.sistema.id === "gpt-sovits")).toBeUndefined();
  });

  it("lo que viaja con el OS se marca aparte y lo instalado sin dato de fuente queda en sin-dato", () => {
    expect(buscar(hs, "web-llm").estado).toBe("con-el-os");
    const piper = buscar(hs, "piper");
    expect(piper.estado).toBe("sin-dato");
    expect(piper.errorFuente).toMatch(/Sin sondeo/);
  });

  it("orden: primero las versiones nuevas", () => {
    expect(hs[0].estado).toBe("nueva-version");
  });
});

describe("decisión en este orden", () => {
  const hs = hallazgosMac({ ollama: { version: "0.40.1" }, "whisper-cpp": { version: "v1.9.5" } }, { ollama: { version: "v0.40.2" }, "vibeasr-cpp": { version: "66e7802" }, "stable-audio-open-small": { version: "dc620d9", verificable: true } });
  const ollama = buscar(hs, "ollama");

  it("aplica una versión nueva con política automática y buen momento", () => {
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, ctx())).toMatchObject({ accion: "aplicar", motivo: "listo" });
  });

  it("los ajustes de la familia mandan: nunca / avisar", () => {
    const nunca = sanearAjustes({ familias: { codigo: "nunca" } });
    expect(decidirMejora(ollama, nunca, ctx()).motivo).toBe("desactivada");
    const avisar = sanearAjustes({ familias: { codigo: "avisar", "voz-tts": "basura" } });
    expect(avisar.familias["voz-tts"]).toBe("auto");
    expect(decidirMejora(ollama, avisar, ctx()).accion).toBe("avisar");
  });

  it("sistema nuevo: solo aviso salvo «instalar sistemas nuevos»", () => {
    const vibe = buscar(hs, "vibeasr-cpp");
    expect(decidirMejora(vibe, AJUSTES_POR_DEFECTO, ctx()).motivo).toBe("nuevo-sin-permiso");
    // Con permiso y huella en el catálogo firmado → aplica.
    expect(decidirMejora(vibe, { ...AJUSTES_POR_DEFECTO, instalarNuevos: true }, ctx()).accion).toBe("aplicar");
  });

  it("pesos sin huella sha256 verificable no se instalan solos", () => {
    const h = { ...buscar(hs, "vibeasr-cpp"), sistema: { ...sistemaPorId("musicgen-small")!, preferencia: 5 }, verificable: false };
    expect(decidirMejora(h, { ...AJUSTES_POR_DEFECTO, instalarNuevos: true }, ctx()).motivo).toBe("sin-huella");
  });

  it("licencia condicionada: siempre aviso", () => {
    const h = { ...buscar(hs, "vibeasr-cpp"), sistema: sistemaPorId("stable-audio-open-small")! };
    expect(decidirMejora(h, { ...AJUSTES_POR_DEFECTO, instalarNuevos: true }, ctx()).motivo).toBe("licencia");
  });

  it("canaria: las demás esperan; retirada si falló", () => {
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, ctx({ despliegue: { estado: "canaria", esCanaria: false } })).motivo).toBe("esperando-canaria");
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, ctx({ despliegue: { estado: "canaria", esCanaria: true } })).accion).toBe("aplicar");
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, ctx({ despliegue: { estado: "revertido", esCanaria: true } })).motivo).toBe("retirada");
  });

  it("política de la entidad: manual avisa; programada fuera de ventana pospone", () => {
    const manual = ctx({ politica: politicaPorDefecto("os") });
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, manual).motivo).toBe("politica-avisar");
    const prog = ctx({ politica: { ...politicaPorDefecto("os"), servicios: { modo: "programada", ventana: { desdeH: 3, hastaH: 6 } } } });
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, prog).motivo).toBe("ventana");
  });

  it("momento seguro y familia en uso", () => {
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, ctx({ enUso: ["codigo"] })).motivo).toBe("en-uso");
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, ctx({ momento: { ...MOMENTO_LIBRE, enLlamada: true } })).motivo).toBe("llamada");
    expect(decidirMejora(ollama, AJUSTES_POR_DEFECTO, ctx({ momento: { ...MOMENTO_LIBRE, bateriaPct: 10 } })).motivo).toBe("bateria-baja");
  });

  it("al día, sin dato, no cabe y con el OS no hacen nada", () => {
    for (const id of ["whisper-cpp", "gpt-sovits", "web-llm"]) expect(decidirMejora(buscar(hs, id), AJUSTES_POR_DEFECTO, ctx()).accion).toBe("nada");
    expect(decidirMejora(buscar(hs, "gpt-sovits"), AJUSTES_POR_DEFECTO, ctx()).texto).toMatch(/Cabe en PC Linux/);
  });
});

describe("calidad", () => {
  it("WER por distancia de palabras", () => {
    expect(tasaErrorPalabras("hola mundo estelar", "hola mundo estelar").wer).toBe(0);
    const r = tasaErrorPalabras("enciende la luz del salón", "enciende luz del salon ya");
    expect(r).toMatchObject({ borrados: 1, sustituciones: 1, inserciones: 1, palabrasReferencia: 5 });
    expect(r.wer).toBeCloseTo(0.6);
    expect(tasaErrorPalabras("¡Hola, Mundo!", "hola mundo").wer).toBe(0);
    expect(tasaErrorPalabras("salón", "salon", { ignorarTildes: true }).wer).toBe(0);
    expect(tasaErrorPalabras("", "").wer).toBe(0);
  });

  it("RTF y RMS", () => {
    expect(factorTiempoReal(2, 10)).toBe(0.2);
    expect(factorTiempoReal(1, 0)).toBeNull();
    expect(rms([0, 0, 0])).toBe(0);
    expect(rms([1, -1])).toBe(1);
  });

  it("ASR: pasa con margen; revierte si transcribe peor que la anterior", () => {
    expect(evaluarCalidad("voz-asr", { rtf: 0.3, wer: 0.08 }, { rtf: 0.35, wer: 0.09 }).pasa).toBe(true);
    const peor = evaluarCalidad("voz-asr", { rtf: 0.3, wer: 0.12 }, { rtf: 0.3, wer: 0.08 });
    expect(peor.pasa).toBe(false);
    expect(peor.resumen).toMatch(/Transcribe peor/);
    expect(evaluarCalidad("voz-asr", { rtf: 0.7, wer: 0.05 }).pasa).toBe(false);
    expect(evaluarCalidad("voz-asr", {}).pasa).toBe(false);
  });

  it("TTS, sonido, audiovisual y código", () => {
    expect(evaluarCalidad("voz-tts", { latenciaPrimerAudioMs: 400, salidaValida: true }, { latenciaPrimerAudioMs: 600 }).mejoras[0]).toMatch(/Habla antes/);
    expect(evaluarCalidad("voz-tts", { latenciaPrimerAudioMs: 900 }, { latenciaPrimerAudioMs: 600 }).pasa).toBe(false);
    expect(evaluarCalidad("sonido", { rms: 0, rtf: 1 }).pasa).toBe(false);
    expect(evaluarCalidad("sonido", { rms: 0.2, rtf: 2, desvioDuracion: 0.02 }).pasa).toBe(true);
    expect(evaluarCalidad("audiovisual", { salidaValida: true, segundosPorUnidad: 4 }, { segundosPorUnidad: 2 }).pasa).toBe(false);
    expect(evaluarCalidad("codigo", { tokensPorSegundo: 30, aciertos: 0.9 }, { tokensPorSegundo: 25, aciertos: 0.88 }).pasa).toBe(true);
    expect(evaluarCalidad("codigo", { tokensPorSegundo: 30, aciertos: 0.7 }, { tokensPorSegundo: 25, aciertos: 0.88 }).pasa).toBe(false);
  });

  it("alimenta la máquina de la canaria: pasa → propagando; falla → revirtiendo", () => {
    expect(siguienteEstado("canaria", eventoDeCalidad(evaluarCalidad("codigo", { tokensPorSegundo: 20 })))).toBe("propagando");
    expect(siguienteEstado("canaria", eventoDeCalidad(evaluarCalidad("codigo", { tokensPorSegundo: 1 })))).toBe("revirtiendo");
  });
});

describe("plan de aplicación e informe", () => {
  it("modelos y servicios se instalan junto a lo actual y conservan la anterior; con el OS no tiene plan", () => {
    const m = planAplicar(sistemaPorId("vibeasr-cpp")!);
    expect(m?.pasos).toEqual(["comprobar-espacio", "descargar", "verificar-huella", "prueba-calidad", "conmutar", "observar", "conservar-anterior"]);
    const s = planAplicar(sistemaPorId("ollama")!);
    expect(s?.pasos.indexOf("instalar-junto")).toBeLessThan(s!.pasos.indexOf("conmutar"));
    expect(s?.pasos.indexOf("prueba-calidad")).toBeLessThan(s!.pasos.indexOf("conmutar"));
    expect(planAplicar(sistemaPorId("web-llm")!)).toBeNull();
  });

  it("historial saneado e informe por neurona con estados honestos", () => {
    expect(sanearApunte({ sistemaId: "x" })).toBeNull();
    const ap = sanearApunte({ sistemaId: "ollama", neuronaId: "mac", accion: "aplicada", de: "0.40.1", a: "0.40.2", cuando: "2026-10-10T10:00:00Z", motivo: "Aplicada.", calidad: "31 tok/s" });
    expect(ap?.calidad).toBe("31 tok/s");

    const hs = hallazgosMac({ ollama: { version: "0.40.1" } }, { ollama: { version: "v0.40.2" } });
    const decs = hs.map((h) => decidirMejora(h, AJUSTES_POR_DEFECTO, ctx({ enUso: ["codigo"] })));
    const inf = construirInforme(MAC, hs, decs, ap ? [ap] : []);
    expect(inf.aparato).toBe("macOS · 16 GB · Metal · servicio local");
    expect(inf.pospuestas.find((f) => f.sistemaId === "ollama")?.texto).toMatch(/en uso/);
    expect(inf.aplicadas[0]).toMatchObject({ sistemaId: "ollama", de: "0.40.1", a: "0.40.2" });
    expect(inf.noCaben.find((f) => f.sistemaId === "gpt-sovits")?.mejorEn).toBe("PC Linux");
    expect(informeVacio(inf)).toBe(false);
  });
});
