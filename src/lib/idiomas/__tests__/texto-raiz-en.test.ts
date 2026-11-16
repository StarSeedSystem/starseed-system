import { describe, expect, it } from "vitest";
import { cargarCatalogo, cargarFuente, cargarUnidades, coberturaDe, rechazo, textosDeUnidad, sinTraducir } from "../../../../scripts/idiomas/comun.mjs";

const fuente = cargarFuente();
const unidades = cargarUnidades();
const en = cargarCatalogo("en");
const noTraducir = sinTraducir();

describe("unidad raiz: existe y tiene el prefijo app/layout.tsx", () => {
    it("la unidad raiz está declarada con prefijo app/layout.tsx", () => {
        expect(unidades.raiz).toBeDefined();
        expect(unidades.raiz.titulo).toBe("Documento raíz");
        expect(unidades.raiz.prefijos).toEqual(["app/layout.tsx"]);
    });

    it("textosDeUnidad devuelve los 5 textos traducibles de app/layout.tsx (StarSeed está en sin-traducir)", () => {
        const textos = textosDeUnidad(fuente, unidades, "raiz");
        expect(textos).toHaveLength(5);
        expect(textos).toContain("Saltar al contenido");
        expect(textos).toContain("Democracia directa, creación colectiva e inteligencia propia, abierta y gratuita.");
        expect(textos).toContain("Sistema operativo social para la regeneración global");
        expect(textos).toContain("StarSeed OS · sistema operativo social descentralizado");
        expect(textos).toContain("StarSeed System");
        expect(textos).not.toContain("StarSeed"); // marca en sin-traducir.json
    });

    it("StarSeed está en sin-traducir.json", () => {
        expect(noTraducir.has("StarSeed")).toBe(true);
    });
});

describe("traducciones al inglés de la unidad raiz", () => {
    it("Saltar al contenido se traduce a Skip to content", () => {
        expect(en.entradas["Saltar al contenido"]).toBe("Skip to content");
    });

    it("cada entrada nueva pasa rechazo(fuente, traduccion) === null", () => {
        const textos = textosDeUnidad(fuente, unidades, "raiz");
        for (const t of textos) {
            const traduccion = en.entradas[t];
            expect(traduccion, `falta traducción para: ${t}`).toBeDefined();
            const motivo = rechazo(t, traduccion);
            expect(motivo, `rechazo para «${t}» → «${traduccion}»: ${motivo}`).toBeNull();
        }
    });

    it("coberturaDe para raiz en en no tiene ausentes ni inválidas", () => {
        const c = coberturaDe(fuente, unidades, en, "raiz");
        expect(c.ausentes).toEqual([]);
        expect(c.invalidas).toEqual([]);
    });
});