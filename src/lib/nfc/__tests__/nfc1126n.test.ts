import { describe, it, expect } from "vitest";
import {
  TIPO_AUDIO,
  MODO_REPRODUCCION,
  VOLUMEN_DEFECTO,
  IDIOMA_DEFECTO,
  type TipoAudio,
  type ModoReproduccion,
  type ConfigAudioNodo,
  type PreferenciasAudioVisitante,
  type AudioDisponible,
  configAudioPorDefecto,
  validarConfigAudio,
  resolverPreferenciasAudio,
  audioDisponibleOffline,
  filtrarAudioPorIdioma,
  tipoAudioValido,
  modoReproduccionValido,
} from "../nodo-audio";

describe("NFC1126N · tipos y constantes", () => {
  it("expone los tres tipos de audio", () => {
    expect(TIPO_AUDIO).toEqual(["audioguia", "descripcion_zona", "nodo_informativo"]);
  });
  it("expone los tres modos de reproducción", () => {
    expect(MODO_REPRODUCCION).toEqual(["al_acercarse", "preguntar", "no_reproducir"]);
  });
  it("tiene volumen e idioma por defecto razonables", () => {
    expect(VOLUMEN_DEFECTO).toBeGreaterThan(0);
    expect(VOLUMEN_DEFECTO).toBeLessThanOrEqual(1);
    expect(typeof IDIOMA_DEFECTO).toBe("string");
    expect(IDIOMA_DEFECTO.length).toBeGreaterThan(0);
  });
});

describe("NFC1126N · validación de configuración de audio del nodo", () => {
  it("configuración por defecto es válida", () => {
    const r = validarConfigAudio(configAudioPorDefecto("audioguia"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.tipo).toBe("audioguia");
  });

  it("rechaza tipo de audio desconocido", () => {
    const r = validarConfigAudio({ ...configAudioPorDefecto("audioguia"), tipo: "desconocido" as any });
    expect(r.ok).toBe(false);
  });

  it("rechaza título vacío o muy largo", () => {
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), titulo: "" }).ok).toBe(false);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), titulo: "x".repeat(81) }).ok).toBe(false);
  });

  it("rechaza audio URL inválida", () => {
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), audioUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), audioUrl: "ftp://example.com/audio.mp3" }).ok).toBe(false);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), audioUrl: "/audio/local.mp3" }).ok).toBe(true);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), audioUrl: "https://example.com/audio.mp3" }).ok).toBe(true);
  });

  it("rechaza duración negativa o cero", () => {
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), duracionSegundos: 0 }).ok).toBe(false);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), duracionSegundos: -1 }).ok).toBe(false);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), duracionSegundos: 300 }).ok).toBe(true);
  });

  it("rechaza volumen fuera de rango", () => {
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), volumen: -0.1 }).ok).toBe(false);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), volumen: 1.1 }).ok).toBe(false);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), volumen: 0.5 }).ok).toBe(true);
  });

  it("acepta idiomas válidos (códigos ISO)", () => {
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), idioma: "es" }).ok).toBe(true);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), idioma: "en-US" }).ok).toBe(true);
    expect(validarConfigAudio({ ...configAudioPorDefecto("audioguia"), idioma: "zh-CN" }).ok).toBe(true);
  });
});

describe("NFC1126N · preferencias de audio del visitante", () => {
  const configBase = configAudioPorDefecto("audioguia");

  it("preferencias por defecto: preguntar, idioma del sistema, volumen medio, no guardar", () => {
    const prefs = resolverPreferenciasAudio(configBase, undefined);
    expect(prefs.modo).toBe("preguntar");
    expect(prefs.idioma).toBe(IDIOMA_DEFECTO);
    expect(prefs.volumen).toBe(VOLUMEN_DEFECTO);
    expect(prefs.guardarEnBiblioteca).toBe(false);
  });

  it("preferencias personalizadas del visitante prevalecen", () => {
    const visitante: PreferenciasAudioVisitante = {
      modo: "al_acercarse",
      idioma: "en",
      volumen: 0.8,
      guardarEnBiblioteca: true,
    };
    const prefs = resolverPreferenciasAudio(configBase, visitante);
    expect(prefs.modo).toBe("al_acercarse");
    expect(prefs.idioma).toBe("en");
    expect(prefs.volumen).toBe(0.8);
    expect(prefs.guardarEnBiblioteca).toBe(true);
  });

  it("modo 'no_reproducir' anula todo lo demás", () => {
    const prefs = resolverPreferenciasAudio(configBase, { modo: "no_reproducir" });
    expect(prefs.modo).toBe("no_reproducir");
  });
});

describe("NFC1126N · disponibilidad offline", () => {
  it("audio en el nodo (data URL o archivo local) está disponible offline", () => {
    const local: AudioDisponible = { url: "/audio/guia.mp3", idioma: "es", tamanoBytes: 5_000_000, enNodo: true };
    const dataUrl: AudioDisponible = { url: "data:audio/mp3;base64,ABC...", idioma: "es", tamanoBytes: 100_000, enNodo: true };
    expect(audioDisponibleOffline(local)).toBe(true);
    expect(audioDisponibleOffline(dataUrl)).toBe(true);
  });

  it("audio remoto no está disponible offline salvo que ya esté descargado", () => {
    const remoto: AudioDisponible = { url: "https://example.com/audio.mp3", idioma: "es", tamanoBytes: 5_000_000, enNodo: false, descargado: false };
    const descargado: AudioDisponible = { ...remoto, descargado: true };
    expect(audioDisponibleOffline(remoto)).toBe(false);
    expect(audioDisponibleOffline(descargado)).toBe(true);
  });
});

describe("NFC1126N · filtrado por idioma", () => {
  const audios: AudioDisponible[] = [
    { url: "/es.mp3", idioma: "es", tamanoBytes: 1000, enNodo: true },
    { url: "/en.mp3", idioma: "en", tamanoBytes: 1000, enNodo: true },
    { url: "/fr.mp3", idioma: "fr", tamanoBytes: 1000, enNodo: true },
  ];

  it("devuelve el audio en el idioma solicitado si existe", () => {
    const r = filtrarAudioPorIdioma(audios, "en");
    expect(r).toHaveLength(1);
    expect(r[0].idioma).toBe("en");
  });

  it("si no hay coincidencia exacta, busca por prefijo (es → es-ES)", () => {
    const conRegionales: AudioDisponible[] = [
      { url: "/es-ES.mp3", idioma: "es-ES", tamanoBytes: 1000, enNodo: true },
      { url: "/es-MX.mp3", idioma: "es-MX", tamanoBytes: 1000, enNodo: true },
    ];
    const r = filtrarAudioPorIdioma(conRegionales, "es");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("si no hay nada, devuelve array vacío", () => {
    expect(filtrarAudioPorIdioma(audios, "de")).toHaveLength(0);
  });
});

describe("NFC1126N · validadores de tipos", () => {
  it("tipoAudioValido reconoce los tres tipos", () => {
    expect(tipoAudioValido("audioguia")).toBe(true);
    expect(tipoAudioValido("descripcion_zona")).toBe(true);
    expect(tipoAudioValido("nodo_informativo")).toBe(true);
    expect(tipoAudioValido("otro")).toBe(false);
  });

  it("modoReproduccionValido reconoce los tres modos", () => {
    expect(modoReproduccionValido("al_acercarse")).toBe(true);
    expect(modoReproduccionValido("preguntar")).toBe(true);
    expect(modoReproduccionValido("no_reproducir")).toBe(true);
    expect(modoReproduccionValido("auto")).toBe(false);
  });
});