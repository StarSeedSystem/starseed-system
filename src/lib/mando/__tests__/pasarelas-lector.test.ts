import { describe, expect, it } from "vitest";

import { convertirInformePasarelas } from "../pasarelas-lector";

const MEDIDO = "2026-09-16 15:40:12";
const MEDIDO_MS = Date.parse("2026-09-16T15:40:12");

describe("convertirInformePasarelas", () => {
    it("convierte el informe vigente en filas seguras", () => {
        const datos = convertirInformePasarelas({
            t: MEDIDO,
            pasarelas: [{
                clave: "openrouter", modelo: "modelo/gratis", variable: "OPENROUTER_API_KEY",
                tiene_clave: true, estado: "escribe", valor: "secreto-que-no-debe-salir",
            }],
        }, MEDIDO_MS + 25 * 60_000);

        expect(datos.estadoInforme).toBe("actual");
        expect(datos.medidoHaceMin).toBe(25);
        expect(datos.filas).toEqual([{
            id: "openrouter", nombre: "OpenRouter", modelo: "modelo/gratis",
            variable: "OPENROUTER_API_KEY", tieneClave: true, estado: "escribe",
            necesitaPersona: false, enlace: "", accion: "Escribe: déjala en la rotación.",
            medidoHace: "hace 25 min",
        }]);
        expect(JSON.stringify(datos)).not.toContain("secreto-que-no-debe-salir");
    });

    it("señala la renovación que necesita a una persona", () => {
        const datos = convertirInformePasarelas({
            t: MEDIDO,
            pasarelas: [{
                clave: "groq", modelo: "openai/gpt-oss-20b", variable: "GROQ_API_KEY",
                tiene_clave: false, estado: "sin_clave",
            }],
        }, MEDIDO_MS);

        expect(datos.filas[0]).toMatchObject({
            necesitaPersona: true,
            enlace: "https://console.groq.com/keys",
            variable: "GROQ_API_KEY",
            tieneClave: false,
        });
    });

    it("marca como antiguo lo medido hace más de seis horas", () => {
        const datos = convertirInformePasarelas(
            { t: MEDIDO, pasarelas: [] },
            MEDIDO_MS + 361 * 60_000,
        );

        expect(datos.estadoInforme).toBe("antiguo");
        expect(datos.mensaje).toContain("Informe antiguo");
        expect(datos.medidoHaceMin).toBe(361);
    });

    it("expone que el informe no existe", () => {
        expect(convertirInformePasarelas(null, MEDIDO_MS)).toEqual({
            estadoInforme: "ausente",
            mensaje: "No hay informe de pasarelas disponible.",
            medidoEn: null,
            medidoHaceMin: null,
            filas: [],
        });
    });
});
