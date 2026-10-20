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
        expect(resumen.texto).toContain("2 en cadena, en su propio medidor");
        // (2026-10-20) La pastilla habla solo de lo parado; las esperas tienen la suya («En cadena»).
        expect(resumen.pastilla).toBe("1 atascada · 1 te necesita · ábrelo para ver por qué");
        expect(resumen.textoCadena).toContain("2 esperan a 1 tarea que avanza");
        expect(conGrupo.find((f) => f.id === "A")?.grupo).toBe("cadena");
        // Solo las de HOY y sin el «priorizar» de la cola, lo más reciente primero.
        expect(resumen.transformadas.map((t) => t.tid)).toEqual(["PM1010F0K"]);
        expect(resumen.revisorAlDia).toBe(true);
    });

    it("con todo en cadena la pastilla dice 0 y que no hay nada parado", () => {
        const { resumen } = resumirBloqueadas([espera("A"), espera("B")], { ...revisor, necesitan_alex: {} }, AHORA);
        expect(resumen.valor).toBe(0);
        expect(resumen.pastilla).toBe("nada parado");
        expect(resumen.texto.startsWith("nada parado")).toBe(true);
        expect(resumen.textoCadena).toContain("se desbloquean solas");
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
        // (2026-10-20) La espera no está en «Bloqueadas»: está en «En cadena».
        expect(d.filas).toHaveLength(0);
        expect(d.vacio).toContain("1 en cadena");
        const c = detalleDeMedidor(
            "en-cadena",
            {
                progreso: { PM1010F0A: { estado: "pendiente" } },
                ejecutables: [{ id: "A", titulo: "a", esperaA: ["PM1010F0A"] } as never],
                revisorBloqueadas: { ...revisor, necesitan_alex: {} },
            },
            AHORA,
        );
        expect(c.filas.map((f) => [f.id, f.grupo])).toEqual([["A", "cadena"]]);
        expect(c.resumen).toContain("1 espera a");
    });
});

/**
 * (2026-10-20) Alex: «es diferente la info de Bloqueadas y rechazadas en Ramificación que el medidor
 * del pulso». Un solo cálculo: lo parado (atascadas, te necesitan, fallidas o rechazadas sin resolver)
 * en «Bloqueadas»; las esperas, en «En cadena».
 */
describe("«Bloqueadas» con las fallidas y rechazadas sin resolver", () => {
    const HOY = "2026-10-10 03:00";
    const base = {
        progreso: {
            // Fallida reciente con sucesora viva: está sin resolver, pero ya con quién la rehaga.
            F1: { estado: "sin_cambios", t: HOY, nota: "sin cambios" },
            F1b: { estado: "en_curso", t: HOY },
            // Rechazada automática reciente sin sucesora: trabajo que se pierde.
            R1: { estado: "rechazada", t: HOY, nota: "no toco NINGUNO de los 3 archivos que declaraba (rama ola/R1 conservada)" },
            // Rechazos que fueron decisiones: no son un problema.
            R2: { estado: "rechazada", t: HOY, nota: "rechazada desde el Mando; rama ola/R2 conservada" },
            R3: { estado: "rechazada", t: HOY, nota: "revisada por la dirección (2026-10-08): no aporta" },
            // Rechazada sin fecha o vieja: no se puede decir que sea de estos días.
            R4: { estado: "rechazada", nota: "no toco NINGUNO" },
            R5: { estado: "rechazada", t: "2026-10-01 10:00", nota: "no toco NINGUNO" },
            // Rechazada cuya sucesora ya está integrada: resuelta.
            R6: { estado: "rechazada", t: HOY, nota: "no toco NINGUNO" },
            R6b: { estado: "commit", t: HOY },
            // Un atasco de los de siempre.
            B1: { estado: "bloqueante", t: HOY, nota: "agotó" },
        },
    };

    it("cuenta lo parado una sola vez y deja fuera las decisiones", () => {
        const d = detalleDeMedidor("bloqueadas", base, AHORA);
        expect(d.filas.map((f) => f.id).sort()).toEqual(["B1", "F1", "R1"]);
        expect(d.bloqueadas?.valor).toBe(3);
        expect(d.bloqueadas?.sinResolver).toBe(2);
        expect(d.bloqueadas?.sinResolverEnMarcha).toBe(1);
        expect(d.filas.find((f) => f.id === "F1")?.grupo).toBe("sin-resolver");
        expect(d.filas.find((f) => f.id === "F1")?.porque).toContain("la rehace F1b");
        expect(d.resumen).toContain("2 fallidas o rechazadas sin resolver (1 ya con quién la rehaga)");
        // El primer número del texto es el total: así lo leen MetaGenesis y el vigía.
        expect(d.resumen.startsWith("3 paradas: 1 atascada")).toBe(true);
        expect(d.bloqueadas?.pastilla).toBe("1 atascada · 2 sin resolver · ábrelo para ver por qué");
    });

    it("las fallidas de «Bloqueadas» son exactamente las del medidor «Fallidas»", () => {
        const b = detalleDeMedidor("bloqueadas", base, AHORA);
        const f = detalleDeMedidor("fallidas", base, AHORA);
        const enBloqueadas = b.filas.filter((x) => x.grupo === "sin-resolver" && x.estado !== "rechazada");
        expect(enBloqueadas.map((x) => x.id)).toEqual(f.filas.map((x) => x.id));
    });

    it("una tarea que ya está entre las esperas no se cuenta otra vez como fallida", () => {
        const filas: FilaMedidor[] = [{ id: "F1", titulo: "f", estado: "bloqueante", acciones: [] }];
        const { resumen, filas: todas } = resumirBloqueadas(filas, null, AHORA, [
            { id: "F1", titulo: "f", estado: "sin cambios", acciones: [] },
        ]);
        expect(todas).toHaveLength(1);
        expect(resumen.valor).toBe(1);
        expect(resumen.sinResolver).toBe(0);
    });

    it("una fallida por la que el revisor pregunta a Alex cuenta como «te necesita», una sola vez", () => {
        const { resumen } = resumirBloqueadas([], { ...revisor, necesitan_alex: { F9: { pregunta: "¿?" } } }, AHORA, [
            { id: "F9", titulo: "f", estado: "fallo tsc", acciones: [] },
        ]);
        expect(resumen.alex).toBe(1);
        expect(resumen.sinResolver).toBe(0);
        expect(resumen.valor).toBe(1);
    });
});
