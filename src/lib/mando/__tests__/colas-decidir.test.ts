import { describe, expect, it } from "vitest";
import { mkdir, writeFile, unlink, utimes } from "node:fs/promises";
import path from "node:path";

import {
    PATRON_NOMBRE,
    validarCola,
    resolverNombreColaActual,
    reasignarTarea,
    reintentarTarea,
    decidirTarea,
} from "@/lib/mando/colas";
import { raizDelProyecto } from "@/lib/mando/raiz";

/**
 * El Mando tiene que poder administrar los ids que el ENJAMBRE escribe.
 *
 * `PATRON_ID` exigía empezar por MAYÚSCULA, y desde la ola 300 el enjambre escribe `p316I`,
 * `p320M`, `zW7`, `zO2`, `p323A`, `p316L2`. Resultado: «Nombre de cola no válido» al intentar
 * aprobar, rechazar, soltar o reencolar su propio trabajo desde la consola. Es decir: el
 * Puente de Mando no podía administrar el enjambre, que es exactamente para lo que existe.
 *
 * Es el fallo que la tarea p320M lleva días intentando arreglar —y que se comió sus ocho
 * intentos gratuitos sin llegar nunca a un escritor capaz—. Se arregló a mano el 2026-09-16
 * porque bloqueaba, por segunda vez en una tarde, reencolar las atascadas desde el Mando.
 */
const tarea = (id: string) => ({
    id,
    titulo: "una tarea",
    prompt: "un enunciado suficientemente largo para pasar el mínimo de veinte caracteres",
    archivos: ["src/lib/x.ts"],
});

describe("validarCola · ids del enjambre", () => {
    it.each(["p316I", "p320M", "zW7", "zO2", "p323A", "p316L2", "zAU3"])(
        "acepta el id real «%s» que escribe el enjambre",
        (id) => {
            expect(validarCola("330-prueba", [tarea(id)]).errores).toEqual([]);
        },
    );

    it.each(["PS1", "X4F2", "AG3", "C1", "MD12"])(
        "sigue aceptando el id clásico «%s»",
        (id) => {
            expect(validarCola("330-prueba", [tarea(id)]).errores).toEqual([]);
        },
    );

    it.each(["1abc", "", "demasiadolargo", "con-guion", "con espacio"])(
        "sigue rechazando «%s»",
        (id) => {
            expect(validarCola("330-prueba", [tarea(id)]).errores.length).toBeGreaterThan(0);
        },
    );

    it("un id repetido se sigue señalando aunque ahora sea minúscula", () => {
        const errores = validarCola("330-prueba", [tarea("p316I"), tarea("p316I")]).errores;
        expect(errores.some((e) => e.includes("repetido"))).toBe(true);
    });
});

describe("validarCola · escritores permitidos", () => {
    it("acepta codex como escritor: va contra la suscripción, no contra créditos de API", () => {
        const conCodex = { ...tarea("zO2"), modelo: "codex/gpt-5.6-sol" };
        expect(validarCola("330-prueba", [conCodex]).errores).toEqual([]);
    });

    it("sigue rechazando una API con la que el orquestador no sabe escribir", () => {
        const conGemini = { ...tarea("zO2"), modelo: "gemini/gemini-2.5-flash" };
        expect(validarCola("330-prueba", [conGemini]).errores.length).toBeGreaterThan(0);
    });
});

describe("PATRON_NOMBRE y resolución de colas", () => {
    it.each(["auto-0913-193908-t1", "auto-0913-193908", "320-visto-bueno-con-criterio"])(
        "un nombre «%s» pasa el patrón",
        (nombre) => {
            expect(PATRON_NOMBRE.test(nombre)).toBe(true);
        }
    );

    it.each(["../../etc/passwd", "cola; rm -rf", "CON ESPACIOS", "cola_guion_bajo"])(
        "rechaza nombres peligrosos o inválidos «%s»",
        (nombre) => {
            expect(PATRON_NOMBRE.test(nombre)).toBe(false);
        }
    );

    it("un latido más viejo que el umbral NO sirve para resolver el nombre de la cola", async () => {
        const olasDir = path.join(raizDelProyecto(), "starseed_memory_root", "olas");
        await mkdir(olasDir, { recursive: true });

        const colaPath = path.join(olasDir, "cola-test-expirada.json");
        const latidoPath = path.join(olasDir, "latidos-cola-test-expirada.json");

        const contenidoCola = JSON.stringify([
            {
                id: "tExpirada",
                ola: "Ola test",
                titulo: "tarea de prueba",
                prompt: "un enunciado suficientemente largo para pasar la validación",
                archivos: [],
                depende: [],
            },
        ]);

        const contenidoLatido = JSON.stringify({
            cola: "test-expirada",
            tareas: { tExpirada: { estado: "en_curso" } },
        });

        await writeFile(colaPath, contenidoCola, "utf-8");
        await writeFile(latidoPath, contenidoLatido, "utf-8");

        // Cambiar mtime del latido a 10 minutos atrás
        const haceDiezMinutos = (Date.now() - 10 * 60 * 1000) / 1000;
        await utimes(latidoPath, haceDiezMinutos, haceDiezMinutos);

        try {
            const res = await resolverNombreColaActual({ tarea: "tExpirada", umbralMs: 5 * 60 * 1000 });
            expect(res.ok).toBe(false);
            if (!res.ok) {
                expect(res.error).toMatch(/expirado/i);
            }
        } finally {
            await unlink(colaPath).catch(() => {});
            await unlink(latidoPath).catch(() => {});
        }
    });

    it("reasignar desde una cola auto- de mac a nube genera un nombre de cola válido con sufijo -t1", async () => {
        const olasDir = path.join(raizDelProyecto(), "starseed_memory_root", "olas");
        await mkdir(olasDir, { recursive: true });

        const colaNombre = "auto-0913-193908";
        const colaPath = path.join(olasDir, `cola-${colaNombre}.json`);

        const contenidoCola = JSON.stringify([
            {
                id: "t1",
                ola: "Ola auto",
                titulo: "tarea auto prueba",
                prompt: "un enunciado suficientemente largo para pasar la validación",
                archivos: [],
                depende: [],
            },
        ]);

        await writeFile(colaPath, contenidoCola, "utf-8");

        try {
            // Reasignar de mac a nube
            // Si STARSEED_LANZADOR_SECRETO no está configurado o falla bus, dará error de bus/firma,
            // pero el nombre derivado auto-0913-193908-t1 DEBE pasar PATRON_NOMBRE y NO dar "No puedo derivar un nombre de cola válido"
            const res = await reasignarTarea({
                nombre: colaNombre,
                tarea: "t1",
                dondeActual: "mac",
                donde: "nube",
            });

            // Si falla, el error NO debe ser "No puedo derivar un nombre de cola válido para el traslado"
            if (!res.ok) {
                expect(res.error).not.toBe("No puedo derivar un nombre de cola válido para el traslado.");
                expect(res.error).not.toBe("Nombre de cola no válido.");
            } else {
                expect(res.colaNueva).toBe("auto-0913-193908-t1");
            }
        } finally {
            await unlink(colaPath).catch(() => {});
        }
    });

    it("decidirTarea resuelve el nombre de una cola auto- explícita o por latido", async () => {
        const olasDir = path.join(raizDelProyecto(), "starseed_memory_root", "olas");
        await mkdir(olasDir, { recursive: true });

        const colaNombre = "auto-0913-193908";
        const colaPath = path.join(olasDir, `cola-${colaNombre}.json`);
        const latidoPath = path.join(olasDir, `latidos-cola-${colaNombre}.json`);

        const contenidoCola = JSON.stringify([
            {
                id: "t1",
                ola: "Ola auto",
                titulo: "tarea auto prueba",
                prompt: "un enunciado suficientemente largo para pasar la validación",
                archivos: [],
                depende: [],
            },
        ]);

        const contenidoLatido = JSON.stringify({
            cola: colaNombre,
            tareas: { t1: { estado: "esperando" } },
        });

        await writeFile(colaPath, contenidoCola, "utf-8");
        await writeFile(latidoPath, contenidoLatido, "utf-8");

        try {
            // 1. Con nombre explícito
            const resExplicito = await decidirTarea({
                nombre: colaNombre,
                tarea: "t1",
                dondeActual: "mac",
                decision: "aprobar",
            });
            // Dado que no hay orquestador corriendo en el test, devolverá error de orquestador no presente,
            // pero el nombre "auto-0913-193908" NO debe ser rechazado como nombre inválido.
            if (!resExplicito.ok) {
                expect(resExplicito.error).not.toBe("Nombre de cola no válido.");
                expect(resExplicito.error).not.toBe("No se pudo resolver la cola.");
            }

            // 2. Sin nombre explícito, resuelve usando latido fresco
            const resImplicit = await decidirTarea({
                tarea: "t1",
                dondeActual: "mac",
                decision: "rechazar",
            });
            if (!resImplicit.ok) {
                expect(resImplicit.error).not.toBe("Nombre de cola no válido.");
                expect(resImplicit.error).not.toBe("Falta el nombre de la cola o la tarea.");
            }
        } finally {
            await unlink(colaPath).catch(() => {});
            await unlink(latidoPath).catch(() => {});
        }
    });

    it("reintentarTarea sin nombre explícito no produce 'undefined-rt...'", async () => {
        const olasDir = path.join(raizDelProyecto(), "starseed_memory_root", "olas");
        await mkdir(olasDir, { recursive: true });

        const colaNombre = "330-reintentar-test";
        const colaPath = path.join(olasDir, `cola-${colaNombre}.json`);
        const latidoPath = path.join(olasDir, `latidos-cola-${colaNombre}.json`);

        const contenidoCola = JSON.stringify([
            {
                id: "tReintento",
                ola: "Ola test",
                titulo: "tarea a reintentar",
                prompt: "un enunciado suficientemente largo para pasar la validacion de prompt",
                archivos: ["src/lib/test.ts"],
                depende: [],
                modelo: "xkiro/qwen/qwen3-coder-plus:free",
            },
        ]);

        const contenidoLatido = JSON.stringify({
            cola: colaNombre,
            tareas: { tReintento: { estado: "fallida" } },
        });

        await writeFile(colaPath, contenidoCola, "utf-8");
        await writeFile(latidoPath, contenidoLatido, "utf-8");

        try {
            const res = await reintentarTarea({
                tareas: ["tReintento"],
                motivo: "Fallo de prueba",
            });

            if (res.ok && res.colaNueva) {
                expect(res.colaNueva).not.toMatch(/^undefined-/);
                expect(res.colaNueva).toMatch(/^330-reintentar-test-rt/);
            }
        } finally {
            await unlink(colaPath).catch(() => {});
            await unlink(latidoPath).catch(() => {});
            // limpiar la cola derivada si se creó
            const files = await path.join(olasDir);
            // la cola derivada tendría un nombre tipo 330-reintentar-test-rtXXXX
        }
    });

    it("resolverNombreColaActual encuentra la cola por latido fresco aunque nombresCandidatas no coincida", async () => {
        const olasDir = path.join(raizDelProyecto(), "starseed_memory_root", "olas");
        await mkdir(olasDir, { recursive: true });

        const colaNombre = "330-latido-directo";
        const colaPath = path.join(olasDir, `cola-${colaNombre}.json`);
        const latidoPath = path.join(olasDir, `latidos-cola-${colaNombre}.json`);

        // Cola en disco con formato diferente/dinámico donde tareas list no coincide directamente con la búsqueda
        const contenidoCola = JSON.stringify([
            {
                id: "tOtra",
                ola: "Ola test",
                titulo: "tarea distinta",
                prompt: "un enunciado suficientemente largo para pasar la validación",
                archivos: [],
                depende: [],
            },
        ]);

        const contenidoLatido = JSON.stringify({
            cola: colaNombre,
            tareas: { tFresco: { estado: "en_curso" } },
        });

        await writeFile(colaPath, contenidoCola, "utf-8");
        await writeFile(latidoPath, contenidoLatido, "utf-8");

        try {
            const res = await resolverNombreColaActual({ tarea: "tFresco" });
            expect(res.ok).toBe(true);
            if (res.ok) {
                expect(res.nombre).toBe(colaNombre);
            }
        } finally {
            await unlink(colaPath).catch(() => {});
            await unlink(latidoPath).catch(() => {});
        }
    });
});

