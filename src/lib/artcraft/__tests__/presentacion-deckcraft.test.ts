/** Pruebas del plan DeckCraft sobre la presentación viva (§4.2/§4.3). Solo funciones puras. */
import { describe, expect, it } from "vitest";
import type { BloqueDoc, ElementoLienzo } from "@/lib/mensajeria/formato-tipos";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { AVISO_PDF_IMAGEN, derivadoDe, lineasDeDiapositiva, planDeckcraftDesdeMazo, planExporteDeck, sanearArchivo } from "../presentacion-deckcraft";

const META: MetaPresentacion = { titulo: "Mazo de prueba", tema: "cosmos", proporcion: "16:9" };
const el = (id: string, y: number, bloques: BloqueDoc[]): ElementoLienzo => ({ id, tipo: "texto", x: 64, y, w: 800, h: 200, z: 1, texto: { bloques } });
const dia = (elementos: ElementoLienzo[], notas?: string): Diapositiva => (notas === undefined ? { lienzo: { ancho: 960, alto: 540, elementos } } : { lienzo: { ancho: 960, alto: 540, elementos }, notas });
const p = (t: string): BloqueDoc => ({ tipo: "parrafo", tramos: [{ texto: t }] });
const h = (t: string): BloqueDoc => ({ tipo: "titulo", nivel: 1, tramos: [{ texto: t }] });
const l = (...items: string[]): BloqueDoc => ({ tipo: "lista", ordenada: false, items: items.map((t) => [{ texto: t }]) });
function cadenas(v: unknown): string[] {
    if (typeof v === "string") return [v];
    if (Array.isArray(v)) return v.flatMap(cadenas);
    if (v && typeof v === "object") return Object.values(v).flatMap(cadenas);
    return [];
}
const sinRutaAbsoluta = (v: string): boolean => !/^([/\\~]|[a-zA-Z]:)/.test(v) && !v.startsWith("file:");

describe("planDeckcraftDesdeMazo · diapositivas", () => {
    it("un mazo de una diapositiva usa la portada con el título del mazo", () => {
        const plan = planDeckcraftDesdeMazo(META, [dia([el("t", 48, [p("Hola mundo")])])]);
        expect(plan.llamadas).toHaveLength(2);
        expect(plan.llamadas[0]).toEqual({ herramienta: "new_presentation", parametros: {} });
        expect(plan.llamadas[1]).toEqual({ herramienta: "add_slide", parametros: { layout: "title", title: "Mazo de prueba", body: "Hola mundo" } });
    });
    it("un mazo de cinco produce portada y cuatro de título y contenido en orden", () => {
        const mazo = Array.from({ length: 5 }, (_, i) => dia([el("t", 48, [p(`Diapositiva ${i + 1}`), p(`Cuerpo ${i + 1}`)])]));
        const plan = planDeckcraftDesdeMazo(META, mazo);
        expect(plan.llamadas).toHaveLength(6);
        expect(plan.llamadas.map((x) => x.parametros.layout)).toEqual([undefined, "title", "titleAndContent", "titleAndContent", "titleAndContent", "titleAndContent"]);
        expect(plan.llamadas[1].parametros).toEqual({ layout: "title", title: "Mazo de prueba", body: "Diapositiva 1\nCuerpo 1" });
        expect(plan.llamadas[5].parametros).toEqual({ layout: "titleAndContent", title: "Diapositiva 5", body: "Cuerpo 5" });
    });
    it("título y cuerpo conservan párrafos y listas con sangría", () => {
        const d = dia([el("a", 10, [h("Título")]), el("b", 100, [p("Un párrafo")]), el("c", 200, [l("Primera idea", "Segunda idea")])]);
        expect(lineasDeDiapositiva(d)).toEqual(["Título", "Un párrafo", "\tPrimera idea", "\tSegunda idea"]);
        const plan = planDeckcraftDesdeMazo(META, [dia([el("t", 48, [p("Portada")])]), d]);
        expect(plan.llamadas[2].parametros).toEqual({ layout: "titleAndContent", title: "Título", body: "Un párrafo\n\tPrimera idea\n\tSegunda idea" });
    });
    it("el cuerpo no se aplana: cada párrafo va en su línea", () => {
        const plan = planDeckcraftDesdeMazo(META, [dia([el("t", 48, [p("Portada")])]), dia([el("t", 48, [p("Uno"), p("Dos"), p("Tres")])])]);
        expect(plan.llamadas[2].parametros).toEqual({ layout: "titleAndContent", title: "Uno", body: "Dos\nTres" });
    });
    it("sin diapositivas solo abre la presentación con el tema pedido", () => {
        const plan = planDeckcraftDesdeMazo(META, [], { tema: "zenith" });
        expect(plan.llamadas).toEqual([{ herramienta: "new_presentation", parametros: { theme: "zenith" } }]);
        expect(plan.pendientes).toEqual([]);
    });
});

describe("planDeckcraftDesdeMazo · pendientes", () => {
    it("las notas del orador no tienen herramienta y quedan pendientes", () => {
        const plan = planDeckcraftDesdeMazo(META, [dia([el("t", 48, [p("Portada")])], "Recuerda saludar"), dia([el("t", 48, [p("Otra")])])]);
        expect(plan.pendientes).toEqual(["notas de la diapositiva 1: aplicar con el comando de notas que devuelva `list_commands`"]);
    });
    it("las imágenes y los gifs del lienzo quedan pendientes por diapositiva", () => {
        const plan = planDeckcraftDesdeMazo(META, [dia([{ id: "i", tipo: "imagen", x: 0, y: 0, w: 100, h: 100, z: 2 }]), dia([{ id: "g", tipo: "gif", x: 0, y: 0, w: 100, h: 100, z: 2 }])]);
        expect(plan.pendientes).toEqual([
            "imágenes de la diapositiva 1: no se transfieren a DeckCraft; insertarlas a mano",
            "imágenes de la diapositiva 2: no se transfieren a DeckCraft; insertarlas a mano",
        ]);
    });
    it("las formas libres del lienzo también quedan pendientes", () => {
        const forma: ElementoLienzo = { id: "f", tipo: "forma", x: 0, y: 0, w: 100, h: 100, z: 2, forma: { tipo: "rect", color: "#ffffff" } };
        const plan = planDeckcraftDesdeMazo(META, [dia([el("t", 48, [p("Portada")]), forma])]);
        expect(plan.pendientes).toEqual(["formas de la diapositiva 1: no se transfieren a DeckCraft; redibujarlas a mano"]);
    });
    it("un mazo solo de texto no deja pendientes", () => {
        expect(planDeckcraftDesdeMazo(META, [dia([el("t", 48, [p("Hola")])])]).pendientes).toEqual([]);
    });
});

describe("planExporteDeck", () => {
    it("exporta a una ruta relativa dentro de salida", () => {
        const r = planExporteDeck("pptx", "Mi-Mazo");
        expect(r).toEqual({ herramienta: "export", parametros: { path: "salida/mi-mazo.pptx", format: "pptx" } });
        expect(r.parametros.path).not.toMatch(/^([/\\~]|[a-zA-Z]:)/);
    });
    it("añade el diseño de notas cuando se piden las notas", () => {
        expect(planExporteDeck("pdf", "mazo", { notas: true }).parametros).toEqual({ path: "salida/mazo.pdf", format: "pdf", layout: "notes" });
    });
    it("rechaza un formato que DeckCraft no exporta", () => {
        expect(() => planExporteDeck("docx" as never, "mazo")).toThrow(/Formato de exporte no válido/);
    });
    it("sanea un nombre de archivo malo a minúsculas y guiones", () => {
        expect(sanearArchivo("Mi Mazo (final)!.PDF")).toBe("mi-mazo-final-pdf");
        expect(sanearArchivo("../../etc/passwd")).toBe("etc-passwd");
        expect(sanearArchivo("///")).toBe("presentacion");
    });
    it("ninguna salida lleva rutas absolutas", () => {
        const plan = planDeckcraftDesdeMazo(META, [dia([el("t", 48, [p("Hola")])], "nota")]);
        const exporte = planExporteDeck("png", "/etc/mi mazo");
        expect([...cadenas(plan), ...cadenas(exporte)].every(sinRutaAbsoluta)).toBe(true);
    });
    it("el aviso del PDF como imagen explica la limitación a la publicación", () => {
        expect(AVISO_PDF_IMAGEN).toContain("no tiene texto seleccionable ni es vectorial");
        expect(AVISO_PDF_IMAGEN).toContain("imagen a resolución de impresión");
    });
});

describe("derivadoDe", () => {
    it("dice de qué mazo sale y con qué versión de DeckCraft", () => {
        expect(derivadoDe(META, "0.10.0")).toEqual({ fuente: "Mazo de prueba", generadoCon: "DeckCraft", version: "0.10.0" });
    });
});
