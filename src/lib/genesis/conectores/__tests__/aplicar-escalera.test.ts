/**
 * GENESIS · escalera de candidatos (rescate de la rama nube/40121447096 · RTXR1010AK).
 * La rama probaba un contrato `aplicarEscalera` con `candidaturas.source`; hoy eso se sostiene con
 * `elegirCandidatos` (peldaños 1-6). Solo entran los casos que prueba un comportamiento que no está cubierto:
 * el orden del peldaño 1, la lista de prohibidos en la bolsa y el peldaño 6 con permiso de pago.
 */
import { describe, expect, it } from "vitest";
import { elegirCandidatos, type OfertaContexto, type Preferencias, type Tarea } from "../escalera";
import type { Gratis, OpcionCatalogo, Papel } from "../catalogo-opciones";

const GRATIS_automático: Gratis = { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "prueba" };

const opcion = (id: string, nombre: string, tipo: OpcionCatalogo["tipo"], papeles: Papel[], gratis: Gratis | null = GRATIS_automático): OpcionCatalogo => ({
    id, nombre, tipo, papeles, gratis,
    requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [],
    privacidad: "desconocida", licencia: null, verificado: null, fuente: "prueba",
});

const TAREA_ESCRITOR: Tarea = { papel: "escritor", privado: false, tamano: 1000 };
const OFERTA_LOCAL: OfertaContexto = { id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papel: ["escritor"] };
const PREFERENCIAS: Preferencias = { permitirPago: false, topeDiario: null, prohibidos: [] };

describe("elegirCandidatos · rama primaria", () => {
    it("la candidata local del peldaño 1 queda primera", () => {
        const catalogo = [
            opcion("llm7", "LLM7.io", "proveedor", ["escritor"]),
            opcion("astraura-158-local", "Astraura 1.58 local", "modelo", ["escritor"]),
        ];
        const candidatos = elegirCandidatos({
            tarea: TAREA_ESCRITOR, ofertas: [OFERTA_LOCAL], catalogo,
            vinculadas: new Set<string>(), preferencias: PREFERENCIAS,
        });
        expect(candidatos.map((c) => c.candidatoId)).toEqual(["astraura-158-local", "llm7"]);
        expect(candidatos[0]).toMatchObject({ peldano: 1, motivo: "Astraura local disponible" });
        expect(candidatos[1]).toMatchObject({ peldano: 3 });
        expect(candidatos[0].peldano).toBeLessThan(candidatos[1].peldano);
    });

    it("una candidata prohibida no entra en la bolsa de la malla", () => {
        const catalogo = [opcion("llm7", "LLM7.io", "proveedor", ["escritor"])];
        const libres = elegirCandidatos({ tarea: TAREA_ESCRITOR, ofertas: [], catalogo, vinculadas: new Set<string>(), preferencias: PREFERENCIAS });
        expect(libres.map((c) => c.candidatoId)).toEqual(["llm7"]);
        const prohibida: Preferencias = { ...PREFERENCIAS, prohibidos: ["llm7"] };
        const salida = elegirCandidatos({ tarea: TAREA_ESCRITOR, ofertas: [], catalogo, vinculadas: new Set<string>(), preferencias: prohibida });
        expect(salida).toEqual([]);
        expect(salida.find((c) => c.candidatoId === "llm7")).toBeUndefined();
    });

    it("el permiso de pago decide si una proveedora de pago entra (peldaño 6)", () => {
        const catalogo = [
            opcion("llm7", "LLM7.io", "proveedor", ["escritor"]),
            opcion("pagado", "Por detrás", "proveedor", ["escritor"], null),
        ];
        const sinPermiso = elegirCandidatos({ tarea: TAREA_ESCRITOR, ofertas: [], catalogo, vinculadas: new Set<string>(), preferencias: PREFERENCIAS });
        expect(sinPermiso.map((c) => c.candidatoId)).toEqual(["llm7"]);
        const conPermiso: Preferencias = { permitirPago: true, topeDiario: 5, prohibidos: [] };
        const salida = elegirCandidatos({ tarea: TAREA_ESCRITOR, ofertas: [], catalogo, vinculadas: new Set<string>(), preferencias: conPermiso });
        expect(salida.map((c) => [c.candidatoId, c.peldano])).toEqual([["llm7", 3], ["pagado", 6]]);
    });
});

