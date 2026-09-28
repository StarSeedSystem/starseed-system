// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
    aplicarRango,
    cssAHex,
    domADoc,
    leerRango,
    normalizarDoc,
    parsearDom,
    pintarDoc,
    recortarDoc,
} from "@/components/messages/rico/doc-dom";
import type { DocRico } from "@/lib/mensajeria/formato-tipos";

const DOC_COMPLETO: DocRico = {
    bloques: [
        { tipo: "titulo", nivel: 1, tramos: [{ texto: "Asamblea " }, { texto: "de otoño", marcas: ["cursiva", "negrita"], color: "#ffbf00" }], alineacion: "centro" },
        {
            tipo: "parrafo",
            tramos: [
                { texto: "Hola " },
                { texto: "a todas", marcas: ["subrayado"], resaltado: "#10b981" },
                { texto: ", mirad " },
                { texto: "este enlace", enlace: "https://starseed.example/x", marcas: ["negrita"] },
                { texto: " y " },
                { texto: "este", enlace: "/perfil/alex" },
                { texto: ".\nSegunda línea con " },
                { texto: "código", marcas: ["codigo"] },
                { texto: " y ", fuente: "serif", tamano: 20 },
                { texto: "tachado", marcas: ["tachado"] },
            ],
        },
        { tipo: "parrafo", tramos: [] },
        { tipo: "lista", ordenada: false, items: [[{ texto: "pan" }], [{ texto: "café", marcas: ["negrita"] }], []] },
        { tipo: "lista", ordenada: true, items: [[{ texto: "uno" }], [{ texto: "dos" }]] },
        { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "hecho" }] }, { hecha: false, tramos: [{ texto: "pendiente" }] }] },
        { tipo: "cita", tramos: [{ texto: "Sé el cambio\nque quieres ver" }] },
        { tipo: "separador" },
        { tipo: "codigo", texto: "const a = 1;\n  const b = 2;", lenguaje: "ts" },
        { tipo: "titulo", nivel: 3, tramos: [{ texto: "fin con salto\n" }] },
        { tipo: "parrafo", tramos: [{ texto: "a la derecha" }], alineacion: "derecha" },
    ],
};

let raiz: HTMLElement;

beforeEach(() => {
    document.body.innerHTML = "";
    raiz = document.createElement("div");
    raiz.contentEditable = "true";
    document.body.appendChild(raiz);
});

function idaYVuelta(doc: DocRico): DocRico {
    pintarDoc(raiz, doc);
    return domADoc(raiz);
}

describe("doc-dom · ida y vuelta", () => {
    it("serializar → parsear → serializar da lo mismo", () => {
        const normal = normalizarDoc(DOC_COMPLETO);
        const vuelta = idaYVuelta(normal);
        expect(vuelta).toEqual(normal);
        const html1 = raiz.innerHTML;
        pintarDoc(raiz, vuelta);
        expect(raiz.innerHTML).toBe(html1);
        expect(domADoc(raiz)).toEqual(normal);
    });

    it("normaliza: une tramos iguales y ordena marcas", () => {
        const d = normalizarDoc({
            bloques: [{ tipo: "parrafo", tramos: [{ texto: "a", marcas: ["cursiva", "negrita"] }, { texto: "b", marcas: ["negrita", "cursiva"] }, { texto: "" }] }],
        });
        expect(d.bloques[0]).toEqual({ tipo: "parrafo", tramos: [{ texto: "ab", marcas: ["negrita", "cursiva"] }] });
        expect(idaYVuelta(d)).toEqual(d);
    });

    it("un documento vacío es un párrafo vacío y recortarDoc lo limpia", () => {
        expect(normalizarDoc({ bloques: [] })).toEqual({ bloques: [{ tipo: "parrafo", tramos: [] }] });
        expect(idaYVuelta({ bloques: [] })).toEqual({ bloques: [{ tipo: "parrafo", tramos: [] }] });
        expect(recortarDoc({ bloques: [{ tipo: "parrafo", tramos: [] }, { tipo: "parrafo", tramos: [{ texto: "x" }] }, { tipo: "parrafo", tramos: [{ texto: "  " }] }] })).toEqual({
            bloques: [{ tipo: "parrafo", tramos: [{ texto: "x" }] }],
        });
    });

    it("nunca usa innerHTML con datos: el texto con etiquetas queda como texto", () => {
        const d = normalizarDoc({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "<img src=x onerror=alert(1)>" }] }] });
        pintarDoc(raiz, d);
        expect(raiz.querySelector("img")).toBeNull();
        expect(domADoc(raiz)).toEqual(d);
    });
});

describe("doc-dom · DOM ajeno (lo que deja el navegador)", () => {
    it("reduce etiquetas y estilos del navegador a la lista blanca", () => {
        raiz.innerHTML =
            '<div>Hola <b>fuerte</b> <i>it</i> <span style="color: rgb(255, 0, 0); background-color: rgba(0, 0, 0, 0)">rojo</span>' +
            ' <font color="#00ff00">verde</font> <a href="javascript:alert(1)">malo</a> <script>alert(1)</script><img src="x"></div>' +
            "<div><br></div><h4>sub</h4><ul><li>uno<ul><li>anidado</li></ul></li></ul><blockquote><div>l1</div><div>l2</div></blockquote>" +
            "<pre>x\n<div>y</div></pre>texto suelto";
        const d = domADoc(raiz);
        expect(d.bloques).toEqual([
            {
                tipo: "parrafo",
                tramos: [
                    { texto: "Hola " },
                    { texto: "fuerte", marcas: ["negrita"] },
                    { texto: " " },
                    { texto: "it", marcas: ["cursiva"] },
                    { texto: " " },
                    { texto: "rojo", color: "#ff0000" },
                    { texto: " " },
                    { texto: "verde", color: "#00ff00" },
                    { texto: " malo " },
                ],
            },
            { tipo: "parrafo", tramos: [] },
            { tipo: "titulo", nivel: 3, tramos: [{ texto: "sub" }] },
            { tipo: "lista", ordenada: false, items: [[{ texto: "uno" }], [{ texto: "anidado" }]] },
            { tipo: "cita", tramos: [{ texto: "l1\nl2" }] },
            { tipo: "codigo", texto: "x\n\ny" },
            { tipo: "parrafo", tramos: [{ texto: "texto suelto" }] },
        ]);
    });

    it("cssAHex convierte rgb/rgba y descarta lo transparente", () => {
        expect(cssAHex("rgb(255, 128, 0)")).toBe("#ff8000");
        expect(cssAHex("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
        expect(cssAHex("rgba(0, 0, 0, 0)")).toBeUndefined();
        expect(cssAHex("transparent")).toBeUndefined();
        expect(cssAHex("#ABC")).toBe("#abc");
    });
});

describe("doc-dom · selección", () => {
    it("la selección sobrevive a un repintado", () => {
        const d = normalizarDoc({
            bloques: [
                { tipo: "parrafo", tramos: [{ texto: "Hola " }, { texto: "mundo", marcas: ["negrita"] }] },
                { tipo: "lista", ordenada: false, items: [[{ texto: "uno" }], [{ texto: "dos\ntres" }]] },
            ],
        });
        pintarDoc(raiz, d);
        const rango = { inicio: { bloque: 0, item: 0, off: 3 }, fin: { bloque: 1, item: 1, off: 6 } };
        aplicarRango(raiz, rango);
        expect(leerRango(raiz)).toEqual(rango);
        pintarDoc(raiz, d);
        aplicarRango(raiz, rango);
        const sel = document.getSelection()!;
        expect(sel.toString().replace(/\s+/g, " ")).toContain("a mundo");
        expect(leerRango(raiz)).toEqual(rango);
    });

    it("posiciones en bloques vacíos y al final de un salto", () => {
        const d = normalizarDoc({ bloques: [{ tipo: "parrafo", tramos: [] }, { tipo: "parrafo", tramos: [{ texto: "a\n" }] }] });
        pintarDoc(raiz, d);
        for (const pos of [
            { bloque: 0, item: 0, off: 0 },
            { bloque: 1, item: 0, off: 0 },
            { bloque: 1, item: 0, off: 1 },
            { bloque: 1, item: 0, off: 2 },
        ]) {
            aplicarRango(raiz, { inicio: pos, fin: pos });
            expect(leerRango(raiz, parsearDom(raiz))).toEqual({ inicio: pos, fin: pos });
        }
    });
});
