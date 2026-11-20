/**
 * Equivalencia exacta y rendimiento O(N) para los índices de cadenas y asuntos
 * de `main` usados por `/api/mando/medidores` y `/api/mando/estado`.
 */
import { describe, it, expect } from "vitest";
import { baseDeCadena, estadoDeDependencia, indexarCadenas, sucesorasDe } from "@/lib/mando/cadenas";
import { colaInteligente, resumirOlas } from "@/lib/mando/lector-local";
import {
    dependenciasQueFaltan,
    detalleDeMedidor,
    ejecutablesDeColas,
    idEnAsuntos,
    idIntegradoEnAsuntos,
} from "@/lib/mando/medidores";
import type { TareaOla } from "@/lib/mando/tipos";

describe("cadenas y asuntos indexados: paridad semántica exacta", () => {
    it("indexarCadenas produce las mismas sucesoras que el recorrido lineal", () => {
        const ids = ["RM6", "RM6c", "RM6b", "RM7", "RM6d", "RM6", "p318I", "p318Ib", "a.1"];
        const indice = indexarCadenas(ids);
        for (const id of ids) {
            expect(sucesorasDe(id, indice)).toEqual(sucesorasDe(id, ids));
            expect(baseDeCadena(id)).toBeTruthy();
        }
        expect(sucesorasDe("NOEXISTE", indice)).toEqual([]);
    });

    it("idEnAsuntos y idIntegradoEnAsuntos respetan fronteras, símbolos y evitan falsos prefijos", () => {
        const asuntos = [
            "Ola 363 · p323E: texto normal",
            "RM6b: sin prefijo de ola",
            "Ola 364 · a.b: id con punto",
            "Ola 365 · foo-bar: id con guion",
            "  espacioAntes: no cuenta como integrado",
            "Ola 366 · x_foo-bar: tampoco es foo-bar integrado",
            "mencion suelta p320K sin dos puntos",
            "A10:B20: solo A10 esta integrado",
        ].join("\n");

        expect(idEnAsuntos("", asuntos)).toBe(false);
        expect(idEnAsuntos("p323E", "")).toBe(false);
        expect(idEnAsuntos("p323E", asuntos)).toBe(true);
        expect(idEnAsuntos("p323", asuntos)).toBe(false);
        expect(idEnAsuntos("p320K", asuntos)).toBe(true);
        expect(idEnAsuntos("a.b", asuntos)).toBe(true);
        expect(idEnAsuntos("aXb", asuntos)).toBe(false);
        expect(idEnAsuntos("foo-bar", asuntos)).toBe(true);

        expect(idIntegradoEnAsuntos("", asuntos)).toBe(false);
        expect(idIntegradoEnAsuntos("p323E", "")).toBe(false);
        expect(idIntegradoEnAsuntos("p323E", asuntos)).toBe(true);
        expect(idIntegradoEnAsuntos("p323", asuntos)).toBe(false);
        expect(idIntegradoEnAsuntos("RM6b", asuntos)).toBe(true);
        expect(idIntegradoEnAsuntos("a.b", asuntos)).toBe(true);
        expect(idIntegradoEnAsuntos("foo-bar", asuntos)).toBe(true);
        expect(idIntegradoEnAsuntos("espacioAntes", asuntos)).toBe(false);
        expect(idIntegradoEnAsuntos("p320K", asuntos)).toBe(false);
        expect(idIntegradoEnAsuntos("A10", asuntos)).toBe(true);
        expect(idIntegradoEnAsuntos("B20", asuntos)).toBe(false);
    });

    it("rotar más de 4 cadenas de asuntos no contamina la caché", () => {
        for (let i = 0; i < 8; i += 1) {
            const asuntos = `Ola ${i} · T${i}: prueba`;
            expect(idIntegradoEnAsuntos(`T${i}`, asuntos)).toBe(true);
            expect(idIntegradoEnAsuntos(`T${i + 1}`, asuntos)).toBe(false);
            expect(idEnAsuntos(`T${i}`, asuntos)).toBe(true);
            expect(idEnAsuntos(`T${i + 1}`, asuntos)).toBe(false);
        }
    });

    it("estadoDeDependencia y dependenciasQueFaltan coinciden con IndiceCadenas", () => {
        const progreso = {
            RM6: { estado: "sustituida" },
            RM6b: { estado: "reasignada" },
            A: { estado: "commit" },
        };
        const ids = ["RM6", "RM6b", "RM7", "A"];
        const indice = indexarCadenas(ids);
        const asuntos = "Ola 363 · RM6b: listo";

        expect(dependenciasQueFaltan(["RM6", "A"], progreso, asuntos, ids)).toEqual([]);
        expect(dependenciasQueFaltan(["RM6", "A"], progreso, asuntos, indice)).toEqual([]);
        expect(estadoDeDependencia("RM6", (k) => progreso[k as keyof typeof progreso]?.estado, indice)).toEqual(
            estadoDeDependencia("RM6", (k) => progreso[k as keyof typeof progreso]?.estado, ids),
        );
    });
});

describe("rendimiento a escala real (~5000 tareas y >1 MB de asuntos)", () => {
    it("calcula ejecutables, colaInteligente, resumirOlas y detalle bloqueadas en < 1000 ms", () => {
        const lineas: string[] = [];
        for (let i = 0; i < 14_000; i += 1) {
            lineas.push(`Ola ${Math.floor(i / 20)} · T${i}: implementacion de modulo ${i} en src/lib/mando/mod-${i}.ts`);
        }
        const asuntosDeMain = lineas.join("\n");
        expect(asuntosDeMain.length).toBeGreaterThan(1_000_000);

        const colas: TareaOla[] = [];
        const progreso: Record<string, { estado?: string; t?: string; nota?: string }> = {};
        const titulos: Record<string, string> = {};
        for (let i = 0; i < 5_000; i += 1) {
            const id = i < 4_800 ? `T${i}` : `NUEVA${i}`;
            titulos[id] = `Tarea ${id}`;
            colas.push({
                id,
                ola: `Ola ${Math.floor(i / 25)}`,
                titulo: titulos[id],
                dependencias: i > 0 ? [`T${i - 1}`] : [],
                cola: "base",
                archivos: [`src/mod-${i}.ts`],
                descripcion: `Desc ${i}`,
            });
            progreso[id] = i < 4_700
                ? { estado: "commit", t: "2026-11-18 10:00" }
                : i < 4_850
                  ? { estado: "bloqueada", t: "2026-11-19 10:00", nota: `dependencia no integrada: T${i - 1}` }
                  : { estado: "pendiente" };
        }

        const t0 = performance.now();
        const ejecutables = ejecutablesDeColas(colas, progreso, asuntosDeMain);
        const fila = colaInteligente(colas, progreso, [], new Map(), asuntosDeMain);
        const olas = resumirOlas(colas, progreso, new Map(), asuntosDeMain, []);
        const bloqueadas = detalleDeMedidor("bloqueadas", {
            progreso,
            titulos,
            ejecutables,
            fila,
            asuntosDeMain,
        });
        const elapsedMs = performance.now() - t0;

        expect(ejecutables.length).toBe(150);
        expect(olas.length).toBe(200);
        expect(bloqueadas.titulo).toBeTruthy();
        expect(elapsedMs).toBeLessThan(1_000);
    });
});
