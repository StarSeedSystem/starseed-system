import { describe, expect, it } from "vitest";
import { leerResumen, resumirMedios } from "@/lib/mando/medios-computo";
import type { MedioComputo } from "@/lib/mando/medios-computo";

describe("medios-computo - resumirMedios", () => {
    it("devuelve ceros para una lista vacía", () => {
        const resultado = resumirMedios([]);
        expect(resultado).toEqual({ listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 });
    });

    it("clasifica los medios por estado y extrae los agentes en la Mac", () => {
        const muestra: MedioComputo[] = [
            {
                id: "mac",
                nombre: "Esta Mac",
                estado: "listo",
                capacidad: "3 agente(s) ahora · máximo 3 por hardware (8.0 GB)",
                detalle: "RAM libre 1200 MB",
                siguiente_paso: "",
            },
            {
                id: "nube-gh",
                nombre: "GitHub Actions",
                estado: "usable",
                capacidad: "3 agentes/job",
                detalle: "6 secretos",
                siguiente_paso: "",
            },
            {
                id: "hf",
                nombre: "Hugging Face",
                estado: "requiere_alex",
                capacidad: "",
                detalle: "",
                siguiente_paso: "",
            },
            {
                id: "oracle",
                nombre: "Oracle",
                estado: "no_disponible",
                capacidad: "",
                detalle: "",
                siguiente_paso: "",
            },
        ];

        const resumen = resumirMedios(muestra);
        expect(resumen.listos).toBe(1);
        expect(resumen.usables).toBe(1);
        expect(resumen.porHacer).toBe(2);
        expect(resumen.agentesAhora).toBe(3);
    });

    it("maneja mac sin formato numérico en capacidad", () => {
        const muestra: MedioComputo[] = [
            {
                id: "mac",
                nombre: "Esta Mac",
                estado: "listo",
                capacidad: "sin agentes activos",
                detalle: "",
                siguiente_paso: "",
            },
        ];

        const resumen = resumirMedios(muestra);
        expect(resumen.agentesAhora).toBe(0);
    });
});

describe("medios-computo - leerResumen", () => {
    it("parsea un JSON estructurado de ejemplo", () => {
        const jsonEjemplo = JSON.stringify({
            generado: "2026-09-20T15:00:00",
            medios: [
                {
                    id: "mac",
                    nombre: "Esta Mac",
                    estado: "listo",
                    capacidad: "2 agente(s) ahora",
                    detalle: "ok",
                    siguiente_paso: "",
                },
                {
                    id: "gcloud",
                    nombre: "Google Cloud",
                    estado: "usable",
                    capacidad: "180k vCPU",
                    detalle: "proyecto activo",
                    siguiente_paso: "",
                },
            ],
        });

        const res = leerResumen(jsonEjemplo);
        expect(res.generado).toBe("2026-09-20T15:00:00");
        expect(res.medios).toHaveLength(2);
        expect(res.medios[0].id).toBe("mac");
        expect(res.resumen.listos).toBe(1);
        expect(res.resumen.usables).toBe(1);
        expect(res.resumen.agentesAhora).toBe(2);
        expect(res.error).toBeUndefined();
    });

    it("es tolerante ante JSON con basura o malformado", () => {
        const resBasura = leerResumen("{{{ basura_de_texto ###");
        expect(resBasura.medios).toEqual([]);
        expect(resBasura.error).toBeDefined();

        const resNoObjeto = leerResumen("12345");
        expect(resNoObjeto.medios).toEqual([]);
        expect(resNoObjeto.error).toBeDefined();

        const resIncompleto = leerResumen(JSON.stringify({ algo: "desconocido" }));
        expect(resIncompleto.medios).toEqual([]);
        expect(resIncompleto.resumen.listos).toBe(0);
    });

    it("sanea estados desconocidos asignando no_disponible", () => {
        const jsonInvalido = JSON.stringify({
            medios: [
                {
                    id: "test",
                    nombre: "Prueba",
                    estado: "estado_inventado",
                },
            ],
        });

        const res = leerResumen(jsonInvalido);
        expect(res.medios).toHaveLength(1);
        expect(res.medios[0].estado).toBe("no_disponible");
    });
});
