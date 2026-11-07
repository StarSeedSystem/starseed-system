import { describe, expect, it } from "vitest";

import { contarTrabajoReal, obtenerIdsBloqueados } from "@/lib/mando/conteo-operativo";

const tarea = (id: string, estado = "pendiente", dependenciasPendientes: string[] = []) => ({
    id,
    estado,
    dependenciasPendientes,
});

describe("conteo operativo de Genesis", () => {
    it("cuenta una sola vez un id repetido en varias colas", () => {
        const resultado = contarTrabajoReal([tarea("A1"), tarea("A1"), tarea("A2")], []);
        expect(resultado).toEqual({ enCurso: 0, listas: 2, bloqueadas: 0, pendientes: 2, copiasOmitidas: 1 });
    });

    it("separa listas, bloqueadas y tareas con latido", () => {
        const fila = [tarea("A1"), tarea("A2", "bloqueada", ["A1"]), tarea("A3", "en_curso")];
        expect(contarTrabajoReal(fila, [{ tarea: "A3" }])).toMatchObject({
            enCurso: 1,
            listas: 1,
            bloqueadas: 1,
            pendientes: 2,
        });
    });

    it("un cierre histórico no resucita una tarea", () => {
        const fila = [tarea("A1", "rechazada"), tarea("A2", "sin_cambios")];
        expect(contarTrabajoReal(fila, [])).toMatchObject({ enCurso: 0, pendientes: 0 });
    });

    it("una copia cerrada no oculta otra definición abierta del mismo id", () => {
        const fila = [tarea("A1", "rechazada"), tarea("A1", "interrumpida")];
        expect(contarTrabajoReal(fila, [])).toMatchObject({ listas: 1, pendientes: 1 });
    });
    // (07-11, MED1107A) Lo que Alex vio: descartadas y «no aplica» con la dependencia sin integrar salían
    // en «Bloqueadas» como «bloqueada sin salida».
    it("una tarea descartada o «no aplica» no cuenta como bloqueada aunque su dependencia no llegue", () => {
        const fila = [
            tarea("D2", "descartada", ["D1"]),
            tarea("N3", "no_aplica", ["N2"]),
            tarea("H1", "no-aplica", ["X"]),
            tarea("B1", "bloqueada", ["A1"]),
        ];
        expect([...obtenerIdsBloqueados(fila, [])]).toEqual(["B1"]);
        expect(contarTrabajoReal(fila, [])).toMatchObject({ bloqueadas: 1, pendientes: 1 });
    });
});
