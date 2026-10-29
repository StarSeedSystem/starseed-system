/**
 * Exportador de presentaciones a HTML autónomo (DSN1025D): piezas puras, escenario fijo,
 * escapado de texto y enlaces, CSP, visibilidad sin `display:none` y movimiento reducido.
 */
import { describe, expect, it } from "vitest";
import type { ElementoLienzo, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";
import { escaparHtml, hexValido } from "@/lib/vivo/presentacion-html-piezas";

const meta: MetaPresentacion = { titulo: "Mi charla", tema: "cosmos", proporcion: "16:9" };

function diapo(elementos: ElementoLienzo[], notas?: string): Diapositiva {
    const lienzo: LienzoMensaje = { ancho: 960, alto: 540, elementos };
    return { lienzo, notas };
}

function texto(contenido: string, enlace?: string): ElementoLienzo {
    return {
        id: "t1",
        tipo: "texto",
        x: 10,
        y: 20,
        w: 300,
        h: 120,
        z: 1,
        estilo: { fuente: "outfit", tamano: 32, color: "#FFFFFF", negrita: true },
        texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: contenido, enlace }] }] },
    };
}

describe("piezas del HTML", () => {
    it("escapa los cinco caracteres y valida solo hex", () => {
        expect(escaparHtml('<a href="#">x</a>')).toBe("&lt;a href=&quot;#&quot;&gt;x&lt;/a&gt;");
        expect(hexValido("#0A0F1D")).toBe("#0A0F1D");
        expect(hexValido("url(#x)")).toBeNull();
        expect(hexValido(42)).toBeNull();
    });
});

describe("presentacionAHtml", () => {
    it("una sección por diapositiva y solo la primera activa", () => {
        const html = presentacionAHtml(meta, [diapo([]), diapo([])]);
        expect(html.match(/<section class="slide/g)).toHaveLength(2);
        expect(html.match(/class="slide active"/g)).toHaveLength(1);
        expect(html).toContain('<section class="slide active"');
    });

    it("escapa el texto y el título y deja un único script en el documento", () => {
        const html = presentacionAHtml({ ...meta, titulo: "<script>alert(1)</script>" }, [diapo([texto("<script>alert(1)</script>")])]);
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html.match(/<script/g)).toHaveLength(1);
    });

    it("deja un enlace javascript: como texto, sin ancla", () => {
        const html = presentacionAHtml(meta, [diapo([texto("pulsa", "javascript:alert(1)")])]);
        expect(html).toContain("pulsa");
        expect(html).not.toContain('href="javascript:');
        expect(html).not.toContain("<a ");
    });

    it("omite imágenes con javascript: o http: y no crea iframes ni vídeo", () => {
        const malas: ElementoLienzo[] = [
            { id: "i1", tipo: "imagen", x: 0, y: 0, w: 10, h: 10, z: 1, url: "javascript:alert(1)" },
            { id: "i2", tipo: "gif", x: 0, y: 0, w: 10, h: 10, z: 1, url: "http://example.com/x.png" },
        ];
        const html = presentacionAHtml(meta, [diapo(malas)]);
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<iframe");
        expect(html).not.toContain("<video");
    });

    it("incluye CSP, visibilidad sin display:none y movimiento reducido", () => {
        const html = presentacionAHtml(meta, [diapo([])]);
        expect(html).toContain("Content-Security-Policy");
        expect(html).toContain("default-src 'none'");
        expect(html).not.toContain("display:none");
        expect(html).toContain("prefers-reduced-motion");
        expect(html).toContain("visibility:hidden");
    });

    it("4:3 da un escenario de 1440×1080", () => {
        const html = presentacionAHtml({ ...meta, proporcion: "4:3" }, [diapo([])]);
        expect(html).toContain('id="stage" style="width:1440px;height:1080px"');
    });

    it("el mismo dato da el mismo HTML", () => {
        const diapositivas = [diapo([texto("Hola")], "notas")];
        const a = presentacionAHtml(meta, diapositivas, { fecha: "2026-10-29", incluirNotas: true });
        const b = presentacionAHtml(meta, diapositivas, { fecha: "2026-10-29", incluirNotas: true });
        expect(a).toBe(b);
    });

    it("guarda las notas del orador escapadas en un aside oculto", () => {
        const html = presentacionAHtml(meta, [diapo([], "<b>x</b>")], { incluirNotas: true });
        expect(html).toContain('<aside id="notas" hidden>');
        expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    });

    it("nombra el archivo sin acentos ni símbolos", () => {
        expect(nombreArchivoPresentacion("Mi charla ñandú")).toBe("mi-charla-nandu.html");
        expect(nombreArchivoPresentacion({ titulo: "" })).toBe("presentacion.html");
    });
});
