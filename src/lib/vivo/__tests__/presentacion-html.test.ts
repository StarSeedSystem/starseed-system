/**
 * Exportador a HTML autónomo de la presentación: parte del HTML, escape, CSP, escenario fijo
 * y nombre de archivo. Solo módulos puros, sin red ni disco.
 */
import { describe, it, expect } from "vitest";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import type { ElementoLienzo, TramoTexto } from "@/lib/mensajeria/formato-tipos";

const meta: MetaPresentacion = { titulo: "<script>alert(1)</script>", tema: "claro", proporcion: "16:9" };

function texto(id: string, tramos: TramoTexto[]): ElementoLienzo {
    return { id, tipo: "texto", x: 10, y: 10, w: 600, h: 200, z: 1, texto: { bloques: [{ tipo: "parrafo", tramos }] } };
}

const textoScript = texto("t1", [{ texto: "<script>alert(1)</script>" }]);
const textoEnlaceJs = texto("t2", [{ texto: "clic", enlace: "javascript:alert(1)" }]);
const imagenJs: ElementoLienzo = { id: "i1", tipo: "imagen", x: 0, y: 0, w: 100, h: 100, z: 2, url: "javascript:alert(1)" };
const imagenHttp: ElementoLienzo = { id: "i2", tipo: "imagen", x: 0, y: 0, w: 100, h: 100, z: 3, url: "http://ejemplo/x.png" };

const d1: Diapositiva = { lienzo: { ancho: 960, alto: 540, elementos: [textoScript, textoEnlaceJs, imagenJs, imagenHttp] }, notas: "notas de <la> primera" };
const d2: Diapositiva = { lienzo: { ancho: 960, alto: 540, elementos: [texto("t3", [{ texto: "segunda" }])] } };

const opciones = { fecha: "2026-10-25" };

describe("presentacionAHtml", () => {
    it("genera dos section.slide con solo la primera activa", () => {
        const html = presentacionAHtml(meta, [d1, d2], opciones);
        expect(html.match(/<section class="slide/g)).toHaveLength(2);
        expect(html.match(/class="slide active"/g)).toHaveLength(1);
        expect(html.indexOf('class="slide active"')).toBeLessThan(html.indexOf('class="slide"'));
    });

    it("escapa <script> del título y del texto: un único <script en todo el documento", () => {
        const html = presentacionAHtml(meta, [d1, d2], opciones);
        expect(html.match(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/g)).toHaveLength(2);
        expect(html).not.toContain("<script>alert(1)");
        expect(html.match(/<script/g)).toHaveLength(1);
    });

    it("un enlace javascript: queda como texto", () => {
        const html = presentacionAHtml(meta, [d1, d2], opciones);
        expect(html).not.toContain("href=\"javascript:");
        expect(html).not.toContain("javascript:");
        expect(html).toContain("clic");
    });

    it("una imagen javascript: o http: se omite", () => {
        const html = presentacionAHtml(meta, [d1, d2], opciones);
        expect(html).not.toContain("<img");
    });

    it("incluye la política CSP", () => {
        const html = presentacionAHtml(meta, [d1, d2], opciones);
        expect(html).toContain("default-src 'none'");
        expect(html).toContain("img-src data: https:");
        expect(html).toContain("base-uri 'none'");
    });

    it("no usa display:none y respeta prefers-reduced-motion", () => {
        const html = presentacionAHtml(meta, [d1, d2], opciones);
        expect(html).not.toContain("display:none");
        expect(html).toContain("prefers-reduced-motion");
    });

    it("4:3 da un escenario de 1440×1080", () => {
        const html = presentacionAHtml({ ...meta, proporcion: "4:3" }, [d2], opciones);
        expect(html).toContain("width:1440px");
        expect(html).toContain("height:1080px");
    });

    it("el mismo dato da el mismo HTML", () => {
        expect(presentacionAHtml(meta, [d1, d2], opciones)).toBe(presentacionAHtml(meta, [d1, d2], opciones));
    });

    it("con incluirNotas guarda las notas escapadas en un aside oculto", () => {
        const html = presentacionAHtml(meta, [d1, d2], { ...opciones, incluirNotas: true });
        expect(html).toContain('<aside id="notas" hidden>');
        expect(html).toContain("notas de &lt;la&gt; primera");
    });
});

describe("nombreArchivoPresentacion", () => {
    it("minúsculas, sin acentos ni símbolos, con .html", () => {
        expect(nombreArchivoPresentacion({ titulo: "Mi charla ñandú" })).toBe("mi-charla-nandu.html");
    });

    it("vacío → presentacion.html", () => {
        expect(nombreArchivoPresentacion({ titulo: "" })).toBe("presentacion.html");
    });
});

