/**
 * (2026-10-10, OPB1011) «Bloqueadas» deja de mezclar esperas normales de una cadena con atascos de
 * verdad. Caso medido: 40 «bloqueadas» que eran esperas de dos cadenas (Protomolécula y S1010).
 */
import { describe, expect, it } from "vitest";

import {
    esOpcionAlex,
    grupoDeFila,
    idDeTareaValido,
    NOMBRE_ACCION,
    resumirBloqueadas,
    revisorFresco,
    sujetoDeTransformada,
    type EstadoRevisorBloqueadas,
} from "@/lib/mando/bloqueadas";
import { detalleDeMedidor, type FilaMedidor } from "@/lib/mando/medidores";

const AHORA = Date.parse("2026-10-10T05:00:00");

const espera = (id: string): FilaMedidor => ({
    id,
    titulo: `tarea ${id}`,
    estado: "bloqueada",
    porque: "espera a 1 tarea(s) que siguen vivas: es una espera normal",
    ficha: [{ etiqueta: "Espera a", valor: "PM1010F0A (pendiente)" }],
    acciones: [],
});

const revisor: EstadoRevisorBloqueadas = {
    t: "2026-10-10T04:58:00",
    medio: "maggasukha",
    cadenas: [{ raiz: "PM1010F0A", titulo_raiz: "Molécula", va_por: "pendiente en cola", esperan: ["A", "B"], n: 2 }],
    en_cadena: { A: { raiz: "PM1010F0A" }, B: { raiz: "PM1010F0A" } },
    transformadas_hoy: [
        { t: "2026-10-10 04:30:00", tid: "PM1010F0K", accion: "reintentar", motivo: "cerrojo", resultado: "aplicada" },
        { t: "2026-10-10 04:31:00", tid: "", accion: "priorizar", motivo: "orden", resultado: "aplicada" },
        { t: "2026-10-09 23:00:00", tid: "VIEJA", accion: "reescribir", motivo: "ayer", resultado: "aplicada" },
    ],
    necesitan_alex: { CPA1007Kb: { pregunta: "¿Rehacer o descartar?", opciones: ["rehacer", "descartar"] } },
};

describe("bloqueadas · grupos", () => {
    it("una espera viva es cadena; sin salida o bloqueante es atasco", () => {
        expect(grupoDeFila(espera("X"), null, AHORA)).toBe("cadena");
        expect(grupoDeFila({ id: "Y", estado: "bloqueada sin salida", porque: "x" }, null, AHORA)).toBe("atascada");
        expect(grupoDeFila({ id: "Z", estado: "bloqueante", porque: "agotó" }, null, AHORA)).toBe("atascada");
    });

    it("lo que el revisor pregunta a Alex va a «necesitan a Alex»", () => {
        expect(grupoDeFila({ id: "CPA1007Kb", estado: "bloqueante" }, revisor, AHORA)).toBe("alex");
    });

    it("la pastilla cuenta atascadas + Alex; las esperas van en el texto", () => {
        const filas = [espera("A"), espera("B"), { id: "R1", titulo: "r", estado: "bloqueante", acciones: [] }];
        const { resumen, filas: conGrupo } = resumirBloqueadas(filas, revisor, AHORA);
        expect(resumen.enCadena).toBe(2);
        expect(resumen.atascadas).toBe(1);
        expect(resumen.alex).toBe(1);
        expect(resumen.valor).toBe(2);
        expect(resumen.texto).toContain("2 en cadena");
        expect(resumen.pastilla).toContain("2 en cadena");
        expect(conGrupo.find((f) => f.id === "A")?.grupo).toBe("cadena");
        // Solo las de HOY y sin el «priorizar» de la cola, lo más reciente primero.
        expect(resumen.transformadas.map((t) => t.tid)).toEqual(["PM1010F0K"]);
        expect(resumen.revisorAlDia).toBe(true);
    });

    it("con todo en cadena la pastilla dice 0 y que avanzan solas", () => {
        const { resumen } = resumirBloqueadas([espera("A"), espera("B")], { ...revisor, necesitan_alex: {} }, AHORA);
        expect(resumen.valor).toBe(0);
        expect(resumen.pastilla).toBe("2 en cadena, avanzan solas");
    });

    it("sin revisor fresco las cadenas salen de las fichas", () => {
        const viejo = { ...revisor, t: "2026-10-10T03:00:00" };
        expect(revisorFresco(viejo, AHORA)).toBe(false);
        const { resumen } = resumirBloqueadas([espera("A"), espera("B")], viejo, AHORA);
        expect(resumen.cadenas[0]).toMatchObject({ raiz: "PM1010F0A", n: 2 });
        expect(resumen.revisorAlDia).toBe(false);
    });

    it("las acciones de la segunda pasada (2026-10-10) se dicen para una persona", () => {
        expect(NOMBRE_ACCION.ceder).toBe("cede a su sucesora");
        expect(NOMBRE_ACCION.reabrir).toBe("vuelta a la tanda");
        expect(NOMBRE_ACCION.instalar_dependencias).toBe("dependencias instaladas");
        expect(sujetoDeTransformada({ tid: "", accion: "instalar_dependencias" })).toBe("el entorno");
        expect(sujetoDeTransformada({ tid: "PM1010F0Bc", accion: "reabrir" })).toBe("PM1010F0Bc");
        // Una cadena cuya raíz falló lo dice, en vez de «pendiente en cola».
        const conRaizCaida: EstadoRevisorBloqueadas = {
            ...revisor,
            necesitan_alex: {},
            cadenas: [{ raiz: "PM1010F0Bc", va_por: "falló (fallo_tsc) a las 08:29; la escalera la vuelve a poner en la tanda", esperan: ["A", "B"], n: 2 }],
        };
        const { resumen } = resumirBloqueadas([espera("A"), espera("B")], conRaizCaida, AHORA);
        expect(resumen.cadenas[0].va_por).toContain("falló (fallo_tsc)");
    });

    it("solo viajan opciones e ids legales", () => {
        expect(esOpcionAlex("rehacer")).toBe(true);
        expect(esOpcionAlex("borrar-todo")).toBe(false);
        expect(idDeTareaValido("S1010-TU-LL2")).toBe(true);
        expect(idDeTareaValido("x; rm -rf /")).toBe(false);
    });
});

describe("medidor «Bloqueadas» con el revisor", () => {
    it("el detalle lleva el resumen repartido y las filas con su grupo", () => {
        const d = detalleDeMedidor(
            "bloqueadas",
            {
                progreso: { PM1010F0A: { estado: "pendiente" } },
                ejecutables: [{ id: "A", titulo: "a", esperaA: ["PM1010F0A"] } as never],
                revisorBloqueadas: { ...revisor, necesitan_alex: {} },
            },
            AHORA,
        );
        expect(d.bloqueadas?.enCadena).toBe(1);
        expect(d.bloqueadas?.valor).toBe(0);
        expect(d.filas[0].grupo).toBe("cadena");
        expect(d.resumen).toContain("1 en cadena");
    });
});
