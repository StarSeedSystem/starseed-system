import { describe, it, expect } from "vitest";
import {
    hslDeHex, hslDeToken, contrasteAA, ajustarContraste, escalaPhi,
    propuestasDesdeFondo, pedidoParaIA,
} from "../rediseno-desde-fondo";
import type { ThemeTokens } from "../theme-engine";

const TEMA: ThemeTokens = {
    vars: { "primary-hsl": "210 40% 40%", "dur-base": "220ms" },
    materialClass: "ss-metal", background: "aurora-ligera", motion: 1,
};
const PALETA = [
    { color: "#007FFF", peso: 0.5 }, { color: "#10B981", peso: 0.3 }, { color: "#FFBF00", peso: 0.2 },
];

describe("rediseno-desde-fondo · color puro", () => {
    it("hslDeHex acepta #rgb y #rrggbb y rechaza lo demás", () => {
        expect(hslDeHex("#F00")).toEqual([0, 100, 50]);
        expect(hslDeHex("#10B981")).toEqual([160, 84, 39]);
        expect(hslDeHex("azul")).toBeNull();
        expect(hslDeToken("270 80% 60%")).toEqual([270, 80, 60]);
        expect(hslDeToken(undefined)).toBeNull();
    });

    it("contrasteAA conoce el extremo negro/blanco (21) y ajustarContraste lleva cualquier texto a AA", () => {
        expect(contrasteAA([0, 0, 0], [0, 0, 100])).toBeCloseTo(21, 1);
        const falla = ajustarContraste([220, 10, 9], [220, 10, 30]);
        expect(falla.ajustado).toBe(true);
        expect(falla.ratio).toBeGreaterThanOrEqual(4.5);
        expect(falla.color[0]).toBe(220);
        const yaPasa = ajustarContraste([0, 0, 9], [0, 0, 94]);
        expect(yaPasa.ajustado).toBe(false);
        expect(yaPasa.ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("escalaPhi crece por φ entre peldaños consecutivos", () => {
        const escala = escalaPhi(1);
        expect(escala["fs-phi-0"]).toBe("1rem");
        const v = (k: string) => parseFloat(escala[k].replace("rem", ""));
        expect(v("fs-phi-1") / v("fs-phi-0")).toBeCloseTo(1.618, 2);
        expect(v("fs-phi-2") / v("fs-phi-1")).toBeCloseTo(1.618, 2);
    });
});

describe("propuestasDesdeFondo", () => {
    const propuestas = propuestasDesdeFondo({ paleta: PALETA, temaActual: TEMA, modo: "oscuro" });

    it("devuelve siempre tres propuestas con su id, nombre y motivo", () => {
        expect(propuestas.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"]);
        expect(propuestas.every((p) => p.nombre.length > 0 && p.motivo.length > 0)).toBe(true);
        expect(propuestas.every((p) => p.descartada === undefined)).toBe(true);
    });

    it("cada par de texto llega al AA (≥ 4,5) contra su superficie", () => {
        for (const p of propuestas) {
            expect(p.contrastes.length).toBeGreaterThanOrEqual(8);
            for (const c of p.contrastes) {
                expect(c.pasa).toBe(true);
                expect(c.ratio).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it("superficies translúcidas distintas y material/fondo respetados", () => {
        const blur = propuestas.map((p) => p.tokens.vars["glass-blur"]);
        expect(new Set(blur).size).toBe(3);
        expect(propuestas[1].tokens.materialClass).toBe("ss-crystal");
        // la sobria conserva el material del tema actual
        expect(propuestas[0].tokens.materialClass).toBe("ss-metal");
        expect(propuestas.every((p) => p.tokens.background === "aurora-ligera")).toBe(true);
    });

    it("acentos tomados de la paleta y radios armónicos distintos", () => {
        const clase = propuestas[0].tokens.vars;
        expect(hslDeToken(clase["primary-hsl"])?.[0]).toBe(210); // matiz de #007FFF
        expect(hslDeToken(clase["accent-hsl"])?.[0]).toBeCloseTo(160, 0);
        const radios = propuestas.map((p) => p.tokens.vars.radius);
        expect(new Set(radios).size).toBe(3);
        expect(clase["fs-phi-1"]?.endsWith("rem")).toBe(true);
    });

    it("cambia con el modo claro sin perder el AA", () => {
        const claras = propuestasDesdeFondo({ paleta: PALETA, temaActual: TEMA, modo: "claro" });
        expect(hslDeToken(claras[0].tokens.vars["background-hsl"])?.[2]).toBe(96);
        expect(claras.every((p) => p.contrastes.every((c) => c.ratio >= 4.5))).toBe(true);
    });

    it("con paleta vacía cae al matiz del tema actual y sigue completa", () => {
        const sinPaleta = propuestasDesdeFondo({ paleta: [], temaActual: TEMA, modo: "oscuro" });
        expect(sinPaleta).toHaveLength(3);
        expect(hslDeToken(sinPaleta[0].tokens.vars["accent-hsl"])).not.toBeNull();
        expect(sinPaleta.every((p) => p.descartada === undefined)).toBe(true);
    });

    it("paleta con hex inválido no rompe el cálculo", () => {
        const sucias = propuestasDesdeFondo({
            paleta: [{ color: "ZZZ", peso: 1 }, ...PALETA], temaActual: TEMA, modo: "oscuro",
        });
        expect(sucias.every((p) => p.contrastes.every((c) => c.ratio >= 4.5))).toBe(true);
    });
});

describe("pedidoParaIA", () => {
    it("arma el pedido con paleta, modo, ADN y guardas", () => {
        const texto = pedidoParaIA({
            paleta: PALETA, modo: "oscuro",
            adn: { identidad: "astraura", gustosPublicos: ["más cálido", "vidrio"] },
        });
        expect(texto).toContain("#007FFF (50 %)");
        expect(texto).toContain("oscuro");
        expect(texto).toContain("sobria, armónica y atrevida");
        expect(texto).toContain("astraura");
        expect(texto).toContain("más cálido");
        expect(texto).toContain("4,5:1");
        expect(texto).toContain("deshacible");
    });

    it("los gustos privados solo salen en una neurona de la persona", () => {
        const adn = { gustosPrivados: ["prefiere tonos graves"], neuronaPropia: false };
        const fuera = pedidoParaIA({ paleta: PALETA, modo: "claro", adn });
        expect(fuera).not.toContain("prefiere tonos graves");
        const dentro = pedidoParaIA({ paleta: PALETA, modo: "claro", adn: { ...adn, neuronaPropia: true } });
        expect(dentro).toContain("prefiere tonos graves");
        expect(dentro).toContain("solo esta neurona");
    });

    it("es determinista y lista las propuestas ya generadas si las hay", () => {
        const base = { paleta: PALETA, modo: "oscuro" as const, adn: { identidad: "starseed-os" } };
        expect(pedidoParaIA(base)).toBe(pedidoParaIA(base));
        const con = pedidoParaIA({ ...base, propuestas: propuestasDesdeFondo({ ...base, temaActual: TEMA }) });
        expect(con).toContain("Sobria");
    });
});
