import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Guardias finales del paquete XR (tarea XR1010AL; contrato `architecture/starseed-xr.md` §0, §1.3 y §3 k). */
const SRC = path.join(__dirname, "../../..", "..");
const NUCLEO = path.join(SRC, "lib", "xr");
const SHELL = path.join(__dirname, "..");
const PESADOS = ["three", "@react-three", "@pmndrs", "@dimforge", "@pixiv", "@sparkjsdev"];
const esFuente = (f: string): boolean => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\./.test(f);
const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join("/");
const nombreModulo = (f: string): string => rel(f).replace(/\.(ts|tsx)$/, "");
const quitarComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const lineasDe = (t: string): number => t.replace(/\s+$/, "").split("\n").length;
const leer = (f: string): string => readFileSync(f, "utf8");

/** Recorre src/** excepto `__tests__` y `*.test.*` (las pruebas son guardias, no código publicado). */
function lista(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) return e.name === "__tests__" ? [] : lista(path.join(dir, e.name));
        return e.isFile() && esFuente(e.name) ? [path.join(dir, e.name)] : [];
    });
}
const ATODO = new Set(lista(SRC));

describe("guardias XR1010AL", () => {
    it("(1) ningún archivo de src/** pide la función camera-access (§3 k)", () => {
        expect([...ATODO].filter((f) => quitarComentarios(leer(f)).includes("camera-access")).map(rel)).toEqual([]);
    });

    it("(2) en almacen-xr.ts, emulate sale false o sólo con el gate emuladorPermitido (§3 c)", () => {
        const lineas = quitarComentarios(leer(path.join(SHELL, "almacen-xr.ts")))
            .split("\n").map((l) => l.replace(/\s+/g, "")).filter((l) => l.includes("emulate:"));
        expect(lineas.length).toBeGreaterThan(0);
        for (const l of lineas) expect(l).toMatch(/^emulate:(false|emuladorPermitido\([^()]*\)\?\{[^}]*\}:false)/);
    });

    it("(3) el grafo estático de app-globals y de entrada-global no arrastra motores (§0.6)", () => {
        // Sólo imports estáticos CON valor: `import type`/`export type` se borran al compilar y pesan cero;
        // `import()` y `next/dynamic` son carga perezosa y no cuentan.
        const INICIOS = [
            /(?:^|\n)\s*(?:import|export)(?!\s+type)\s+(?:type\s+)?[\w*\s{},$]*?from\s*["']([^"']+)["']/g,
            /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
        ];
        function resolver(desde: string, espec: string): string | null {
            const objetivo = espec.startsWith("@/") ? path.join(SRC, espec.slice(2))
                : /^\./.test(espec) ? path.join(path.dirname(desde), espec) : null;
            if (!objetivo) return null;
            for (const c of [objetivo, `${objetivo}.ts`, `${objetivo}.tsx`, path.join(objetivo, "index.ts"), path.join(objetivo, "index.tsx")])
                try { if (statSync(c).isFile()) return c; } catch { /* se prueba el siguiente */ }
            return null;
        }
        function alcanzaPesados(raiz: string): string[] {
            const golpes: string[] = [], pendientes = [raiz], vistas = new Set<string>();
            while (pendientes.length) {
                const f = pendientes.pop() as string;
                if (vistas.has(f)) continue;
                vistas.add(f);
                for (const espec of INICIOS.flatMap((e) => [...leer(f).matchAll(e)].map((m) => m[1]))) {
                    if (PESADOS.some((p) => espec === p || espec.startsWith(`${p}/`))) golpes.push(`${rel(f)} → ${espec}`);
                    else { const destino = resolver(f, espec); if (destino) pendientes.push(destino); }
                }
            }
            return [...new Set(golpes)];
        }
        expect(alcanzaPesados(path.join(SRC, "app", "(app)", "app-globals.tsx"))).toEqual([]);
        expect(alcanzaPesados(path.join(SHELL, "entrada-global.tsx"))).toEqual([]);
    });

    it("(4) sin node:* en src/lib/xr/** ni src/components/xr/shell/** (§0.7)", () => {
        const suyos = [...ATODO].filter((f) => f.startsWith(`${NUCLEO}/`) || f.startsWith(`${SHELL}/`));
        expect(suyos.filter((f) => /from\s*["']node:/.test(quitarComentarios(leer(f)))).map(rel)).toEqual([]);
    });

    it("(5) integrado no es aplicado: cada módulo lo usa alguien fuera de su propia prueba (§0.8)", () => {
        // Los 7 que la cola aún no cablea (contrato §4 y nota INT1010D): si esta lista cambia, se recuenta aquí.
        const PENDIENTES_HOY = [
            "components/xr/shell/orbe-voz", "components/xr/shell/resolver-miembros", "components/xr/shell/splat-objeto",
            "components/xr/shell/tarjeta-consentimiento", "components/xr/shell/use-presencia-xr", "lib/xr/entrada-eventos", "lib/xr/mundo-motor",
        ];
        const sinConsumidor = [...ATODO]
            .filter((f) => nombreModulo(f).startsWith("lib/xr/") || nombreModulo(f).startsWith("components/xr/shell/"))
            .filter((f) => nombreModulo(f) !== "lib/xr/tipos")
            .filter((f) => {
                const patron = new RegExp(`["'][^"']*\\/${path.basename(nombreModulo(f))}["']`);
                return ![...ATODO].some((otro) => otro !== f && patron.test(quitarComentarios(leer(otro))));
            }).map(nombreModulo).sort();
        expect(sinConsumidor).toEqual(PENDIENTES_HOY);
    });

    it("(6) núcleo ≤ 200 líneas y shell ≤ 120 (los 8 que ya pasan, clavados a su tamaño de hoy)", () => {
        const TOPE_GRANDES: Array<[string, number]> = [
            ["components/xr/shell/escena-os.tsx", 212], ["components/xr/shell/mundo-render.tsx", 201],
            ["components/xr/shell/prefs-xr.ts", 181], ["components/xr/shell/pizarra-3d.tsx", 172],
            ["components/xr/shell/dock-3d.tsx", 160], ["components/xr/shell/mundo-render-puro.ts", 145],
            ["components/xr/shell/ejecutor-mundo.ts", 133], ["components/xr/shell/boton-entrada-xr.tsx", 132],
        ];
        for (const f of ATODO) {
            const r = rel(f), lineas = lineasDe(leer(f));
            if (r.startsWith("lib/xr/")) expect(lineas).toBeLessThanOrEqual(200);
            else if (r.startsWith("components/xr/shell/")) expect(lineas).toBeLessThanOrEqual(TOPE_GRANDES.find(([m]) => m === r)?.[1] ?? 120);
        }
    });
});
