/**
 * Presentación → HTML autónomo (DSN1025D): escenario fijo, una sola hoja y un solo guion, texto
 * escapado, enlaces e imágenes con lista blanca, sin `display:none` y sin peticiones externas.
 */
import { describe, expect, test } from "vitest";
import {
    FUENTES_HTML, docRicoAHtml, elementoAHtml, escaparHtml, hexValido,
} from "@/lib/vivo/presentacion-html-piezas";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import type { ElementoLienzo } from "@/lib/mensajeria/formato-tipos";

const meta: MetaPresentacion = { titulo: "Mi charla <script>alert(1)</script>", tema: "cosmos", proporcion: "16:9" };

function el(id: string, extra: Partial<ElementoLienzo> = {}): ElementoLienzo {
    return { id, tipo: "texto", x: 10, y: 10, w: 200, h: 80, z: 1, texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "Hola" }] }] }, ...extra };
}

const d1: Diapositiva = { lienzo: { ancho: 960, alto: 540, elementos: [el("a", { texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "<script>alert(1)</script>" }] }] } })] }, notas: "nota <b>" };
const d2: Diapositiva = { lienzo: { ancho: 960, alto: 540, elementos: [el("b")] } };
const fecha = { fecha: "2026-10-25" };

describe("piezas puras", () => {
    test("escapa las cinco entidades y valida solo hex", () => {
        expect(escaparHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
        expect(hexValido("#0af")).toBe("#0af");
        expect(hexValido("#AABBCCDD")).toBe("#AABBCCDD");
        for (const malo of ["red", "#12345g", "url(javascript:1)", 12, null]) expect(hexValido(malo)).toBeNull();
    });

    test("las pilas son concretas y no dependen de next/font", () => {
        expect(Object.values(FUENTES_HTML)).toHaveLength(8);
        expect(Object.values(FUENTES_HTML).some((f) => f.includes("var(--"))).toBe(false);
        expect(FUENTES_HTML.inter).toBe("Inter, system-ui, sans-serif");
        expect(FUENTES_HTML.mono).toContain("JetBrains Mono");
    });

    test("documento rico: títulos, listas, tareas y código escapado", () => {
        const html = docRicoAHtml({
            bloques: [
                { tipo: "titulo", nivel: 1, tramos: [{ texto: "T" }] },
                { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "ok" }] }, { hecha: false, tramos: [{ texto: "no" }] }] },
                { tipo: "lista", ordenada: true, items: [[{ texto: "uno", marcas: ["negrita"] }]] },
                { tipo: "codigo", texto: "<b>" },
            ],
        }, 2);
        expect(html).toContain("<h1>T</h1>");
        expect(html).toContain("☑");
        expect(html).toContain("☐");
        expect(html).toContain("<ol>");
        expect(html).toContain("<strong>uno</strong>");
        expect(html).not.toContain("<input");
        expect(html).toContain("&lt;b&gt;");
    });

    test("solo enlaces http(s) o mailto; javascript: queda como texto", () => {
        const malo = docRicoAHtml({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "pulsa", enlace: "javascript:alert(1)" }] }] }, 1);
        expect(malo).toContain("pulsa");
        expect(malo).not.toContain("<a ");
        expect(malo).not.toContain("javascript:");
        const bueno = docRicoAHtml({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "web", enlace: "https://x.test" }] }] }, 1);
        expect(bueno).toContain('<a href="https://x.test" rel="noopener noreferrer">web</a>');
    });

    test("elemento: medidas por factor y solo imágenes data:image/ o https", () => {
        const base = el("x", { tipo: "imagen", x: 10, y: 20, w: 100, h: 50, z: 3, url: "https://x.test/a.png" });
        const html = elementoAHtml(base, 2);
        expect(html).toContain("left:20px;top:40px;width:200px;height:100px");
        expect(html).toContain('<img src="https://x.test/a.png" alt="">');
        expect(elementoAHtml(el("y", { tipo: "imagen", url: "javascript:alert(1)" }), 1)).toBe("");
        expect(elementoAHtml(el("z", { tipo: "imagen", url: "http://x.test/a.png" }), 1)).toBe("");
    });
});

describe("documento autónomo", () => {
    test("dos diapositivas, solo la primera activa", () => {
        const html = presentacionAHtml(meta, [d1, d2], fecha);
        expect((html.match(/<section class="slide/g) ?? [])).toHaveLength(2);
        expect((html.match(/<section class="slide active"/g) ?? [])).toHaveLength(1);
        expect(html.indexOf('<section class="slide active"')).toBeLessThan(html.indexOf('<section class="slide"'));
    });

    test("el script del título y del texto sale escapado y el documento tiene un solo <script", () => {
        const html = presentacionAHtml(meta, [d1], fecha);
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html).not.toContain("<script>alert(1)</script>");
        expect((html.match(/<script/g) ?? [])).toHaveLength(1);
    });

    test("política CSP, sin display:none y con movimiento reducido", () => {
        const html = presentacionAHtml(meta, [d1, d2], fecha);
        expect(html).toContain("http-equiv=\"Content-Security-Policy\"");
        expect(html).toContain("default-src 'none'");
        expect(html).not.toContain("display:none");
        expect(html).toContain("@media (prefers-reduced-motion: reduce)");
        expect(html).toContain("visibility:hidden");
        expect(html).toContain("pointer-events:none");
    });

    test("4:3 da 1440×1080 y el mismo dato da el mismo HTML", () => {
        const html = presentacionAHtml({ ...meta, proporcion: "4:3" }, [d1], fecha);
        expect(html).toContain("width:1440px");
        expect(html).toContain("height:1080px");
        expect(presentacionAHtml(meta, [d1, d2], fecha)).toBe(presentacionAHtml(meta, [d1, d2], fecha));
    });

    test("notas del orador en un aside oculto y escapado", () => {
        const html = presentacionAHtml(meta, [d1], { ...fecha, incluirNotas: true });
        expect(html).toContain('<aside class="notas" hidden>nota &lt;b&gt;</aside>');
    });

    test("nombre de archivo sin acentos ni símbolos", () => {
        expect(nombreArchivoPresentacion("Mi charla ñandú")).toBe("mi-charla-nandu.html");
        expect(nombreArchivoPresentacion("")).toBe("presentacion.html");
        expect(nombreArchivoPresentacion({ titulo: "  ¡Hola, mundo!  " })).toBe("hola-mundo.html");
    });
});
