import { describe, expect, it } from "vitest";
import { CURVA, DURACION } from "@/lib/design/movimiento";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";
import { estiloMovimientoCortina } from "@/components/layout/trinity/panel-cortina";

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const DURACIONES = Object.values(DURACION);
const CURVAS = Object.values(CURVA);

describe("estiloMovimientoCortina — entrada cardinal de la Trinity", () => {
    it("toma los tokens de movimientoDe(registro, \"trinity\")", () => {
        for (const registro of REGISTROS) {
            const mov = movimientoDe(registro, "trinity");
            expect(estiloMovimientoCortina(registro)).toEqual({
                "--cortina-entrada-ms": `${mov.entrada.ms}ms`,
                "--cortina-curva-entrada": mov.entrada.curva,
                "--cortina-salida-ms": `${mov.salida.ms}ms`,
                "--cortina-curva-salida": mov.salida.curva,
            });
        }
    });

    it("la salida es más corta que la entrada y no inventa duraciones", () => {
        for (const registro of REGISTROS) {
            const estilo = estiloMovimientoCortina(registro);
            const entrada = Number.parseInt(estilo["--cortina-entrada-ms"], 10);
            const salida = Number.parseInt(estilo["--cortina-salida-ms"], 10);
            expect(salida).toBeLessThan(entrada);
            expect(DURACIONES).toContain(entrada);
            expect(DURACIONES).toContain(salida);
            expect(CURVAS).toContain(estilo["--cortina-curva-entrada"]);
            expect(CURVAS).toContain(estilo["--cortina-curva-salida"]);
        }
    });

    it("sin registro explícito usa el expresivo sobre la Trinity", () => {
        const mov = movimientoDe("expresivo", "trinity");
        const estilo = estiloMovimientoCortina();
        expect(estilo["--cortina-entrada-ms"]).toBe(`${mov.entrada.ms}ms`);
        expect(estilo["--cortina-curva-entrada"]).toBe(mov.entrada.curva);
    });

    it("con movimiento reducido todo queda a 0 ms y sin desplazamiento", () => {
        for (const registro of REGISTROS) {
            const estilo = estiloMovimientoCortina(registro, true);
            expect(estilo["--cortina-entrada-ms"]).toBe("0ms");
            expect(estilo["--cortina-salida-ms"]).toBe("0ms");
            expect(estilo["--cortina-curva-entrada"]).toBe(movimientoDe(registro, "trinity").entrada.curva);
            expect(estilo["--cortina-curva-salida"]).toBe(movimientoDe(registro, "trinity").salida.curva);
        }
    });
});
