/**
 * MBT1027I · Pruebas de la opción «mausbot» en cursor-fx: el analizador de la opción
 * guardada (lo desconocido cae al sistema) y el data URI pequeño del diseño activo
 * (cuerpo + degradado, sin cara, punta en el `anchor`, vía `svgADataUrl`).
 * Funciones puras exportadas de `../cursor-fx`: sin red, sin disco, sin procesos.
 */
import { describe, it, expect } from "vitest";
import {
    opcionCursorDe,
    puntaMausbot,
    uriPunteroMausbot,
    svgDeDisenoMausbot,
    cursorPreviewUri,
} from "../cursor-fx";
import { DISENO_POR_DEFECTO, DISENOS_FABRICA, type DisenoMausbot } from "@/lib/mausbot/disenos";
import { MAX_SVG_CARACTERES, svgADataUrl } from "@/lib/dock/iconos/sanear-svg";

const PREFIJO_DATA = "data:image/svg+xml;charset=utf-8,";
const decodificar = (uri: string): string => decodeURIComponent(uri.slice(PREFIJO_DATA.length));

/** Un diseño propio (SVG) para probar el camino de `svgCuerpo`. */
const disenoSvg: DisenoMausbot = {
    id: "prueba-propio", nombre: "Círculo", cuerpo: "svg",
    svgCuerpo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#FF0033"/></svg>',
    gradiente: ["#FF0033", "#00FF66", "#0033FF"],
    cara: { ojos: true, boca: true, mirada: true },
    tamano: 1, origen: "protomolecula",
};

describe("opcionCursorDe (analizador de la opción guardada)", () => {
    it("acepta la opción «mausbot» a secas y las clásicas", () => {
        expect(opcionCursorDe("mausbot")).toBe("mausbot");
        expect(opcionCursorDe("system")).toBe("system");
        expect(opcionCursorDe("starseed-triangle")).toBe("starseed-triangle");
        expect(opcionCursorDe("orb")).toBe("orb");
    });

    it("conserva las opciones con prefijo del Mausbot", () => {
        expect(opcionCursorDe("mausbot-cursor")).toBe("mausbot-cursor");
        expect(opcionCursorDe("mausbot-star")).toBe("mausbot-star");
        expect(opcionCursorDe("mausbot-diseno-mi-diseno")).toBe("mausbot-diseno-mi-diseno");
    });

    it("cae al puntero del sistema con lo desconocido", () => {
        const raros: unknown[] = [
            "cursor", "mausbotx", "mausbot-", "mausbot-diseno-", "", "orbe", "starseed", 42,
            null, undefined, true, {}, ["orb"], { cursor: "orb" },
        ];
        for (const raro of raros) {
            expect(opcionCursorDe(raro)).toBe("system");
        }
    });
});

describe("uriPunteroMausbot (data URI pequeño del diseño activo)", () => {
    it("usa el formato de svgADataUrl del saneador", () => {
        const uri = uriPunteroMausbot(DISENO_POR_DEFECTO);
        expect(uri).not.toBeNull();
        expect(uri!.startsWith(PREFIJO_DATA)).toBe(true);
        expect(uri).toBe(svgADataUrl(svgDeDisenoMausbot(DISENO_POR_DEFECTO)!));
    });

    it("trae cuerpo + degradado, sin cara, y es pequeño", () => {
        const svg = decodificar(uriPunteroMausbot(DISENO_POR_DEFECTO)!);
        expect(svg).toContain(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"`);
        expect(svg).toContain(`stop-color="${DISENO_POR_DEFECTO.gradiente[1]}"`); // base del degradado
        expect(svg).toContain("url(#g)");
        // Sin cara: solo el cuerpo (el puntero de fábrica es un único trazo).
        expect(svg.split("<path").length - 1).toBe(1);
        expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
        expect(svg.length).toBeLessThanOrEqual(MAX_SVG_CARACTERES);
    });

    it("sanea un SVG propio antes de convertirlo", () => {
        const sucio = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4" fill="#FF0033"/></svg>`;
        const uri = uriPunteroMausbot({ ...disenoSvg, svgCuerpo: sucio });
        expect(uri).not.toBeNull();
        const svg = decodificar(uri!);
        expect(svg).not.toContain("script");
        expect(svg).not.toContain("alert");
        expect(svg).toContain("<circle");
    });

    it("devuelve null si el SVG propio no se puede sanear", () => {
        expect(uriPunteroMausbot({ ...disenoSvg, svgCuerpo: "" })).toBeNull();
    });
});

describe("puntaMausbot (la punta del puntero en el anchor del cuerpo)", () => {
    it("proyecta el anchor del cuerpo al tamaño del cursor", () => {
        // Puntero de fábrica: anchor {x: 85.54, y: 106.35} → (12, 15) en un lienzo de 32 px.
        expect(puntaMausbot(DISENO_POR_DEFECTO)).toBe("12 15");
        const estrella = DISENOS_FABRICA.find((d) => d.cuerpo === "star");
        expect(puntaMausbot(estrella!)).toBe("16 17"); // anchor {x: 113.82, y: 125.43}
    });

    it("un SVG propio no trae anchor: centro del lienzo", () => {
        expect(puntaMausbot(disenoSvg)).toBe("16 16");
    });

    it("queda siempre dentro del lienzo, para todos los cuerpos", () => {
        for (const diseno of DISENOS_FABRICA) {
            const [x, y] = puntaMausbot(diseno).split(" ").map(Number);
            expect(x).toBeGreaterThanOrEqual(1);
            expect(x).toBeLessThanOrEqual(31);
            expect(y).toBeGreaterThanOrEqual(1);
            expect(y).toBeLessThanOrEqual(31);
        }
    });
});

describe("cursorPreviewUri con «mausbot»", () => {
    it("pinta el diseño activo (el de fábrica sin config guardada)", () => {
        // En este entorno sin `window` la config activa es la de fábrica, determinista.
        expect(cursorPreviewUri("mausbot")).toBe(uriPunteroMausbot(DISENO_POR_DEFECTO));
        expect(cursorPreviewUri("system")).toBeNull();
    });

    it("no cambia el formato de las opciones con prefijo (svgUri local, sin charset)", () => {
        const uri = cursorPreviewUri("mausbot-cursor");
        expect(uri?.startsWith("data:image/svg+xml,")).toBe(true);
        expect(uri?.startsWith(PREFIJO_DATA)).toBe(false);
    });
});

