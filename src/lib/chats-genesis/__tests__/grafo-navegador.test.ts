/**
 * Ningún `node:*` (ni módulo de Node sin prefijo) en el grafo de navegador de los chats de Genesis.
 * Recorre los imports estáticos y dinámicos desde los cuatro módulos, siguiendo `@/` y rutas
 * relativas dentro de `src/`; los paquetes de npm se miran solo por su nombre.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const SRC = path.join(__dirname, "..", "..", "..");
const RAICES = ["tipos.ts", "puerta-chats.ts", "vinculos.ts", "estado-espejo.ts"].map((f) => path.join(SRC, "lib", "chats-genesis", f));
const DE_NODE = new Set(builtinModules.flatMap((m) => [m, m.split("/")[0]]));
const IMPORTS = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

function resolver(desde: string, esp: string): string | null {
    const base = esp.startsWith("@/") ? path.join(SRC, esp.slice(2)) : esp.startsWith(".") ? path.resolve(path.dirname(desde), esp) : null;
    if (!base) return null;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
        if (existsSync(cand) && !cand.endsWith(path.sep) && /\.tsx?$/.test(cand)) return cand;
    }
    return null;
}

function grafo(): { archivos: Set<string>; paquetes: Map<string, string> } {
    const archivos = new Set<string>();
    const paquetes = new Map<string, string>();
    const pendientes = [...RAICES];
    while (pendientes.length) {
        const f = pendientes.pop()!;
        if (archivos.has(f)) continue;
        archivos.add(f);
        const codigo = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const m of codigo.matchAll(IMPORTS)) {
            const esp = m[1] ?? m[2] ?? m[3];
            const local = resolver(f, esp);
            if (local) pendientes.push(local);
            else if (!esp.startsWith("@/") && !esp.startsWith(".")) paquetes.set(esp, path.relative(SRC, f));
        }
    }
    return { archivos, paquetes };
}

describe("chats de Genesis · grafo del navegador", () => {
    it("ningún archivo alcanzable importa node:* ni un módulo de Node", () => {
        const { archivos, paquetes } = grafo();
        // Recorre de verdad: llega al adaptador de la puerta y, por los imports dinámicos, al cliente de Supabase.
        const rel = new Set([...archivos].map((f) => path.relative(SRC, f).split(path.sep).join("/")));
        expect(rel.has("lib/datos/puerta-a1.ts")).toBe(true);
        expect(rel.has("utils/supabase/client.ts")).toBe(true);
        expect(rel.has("lib/sync/user-prefs.ts")).toBe(true);
        const malos = [...paquetes].filter(([p]) => p.startsWith("node:") || DE_NODE.has(p) || DE_NODE.has(p.split("/")[0]));
        expect(malos.map(([p, f]) => `${f} → ${p}`)).toEqual([]);
    });

    it("la prueba detecta un import de Node (control)", () => {
        const texto = 'import { readFileSync } from "node:fs";\nconst x = await import("path");';
        const encontrados = [...texto.matchAll(IMPORTS)].map((m) => m[1] ?? m[2] ?? m[3]);
        expect(encontrados).toEqual(["node:fs", "path"]);
        expect(encontrados.every((p) => p.startsWith("node:") || DE_NODE.has(p))).toBe(true);
    });
});
