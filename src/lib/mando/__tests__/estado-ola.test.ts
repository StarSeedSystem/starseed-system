/**
 * «Olas e informes» enseñaba 89 olas «En curso» con cero agentes (2026-09-24).
 *
 * Alex: «en la sección de olas e informes aún aparecen muchas como en curso cuando ya no
 * hay en curso». Estas pruebas vigilan la regla: «en curso» = un agente latiendo AHORA; lo
 * rechazado o lo que pide una persona es un bloqueo; lo demás que queda, «en espera».
 */
import { describe, expect, it } from "vitest";

import { detalleDeOla, estadoDeOla, hechasDeOla, recuentoDeOlas } from "@/lib/mando/estado-ola";
import { resumirOlas } from "@/lib/mando/lector-local";
import type { OlaResumen, TareaOla } from "@/lib/mando/tipos";

const tarea = (id: string, ola: string): TareaOla => ({ id, ola, titulo: `Tarea ${id}` }) as TareaOla;

describe("resumirOlas: en curso solo con agentes latiendo", () => {
    const tareas = [
        tarea("A1", "400"),
        tarea("A2", "400"),
        tarea("A3", "400"),
        tarea("A4", "400"),
        tarea("A5", "400"),
        tarea("A6", "400"),
    ];
    const progreso = {
        A1: { estado: "commit" },
        A2: { estado: "rechazada" },
        A3: { estado: "bloqueante" },
        A4: { estado: "pendiente" },
        A5: { estado: "en_curso" }, // orquestador muerto: sin latido
        A6: { estado: "descartada" },
    };

    it("sin latidos no hay nada en curso, aunque queden tareas", () => {
        const [ola] = resumirOlas(tareas, progreso);
        expect(ola.enCurso).toBe(0);
        expect(ola.procesadas).toBe(1);
        expect(ola.sinCambios).toBe(1); // descartada
        expect(ola.bloqueantes).toBe(2); // rechazada + bloqueante
        expect(ola.pendientes).toBe(2); // pendiente + en_curso rancia
        expect(ola.restantes).toBe(2);
        expect(estadoDeOla(ola)).toBe("bloqueada");
    });

    it("con un agente latiendo sobre una de sus tareas, está en curso", () => {
        const [ola] = resumirOlas(tareas, progreso, new Map(), "", [{ tarea: "A2", donde: "mac" }]);
        expect(ola.enCurso).toBe(1);
        expect(ola.bloqueantes).toBe(1);
        expect(estadoDeOla(ola)).toBe("en-curso");
    });

    it("lo reasignado a la nube solo está en curso si la nube late", () => {
        const t = [tarea("N1", "401")];
        const p = { N1: { estado: "reasignada" } };
        expect(resumirOlas(t, p)[0].enCurso).toBe(0);
        expect(resumirOlas(t, p, new Map(), "", [{ tarea: "otra", donde: "nube-gh" }])[0].enCurso).toBe(1);
    });
});

describe("estadoDeOla y el texto de la tarjeta", () => {
    const base: OlaResumen = {
        id: "400",
        titulo: "x",
        seccion: "400",
        procesadas: 3,
        sinCambios: 1,
        bloqueantes: 0,
        restantes: 2,
        total: 6,
        enCurso: 0,
        pendientes: 2,
    };

    it("lo que queda sin nadie trabajándolo es «en espera», no «en curso»", () => {
        expect(estadoDeOla(base)).toBe("en-espera");
        expect(detalleDeOla(base)).toBe("2 en espera");
        expect(hechasDeOla(base)).toBe(4);
    });

    it("todo cerrado es «completa»; sin tareas, «sin datos»", () => {
        expect(estadoDeOla({ ...base, restantes: 0, pendientes: 0, procesadas: 5 })).toBe("completa");
        expect(estadoDeOla({ ...base, total: 0 })).toBe("sin-datos");
    });

    it("una ejecución (auto-/nube-) sin agentes está «terminada», no bloqueada", () => {
        const ejecucion = { ...base, id: "auto-0914-180046", bloqueantes: 2 };
        expect(estadoDeOla(ejecucion)).toBe("terminada");
        expect(estadoDeOla({ ...ejecucion, enCurso: 1 })).toBe("en-curso");
        expect(estadoDeOla({ ...ejecucion, procesadas: 5, bloqueantes: 0 })).toBe("completa");
        // Una ola de verdad con algo atascado sí es un bloqueo.
        expect(estadoDeOla({ ...base, bloqueantes: 2 })).toBe("bloqueada");
    });

    it("la cabecera cuenta las olas por estado", () => {
        const r = recuentoDeOlas([
            base,
            { ...base, id: "401", enCurso: 1 },
            { ...base, id: "402", bloqueantes: 2 },
        ]);
        expect(r["en-curso"]).toBe(1);
        expect(r.bloqueada).toBe(1);
        expect(r["en-espera"]).toBe(1);
    });
});
