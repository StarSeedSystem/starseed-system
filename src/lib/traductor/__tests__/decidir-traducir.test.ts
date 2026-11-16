import { describe, it, expect } from "vitest";
import { decidirTraducir } from "../decidir-traducir";

describe("decidirTraducir", () => {
    it("debería devolver llamar: false si el idioma detectado es igual al idioma de conversación", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola, ¿cómo estás?",
            idiomaConversacion: "es",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: true si el idioma detectado es distinto y confianza >= 0.8", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hello, how are you doing today my friend?",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.95 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("idioma-distinto");
    });

    it("debería devolver llamar: true si la petición contiene 'traduce'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola",
            idiomaConversacion: "es",
            peticion: "traduce esto al inglés",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
    });

    it("debería devolver llamar: false si el mensaje es corto (menos de 12 letras)", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hi there!",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: false si la confianza es menor a 0.8", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hello world how are you",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.7 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: true con petición 'responde en inglés'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola",
            idiomaConversacion: "es",
            peticion: "responde en inglés",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("en");
    });

    it("debería devolver llamar: true con petición 'en francés'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola",
            idiomaConversacion: "es",
            peticion: "responde en francés por favor",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("fr");
    });

    it("debería devolver llamar: true con petición en inglés 'translate to english'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola",
            idiomaConversacion: "es",
            peticion: "translate to english",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("en");
    });

    it("debería devolver llamar: true con varias personas en idiomas distintos", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola a todos",
            idiomaConversacion: "es",
            destinatarios: [
                { personaId: "1", idioma: "es" },
                { personaId: "2", idioma: "en" },
                { personaId: "3", idioma: "fr" }
            ],
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("varias-personas");
    });

    it("debería devolver llamar: false si no hay petición y el idioma coincide", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Esto es un mensaje en español lo suficientemente largo",
            idiomaConversacion: "es",
            detectado: { codigo: "es", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(false);
        expect(resultado.razon).toBe("ninguna");
    });

    it("debería devolver llamar: false para código o URLs", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "https://github.com/user/repo/blob/main/index.js",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: false para solo números", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "123456789012",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: false para nombres propios cortos", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Juan María",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: true con mensaje largo en portugués detectado", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Olá, como você está hoje meu amigo querido",
            idiomaConversacion: "es",
            detectado: { codigo: "pt", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("idioma-distinto");
        expect(resultado.destino).toBe("es");
    });

    it("debería devolver llamar: false si destinatarios tienen mismo idioma que conversación", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola",
            idiomaConversacion: "es",
            destinatarios: [
                { personaId: "1", idioma: "es" },
                { personaId: "2", idioma: "es" }
            ],
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: true con petición 'traducir al alemán'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hola mundo",
            idiomaConversacion: "es",
            peticion: "traducir al alemán",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("de");
    });

    it("debería devolver llamar: false si confianza exacta 0.8 pero idioma coincide", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Mensaje en español suficientemente largo para prueba",
            idiomaConversacion: "es",
            detectado: { codigo: "es", confianza: 0.8 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: false para mensaje con emojis y pocas letras", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "👋😀🎉 Hola!",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: true con petición 'en chino'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "你好吗",
            idiomaConversacion: "es",
            peticion: "responde en chino",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("zh");
    });

    it("debería devolver llamar: true con petición 'respond in japanese'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "こんにちは",
            idiomaConversacion: "es",
            peticion: "respond in japanese",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("ja");
    });

    it("debería devolver llamar: false si no hay suficientes letras para traducir", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Hello",
            idiomaConversacion: "es",
            detectado: { codigo: "en", confianza: 0.9 }
        });
        expect(resultado.llamar).toBe(false);
    });

    it("debería devolver llamar: true con petición 'traduce al ruso'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "Привет",
            idiomaConversacion: "es",
            peticion: "traduce al ruso",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("ru");
    });

    it("debería devolver llamar: true con petición 'responde en arabe'", () => {
        const resultado = decidirTraducir({
            mensajeRecibido: "مرحبا",
            idiomaConversacion: "es",
            peticion: "responde en arabe",
            detectado: { codigo: "es", confianza: 1.0 }
        });
        expect(resultado.llamar).toBe(true);
        expect(resultado.razon).toBe("peticion");
        expect(resultado.destino).toBe("ar");
    });
});
