// Pruebas de la opción «mausbot» del panel de cursor (contrato architecture/mausbot-astraura.md §4).
// Cubren el analizador de opciones (hoy ya no descarta lo que no sea system/triangle/orb),
// el data URI del diseño activo (cuerpo + degradado, sin cara, viaja con `svgADataUrl`)
// y la punta en el `anchor` del cuerpo. Todo puro: sin red, sin disco, sin procesos;
// en Node el almacenamiento no existe, así que las lecturas caen a la config de fábrica.

import { describe, it, expect } from "vitest";
import { cursorOpcionValida, cursorPreviewUri, disenoActivoMausbot, puntaAnchor } from "../cursor-fx";
import { CUERPOS_MAUSBOT, IDS_CUERPO_MAUSBOT } from "@/lib/mausbot/cuerpos";
import { MAX_SVG_CARACTERES } from "@/lib/dock/iconos/sanear-svg";
import { CONFIG_MAUSBOT_DEFECTO, DISENO_MAUSBOT_FABRICA } from "@/lib/mausbot/config";
import { DISENO_POR_DEFECTO } from "@/lib/mausbot/disenos";

const PREFIJO_DATA_URI = "data:image/svg+xml;charset=utf-8,";

describe("cursor-fx · analizador de la opción «mausbot»", () => {
    it("acepta «mausbot» como opción válida", () => {
        expect(cursorOpcionValida("mausbot")).toBe("mausbot");
    });

    it("sigue aceptando las opciones de siempre", () => {
        expect(cursorOpcionValida("system")).toBe("system");
        expect(cursorOpcionValida("starseed-triangle")).toBe("starseed-triangle");
        expect(cursorOpcionValida("orb")).toBe("orb");
    });

    it("acepta cada cuerpo del Mausbot prefijado y los diseños propios", () => {
        for (const cuerpo of IDS_CUERPO_MAUSBOT) {
            expect(cursorOpcionValida(`mausbot-${cuerpo}`)).toBe(`mausbot-${cuerpo}`);
        }
        expect(cursorOpcionValida("mausbot-diseno-mi-orbe")).toBe("mausbot-diseno-mi-orbe");
        expect(cursorOpcionValida("mausbot-diseno-")).toBe("system");
    });

    it("cae al puntero del sistema ante cualquier valor desconocido", () => {
        expect(cursorOpcionValida("mausbot-no-existe")).toBe("system");
        expect(cursorOpcionValida("triangularo")).toBe("system");
        expect(cursorOpcionValida(7)).toBe("system");
        expect(cursorOpcionValida(null)).toBe("system");
        expect(cursorOpcionValida(undefined)).toBe("system");
        expect(cursorOpcionValida({ cursor: "mausbot" })).toBe("system");
        // Casos del borde que tampoco pasan: vacío, prefijo sin cuerpo y valores no cadena.
        expect(cursorOpcionValida("")).toBe("system");
        expect(cursorOpcionValida("mausbot-")).toBe("system");
        expect(cursorOpcionValida(true)).toBe("system");
        expect(cursorOpcionValida(["orb"])).toBe("system");
    });
});

describe("cursor-fx · diseño activo del Mausbot", () => {
    it("el diseño por defecto de la config es el de fábrica y se resuelve por id", () => {
        expect(CONFIG_MAUSBOT_DEFECTO.disenoPorDefecto).toBe(DISENO_MAUSBOT_FABRICA);
        expect(disenoActivoMausbot(CONFIG_MAUSBOT_DEFECTO.disenoPorDefecto)).toEqual(DISENO_POR_DEFECTO);
        expect(disenoActivoMausbot("fabrica-star").id).toBe("fabrica-star");
    });

    it("un id vacío o desconocido cae al diseño de fábrica, nunca explota", () => {
        expect(disenoActivoMausbot("").id).toBe(DISENO_MAUSBOT_FABRICA);
        expect(disenoActivoMausbot("   ").id).toBe(DISENO_MAUSBOT_FABRICA);
        expect(disenoActivoMausbot("propio-inexistente").id).toBe(DISENO_MAUSBOT_FABRICA);
    });
});

describe("cursor-fx · data URI del diseño activo (cuerpo + degradado, sin cara)", () => {
    it("la vista previa «mausbot» es un data URI con el formato de svgADataUrl", () => {
        const uri = cursorPreviewUri("mausbot");
        expect(uri).not.toBeNull();
        expect(uri?.startsWith(PREFIJO_DATA_URI)).toBe(true);
    });

    it("el SVG decodificado es pequeño, usa el degradado del diseño y no lleva cara ni scripts", () => {
        const uri = cursorPreviewUri("mausbot");
        if (!uri) throw new Error("cursorPreviewUri devolvió null");
        svg(uri);
    });

    it("«system» no devuelve ninguna vista previa", () => {
        expect(cursorPreviewUri("system")).toBeNull();
    });
});

describe("cursor-fx · punta en el anchor (contrato §4)", () => {
    it("del anchor del cuerpo «cursor» sale la punta del data URI de 32 px", () => {
        expect(puntaAnchor(CUERPOS_MAUSBOT.cursor.anchor)).toBe("12 15");
    });

    it("el anchor de la estrella cae en los mismos 32 px", () => {
        expect(puntaAnchor(CUERPOS_MAUSBOT.star.anchor)).toBe("16 17");
    });

    it("la punta queda dentro del lienzo para todos los cuerpos", () => {
        for (const id of IDS_CUERPO_MAUSBOT) {
            const [x, y] = puntaAnchor(CUERPOS_MAUSBOT[id].anchor).split(" ").map(Number);
            expect(x).toBeGreaterThanOrEqual(1);
            expect(x).toBeLessThanOrEqual(31);
            expect(y).toBeGreaterThanOrEqual(1);
            expect(y).toBeLessThanOrEqual(31);
        }
    });

    it("queda sujeta a los bordes del icono, sin salirse nunca", () => {
        expect(puntaAnchor({ x: 0, y: 0 })).toBe("2 2");
        expect(puntaAnchor({ x: -500, y: 500 })).toBe("0 31");
    });
});

/** Ayuda compartida: decodifica el data URI y comprueba la forma del SVG del Mausbot. */
function svg(uri: string): void {
    const decoded = decodeURIComponent(uri.slice(PREFIJO_DATA_URI.length));
    // Pequeño: 32 px, y unos pocos cientos de caracteres, no un avatar completo.
    expect(decoded.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"')).toBe(true);
    // Cuerpo + degradado del diseño activo (el de fábrica es el cursor verde).
    for (const color of DISENO_POR_DEFECTO.gradiente) {
        expect(decoded).toContain(`stop-color="${color}"`);
    }
    expect(decoded).toContain("url(#g)");
    expect(decoded).toContain("<path");
    // Sin cara y sin nada ejecutable: el cuerpo no trae ojos ni boca, y el saneador
    // jamás dejaría un script pasar (doble defensa, como en los iconos del dock).
    expect(decoded).not.toMatch(/<script/i);
    // Tampoco ningún atributo de evento («on…») de ningún tipo.
    expect(decoded).not.toMatch(/\son[a-z]*\s*=/i);
    expect(decoded).not.toContain("<ellipse");
    expect(decoded).not.toContain("boca");
    // El puntero de fábrica es un único trazo: exactamente un <path>.
    expect(decoded.split("<path").length - 1).toBe(1);
    // Y viaja dentro del tope del saneador, como los iconos del dock.
    expect(decoded.length).toBeLessThanOrEqual(MAX_SVG_CARACTERES);
}
