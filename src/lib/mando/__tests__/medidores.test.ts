import { describe, expect, it } from "vitest";

import {
    accionesDeTarea,
    aplicarConfiguracion,
    avanceDe,
    mediaDeAvance,
    configuracionPorDefecto,
    dependenciaDeNota,
    detalleDeMedidor,
    ejecutablesDeColas,
    idEnAsuntos,
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

describe("porcentajes de avance", () => {
    it("el avance sale del MISMO camino de seis etapas que la barra de Procesos", () => {
        // Si aquí se inventara otra escala, el mismo agente diría 50 % en un sitio y 33 %
        // en otro: justo el tipo de doble verdad que llevamos días quitando.
        expect(avanceDe("escribiendo", undefined).porcentaje).toBe(17);
        expect(avanceDe("tsc", undefined).porcentaje).toBe(33);
        expect(avanceDe("revision", undefined).porcentaje).toBe(67);
        expect(avanceDe("", "commit").porcentaje).toBe(100);
    });

    it("una fase que no se reconoce es 0 %, no «desconocido»", () => {
        expect(avanceDe("haciendo cosas", undefined)).toEqual({ porcentaje: 0 });
        expect(avanceDe(undefined, undefined).porcentaje).toBe(0);
    });

    it("cada tarea en curso trae su porcentaje y su etapa", () => {
        const d = detalleDeMedidor("en-curso", {
            latidos: [
                { tarea: "T1", fase: "escribiendo", modelo: "nim/kimi", minutos: 3, donde: "mac" },
                { tarea: "T2", fase: "tsc", modelo: "nim/kimi", minutos: 3, donde: "mac" },
            ],
        });
        expect(d.filas.map((f) => f.porcentaje)).toEqual([17, 33]);
        expect(d.filas[0].etapa).toBe("escribiendo");
    });

    it("el panel dice el avance medio y el resumen lo repite en palabras", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [
                { tarea: "T1", fase: "escribiendo", modelo: "n/m", minutos: 1, donde: "mac" },
                { tarea: "T2", fase: "revision", modelo: "n/m", minutos: 1, donde: "mac" },
            ],
        });
        expect(d.porcentajeMedio).toBe(42);
        expect(d.resumen).toContain("42 %");
    });

    it("una tarea en curso SIN agente cuenta como 0 %: no está avanzando nada", () => {
        const d = detalleDeMedidor("en-curso", { progreso: { E1: { estado: "en_curso" } }, latidos: [] });
        expect(d.filas[0].porcentaje).toBe(0);
        expect(d.porcentajeMedio).toBe(0);
    });

    it("las listas van a 0 %: definidas y sin empezar", () => {
        const d = detalleDeMedidor("listas", { ejecutables: [{ id: "L1", titulo: "x", ola: "324" }] });
        expect(d.filas[0].porcentaje).toBe(0);
        expect(d.resumen).toContain("0 % avanzadas");
    });

    it("bloqueadas y sin publicar NO llevan porcentaje: ahí sería inventado", () => {
        const b = detalleDeMedidor("bloqueadas", { progreso });
        expect(b.filas.every((f) => f.porcentaje === undefined)).toBe(true);
        expect(b.porcentajeMedio).toBeUndefined();
        const c = detalleDeMedidor("sin-publicar", { commitsSinPublicar: [{ sha: "abc1234567", asunto: "x" }] });
        expect(c.filas[0].porcentaje).toBeUndefined();
    });

    it("la media ignora las filas sin avance en vez de contarlas como cero", () => {
        expect(mediaDeAvance([{ id: "a", titulo: "", porcentaje: 100, acciones: [] }, { id: "b", titulo: "", acciones: [] }])).toBe(100);
        expect(mediaDeAvance([{ id: "a", titulo: "", acciones: [] }])).toBe(0);
    });
});

describe("qué cuenta de verdad como «lista para trabajar»", () => {
    // El caso real del 2026-09-15: el medidor decía 78 y el vigilante cogía 4.
    // Las otras 74 eran tareas de olas viejas, hechas y publicadas hace semanas,
    // que nadie cerró en progreso.json.
    const asuntos = [
        "Ola · p323E: capturar-prueba.py: captura de la ruta local que tocó cada tarea",
        "Ola 320 · p320A y p320K rehechas a mano: desbloquean las 8 tareas del Mando",
        "fix(mando): la cabecera deja de descuadrarse",
    ].join("\n");

    it("reconoce el id como palabra entera, con o sin número de ola y en minúscula", () => {
        expect(idEnAsuntos("p323E", asuntos)).toBe(true);
        expect(idEnAsuntos("p320K", asuntos)).toBe(true);
        // `p323` no está: es un prefijo de `p323E`, no la misma tarea.
        expect(idEnAsuntos("p323", asuntos)).toBe(false);
        expect(idEnAsuntos("p324B", asuntos)).toBe(false);
        expect(idEnAsuntos("", asuntos)).toBe(false);
    });

    it("deja fuera lo que ya está en main aunque su estado siga vacío", () => {
        const colas = [
            { id: "p323E", titulo: "capturar prueba", ola: "323", cola: "323-reportes" },
            { id: "p324B", titulo: "pendiente de verdad", ola: "324", cola: "324-os" },
        ];
        expect(ejecutablesDeColas(colas, {}, asuntos).map((t) => t.id)).toEqual(["p324B"]);
    });

    it("ignora las copias `cola-auto-*`: son relanzamientos, no demanda nueva", () => {
        const colas = [
            { id: "p324B", titulo: "copia", ola: "324", cola: "auto-0915-101010" },
            { id: "p324F", titulo: "fuente", ola: "324", cola: "324-os" },
        ];
        expect(ejecutablesDeColas(colas, {}, "").map((t) => t.id)).toEqual(["p324F"]);
    });

    it("solo cuenta lo que el vigilante relanzaría: ni bloqueada, ni rechazada, ni commit", () => {
        const colas = [
            { id: "A", titulo: "", cola: "c" },
            { id: "B", titulo: "", cola: "c" },
            { id: "C", titulo: "", cola: "c" },
            { id: "D", titulo: "", cola: "c" },
        ];
        const progreso = {
            A: { estado: "pendiente" },
            B: { estado: "bloqueada" },
            C: { estado: "rechazada" },
            D: { estado: "commit" },
        };
        expect(ejecutablesDeColas(colas, progreso, "").map((t) => t.id)).toEqual(["A"]);
    });

    it("un id repetido en varias colas cuenta una sola vez", () => {
        const colas = [
            { id: "A", titulo: "nueva", cola: "324" },
            { id: "A", titulo: "vieja", cola: "300" },
        ];
        const salida = ejecutablesDeColas(colas, {}, "");
        expect(salida).toHaveLength(1);
        expect(salida[0].titulo).toBe("nueva");
    });
});
