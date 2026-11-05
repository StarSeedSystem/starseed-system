import { describe, it, expect } from "vitest";

import {
    leerUltimaNoche,
    leerPropuestasArchivo,
    type UltimaNoche,
    type PropuestaAutomejoraArchivo,
} from "../automejora-noche";

describe("leerUltimaNoche", () => {
    it("lee y parsea la última noche correctamente", () => {
        const crudo = {
            fecha: "2026-11-04",
            traido: 1730707200000,
            motivo: "Prueba de automejora",
            directivas: [
                { capa: "reflejo", version: 1, estado: "activo" },
            ],
            propuestas: [
                { id: "P1", capa: "palabra", description: "Mejorar documentación", archivos: ["doc.md"], prompt_inicio: "Revisa", referencia_funcion: "improve_docs", enviada: true },
            ],
            errores: [{ capa: "reflejo", motivo: "Timeout" }],
            sin_juez: [{ capa: "palabra", motivo: "Sin recursos" }],
            aplicadas: [{ capa: "reflejo", version: 2, estado: "aceptada" }],
        };

        const resultado = leerUltimaNoche(crudo);
        expect(resultado).not.toBeNull();
        expect(resultado!.fecha).toBe("2026-11-04");
        expect(resultado!.traido).toBe(1730707200000);
        expect(resultado!.motivo).toBe("Prueba de automejora");
        expect(resultado!.directivas).toHaveLength(1);
        expect(resultado!.propuestas).toHaveLength(1);
        expect(resultado!.errores).toHaveLength(1);
        expect(resultado!.sin_juez).toHaveLength(1);
        expect(resultado!.aplicadas).toHaveLength(1);
    });

    it("devuelve null para entrada nula o inválida", () => {
        expect(leerUltimaNoche(null)).toBeNull();
        expect(leerUltimaNoche(undefined)).toBeNull();
        expect(leerUltimaNoche({})).toMatchObject({
            fecha: new Date().toISOString().split("T")[0],
            motivo: "",
            directivas: [],
            propuestas: [],
            errores: [],
            sin_juez: [],
            aplicadas: [],
        });
    });

    it("soporta aliases de campos (ultima_noche, tok_s, etc.)", () => {
        const crudo = {
            ultima_noche: "2026-11-03",
            directivas: [{ capa: "palabra", version: null, estado: "pendiente" }],
            propuestas: [{ id: "P2", capa: "palabra", description: "Test", archivos: [], prompt_inicio: "", referencia_funcion: "", enviada: false }],
        };

        const resultado = leerUltimaNoche(crudo);
        expect(resultado).not.toBeNull();
        expect(resultado!.fecha).toBe("2026-11-03");
    });
});

describe("leerPropuestasArchivo", () => {
    it("lee y parsea un archivo de propuestas por fecha", () => {
        const crudo: PropuestaAutomejoraArchivo = {
            fecha: "2026-11-04",
            origen: "meta-n",
            propuestas: [
                {
                    id: "AMJ-001",
                    capa: "reflejo",
                    description: "Optimizar el algoritmo de reflexión",
                    archivos: ["src/lib/algo.ts"],
                    prompt_inicio: "Comprueba primero si sigue haciendo falta",
                    referencia_funcion: "algoritmo_reflejo",
                    enviada: false,
                },
            ],
        };

        const resultado = leerPropuestasArchivo(crudo);
        expect(resultado).not.toBeNull();
        expect(resultado!.fecha).toBe("2026-11-04");
        expect(resultado!.origen).toBe("meta-n");
        expect(resultado!.propuestas).toHaveLength(1);
        expect(resultado!.propuestas![0].id).toBe("AMJ-001");
    });

    it("devuelve null para entrada nula o inválida", () => {
        expect(leerPropuestasArchivo(null)).toBeNull();
        expect(leerPropuestasArchivo(undefined)).toBeNull();
    });

    it("ignora propuestas con IDs vacíos", () => {
        const crudo = {
            fecha: "2026-11-04",
            origen: "meta-n",
            propuestas: [
                { id: "", capa: "palabra", description: "Sin ID", archivos: [], prompt_inicio: "", referencia_funcion: "", enviada: false },
                { id: "AMJ-002", capa: "palabra", description: "Con ID", archivos: [], prompt_inicio: "", referencia_funcion: "", enviada: false },
            ],
        };

        const resultado = leerPropuestasArchivo(crudo);
        expect(resultado!.propuestas).toHaveLength(1);
        expect(resultado!.propuestas![0].id).toBe("AMJ-002");
    });
});