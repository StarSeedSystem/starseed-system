// Pruebas de modos-app (tarea N · Ola 1017A): solo funciones puras, sin red, sin disco.
import { describe, it, expect } from "vitest";
import type { OfertaNeurona } from "../oferta";
import { comoAbrir, faltasDeNeurona } from "../modos-app";

type Parcial = Partial<OfertaNeurona>;

/** Neurona modesta sin apps ni volúmenes; cada prueba ajusta lo que necesita. */
const neurona = (extra: Parcial = {}): OfertaNeurona => ({
    nodoId: "local-1",
    cuentaId: "cuenta-a",
    medio: "wifi",
    computo: { nucleos: 2, ramLibreMb: 4096, gpu: false, motores: [] },
    almacen: { prestaMb: 0, volumenes: [] },
    apps: [],
    enlaces: {},
    energia: { enUso: false },
    presta: {
        cuenta: true,
        grupos: [],
        publico: false,
        topes: { cpuPct: 100, ramMb: 4096, discoMb: 0, soloCargando: false },
    },
    t: 0,
    ...extra,
});

const plan = (candidatas: OfertaNeurona[], latenciaTopeMs?: number) => ({ candidatas, latenciaTopeMs });

describe("comoAbrir · modo local", () => {
    it("sin ejecucion ni requisitos abre local, como hoy (sin campo = ['local'])", () => {
        const d = comoAbrir({ id: "nexus" }, neurona(), plan([]));
        expect(d.modo).toBe("local");
        expect(d.destino).toBe("local-1");
    });

    it("local cuando los requisitos medidos caben en la neurona", () => {
        const app = {
            id: "editor",
            ejecucion: ["local", "por-bandas"] as const,
            requisitos: { ramMb: 2048, gpu: true, motores: ["voz"] },
        };
        const yo = neurona({
            computo: { nucleos: 4, ramLibreMb: 4096, gpu: true, motores: ["voz"] },
        });
        const d = comoAbrir(app, yo, plan([]));
        expect(d.modo).toBe("local");
        expect(d.destino).toBe("local-1");
    });

    it("local si el app vive en un volumen y la neurona ya lo tiene en caché", () => {
        const app = { id: "wasm", requisitos: { volumen: "paquete-x" } };
        const yo = neurona({ almacen: { prestaMb: 512, volumenes: ["paquete-x"] } });
        const d = comoAbrir(app, yo, plan([]));
        expect(d.modo).toBe("local");
    });
});

describe("comoAbrir · por-bandas y montada", () => {
    it("por-bandas si la app es web/WASM con volumen y la malla lo reparte", () => {
        const app = {
            id: "wasm",
            ejecucion: ["local", "por-bandas"] as const,
            requisitos: { volumen: "paquete-x" },
        };
        const vecina = neurona({
            nodoId: "vecina-2",
            almacen: { prestaMb: 2048, volumenes: ["paquete-x"] },
        });
        const d = comoAbrir(app, neurona(), plan([vecina]));
        expect(d.modo).toBe("por-bandas");
        expect(d.destino).toBe("volumen:paquete-x");
        expect(d.motivo).toContain("vecina");
    });

    it("montada si la app es nativa fuera del disco, por la pasarela local", () => {
        const app = { id: "editor-nativo", ejecucion: ["montada"] as const, requisitos: { volumen: "editor" } };
        const vecina = neurona({
            nodoId: "vecina-2",
            almacen: { prestaMb: 2048, volumenes: ["editor"] },
        });
        const d = comoAbrir(app, neurona(), plan([vecina]));
        expect(d.modo).toBe("montada");
        expect(d.destino).toBe("volumen:editor");
    });
});

describe("comoAbrir · transmitida", () => {
    it("transmitida a la neurona prestada con la latencia mejor medida", () => {
        // Sin modo local disponible: una app que esta neurona no puede correr por sí.
        const app = { id: "app-pesada", ejecucion: ["transmitida"] as const };
        const lenta = neurona({ nodoId: "anfitriona-lenta", apps: [{ id: "app-pesada", version: "1.0" }] });
        const rapida = neurona({ nodoId: "anfitriona-rapida", apps: [{ id: "app-pesada", version: "1.0" }] });
        const yo = neurona({
            enlaces: { latenciaMs: { "anfitriona-lenta": 60, "anfitriona-rapida": 20 } },
        });
        const d = comoAbrir(app, yo, plan([lenta, rapida], 100));
        expect(d.modo).toBe("transmitida");
        expect(d.destino).toBe("anfitriona-rapida");
        expect(d.motivo).toContain("20 ms");
    });

    it("no transmitida si la latencia no está medida o supera el tope: suelo local con aviso", () => {
        const app = { id: "app-pesada", ejecucion: ["transmitida"] as const };
        const anfitriona = neurona({ nodoId: "anfitriona-1", apps: [{ id: "app-pesada", version: "1.0" }] });
        const yo = neurona({ enlaces: { latenciaMs: { "anfitriona-1": 250 } } });
        const d = comoAbrir(app, yo, plan([anfitriona], 100));
        expect(d.modo).toBe("local");
        expect(d.motivo).toContain("no admite otro modo");
        // Sin latencia medida no se inventa (§3): la candidata se descarta igual.
        const d2 = comoAbrir(app, neurona(), plan([anfitriona]));
        expect(d2.modo).toBe("local");
    });
});

describe("comoAbrir · ramificada y suelo", () => {
    it("ramificada si solo falta cálculo y la malla lo presta", () => {
        const app = {
            id: "pesado",
            ejecucion: ["local", "ramificada"] as const,
            requisitos: { ramMb: 8192 },
        };
        const vecina = neurona({
            nodoId: "vecina-2",
            computo: { nucleos: 8, ramLibreMb: 8192, gpu: false, motores: [] },
        });
        const d = comoAbrir(app, neurona(), plan([vecina]));
        expect(d.modo).toBe("ramificada");
        expect(d.destino).toBe("malla");
        expect(d.motivo).toContain("RAM");
    });

    it("suelo: local con el aviso de lo que falta cuando nada se puede prestar", () => {
        const app = { id: "pesado", requisitos: { ramMb: 8192, gpu: true } };
        const d = comoAbrir(app, neurona(), plan([]));
        expect(d.modo).toBe("local");
        expect(d.destino).toBe("local-1");
        expect(d.motivo).toContain("falta GPU");
        expect(d.motivo).toContain("MB de RAM");
    });
});

describe("faltasDeNeurona", () => {
    it("vacío cuando todo cabe y detallado cuando algo escasea", () => {
        const req = { ramMb: 2048, gpu: true, motores: ["voz", "oído"] };
        expect(faltasDeNeurona(req, { nucleos: 2, ramLibreMb: 4096, gpu: true, motores: ["voz"] })).toEqual([
            "falta el motor «oído»",
        ]);
        expect(
            faltasDeNeurona(req, { nucleos: 1, ramLibreMb: 512, gpu: false, motores: [] })
        ).toEqual(["faltan 1536 MB de RAM", "falta GPU", "falta el motor «voz»", "falta el motor «oído»"]);
    });
});



