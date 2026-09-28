import { describe, expect, it } from "vitest";
import { leerSenalesDispositivo, nivelRender, presupuesto } from "../nivel-dispositivo";

const base = { nucleos: 8, memoriaGB: 8, movimientoReducido: false, ahorroDatos: false, bateriaBaja: false, enXR: false };

describe("nivelRender", () => {
    it("ligero ante movimiento reducido, ahorro de datos o batería baja", () => {
        expect(nivelRender({ ...base, movimientoReducido: true })).toBe("ligero");
        expect(nivelRender({ ...base, ahorroDatos: true })).toBe("ligero");
        expect(nivelRender({ ...base, bateriaBaja: true })).toBe("ligero");
    });
    it("normal en equipos modestos o en XR", () => {
        expect(nivelRender({ ...base, nucleos: 4 })).toBe("normal");
        expect(nivelRender({ ...base, memoriaGB: 4 })).toBe("normal");
        expect(nivelRender({ ...base, enXR: true })).toBe("normal");
    });
    it("pleno con margen", () => expect(nivelRender(base)).toBe("pleno"));
    it("presupuestos", () => {
        expect(presupuesto("ligero")).toMatchObject({ parallax: false, particulas: 0, inclinacionMax: 0 });
        expect(presupuesto("pleno").inclinacionMax).toBe(8);
    });
    it("sin navegador devuelve valores prudentes", () => {
        expect(leerSenalesDispositivo().movimientoReducido).toBe(false);
    });
});
