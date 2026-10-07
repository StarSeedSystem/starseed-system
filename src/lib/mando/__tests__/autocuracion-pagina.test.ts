/**
 * Autocuración de la página de Genesis (2026-10-05): decide sola si soltar lo atascado,
 * recargar o esperar al servidor.
 */
import { describe, expect, it } from "vitest";
import { decidirRemedio, estaAtascada, type EntradaAutocuracion } from "../autocuracion-pagina";

const sana = { enVuelo: 1, enCola: 0, fallosSeguidos: 0, ultimoExito: 99_000, ultimoIntento: 100_000, descartadas: 0 };

function entrada(cambios: Partial<EntradaAutocuracion> = {}): EntradaAutocuracion {
    return { ahora: 100_000, visible: true, salud: sana, inicio: 0, servidorVivo: true, ultimoReinicio: null, ultimaRecarga: null, ...cambios };
}

describe("autocuración de la página de Genesis", () => {
    it("con lecturas que vuelven no hace nada", () => {
        expect(decidirRemedio(entrada()).remedio).toBe("nada");
    });

    it("muchas lecturas fallidas seguidas con el servidor sano → primero suelta lo atascado", () => {
        const r = decidirRemedio(entrada({ salud: { ...sana, fallosSeguidos: 40 } }));
        expect(r.remedio).toBe("reiniciar-guardia");
        expect(r.porque).toContain("40 lecturas fallidas");
    });

    it("si al minuto sigue atascada → recarga la página", () => {
        const r = decidirRemedio(entrada({ salud: { ...sana, fallosSeguidos: 40 }, ultimoReinicio: 100_000 - 30_000 }));
        expect(r.remedio).toBe("recargar");
    });

    it("no recarga más de una vez cada 10 minutos", () => {
        const r = decidirRemedio(entrada({
            salud: { ...sana, fallosSeguidos: 40 }, ultimoReinicio: 100_000 - 30_000, ultimaRecarga: 100_000 - 5 * 60_000,
        }));
        expect(r.remedio).toBe("nada");
    });

    it("con el servidor caído no recarga: espera a que la Mac lo levante", () => {
        const r = decidirRemedio(entrada({ salud: { ...sana, fallosSeguidos: 40 }, servidorVivo: false }));
        expect(r.remedio).toBe("esperar-servidor");
    });

    it("dos minutos pidiendo sin que vuelva ninguna lectura también es atasco", () => {
        const atascada = { ...sana, ultimoExito: 100_000 - 130_000, enCola: 3 };
        expect(estaAtascada({ ahora: 100_000, salud: atascada, inicio: 0 })).toBe(true);
        expect(estaAtascada({ ahora: 100_000, salud: { ...atascada, enVuelo: 0, enCola: 0 }, inicio: 0 })).toBe(false);
    });

    it("una pestaña oculta no se toca", () => {
        expect(decidirRemedio(entrada({ visible: false, salud: { ...sana, fallosSeguidos: 99 } })).remedio).toBe("nada");
    });
});
