import { describe, expect, it } from "vitest";
import {
    ATOMO_DIAGRAMA,
    ID_VISTA_DIAGRAMA,
    elegirVistaDiagrama,
    vistaDeDiagrama,
} from "../bloque-protomolecula";
import { DIAGRAMA } from "../atomos/diagrama";

/** HTML mínimo que pasa la validación de aislamiento (con <svg> y un solo DOCTYPE). */
const HTML_OK = "<!DOCTYPE html><html><head><title>d</title></head><body><svg></svg></body></html>";
const activo = { herramientaId: ATOMO_DIAGRAMA, estado: "activo" as const };
const suspendido = { herramientaId: ATOMO_DIAGRAMA, estado: "suspendido" as const };

describe("átomo diagrama → vista", () => {
    it("la ficha del átomo y la correspondencia apuntan a la misma vista", () => {
        expect(ATOMO_DIAGRAMA).toBe("diagram-design");
        expect(DIAGRAMA.herramientaId).toBe(ATOMO_DIAGRAMA);
        expect(vistaDeDiagrama(DIAGRAMA.herramientaId)).toBe(ID_VISTA_DIAGRAMA);
        expect(ID_VISTA_DIAGRAMA).toBe("diagrama");
    });

    it("los demás átomos no entran en esta correspondencia", () => {
        expect(vistaDeDiagrama("hyperframes")).toBeNull();
        expect(vistaDeDiagrama("")).toBeNull();
        expect(elegirVistaDiagrama({ herramientaId: "hyperframes", estado: "activo" }, HTML_OK)).toBeNull();
    });
});

describe("elegirVistaDiagrama", () => {
    it("HTML que pasa el aislamiento: listo, sin motivo", () => {
        expect(elegirVistaDiagrama(activo, HTML_OK)).toEqual({ vista: "listo", motivo: null });
    });

    it("sin HTML todavía (ausente, vacío o solo espacios): pendiente", () => {
        for (const html of [null, undefined, "", "   \n  "]) {
            const r = elegirVistaDiagrama(activo, html);
            expect(r?.vista).toBe("pendiente");
            expect(r?.motivo).toBeTruthy();
        }
    });

    it("un átomo suspendido no se pinta: pendiente aunque haya HTML", () => {
        const r = elegirVistaDiagrama(suspendido, HTML_OK);
        expect(r?.vista).toBe("pendiente");
        expect(r?.motivo).toContain("suspendido");
    });

    it("HTML sin <svg>: error con motivo", () => {
        const r = elegirVistaDiagrama(activo, "<!DOCTYPE html><html><body><p>sin gadgets</p></body></html>");
        expect(r?.vista).toBe("error");
        expect(r?.motivo).toContain("svg");
    });

    it("HTML sin DOCTYPE o con dos documentos: error con motivo", () => {
        const sinDoctype = elegirVistaDiagrama(activo, "<html><body><svg/></svg></body></html>");
        expect(sinDoctype?.vista).toBe("error");
        const dosDocumentos = elegirVistaDiagrama(activo, `${HTML_OK}<!DOCTYPE html><html><svg/></html>`);
        expect(dosDocumentos?.vista).toBe("error");
    });

    it("es pura: la entrada no se muta y la salida es determinista", () => {
        const atomo = { ...suspendido };
        expect(elegirVistaDiagrama(atomo, HTML_OK)).toEqual(elegirVistaDiagrama({ herramientaId: ATOMO_DIAGRAMA, estado: "suspendido" }, HTML_OK));
        expect(atomo).toEqual(suspendido);
    });
});

