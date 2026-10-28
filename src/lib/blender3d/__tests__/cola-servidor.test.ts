import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { _ponerDependencias, capacidades, conGuardia, encolarTrabajo, estadoDe, leerSalida, listarRecientes, raiz, type Lanzar } from "../cola-servidor";

const hayBlender = spawnSync("blender", ["--version"], { stdio: "ignore" }).status === 0;
const base = mkdtempSync(join(tmpdir(), "starseed-3d-"));
let caso = 0, lanzamientos: string[][] = [], opciones: unknown[] = [];

const cubo = (extra: Record<string, unknown> = {}) => ({
    v: 1, titulo: "Cubo de prueba", calidad: "borrador", ambito: "personal", origen: "estudio", quien: "persona",
    escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 }, { op: "camara", nombre: "cam", ubicacion: [0, -5, 2], mira_a: [0, 0, 0] }, { op: "luz", nombre: "sol", tipo: "sol", energia: 3 }],
    salidas: [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 8, motor: "workbench" }],
    ...extra,
});
const nuevaRaiz = () => { const r = join(base, `caso-${++caso}`); process.env.STARSEED_BLENDER_RAIZ = r; _ponerDependencias(null); return r; };
function deps(instalado = true): void {
    lanzamientos = []; opciones = [];
    const lanzar: Lanzar = (_b, args, o) => { lanzamientos.push(args); opciones.push(o); return { unref() { /* desacoplado */ } }; };
    _ponerDependencias({ ejecutar: async () => ({ stdout: JSON.stringify({ instalado, perfil: "estandar" }), stderr: "", code: 0 }), lanzar });
}

beforeEach(() => { _ponerDependencias(null); });
afterAll(() => { _ponerDependencias(null); delete process.env.STARSEED_BLENDER_RAIZ; rmSync(base, { recursive: true, force: true }); });

describe("encolarTrabajo · validación y confirmación", () => {
    it("rechaza un trabajo inválido con motivos y no escribe nada", async () => {
        const r = nuevaRaiz(); deps();
        const res = await encolarTrabajo({ ...cubo(), escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 0 }] });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.motivos?.join(" ")).toContain("número");
        expect(existsSync(r)).toBe(false);
    });
    it("un trabajo pesado sin confirmar pide confirmación humana y no escribe nada", async () => {
        const r = nuevaRaiz(); deps();
        const res = await encolarTrabajo(cubo({ calidad: "final" }));
        expect(res).toMatchObject({ ok: false, requiereConfirmacion: true });
        expect(existsSync(r)).toBe(false);
    });
    it("rechaza ids con .. o de largo equivocado sin leer fuera de la raíz", async () => {
        nuevaRaiz(); deps();
        for (const id of ["../../etc/passwd", "a".repeat(31), "a".repeat(33), "G".repeat(32)]) {
            expect(await estadoDe(id)).toBeNull();
            expect((await leerSalida(id, "salida-1.png")).ok).toBe(false);
        }
    });
    it("encola de verdad, guarda las entradas y ninguna respuesta lleva rutas absolutas", async () => {
        const r = nuevaRaiz(); deps();
        const conImportar = cubo({ escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 }, { op: "importar", archivo: "modelo.glb", nombre: "imp" }], ambito: "personal" });
        const res = await encolarTrabajo(conImportar, { "modelo.glb": new Uint8Array([103, 108, 84, 70]) }, true);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(existsSync(join(r, "cola", `${res.id}.json`))).toBe(true);
        expect(existsSync(join(r, "trabajos", res.id, "entradas", "modelo.glb"))).toBe(true);
        const estado = await estadoDe(res.id), lista = await listarRecientes();
        expect(estado?.estado).toBe("en_cola");
        expect(lista.map((e) => e.id)).toContain(res.id);
        const texto = JSON.stringify({ res, estado, lista, cap: await capacidades() });
        expect(texto).not.toContain(r);
        expect(texto).not.toContain(tmpdir());
        expect(texto).not.toContain(homedir());
    });
});

describe("capacidades · cerrojo · puerta", () => {
    it("capacidades() sin Blender devuelve null", async () => {
        nuevaRaiz(); deps(false);
        expect(await capacidades()).toBeNull();
    });
    it("no arranca un segundo ejecutor si el cerrojo está vivo, y sí cuando se suelta", async () => {
        const r = nuevaRaiz(); deps();
        mkdirSync(r, { recursive: true });
        writeFileSync(join(r, "ejecutor.lock"), String(process.pid));
        expect((await encolarTrabajo(cubo())).ok).toBe(true);
        expect(lanzamientos).toHaveLength(0);
        rmSync(join(r, "ejecutor.lock"));
        deps();
        process.env.STARSEED_BLENDER_RAIZ = r;
        expect((await encolarTrabajo(cubo())).ok).toBe(true);
        expect(lanzamientos).toHaveLength(1);
        expect(lanzamientos[0]).toEqual(["servicios/blender-3d/ejecutor.py", "--una-vez"]);
        expect(opciones[0]).toMatchObject({ detached: true, stdio: "ignore" });
    });
    it("la puerta devuelve el veto del guardián (simulado) sin tocar el disco", async () => {
        const r = nuevaRaiz();
        const veto = new Response(null, { status: 404 });
        expect(await conGuardia(new Request("http://localhost/api/3d/trabajos?capacidades=1"), async () => veto)).toBe(veto);
        expect(await conGuardia(new Request("http://localhost/api/3d/trabajos"), async () => null)).toBeNull();
        expect(raiz()).toBe(r);
        expect(existsSync(r)).toBe(false);
    });
});

describe.skipIf(!hayBlender)("punta a punta con Blender real", () => {
    it("un cubo llega a GLB y PNG de verdad", async () => {
        const r = nuevaRaiz(); _ponerDependencias(null);
        const res = await encolarTrabajo(cubo({ salidas: [{ tipo: "exportar_glb" }, { tipo: "render_png", ancho: 64, alto: 64, muestras: 8, motor: "workbench" }] }), undefined, true);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        let estado = await estadoDe(res.id);
        for (let i = 0; i < 240 && !["hecho", "error", "cancelado"].includes(estado?.estado ?? ""); i++) {
            await new Promise((listo) => setTimeout(listo, 500));
            estado = await estadoDe(res.id);
        }
        expect(estado?.estado).toBe("hecho");
        const dir = join(r, "trabajos", res.id, "salidas"), nombres = readdirSync(dir);
        const glb = nombres.find((n) => n.endsWith(".glb")), png = nombres.find((n) => n.endsWith(".png"));
        expect(glb).toBeTruthy(); expect(png).toBeTruthy();
        expect(readFileSync(join(dir, glb!)).subarray(0, 4).toString("latin1")).toBe("glTF");
        expect([...readFileSync(join(dir, png!)).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }, 180_000);
});
