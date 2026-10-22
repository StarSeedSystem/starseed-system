/**
 * (RTGBL1019A) Casos rescatados de la rama nube/39362481846, adaptados al cálculo único de main:
 * `resumirBloqueadas` reparte esperas y problemas; las colas vivas entran por `sinResolver`.
 */
import { describe, expect, it } from "vitest";

import { resumirBloqueadas, type EstadoRevisorBloqueadas } from "../bloqueadas";
import {
    filasFallidasSinResolver,
    filasRechazadasSinResolver,
    type DatosMedidores,
    type FilaMedidor,
} from "../medidores";

const AHORA = Date.parse("2026-10-22T10:30:00Z");

function datosCon(progreso: DatosMedidores["progreso"]): DatosMedidores {
    return { progreso, titulos: {}, latidos: [], commitsSinPublicar: [], ejecutables: [], proveedores: [] };
}

function sinResolverDe(datos: DatosMedidores): FilaMedidor[] {
    return [...filasFallidasSinResolver(datos, AHORA), ...filasRechazadasSinResolver(datos, AHORA)];
}

describe("cálculo único de bloqueadas", () => {
    it("separa las esperas en cadena de los problemas y suma las colas vivas", () => {
        const datos = datosCon({
            F1: { estado: "fallo_timeout", t: "2026-10-22T10:15:00Z", nota: "se agotó el tiempo" },
            R1: {
                estado: "rechazada",
                t: "2026-10-22T10:10:00Z",
                nota: "no toco NINGUNO de los archivos que declaraba",
            },
            P1: { estado: "pendiente", t: "2026-10-22T10:20:00Z" },
            C1: { estado: "commit", t: "2026-10-22T10:20:00Z" },
        });
        const filasBloqueadas: FilaMedidor[] = [
            {
                id: "E1",
                titulo: "Espera viva",
                estado: "bloqueada",
                porque: "espera a 1 tarea(s) que siguen vivas: es una espera normal",
                acciones: [],
            },
            { id: "A1", titulo: "Necesita a Alex", estado: "bloqueada", porque: "necesita decision", acciones: [] },
            { id: "T1", titulo: "Atascada", estado: "bloqueada sin salida", porque: "atascada", acciones: [] },
            { id: "B1", titulo: "Bloqueante", estado: "bloqueante", porque: "agotado reintentos", acciones: [] },
        ];
        const revisor: EstadoRevisorBloqueadas = {
            t: "2026-10-22T10:29:00Z",
            necesitan_alex: { A1: { pregunta: "¿Rehacer o descartar?" } },
        };
        const { resumen, filas } = resumirBloqueadas(filasBloqueadas, revisor, AHORA, sinResolverDe(datos));

        expect(filas.filter((f) => f.grupo === "cadena").map((f) => f.id)).toEqual(["E1"]);
        const problemas = filas
            .filter((f) => !f.historica && f.grupo !== "cadena")
            .map((f) => f.id)
            .sort();
        expect(problemas).toEqual(["A1", "B1", "F1", "R1", "T1"].sort());
        expect(resumen.enCadena).toBe(1);
        expect(resumen.valor).toBe(5);
        expect(resumen.pastilla).toContain("ábrelo para ver por qué");
        expect(resumen.texto).toContain("1 en cadena, en su propio medidor");
    });

    it("ignora tareas de colas vivas que no coinciden con los estados objetivo", () => {
        const datos = datosCon({
            P1: { estado: "pendiente", t: "2026-10-22T10:20:00Z" },
            C1: { estado: "commit", t: "2026-10-22T10:20:00Z" },
            B2: { estado: "bloqueante", t: "2026-10-22T10:20:00Z", nota: "agotó los reintentos" },
        });
        expect(sinResolverDe(datos)).toEqual([]);
        const { resumen } = resumirBloqueadas([], null, AHORA, sinResolverDe(datos));
        expect(resumen.valor).toBe(0);
        expect(resumen.sinResolver).toBe(0);
    });
});
