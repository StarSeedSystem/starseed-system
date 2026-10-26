/**
 * Saneador de SVG de los iconos del dock: casos buenos y MALICIOSOS.
 * La regla: lo que sale es un SVG reconstruido desde una lista blanca; nada ejecutable,
 * nada externo, nada que cargue red.
 */
import { describe, expect, it } from "vitest";

import { MAX_SVG_CARACTERES, colorearSvg, sanearSvg, svgADataUrl } from "@/lib/dock/iconos/sanear-svg";

const BUENO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
  <circle cx="32" cy="32" r="28" fill="url(#g1)" stroke="#fff" stroke-width="2"/>
  <path d="M20 34 L30 44 L46 22" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Lo que jamás puede aparecer en un SVG saneado. */
const PROHIBIDO = [
    /<script/i, /<style/i, /foreignObject/i, /<use\b/i, /<image\b/i, /<a[\s>]/i, /<iframe/i, /<animate/i, /<set\b/i,
    /\son[a-z]+\s*=/i, /javascript:/i, /vbscript:/i, /data:text/i, /https?:/i, /xlink:href/i, /style\s*=/i, /@import/i,
    /expression\(/i, /<!--/, /CDATA/,
];

function sinNada(svg: string) {
    // El único «http» permitido es el espacio de nombres de la raíz, que escribe el saneador.
    const sinRaiz = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
    for (const re of PROHIBIDO) expect(sinRaiz, `no debe contener ${re}`).not.toMatch(re);
}

describe("sanearSvg · SVG legítimo", () => {
    it("conserva formas, degradados y trazos, y reescribe la raíz", () => {
        const r = sanearSvg(BUENO);
        expect(r.ok).toBe(true);
        expect(r.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/);
        expect(r.svg).toContain("<linearGradient");
        expect(r.svg).toContain("<circle");
        expect(r.svg).toContain('stroke-linecap="round"');
        // La raíz no conserva width/height: el dock lo dimensiona él.
        expect(r.svg).not.toMatch(/<svg[^>]*\swidth=/);
        expect(r.quitados).toBe(0);
    });

    it("renombra los id internos con el prefijo y reescribe las referencias", () => {
        const r = sanearSvg(BUENO, { prefijoId: "ic7-" });
        expect(r.ok).toBe(true);
        expect(r.svg).toContain('id="ic7-1"');
        expect(r.svg).toContain("url(#ic7-1)");
        expect(r.svg).not.toContain("g1");
    });

    it("dos iconos con el mismo id interno no chocan cuando llevan prefijos distintos", () => {
        const a = sanearSvg(BUENO, { prefijoId: "a" });
        const b = sanearSvg(BUENO, { prefijoId: "b" });
        expect(a.svg).toContain("url(#a1)");
        expect(b.svg).toContain("url(#b1)");
    });

    it("acepta elementos en minúsculas (lineargradient) y los pasa a su forma canónica", () => {
        const r = sanearSvg(`<svg viewBox="0 0 10 10"><defs><lineargradient id="x"><stop offset="0" stop-color="red"/></lineargradient></defs><rect width="10" height="10" fill="url(#x)"/></svg>`);
        expect(r.ok).toBe(true);
        expect(r.svg).toContain("<linearGradient");
    });

    it("deriva el viewBox de width/height y usa 0 0 64 64 si no hay nada", () => {
        expect(sanearSvg(`<svg width="24" height="24"><path d="M0 0L5 5"/></svg>`).svg).toContain('viewBox="0 0 24 24"');
        expect(sanearSvg(`<svg><path d="M0 0L5 5"/></svg>`).svg).toContain('viewBox="0 0 64 64"');
    });

    it("ignora un envoltorio de texto, un bloque de código y la cabecera XML", () => {
        const r = sanearSvg("Aquí tienes:\n```svg\n<?xml version=\"1.0\"?>\n" + BUENO + "\n```\nEspero que guste.");
        expect(r.ok).toBe(true);
    });

    it("colorearSvg cambia currentColor y svgADataUrl no deja nada sin codificar", () => {
        const r = sanearSvg(BUENO);
        const c = colorearSvg(r.svg, "#ff0000");
        expect(c).toContain('stroke="#ff0000"');
        expect(c).not.toMatch(/currentColor/i);
        const url = svgADataUrl(c);
        expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
        expect(url).not.toMatch(/[<>"]/);
    });
});

describe("sanearSvg · ataques", () => {
    const ataques: Record<string, string> = {
        "script dentro del svg": `<svg viewBox="0 0 8 8"><script>alert(1)</script><circle cx="4" cy="4" r="3"/></svg>`,
        "script con < dentro": `<svg viewBox="0 0 8 8"><script>if(a<b){x()}</script><circle cx="4" cy="4" r="3"/></svg>`,
        "onload en la raíz": `<svg viewBox="0 0 8 8" onload="alert(1)"><circle cx="4" cy="4" r="3"/></svg>`,
        "onload con barra como separador": `<svg/onload=alert(1) viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>`,
        "ONCLICK en mayúsculas": `<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" ONCLICK="alert(1)"/></svg>`,
        "manejador sin comillas": `<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" onmouseover=alert(1) /></svg>`,
        "foreignObject con iframe": `<svg viewBox="0 0 8 8"><foreignObject><iframe src="https://evil.example"></iframe><body onload="x()"></body></foreignObject><circle cx="4" cy="4" r="3"/></svg>`,
        "enlace con javascript": `<svg viewBox="0 0 8 8"><a href="javascript:alert(1)"><circle cx="4" cy="4" r="3"/></a></svg>`,
        "image externa": `<svg viewBox="0 0 8 8"><image href="https://evil.example/pixel.png" width="8" height="8"/><circle cx="4" cy="4" r="3"/></svg>`,
        "image con xlink:href": `<svg viewBox="0 0 8 8"><image xlink:href="http://evil.example/p.png"/><circle cx="4" cy="4" r="3"/></svg>`,
        "use externo": `<svg viewBox="0 0 8 8"><use xlink:href="https://evil.example/x.svg#a"/><circle cx="4" cy="4" r="3"/></svg>`,
        "use local": `<svg viewBox="0 0 8 8"><defs><circle id="c" r="1"/></defs><use href="#c"/><circle cx="4" cy="4" r="3"/></svg>`,
        "style con @import": `<svg viewBox="0 0 8 8"><style>@import url(https://evil.example/a.css);</style><circle cx="4" cy="4" r="3"/></svg>`,
        "atributo style con url": `<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" style="fill:url(https://evil.example/x.svg#a)"/></svg>`,
        "fill con url externo": `<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="url(https://evil.example/x.svg#a)"/></svg>`,
        "fill con data:": `<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="url(data:image/svg+xml;base64,AAAA)"/></svg>`,
        "animate que reescribe href": `<svg viewBox="0 0 8 8"><a><set attributeName="href" to="javascript:alert(1)"/><animate attributeName="href" values="javascript:alert(1)"/></a><circle cx="4" cy="4" r="3"/></svg>`,
        "entidad que disfraza javascript": `<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="jav&#x61;script:alert(1)"/></svg>`,
        "entidad desconocida": `<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="&evil;"/></svg>`,
        "comentario que esconde un script": `<svg viewBox="0 0 8 8"><!--><script>alert(1)</script>--><circle cx="4" cy="4" r="3"/></svg>`,
        "CDATA con script": `<svg viewBox="0 0 8 8"><![CDATA[<script>alert(1)</script>]]><circle cx="4" cy="4" r="3"/></svg>`,
        "filtro con feImage": `<svg viewBox="0 0 8 8"><filter id="f"><feImage href="https://evil.example/p.png"/></filter><circle cx="4" cy="4" r="3" filter="url(#f)"/></svg>`,
        "svg anidado con script": `<svg viewBox="0 0 8 8"><svg onload="alert(1)"><script>1</script></svg><circle cx="4" cy="4" r="3"/></svg>`,
        "texto con html": `<svg viewBox="0 0 8 8"><text><img src=x onerror=alert(1)></text><circle cx="4" cy="4" r="3"/></svg>`,
        "ruta con script en d": `<svg viewBox="0 0 8 8"><path d="M0 0 <script>alert(1)</script>"/><circle cx="4" cy="4" r="3"/></svg>`,
        "mayúsculas y espacios en la etiqueta": `<SVG viewBox="0 0 8 8"><ScRiPt >alert(1)</sCrIpT ><CIRCLE cx="4" cy="4" r="3"/></SVG>`,
        "href en un degradado hacia fuera": `<svg viewBox="0 0 8 8"><defs><linearGradient id="a" href="https://evil.example/g.svg#b"/></defs><circle cx="4" cy="4" r="3" fill="url(#a)"/></svg>`,
    };

    for (const [nombre, svg] of Object.entries(ataques)) {
        it(`${nombre}: lo que queda no ejecuta ni carga nada`, () => {
            const r = sanearSvg(svg);
            // O se rechaza entero o se reconstruye limpio.
            if (r.ok) sinNada(r.svg);
            else expect(r.svg).toBe("");
            // Deja constancia de lo que quitó (los comentarios y el CDATA se descartan al leer, sin contarse).
            if (r.ok && !/comentario|CDATA/.test(nombre)) expect(r.quitados).toBeGreaterThan(0);
        });
    }

    it("los casos con círculo siguen dibujando el círculo tras quitar lo malo", () => {
        const r = sanearSvg(ataques["onload en la raíz"]);
        expect(r.ok).toBe(true);
        expect(r.svg).toContain("<circle");
        expect(r.motivos.join(" ")).toMatch(/manejador/);
    });

    it("un <use> local también se quita (evita expansiones exponenciales)", () => {
        const r = sanearSvg(ataques["use local"]);
        expect(r.svg).not.toContain("<use");
        expect(r.motivos.join(" ")).toMatch(/<use>/);
    });

    it("los degradados con href solo heredan de un id local", () => {
        const ok = sanearSvg(`<svg viewBox="0 0 8 8"><defs><linearGradient id="a"><stop offset="0" stop-color="red"/></linearGradient><linearGradient id="b" href="#a"/></defs><circle cx="4" cy="4" r="3" fill="url(#b)"/></svg>`);
        expect(ok.ok).toBe(true);
        expect(ok.svg).toMatch(/href="#i\d"/);
    });

    it("una referencia a un id que no existe no deja un url(#…) colgando", () => {
        const r = sanearSvg(`<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="url(#nada)" stroke="red"/></svg>`);
        expect(r.ok).toBe(true);
        expect(r.svg).not.toContain("url(");
    });

    it("rechaza lo que no dibuja nada (solo script)", () => {
        const r = sanearSvg(`<svg viewBox="0 0 8 8"><script>alert(1)</script></svg>`);
        expect(r.ok).toBe(false);
        expect(r.motivos.join(" ")).toMatch(/no dibuja nada/);
    });

    it("rechaza entradas que no son texto, vacías o sin <svg>", () => {
        expect(sanearSvg(null).ok).toBe(false);
        expect(sanearSvg(42).ok).toBe(false);
        expect(sanearSvg("   ").ok).toBe(false);
        expect(sanearSvg("<div>hola</div>").ok).toBe(false);
    });
});

describe("sanearSvg · topes", () => {
    it("rechaza una entrada gigantesca sin intentar leerla", () => {
        const r = sanearSvg(`<svg viewBox="0 0 8 8">${"<circle cx='1' cy='1' r='1'/>".repeat(4000)}</svg>`);
        expect(r.ok).toBe(false);
    });

    it("corta a 120 elementos y avisa", () => {
        const muchos = `<svg viewBox="0 0 8 8">${"<circle cx='1' cy='1' r='1'/>".repeat(300)}</svg>`;
        const r = sanearSvg(muchos, { maxCaracteres: MAX_SVG_CARACTERES * 4 });
        expect(r.ok).toBe(true);
        expect((r.svg.match(/<circle/g) ?? []).length).toBeLessThanOrEqual(120);
        expect(r.motivos.join(" ")).toMatch(/demasiados elementos/);
    });

    it("rechaza un resultado que pasa del máximo de caracteres", () => {
        const d = "M0 0 " + "L1 1 ".repeat(600);
        const r = sanearSvg(`<svg viewBox="0 0 8 8"><path d="${d}"/><path d="${d}"/></svg>`);
        expect(r.ok).toBe(false);
        expect(r.motivos[0]).toMatch(/máximo/);
    });

    it("limita la profundidad", () => {
        const hondo = `<svg viewBox="0 0 8 8">${"<g>".repeat(20)}<circle cx="1" cy="1" r="1"/>${"</g>".repeat(20)}</svg>`;
        const r = sanearSvg(hondo);
        // La hoja queda más allá del tope: o se recorta el árbol o se rechaza por no dibujar.
        if (r.ok) expect((r.svg.match(/<g>/g) ?? []).length).toBeLessThanOrEqual(8);
        else expect(r.svg).toBe("");
    });

    it("descarta números desproporcionados (radio gigante, desenfoque enorme)", () => {
        const r = sanearSvg(`<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="99999999" fill="red"/><circle cx="4" cy="4" r="2"/></svg>`);
        expect(r.ok).toBe(true);
        expect(r.svg).not.toContain("99999999");
    });

    it("una comilla sin cerrar corta la lectura sin romper nada", () => {
        const r = sanearSvg(`<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/><path d="M0 0 fill="red></svg>`);
        expect(r.ok).toBe(true);
        sinNada(r.svg);
    });
});
