// Pruebas del criterio de sugerencias por pestaña (Ola 305).
// Comprueban lo que Alex pidió: que el título mande, que no se repita
// lo que ya está dentro y que una pestaña vacía salga variada.

import { describe, it, expect } from "vitest";
import {
    sugerenciasPara,
    categoriasInfrarrepresentadas,
    type ContextoPestana,
    type Sugerencia,
} from "../sugerencias-pestana";
import { WIDGET_MANIFEST } from "../widget-manifest";
import type { WidgetType } from "../dashboard-types";

/** Categoría declarada en el manifiesto para un tipo de widget. */
function categoriaDe(tipo: WidgetType): string {
    const entrada = WIDGET_MANIFEST[tipo];
    return entrada ? entrada.category : "";
}

function categoriasDe(sugerencias: Sugerencia[]): string[] {
    return sugerencias.map((s) => categoriaDe(s.tipo));
}

/** El manifiesto agrupa lo político bajo `ontocracia`; son la misma familia. */
const FAMILIA_POLITICA = ["politica", "ontocracia", "parlamento"];

const PESTANA_VACIA: ContextoPestana = {
    titulo: "",
    widgetsPresentes: [],
    categoriasPresentes: [],
};

describe("sugerenciasPara — el título de la pestaña manda", () => {
    it("«Política» sube los widgets de la familia política", () => {
        const sugerencias = sugerenciasPara({
            titulo: "Política",
            widgetsPresentes: [],
            categoriasPresentes: [],
        });
        const categorias = categoriasDe(sugerencias);
        expect(FAMILIA_POLITICA).toContain(categorias[0]);
        const politicas = categorias.filter((c) => FAMILIA_POLITICA.indexOf(c) >= 0);
        expect(politicas.length).toBeGreaterThanOrEqual(3);
    });

    it("«Clima» sube los widgets de clima por delante de todo lo demás", () => {
        const sugerencias = sugerenciasPara({
            titulo: "Clima",
            widgetsPresentes: [],
            categoriasPresentes: [],
        });
        expect(categoriaDe(sugerencias[0].tipo)).toBe("clima");
    });

    it("«Mi Economía» funciona igual que «mi economia»: ni acentos ni mayúsculas importan", () => {
        const conAcentos = sugerenciasPara({
            titulo: "Mi Economía",
            widgetsPresentes: [],
            categoriasPresentes: [],
        });
        const sinAcentos = sugerenciasPara({
            titulo: "mi economia",
            widgetsPresentes: [],
            categoriasPresentes: [],
        });
        expect(conAcentos).toEqual(sinAcentos);
        expect(categoriaDe(conAcentos[0].tipo)).toBe("economia");
    });

    it("cada sugerencia explica en español por qué se sugiere", () => {
        const sugerencias = sugerenciasPara({
            titulo: "Mi Economía",
            widgetsPresentes: [],
            categoriasPresentes: [],
        });
        for (const sugerencia of sugerencias) {
            expect(sugerencia.motivo.length).toBeGreaterThan(10);
            expect(sugerencia.puntuacion).toBeGreaterThan(0);
        }
        expect(sugerencias[0].motivo).toContain("Economía");
    });
});

describe("sugerenciasPara — no repetir lo que ya hay", () => {
    it("un widget ya presente no vuelve a sugerirse", () => {
        const ctx: ContextoPestana = {
            titulo: "Política",
            widgetsPresentes: ["AGORA_CAUSAL", "POLITICAL_SUMMARY"],
            categoriasPresentes: [],
        };
        const tipos = sugerenciasPara(ctx, 12).map((s) => s.tipo);
        expect(tipos).not.toContain("AGORA_CAUSAL");
        expect(tipos).not.toContain("POLITICAL_SUMMARY");
        expect(new Set(tipos).size).toBe(tipos.length);
    });

    it("la categoría ya presente pesa menos que la misma sin estrenar", () => {
        const base = sugerenciasPara({
            titulo: "",
            widgetsPresentes: [],
            categoriasPresentes: [],
        }, 1);
        const conEsaCategoria = sugerenciasPara({
            titulo: "",
            widgetsPresentes: [],
            categoriasPresentes: [categoriaDe(base[0].tipo)],
        }, 1);
        expect(conEsaCategoria[0].tipo).not.toBe(base[0].tipo);
    });
});

describe("sugerenciasPara — pestaña vacía y límites", () => {
    it("una pestaña vacía recibe una mezcla variada, no seis de gobernanza", () => {
        const sugerencias = sugerenciasPara(PESTANA_VACIA);
        expect(sugerencias).toHaveLength(6);
        const distintas = new Set(categoriasDe(sugerencias));
        expect(distintas.size).toBeGreaterThanOrEqual(4);
    });

    it("respeta el límite pedido, incluidos los grados y el cero", () => {
        expect(sugerenciasPara(PESTANA_VACIA, 3)).toHaveLength(3);
        expect(sugerenciasPara(PESTANA_VACIA, 1)).toHaveLength(1);
        expect(sugerenciasPara(PESTANA_VACIA, 0)).toHaveLength(0);
        expect(sugerenciasPara(PESTANA_VACIA, -4)).toHaveLength(0);
    });

    it("las puntuaciones salen ordenadas de mayor a menor", () => {
        const puntuaciones = sugerenciasPara(PESTANA_VACIA, 8).map((s) => s.puntuacion);
        const ordenadas = puntuaciones.slice().sort((a, b) => b - a);
        expect(puntuaciones).toEqual(ordenadas);
    });
});

describe("categoriasInfrarrepresentadas", () => {
    it("una pestaña vacía tiene todas las categorías útiles por estrenar", () => {
        const ausentes = categoriasInfrarrepresentadas(PESTANA_VACIA);
        expect(ausentes.length).toBeGreaterThan(10);
        expect(ausentes).toContain("clima");
        expect(ausentes).toContain("economia");
    });

    it("deja fuera lo que la pestaña ya toca, por widget o por categoría", () => {
        const ausentes = categoriasInfrarrepresentadas({
            titulo: "",
            widgetsPresentes: ["WEATHER_BASIC"],
            categoriasPresentes: ["economia"],
        });
        expect(ausentes).not.toContain("clima");
        expect(ausentes).not.toContain("economia");
        expect(ausentes).toContain("educacion");
    });

    it("«Política» y «parlamento» son la misma familia para el manifiesto", () => {
        const ausentes = categoriasInfrarrepresentadas({
            titulo: "",
            widgetsPresentes: [],
            categoriasPresentes: ["Política"],
        });
        expect(ausentes).not.toContain("ontocracia");
        expect(ausentes).not.toContain("politica");
    });

    it("el título coloca primero la categoría que pide", () => {
        const ausentes = categoriasInfrarrepresentadas({
            titulo: "Mi Economía",
            widgetsPresentes: [],
            categoriasPresentes: [],
        });
        expect(ausentes[0]).toBe("economia");
    });
});
