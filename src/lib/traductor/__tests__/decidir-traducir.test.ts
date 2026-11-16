import { describe, expect, it } from "vitest";
import { decidirTraducir, type EntradaDecidirTraducir } from "../decidir-traducir";

const entradaBase: EntradaDecidirTraducir = {
    mensajeRecibido: "",
    idiomaConversacion: "es",
    detectado: { codigo: null, confianza: 0 },
};

describe("decidirTraducir", () => {
    describe("regla (a): idioma distinto con confianza ≥0.8 y ≥12 letras", () => {
        it("llama si el mensaje está en inglés (confianza 0.9) y la conversación es en español", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world how are you today",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("idioma-distinto");
            expect(resultado.destino).toBe("es");
        });

        it("llama si el mensaje está en francés (confianza 0.85) y la conversación es en portugués", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "bonjour le monde comment allez vous",
                idiomaConversacion: "pt",
                detectado: { codigo: "fr", confianza: 0.85 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("idioma-distinto");
            expect(resultado.destino).toBe("pt");
        });

        it("NO llama si la confianza es 0.79 (bajo umbral)", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world how are you today",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.79 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama si el mensaje tiene menos de 12 letras", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hi there",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.95 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama si el idioma detectado coincide con el de la conversación", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola mundo como estas hoy dia bonito",
                idiomaConversacion: "es",
                detectado: { codigo: "es", confianza: 0.95 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama si detectado.codigo es null", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world how are you today",
                idiomaConversacion: "es",
                detectado: { codigo: null, confianza: 0 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });
    });

    describe("regla (b): petición explícita de traducción", () => {
        it("llama con 'traduce' sin idioma específico → destino = idioma conversación", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world",
                idiomaConversacion: "es",
                peticion: "traduce esto por favor",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("peticion");
            expect(resultado.destino).toBe("es");
        });

        it("llama con 'responde en inglés' → destino = en", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola mundo",
                idiomaConversacion: "es",
                peticion: "responde en inglés",
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("peticion");
            expect(resultado.destino).toBe("en");
        });

        it("llama con 'en español' → destino = es", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world",
                idiomaConversacion: "en",
                peticion: "responde en español",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("peticion");
            expect(resultado.destino).toBe("es");
        });

        it("llama con 'traducir al francés' → destino = fr", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world",
                idiomaConversacion: "es",
                peticion: "traducir al francés",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("peticion");
            expect(resultado.destino).toBe("fr");
        });

        it("llama con 'traducir a portugués' → destino = pt", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola mundo",
                idiomaConversacion: "es",
                peticion: "traducir a portugués",
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("peticion");
            expect(resultado.destino).toBe("pt");
        });

        it("llama con 'en alemán' (minúsculas) → destino = de", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world",
                idiomaConversacion: "es",
                peticion: "en alemán por favor",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("peticion");
            expect(resultado.destino).toBe("de");
        });

        it("NO llama si la petición no contiene patrones de traducción", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola mundo",
                idiomaConversacion: "es",
                peticion: "¿qué hora es?",
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });
    });

    describe("regla (c): varias personas con idiomas distintos", () => {
        it("llama si hay destinatarios en idiomas distintos al de la conversación", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola a todos",
                idiomaConversacion: "es",
                destinatarios: [
                    { personaId: "1", idioma: "es" },
                    { personaId: "2", idioma: "en" },
                    { personaId: "3", idioma: "fr" },
                ],
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("varias-personas");
            expect(resultado.destino).toBe("en");
        });

        it("NO llama si todos los destinatarios hablan el mismo idioma que la conversación", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola a todos",
                idiomaConversacion: "es",
                destinatarios: [
                    { personaId: "1", idioma: "es" },
                    { personaId: "2", idioma: "es" },
                ],
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama si hay solo un destinatario", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola",
                idiomaConversacion: "es",
                destinatarios: [{ personaId: "1", idioma: "en" }],
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama si destinatarios es undefined", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola",
                idiomaConversacion: "es",
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });
    });

    describe("casos negativos: no traducir código, URLs, solo números, nombres propios", () => {
        it("NO llama para código JavaScript", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "const x = 42; function foo() { return x; }",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama para URL", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "https://github.com/user/repo",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama para solo números", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "1234567890",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama para nombres propios (persona)", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "Juan Pérez",
                idiomaConversacion: "es",
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama para nombres propios (lugar)", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "Madrid Barcelona",
                idiomaConversacion: "es",
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama para código con llaves y paréntesis", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "{ foo: 'bar', baz: [1, 2, 3] }",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });

        it("NO llama para www URL sin protocolo", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "www.example.com/path",
                idiomaConversacion: "es",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(false);
            expect(resultado.razon).toBe("ninguna");
        });
    });

    describe("prioridad de reglas", () => {
        it("regla (a) tiene prioridad sobre (b) si ambas se cumplen", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hello world how are you today my friend",
                idiomaConversacion: "es",
                peticion: "traduce esto",
                detectado: { codigo: "en", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("idioma-distinto");
            expect(resultado.destino).toBe("es");
        });

        it("regla (b) se aplica cuando (a) no se cumple pero hay petición", () => {
            const entrada: EntradaDecidirTraducir = {
                ...entradaBase,
                mensajeRecibido: "hola mundo",
                idiomaConversacion: "es",
                peticion: "responde en inglés",
                detectado: { codigo: "es", confianza: 0.9 },
            };
            const resultado = decidirTraducir(entrada);
            expect(resultado.llamar).toBe(true);
            expect(resultado.razon).toBe("peticion");
            expect(resultado.destino).toBe("en");
        });
    });
});