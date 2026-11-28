/**
 * UNI1115M · costura a: lo que la web manda a cada comando nativo es lo que Rust espera. Falla si un lado se desvía.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMANDOS_NATIVOS } from "../nativo-comandos";

const raiz = join(__dirname, "..", "..", "..", "..");
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const RUST = ["native/src-tauri/src/control_entrada.rs", "native/src-tauri/src/control_pantalla.rs", "native/src-tauri/src/control_android.rs"].map(leer).join("\n");
const WEB = ["src/lib/control-remoto/pantalla-origen.ts", "src/lib/control-remoto/pantalla-destino.ts", "src/lib/control-remoto/nativo.ts"].map((f) => leer(f)).join("\n");

function argsDeRust(nombre: string): { args: string[]; snake: boolean } {
    const i = RUST.indexOf(`pub fn ${nombre}(`);
    expect(i, `${nombre} existe en Rust`).toBeGreaterThan(-1);
    const attr = RUST.slice(Math.max(0, i - 120), i);
    const firma = RUST.slice(i, RUST.indexOf(") ->", i));
    const todos = firma.slice(firma.indexOf("(") + 1).split(",").map((x) => x.trim().split(":")[0].trim()).filter(Boolean);
    return { args: todos.filter((a) => a !== "app" && a !== "webview"), snake: /rename_all\s*=\s*"snake_case"/.test(attr) };
}

/** Las claves del objeto que se pasa a `invocar("nombre", { … })` en la web (en cualquier archivo de la costura). */
function clavesDeLaWeb(nombre: string): string[][] {
    const salida: string[][] = [];
    const re = new RegExp(`["']${nombre}["']\\s*(?:,\\s*\\{([^}]*)\\})?\\s*\\)`, "g");
    for (const m of WEB.matchAll(re)) {
        const cuerpo = m[1];
        if (cuerpo === undefined) salida.push([]);
        else salida.push(cuerpo.split(",").map((p) => p.trim().split(":")[0].trim()).filter(Boolean));
    }
    return salida;
}

describe("costura a · comandos nativos: web y Rust dicen lo mismo", () => {
    for (const [nombre, args] of Object.entries(COMANDOS_NATIVOS)) {
        it(`${nombre}(${args.join(", ")})`, () => {
            const r = argsDeRust(nombre);
            expect(r.args).toEqual([...args]);
            expect(r.snake, "rename_all snake_case solo si algún argumento lleva «_»").toBe(args.some((a) => a.includes("_")));
            const usos = clavesDeLaWeb(nombre);
            for (const u of usos) expect([...u].sort()).toEqual([...args].sort().filter((a) => u.includes(a)));
            for (const u of usos) {
                // los argumentos opcionales en Rust (Option) pueden faltar; los demás tienen que estar
                const opcionales = new Set(["lado_max", "calidad", "desde", "fuente"]);
                for (const a of args) if (!opcionales.has(a)) expect(u, `${nombre} manda ${a}`).toContain(a);
            }
        });
    }
    it("cada comando que la web invoca está en la tabla", () => {
        const invocados = new Set([...WEB.matchAll(/["'](control_(?:capacidades|abrir_ajuste|pantalla_\w+|estado_aparato|entrada\w*))["']/g)].map((m) => m[1]));
        for (const c of invocados) expect(Object.keys(COMANDOS_NATIVOS), c).toContain(c);
    });
    it("los de Rust están registrados en lib.rs y en las capacidades", () => {
        const lib = leer("native/src-tauri/src/lib.rs");
        const caps = leer("native/src-tauri/capabilities/default.json");
        for (const c of Object.keys(COMANDOS_NATIVOS)) {
            expect(lib, `${c} en lib.rs`).toContain(c);
            expect(caps, `${c} en capabilities`).toContain(`"allow-${c.replace(/_/g, "-")}"`);
        }
    });
});

describe("comandos nativos fuera de la tabla del control (UNI1116B)", () => {
    // `banco_latido_activar` (PENA1) no es de `control_*`: la tabla de arriba es del seam del control y su prueba lee solo
    // control_entrada.rs y control_pantalla.rs. No se queda sin vigilar: se comprueba aquí que lib.rs, build.rs, la capability
    // y el inventario §4.8.1 lo nombran, y que lo que la web invoca existe en Rust.
    const FUERA = ["banco_latido_activar"];
    for (const c of FUERA) {
        it(`${c}: Rust, build.rs, capability, inventario y web`, () => {
            const permiso = `allow-${c.replace(/_/g, "-")}`;
            expect(leer("native/src-tauri/src/lib.rs"), "lib.rs").toContain(c);
            expect(leer("native/src-tauri/build.rs"), "build.rs").toContain(`"${c}"`);
            expect(leer("native/src-tauri/capabilities/default.json"), "capability").toContain(`"${permiso}"`);
            expect(leer("architecture/permisos-y-control-del-dispositivo.md"), "inventario §4.8.1").toContain(`\`${permiso}\``);
            expect(leer("native/src-tauri/src/banco_latido.rs"), "Rust").toMatch(new RegExp(`pub fn ${c}\\(app: tauri::AppHandle, webview: tauri::Webview, activo: bool\\)`));
            expect(leer("src/lib/banco-llamadas/app.ts"), "web").toContain(`"${c}", { activo:`);
        });
    }
});

describe("costuras b y d · la web y los vectores de Rust hablan igual", () => {
    it("el gesto firmado de los vectores de Rust pasa el vocabulario de la web (args en accion.args, dt_ms en el 3.er número)", async () => {
        const { ACCIONES } = await import("../niveles");
        const sobre = JSON.parse(leer("native/src-tauri/src/control_entrada_vectores/gesto.json")) as { carga: string };
        const carga = JSON.parse(Buffer.from(sobre.carga, "base64url").toString("utf8")) as { accion: { nombre: string; args: Record<string, unknown> } };
        expect(carga.accion.nombre).toBe("gesto");
        const v = ACCIONES.gesto.validar(carga.accion.args);
        expect(v).not.toBeNull();
        const puntos = (carga.accion.args.dedos as { puntos: number[][] }[])[0].puntos;
        for (const p of puntos) expect(p).toHaveLength(3);
    });
    it("calidad: entero 1..100 en la web (lo nativo recibe un u32)", () => {
        expect(ACCIONES_CALIDAD()).toBe(true);
    });
});

function ACCIONES_CALIDAD(): boolean {
    return /entero\(a\.calidad, 1, 100\)/.test(leer("src/lib/control-remoto/niveles.ts")) && /calidad: Option<u32>/.test(RUST);
}
