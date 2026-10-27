/**
 * Exportador a HTML autónomo: escenario fijo 16:9/4:3, una sola sección activa, texto y títulos
 * escapados, enlaces y medios no seguros degradados a texto, CSP estricta y nombre de archivo.
 */
import { describe, expect, test } from "vitest";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";
import { FUENTES_HTML, docRicoAHtml, escaparHtml, hexValido } from "@/lib/vivo/presentacion-html-piezas";

const meta: MetaPresentacion = { titulo: "Mi charla", tema: "cosmos", proporcion: "16:9" };

function diapo(texto: string, notas?: string): Diapositiva {
    return {
        notas,
        lienzo: {
            ancho: 960,
            alto: 540,
            elementos: [
                { id: "t", tipo: "texto", x: 40, y: 40, w: 400, h: 100, z: 1, texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto }] }] } },
            ],
        },
    };
}

function diapoImagen(url: string): Diapositiva {
    return { lienzo: { ancho: 960, alto: 540, elementos: [{ id: "i", tipo: "imagen", x: 0, y: 0, w: 100, h: 100, z: 1, url }] } };
}

describe("presentacionAHtml", () => {
    test("dos diapositivas: dos secciones y solo la primera activa", () => {
        const html = presentacionAHtml(meta, [diapo("Uno"), diapo("Dos")], { fecha: "2026-10-27" });
        expect(html.match(/<section class="slide/g)?.length).toBe(2);
        expect(html.match(/<section class="slide active/g)?.length).toBe(1);
        expect(html).toContain('<section class="slide active" data-indice="0"');
    });

    test("texto y título escapados y un único script en el documento", () => {
        const malicioso = "<script>alert(1)</script>";
        const html = presentacionAHtml({ ...meta, titulo: malicioso }, [diapo(malicioso)], { fecha: "2026-10-27" });
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html.match(/<script/g)?.length).toBe(1);
    });

    test("CSP, movimiento reducido y sin display:none en las diapositivas", () => {
        const html = presentacionAHtml(meta, [diapo("Hola")], { fecha: "2026-10-27" });
        expect(html).toContain('http-equiv="Content-Security-Policy"');
        expect(html).toContain("default-src 'none'");
        expect(html).toContain("@media (prefers-reduced-motion: reduce)");
        expect(html).not.toContain("display:none");
    });

    test("4:3 da un escenario de 1440×1080", () => {
        const html = presentacionAHtml({ ...meta, proporcion: "4:3" }, [diapo("Hola")], { fecha: "2026-10-27" });
        expect(html).toContain("width:1440px;height:1080px");
    });

    test("mismo dato y misma fecha dan el mismo HTML", () => {
        const opciones = { fecha: "2026-10-27" };
        expect(presentacionAHtml(meta, [diapo("Hola")], opciones)).toBe(presentacionAHtml(meta, [diapo("Hola")], opciones));
    });

    test("las notas del orador van en un aside oculto y escapadas", () => {
        const html = presentacionAHtml(meta, [diapo("Hola", "<b>ojo</b>")], { incluirNotas: true, fecha: "2026-10-27" });
        expect(html).toContain('<aside id="notas" hidden>');
        expect(html).toContain("&lt;b&gt;ojo&lt;/b&gt;");
    });
});

describe("contenido ajeno", () => {
    test("un enlace javascript: queda como texto y un https lleva rel", () => {
        const malo = docRicoAHtml({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "pulsa", enlace: "javascript:alert(1)" }] }] }, 1);
        expect(malo).toContain("pulsa");
        expect(malo).not.toContain("<a ");
        const bueno = docRicoAHtml({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "web", enlace: "https://example.com" }] }] }, 1);
        expect(bueno).toContain('rel="noopener noreferrer"');
    });

    test("una imagen javascript: o http: se omite", () => {
        const html = presentacionAHtml(meta, [diapoImagen("javascript:alert(1)"), diapoImagen("http://example.com/a.png")], { fecha: "2026-10-27" });
        expect(html).not.toContain("<img");
    });
});

describe("piezas puras", () => {
    test("escape, color hex y fuentes concretas", () => {
        expect(escaparHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
        expect(hexValido("#0A0F1D")).toBe("#0A0F1D");
        expect(hexValido("rojo")).toBeNull();
        expect(hexValido(12)).toBeNull();
        expect(FUENTES_HTML.mono).toBe("ui-monospace, 'JetBrains Mono', monospace");
    });

    test("tareas con ☐/☑ sin input y marcas anidadas", () => {
        const html = docRicoAHtml(
            {
                bloques: [
                    { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "hecho" }] }, { hecha: false, tramos: [{ texto: "ver" }] }] },
                    { tipo: "parrafo", tramos: [{ texto: "nota", marcas: ["negrita", "cursiva", "codigo"] }] },
                ],
            },
            1,
        );
        expect(html).toContain("☑ hecho");
        expect(html).toContain("☐ ver");
        expect(html).not.toContain("<input");
        expect(html).toContain("<strong>");
        expect(html).toContain("<em>");
        expect(html).toContain("<code>");
    });
});

test("nombre de archivo sin acentos ni símbolos", () => {
    expect(nombreArchivoPresentacion({ ...meta, titulo: "Mi charla ñandú" })).toBe("mi-charla-nandu.html");
    expect(nombreArchivoPresentacion({ ...meta, titulo: "" })).toBe("presentacion.html");
});
