/**
 * La ficha ampliada de agentes y tareas (2026-09-22).
 *
 * Alex: «los agentes deben mostrar más información de cada uno incluyendo los archivos y
 * entornos que está en desarrollo e información de los modelos usados y sus tokens y los
 * enrutamientos del agente y su historial de acciones con descripción y enlaces».
 *
 * La regla que vigilan estas pruebas es la de siempre: lo que no se puede medir se dice
 * que no se puede medir. Los tokens del agente NO los publica su motor, y la ficha tiene
 * que decirlo en vez de enseñar un número inventado.
 */
import { describe, expect, it } from "vitest";

import { detalleDeMedidor, fichaDeAgente, fichaDeTarea, olaDeTarea } from "../medidores";

const latido = {
    tarea: "T1",
    fase: "escribiendo",
    modelo: "nim/kimi-k3",
    minutos: 12,
    donde: "mac",
    proveedor: "nim",
    bytesLog: 8192,
    quietoSegundos: 30,
    cola: "cola-auto-1",
    medio: "mac",
};

const obra = {
    rama: "ola/T1",
    archivos: ["src/lib/a.ts", "src/lib/b.ts"],
    ruta: "~/Documents/starseed-wt/T1",
};

const valor = (f: { etiqueta: string; valor: string }[], etiqueta: string) =>
    f.find((x) => x.etiqueta === etiqueta)?.valor;

describe("fichaDeAgente", () => {
    it("dice el modelo, el proveedor y el entorno donde corre", () => {
        const f = fichaDeAgente(latido, undefined, obra, "org/repo");
        expect(valor(f, "Modelo")).toBe("nim/kimi-k3");
        expect(valor(f, "Proveedor")).toBe("nim");
        expect(valor(f, "Entorno")).toContain("Mac");
    });

    it("enseña el worktree, la rama y los archivos que toca", () => {
        const f = fichaDeAgente(latido, undefined, obra, "org/repo");
        expect(valor(f, "Worktree")).toContain("starseed-wt/T1");
        expect(valor(f, "Rama")).toBe("ola/T1");
        expect(valor(f, "Archivos que toca")).toBe("2");
        expect(f.some((x) => x.valor === "src/lib/a.ts")).toBe(true);
    });

    it("la rama lleva enlace a GitHub", () => {
        const f = fichaDeAgente(latido, undefined, obra, "org/repo");
        expect(f.find((x) => x.etiqueta === "Rama")?.enlace).toBe("https://github.com/org/repo/tree/ola/T1");
    });

    it("sin repo conocido no inventa un enlace", () => {
        const f = fichaDeAgente(latido, undefined, obra, undefined);
        expect(f.find((x) => x.etiqueta === "Rama")?.enlace).toBeUndefined();
    });

    it("enseña el enrutado: por qué modelos pasó antes", () => {
        const f = fichaDeAgente(latido, { modelos_fallidos: ["a/x", "b/y", "c/z"] }, obra, "org/repo");
        expect(valor(f, "Enrutado")).toContain("3 modelo");
        expect(f.filter((x) => x.etiqueta === "↳ no pudo")).toHaveLength(3);
        expect(f.find((x) => x.etiqueta === "Enrutado")?.aviso).toBe(true);
    });

    it("si entró al primero, lo dice", () => {
        const f = fichaDeAgente(latido, {}, obra, "org/repo");
        expect(valor(f, "Enrutado")).toContain("primero");
    });

    it("NO inventa tokens: dice que su motor no los publica", () => {
        const f = fichaDeAgente(latido, undefined, obra, "org/repo");
        const t = valor(f, "Tokens") ?? "";
        expect(t).toContain("no los publica");
        expect(t).not.toMatch(/\d{3,}/);
    });

    it("marca en aviso al agente que lleva rato sin escribir", () => {
        const f = fichaDeAgente({ ...latido, quietoSegundos: 600 }, undefined, obra, "org/repo");
        expect(f.find((x) => x.etiqueta === "Sin escribir desde")?.aviso).toBe(true);
    });

    it("un agente en fase de escritura sin tocar archivos queda señalado", () => {
        const f = fichaDeAgente(latido, undefined, { rama: "ola/T1", archivos: [] }, "org/repo");
        expect(f.find((x) => x.etiqueta === "Archivos que toca")?.aviso).toBe(true);
    });
});

describe("fichaDeTarea", () => {
    it("compara lo declarado con lo tocado y marca lo que falta", () => {
        const f = fichaDeTarea("T1", {}, ["src/lib/a.ts", "src/lib/z.ts"], obra, "org/repo", latido);
        const a = f.find((x) => x.valor === "src/lib/a.ts");
        const z = f.find((x) => x.valor === "src/lib/z.ts");
        expect(a?.etiqueta).toBe("✓");
        expect(z?.etiqueta).toBe("·");
        expect(z?.aviso).toBe(true);
    });

    it("avisa de lo que toca sin haberlo declarado", () => {
        const f = fichaDeTarea("T1", {}, ["src/lib/a.ts"], obra, "org/repo", latido);
        expect(valor(f, "Toca sin declarar")).toContain("src/lib/b.ts");
    });

    it("el commit lleva enlace y la revisión bloqueante va en aviso", () => {
        const f = fichaDeTarea("T1", { sha: "abcdef1234", revisor: "bloqueante" }, [], undefined, "org/repo");
        expect(f.find((x) => x.etiqueta === "Commit")?.enlace).toContain("/commit/abcdef1234");
        expect(f.find((x) => x.etiqueta === "Revisión")?.aviso).toBe(true);
    });

    it("dice el tiempo de agente en minutos, no en segundos crudos", () => {
        const f = fichaDeTarea("T1", { segundos: 1800 }, [], undefined, undefined);
        expect(valor(f, "Tiempo de agente")).toBe("30 min");
    });
});

describe("los medidores llevan la ficha puesta", () => {
    const datos = {
        latidos: [latido],
        titulos: { T1: "Hacer algo" },
        progreso: { T1: { estado: "en_curso", modelos_fallidos: ["a/x"] } },
        obras: { T1: obra },
        declarados: { T1: ["src/lib/a.ts"] },
        historiales: { T1: [{ t: "2026-09-22T10:00", de: "director", texto: "revisa el alcance" }] },
        repoGitHub: "org/repo",
    };

    it("el agente trae su ficha y su historial", () => {
        const d = detalleDeMedidor("agentes", datos);
        expect((d.filas[0].ficha ?? []).length).toBeGreaterThan(8);
        expect(d.filas[0].historial?.[0].de).toBe("director");
    });

    it("la tarea trae su ficha, y NO es la misma que la del agente", () => {
        const ag = detalleDeMedidor("agentes", datos);
        const ec = detalleDeMedidor("en-curso", datos);
        expect((ec.filas[0].ficha ?? []).length).toBeGreaterThan(4);
        expect(JSON.stringify(ag.filas[0].ficha)).not.toBe(JSON.stringify(ec.filas[0].ficha));
    });
});

// (2026-09-24) Alex: «vuelven a entrar 4 más… no sé de qué olas son».
describe("olaDeTarea: cada tarea en curso dice de qué ola es", () => {
    const olaActiva = {
        titulo: "Ola 318 · Director de verdad: la pestaña Director enseña datos reales",
        cola: "cola-auto-0924-144225.json",
        medio: "mac",
        agentes: 2,
        asignacionConocida: true,
        tareas: [{ id: "p318Jb", titulo: "Fidelidad" }],
    };
    it("la saca de la ola en marcha, en corto", () => {
        expect(olaDeTarea({ olasActivas: [olaActiva], ejecutables: [] }, "p318Jb")).toBe(
            "Ola 318 · Director de verdad",
        );
    });
    it("si no está en marcha, la de su cola; y nada si no se sabe", () => {
        const d = { olasActivas: [], ejecutables: [{ id: "CU3br", titulo: "x", ola: "362" }] };
        expect(olaDeTarea(d, "CU3br")).toBe("Ola 362");
        expect(olaDeTarea(d, "ZZ9")).toBeUndefined();
    });
    it("la ficha de la tarea la enseña justo después del estado", () => {
        const f = fichaDeTarea("T1", {}, [], undefined, undefined, undefined, "Ola 318");
        expect(f[1]).toEqual({ etiqueta: "Ola", valor: "Ola 318" });
    });
});
