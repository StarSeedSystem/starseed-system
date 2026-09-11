import { describe, it, expect } from "vitest";

import { contarAreas, olaDeAsunto, interpretarComprobaciones } from "@/lib/mando/publicacion";

describe("contarAreas", () => {
    it("agrupa las rutas por su primer segmento bajo src/", () => {
        const rutas = [
            "src/lib/mando/publicacion.ts",
            "src/lib/mando/tipos.ts",
            "src/components/mando/panel-publicacion.tsx",
            "src/app/api/mando/publicacion/route.ts",
            "supabase/migrations/0001.sql",
            "CLAUDE.md",
        ];
        expect(contarAreas(rutas)).toEqual({
            lib: 2,
            components: 1,
            app: 1,
            "raíz": 2,
        });
    });

    it("ignora líneas vacías y devuelve objeto vacío sin rutas", () => {
        expect(contarAreas(["", "   ", "\n"])).toEqual({});
        expect(contarAreas([])).toEqual({});
    });
});

describe("olaDeAsunto", () => {
    it("extrae el número de ola de un asunto de tarea", () => {
        expect(olaDeAsunto("Ola 226 · X4F2: título del commit")).toBe("226");
    });

    it("reconoce «ola» en minúsculas y sin prefijo de sección", () => {
        expect(olaDeAsunto("ola 239 · publicar")).toBe("239");
    });

    it("devuelve undefined cuando no hay número de ola", () => {
        expect(olaDeAsunto("chore: limpieza general")).toBeUndefined();
    });
});

describe("interpretarComprobaciones", () => {
    it("marca tsc y vitest en ok tras el último evento verificado", () => {
        const lineas = [
            JSON.stringify({ tipo: "verificado", texto: "tsc en verde" }),
            JSON.stringify({ tipo: "verificado", texto: "vitest 23/23 en verde" }),
        ];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: "ok", vitest: "ok" });
    });

    it("el último evento manda: una verificación fallida sobrescribe la anterior", () => {
        const lineas = [
            JSON.stringify({ tipo: "verificado", texto: "tsc ok" }),
            JSON.stringify({ tipo: "verificacion_fallida", texto: "tsc falla con 1 error" }),
        ];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: "falla", vitest: null });
    });

    it("detecta vitest también por la clave tarea", () => {
        const lineas = [JSON.stringify({ tipo: "verificado", tarea: "tests" })];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: null, vitest: "ok" });
    });

    it("ignora líneas que no son verificaciones y líneas corruptas", () => {
        const lineas = [
            "esto no es json",
            JSON.stringify({ tipo: "commit", texto: "integró algo" }),
        ];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: null, vitest: null });
    });
});