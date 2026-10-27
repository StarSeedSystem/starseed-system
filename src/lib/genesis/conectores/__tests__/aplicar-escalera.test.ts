/**
 * Rescate de la rama nube (RTXR1010 · continúa `nube/a1-20261026-002110-RTXR1010AK`). La rama traía
 * `aplicarEscalera` y `papelRutaDe`, un contrato «puente» que main NO adoptó (el relevo por papel
 * vive en `sugerirParaAmbito`, probado en sugerir.test.ts): esos casos se descartan. Quedan los que
 * prueban la escalera REAL de main (`elegirCandidatos`, Ola 1019G), adaptados a su API: el peldaño 1
 * (Astraura local en la oferta) sale primero y prohibidos se respeta en la bolsa y en la vinculada.
 */
import { describe, expect, it } from "vitest";
import type { Gratis, OpcionCatalogo } from "../catalogo-opciones";
import { elegirCandidatos, type OfertaContexto, type Tarea } from "../escalera";

const LIMITE: Gratis = { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "gratis" };
const TAREA: Tarea = { papel: "escritor", privado: false, tamano: 1000 };

function opcion(extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
    return {
        id: "prueba", nombre: "Prueba", tipo: "proveedor", papeles: ["escritor"], gratis: LIMITE,
        requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [],
        privacidad: "local", licencia: null, verificado: null, fuente: "prueba", ...extra,
    };
}

describe("aplicar escalera · elegirCandidatos (adaptado a la API de hoy)", () => {
    it("la candidata local del peldaño 1 queda primera", () => {
        const oferta: OfertaContexto = { id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papel: ["escritor"] };
        const catalogo = [
            opcion({ id: "llm7", nombre: "LLM7.io", privacidad: "nube-sin-retencion" }),
            opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", privacidad: "local" }),
        ];
        const preferencias = { permitirPago: false, topeDiario: null, prohibidos: [] };
        const candidatos = elegirCandidatos({ tarea: TAREA, ofertas: [oferta], catalogo, vinculadas: new Set<string>(), preferencias });
        expect(candidatos[0]).toMatchObject({ candidatoId: "astraura-158-local", peldano: 1, motivo: "Astraura local disponible" });
        expect(candidatos[1].candidatoId).toBe("llm7");
        expect(candidatos[1].peldano).toBeGreaterThan(1);
    });

    it("una candidata prohibida no aparece (lo consultan la bolsa y la vinculada)", () => {
        const oferta: OfertaContexto = { id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papel: ["escritor"] };
        const catalogo = [
            opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", privacidad: "local" }),
            opcion({ id: "llm7", nombre: "LLM7.io", privacidad: "nube-sin-retencion" }),
        ];
        const preferencias = { permitirPago: false, topeDiario: null, prohibidos: ["llm7"] };
        const candidatos = elegirCandidatos({ tarea: TAREA, ofertas: [oferta], catalogo, vinculadas: new Set(["llm7"]), preferencias });
        expect(candidatos.find((c) => c.candidatoId === "llm7")).toBeUndefined();
        expect(candidatos.map((c) => c.candidatoId)).toEqual(["astraura-158-local"]);
    });
});
