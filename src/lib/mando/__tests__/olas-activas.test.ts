import { describe, expect, it } from "vitest";

import { descripcionDePrompt, tareasDeCola } from "@/lib/mando/lector-local";
import {
    detalleDeMedidor,
    filasDeOlasActivas,
    olasDeLaMac,
    tituloDeOla,
    verificacionDe,
    type DatosMedidores,
    type OlaActiva,
} from "@/lib/mando/medidores";

// (2026-09-23) Alex: «tampoco aparecen las olas activas en el medidor su información. cada
// ola, gente y tarea debe mostrar un título y descripción clara con información de archivos
// en proceso y cambios realizados y estado del progreso, verificación y etapa».
//
// El medidor era un rótulo sin filas que decía «ninguna» con cuatro agentes trabajando en la
// nube: el campo que lo alimentaba no lo rellenaba nadie. Estas pruebas fijan que cada ola y
// cada tarea traen todo eso, y que lo que no se puede saber se dice que no se sabe.

const base = (extra: Partial<DatosMedidores> = {}): DatosMedidores => ({
    progreso: {},
    titulos: {},
    latidos: [],
    commitsSinPublicar: [],
    ejecutables: [],
    proveedores: [],
    ...extra,
});

describe("descripcionDePrompt", () => {
    it("salta el preámbulo de origen y se queda con el encargo", () => {
        const p = "ORIGEN: esto lo escribió el Dream.\n\nReintentar las tareas fallidas de la ola 363.\n\nANTES DE ESCRIBIR: mira.";
        expect(descripcionDePrompt(p)).toBe("Reintentar las tareas fallidas de la ola 363.");
    });

    it("salta las reglas de método en mayúsculas y se queda con el encargo", () => {
        const p = "NO explores el repositorio entero: abre SOLO los archivos.\n\nPOR QUÉ VUELVE: falló.\n\nHaz que no se suba dos veces.";
        expect(descripcionDePrompt(p)).toBe("Haz que no se suba dos veces.");
    });

    it("una sigla al principio de una frase normal no la hace de método", () => {
        expect(descripcionDePrompt("API decidir_presupuesto con ventanas.\n\nOtro párrafo.")).toBe(
            "API decidir_presupuesto con ventanas.",
        );
    });

    it("recorta lo largo con puntos suspensivos", () => {
        const d = descripcionDePrompt("a".repeat(400), 50);
        expect(d.length).toBe(50);
        expect(d.endsWith("…")).toBe(true);
    });

    it("sin prompt, cadena vacía", () => {
        expect(descripcionDePrompt(undefined)).toBe("");
    });
});

describe("tareasDeCola", () => {
    it("lee una cola objeto {ola, tareas} con archivos y encargo", () => {
        const t = tareasDeCola(
            {
                ola: "nube-20260922",
                tareas: [{ id: "DR1", ola: "Ola Dream", titulo: "Reintentar", archivos: ["a.ts"], prompt: "Haz X." }],
            },
            "enjambre/colas/cola-nube-20260922-1757.json",
        );
        expect(t).toEqual([
            {
                id: "DR1",
                ola: "Ola Dream",
                titulo: "Reintentar",
                dependencias: [],
                cola: "nube-20260922-1757",
                archivos: ["a.ts"],
                descripcion: "Haz X.",
            },
        ]);
    });

    it("una tarea sin ola hereda la de la cola", () => {
        const [t] = tareasDeCola({ ola: "Ola 9", tareas: [{ id: "Z" }] }, "cola-9.json");
        expect(t.ola).toBe("Ola 9");
    });
});

describe("tituloDeOla", () => {
    it("un número suelto se nombra como ola", () => {
        expect(tituloDeOla("363")).toBe("Ola 363");
        expect(tituloDeOla("Ola Dream · x")).toBe("Ola Dream · x");
        expect(tituloDeOla("")).toBe("ola sin nombre");
    });
});

describe("olasDeLaMac", () => {
    const colas = [
        { id: "A", ola: "363", titulo: "a", cola: "auto-1" },
        { id: "B", ola: "363", titulo: "b", cola: "auto-1" },
        { id: "C", ola: "314", titulo: "c", cola: "auto-2" },
    ];

    it("solo es ola en marcha la cola que late, con TODAS sus tareas", () => {
        const olas = olasDeLaMac(colas, [{ tarea: "A", cola: "cola-auto-1", minutos: 7 }]);
        expect(olas).toHaveLength(1);
        expect(olas[0]).toMatchObject({ titulo: "Ola 363", cola: "auto-1", medio: "mac", agentes: 1, minutos: 7 });
        expect(olas[0].tareas.map((t) => t.id)).toEqual(["A", "B"]);
    });

    it("sin latidos no hay olas en marcha", () => {
        expect(olasDeLaMac(colas, [])).toEqual([]);
    });

    it("los agentes de fuera (externo-*) no cuentan como ola de la Mac", () => {
        const olas = olasDeLaMac(colas, [
            { tarea: "cw-fondo", cola: "externo-cowork", minutos: 40 },
            { tarea: "cw-voz", cola: "externo-cowork", minutos: 40 },
        ]);
        expect(olas).toEqual([]);
    });
});

describe("verificacionDe", () => {
    it("integrada, con su commit", () => {
        expect(verificacionDe({ estado: "commit", sha: "abcdef1234" })).toEqual({
            texto: "puertas en verde e integrada en main (abcdef12)",
            aviso: false,
        });
    });

    it("un fallo de puertas se marca", () => {
        expect(verificacionDe({ estado: "fallo_tests" })).toEqual({ texto: "fallo tests: no pasó sus puertas", aviso: true });
    });

    it("una rechazada dice por qué", () => {
        expect(verificacionDe({ estado: "rechazada", motivo_vb: "KeyError" }).texto).toBe("rechazada: KeyError");
    });

    it("una viva dice en qué puerta está", () => {
        expect(verificacionDe(undefined, "tsc").texto).toBe("pasando tsc ahora mismo");
        expect(verificacionDe(undefined, "escribiendo").texto).toBe("aún sin verificar: está escribiendo");
    });
});

describe("filasDeOlasActivas", () => {
    const olaNube: OlaActiva = {
        titulo: "Ola Dream 2026-09-22",
        cola: "cola-nube-20260922-1757",
        medio: "nube-gh",
        agentes: 4,
        minutos: 12,
        run: "35799864769",
        enlace: "https://github.com/x/y/actions/runs/35799864769",
        asignacionConocida: false,
        tareas: [
            { id: "DR1", titulo: "Reintentar", descripcion: "Reintentar las fallidas.", archivos: ["a.py"] },
            { id: "Q4", titulo: ".env.example", descripcion: "Variables de entorno.", archivos: [".env.example"] },
        ],
    };

    it("una ola en la nube: cabecera con agentes y run, y cada tarea con su encargo", () => {
        const filas = filasDeOlasActivas(
            base({ olasActivas: [olaNube], progreso: { Q4: { estado: "commit", sha: "1234567890" } } }),
            "x/y",
        );
        expect(filas.map((f) => f.id)).toEqual(["ola:cola-nube-20260922-1757", "DR1", "Q4"]);
        const [cab, dr, q4] = filas;
        expect(cab.titulo).toBe("Ola Dream 2026-09-22");
        expect(cab.quien).toBe("4 agente(s) · nube-gh");
        expect(cab.porcentaje).toBe(50);
        expect(cab.enlace).toContain("35799864769");

        expect(dr.titulo).toBe("↳ DR1 · Reintentar");
        expect(dr.porque).toBe("Reintentar las fallidas.");
        expect(dr.estado).toBe("en el run de la nube");
        expect(dr.porcentaje).toBeUndefined();
        const ficha = Object.fromEntries((dr.ficha ?? []).map((x) => [x.etiqueta, x.valor]));
        expect(ficha["Alcance declarado"]).toBe("a.py");
        expect(ficha["Archivos en proceso"]).toContain("GitHub no deja leer");
        expect(ficha["Cambios realizados"]).toBe("ninguno todavía");

        expect(q4.estado).toBe("integrada");
        expect(q4.porcentaje).toBe(100);
        const fq = (q4.ficha ?? []).find((x) => x.etiqueta === "Cambios realizados");
        expect(fq?.valor).toBe("commit 12345678");
        expect(fq?.enlace).toBe("https://github.com/x/y/commit/1234567890");
    });

    it("una tarea viva en la Mac: etapa, porcentaje, agente y archivos que tiene abiertos", () => {
        const olaMac: OlaActiva = { ...olaNube, medio: "mac", asignacionConocida: true, run: undefined, enlace: undefined };
        const [, dr] = filasDeOlasActivas(
            base({
                olasActivas: [olaMac],
                latidos: [{ tarea: "DR1", fase: "tsc", modelo: "groq/llama", minutos: 3, donde: "mac" }],
                obras: { DR1: { rama: "ola/DR1", archivos: ["a.py", "b.py"] } },
            }),
        );
        expect(dr.estado).toBe("en curso");
        expect(dr.quien).toBe("groq/llama · mac");
        expect(dr.desde).toBe("3 min");
        expect((dr.porcentaje ?? 0) > 0).toBe(true);
        const ficha = Object.fromEntries((dr.ficha ?? []).map((x) => [x.etiqueta, x.valor]));
        expect(ficha["Archivos en proceso"]).toBe("a.py, b.py");
        expect(ficha["Cambios realizados"]).toBe("rama ola/DR1, sin commit todavía");
        expect(ficha["Verificación"]).toBe("pasando tsc ahora mismo");
    });

    it("el medidor deja de decir «ninguna» cuando hay una ola en la nube", () => {
        const d = detalleDeMedidor("ola-activa", { olasActivas: [olaNube] });
        expect(d.resumen).toContain("1 ola(s) en marcha: Ola Dream 2026-09-22");
        expect(d.resumen).toContain("4 agente(s)");
        expect(d.filas).toHaveLength(3);
    });

    it("sin olas, lo dice", () => {
        const d = detalleDeMedidor("ola-activa", {});
        expect(d.filas).toEqual([]);
        expect(d.resumen).toBe("ninguna ola en marcha");
    });
});
