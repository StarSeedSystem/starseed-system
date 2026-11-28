import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
    puedeEditar,
    puedeVer,
    elegirTransporte,
    type Sala,
} from "@/lib/salas/sala";
import { fusionarEstados, type EstadoSala } from "@/lib/salas/sincronia-sala";

// Puerta de la guía de la skill `coop-qa` (CAP1119). No prueba el CLI original:
// prueba que la guía que lee el enjambre no miente, que su ejemplo se apoya en
// el código real de salas y que puede fallar (gemelo de mutación).

const RUTA_README = join(process.cwd(), ".agent", "skills", "coop-qa", "README.md");
const leerGuia = () => readFileSync(RUTA_README, "utf8");

/** Sala mínima de pruebas, con dueña y observadora. */
function sala(cambios: Partial<Sala> = {}): Sala {
    return {
        id: "sala-1",
        tipo: "pizarra",
        titulo: "Asamblea",
        visibilidad: "privada",
        transporte: "local",
        miembros: { "u-duena": "dueno", "u-observa": "observador" },
        creadaEn: 1_757_000_000_000,
        ...cambios,
    };
}

describe("skill coop-qa · reparación CAP1119", () => {
    it("objeción 2026-11-23 16:21:16 · el README existe, tiene título y no es un esqueleto", () => {
        expect(existsSync(RUTA_README)).toBe(true);
        const guia = leerGuia();
        expect(guia).toMatch(/^#\s.+/m);
        expect(guia.length).toBeGreaterThan(2000);
        expect(guia).toContain("cranebeaker/coop-anything");
        expect(guia).toContain("5b86e5b");
        expect(guia).toContain("MIT");
    });

    it("objeción 2026-11-23 · la nube la rechazó: el ejemplo se apoya en el código real", () => {
        const guia = leerGuia();
        for (const ruta of [
            "src/lib/salas/sala.ts",
            "src/lib/salas/sincronia-sala.ts",
            "src/lib/salas/propiedad-sala.ts",
        ]) {
            expect(guia).toContain(ruta);
        }
        for (const fn of [
            "puedeVer",
            "puedeEditar",
            "elegirTransporte",
            "fusionarEstados",
            "aceptarEscritura",
        ]) {
            expect(guia).toContain(fn);
        }
        expect(guia).toContain('from "@/lib/salas/sala"');
        expect(guia).toContain("bash scripts/enjambre/tsc-turno.sh");
        expect(guia).toContain("npx vitest run");
        expect(guia).toContain("next build");
    });

    it("objeción 2026-11-24 23:21:02 · otra ola la cerró: alcance único y reparación escrita", () => {
        const guia = leerGuia();
        expect(guia).toContain("2026-11-23 16:21:16");
        expect(guia).toContain("2026-11-24 23:21:02");
        expect(guia).toContain("Reparación CAP1119");
        expect(guia).toContain("rechazada");
        expect(guia).toContain("no la repito");
        expect(guia).toContain("coop-sync-testing");
        expect(guia).toContain("Gemelo de mutación");
    });
});

describe("skill coop-qa · el ejemplo corre y muerde", () => {
    it("ejecuta el mismo escenario del README contra el código real", () => {
        const s = sala();
        expect(puedeVer(s, "u-observa")).toBe(true);
        expect(puedeEditar(s, "u-duena")).toBe(true);
        expect(puedeEditar(s, "u-observa")).toBe(false);
        const d = elegirTransporte(s, {
            internet: false,
            servidorPrivado: false,
            malla: false,
        });
        expect(d.transporte).toBe("local");
        expect(d.motivo).toContain("NO se está sincronizando");
    });

    it("gemelo de mutación: un puedeEditar que deja pasar a tod@s rompe la prueba", () => {
        const mutante = () => true;
        const s = sala();
        expect(mutante()).toBe(true);
        expect(puedeEditar(s, "u-observa")).toBe(false);
        expect(() => expect(mutante()).toBe(puedeEditar(s, "u-observa"))).toThrow();
    });

    it("lag y pérdida: fusionarEstados es conmutativa e idempotente con lápidas", () => {
        const a: EstadoSala = {
            salaId: "s",
            reloj: 1,
            elementos: {
                n1: { id: "n1", tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "ana" },
            },
        };
        const b: EstadoSala = {
            salaId: "s",
            reloj: 2,
            elementos: {
                n1: { id: "n1", tipo: "nota", datos: {}, actualizadoEn: 2, porDispositivo: "bruno", borrado: true },
            },
        };
        const ab = fusionarEstados(a, b, "observadora");
        const ba = fusionarEstados(b, a, "observadora");
        expect(ab.resultado.elementos.n1.borrado).toBe(true);
        expect(JSON.stringify(ab.resultado)).toBe(JSON.stringify(ba.resultado));
        expect(fusionarEstados(ab.resultado, a, "observadora").resultado.elementos.n1.borrado).toBe(true);
    });

    it("el README no filtra secretos ni rutas del disco", () => {
        const guia = leerGuia();
        for (const patron of [
            /sk-[A-Za-z0-9]{8,}/,
            /nvapi-[A-Za-z0-9]+/,
            /AIza[0-9A-Za-z_-]{10,}/,
            /hf_[A-Za-z0-9]{10,}/,
        ]) {
            expect(guia).not.toMatch(patron);
        }
        expect(guia).not.toContain("/Users/");
    });
});
