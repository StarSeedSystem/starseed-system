/**
 * Exportación de la presentación a HTML autónomo: escenario fijo escalado, una sola sección
 * activa, escape de texto y enlaces, imágenes solo data/https, CSP, movimiento reducido,
 * medidas de 4:3, determinismo y nombre de archivo. También las piezas puras que lo componen.
 */
import { describe, expect, test } from "vitest";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import type { ElementoLienzo } from "@/lib/mensajeria/formato-tipos";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";
import { FUENTES_HTML, docRicoAHtml, elementoAHtml, escaparHtml, hexValido } from "@/lib/vivo/presentacion-html-piezas";

const meta: MetaPresentacion = { titulo: "Asamblea", tema: "cosmos", proporcion: "16:9" };
const F = "2026-10-27";
const texto = (t: string, extra: Partial<ElementoLienzo> = {}): ElementoLienzo => ({ id: "t", tipo: "texto", x: 40, y: 40, w: 800, h: 120, z: 1, texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: t }] }] }, ...extra });
const diapo = (t: string, extras: ElementoLienzo[] = []): Diapositiva => ({ lienzo: { ancho: 960, alto: 540, elementos: [texto(t), ...extras] } });
const imagen = (url: string): ElementoLienzo => ({ id: "i", tipo: "imagen", x: 0, y: 0, w: 100, h: 100, z: 2, url });

describe("presentación a HTML autónomo", () => {
    test("dos diapositivas: dos secciones y solo la primera activa", () => {
        const html = presentacionAHtml(meta, [diapo("Uno"), diapo("Dos")], { fecha: F });
        expect(html.match(/<section class="slide/g) ?? []).toHaveLength(2);
        expect(html.match(/class="slide active"/g) ?? []).toHaveLength(1);
        expect(html).toContain('<section class="slide active"');
    });

    test("título y texto con script salen escapados y hay un único script", () => {
        const peligro = "<script>alert(1)</script>";
        const html = presentacionAHtml({ ...meta, titulo: peligro }, [diapo(peligro)], { fecha: F });
        expect(html).not.toContain(peligro);
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html.match(/<script/g) ?? []).toHaveLength(1);
    });

    test("enlace javascript: queda como texto; https lleva rel seguro", () => {
        const conEnlace = (enlace: string) => texto("pulsa", { texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "pulsa", enlace }] }] } });
        expect(elementoAHtml(conEnlace("javascript:alert(1)"), 2)).not.toContain("<a ");
        expect(elementoAHtml(conEnlace("https://starseed-os.vercel.app"), 2)).toContain('href="https://starseed-os.vercel.app" rel="noopener noreferrer"');
    });

    test("imágenes solo data:image o https", () => {
        expect(elementoAHtml(imagen("javascript:alert(1)"), 2)).toBe("");
        expect(elementoAHtml(imagen("http://example.com/a.png"), 2)).toBe("");
        expect(elementoAHtml(imagen("data:image/png;base64,AAAA"), 2)).toContain('<img alt=""');
        expect(elementoAHtml(imagen("https://example.com/a.png"), 2)).toContain('<img alt=""');
    });

    test("CSP, sin display:none y con movimiento reducido", () => {
        const html = presentacionAHtml(meta, [diapo("x")], { fecha: F });
        expect(html).toContain('http-equiv="Content-Security-Policy"');
        expect(html).toContain("default-src 'none'");
        expect(html).not.toContain("display:none");
        expect(html).toContain("prefers-reduced-motion");
    });

    test("4:3 mide 1440×1080 y 16:9 mide 1920×1080", () => {
        expect(presentacionAHtml({ ...meta, proporcion: "4:3" }, [diapo("x")], { fecha: F })).toContain("width:1440px;height:1080px");
        expect(presentacionAHtml(meta, [diapo("x")], { fecha: F })).toContain("width:1920px;height:1080px");
    });

    test("el mismo dato da el mismo HTML", () => {
        expect(presentacionAHtml(meta, [diapo("x")], { fecha: F })).toBe(presentacionAHtml(meta, [diapo("x")], { fecha: F }));
    });

    test("notas solo si se piden y escapadas", () => {
        const conNotas: Diapositiva = { ...diapo("x"), notas: "<b>nota</b>" };
        expect(presentacionAHtml(meta, [conNotas], { fecha: F })).not.toContain("<aside");
        expect(presentacionAHtml(meta, [conNotas], { fecha: F, incluirNotas: true })).toContain("<aside hidden>&lt;b&gt;nota&lt;/b&gt;</aside>");
    });

    test("nombre de archivo sin acentos ni símbolos", () => {
        expect(nombreArchivoPresentacion("Mi charla ñandú")).toBe("mi-charla-nandu.html");
        expect(nombreArchivoPresentacion({ titulo: "   " })).toBe("presentacion.html");
    });
});

describe("piezas puras", () => {
    test("escape, hex y fuentes concretas", () => {
        expect(escaparHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
        expect(hexValido("#abc")).toBe("#abc");
        expect(hexValido("#A1B2C3D4")).toBe("#A1B2C3D4");
        expect(hexValido("red")).toBeNull();
        expect(hexValido("#12")).toBeNull();
        expect(hexValido(12)).toBeNull();
        expect(FUENTES_HTML.inter).toBe("Inter, system-ui, sans-serif");
        expect(FUENTES_HTML.mono).toBe("ui-monospace, 'JetBrains Mono', monospace");
        expect(Object.values(FUENTES_HTML).join(" ")).not.toContain("var(--");
    });

    test("documento rico: bloques, tareas sin input y marcas", () => {
        const html = docRicoAHtml({ bloques: [
            { tipo: "titulo", nivel: 1, tramos: [{ texto: "Hola" }] },
            { tipo: "titulo", nivel: 3, tramos: [{ texto: "Fin" }] },
            { tipo: "lista", ordenada: true, items: [[{ texto: "uno" }]] },
            { tipo: "lista", ordenada: false, items: [[{ texto: "dos" }]] },
            { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "hecha" }] }, { hecha: false, tramos: [{ texto: "pendiente" }] }] },
            { tipo: "cita", tramos: [{ texto: "cita" }] },
            { tipo: "codigo", texto: "<b>no</b>" },
            { tipo: "separador" },
        ] }, 2);
        for (const etiqueta of ["<h1", "<h3", "<ol", "<ul", "☑", "☐", "<blockquote", "&lt;b&gt;no&lt;/b&gt;", "<hr"]) expect(html).toContain(etiqueta);
        expect(html).not.toContain("<input");
        const marcas = docRicoAHtml({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "x", marcas: ["negrita", "cursiva", "subrayado", "tachado", "codigo"], color: "#0f0", enlace: "/interno" }] }] }, 1);
        for (const etiqueta of ["<strong>", "<em>", "<u>", "<s>", "<code>", "color:#0f0"]) expect(marcas).toContain(etiqueta);
        expect(marcas).not.toContain("<a ");
        expect(docRicoAHtml({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "x", color: "url(javascript:1)" }] }] }, 1)).not.toContain("javascript:");
    });

    test("texto escala; cajas y formas no ejecutan nada ajeno", () => {
        const el = elementoAHtml({ ...texto("x"), x: 10, y: 20, w: 100, h: 50, z: 3, rot: 15, opacidad: 0.5, radio: 4, estilo: { fuente: "titular", tamano: 20, color: "#123456", alineacion: "centro", negrita: true, cursiva: true } }, 2);
        for (const trozo of ["left:20px", "top:40px", "width:200px", "height:100px", "rotate(15deg)", "opacity:0.5", "font-size:40px", "color:#123456", "text-align:center", "font-weight:700", "font-style:italic"]) expect(el).toContain(trozo);
        const caja = elementoAHtml({ id: "v", tipo: "video", x: 0, y: 0, w: 10, h: 10, z: 1, nombre: "Clip" }, 2);
        expect(caja).toContain("Clip");
        for (const etiqueta of ["<iframe", "<video", "<audio"]) expect(caja).not.toContain(etiqueta);
        const circulo = elementoAHtml({ id: "f", tipo: "forma", x: 0, y: 0, w: 10, h: 10, z: 1, forma: { tipo: "circulo", color: "#ff0", relleno: true } }, 2);
        expect(circulo).toContain("border-radius:50%");
        expect(circulo).toContain("background:#ff0");
        expect(elementoAHtml({ id: "f", tipo: "forma", x: 0, y: 0, w: 10, h: 10, z: 1, forma: { tipo: "estrella", color: "#f00" } }, 2)).toContain("clip-path:polygon");
        expect(elementoAHtml({ id: "f", tipo: "forma", x: 0, y: 0, w: 10, h: 10, z: 1, forma: { tipo: "rect", color: "javascript:1" } }, 2)).not.toContain("javascript:");
    });
});
