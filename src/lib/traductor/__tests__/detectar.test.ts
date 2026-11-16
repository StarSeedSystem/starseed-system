import { describe, expect, it } from "vitest";
import { detectarIdioma, type DeteccionIdioma } from "../detectar";

describe("detección de idioma", () => {
    describe("textos muy cortos", () => {
        it("devuelve null para texto vacío", () => {
            const r = detectarIdioma("");
            expect(r.codigo).toBeNull();
            expect(r.confianza).toBe(0);
        });

        it("devuelve null para texto con menos de 12 letras", () => {
            const r = detectarIdioma("hola");
            expect(r.codigo).toBeNull();
            expect(r.confianza).toBe(0);
            expect(r.alternativas).toEqual([]);
        });
    });

    describe("escrituras de un solo idioma (confianza alta)", () => {
        it("detecta coreano (hangul) → ko", () => {
            const r = detectarIdioma("안녕하세요 세계");
            expect(r.codigo).toBe("ko");
            expect(r.confianza).toBeGreaterThan(0.9);
        });

        it("detecta japonés (kana) → ja", () => {
            const r = detectarIdioma("こんにちは世界");
            expect(r.codigo).toBe("ja");
            expect(r.confianza).toBeGreaterThan(0.9);
        });

        it("detecta tailandés → th", () => {
            const r = detectarIdioma("สวัสดีโลก");
            expect(r.codigo).toBe("th");
            expect(r.confianza).toBeGreaterThan(0.9);
        });

        it("detecta griego → el", () => {
            const r = detectarIdioma("Γεια σου κόσμος");
            expect(r.codigo).toBe("el");
            expect(r.confianza).toBeGreaterThan(0.9);
        });

        it("detecta hebreo → he", () => {
            const r = detectarIdioma("שלום עולם");
            expect(r.codigo).toBe("he");
            expect(r.confianza).toBeGreaterThan(0.9);
        });
    });

    describe("escrituras compartidas: latina", () => {
        it("detecta español → es", () => {
            const r = detectarIdioma("hola mundo como estas hoy el dia es bonito");
            expect(r.codigo).toBe("es");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta inglés → en", () => {
            const r = detectarIdioma("hello world how are you today the day is nice");
            expect(r.codigo).toBe("en");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta portugués → pt", () => {
            const r = detectarIdioma("olá mundo como vai você o dia é bonito");
            expect(r.codigo).toBe("pt");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta francés → fr", () => {
            const r = detectarIdioma("bonjour le monde comment allez vous le jour est beau");
            expect(r.codigo).toBe("fr");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta alemán → de", () => {
            const r = detectarIdioma("hallo welt wie geht es dir der tag ist schön");
            expect(r.codigo).toBe("de");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta italiano → it", () => {
            const r = detectarIdioma("ciao mondo come stai oggi il giorno è bello");
            expect(r.codigo).toBe("it");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta catalán → ca", () => {
            const r = detectarIdioma("hola món com estàs avui el dia és bonic");
            expect(r.codigo).toBe("ca");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta neerlandés → nl", () => {
            const r = detectarIdioma("hallo wereld hoe gaat het vandaag de dag is mooi");
            expect(r.codigo).toBe("nl");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });
    });

    describe("escrituras compartidas: cirílica", () => {
        it("detecta ruso → ru", () => {
            const r = detectarIdioma("привет мир как дела у тебя сегодня хороший день");
            expect(r.codigo).toBe("ru");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta ucraniano → uk", () => {
            const r = detectarIdioma("привіт світ як справи у тебе сьогодні хороший день");
            expect(r.codigo).toBe("uk");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });
    });

    describe("escrituras compartidas: árabe", () => {
        it("detecta árabe → ar", () => {
            const r = detectarIdioma("مرحبا بالعالم كيف حالك اليوم يوم جميل جدا");
            expect(r.codigo).toBe("ar");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });

        it("detecta persa → fa", () => {
            const r = detectarIdioma("سلام جهان چطور هستی امروز روز بسیار خوبی است");
            expect(r.codigo).toBe("fa");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });
    });

    describe("escrituras compartidas: han", () => {
        it("detecta chino → zh", () => {
            const r = detectarIdioma("你好世界你今天好吗今天天气很好我们很开心");
            expect(r.codigo).toBe("zh");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });
    });

    describe("escrituras compartidas: devanagari", () => {
        it("detecta hindi → hi", () => {
            const r = detectarIdioma("नमस्ते दुनिया आप कैसे हैं आज मौसम बहुत अच्छा है");
            expect(r.codigo).toBe("hi");
            expect(r.confianza).toBeLessThanOrEqual(0.9);
        });
    });

    describe("texto mixto", () => {
        it("devuelve confianza baja para mezcla de idiomas", () => {
            const r = detectarIdioma("hello mundo 你好");
            expect(r.confianza).toBeLessThan(0.5);
        });
    });
});