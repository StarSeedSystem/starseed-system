import { describe, expect, it } from "vitest";
import { decidirTraducir } from "../decidir-traducir";
import type { EntradaTraducir } from "../decidir-traducir";

describe("decidirTraducir", () => {
    const crearEntrada = (overrides: Partial<EntradaTraducir> = {}): EntradaTraducir => ({
        mensajeRecibido: "Hola, cómo estás",
        idiomaConversacion: "es",
        detectado: { codigo: "es", confianza: 0.95 },
        ...overrides,
    });

    describe("idioma-distinto", () => {
        it("llama cuando el mensaje está en inglés y la conversación es en español con confianza ≥0.8", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "Hello, how are you doing today?",
                    idiomaConversacion: "es",
                    detectado: { codigo: "en", confianza: 0.92 },
                })
            );
            expect(r.llamar).toBe(true);
            expect(r.razon).toBe("idioma-distinto");
            expect(r.destino).toBe("en");
        });

        it("llama cuando el mensaje está en francés y la conversación es en español", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "Bonjour, comment allez-vous?",
                    idiomaConversacion: "es",
                    detectado: { codigo: "fr", confianza: 0.85 },
                })
            );
            expect(r.llamar).toBe(true);
            expect(r.razon).toBe("idioma-distinto");
            expect(r.destino).toBe("fr");
        });

        it("no llama cuando la confianza es <0.8 incluso si el idioma es distinto", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "Hello there",
                    idiomaConversacion: "es",
                    detectado: { codigo: "en", confianza: 0.75 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama cuando el texto tiene menos de 12 letras", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "Hi",
                    idiomaConversacion: "es",
                    detectado: { codigo: "en", confianza: 0.9 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama cuando el idioma detectado coincide con el de conversación", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "Hola, cómo estás?",
                    idiomaConversacion: "es",
                    detectado: { codigo: "es", confianza: 0.95 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });
    });

    describe("peticion", () => {
        it("llama cuando la petición contiene 'traduce'", () => {
            const r = decidirTraducir(
                crearEntrada({
                    peticion: "Por favor, traduce esto al inglés",
                })
            );
            expect(r.llamar).toBe(true);
            expect(r.razon).toBe("peticion");
        });

        it("llama cuando la petición dice 'responde en inglés'", () => {
            const r = decidirTraducir(
                crearEntrada({
                    peticion: "Responde en inglés",
                })
            );
            expect(r.llamar).toBe(true);
            expect(r.razon).toBe("peticion");
            expect(r.destino).toBe("en");
        });

        it("llama cuando la petición dice 'en inglés'", () => {
            const r = decidirTraducir(
                crearEntrada({
                    peticion: "En inglés por favor",
                })
            );
            expect(r.llamar).toBe(true);
            expect(r.razon).toBe("peticion");
            expect(r.destino).toBe("en");
        });

        it("llama para varios idiomas: francés, alemán, portugués, italiano, ruso, chino, japonés, árabe", () => {
            const casos = [
                { texto: "Traduce en français", esperado: "fr" },
                { texto: "Responde en alemán", esperado: "de" },
                { texto: "En português", esperado: "pt" },
                { texto: "In italiano", esperado: "it" },
                { texto: "Na русском", esperado: "ru" },
                { texto: "中文", esperado: "zh" },
                { texto: "日本語", esperado: "ja" },
                { texto: "عربي", esperado: "ar" },
            ];

            for (const c of casos) {
                const r = decidirTraducir(crearEntrada({ peticion: c.texto }));
                expect(r.llamar).toBe(true);
                expect(r.razon).toBe("peticion");
                expect(r.destino).toBe(c.esperado);
            }
        });
    });

    describe("varias-personas", () => {
        it("llama para varias personas con idiomas distintos", () => {
            const r = decidirTraducir(
                crearEntrada({
                    destinatarios: [
                        { personaId: "1", idioma: "en" },
                        { personaId: "2", idioma: "es" },
                    ],
                })
            );
            expect(r.llamar).toBe(true);
            expect(r.razon).toBe("varias-personas");
            expect(r.destino).toBe("en");
        });

        it("asigna el primer idioma válido cuando hay varios destinos", () => {
            const r = decidirTraducir(
                crearEntrada({
                    destinatarios: [
                        { personaId: "1", idioma: "en" },
                        { personaId: "2", idioma: "fr" },
                    ],
                })
            );
            expect(r.llamar).toBe(true);
            expect(r.razon).toBe("varias-personas");
        });

        it("no llama cuando todos los destinatarios tienen el mismo idioma", () => {
            const r = decidirTraducir(
                crearEntrada({
                    destinatarios: [
                        { personaId: "1", idioma: "es" },
                        { personaId: "2", idioma: "es" },
                    ],
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });
    });

    describe("negativos (no llamar)", () => {
        it("no llama para códigos de hardware", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "CPU-Z 123.45",
                    idiomaConversacion: "es",
                    detectado: { codigo: null, confianza: 0 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama para URLs", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "Visita https://example.com",
                    idiomaConversacion: "es",
                    detectado: { codigo: null, confianza: 0 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama para números", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "El resultado es 42",
                    idiomaConversacion: "es",
                    detectado: { codigo: "es", confianza: 0.95 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama para nombres propios sin patrón de traducción", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "Juan Pérez y María García",
                    idiomaConversacion: "es",
                    detectado: { codigo: "es", confianza: 0.95 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama cuando la petición no contiene palabras de traducción", () => {
            const r = decidirTraducir(
                crearEntrada({
                    peticion: "Hola, cómo estás hoy?",
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama cuando el idioma detectado es null", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "some random text without clear pattern",
                    idiomaConversacion: "es",
                    detectado: { codigo: null, confianza: 0 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama para un solo destinatario", () => {
            const r = decidirTraducir(
                crearEntrada({
                    destinatarios: [{ personaId: "1", idioma: "en" }],
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });

        it("no llama para texto con símbolos sin letras", () => {
            const r = decidirTraducir(
                crearEntrada({
                    mensajeRecibido: "💻🚀🔥",
                    idiomaConversacion: "es",
                    detectado: { codigo: null, confianza: 0 },
                })
            );
            expect(r.llamar).toBe(false);
            expect(r.razon).toBe("ninguna");
        });
    });
});