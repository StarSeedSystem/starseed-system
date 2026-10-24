/**
 * (2026-10-22) Rescate de la rama nube/39362481846 (GBL1019Ab): el cálculo único de «Bloqueadas»
 * tiene que reconocer como SIN RESOLVER también lo fallido por interrupción, conflicto o
 * fallo de la cola, no solo lo de tsc/tests o lo rechazado. Se prueba contra la API de hoy
 * (`detalleDeMedidor`), no contra la `unificarBloqueadas` que la rama proponía y main no adoptó.
 */
import { describe, expect, it } from "vitest";

import { detalleDeMedidor } from "@/lib/mando/medidores";

const AHORA = Date.parse("2026-10-10T05:00:00");
const HOY = "2026-10-10 03:00";

describe("«Bloqueadas»: problemas de las colas vivas", () => {
    it("una interrumpida, un conflicto y un fallo de cola cuentan como sin resolver, no como en cadena", () => {
        const d = detalleDeMedidor(
            "bloqueadas",
            {
                progreso: {
                    I1: { estado: "interrumpida", t: HOY, nota: "el proceso murió a mitad" },
                    C1: { estado: "conflicto", t: HOY, nota: "no se pudo integrar" },
                    F1: { estado: "fallo_timeout", t: HOY, nota: "se agotó el plazo" },
                },
            },
            AHORA,
        );
        expect(d.filas.map((f) => f.id).sort()).toEqual(["C1", "F1", "I1"]);
        expect(d.filas.every((f) => f.grupo === "sin-resolver")).toBe(true);
        expect(d.bloqueadas?.valor).toBe(3);
        expect(d.bloqueadas?.sinResolver).toBe(3);
        expect(d.bloqueadas?.enCadena).toBe(0);
    });
});
