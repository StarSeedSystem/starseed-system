// SP092937b · Claves de lista estables: la key de React identifica al
// elemento por su contenido, no por su posición ni por un nombre suelto que
// puede repetirse.
import { describe, expect, it } from "vitest";
import { clavesDeLista, slugDeClave } from "@/lib/social/claves-lista";

describe("slugDeClave", () => {
    it("normaliza acentos, mayúsculas y signos de apertura", () => {
        expect(slugDeClave("¿Apruebas las prioridades legislativas?")).toBe(
            "apruebas-las-prioridades-legislativas",
        );
        expect(slugDeClave("¡Voto líquido!")).toBe("voto-liquido");
        expect(slugDeClave("Taller De Permacultura")).toBe("taller-de-permacultura");
    });

    it("recorta a 64 caracteres (mismo techo que mvSlug en las papeletas)", () => {
        expect(slugDeClave("a".repeat(100)).length).toBe(64);
    });

    it("deja vacía una cadena sin contenido utilizable", () => {
        expect(slugDeClave("¿? · ¡!")).toBe("");
    });
});

describe("clavesDeLista", () => {
    const delegadas = [
        { name: "Ana Ruiz", domain: "Educación" },
        { name: "Beto Lara", domain: "Salud" },
        { name: "Ana Ruiz", domain: "Cultura" },
    ];

    it("deriva la clave del contenido, no de la posición", () => {
        const claves = clavesDeLista(delegadas, (d) => [d.name, d.domain]);
        expect(claves[0]).toBe("ana-ruiz-educacion");
        expect(claves[1]).toBe("beto-lara-salud");
    });

    it("desace colisiones con homónimas en ámbitos distintos", () => {
        const claves = clavesDeLista(delegadas, (d) => [d.name, d.domain]);
        expect(claves[2]).toBe("ana-ruiz-cultura");
        expect(new Set(claves).size).toBe(claves.length);
    });

    it("mantiene la clave de cada contenido al reordenar", () => {
        const claves = clavesDeLista(delegadas, (d) => [d.name, d.domain]);
        const invertidas = clavesDeLista(
            [...delegadas].reverse(),
            (d) => [d.name, d.domain],
        );
        expect(invertidas[2]).toBe(claves[0]);
        expect(invertidas[1]).toBe(claves[1]);
        expect(invertidas[0]).toBe(claves[2]);
    });

    it("contenidos idénticos reciben sufijos ordinales estables", () => {
        const plenos = [{ t: "Pleno" }, { t: "Pleno" }, { t: "Pleno" }];
        expect(clavesDeLista(plenos, (x) => [x.t])).toEqual([
            "pleno",
            "pleno-2",
            "pleno-3",
        ]);
    });

    it("no colisiona cuando el contenido ya parece un sufijo", () => {
        const items = [{ t: "a" }, { t: "a-2" }, { t: "a" }];
        const claves = clavesDeLista(items, (x) => [x.t]);
        expect(new Set(claves).size).toBe(3);
        expect(claves).toEqual(["a", "a-2", "a-3"]);
    });

    it("cae al índice solo cuando no hay contenido utilizable", () => {
        const items = [{ t: "" }, { t: "· · ·" }];
        expect(clavesDeLista(items, (x) => [x.t])).toEqual(["fila-0", "fila-1"]);
    });

    it("compone tiempo y título para una agenda (Timeline)", () => {
        const agenda = [
            { time: "09:00", title: "Apertura" },
            { time: "10:00", title: "Apertura" },
        ];
        expect(clavesDeLista(agenda, (a) => [a.time, a.title])).toEqual([
            "09-00-apertura",
            "10-00-apertura",
        ]);
    });

    it("ignora los trozos ausentes y es determinista entre llamadas", () => {
        const agenda = [
            { time: undefined, title: "Pleno" } as { time?: string; title: string },
            { time: "11:00", title: "Pleno" },
        ];
        const primera = clavesDeLista(agenda, (a) => [a.time, a.title]);
        const segunda = clavesDeLista(agenda, (a) => [a.time, a.title]);
        expect(primera).toEqual(["pleno", "11-00-pleno"]);
        expect(segunda).toEqual(primera);
    });
});
