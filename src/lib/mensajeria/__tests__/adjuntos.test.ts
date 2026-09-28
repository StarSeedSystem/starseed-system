import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { urlVigenteAdjunto } from "@/lib/mensajeria/adjuntos";

const ENV_KEY = "NEXT_PUBLIC_SUPABASE_URL";
let original: string | undefined;

beforeEach(() => {
    original = process.env[ENV_KEY];
});
afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
});

describe("urlVigenteAdjunto", () => {
    test("undefined para vacío/ausente", () => {
        expect(urlVigenteAdjunto(undefined)).toBeUndefined();
        expect(urlVigenteAdjunto(null)).toBeUndefined();
        expect(urlVigenteAdjunto("")).toBeUndefined();
    });

    test("reescribe la URL pública de storage de OTRO proyecto de Supabase al proyecto vigente", () => {
        process.env[ENV_KEY] = "https://nxstilnyidvkqeosofuh.supabase.co";
        const vieja = "https://pqzdpmedcsgcedkvndzl.supabase.co/storage/v1/object/public/os-files/u1/foto.jpg";
        expect(urlVigenteAdjunto(vieja)).toBe(
            "https://nxstilnyidvkqeosofuh.supabase.co/storage/v1/object/public/os-files/u1/foto.jpg",
        );
    });

    test("no toca una URL que ya es del proyecto vigente", () => {
        process.env[ENV_KEY] = "https://nxstilnyidvkqeosofuh.supabase.co";
        const actual = "https://nxstilnyidvkqeosofuh.supabase.co/storage/v1/object/public/os-files/u1/foto.jpg";
        expect(urlVigenteAdjunto(actual)).toBe(actual);
    });

    test("deja intacto cualquier otro tipo de URL (dataURL, otro host, ruta relativa)", () => {
        process.env[ENV_KEY] = "https://nxstilnyidvkqeosofuh.supabase.co";
        expect(urlVigenteAdjunto("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
        expect(urlVigenteAdjunto("https://cdn.example.com/x.png")).toBe("https://cdn.example.com/x.png");
        expect(urlVigenteAdjunto("/imagenes/x.png")).toBe("/imagenes/x.png");
    });

    test("sin NEXT_PUBLIC_SUPABASE_URL configurada, no reescribe nada", () => {
        delete process.env[ENV_KEY];
        const vieja = "https://pqzdpmedcsgcedkvndzl.supabase.co/storage/v1/object/public/os-files/u1/foto.jpg";
        expect(urlVigenteAdjunto(vieja)).toBe(vieja);
    });
});
