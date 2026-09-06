/**
 * Prueba de regresión (Ola 254 · 2026-09-06): una sola puerta para `/api/mando/*`.
 *
 * Cada ruta del mando debe pasar por `guardianMando` de `@/lib/mando/guardian`:
 * la puerta duplicada (función local `mandoHabilitado` + bloque
 * `createClient()/auth.getUser()`) exigía sesión incluso en `next start` local,
 * dejando el Puente de Mando apagado justo donde tiene que usarse. Este test
 * recorre TODOS los `route.ts` de `src/app/api/mando` y comprueba que ninguno
 * reintroduce la puerta vieja y que todos usan el guardián común. Así ninguna
 * ruta nueva vuelve a duplicarla.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Raíz de las rutas del mando (recorrido recursivo). */
const RAIZ_MANDO = path.join(process.cwd(), "src", "app", "api", "mando");

/** Recorre recursivamente y devuelve todas las rutas absolutas de `route.ts`. */
function rutasDelMando(directorio: string): string[] {
    const salida: string[] = [];
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
        const ruta = path.join(directorio, entrada.name);
        if (entrada.isDirectory()) salida.push(...rutasDelMando(ruta));
        else if (entrada.isFile() && entrada.name === "route.ts") salida.push(ruta);
    }
    return salida;
}

describe("puerta única de /api/mando/*", () => {
    const rutas = rutasDelMando(RAIZ_MANDO);

    it("descubre al menos las rutas existentes del mando", () => {
        // Guarda de cordura: si este número fuese 0, el test no probaría nada.
        expect(rutas.length).toBeGreaterThanOrEqual(10);
    });

    for (const ruta of rutas) {
        const relativa = path.relative(process.cwd(), ruta);

        it(`${relativa} usa guardianMando y no duplica la puerta`, () => {
            const codigo = fs.readFileSync(ruta, "utf8");
            expect(codigo.includes("Necesitas iniciar sesi")).toBe(false);
            expect(codigo.includes("function mandoHabilitado(")).toBe(false);
            expect(codigo).toContain("guardianMando");
            expect(codigo).toMatch(/from\s+["']@\/lib\/mando\/guardian["']/);
        });
    }
});
