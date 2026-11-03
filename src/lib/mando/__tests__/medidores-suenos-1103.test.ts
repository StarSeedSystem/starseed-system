import { describe, expect, it } from "vitest";

import { detalleDeMedidor } from "../medidores";

describe("detalleDeMedidor · en-curso separa los sueños del trabajo (1103 · P)", () => {
    it("las rancias de trabajo van primero y los sueños sin agente al final, con su estado", () => {
        const d = detalleDeMedidor("en-curso", {
            progreso: { SA103161: { estado: "en_curso" }, E1: { estado: "en_curso" } },
            latidos: [{ tarea: "T1", fase: "escribiendo", modelo: "nim/x", minutos: 3, donde: "mac" }],
            titulos: { SA103161: "Sueño · Memoria del proyecto × Arquitectura", E1: "Arreglar algo", T1: "Hacer algo" },
        });
        expect(d.filas[0].id).toBe("E1");
        expect(d.filas[d.filas.length - 1].id).toBe("SA103161");
        expect(d.filas[d.filas.length - 1].estado).toBe("sueño sin agente");
        expect(d.resumen).toContain("1 rancias");
        expect(d.resumen).toContain("1 sueño(s) sin agente");
    });
});
