/** DIR1125O · el medidor de almacenamiento enseña libre de total, para qué es cada medio y el Drive. */
import { describe, expect, it } from "vitest";
import { detalleDeMedidor, leerNodosAlmacenamiento, textoDiscoAlmacenamiento } from "@/lib/mando/medidores";

const crudo = {
    nodos: [
        { nodoId: "drive", medio: "nube", usoGb: 1.25, discoTotalGb: 2048, rol: "Google Drive: memoria y contextos" },
        { nodoId: "a1-oracle", medio: "nube", discoLibreGb: 9.6, rol: "nodo de MetaGenesis en Oracle" },
        { nodoId: "maggabox", medio: "linux", discoLibreGb: 418, discoTotalGb: 457, rol: "neurona nodo: espejo y respaldos" },
        { nodoId: "mac-local", medio: "mac", discoLibreGb: 10.6, discoTotalGb: 228.3, rol: "neurona de desarrollo" },
    ],
};

describe("DIR1125O · almacenamiento de todos los medios", () => {
    it("lee los cuatro medios, con el Drive al final y sin «libre» inventado", () => {
        const nodos = leerNodosAlmacenamiento(crudo);
        expect(nodos.map((n) => n.nombre)).toEqual(["Mac", "Maggabox", "A1", "Drive"]);
        expect(Number.isNaN(nodos[3].discoLibreGb)).toBe(true);
        expect(nodos[3].usoGb).toBe(1.25);
        expect(textoDiscoAlmacenamiento(nodos[0])).toBe("10.6 GB de 228.3 GB");
        expect(textoDiscoAlmacenamiento(nodos[3])).toBe("StarSeed usa 1.25 GB de 2048 GB");
    });

    it("el resumen y las filas dicen cuánto queda, de cuánto y para qué es cada medio", () => {
        const d = detalleDeMedidor("almacenamiento", { almacenamiento: { nodos: leerNodosAlmacenamiento(crudo) } });
        expect(d.resumen).toBe(
            "Nodos con disco libre: Mac (10.6 GB de 228.3 GB), Maggabox (418 GB de 457 GB), A1 (9.6 GB), Drive (StarSeed usa 1.25 GB de 2048 GB)",
        );
        expect(d.filas[0]).toMatchObject({ estado: "bajo", porque: "10.6 GB de 228.3 GB libres · neurona de desarrollo" });
        expect(d.filas[3]).toMatchObject({ estado: "libre", porque: "StarSeed usa 1.25 GB de 2048 GB · Google Drive: memoria y contextos" });
        expect(d.filas[3].detalle).toMatchObject({ usoGb: 1.25, discoTotalGb: 2048 });
        expect(d.filas[3].detalle?.discoLibres).toBeUndefined();
        expect(d.aviso).toBeUndefined();
    });
});
