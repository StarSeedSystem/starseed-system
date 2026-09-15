import { describe, expect, it } from "vitest";

import {
    accionesDeTarea,
    aplicarConfiguracion,
    configuracionPorDefecto,
    dependenciaDeNota,
    detalleDeMedidor,
    medidoresVisibles,
    porqueBloqueada,
    type ClaveMedidor,
} from "@/lib/mando/medidores";

describe("accionesDeTarea", () => {
    it("lo que ya está en main NO se puede descartar desde un panel", () => {
        expect(accionesDeTarea("commit")).toEqual([]);
        expect(accionesDeTarea("hecho")).toEqual([]);
    });

    it("toda acción que borra va marcada como destructiva", () => {
        const destructivas = accionesDeTarea("bloqueada").filter((a) => a.clase === "descartar");
        expect(destructivas).toHaveLength(1);
        expect(destructivas[0].destructiva).toBe(true);
    });

    it("el reintento pide describir el cambio", () => {
        const r = accionesDeTarea("bloqueada").find((a) => a.clase === "reintentar");
        expect(r?.pideTexto).toBeTruthy();
    });

    it("sin estado no ofrece nada", () => {
        expect(accionesDeTarea(undefined)).toEqual([]);
    });
});

describe("dependenciaDeNota", () => {
    it("saca los ids y tira los paréntesis", () => {
        expect(dependenciaDeNota("dependencia no integrada: p320B (bloqueada)")).toEqual(["p320B"]);
        expect(dependenciaDeNota("dependencia no integrada: p320D (bloqueada), p320F (rechazada)")).toEqual([
            "p320D",
            "p320F",
        ]);
    });

    it("una nota que no habla de dependencias devuelve vacío", () => {
        expect(dependenciaDeNota("reintento gratuito 1/8")).toEqual([]);
        expect(dependenciaDeNota(undefined)).toEqual([]);
    });
});

describe("porqueBloqueada", () => {
    it("dice a quién espera", () => {
        expect(porqueBloqueada("dependencia no integrada: X1 (bloqueada)", () => "bloqueada")).toBe("espera a X1");
    });

    it("avisa cuando la dependencia YA está integrada — eso cambia qué haces con ella", () => {
        const texto = porqueBloqueada("dependencia no integrada: X1 (sin_cambios)", () => "commit");
        expect(texto).toContain("puede desbloquearse");
    });

    it("sin nota no inventa un motivo", () => {
        expect(porqueBloqueada(undefined, () => undefined)).toContain("sin motivo anotado");
    });
});

const progreso = {
    A1: { estado: "bloqueada", nota: "dependencia no integrada: A0 (bloqueada)", t: "2026-09-14 10:00" },
    A0: { estado: "bloqueada", nota: "" },
    B1: { estado: "bloqueada", nota: "dependencia no integrada: B0 (sin_cambios)" },
    B0: { estado: "commit" },
    C1: { estado: "bloqueante", nota: "escalada agotada" },
    D1: { estado: "commit" },
    E1: { estado: "en_curso", t: "2026-09-14 11:00" },
};

describe("detalleDeMedidor · bloqueadas", () => {
    it("lista las bloqueadas con su porqué y ofrece descartar la lista entera", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso });
        expect(d.filas.map((f) => f.id).sort()).toEqual(["A0", "A1", "B1", "C1"]);
        expect(d.acciones.some((a) => a.clase === "descartar-todas" && a.destructiva)).toBe(true);
    });

    it("una integrada nunca aparece entre las bloqueadas", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso });
        expect(d.filas.map((f) => f.id)).not.toContain("D1");
    });

    it("ninguna fila ofrece acciones destructivas sobre algo integrado", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso: { ...progreso, Z9: { estado: "commit" } } });
        for (const f of d.filas) {
            if (f.estado === "commit") expect(f.acciones).toEqual([]);
        }
    });

    it("la bloqueante dice que necesita una persona", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso });
        expect(d.filas.find((f) => f.id === "C1")?.porque).toContain("una persona");
    });

    it("sin bloqueadas explica por qué está vacío en vez de callarse", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso: {} });
        expect(d.filas).toEqual([]);
        expect(d.vacio).toBeTruthy();
    });
});

describe("detalleDeMedidor · sin publicar", () => {
    it("lista los commits y solo ofrece publicar", () => {
        const d = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [{ sha: "abcdef1234", asunto: "arregla X" }],
        });
        expect(d.filas[0].id).toBe("abcdef12");
        expect(d.filas[0].acciones).toEqual([]);
        expect(d.acciones.map((a) => a.clase)).toEqual(["publicar"]);
    });

    it("un commit no se descarta desde un panel", () => {
        const d = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [{ sha: "abcdef1234", asunto: "x" }],
        });
        expect(d.acciones.some((a) => a.destructiva)).toBe(false);
    });
});

describe("detalleDeMedidor · agentes", () => {
    it("dice quién escribe cada tarea", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [{ tarea: "T1", fase: "escribiendo", modelo: "nim/kimi-k3", minutos: 4, donde: "mac", proveedor: "nim" }],
            titulos: { T1: "Hacer algo" },
        });
        expect(d.filas[0].quien).toContain("kimi-k3");
        expect(d.filas[0].titulo).toBe("Hacer algo");
    });

    it("una tarea en curso SIN latido sale la primera y avisa de que es rancia", () => {
        const d = detalleDeMedidor("agentes", { progreso, latidos: [] });
        expect(d.filas[0].id).toBe("E1");
        expect(d.filas[0].porque).toContain("rancio");
    });

    it("un agente de más de 45 minutos queda señalado", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [{ tarea: "T1", fase: "escribiendo", modelo: "nim/x", minutos: 60, donde: "mac" }],
        });
        expect(d.filas[0].porque).toBeTruthy();
    });
});

describe("configuración", () => {
    it("recorta y dice cuántas quedan fuera", () => {
        const filas = Array.from({ length: 10 }, (_, i) => ({ id: `T${i}`, titulo: "x", acciones: [] }));
        const d = aplicarConfiguracion(
            { clave: "listas", titulo: "x", resumen: "10", filas, acciones: [] },
            { ...configuracionPorDefecto(), filasMaximas: 3 },
        );
        expect(d.filas).toHaveLength(3);
        expect(d.resumen).toContain("7 más");
    });

    it("reordenar no pierde ningún medidor", () => {
        const cfg = { ...configuracionPorDefecto(), orden: ["disco", "bloqueadas"] as ClaveMedidor[] };
        const visibles = medidoresVisibles(cfg);
        expect(visibles[0]).toBe("disco");
        expect(visibles).toContain("sin-publicar");
        expect(new Set(visibles).size).toBe(visibles.length);
    });

    it("lo oculto no vuelve por la puerta de atrás", () => {
        const cfg = { ...configuracionPorDefecto(), ocultos: ["disco"] as ClaveMedidor[] };
        expect(medidoresVisibles(cfg)).not.toContain("disco");
    });
});
