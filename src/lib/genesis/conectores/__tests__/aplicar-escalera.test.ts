import { describe, expect, it } from "vitest";
import type { Gratis, OpcionCatalogo } from "../catalogo-opciones";
import {
    elegirCandidatos,
    type OfertaContexto,
    type Preferencias,
    type Tarea,
} from "../escalera";
import { aplicarEscalera } from "../aplicar-escalera";

function opcion(overrides: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
    return {
        id: overrides.id ?? "test",
        nombre: overrides.nombre ?? "Test",
        tipo: overrides.tipo ?? "modelo",
        papeles: overrides.papeles ?? ["escritor"],
        gratis: overrides.gratis === undefined ? ({ rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "gratis" } as Gratis) : overrides.gratis,
        requiereCuenta: overrides.requiereCuenta ?? false,
        enlaceAlta: overrides.enlaceAlta ?? null,
        enlaceClave: overrides.enlaceClave ?? null,
        variables: overrides.variables ?? [],
        privacidad: overrides.privacidad ?? "local",
        licencia: overrides.licencia ?? null,
        verificado: overrides.verificado ?? null,
        fuente: overrides.fuente ?? "test",
    };
}

const TAREA_ESCRITOR: Tarea = { papel: "escritor", privado: false, tamano: 1000 };
const OFERTA_LOCAL: OfertaContexto = { id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papel: ["escritor"] };
const SIN_PAGO: Preferencias = { permitirPago: false, topeDiario: null, prohibidos: [] };

describe("aplicarEscalera · puente con el enrutador de Astraura", () => {
    it("la candidata local del peldaño 1 queda primera", () => {
        const catalogo = [
            opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", privacidad: "nube-con-retencion" }),
            opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
        ];
        const candidatas = elegirCandidatos({
            tarea: TAREA_ESCRITOR,
            ofertas: [OFERTA_LOCAL],
            catalogo,
            vinculadas: new Set<string>(),
            preferencias: SIN_PAGO,
        });
        const salida = aplicarEscalera({ candidatas, catalogo, papel: "escritor" });
        expect(salida.rutas.length).toBe(2);
        expect(salida.rutas[0].source.id).toBe("astraura-158-local");
        expect(salida.rutas[0].local158Priority).toBe(true);
        expect(salida.rutas[0].score).toBeGreaterThan(salida.rutas[1].score);
        expect(salida.cadena[0]).toMatchObject({ id: "astraura-158-local", posicion: 1, peldano: 1, papel: "escritor" });
        expect(salida.cadena[1]).toMatchObject({ id: "llm7", posicion: 2, peldano: 3 });
    });

    it("una candidata prohibida no aparece", () => {
        const catalogo = [
            opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
            opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", privacidad: "nube-con-retencion" }),
        ];
        const candidatas = [
            { candidatoId: "astraura-158-local", peldano: 1 as const, motivo: "Astraura local disponible" },
            { candidatoId: "llm7", peldano: 3 as const, motivo: "Disponible en la bolsa de la malla" },
        ];
        const salida = aplicarEscalera({ candidatas, catalogo, papel: "escritor", prohibidos: ["llm7"] });
        expect(salida.rutas.find((r) => r.source.id === "llm7")).toBeUndefined();
        expect(salida.rutas.map((r) => r.source.id)).toEqual(["astraura-158-local"]);
        expect(salida.cadena.map((e) => e.id)).toEqual(["astraura-158-local"]);
    });

    it("el veto de pago de la personalidad deja fuera lo de pago", () => {
        const catalogo = [
            opcion({ id: "nube-pago", nombre: "Nube de pago", tipo: "proveedor", gratis: null, privacidad: "nube-con-retencion" }),
        ];
        const candidatas = elegirCandidatos({
            tarea: TAREA_ESCRITOR,
            ofertas: [],
            catalogo,
            vinculadas: new Set<string>(),
            preferencias: { ...SIN_PAGO, permitirPago: true, topeDiario: 1 },
        });
        expect(candidatas.length).toBe(1);
        const conVeto = aplicarEscalera({ candidatas, catalogo, papel: "escritor", opciones: { personaAllowsPaid: false } });
        expect(conVeto.rutas).toEqual([]);
        expect(conVeto.cadena).toEqual([]);
        const sinVeto = aplicarEscalera({ candidatas, catalogo, papel: "escritor" });
        expect(sinVeto.rutas.length).toBe(1);
    });
});
