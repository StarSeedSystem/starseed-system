// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, readdir, unlink, utimes, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { leerColasCompletas } from "@/lib/mando/colas";
import { raizDelProyecto } from "@/lib/mando/raiz";

const RAIZ = raizDelProyecto();
const OLAS = path.join(RAIZ, "starseed_memory_root", "olas");

function colaValida(n: number) {
    return [
        { id: `T${n}A`, ola: "Ola 1105", titulo: `Tarea ${n}A`, prompt: "prompt suficientemente largo para validar", archivos: ["a.ts"], depende: [] },
        { id: `T${n}B`, ola: "Ola 1105", titulo: `Tarea ${n}B`, prompt: "prompt suficientemente largo para validar", archivos: ["b.ts"], depende: [`T${n}A`] },
    ];
}

async function escribirCola(nombre: string, tareas: unknown[]) {
    await mkdir(OLAS, { recursive: true });
    await writeFile(path.join(OLAS, `cola-${nombre}.json`), JSON.stringify(tareas, null, 2) + "\n", "utf-8");
}

async function limpiarColasPrueba() {
    try {
        const entradas = await readdir(OLAS);
        for (const e of entradas) {
            if (e.startsWith("cola-prueba-1105-") && e.endsWith(".json")) {
                await unlink(path.join(OLAS, e));
            }
        }
    } catch {}
}

async function borrarCola(nombre: string) {
    await unlink(path.join(OLAS, `cola-${nombre}.json`)).catch(() => {});
}

async function cambiarMtime(nombre: string) {
    const ahora = Date.now();
    await utimes(path.join(OLAS, `cola-${nombre}.json`), ahora / 1000, (ahora + 1000) / 1000);
}

describe("leerColasCompletas · caché por mtime+size (SUP0511C)", () => {
    beforeEach(async () => {
        await limpiarColasPrueba();
    });

    afterEach(async () => {
        await limpiarColasPrueba();
    });

    it("(a) dos llamadas seguidas sin cambios: en la segunda no se vuelve a leer el archivo (mtime inalterado)", async () => {
        const nombre = `prueba-1105-a-${Date.now()}`;
        await escribirCola(nombre, colaValida(1));

        // Primera llamada
        const r1 = await leerColasCompletas();
        const c1 = r1.find((c) => c.nombre === nombre);
        expect(c1).toBeDefined();
        expect(c1?.tareas).toHaveLength(2);

        // Capturar mtime antes de la segunda llamada
        const ruta = path.join(OLAS, `cola-${nombre}.json`);
        const infoAntes = await stat(ruta);

        // Segunda llamada
        const r2 = await leerColasCompletas();
        const c2 = r2.find((c) => c.nombre === nombre);
        expect(c2).toBeDefined();
        expect(c2?.tareas).toHaveLength(2);

        // Verificar que el mtime no cambió (archivo no se releyó)
        const infoDespues = await stat(ruta);
        expect(infoDespues.mtimeMs).toBe(infoAntes.mtimeMs);
    });

    it("(b) tras reescribir una cola con otro contenido (y utimes a otra hora), la siguiente llamada la relee y devuelve lo nuevo", async () => {
        const nombre = `prueba-1105-b-${Date.now()}`;
        await escribirCola(nombre, colaValida(1));

        // Primera lectura
        const r1 = await leerColasCompletas();
        const c1 = r1.find((c) => c.nombre === nombre);
        expect(c1?.tareas[0].id).toBe("T1A");

        // Reescribir con contenido diferente y cambiar mtime
        const nuevasTareas = [
            { id: "NUEVA1", ola: "Ola 1105", titulo: "Nueva tarea", prompt: "prompt suficientemente largo para validar", archivos: ["x.ts"], depende: [] },
        ];
        await writeFile(path.join(OLAS, `cola-${nombre}.json`), JSON.stringify(nuevasTareas, null, 2) + "\n", "utf-8");
        await cambiarMtime(nombre);

        // Segunda lectura debe traer lo nuevo
        const r2 = await leerColasCompletas();
        const c2 = r2.find((c) => c.nombre === nombre);
        expect(c2).toBeDefined();
        expect(c2?.tareas[0].id).toBe("NUEVA1");
    });

    it("(c) mutar lo devuelto (colas[i].tareas.push, tareas[0].archivos.push) no cambia lo que devuelve la siguiente llamada", async () => {
        const nombre = `prueba-1105-c-${Date.now()}`;
        await escribirCola(nombre, colaValida(1));

        // Primera lectura
        const r1 = await leerColasCompletas();
        const c1 = r1.find((c) => c.nombre === nombre);
        expect(c1).toBeDefined();

        // Mutar lo devuelto
        c1!.tareas.push({ id: "INYECTADA", ola: "Ola 1105", titulo: "Inyectada", prompt: "prompt largo", archivos: [], depende: [] });
        c1!.tareas[0].archivos.push("inyectado.ts");

        // Segunda lectura debe devolver lo original (sin mutaciones)
        const r2 = await leerColasCompletas();
        const c2 = r2.find((c) => c.nombre === nombre);
        expect(c2).toBeDefined();
        expect(c2?.tareas).toHaveLength(2); // original era 2, no 3
        expect(c2?.tareas[0].archivos).toEqual(["a.ts"]); // original, sin "inyectado.ts"
        expect(c2?.tareas.map((t) => t.id)).toEqual(["T1A", "T1B"]);
    });

    it("(d) una cola quitada del directorio desaparece del resultado", async () => {
        const nombre = `prueba-1105-d-${Date.now()}`;
        await escribirCola(nombre, colaValida(1));

        // Primera lectura: la cola existe
        const r1 = await leerColasCompletas();
        const c1 = r1.find((c) => c.nombre === nombre);
        expect(c1).toBeDefined();

        // Borrar el archivo
        await borrarCola(nombre);

        // Segunda lectura: la cola ya no debe aparecer
        const r2 = await leerColasCompletas();
        const c2 = r2.find((c) => c.nombre === nombre);
        expect(c2).toBeUndefined();
    });
});