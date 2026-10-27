import { describe, expect, it } from "vitest";
import { evaluarCapacidades } from "@/lib/xr/capacidades";
import { sondearNavegador, type EntornoNavegador, type XRInyectable } from "../sondeo-navegador";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const JS_DOM_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/1.0";

function entorno(extra: Partial<EntornoNavegador> = {}): EntornoNavegador {
    return {
        ua: QUEST3,
        seguro: true,
        maxTouchPoints: 0,
        webgl2: () => false,
        webgpu: false,
        standalone: false,
        digitalGoods: false,
        ...extra,
    };
}

function xr(vr = true, ar = true): XRInyectable {
    return { isSessionSupported: async (modo) => (modo === "immersive-vr" ? vr : ar) };
}

describe("iwer-entrada · casos rescatados de la rama nube", () => {
    it("el sondeo ve VR y AR de navigator.xr aunque no haya WebGL", async () => {
        const d = await sondearNavegador(entorno({ xr: xr() }));
        expect(d.tieneXR).toBe(true);
        expect([d.vr, d.ar]).toEqual([true, true]);
        expect(d.webgl2).toBe(false);
    });

    it("UA de jsdom = escritorio; UA de Quest = quest y recomienda VR", async () => {
        const conJsdom = await sondearNavegador(entorno({ ua: JS_DOM_UA, webgl2: () => true }));
        expect(["desconocida", "escritorio"]).toContain(evaluarCapacidades(conJsdom).plataforma);

        const quest = await sondearNavegador(entorno({ xr: xr() }));
        expect(quest.ua).toContain("Quest 3");
        const c = evaluarCapacidades(quest, { contexto: "mundo-vr" });
        expect(c.plataforma).toBe("quest");
        expect(c.recomendado).toBe("vr-inmersivo");
    });
});
