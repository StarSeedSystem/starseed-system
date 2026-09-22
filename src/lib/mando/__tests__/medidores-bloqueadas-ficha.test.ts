/**
 * La ficha de una BLOQUEADA (2026-09-22).
 *
 * Alex: «la informacion de las tareas bloqueadas aun no es coherente ni esta completa».
 * Antes la fila decía «espera a RM2» y ahí acababa, y con eso no se puede decidir nada.
 * Lo que de verdad importa es si la espera es VIVA o MUERTA: una dependencia rechazada no
 * se va a integrar sola, y una que no existe no se va a integrar nunca. Las dos son
 * bloqueos permanentes disfrazados de paciencia — nos costó diez horas de Mac parada el
 * día 21 con `p318Jb` esperando a `p318I`, que no existía en ninguna parte.
 */
import { describe, expect, it } from "vitest";

import { detalleDeMedidor, fichaDeBloqueada } from "../medidores";

const titulo = (id: string) => ({ RM2: "Estado PAIR", p318I: "" })[id] ?? "";
const valor = (f: { etiqueta: string; valor: string }[], etiqueta: string) =>
    f.find((x) => x.etiqueta === etiqueta)?.valor;

describe("fichaDeBloqueada", () => {
    it("una dependencia VIVA es una espera normal", () => {
        const r = fichaDeBloqueada("dependencia no integrada: RM2", (id) => (id === "RM2" ? "en_curso" : undefined), titulo);
        expect(r.muerta).toBe(false);
        expect(r.veredicto).toContain("siguen vivas");
        expect(valor(r.ficha, "↳ su estado")).toBe("en_curso");
    });

    it("una dependencia RECHAZADA es una espera muerta y lo dice", () => {
        const r = fichaDeBloqueada("dependencia no integrada: RM2", () => "rechazada", titulo);
        expect(r.muerta).toBe(true);
        expect(r.veredicto).toContain("no se van a integrar solas");
        expect(valor(r.ficha, "↳ su estado")).toContain("no se va a integrar sola");
        expect(r.ficha.find((x) => x.etiqueta === "Veredicto")?.aviso).toBe(true);
    });

    it("una dependencia que NO EXISTE se nombra como tal: es el caso de p318I", () => {
        const r = fichaDeBloqueada("dependencia no integrada: p318I (?)", () => undefined, titulo);
        expect(r.muerta).toBe(true);
        expect(r.veredicto).toContain("NO EXISTEN");
        expect(valor(r.ficha, "↳ su estado")).toContain("NO EXISTE");
    });

    it("una dependencia ya integrada dice que esto puede desbloquearse", () => {
        const r = fichaDeBloqueada("dependencia no integrada: RM2", () => "commit", titulo);
        expect(r.muerta).toBe(false);
        expect(r.veredicto).toContain("puede desbloquearse");
    });

    it("sin dependencia anotada no se finge paciencia", () => {
        const r = fichaDeBloqueada(undefined, () => undefined, titulo);
        expect(r.muerta).toBe(true);
        expect(r.veredicto).toContain("sin motivo anotado");
    });

    it("nombra la dependencia con su título, no solo con su id", () => {
        const r = fichaDeBloqueada("dependencia no integrada: RM2", () => "en_curso", titulo);
        expect(valor(r.ficha, "Espera a")).toContain("Estado PAIR");
    });

    it("varias dependencias: manda la peor", () => {
        const r = fichaDeBloqueada(
            "dependencia no integrada: RM2, RM3",
            (id) => (id === "RM2" ? "en_curso" : "rechazada"),
            titulo,
        );
        expect(r.muerta).toBe(true);
    });
});

describe("el medidor de bloqueadas dice QUÉ cuenta", () => {
    const datos = {
        progreso: {
            B1: { estado: "bloqueada", nota: "dependencia no integrada: RM2", t: "2026-09-22 10:00" },
            B2: { estado: "bloqueada", nota: "dependencia no integrada: FANTASMA", t: "2026-09-22 10:00" },
        },
        titulos: { B1: "Una", B2: "Otra" },
        latidos: [],
    };

    it("el resumen aclara que solo cuenta las que esperan a otra tarea", () => {
        const d = detalleDeMedidor("bloqueadas", datos);
        expect(d.resumen).toContain("esperando a otra tarea");
        expect(d.resumen).toContain("Ramificación");
    });

    it("cuenta aparte las que no tienen salida", () => {
        const d = detalleDeMedidor("bloqueadas", datos);
        expect(d.resumen).toContain("SIN SALIDA");
    });

    it("cada fila trae su ficha con el estado de lo que espera", () => {
        const d = detalleDeMedidor("bloqueadas", datos);
        const fantasma = d.filas.find((f) => f.id === "B2");
        expect((fantasma?.ficha ?? []).length).toBeGreaterThan(2);
        expect(fantasma?.estado).toBe("bloqueada sin salida");
    });
});
