import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardias finales del paquete XR (XR1010AL · contrato `architecture/starseed-xr.md` §0, §1.3 y §3 k).
 * Lee el código fuente: pruebas de node, sin red, sin WebGL y sin lanzar procesos.
 */
const RAIZ = path.resolve(__dirname, "../../../../..");
const SRC = path.join(RAIZ, "src");
const MOTORES = [/^three($|\/)/, /^@react-three\//, /^@pmndrs\//, /^@dimforge\//, /^@pixiv\//, /^@sparkjsdev\//];
const PENDIENTES = [
    "src/components/xr/shell/orbe-voz.tsx", "src/components/xr/shell/resolver-miembros.ts",
    "src/components/xr/shell/splat-objeto.tsx", "src/components/xr/shell/tarjeta-consentimiento.tsx",
    "src/components/xr/shell/use-presencia-xr.ts", "src/lib/xr/entrada-eventos.ts", "src/lib/xr/mundo-motor.ts",
].sort();
const GRANDES = [
    "src/components/xr/shell/boton-entrada-xr.tsx", "src/components/xr/shell/dock-3d.tsx",
    "src/components/xr/shell/ejecutor-mundo.ts", "src/components/xr/shell/escena-os.tsx",
    "src/components/xr/shell/mundo-render-puro.ts", "src/components/xr/shell/mundo-render.tsx",
    "src/components/xr/shell/pizarra-3d.tsx", "src/components/xr/shell/prefs-xr.ts",
].sort();

const esPrueba = (f: string) => /__tests__[\\/]|\.test\.[tj]sx?$/.test(f);
const leer = (f: string) => readFileSync(f, "utf8");
const contar = (f: string) => leer(f).replace(/\n$/, "").split("\n").length;
const rel = (f: string) => path.relative(RAIZ, f).split(path.sep).join("/");
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n);
        return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
}
function especificadores(s: string, dinamicos = true): string[] {
    const t = sinComentarios(s).replace(/^\s*(?:import|export)\s+type\s[\s\S]*?from\s*["'][^"']+["'];?/gm, "");
    const out: string[] = [];
    for (const re of [/from\s+["']([^"']+)["']/g, /(?:^|\n)\s*import\s+["']([^"']+)["']/g]) {
        for (const m of t.matchAll(re)) out.push(m[1]);
    }
    if (dinamicos) for (const m of t.matchAll(/(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
    return out;
}
function resolver(spec: string, desde: string): string | null {
    const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(desde), spec) : null;
    if (!base) return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
        try { if (statSync(c).isFile()) return c; } catch { /* no existe */ }
    }
    return null;
}

describe("guardias del paquete XR", () => {
    it("(1) ningún archivo de src pide camera-access (fuera de pruebas y comentarios)", () => {
        const malos = archivos(SRC).filter((f) => !esPrueba(f) && /camera-access/.test(sinComentarios(leer(f))));
        expect(malos.map(rel)).toEqual([]);
    });

    it("(2) emulate solo vive en almacen-xr.ts y queda apagado fuera de desarrollo", () => {
        const src = sinComentarios(leer(path.join(SRC, "components/xr/shell/almacen-xr.ts")));
        expect(src.match(/\bemulate\s*:/g)).toHaveLength(1);
        expect(src).toMatch(/emulate\s*:\s*emuladorPermitido\([^)]*\)\s*\?[\s\S]{0,90}?:\s*false/);
        expect(src).toMatch(/function emuladorPermitido[\s\S]{0,240}?!produccion[\s\S]{0,120}?=== "1"/);
    });

    it("(3) la entrada XR montada por app-globals no arrastra motores pesados", () => {
        const globals = leer(path.join(SRC, "app/(app)/app-globals.tsx"));
        expect(globals).toMatch(/import\(\s*["']@\/components\/xr\/shell\/entrada-global["']\s*\)/);
        const vistos = new Set<string>(), pila = [path.join(SRC, "components/xr/shell/entrada-global.tsx")], golpes: string[] = [];
        while (pila.length) {
            const f = pila.pop()!;
            if (vistos.has(f)) continue;
            vistos.add(f);
            for (const spec of especificadores(leer(f), false)) {
                if (MOTORES.some((r) => r.test(spec))) golpes.push(`${rel(f)} → ${spec}`);
                const r = resolver(spec, f);
                if (r) pila.push(r);
            }
        }
        expect(golpes).toEqual([]);
        expect(vistos.size).toBeGreaterThanOrEqual(5);
    });

    it("(4) el código XR de cliente no importa node:*", () => {
        const malos = [path.join(SRC, "lib/xr"), path.join(SRC, "components/xr/shell")]
            .flatMap(archivos).filter((f) => !esPrueba(f) && /(?:from|import|require)\s*\(?\s*["']node:/.test(sinComentarios(leer(f))));
        expect(malos.map(rel)).toEqual([]);
    });

    it("(5) cada módulo se usa fuera de su prueba o consta como pendiente de cableado", () => {
        const importadores = new Set<string>();
        for (const f of archivos(SRC).filter((f) => !esPrueba(f))) {
            for (const spec of especificadores(leer(f))) { const r = resolver(spec, f); if (r) importadores.add(r); }
        }
        const modulos = [...archivos(path.join(SRC, "components/xr/shell")), ...archivos(path.join(SRC, "lib/xr"))]
            .filter((f) => !esPrueba(f) && path.basename(f) !== "tipos.ts");
        const sueltos = modulos.filter((f) => !importadores.has(f)).map(rel).sort();
        expect(sueltos).toEqual(PENDIENTES);
    });

    it("(6) el núcleo no pasa de 200 líneas y ningún shell nuevo pasa de 120", () => {
        const lib = archivos(path.join(SRC, "lib/xr")).filter((f) => !esPrueba(f) && contar(f) > 200).map(rel);
        const shell = archivos(path.join(SRC, "components/xr/shell")).filter((f) => !esPrueba(f) && contar(f) > 120).map(rel).sort();
        expect(lib).toEqual([]);
        expect(shell).toEqual(GRANDES);
    });
});
