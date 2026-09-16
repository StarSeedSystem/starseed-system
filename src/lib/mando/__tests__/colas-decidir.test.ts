import { describe, expect, it } from "vitest";

import { validarCola } from "@/lib/mando/colas";

/**
 * El Mando tiene que poder administrar los ids que el ENJAMBRE escribe.
 *
 * `PATRON_ID` exigía empezar por MAYÚSCULA, y desde la ola 300 el enjambre escribe `p316I`,
 * `p320M`, `zW7`, `zO2`, `p323A`, `p316L2`. Resultado: «Nombre de cola no válido» al intentar
 * aprobar, rechazar, soltar o reencolar su propio trabajo desde la consola. Es decir: el
 * Puente de Mando no podía administrar el enjambre, que es exactamente para lo que existe.
 *
 * Es el fallo que la tarea p320M lleva días intentando arreglar —y que se comió sus ocho
 * intentos gratuitos sin llegar nunca a un escritor capaz—. Se arregló a mano el 2026-09-16
 * porque bloqueaba, por segunda vez en una tarde, reencolar las atascadas desde el Mando.
 */
const tarea = (id: string) => ({
    id,
    titulo: "una tarea",
    prompt: "un enunciado suficientemente largo para pasar el mínimo de veinte caracteres",
    archivos: ["src/lib/x.ts"],
});

describe("validarCola · ids del enjambre", () => {
    it.each(["p316I", "p320M", "zW7", "zO2", "p323A", "p316L2", "zAU3"])(
        "acepta el id real «%s» que escribe el enjambre",
        (id) => {
            expect(validarCola("330-prueba", [tarea(id)]).errores).toEqual([]);
        },
    );

    it.each(["PS1", "X4F2", "AG3", "C1", "MD12"])(
        "sigue aceptando el id clásico «%s»",
        (id) => {
            expect(validarCola("330-prueba", [tarea(id)]).errores).toEqual([]);
        },
    );

    it.each(["1abc", "", "demasiadolargo", "con-guion", "con espacio"])(
        "sigue rechazando «%s»",
        (id) => {
            expect(validarCola("330-prueba", [tarea(id)]).errores.length).toBeGreaterThan(0);
        },
    );

    it("un id repetido se sigue señalando aunque ahora sea minúscula", () => {
        const errores = validarCola("330-prueba", [tarea("p316I"), tarea("p316I")]).errores;
        expect(errores.some((e) => e.includes("repetido"))).toBe(true);
    });
});

describe("validarCola · escritores permitidos", () => {
    it("acepta codex como escritor: va contra la suscripción, no contra créditos de API", () => {
        const conCodex = { ...tarea("zO2"), modelo: "codex/gpt-5.6-sol" };
        expect(validarCola("330-prueba", [conCodex]).errores).toEqual([]);
    });

    it("sigue rechazando una API con la que el orquestador no sabe escribir", () => {
        const conGemini = { ...tarea("zO2"), modelo: "gemini/gemini-2.5-flash" };
        expect(validarCola("330-prueba", [conGemini]).errores.length).toBeGreaterThan(0);
    });
});
