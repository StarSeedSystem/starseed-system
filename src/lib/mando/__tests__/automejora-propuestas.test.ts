import { describe, it, expect } from "vitest";

import {
    leerPropuestasAutomejora,
    filtrarPropuestasNoEnviadas,
    crearTareaParaCola,
    type PropuestaAutomejora,
    type PropuestaArchivo,
} from "../automejora-propuestas";

describe("leerPropuestasAutomejora", () => {
    it("lee y combina múltiples archivos de propuestas", () => {
        const archivos: PropuestaArchivo[] = [
            {
                archivo: "propuestas-automejora/2026-10-27.json",
                contenido: {
                    fecha: "2026-10-27",
                    propuestas: [
                        {
                            id: "AMJ202610271",
                            capa: "needle",
                            description: "Implementa la función help_1",
                            archivos: ["scripts/puente/ayudantes_needle.py"],
                            prompt_inicio: "Comprueba primero si sigue haciendo falta",
                            referencia_funcion: "help_1",
                            enviada: false,
                        },
                        {
                            id: "AMJ202610272",
                            capa: "needle",
                            description: "Implementa la función help_2",
                            archivos: ["scripts/puente/ayudantes_needle.py"],
                            prompt_inicio: "Comprueba primero si sigue haciendo falta",
                            referencia_funcion: "help_2",
                            enviada: true,
                        },
                    ],
                },
            },
            {
                archivo: "propuestas-automejora/2026-10-28.json",
                contenido: {
                    fecha: "2026-10-28",
                    propuestas: [
                        {
                            id: "AMJ202610281",
                            capa: "jev",
                            description: "Implementa la función help_1",
                            archivos: ["scripts/puente/ayudantes_jev.py"],
                            prompt_inicio: "Comprueba primero si sigue haciendo falta",
                            referencia_funcion: "help_1",
                            enviada: false,
                        },
                    ],
                },
            },
        ];

        const resultado = leerPropuestasAutomejora(archivos);
        expect(resultado).toHaveLength(3);
        expect(resultado[0].id).toBe("AMJ202610271");
        expect(resultado[1].id).toBe("AMJ202610272");
        expect(resultado[2].id).toBe("AMJ202610281");
    });

    it("ignora archivos con estructura inválida", () => {
        const archivos: PropuestaArchivo[] = [
            {
                archivo: "propuestas-automejora/2026-10-27.json",
                contenido: { propuestas: "no-es-array" },
            },
            {
                archivo: "propuestas-automejora/2026-10-28.json",
                contenido: {
                    fecha: "2026-10-28",
                    propuestas: [
                        { id: "AMJ202610281", capa: "jev", description: "ok", archivos: [], prompt_inicio: "", referencia_funcion: "", enviada: false },
                    ],
                },
            },
        ];

        const resultado = leerPropuestasAutomejora(archivos);
        expect(resultado).toHaveLength(1);
        expect(resultado[0].id).toBe("AMJ202610281");
    });

    it("devuelve array vacío si no hay archivos válidos", () => {
        expect(leerPropuestasAutomejora([])).toEqual([]);
        expect(leerPropuestasAutomejora([{ archivo: "x.json", contenido: null }])).toEqual([]);
    });
});

describe("filtrarPropuestasNoEnviadas", () => {
    const propuestas: PropuestaAutomejora[] = [
        { id: "AMJ1", capa: "needle", description: "d1", archivos: [], prompt_inicio: "", referencia_funcion: "", enviada: false },
        { id: "AMJ2", capa: "needle", description: "d2", archivos: [], prompt_inicio: "", referencia_funcion: "", enviada: true },
        { id: "AMJ3", capa: "jev", description: "d3", archivos: [], prompt_inicio: "", referencia_funcion: "", enviada: false },
    ];

    it("filtra solo las no enviadas", () => {
        const resultado = filtrarPropuestasNoEnviadas(propuestas);
        expect(resultado).toHaveLength(2);
        expect(resultado.map((p) => p.id)).toEqual(["AMJ1", "AMJ3"]);
    });
});

describe("crearTareaParaCola", () => {
    it("crea una tarea con formato de cola de automejora", () => {
        const propuesta: PropuestaAutomejora = {
            id: "AMJ202610271",
            capa: "needle",
            description: "Implementa la función help_1",
            archivos: ["scripts/puente/ayudantes_needle.py"],
            prompt_inicio: "Comprueba primero si sigue haciendo falta",
            referencia_funcion: "help_1",
            enviada: false,
        };

        const tarea = crearTareaParaCola(propuesta, "2026-10-27");
        expect(tarea.id).toBe("AMJ202610271");
        expect(tarea.ola).toBe("Automejora 2026-10-27");
        expect(tarea.titulo).toBe("Implementa la función help_1");
        expect(tarea.archivos).toEqual(["scripts/puente/ayudantes_needle.py"]);
        expect(tarea.prompt).toContain("Comprueba primero si sigue haciendo falta");
        expect(tarea.prompt).toContain("help_1");
        expect(tarea.depende).toEqual([]);
        expect(tarea.modelo).toBeDefined();
    });
});