import { describe, it, expect } from "vitest";
import {
    resumirComprobacion,
    type Comprobacion,
    type ClaveMedidorComprobacion,
} from "@/lib/mando/comprobacion-tipos";

describe("resumirComprobacion", () => {
    it("resume una comprobación terminada con todos vivos", () => {
        const c: Comprobacion = {
            id: "c1",
            medidor: "en-curso" as ClaveMedidorComprobacion,
            empezado: "2026-09-16T10:00:00Z",
            terminado: "2026-09-16T10:02:00Z",
            directores: ["vigilante"],
            veredictos: [
                { proceso: "vigilante", estado: "vivo", detalle: "ok" },
            ],
            resumen: "",
        };
        const r = resumirComprobacion(c);
        expect(r.frase).toContain("todos vivos");
        expect(r.vivos).toBe(1);
        expect(r.muertos).toBe(0);
        expect(r.colgados).toBe(0);
    });

    it("resume una comprobación en curso", () => {
        const c: Comprobacion = {
            id: "c2",
            medidor: "bloqueadas" as ClaveMedidorComprobacion,
            empezado: "2026-09-16T10:05:00Z",
            terminado: null,
            directores: ["director", "guardia"],
            veredictos: [{ proceso: "director", estado: "vivo", detalle: "" }],
            resumen: "",
        };
        const r = resumirComprobacion(c);
        expect(r.frase).toContain("en curso");
        expect(r.veredictos).toBe(1);
    });

    it("resume con colgados", () => {
        const c: Comprobacion = {
            id: "c3",
            medidor: "proveedores" as ClaveMedidorComprobacion,
            empezado: "2026-09-16T10:00:00Z",
            terminado: "2026-09-16T10:01:00Z",
            directores: ["vigilante"],
            veredictos: [
                { proceso: "vigilante", estado: "colgado", detalle: "sin respuesta" },
            ],
            resumen: "",
        };
        const r = resumirComprobacion(c);
        expect(r.frase).toContain("colgado");
        expect(r.colgados).toBe(1);
    });

    it("resume todo muerto", () => {
        const c: Comprobacion = {
            id: "c4",
            medidor: "memoria" as ClaveMedidorComprobacion,
            empezado: "2026-09-16T10:00:00Z",
            terminado: "2026-09-16T10:03:00Z",
            directores: [],
            veredictos: [
                { proceso: "guardia", estado: "muerto", detalle: "" },
                { proceso: "director", estado: "muerto", detalle: "" },
            ],
            resumen: "",
        };
        const r = resumirComprobacion(c);
        expect(r.frase).toContain("todo muerto");
        expect(r.muertos).toBe(2);
    });
});
