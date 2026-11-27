import { describe, expect, it, vi } from "vitest";

const llamar = vi.fn();
vi.mock("@/lib/nativa/puente", () => ({ puenteNativo: () => ({ llamar }) }));

import { ejecutarEnApp, ordenDeTerminal } from "../ejecutores";

const ctx = { cuentaPropia: null };

describe("terminal entre neuronas · ejecutores (TRM1125B)", () => {
    it("arma la orden solo con tokens simples", () => {
        expect(ordenDeTerminal("registros", { servicio: "mando", lineas: 50 })).toBe("registros --servicio mando --lineas 50");
        expect(ordenDeTerminal("almacen-estado", {})).toBe("almacen-estado");
        expect(ordenDeTerminal("actualizar", { canal: "", confirmar: true })).toBe("actualizar --confirmar");
        expect(ordenDeTerminal("registros", { servicio: "a; rm -rf /" })).toBeNull();
    });

    it("terminal-ejecutar pide a la app nativa en nivel usuario", async () => {
        llamar.mockResolvedValueOnce({ ok: true, valor: { stdout: "x", stderr: "", code: 0, success: true, truncada: false, tiempo_agotado: false } });
        const r = (await ejecutarEnApp("terminal-ejecutar", { comando: "almacen-estado", args: {} }, ctx)) as { resumen: string };
        expect(llamar).toHaveBeenCalledWith("terminal_ejecutar", { params: { orden: "almacen-estado", nivel: "usuario" } });
        expect(r.resumen).toBe("terminó bien.");
    });

    it("un rechazo de Rust sube como frase clara", async () => {
        llamar.mockResolvedValueOnce({ ok: false, motivo: "acceso:sin-concesion" });
        await expect(ejecutarEnApp("terminal-ejecutar", { comando: "almacen-estado", args: {} }, ctx)).rejects.toThrow(/acceso al equipo/);
    });

    it("terminal-cerrar cancela la orden en curso", async () => {
        llamar.mockResolvedValueOnce({ ok: true, valor: null });
        await expect(ejecutarEnApp("terminal-cerrar", {}, ctx)).resolves.toEqual({ cerrada: true });
        expect(llamar).toHaveBeenLastCalledWith("terminal_cancelar");
    });
});
