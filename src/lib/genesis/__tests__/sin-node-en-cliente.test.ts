/**
 * Puerta (2026-10-10): lo que el navegador carga desde /genesis, /poligenesis y /metagenesis
 * no puede llegar a módulos de Node. A diferencia de la puerta de src/lib/mando/__tests__
 * (que sigue solo imports estáticos), esta también sigue los `import("…")` dinámicos: desde
 * hoy la consola de MetaGenesis se carga a demanda desde el selector de niveles, y un import
 * dinámico va igual al paquete del navegador. `import type` no cuenta.
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
    const estaticos = /(?:^|\n)\s*(import|export)\s+(type\s+)?[^'";]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = estaticos.exec(codigo)) !== null) {
        if (m[2]) continue;
        const esp = m[3] ?? m[4];
        if (esp) fuera.push(esp);
    }
    const dinamicos = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
    while ((m = dinamicos.exec(codigo)) !== null) fuera.push(m[1]);
    return fuera;
}

function recorrer(pagina: string): { problemas: string[]; clientes: number } {
    const raiz = path.join(SRC, "app", "(app)", pagina, "page.tsx");
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
    return { problemas, clientes };
}

describe("Genesis en el navegador sin módulos de Node (también lo dinámico)", () => {
    for (const pagina of ["genesis", "poligenesis", "metagenesis"]) {
        it(`/${pagina}`, () => {
            const { problemas, clientes } = recorrer(pagina);
            expect(clientes).toBeGreaterThan(0);
            expect(problemas).toEqual([]);
        });
    }

    it("desde /genesis se sigue llegando a la consola de MetaGenesis (carga perezosa)", () => {
        const sel = readFileSync(path.join(SRC, "components", "genesis", "selector-nivel.tsx"), "utf8");
        expect(sel).toMatch(/import\("\.\/consola-metagenesis"\)/);
        const consola = readFileSync(path.join(SRC, "components", "genesis", "consola-metagenesis.tsx"), "utf8");
        expect(consola).toMatch(/components\/mando\/centro-mando/);
    });
});
