/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Canales StarSeed (Ola 285 · K4) — pruebas de las funciones PURAS.
 * ---------------------------------------------------------------------------
 * Se prueban SOLO las funciones puras (normalizarCategorias, deducirPlataforma,
 * validarCanalPublico, categoriasPopulares): no hay red ni Supabase aquí, por
 * lo que la suite corre limpia y determinista. Las funciones de datos
 * (listar/publicar/editar/…) dependen de la sesión y de la BD y se prueban en
 * la UI, no en unit test.
 *
 * Nota de estilo: `globals: false`, así que se importan los helpers de vitest
 * explícitamente (nunca se usan las globales implícitas).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";

import {
    normalizarCategorias,
    deducirPlataforma,
    validarCanalPublico,
    categoriasPopulares,
    type CanalPublico,
} from "@/lib/canales/publicos";

/** Helper para construir un `CanalPublico` mínimo en las pruebas. */
function canal(categorias: string[]): CanalPublico {
    return {
        id: "c-1",
        ownerId: "o-1",
        nombre: "Canal de prueba",
        plataforma: "telegram",
        enlace: "https://t.me/prueba",
        tipo: "canal",
        descripcion: "",
        categorias,
        idioma: "es",
        verificado: false,
        oficial: false,
        seguidores: 0,
        ultimoMensaje: null,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
    };
}

describe("normalizarCategorias", () => {
    it("separa por comas y espacios, pasa a minúsculas y quita # y acentos", () => {
        expect(normalizarCategorias("Noticias, #Ciencia  ciencia, Arte")).toEqual([
            "noticias",
            "ciencia",
            "arte",
        ]);
    });

    it("deduplica elementos que chocan tras normalizar", () => {
        expect(normalizarCategorias(["Ciencia", "ciencia", "#Ciencia", "Tecnología"])).toEqual([
            "ciencia",
            "tecnologia",
        ]);
    });

    it("recorta al máximo de 8 categorías", () => {
        const bruto = ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8", "i9", "j10"];
        const resultado = normalizarCategorias(bruto);
        expect(resultado).toHaveLength(8);
    });

    it("descarta piezas vacías o de menos de 2 caracteres", () => {
        expect(normalizarCategorias("a,   , #, tecnología")).toEqual(["tecnologia"]);
    });

    it("acepta un array ya limpio sin perder orden", () => {
        expect(normalizarCategorias(["Física", "Cosmos"])).toEqual(["fisica", "cosmos"]);
    });
});

describe("deducirPlataforma", () => {
    it("reconoce los seis casos y el resto cae a web", () => {
        expect(deducirPlataforma("https://t.me/canal")).toBe("telegram");
        expect(deducirPlataforma("https://youtube.com/@canal")).toBe("youtube");
        expect(deducirPlataforma("https://youtu.be/abc")).toBe("youtube");
        expect(deducirPlataforma("https://wa.me/34600000000")).toBe("whatsapp");
        expect(deducirPlataforma("https://x.com/usuario")).toBe("x");
        expect(deducirPlataforma("https://twitter.com/usuario")).toBe("x");
        expect(deducirPlataforma("https://instagram.com/usuario")).toBe("instagram");
        expect(deducirPlataforma("https://feed.example.com/rss.xml")).toBe("rss");
        expect(deducirPlataforma("https://www.example.com/canal")).toBe("web");
    });

    it("no lanza ante entradas vacías o raras", () => {
        expect(deducirPlataforma("")).toBe("web");
        expect(deducirPlataforma("nota-una-url")).toBe("web");
    });
});

describe("validarCanalPublico", () => {
    it("acepta un canal correcto y lo normaliza", () => {
        const resultado = validarCanalPublico({
            nombre: "Mi Canal",
            plataforma: "telegram",
            enlace: "https://t.me/micanal",
            categorias: "Noticias, #Ciencia",
        });
        expect(resultado.ok).toBe(true);
        if (resultado.ok) {
            expect(resultado.valor.nombre).toBe("Mi Canal");
            expect(resultado.valor.categorias).toEqual(["noticias", "ciencia"]);
        }
    });

    it("rechaza enlace vacío", () => {
        const resultado = validarCanalPublico({ nombre: "Canal", enlace: "" });
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) expect(resultado.error).toContain("enlace");
    });

    it("rechaza un nombre de 1 carácter", () => {
        const resultado = validarCanalPublico({ nombre: "C", enlace: "https://t.me/c" });
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) expect(resultado.error).toContain("nombre");
    });

    it("rechaza un enlace no https ni t.me/", () => {
        const resultado = validarCanalPublico({ nombre: "Canal", enlace: "ftp://invalido" });
        expect(resultado.ok).toBe(false);
    });

    it("deduce la plataforma cuando no se indica", () => {
        const resultado = validarCanalPublico({ nombre: "Canal", enlace: "https://youtu.be/abc" });
        expect(resultado.ok).toBe(true);
        if (resultado.ok) expect(resultado.valor.plataforma).toBe("youtube");
    });
});

describe("categoriasPopulares", () => {
    it("ordena por frecuencia descendente", () => {
        const populares = categoriasPopulares([
            canal(["ciencia", "arte"]),
            canal(["ciencia", "noticias"]),
            canal(["arte"]),
        ]);
        expect(populares).toEqual([
            { categoria: "ciencia", total: 2 },
            { categoria: "arte", total: 2 },
            { categoria: "noticias", total: 1 },
        ]);
    });

    it("devuelve lista vacía sin canales", () => {
        expect(categoriasPopulares([])).toEqual([]);
    });
});