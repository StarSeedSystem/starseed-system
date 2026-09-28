import { afterEach, describe, expect, it, vi } from "vitest";
import {
    WIDGETS_INICIO_POR_DEFECTO, agregar, cambiarTamano, guardarWidgetsInicio, leerWidgetsInicio, mover, porDefecto, quitar,
} from "../widgets-inicio";

function almacenMinimo() {
    const datos = new Map<string, string>();
    vi.stubGlobal("window", {
        localStorage: { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) },
        dispatchEvent: () => true,
    });
}
afterEach(() => vi.unstubAllGlobals());

describe("widgets de la pantalla de inicio", () => {
    it("los ocho básicos por defecto, con el reloj de protagonista", () => {
        const esc = porDefecto("escritorio");
        expect(esc.map((i) => i.tipo)).toEqual([...WIDGETS_INICIO_POR_DEFECTO]);
        expect(esc[0]).toMatchObject({ tipo: "CLOCK_DATE", tamano: "xl" });
        expect(porDefecto("movil")[0].tamano).toBe("l");
        const tv = porDefecto("tv"), e = porDefecto("escritorio");
        expect(tv.find((i) => i.tipo === "TASKS_QUICK")!.tamano).toBe("m");
        expect(e.find((i) => i.tipo === "TASKS_QUICK")!.tamano).toBe("s");
    });
    it("las operaciones no mutan y los ids son estables", () => {
        const base = porDefecto("escritorio");
        const mas = agregar(base, "CLOCK_DATE");
        expect(mas.at(-1)!.id).toBe("CLOCK_DATE-2");
        expect(base).toHaveLength(8);
        expect(agregar(base, "NO_EXISTE")).toBe(base);
        expect(quitar(base, "CLOCK_DATE-1")).toHaveLength(7);
        expect(mover(base, "WEATHER_BASIC-1", -1)[0].tipo).toBe("WEATHER_BASIC");
        expect(mover(base, "CLOCK_DATE-1", -1)).toBe(base);
        expect(cambiarTamano(base, "MY_EVENTS-1", "xl").find((i) => i.id === "MY_EVENTS-1")!.tamano).toBe("xl");
        expect(base.find((i) => i.id === "MY_EVENTS-1")!.tamano).toBe("s");
    });
    it("ida y vuelta por perfil; los tipos desconocidos se descartan", () => {
        almacenMinimo();
        expect(leerWidgetsInicio("p1", "escritorio")).toHaveLength(8);
        guardarWidgetsInicio("p1", [{ id: "x", tipo: "NO_EXISTE", tamano: "m" }, { id: "CLOCK_DATE-1", tipo: "CLOCK_DATE", tamano: "s" }]);
        expect(leerWidgetsInicio("p1", "escritorio")).toEqual([{ id: "CLOCK_DATE-1", tipo: "CLOCK_DATE", tamano: "s" }]);
        expect(leerWidgetsInicio("p2", "movil")[0].tamano).toBe("l");
    });
});
