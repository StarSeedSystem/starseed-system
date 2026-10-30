/**
 * Presentación en vivo → HTML autónomo (DSN1025D). Pruebas de las funciones puras: escapado,
 * colores, documento rico, elementos, escenario fijo 16:9/4:3, CSP, notas y nombre de archivo.
 */
import { describe, expect, it } from "vitest";
import type { DocRico, ElementoLienzo, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";
import { docRicoAHtml, escaparHtml, hexValido } from "@/lib/vivo/presentacion-html-piezas";

const meta: MetaPresentacion = { titulo: "Mi charla", tema: "cosmos", proporcion: "16:9" };
const fecha = "2026-10-30";

function diapo(parte: Partial<LienzoMensaje> = {}, notas?: string): Diapositiva {
    return { lienzo: { ancho: 960, alto: 540, elementos: [], ...parte }, ...(notas ? { notas } : {}) };
}
function texto(contenido: string): ElementoLienzo {
    const doc: DocRico = { bloques: [{ tipo: "parrafo", tramos: [{ texto: contenido }] }] };
    return { id: "t", tipo: "texto", x: 10, y: 10, w: 400, h: 100, z: 1, texto: doc };
}

describe("presentacion-html · piezas", () => {
    it("escapa los cinco caracteres peligrosos", () => {
        expect(escaparHtml(`<script>alert("x") & 'y'</script>`))
            .toBe("&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;");
    });
    it("solo acepta hex", () => {
        expect(hexValido("#abc")).toBe("#abc");
        expect(hexValido("#AABBCCDD")).toBe("#aabbccdd");
        expect(hexValido("red")).toBeNull();
        expect(hexValido(12)).toBeNull();
    });
});

describe("presentacion-html · documento rico", () => {
    it("convierte todos los bloques y marcas", () => {
        const doc: DocRico = {
            bloques: [
                { tipo: "titulo", nivel: 2, tramos: [{ texto: "Título" }] },
                { tipo: "parrafo", tramos: [{ texto: "Hola ", marcas: ["negrita"] }, { texto: "mundo" }] },
                { tipo: "lista", ordenada: true, items: [[{ texto: "uno" }]] },
                { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "fin" }] }] },
                { tipo: "cita", tramos: [{ texto: "cita" }] },
                { tipo: "codigo", texto: "<b>x</b>" },
                { tipo: "separador" },
            ],
        };
        const html = docRicoAHtml(doc, 2);
        expect(html).toContain("<h2>Título</h2>");
        expect(html).toContain("<strong>Hola </strong>");
        expect(html).toContain("<ol><li>uno</li></ol>");
        expect(html).toContain("☑ fin");
        expect(html).toContain("<blockquote>cita</blockquote>");
        expect(html).toContain("<pre>&lt;b&gt;x&lt;/b&gt;</pre>");
        expect(html).toContain("<hr>");
    });
});

describe("presentacion-html · documento", () => {
    it("dos diapositivas: dos secciones y solo la primera activa", () => {
        const html = presentacionAHtml(meta, [diapo({ elementos: [texto("uno")] }), diapo()], { fecha });
        expect((html.match(/<section class="slide/g) ?? []).length).toBe(2);
        expect((html.match(/class="slide active"/g) ?? []).length).toBe(1);
    });
    it("escapa el título y el texto y deja un único script", () => {
        const html = presentacionAHtml(
            { ...meta, titulo: "<script>alert(1)</script>" },
            [diapo({ elementos: [texto("<script>alert(1)</script>")] })],
            { fecha },
        );
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect((html.match(/<script/g) ?? []).length).toBe(1);
    });
    it("un enlace javascript: queda como texto", () => {
        const doc: DocRico = { bloques: [{ tipo: "parrafo", tramos: [{ texto: "malo", enlace: "javascript:alert(1)" }] }] };
        const html = docRicoAHtml(doc, 1);
        expect(html).not.toContain("<a ");
        expect(html).toContain("malo");
    });
    it("solo pinta imágenes data:image o https", () => {
        const elementos: ElementoLienzo[] = [
            { id: "a", tipo: "imagen", x: 0, y: 0, w: 10, h: 10, z: 1, url: "javascript:alert(1)" },
            { id: "b", tipo: "imagen", x: 0, y: 0, w: 10, h: 10, z: 2, url: "http://x/y.png" },
            { id: "c", tipo: "imagen", x: 0, y: 0, w: 10, h: 10, z: 3, url: "https://x/y.png" },
        ];
        const html = presentacionAHtml(meta, [diapo({ elementos })], { fecha });
        expect(html).not.toContain("javascript:");
        expect(html).not.toContain("http://x/y.png");
        expect((html.match(/<img /g) ?? []).length).toBe(1);
    });
    it("incluye CSP, evita display:none y respeta el movimiento reducido", () => {
        const html = presentacionAHtml(meta, [diapo()], { fecha });
        expect(html).toContain("Content-Security-Policy");
        expect(html).toContain("default-src 'none'");
        expect(html).not.toContain("display:none");
        expect(html).toContain("prefers-reduced-motion");
    });
    it("4:3 da 1440×1080", () => {
        const html = presentacionAHtml({ ...meta, proporcion: "4:3" }, [diapo()], { fecha });
        expect(html).toContain('data-ancho="1440"');
        expect(html).toContain('data-alto="1080"');
    });
    it("el mismo dato da el mismo HTML", () => {
        const a = presentacionAHtml(meta, [diapo({ elementos: [texto("igual")] })], { fecha });
        const b = presentacionAHtml(meta, [diapo({ elementos: [texto("igual")] })], { fecha });
        expect(a).toBe(b);
    });
    it("guarda las notas del orador en un aside oculto y escapado", () => {
        const html = presentacionAHtml(meta, [diapo({}, "<b>nota</b>")], { fecha, incluirNotas: true });
        expect(html).toContain('<aside class="aside-notas" hidden>');
        expect(html).toContain("&lt;b&gt;nota&lt;/b&gt;");
    });
    it("nombre de archivo sin acentos ni símbolos", () => {
        expect(nombreArchivoPresentacion("Mi charla ñandú")).toBe("mi-charla-nandu.html");
        expect(nombreArchivoPresentacion({ titulo: "" })).toBe("presentacion.html");
    });
});
