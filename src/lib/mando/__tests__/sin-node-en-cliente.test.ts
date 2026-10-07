/**
 * Puerta (2026-10-06): nada de lo que importa un componente de cliente de Genesis puede
 * importar módulos de Node. MC1007G hizo que `medidores.ts` (que acaba en el bundle de
 * `centro-mando.tsx`) importara `creditos-pago.ts`, que leía el disco con `node:fs`: tsc y
 * vitest pasaron y `next build` falló («UnhandledSchemeError: node:fs»). Genesis dejó de
 * poder reconstruirse sin que ninguna puerta lo viera. Esta prueba recorre el grafo de
 * importaciones desde la página /mando y falla si algo que va al navegador (lo que cuelga
 * de un «use client») importa un módulo de Node. `import type` no cuenta.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, "src");
const NODE = /^(node:|fs$|fs\/|os$|path$|child_process$|net$|tls$|crypto$|worker_threads$)/;

function resolver(desde: string, esp: string): string | null {
    let base: string | null = null;
    if (esp.startsWith("@/")) base = path.join(SRC, esp.slice(2));
    else if (esp.startsWith(".")) base = path.resolve(path.dirname(desde), esp);
    if (!base) return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
        if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
}

function importaciones(codigo: string): string[] {
    const fuera: string[] = [];
    const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?[^'";]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(codigo)) !== null) {
        if (m[2]) continue; // import type / export type
        const esp = m[3] ?? m[4];
        if (esp) fuera.push(esp);
    }
    return fuera;
}

describe("código de cliente de Genesis sin módulos de Node", () => {
    it("lo que el navegador carga desde /mando no llega a node:*", () => {
        // Desde la página de Genesis: todo lo que cuelga de un archivo «use client» va al
        // bundle del navegador (lo de antes puede ser componente de servidor y sí usa Node).
        const raiz = path.join(SRC, "app", "(app)", "genesis", "page.tsx");
        expect(existsSync(raiz)).toBe(true);
        const problemas: string[] = [];
        const vistos = new Set<string>();
        const pila: [string, boolean, string[]][] = [[raiz, false, [path.relative(RAIZ, raiz)]]];
        let clientes = 0;
        while (pila.length) {
            const [archivo, enCliente, camino] = pila.pop()!;
            const codigo = readFileSync(archivo, "utf8");
            const cliente = enCliente || /^\s*["']use client["']/.test(codigo);
            const clave = `${archivo}|${cliente}`;
            if (vistos.has(clave)) continue;
            vistos.add(clave);
            if (cliente) clientes += 1;
            for (const esp of importaciones(codigo)) {
                if (NODE.test(esp)) {
                    if (cliente) problemas.push(`${camino.join(" → ")} importa ${esp}`);
                    continue;
                }
                const r = resolver(archivo, esp);
                if (r && r.startsWith(SRC)) pila.push([r, cliente, [...camino, path.relative(RAIZ, r)]]);
            }
        }
        expect(clientes).toBeGreaterThan(0);
        expect(problemas).toEqual([]);
    });
});
