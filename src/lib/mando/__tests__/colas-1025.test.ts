import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { validarCola } from "@/lib/mando/colas";

/**
 * Ola 1025R: las colas que dejan los cinco grupos de la tanda de repos (agentes, capas, diseño, infra,
 * investigación), la de Cloudflare Computer y las de Blender y ArtCraft/Rare. Es lo que lanzará el enjambre,
 * así que se valida con la MISMA función que el Diseñador de olas (`validarCola`) y con las reglas de la casa:
 * ids únicos entre todas las colas vivas (CLAUDE.md, trampa 2), dependencias dentro de su cola y ≤ 3 archivos por tarea.
 */
const RAIZ = path.resolve(__dirname, "../../../..");
const OLAS = path.join(RAIZ, "starseed_memory_root", "olas");

const GRUPOS = ["agentes", "artcraft", "blender", "capas", "cloudflare", "diseno", "infra", "investigacion", "libreria"] as const;
const TAREAS_ESPERADAS: Record<(typeof GRUPOS)[number], number> = {
    agentes: 5, artcraft: 12, blender: 10, capas: 10, cloudflare: 2, diseno: 9, infra: 10, investigacion: 17, libreria: 2,
};

interface Tarea { id: string; ola: string; titulo: string; archivos: string[]; depende: string[]; prompt: string }

function leer(grupo: string): Tarea[] {
    return JSON.parse(readFileSync(path.join(OLAS, `cola-${grupo}-1025.json`), "utf8")) as Tarea[];
}

describe("colas de la Ola 1025R", () => {
    it("están las nueve colas, con el número de tareas que dejaron sus grupos", () => {
        for (const g of GRUPOS) {
            expect(existsSync(path.join(OLAS, `cola-${g}-1025.json`)), g).toBe(true);
            expect(leer(g), g).toHaveLength(TAREAS_ESPERADAS[g]);
        }
    });

    it.each(GRUPOS)("«%s» pasa el validador del Diseñador de olas sin errores ni avisos", (g) => {
        const r = validarCola(`1025-${g}`, leer(g));
        expect(r.errores).toEqual([]);
        expect(r.avisos).toEqual([]);
        expect(r.tareas.length).toBe(TAREAS_ESPERADAS[g]);
    });

    it("ningún id se repite entre las colas de la ola (y no hay ninguna cola 1025 de más en la carpeta)", () => {
        // Solo las `*-1025.json`: la carpeta viva del enjambre cambia y no es de esta ola (el cierre lo comprueba al integrar).
        const vistos = new Map<string, string>();
        const archivos = readdirSync(OLAS).filter((x) => /^cola-.*-1025\.json$/.test(x));
        expect(archivos.sort()).toEqual(GRUPOS.map((g) => `cola-${g}-1025.json`));
        for (const f of archivos) {
            const datos: unknown = JSON.parse(readFileSync(path.join(OLAS, f), "utf8"));
            const tareas = Array.isArray(datos) ? (datos as { id?: string }[]) : [];
            for (const t of tareas) {
                if (!t.id) continue;
                expect(vistos.get(t.id), `${t.id} está en ${f} y en ${vistos.get(t.id)}`).toBeUndefined();
                vistos.set(t.id, f);
            }
        }
        expect(vistos.size).toBe(77);
    });

    it("cada tarea trae su ola y cada tarea de las cinco colas nuevas cita el contrato final", () => {
        for (const g of GRUPOS) {
            for (const t of leer(g)) {
                expect(t.ola.length, t.id).toBeGreaterThan(10);
                if (["agentes", "capas", "diseno", "infra", "investigacion", "cloudflare", "libreria"].includes(g)) {
                    expect(t.prompt, t.id).toContain("architecture/repos-libreria-1025.md");
                }
            }
        }
        expect(existsSync(path.join(RAIZ, "architecture", "repos-libreria-1025.md"))).toBe(true);
    });

    it("las tareas de colas distintas que editan el mismo archivo se avisan entre sí", () => {
        const dueno = new Map<string, { id: string; prompt: string; cola: string }[]>();
        for (const g of GRUPOS) {
            for (const t of leer(g)) {
                for (const a of t.archivos) dueno.set(a, [...(dueno.get(a) ?? []), { id: t.id, prompt: t.prompt, cola: g }]);
            }
        }
        for (const [archivo, tareas] of dueno) {
            if (new Set(tareas.map((t) => t.cola)).size < 2) continue;
            for (const t of tareas) expect(t.prompt, `${t.id} edita ${archivo} con otra cola`).toContain("COORDINACIÓN ENTRE COLAS");
        }
    });

    it("las skills del contrato existen donde los agentes las buscan (.agent/skills) y las de diseño también en vendor/habilidades", () => {
        for (const s of ["agent-reach", "inbox-zero", "coop-qa", "coop-sync-testing", "spacedrive-cli", "design-taste-frontend", "frontend-slides", "awesome-design-md"]) {
            // `inbox-zero` trae sus dos SKILL.md en subcarpetas (`mcp/` y `api/`); las demás, uno en la raíz.
            const habilidad = s === "inbox-zero" ? path.join("mcp", "SKILL.md") : "SKILL.md";
            expect(existsSync(path.join(RAIZ, ".agent", "skills", s, habilidad)), s).toBe(true);
            expect(existsSync(path.join(RAIZ, ".agent", "skills", s, "LICENSE")), `${s}: falta su LICENSE`).toBe(true);
        }
        for (const s of ["design-taste-frontend", "frontend-slides", "awesome-design-md"]) {
            expect(existsSync(path.join(RAIZ, "vendor", "habilidades", s, "SKILL.md")), s).toBe(true);
        }
        expect(existsSync(path.join(RAIZ, "config", "educacion-ossu.json"))).toBe(true);
    });
});
