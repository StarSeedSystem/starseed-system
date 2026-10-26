import { describe, expect, it } from "vitest";
import { disenoBase, FORMAS_ICONO, type DisenoIcono } from "../modelo";
import { disenoASvg, glifoSvgDataUrl, interiorTesela, rutaForma, teselaDataUrl, teselaSvg } from "../render-svg";
import { sanearSvg } from "../sanear-svg";

const base = (p: Partial<DisenoIcono> = {}): DisenoIcono => ({ ...disenoBase("#22d3ee"), ...p });

describe("rutaForma", () => {
    it("cada forma tiene un trazado cerrado dentro del lienzo 100×100", () => {
        for (const f of FORMAS_ICONO) {
            const r = rutaForma(f);
            expect(r, f).toMatch(/^M[\d.\-\s,A-Za-z]+Z$/);
            expect(r, f).not.toMatch(/NaN|Infinity|undefined/);
            const nums = (r.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
            expect(nums.length).toBeGreaterThan(6);
        }
    });
    it("formas distintas dan trazados distintos", () => {
        expect(new Set(FORMAS_ICONO.map((f) => rutaForma(f))).size).toBe(FORMAS_ICONO.length);
    });
    it("una forma desconocida cae al círculo", () => {
        expect(rutaForma("rara" as never)).toBe(rutaForma("circulo"));
    });
});

describe("teselaSvg", () => {
    it("es un SVG válido para el saneador (sin nada peligroso) en todos los fondos", () => {
        const fondos: DisenoIcono["fondo"][] = [
            { tipo: "color", color: "#10b77f" },
            { tipo: "color", color: "#ffffff14" },
            { tipo: "degradado", desde: "#007fff", hasta: "#5151ec", angulo: 135 },
            { tipo: "cristal", tinte: "#f042f0", intensidad: 0.6 },
            { tipo: "ninguno" },
        ];
        for (const fondo of fondos) {
            const svg = teselaSvg(base({ fondo, borde: { color: "#ffffff55", ancho: 1.2 } }));
            expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"/);
            expect(svg).not.toMatch(/NaN|undefined|script|on\w+=/i);
            // lo que el propio dock pinta debe poder pasar por el saneador sin que se pierda lo importante
            const r = sanearSvg(svg);
            expect(r.ok, JSON.stringify(fondo)).toBe(true);
        }
    });
    it("el fondo «ninguno» sin borde no dibuja formas", () => {
        const svg = teselaSvg(base({ fondo: { tipo: "ninguno" } }));
        expect(svg).not.toContain("<path");
    });
    it("el borde se acota a 6", () => {
        expect(teselaSvg(base({ borde: { color: "#ffffff", ancho: 50 } }))).toContain('stroke-width="6"');
    });
    it("un color sucio que llegue hasta aquí se neutraliza", () => {
        const sucio = base({ fondo: { tipo: "color", color: '"/><script>alert(1)</script>' } });
        const svg = teselaSvg(sucio);
        expect(svg).not.toMatch(/script|alert/);
    });
    it("el lado se acota", () => {
        expect(teselaSvg(base(), { lado: 5 })).toContain('width="8"');
        expect(teselaSvg(base(), { lado: 99999 })).toContain('width="1024"');
    });
    it("teselaDataUrl produce una URL data: de imagen SVG", () => {
        expect(teselaDataUrl(base())).toMatch(/^data:image\/svg\+xml[;,]/);
    });
    it("interiorTesela usa ids propios para que dos teselas en la misma página no choquen", () => {
        const id = (s: string) => /id="ss-f-([a-z0-9]+)"/.exec(s)?.[1];
        const a = id(interiorTesela(base()));
        expect(a).toBeTruthy();
        // el mismo diseño da siempre los mismos ids; uno distinto, otros
        expect(id(interiorTesela(base()))).toBe(a);
        expect(id(interiorTesela(base({ forma: "rombo" })))).not.toBe(a);
        expect(id(interiorTesela(base({ fondo: { tipo: "color", color: "#ff0000" } })))).not.toBe(a);
    });
    it("todo `url(#…)` apunta a un id que existe en la misma tesela", () => {
        for (const fondo of [
            { tipo: "cristal", tinte: "#22d3ee", intensidad: 0.6 },
            { tipo: "degradado", desde: "#ff0000", hasta: "#0000ff", angulo: 90 },
            { tipo: "color", color: "#00ff00" },
        ] as const) {
            const s = interiorTesela(base({ fondo }));
            for (const [, ref] of s.matchAll(/url\(#([^)]+)\)/g)) expect(s, ref).toContain(`id="${ref}"`);
        }
    });
});

describe("disenoASvg (exportar)", () => {
    const lucideSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

    it("integra el glifo de Lucide con su color y lo recoloca", () => {
        const svg = disenoASvg(base({ colorGlifo: "#fbbf24" }), { glifoLucideSvg: lucideSvg });
        expect(svg).toContain('stroke="#fbbf24"');
        expect(svg).not.toContain("currentColor");
        expect(svg).toMatch(/<svg[^>]* x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+"/);
        expect(sanearSvg(svg).ok).toBe(true);
    });
    it("un glifo con scripts no llega al archivo exportado", () => {
        const malo = '<svg viewBox="0 0 24 24" onload="alert(1)"><script>alert(2)</script><path d="M1 1L5 5" stroke="currentColor"/></svg>';
        const svg = disenoASvg(base(), { glifoLucideSvg: malo });
        expect(svg).not.toMatch(/script|onload|alert/i);
    });
    it("sin glifo disponible exporta al menos la tesela", () => {
        const svg = disenoASvg(base());
        expect(svg).toContain("<path");
        expect(svg.match(/<svg/g)!.length).toBe(1);
    });
    it("el glifo SVG propio del diseño se usa tal cual (ya saneado)", () => {
        const glifo = sanearSvg('<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" stroke="currentColor" fill="none"/></svg>');
        expect(glifo.ok).toBe(true);
        const svg = disenoASvg(base({ glifo: { tipo: "svg", svg: glifo.svg } }));
        expect(svg).toContain("<circle");
    });
    it("una imagen se incrusta como <image> con su data:", () => {
        const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        expect(disenoASvg(base({ glifo: { tipo: "imagen", src: png } }))).toContain(`<image href="${png}"`);
    });
    it("el tamaño del glifo sigue a la escala", () => {
        expect(disenoASvg(base({ escala: 0.5 }), { glifoLucideSvg: lucideSvg })).toContain('width="50" height="50"');
    });
});

describe("glifoSvgDataUrl", () => {
    it("colorea el glifo y lo da como data:", () => {
        const r = sanearSvg('<svg viewBox="0 0 24 24"><path d="M1 1L5 5" stroke="currentColor"/></svg>');
        const url = glifoSvgDataUrl(r.svg, "#ff0000");
        expect(url).toMatch(/^data:image\/svg\+xml/);
        expect(decodeURIComponent(url)).toContain("#ff0000");
    });
});
