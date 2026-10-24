/**
 * Rescate (RTGBL1019A) de los casos de la rama nube/39362481846 (GBL1019Ab, «Cálculo único de
 * bloqueadas: problemas y en cadena»). main hizo ese cálculo por otro camino: `resumirBloqueadas`
 * (`bloqueadas.ts`) + `filasSinResolver` (`medidores.ts`). Aquí van solo los casos que main no
 * cubría hoy: los estados objetivo de las colas vivas (`fallo_timeout`, `interrumpida`,
 * `conflicto`), lo que no entra (`pendiente`, `commit`) y el resumen conjunto de la rama.
 */
import { describe, expect, it } from "vitest";

import { resumirBloqueadas, type EstadoRevisorBloqueadas } from "@/lib/mando/bloqueadas";
import { detalleDeMedidor, type FilaMedidor } from "@/lib/mando/medidores";

const HORA = Date.parse("2026-10-19T12:00:00");
const HACE_UN_RATO = "2026-10-19 11:30";
const SIN_REHACER = "rechazada sin decisión de nadie y sin sucesora: no tocó lo declarado";

describe("«Bloqueadas» con los estados objetivo de las colas vivas (ramas de la nube)", () => {
    it("interrumpida, fallo_timeout y rechazada cuentan como problemas; pendiente y commit no", () => {
        const d = detalleDeMedidor(
            "bloqueadas",
            {
                progreso: {
                    FT1: { estado: "fallo_timeout", t: HACE_UN_RATO, nota: "timeout del proveedor" },
                    I1: { estado: "interrumpida", t: HACE_UN_RATO, nota: "se cortó el medio" },
                    R1: { estado: "rechazada", t: HACE_UN_RATO, nota: "no toco NINGUNO de los 3 archivos que declaraba" },
                    P1: { estado: "pendiente", t: HACE_UN_RATO },
                    CM: { estado: "commit", t: HACE_UN_RATO },
                    // Un atasco de verdad: la rama lo ignoraba, main lo cuenta (contrato de OPB1011).
                    BLO: { estado: "bloqueante", t: HACE_UN_RATO, nota: "agotó los reintentos" },
                },
                latidos: [],
            },
            HORA,
        );
        expect(d.filas.map((f) => f.id).sort()).toEqual(["BLO", "FT1", "I1", "R1"]);
        expect(d.bloqueadas?.sinResolver).toBe(3);
        expect(d.bloqueadas?.atascadas).toBe(1);
        expect(d.bloqueadas?.valor).toBe(4);
    });

    it("conflicto también es sin resolver; sin fecha de los últimos 3 días no se puede decir que sea de estos días", () => {
        const d = detalleDeMedidor(
            "bloqueadas",
            {
                progreso: {
                    CO1: { estado: "conflicto", t: HACE_UN_RATO, nota: "conflicto con main" },
                    VIE: { estado: "fallo_tsc", t: "2026-10-01 10:00", nota: "vieja" },
                    SFE: { estado: "interrumpida", nota: "sin fecha" },
                },
                latidos: [],
            },
            HORA,
        );
        expect(d.filas.map((f) => f.id).sort()).toEqual(["CO1", "SFE"]);
        expect(d.bloqueadas?.sinResolver).toBe(2);
    });
});

describe("resumen conjunto: problemas y en cadena (caso completo de la rama)", () => {
    it("7 problemas y 2 en cadena, contados una sola vez", () => {
        const cadena = (id: string): FilaMedidor => ({
            id,
            titulo: `Cadena ${id}`,
            estado: "bloqueada",
            porque: "espera a 1 tarea(s) que siguen vivas: es una espera normal",
            acciones: [],
        });
        const revisor: EstadoRevisorBloqueadas = {
            t: "2026-10-19 11:58",
            necesitan_alex: { A1: { pregunta: "¿Rehacer o descartar?", opciones: ["rehacer", "descartar"] } },
        };
        const filas: FilaMedidor[] = [
            cadena("C1"),
            cadena("C2"),
            { id: "T1", titulo: "Tarea atascada", estado: "bloqueada sin salida", porque: "sin salida", acciones: [] },
            { id: "B1", titulo: "Bloqueante", estado: "bloqueante", porque: "agotó reintentos", acciones: [] },
            { id: "A1", titulo: "Necesita Alex", estado: "bloqueada", porque: "necesita una decisión", acciones: [] },
        ];
        const sinResolver: FilaMedidor[] = [
            { id: "R1", titulo: "r", estado: "rechazada", porque: SIN_REHACER, acciones: [] },
            { id: "F1", titulo: "f", estado: "fallo timeout", porque: "la rehace F1b (en_curso)", acciones: [] },
            { id: "S1", titulo: "s", estado: "sin cambios", porque: "sin cambios", acciones: [] },
            { id: "I1", titulo: "i", estado: "interrumpida", porque: "se cortó el medio", acciones: [] },
        ];
        const { resumen, filas: todas } = resumirBloqueadas(filas, revisor, HORA, sinResolver);
        // Las esperas van al medidor «En cadena», no al de problemas.
        expect(resumen.enCadena).toBe(2);
        expect(resumen.cadenas[0]?.esperan).toEqual(["C1", "C2"]);
        expect(resumen.atascadas).toBe(2);
        expect(resumen.alex).toBe(1);
        expect(resumen.sinResolver).toBe(4);
        expect(resumen.sinResolverEnMarcha).toBe(1);
        expect(resumen.valor).toBe(7);
        // El primer número del texto es el de la pastilla (lo leen MetaGenesis y el vigía).
        expect(resumen.texto).toContain("7 paradas: 2 atascadas · 1 te necesita");
        expect(resumen.texto).toContain("4 fallidas o rechazadas sin resolver (1 ya con quién la rehaga)");
        expect(resumen.texto).toContain("2 en cadena, en su propio medidor");
        expect(resumen.pastilla).toBe("2 atascadas · 1 te necesita · 4 sin resolver · ábrelo para ver por qué");
        // Ningún id repetido entre las filas de espera y lo que traían las colas.
        expect(todas).toHaveLength(9);
        expect(new Set(todas.map((f) => f.id)).size).toBe(9);
    });
});
