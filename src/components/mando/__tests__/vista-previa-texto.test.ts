import { describe, expect, it } from "vitest";

import { estadoVistaPrevia } from "@/components/mando/panel-publicaciones";
import type { VistaPreviaLocal } from "@/lib/mando/publicaciones";

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const base: VistaPreviaLocal = {
    url: "http://localhost:9002",
    buildCommit: null,
    buildT: null,
    head: "a".repeat(40),
    atrasado: true,
    sirviendo: true,
};

describe("Vista previa local: el texto nunca junta un commit viejo con una hora nueva", () => {
    it("al día: el commit que sirve y cuándo se compiló", () => {
        const t = estadoVistaPrevia({ ...base, atrasado: false, buildCommit: "abcdef1234", buildT: hace(10) });
        expect(t).toBe("al día · build de abcdef1 · compilado hace 10 min");
    });

    it("con código nuevo: el build servido, sin commit inventado, y por qué espera", () => {
        const t = estadoVistaPrevia({
            ...base,
            buildId: "nuq8jPClHGe8uMaUkQT-t",
            buildT: hace(70),
            freno: "el enjambre está vivo (1 orquestador y 1 agente escribiendo): nunca next build con el enjambre vivo",
        });
        expect(t).toBe("build nuq8jPCl · compilado hace 1 h · hay código nuevo sin compilar · se compila cuando pare el enjambre");
        expect(t).not.toContain("por detrás de HEAD");
    });

    it("sin nada registrado lo dice", () => {
        expect(estadoVistaPrevia(base)).toBe("sin build local registrado");
    });
});
