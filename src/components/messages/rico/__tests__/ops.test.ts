import { describe, expect, it } from "vitest";
import type { DocRico } from "@/lib/mensajeria/formato-tipos";
import {
    alinearBloques,
    alternarMarca,
    convertirBloques,
    fijarPropiedad,
    insertarSeparador,
    rangoPalabra,
    todoTiene,
} from "@/components/messages/rico/doc-ops";
import { anguloHacia, cambiarTamano, crearElemento, escalar, lienzoVacio, mover, moverCapa } from "@/components/messages/rico/lienzo-ops";
import { adjuntosDeFormato, construirFormato } from "@/components/messages/rico/editor-mensaje-rico";

const p = (bloque: number, off: number, item = 0) => ({ bloque, item, off });

describe("doc-ops", () => {
    const doc: DocRico = { bloques: [{ tipo: "parrafo", tramos: [{ texto: "Hola mundo" }] }, { tipo: "parrafo", tramos: [{ texto: "Adiós" }] }] };

    it("alterna marcas sobre un rango que cruza bloques", () => {
        const d = alternarMarca(doc, { inicio: p(0, 5), fin: p(1, 3) }, "negrita");
        expect(d.bloques).toEqual([
            { tipo: "parrafo", tramos: [{ texto: "Hola " }, { texto: "mundo", marcas: ["negrita"] }] },
            { tipo: "parrafo", tramos: [{ texto: "Adi", marcas: ["negrita"] }, { texto: "ós" }] },
        ]);
        expect(todoTiene(d, { inicio: p(0, 5), fin: p(1, 3) }, (f) => f.marcas.includes("negrita"))).toBe(true);
        const quitado = alternarMarca(d, { inicio: p(0, 5), fin: p(1, 3) }, "negrita");
        expect(quitado.bloques).toEqual(doc.bloques);
    });

    it("color y enlace sobre la palabra del cursor", () => {
        const r = rangoPalabra(doc, p(0, 7));
        expect(r).toEqual({ inicio: p(0, 5), fin: p(0, 10) });
        const d = fijarPropiedad(doc, r, "color", "#ff0000");
        expect(d.bloques[0]).toEqual({ tipo: "parrafo", tramos: [{ texto: "Hola " }, { texto: "mundo", color: "#ff0000" }] });
        expect(fijarPropiedad(d, r, "color", undefined).bloques[0]).toEqual(doc.bloques[0]);
    });

    it("convierte en lista, une listas contiguas y vuelve a párrafo", () => {
        const a = convertirBloques(doc, { inicio: p(0, 2), fin: p(1, 1) }, "lista");
        expect(a.doc.bloques).toEqual([{ tipo: "lista", ordenada: false, items: [[{ texto: "Hola mundo" }], [{ texto: "Adiós" }]] }]);
        expect(a.rango).toEqual({ inicio: p(0, 2, 0), fin: p(0, 1, 1) });
        const b = convertirBloques(a.doc, { inicio: p(0, 0, 1), fin: p(0, 0, 1) }, "lista");
        expect(b.doc.bloques).toEqual([
            { tipo: "lista", ordenada: false, items: [[{ texto: "Hola mundo" }]] },
            { tipo: "parrafo", tramos: [{ texto: "Adiós" }] },
        ]);
        expect(b.rango.inicio).toEqual(p(1, 0));
        const c = convertirBloques(b.doc, { inicio: p(1, 0), fin: p(1, 0) }, "lista");
        expect(c.doc.bloques).toEqual(a.doc.bloques);
    });

    it("convierte en código y en título conservando la posición", () => {
        const cod = convertirBloques(doc, { inicio: p(1, 2), fin: p(1, 2) }, "codigo");
        expect(cod.doc.bloques[1]).toEqual({ tipo: "codigo", texto: "Adiós" });
        const dos = convertirBloques(doc, { inicio: p(0, 0), fin: p(1, 2) }, "codigo");
        expect(dos.doc.bloques).toEqual([{ tipo: "codigo", texto: "Hola mundo\nAdiós" }]);
        expect(dos.rango.fin).toEqual(p(0, 13));
        const t = convertirBloques(doc, { inicio: p(0, 3), fin: p(0, 3) }, "titulo1");
        expect(t.doc.bloques[0]).toEqual({ tipo: "titulo", nivel: 1, tramos: [{ texto: "Hola mundo" }] });
    });

    it("alinea y añade separadores", () => {
        expect(alinearBloques(doc, { inicio: p(0, 0), fin: p(0, 0) }, "centro").bloques[0]).toMatchObject({ alineacion: "centro" });
        const s = insertarSeparador(doc, p(0, 3));
        expect(s.doc.bloques.map((b) => b.tipo)).toEqual(["parrafo", "separador", "parrafo"]);
        expect(s.pos).toEqual(p(2, 0));
    });
});

describe("lienzo-ops", () => {
    it("crea elementos centrados dentro del lienzo", () => {
        const l = lienzoVacio("horizontal");
        const el = crearElemento("video", l, { url: "https://c/v.mp4" });
        expect(el.x + el.w / 2).toBeCloseTo(l.ancho / 2, 0);
        expect(Math.abs(el.h - (el.w * 9) / 16)).toBeLessThanOrEqual(1);
        expect(el.z).toBe(1);
    });

    it("mueve con rejilla y escala desde una esquina con proporción", () => {
        const el = { id: "a", tipo: "forma" as const, x: 100, y: 100, w: 200, h: 100, z: 1 };
        expect(mover(el, 13, 26, true)).toMatchObject({ x: 110, y: 130 });
        const libre = escalar(el, 1, 1, 50, 10, false);
        expect(libre).toMatchObject({ x: 100, y: 100, w: 250, h: 110 });
        const prop = escalar(el, 1, 1, 50, 10, true);
        expect(prop.w / prop.h).toBeCloseTo(2, 5);
        const izq = escalar(el, -1, -1, -20, -20, false);
        expect(izq).toMatchObject({ x: 80, y: 80, w: 220, h: 120 });
    });

    it("gira con imanes y ordena capas", () => {
        expect(anguloHacia(0, 0, 0, -10, false)).toBe(0);
        expect(anguloHacia(0, 0, 10, 0.3, false)).toBe(90);
        expect(anguloHacia(0, 0, 10, 4, true)).toBe(105);
        const els = [
            { id: "a", tipo: "forma" as const, x: 0, y: 0, w: 1, h: 1, z: 1 },
            { id: "b", tipo: "forma" as const, x: 0, y: 0, w: 1, h: 1, z: 2 },
            { id: "c", tipo: "forma" as const, x: 0, y: 0, w: 1, h: 1, z: 3 },
        ];
        expect(moverCapa(els, "a", "frente").find((e) => e.id === "a")!.z).toBe(3);
        expect(moverCapa(els, "c", "atras").map((e) => e.z)).toEqual([1, 3, 2]);
    });

    it("cambiar el tamaño del lienzo conserva la composición centrada", () => {
        const l = { ...lienzoVacio("cuadrado"), elementos: [{ id: "a", tipo: "forma" as const, x: 170, y: 170, w: 200, h: 200, z: 1 }] };
        const v = cambiarTamano(l, "historia");
        expect(v.alto).toBe(960);
        expect(v.elementos[0]).toMatchObject({ x: 170, y: 380 });
    });
});

describe("editor · formato y adjuntos", () => {
    it("construye el formato sin partes vacías y recoge adjuntos subidos y vivos", () => {
        const f = construirFormato({
            estilo: null,
            doc: { bloques: [{ tipo: "parrafo", tramos: [] }] },
            lienzo: {
                ancho: 540,
                alto: 540,
                elementos: [
                    { id: "i", tipo: "imagen", x: 0, y: 0, w: 1, h: 1, z: 1, url: "https://c/a.png", nombre: "Foto" },
                    { id: "j", tipo: "imagen", x: 0, y: 0, w: 1, h: 1, z: 2, url: "https://externo/b.png" },
                    { id: "v", tipo: "vivo", x: 0, y: 0, w: 1, h: 1, z: 3, vivo: { kind: "vivo", tipoVivo: "sala", sesionId: "s", route: "/vivo/s", name: "Sala", permiso: "ver" } },
                ],
            },
        });
        expect(f.doc).toBeUndefined();
        expect(f.estilo).toBeUndefined();
        const adj = adjuntosDeFormato(f, { "https://c/a.png": { kind: "image", url: "https://c/a.png", name: "a.png" } });
        expect(adj).toEqual([
            { kind: "image", url: "https://c/a.png", name: "Foto" },
            { kind: "vivo", tipoVivo: "sala", sesionId: "s", route: "/vivo/s", name: "Sala", permiso: "ver" },
        ]);
    });
});
