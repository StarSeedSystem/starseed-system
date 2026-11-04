import { describe, it, expect } from "vitest";
import { aplicarPersonaAPerfil } from "../aplicar-persona-perfil";
import type { PersonalityProfile, VoiceAudioRef } from "../personalities";
import type { PortablePersona } from "../persona-coherence";

function crearPerfilBase(overrides?: Partial<PersonalityProfile>): PersonalityProfile {
    return {
        id: "test-perfil",
        name: "Test Persona",
        description: "Una persona de prueba",
        author: "Test",
        version: "1.0.0",
        createdAt: "2026-01-01T00:00:00.000Z",
        icon: "Sparkles",
        traits: {},
        prompts: { esencia: "", estilo: "", extra: "" },
        idioma: "es",
        idiomasSecundarios: [],
        generoVoz: "femenina",
        personaje: "Guía",
        cultura: "Universal",
        filosofia: "Equilibrio",
        responseStyle: { longitud: "equilibrada", formato: "adaptativo", recomendaciones: "proactivas" },
        tools: { enabledKinds: [], plugins: [], mcp: [], apis: [] },
        memoryPolicy: { usarMemorias: true, nivelContexto: "breve", cerebrosPermitidos: "todos" },
        voiceStyle: {},
        intelligence: { modo: "auto", permitirPago: false },
        knowledge: [],
        ...overrides,
    };
}

function crearPersonaBase(overrides?: Partial<PortablePersona>): PortablePersona {
    return {
        id: "test-persona",
        name: "Test Persona",
        emotion: "dulce",
        tone: "cercana",
        energy: 60,
        rate: 1.0,
        pitch: 1.0,
        ...overrides,
    };
}

describe("aplicarPersonaAPerfil", () => {
    it("aplica voiceStyle de la persona a un perfil sin voiceStyle", () => {
        const perfil = crearPerfilBase();
        const persona = crearPersonaBase({
            tone: "serena",
            emotion: "calma",
            rate: 0.95,
            pitch: 0.98,
            energy: 55,
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.tone).toBe("serena");
        expect(resultado.perfil.voiceStyle?.emotion).toBe("calma");
        expect(resultado.perfil.voiceStyle?.rate).toBe(0.95);
        expect(resultado.perfil.voiceStyle?.pitch).toBe(0.98);
        expect(resultado.perfil.voiceStyle?.energy).toBe(55);
    });

    it("preserva voiceStyle cuando el usuario ya lo personalizó", () => {
        const perfil = crearPerfilBase({
            voiceStyle: {
                tone: "cálido",
                emotion: "alegre",
                rate: 1.2,
                energy: 70,
            },
        });
        const persona = crearPersonaBase({
            tone: "serena",
            emotion: "calma",
            rate: 0.8,
            energy: 40,
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.tone).toBe("cálido");
        expect(resultado.perfil.voiceStyle?.emotion).toBe("alegre");
        expect(resultado.perfil.voiceStyle?.rate).toBe(1.2);
        expect(resultado.perfil.voiceStyle?.energy).toBe(70);
        expect(resultado.preservado).toContain("voiceStyle");
    });

    it("aplica audioRef cuando la persona tiene audioRefId", () => {
        const perfil = crearPerfilBase();
        const audioRefId: VoiceAudioRef = {
            kind: "builtin",
            voiceId: "kokoro-ef-dora",
            label: "Test Persona",
        };

        const persona = crearPersonaBase({
            name: "Test Persona",
            audioRefId: "kokoro-ef-dora",
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.audioRef?.kind).toBe("builtin");
        expect(resultado.perfil.voiceStyle?.audioRef?.voiceId).toBe("kokoro-ef-dora");
        expect(resultado.perfil.voiceStyle?.audioRef?.label).toBe("Test Persona");
    });

    it("preserva audioRef existente si la persona no tiene audioRefId", () => {
        const audioRefPrevio: VoiceAudioRef = {
            kind: "recorded",
            voiceId: "grabacion-mic",
            label: "Grabación del micrófono",
        };

        const perfil = crearPerfilBase({
            voiceStyle: { audioRef: audioRefPrevio },
        });
        const persona = crearPersonaBase();

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.audioRef).toEqual(audioRefPrevio);
        expect(resultado.preservado).toContain("audioRef");
    });

    it("actualiza audioRef cuando la persona tiene audioRefId y el perfil tiene uno diferente", () => {
        const perfil = crearPerfilBase({
            voiceStyle: {
                audioRef: {
                    kind: "library",
                    voiceId: "voz-antigua",
                    label: "Voz anterior",
                },
            },
        });
        const persona = crearPersonaBase({
            name: "Nueva Voz",
            audioRefId: "kokoro-em_alex",
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.audioRef?.voiceId).toBe("kokoro-em_alex");
    });

    it("añade el nombre de la persona como texto descriptivo en voiceStyle", () => {
        const perfil = crearPerfilBase();
        const persona = crearPersonaBase({
            name: "Mentora Sabia",
            tone: "serena",
            emotion: "confianza",
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.persona).toBe("Mentora Sabia");
    });

    it("mantiene otros campos del perfil sin modificar", () => {
        const perfil = crearPerfilBase({
            name: "Personalidad Original",
            generoVoz: "masculina",
            idioma: "en",
            intelligence: { modo: "fija", permitirPago: true },
        });
        const persona = crearPersonaBase({
            name: "Nueva Persona",
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.name).toBe("Personalidad Original");
        expect(resultado.perfil.generoVoz).toBe("masculina");
        expect(resultado.perfil.idioma).toBe("en");
        expect(resultado.perfil.intelligence?.modo).toBe("fija");
        expect(resultado.perfil.intelligence?.permitirPago).toBe(true);
    });

    it("mantiene otros campos del perfil sin modificar y preserva voiceStyle existente", () => {
        const perfil = crearPerfilBase({
            voiceStyle: { tone: "original" },
            name: "Nombre Original",
        });
        const persona = crearPersonaBase({
            tone: "nuevo",
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(perfil.voiceStyle?.tone).toBe("original");
        expect(perfil.name).toBe("Nombre Original");
        expect(resultado.perfil.voiceStyle?.tone).toBe("original");
        expect(resultado.perfil.name).toBe(perfil.name);
    });

    it("funciona con persona neutra sin cambios significativos", () => {
        const perfil = crearPerfilBase({
            voiceStyle: {
                tone: "cálido",
                emotion: "serena",
                rate: 1.0,
                pitch: 1.0,
                energy: 55,
            },
        });
        const persona = crearPersonaBase({
            tone: "cálido",
            emotion: "serena",
            rate: 1.0,
            pitch: 1.0,
            energy: 55,
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.tone).toBe("cálido");
        expect(resultado.perfil.voiceStyle?.emotion).toBe("serena");
    });

    it("clampa valores de rate y pitch al rango válido (0.5-2)", () => {
        const perfil = crearPerfilBase();
        const persona = crearPersonaBase({
            rate: 3.0,
            pitch: -0.5,
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.rate).toBe(2);
        expect(resultado.perfil.voiceStyle?.pitch).toBe(0.5);
    });

    it("clampa valores de energy al rango válido (0-100)", () => {
        const perfil = crearPerfilBase();
        const persona = crearPersonaBase({
            energy: 150,
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.energy).toBe(100);
    });

    it("preserva voiceStyle cuando preservarVoiceStyle es true por defecto", () => {
        const perfil = crearPerfilBase({
            voiceStyle: {
                tone: "cálido",
                emotion: "alegre",
            },
        });
        const persona = crearPersonaBase({
            tone: "serena",
            emotion: "calma",
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona);

        expect(resultado.perfil.voiceStyle?.tone).toBe("cálido");
        expect(resultado.perfil.voiceStyle?.emotion).toBe("alegre");
        expect(resultado.preservado).toContain("voiceStyle");
    });

    it("actualiza voiceStyle cuando preservarVoiceStyle es false", () => {
        const perfil = crearPerfilBase({
            voiceStyle: {
                tone: "cálido",
                emotion: "alegre",
            },
        });
        const persona = crearPersonaBase({
            tone: "serena",
            emotion: "calma",
        });

        const resultado = aplicarPersonaAPerfil(perfil, persona, {
            preservarVoiceStyle: false,
            preserverAudioRef: true,
        });

        expect(resultado.perfil.voiceStyle?.tone).toBe("serena");
        expect(resultado.perfil.voiceStyle?.emotion).toBe("calma");
    });
});