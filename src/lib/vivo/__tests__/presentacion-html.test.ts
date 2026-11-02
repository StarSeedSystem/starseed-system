/**
 * Presentación en vivo → HTML autónomo (DSN1025D). Pruebas de las funciones puras: escapado,
 * colores, documento rico, elementos, escenario fijo 16:9/4:3, CSP, notas y nombre de archivo.
 */
import { describe, expect, it } from "vitest";
import type { DocRico, ElementoLienzo, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";
import { docRicoAHtml, escaparHtml, hexValido, elementoAHtml } from "@/lib/vivo/presentacion-html-piezas";

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
        expect(escaparHtml(`<script>alert("x") & 'y'</script>`)).toBe(
            "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
        );
    });
    it("solo acepta hex", () => {
        expect(hexValido("#abc")).toBe("#abc");
        expect(hexValido("#AABBCCDD")).toBe("#aabbccdd");
        expect(hexValido("red")).toBeNull();
        expect(hexValido(" #abc ")).toBeNull();
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
    it("renderiza marcas: subrayado, tachado, codigo", () => {
        const doc: DocRico = {
            bloques: [
                { tipo: "parrafo", tramos: [{ texto: "subrayado", marcas: ["subrayado"] }] },
                { tipo: "parrafo", tramos: [{ texto: "tachado", marcas: ["tachado"] }] },
                { tipo: "parrafo", tramos: [{ texto: "codigo", marcas: ["codigo"] }] },
            ],
        };
        const html = docRicoAHtml(doc, 1);
        expect(html).toContain("<u>subrayado</u>");
        expect(html).toContain("<s>tachado</s>");
        expect(html).toContain("<code>codigo</code>");
    });
    it("renderiza lista no ordenada y tareas no hechas", () => {
        const doc: DocRico = {
            bloques: [
                { tipo: "lista", ordenada: false, items: [[{ texto: "a" }], [{ texto: "b" }]] },
                { tipo: "tareas", items: [{ hecha: false, tramos: [{ texto: "pendiente" }] }] },
            ],
        };
        const html = docRicoAHtml(doc, 1);
        expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
        expect(html).toContain("☐ pendiente");
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
        const doc: DocRico = {
            bloques: [{ tipo: "parrafo", tramos: [{ texto: "malo", enlace: "javascript:alert(1)" }] }],
        };
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
    it("16:9 da 1920×1080", () => {
        const html = presentacionAHtml({ ...meta, proporcion: "16:9" }, [diapo()], { fecha });
        expect(html).toContain('data-ancho="1920"');
        expect(html).toContain('data-alto="1080"');
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
    it("fondo: hex propio, preset de burbuja o tema", () => {
        const htmlHex = presentacionAHtml({ ...meta, fondo: "#123456" }, [diapo()], { fecha });
        expect(htmlHex).toContain("background:#123456");
        const htmlPreset = presentacionAHtml({ ...meta, fondo: "violeta" }, [diapo()], { fecha });
        expect(htmlPreset).toContain("background:linear-gradient(135deg,#7C5CFF,#5B3FD9)");
        const htmlTema = presentacionAHtml(meta, [diapo()], { fecha });
        expect(htmlTema).toContain("background:radial-gradient(120% 120% at 0% 0%,#2a1650,#0b0d1a 70%)");
    });
    it("nombre de archivo sin acentos ni símbolos", () => {
        expect(nombreArchivoPresentacion("Mi charla ñandú")).toBe("mi-charla-nandu.html");
        expect(nombreArchivoPresentacion({ titulo: "" })).toBe("presentacion.html");
    });
});

describe("presentacion-html · elementos del lienzo", () => {
    it("renderiza formas: círculo, estrella, línea y rectángulo", () => {
        const circulo: ElementoLienzo = {
            id: "c", tipo: "forma", x: 10, y: 10, w: 50, h: 50, z: 1, forma: { tipo: "circulo", color: "#ff0000" },
        };
        const estrella: ElementoLienzo = {
            id: "e", tipo: "forma", x: 0, y: 0, w: 100, h: 100, z: 2, forma: { tipo: "estrella", color: "#00ff00", relleno: true },
        };
        const linea: ElementoLienzo = {
            id: "l", tipo: "forma", x: 0, y: 50, w: 100, h: 4, z: 3, forma: { tipo: "linea", color: "#0000ff" },
        };
        expect(elementoAHtml(circulo, 1)).toContain("border-radius:50%");
        expect(elementoAHtml(estrella, 1)).toContain("clip-path:");
        expect(elementoAHtml(linea, 1)).toContain("height:2px");
    });
    it("renderiza video, audio, web, app, vivo, archivo como caja con nombre", () => {
        const video: ElementoLienzo = { id: "v", tipo: "video", x: 0, y: 0, w: 100, h: 60, z: 1, nombre: "Video test" };
        const audio: ElementoLienzo = { id: "a", tipo: "audio", x: 0, y: 0, w: 100, h: 60, z: 1, nombre: "Audio test" };
        const web: ElementoLienzo = { id: "w", tipo: "web", x: 0, y: 0, w: 100, h: 60, z: 1, nombre: "Sitio web" };
        const app: ElementoLienzo = { id: "ap", tipo: "app", x: 0, y: 0, w: 100, h: 100, z: 1, ruta: "/pizarra", nombre: "App test" };
        const vivo: ElementoLienzo = {
            id: "vi", tipo: "vivo", x: 0, y: 0, w: 100, h: 100, z: 1,
            vivo: { kind: "vivo", tipoVivo: "presentacion", sesionId: "abc123", route: "/vivo/abc123", name: "Prensa vivo", permiso: "ver" },
        };
        const archivo: ElementoLienzo = { id: "f", tipo: "archivo", x: 0, y: 0, w: 100, h: 60, z: 1, nombre: "documento.pdf", mime: "application/pdf" };
        expect(elementoAHtml(video, 1)).toContain("Video test");
        expect(elementoAHtml(audio, 1)).toContain("Audio test");
        expect(elementoAHtml(web, 1)).toContain("Sitio web");
        expect(elementoAHtml(app, 1)).toContain("App test");
        expect(elementoAHtml(vivo, 1)).toContain("Prensa vivo");
        expect(elementoAHtml(archivo, 1)).toContain("documento.pdf");
    });
    it("no incluye iframe, video ni audio tags para estos tipos", () => {
        const video: ElementoLienzo = { id: "v", tipo: "video", x: 0, y: 0, w: 100, h: 60, z: 1 };
        const audio: ElementoLienzo = { id: "a", tipo: "audio", x: 0, y: 0, w: 100, h: 60, z: 1 };
        const web: ElementoLienzo = { id: "w", tipo: "web", x: 0, y: 0, w: 100, h: 60, z: 1 };
        const html = presentacionAHtml(meta, [diapo({ elementos: [video, audio, web] })], { fecha });
        expect(html).not.toContain("<iframe");
        expect(html).not.toContain("<video");
        expect(html).not.toContain("<audio");
    });
    it("imagen con URL válida: alt vacío y src escapado", () => {
        const el: ElementoLienzo = {
            id: "i", tipo: "imagen", x: 0, y: 0, w: 10, h: 10, z: 1, url: "https://example.com/img.png?a=<b>",
        };
        const html = elementoAHtml(el, 1);
        expect(html).toContain('alt=""');
        expect(html).toContain('src="https://example.com/img.png?a=&lt;b&gt;"');
    });
    it("elementos con rotación, opacidad y radio de esquinas", () => {
        const forma: ElementoLienzo = {
            id: "s", tipo: "forma", x: 10, y: 10, w: 50, h: 50, z: 1,
            forma: { tipo: "circulo", color: "#00ff00" }, rot: 45, opacidad: 0.5,
        };
        const rect: ElementoLienzo = {
            id: "r", tipo: "texto", x: 0, y: 0, w: 100, h: 50, z: 1, radio: 8,
            texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "test" }] }] },
        };
        expect(elementoAHtml(forma, 1)).toContain("rotate(45deg)");
        expect(elementoAHtml(forma, 1)).toContain("opacity:0.5");
        expect(elementoAHtml(rect, 1)).toContain("border-radius:8px");
    });
    it("forma sin relleno tiene borde y sin fondo", () => {
        const forma: ElementoLienzo = {
            id: "s", tipo: "forma", x: 10, y: 10, w: 50, h: 50, z: 1,
            forma: { tipo: "circulo", color: "#ff0000", relleno: false },
        };
        const html = elementoAHtml(forma, 1);
        expect(html).toContain("border-radius:50%");
        expect(html).not.toContain("background:");
    });
    it("forma con color inválido usa blanco por defecto", () => {
        const forma: ElementoLienzo = {
            id: "s", tipo: "forma", x: 10, y: 10, w: 50, h: 50, z: 1,
            forma: { tipo: "circulo", color: "rojo" },
        };
        expect(elementoAHtml(forma, 1)).toContain("background:#ffffff");
    });
    it("elementos con factor decimal redondean a centésimas", () => {
        const forma: ElementoLienzo = {
            id: "s", tipo: "forma", x: 10.567, y: 20.891, w: 100.123, h: 50.456, z: 1,
            forma: { tipo: "rect", color: "#aabbcc" },
        };
        const html = elementoAHtml(forma, 3.456);
        expect(html).toContain("left:36.52px");
        expect(html).toContain("top:72.2px");
        expect(html).toContain("width:346.03px");
        expect(html).toContain("height:174.38px");
    });
});
