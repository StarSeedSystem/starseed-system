import { describe, it, expect } from "vitest";
import { accionesDeBloqueada, dependenciasMuertas, detalleDeMedidor } from "@/lib/mando/medidores";
import { contarTrabajoReal, type FilaContable } from "@/lib/mando/conteo-operativo";

describe("medidores - bloqueadas (coincidencia con fila operativa)", () => {
    it("distingue bloqueadas operativas de las históricas de olas cerradas", () => {
        const progreso: Record<string, { estado: string; t?: string; nota?: string }> = {
            // 2 en cola activa (operativas)
            B1: { estado: "bloqueada", t: "2026-09-20 10:00", nota: "espera a B0" },
            B2: { estado: "bloqueada", t: "2026-09-20 10:05", nota: "espera a B0" },
            // 7 históricas (olas cerradas)
            H1: { estado: "bloqueada", t: "2026-08-01 12:00" },
            H2: { estado: "bloqueada", t: "2026-08-02 12:00" },
            H3: { estado: "bloqueada", t: "2026-08-03 12:00" },
            H4: { estado: "bloqueante", t: "2026-08-04 12:00" },
            H5: { estado: "bloqueada", t: "2026-08-05 12:00" },
            H6: { estado: "bloqueada", t: "2026-08-06 12:00" },
            H7: { estado: "bloqueada", t: "2026-08-07 12:00" },
            // Tarea hecha para control
            OK1: { estado: "commit" },
        };

        const fila: FilaContable[] = [
            { id: "B1", estado: "bloqueada", dependenciasPendientes: ["B0"] },
            { id: "B2", estado: "bloqueada", dependenciasPendientes: ["B0"] },
        ];

        const latidos: { tarea: string }[] = [];

        // 1. Verificación de conteo-operativo (pastilla)
        const operacion = contarTrabajoReal(fila, latidos);
        expect(operacion.bloqueadas).toBe(2);

        // 2. Verificación del panel (medidor)
        const d = detalleDeMedidor("bloqueadas", { progreso, fila, latidos: [] });

        // La cabecera dice 2 (mismo número que la pastilla)
        expect(d.resumen).toMatch(/^2 esperando/);

        // La sección histórica dice 7
        expect(d.historicas).toBe(7);

        // Total de filas es 9
        expect(d.filas.length).toBe(9);

        // Verificamos que las históricas llevan fecha y marca de histórica
        const h1 = d.filas.find((f) => f.id === "H1");
        expect(h1?.historica).toBe(true);
        expect(h1?.desde).toBe("2026-08-01 12:00");

        const b1 = d.filas.find((f) => f.id === "B1");
        expect(b1?.historica).toBe(false);
    });
});

// (2026-10-05, BLQ1005B) Una dependencia está muerta solo si NO está en el progreso Y en
// NINGUNA cola viva. «Solo en cola» significa que va a arrancar: darla por muerta mandaba
// reparar bloqueos que se resuelven solos.
describe("dependenciasMuertas: los tres casos", () => {
    const esperaSolitaria = (dep: string) => ({
        ficha: [
            { etiqueta: "Espera a", valor: `${dep} — algo` },
            { etiqueta: "↳ su estado", valor: "NO EXISTE: ninguna ola la ha ejecutado nunca" },
        ],
    });

    it("dependencia en el progreso: se mira su estado, nunca la cola", () => {
        const fila = {
            ficha: [
                { etiqueta: "Espera a", valor: "RM4 — algo" },
                { etiqueta: "↳ su estado", valor: "escribiendo" },
            ],
        };
        expect(dependenciasMuertas(fila, () => true)).toEqual([]);
    });

    it("dependencia SOLO en cola (sin entrada en progreso): está viva", () => {
        expect(dependenciasMuertas(esperaSolitaria("RM4"), (id) => id === "RM4")).toEqual([]);
    });

    it("dependencia inexistente de verdad (ni progreso ni cola): está muerta", () => {
        expect(dependenciasMuertas(esperaSolitaria("RM4"), () => false)).toEqual(["RM4"]);
        expect(dependenciasMuertas(esperaSolitaria("RM4"))).toEqual(["RM4"]);
    });
});

// (2026-10-05, BLQ1005B) Las cuatro acciones del contrato §3, en una sola sección.
describe("accionesDeBloqueada (contrato §3)", () => {
    it("Reparar ahora, Reparar con mi cambio, Escalar a director y Descartar", () => {
        const acciones = accionesDeBloqueada({ estado: "bloqueada" });
        expect(acciones.map((a) => a.texto)).toEqual([
            "Reparar ahora",
            "Reparar con mi cambio",
            "Escalar a director",
            "Descartar",
        ]);
        expect(acciones.find((a) => a.clase === "reintentar")?.pideTexto).toBeTruthy();
        expect(acciones.find((a) => a.clase === "descartar")?.destructiva).toBe(true);
    });

    it("una tarea en el progreso y otra solo en la cola no se marcan como sin salida", () => {
        const d = detalleDeMedidor("bloqueadas", {
            progreso: { B1: { estado: "bloqueada", nota: "dependencia no integrada: R1, R2" } },
            fila: [
                { id: "B1", estado: "bloqueada", dependenciasPendientes: ["R1", "R2"] },
                { id: "R1", estado: "pendiente", dependenciasPendientes: [] },
                { id: "R2", estado: "pendiente", dependenciasPendientes: [] },
            ],
            latidos: [],
        });
        const b1 = d.filas.find((f) => f.id === "B1");
        expect(b1?.estado).toBe("bloqueada");
        expect(JSON.stringify(b1?.ficha)).toContain("en cola");
        expect(JSON.stringify(b1?.ficha)).not.toContain("NO EXISTE");
    });
});
