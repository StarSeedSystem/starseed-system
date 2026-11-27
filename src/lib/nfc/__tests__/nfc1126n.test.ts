import { describe, it, expect } from "vitest";
import {
  TIPO_AUDIO,
  MODO_REPRODUCCION,
  validarAudioNodo,
  configAudioPorDefecto,
  preferenciasVisitantePorDefecto,
  audioDisponibleOffline,
  resolverPreferenciasVisitante,
  type TipoAudio,
  type ModoReproduccion,
  type ConfigAudioNodo,
  type PreferenciasVisitanteAudio,
  type PreferenciasVisitanteResueltas,
} from "../tipos";

describe("nodo-audio · tipos y constantes", () => {
  it("expone los tres tipos de audio", () => {
    expect(TIPO_AUDIO).toEqual(["audioguia", "descripcion_zona", "nodo_informativo"]);
  });

  it("expone los tres modos de reproducción", () => {
    expect(MODO_REPRODUCCION).toEqual(["al_acercarse", "preguntar", "no_reproducir"]);
  });
});

describe("nodo-audio · validación de configuración", () => {
  const baseValida = (o: Partial<ConfigAudioNodo> = {}): ConfigAudioNodo => ({
    version: 1,
    tipo: "audioguia",
    titulo: "Audioguía Museo",
    descripcion: "Descripción de la audioguía",
    pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "/audio/sala1.mp3", idioma: "es" }],
    idiomaPrincipal: "es",
    idiomasDisponibles: ["es", "en"],
    modoReproduccion: "preguntar",
    volumenDefecto: 0.8,
    guardarEnBiblioteca: true,
    ...o,
  });

  it("acepta una configuración correcta de audioguía", () => {
    const r = validarAudioNodo(baseValida());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.tipo).toBe("audioguia");
  });

  it("acepta descripción de zona", () => {
    const r = validarAudioNodo(baseValida({ tipo: "descripcion_zona", titulo: "Zona arqueológica" }));
    expect(r.ok).toBe(true);
  });

  it("acepta nodo informativo", () => {
    const r = validarAudioNodo(baseValida({ tipo: "nodo_informativo", titulo: "Punto de información" }));
    expect(r.ok).toBe(true);
  });

  it("rechaza tipo desconocido", () => {
    const r = validarAudioNodo(baseValida({ tipo: "desconocido" as TipoAudio }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.some((e) => e.toLowerCase().includes("tipo"))).toBe(true);
  });

  it("requiere título entre 1 y 80 caracteres", () => {
    expect(validarAudioNodo(baseValida({ titulo: "" })).ok).toBe(false);
    expect(validarAudioNodo(baseValida({ titulo: "a".repeat(81) })).ok).toBe(false);
  });

  it("requiere al menos una pista", () => {
    expect(validarAudioNodo(baseValida({ pistas: [] })).ok).toBe(false);
  });

  it("valida cada pista: id, título, duración, url, idioma", () => {
    const sinId = baseValida({ pistas: [{ id: "", titulo: "Sala 1", duracionSeg: 120, url: "/audio/sala1.mp3", idioma: "es" }] });
    expect(validarAudioNodo(sinId).ok).toBe(false);

    const duracionNegativa = baseValida({ pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: -5, url: "/audio/sala1.mp3", idioma: "es" }] });
    expect(validarAudioNodo(duracionNegativa).ok).toBe(false);

    const urlInvalida = baseValida({ pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "javascript:alert(1)", idioma: "es" }] });
    expect(validarAudioNodo(urlInvalida).ok).toBe(false);

    const httpUrl = baseValida({ pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "http://x.org/audio.mp3", idioma: "es" }] });
    expect(validarAudioNodo(httpUrl).ok).toBe(false);

    const httpsValido = baseValida({ pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "https://cdn.example.com/audio.mp3", idioma: "es" }] });
    expect(validarAudioNodo(httpsValido).ok).toBe(true);

    const rutaInterna = baseValida({ pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "/audio/sala1.mp3", idioma: "es" }] });
    expect(validarAudioNodo(rutaInterna).ok).toBe(true);
  });

  it("idioma principal debe estar en idiomas disponibles", () => {
    const r = validarAudioNodo(baseValida({ idiomaPrincipal: "fr", idiomasDisponibles: ["es", "en"] }));
    expect(r.ok).toBe(false);
  });

  it("modo de reproducción debe ser válido", () => {
    expect(validarAudioNodo(baseValida({ modoReproduccion: "invalido" as ModoReproduccion })).ok).toBe(false);
  });

  it("volumen defecto entre 0 y 1", () => {
    expect(validarAudioNodo(baseValida({ volumenDefecto: -0.1 })).ok).toBe(false);
    expect(validarAudioNodo(baseValida({ volumenDefecto: 1.1 })).ok).toBe(false);
    expect(validarAudioNodo(baseValida({ volumenDefecto: 0 })).ok).toBe(true);
    expect(validarAudioNodo(baseValida({ volumenDefecto: 1 })).ok).toBe(true);
  });

  it("junta todos los errores", () => {
    const r = validarAudioNodo({ version: 2, tipo: "x", titulo: "", pistas: [], idiomaPrincipal: "xx", idiomasDisponibles: [], modoReproduccion: "x", volumenDefecto: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.length).toBeGreaterThanOrEqual(5);
  });
});

describe("nodo-audio · configuración por defecto", () => {
  it("devuelve config base para cada tipo", () => {
    const audioguia = configAudioPorDefecto("audioguia");
    expect(audioguia.tipo).toBe("audioguia");
    expect(audioguia.modoReproduccion).toBe("preguntar");
    expect(audioguia.volumenDefecto).toBe(0.8);
    expect(audioguia.guardarEnBiblioteca).toBe(true);

    const zona = configAudioPorDefecto("descripcion_zona");
    expect(zona.tipo).toBe("descripcion_zona");
    expect(zona.modoReproduccion).toBe("al_acercarse");

    const informativo = configAudioPorDefecto("nodo_informativo");
    expect(informativo.tipo).toBe("nodo_informativo");
    expect(informativo.modoReproduccion).toBe("preguntar");
  });
});

describe("nodo-audio · preferencias del visitante", () => {
  it("preferencias por defecto: preguntar, idioma del sistema, volumen 0.8, guardar true", () => {
    const prefs = preferenciasVisitantePorDefecto();
    expect(prefs.modoReproduccion).toBe("preguntar");
    expect(prefs.idiomaPreferido).toBe("auto");
    expect(prefs.volumen).toBe(0.8);
    expect(prefs.guardarEnBiblioteca).toBe(true);
  });

  it("resolver: preferencias del visitante tienen prioridad sobre config del nodo", () => {
    const config: ConfigAudioNodo = baseValida({ modoReproduccion: "al_acercarse", volumenDefecto: 0.5, guardarEnBiblioteca: false });
    const prefsVisitante: PreferenciasVisitanteAudio = { modoReproduccion: "no_reproducir", idiomaPreferido: "en", volumen: 0.3, guardarEnBiblioteca: true };
    const resueltas = resolverPreferenciasVisitante(config, prefsVisitante);
    expect(resueltas.modoReproduccion).toBe("no_reproducir");
    expect(resueltas.idioma).toBe("en");
    expect(resueltas.volumen).toBe(0.3);
    expect(resueltas.guardarEnBiblioteca).toBe(true);
  });

  it("resolver: idioma 'auto' usa el principal del nodo", () => {
    const config: ConfigAudioNodo = baseValida({ idiomaPrincipal: "es", idiomasDisponibles: ["es", "en"] });
    const prefsVisitante: PreferenciasVisitanteAudio = { modoReproduccion: "preguntar", idiomaPreferido: "auto", volumen: 0.8, guardarEnBiblioteca: true };
    const resueltas = resolverPreferenciasVisitante(config, prefsVisitante);
    expect(resueltas.idioma).toBe("es");
  });

  it("resolver: idioma preferido no disponible cae al principal", () => {
    const config: ConfigAudioNodo = baseValida({ idiomaPrincipal: "es", idiomasDisponibles: ["es", "en"] });
    const prefsVisitante: PreferenciasVisitanteAudio = { modoReproduccion: "preguntar", idiomaPreferido: "fr", volumen: 0.8, guardarEnBiblioteca: true };
    const resueltas = resolverPreferenciasVisitante(config, prefsVisitante);
    expect(resueltas.idioma).toBe("es");
  });

  it("resolver: volumen del visitante clamp 0-1", () => {
    const config: ConfigAudioNodo = baseValida();
    const prefsVisitante: PreferenciasVisitanteAudio = { modoReproduccion: "preguntar", idiomaPreferido: "auto", volumen: 1.5, guardarEnBiblioteca: true };
    const resueltas = resolverPreferenciasVisitante(config, prefsVisitante);
    expect(resueltas.volumen).toBe(1);
  });
});

describe("nodo-audio · disponibilidad offline", () => {
  it("audio en el nodo (rutas internas) → disponible offline", () => {
    const config: ConfigAudioNodo = baseValida({ pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "/audio/sala1.mp3", idioma: "es" }] });
    expect(audioDisponibleOffline(config, new Set())).toBe(true);
  });

  it("audio en CDN https → no disponible offline salvo que esté descargado", () => {
    const config: ConfigAudioNodo = baseValida({ pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "https://cdn.example.com/audio.mp3", idioma: "es" }] });
    expect(audioDisponibleOffline(config, new Set())).toBe(false);
    expect(audioDisponibleOffline(config, new Set(["p1"]))).toBe(true);
  });

  it("mix de local y remoto: offline si al menos una pista local o descargada", () => {
    const config: ConfigAudioNodo = baseValida({
      pistas: [
        { id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "/audio/sala1.mp3", idioma: "es" },
        { id: "p2", titulo: "Sala 2", duracionSeg: 180, url: "https://cdn.example.com/sala2.mp3", idioma: "es" },
      ],
    });
    expect(audioDisponibleOffline(config, new Set())).toBe(true);
  });
});

const baseValida = (o: Partial<ConfigAudioNodo> = {}): ConfigAudioNodo => ({
  version: 1,
  tipo: "audioguia",
  titulo: "Audioguía Museo",
  descripcion: "Descripción de la audioguía",
  pistas: [{ id: "p1", titulo: "Sala 1", duracionSeg: 120, url: "/audio/sala1.mp3", idioma: "es" }],
  idiomaPrincipal: "es",
  idiomasDisponibles: ["es", "en"],
  modoReproduccion: "preguntar",
  volumenDefecto: 0.8,
  guardarEnBiblioteca: true,
  ...o,
});