import { describe, it, expect } from "vitest";
import { comoAbrir, faltasEnNeurona, LATENCIA_TOPE_DEFECTO_MS } from "../modos-app";
import type { OfertaNeurona } from "../oferta";
import type { StarseedApp } from "@/components/dashboard/apps/launcher-types";

const base = {
    nodoId: "n-1",
    cuentaId: "cuenta-a",
    medio: "navegador",
    computo: { nucleos: 4, ramLibreMb: 4096, gpu: false, motores: ["voz"] },
    almacen: { prestaMb: 2048, volumenes: ["vol-libreria"] },
    apps: [{ id: "nexus", version: "1.0.0" }],
    enlaces: {},
    energia: { enUso: false },
    presta: {
        cuenta: true, grupos: [], publico: false,
        topes: { cpuPct: 80, ramMb: 4096, discoMb: 2048, soloCargando: false },
    },
    t: 0,
};

const anfitriona = (nodoId: string, apps: string[]): OfertaNeurona => ({
    ...base,
    nodoId,
    apps: apps.map((id) => ({ id, version: "1.0.0" })),
});

const appCon = (extra: Partial<StarseedApp>): Pick<StarseedApp, "id" | "ejecucion" | "requisitos"> => ({
    id: "nexus",
    ...extra,
});

describe("faltasEnNeurona", () => {
    it("no marca falta cuando la neurona cubre todo el requisito", () => {
        const faltas = faltasEnNeurona(
            { ramMb: 2048, motores: ["voz"], volumen: "vol-libreria" },
            base
        );
        expect(faltas).toEqual([]);
    });

    it("marca RAM, GPU, motores y volumen con lo medido en la oferta", () => {
        const faltas = faltasEnNeurona(
            { ramMb: 8192, gpu: true, motores: ["voz", "oido"], volumen: "otro-vol" },
            base
        );
        expect(faltas).toHaveLength(4);
        expect(faltas[0]).toContain("8192");
        expect(faltas.some((f) => f.startsWith("GPU"))).toBe(true);
        expect(faltas.some((f) => f.startsWith("Motores")) && faltas.some((f) => f.includes("oido"))).toBe(true);
        expect(faltas.some((f) => f.startsWith("Volumen"))).toBe(true);
    });

    it("devuelve vacío sin requisitos", () => {
        expect(faltasEnNeurona(undefined, base)).toEqual([]);
    });
});

describe("comoAbrir", () => {
    it("app sin campo ejecucion y sin requisitos abre en local", () => {
        const resultado = comoAbrir({ id: "nexus" }, base);
        expect(resultado).toEqual({
            modo: "local", destino: "n-1",
            motivo: "Cabe en la neurona local (n-1).",
            faltas: [],
        });
    });

    it("local cuando todo cabe en la neurona", () => {
        const app = appCon({ ejecucion: ["local", "por-bandas"], requisitos: { ramMb: 2048 } });
        expect(comoAbrir(app, base).modo).toBe("local");
        expect(comoAbrir(app, base).motivo).toContain("Cabe en la neurona local");
    });

    it("por-bandas para una web/WASM con volumen cuando no cabe en local", () => {
        const app = appCon({
            ejecucion: ["local", "por-bandas"],
            requisitos: { ramMb: 8192, volumen: "vol-libreria" },
        });
        const resultado = comoAbrir(app, base);
        expect(resultado.modo).toBe("por-bandas");
        expect(resultado.destino).toBe("vol-libreria");
    });

    it("montada para una app nativa declarada con volumen", () => {
        const app = appCon({
            ejecucion: ["montada", "transmitida"],
            requisitos: { volumen: "vol-app-nativa" },
        });
        const resultado = comoAbrir(app, base);
        expect(resultado.modo).toBe("montada");
        expect(resultado.destino).toBe("vol-app-nativa");
    });

    it("transmitida cuando otra neurona la tiene, está sana y la latencia sirve", () => {
        const app = appCon({ ejecucion: ["local", "transmitida"], requisitos: { ramMb: 8192 } });
        const plan = {
            anfitrionas: [anfitriona("n-2", ["nexus"])],
            latenciaMs: { "n-2": 40 },
        };
        const resultado = comoAbrir(app, base, plan);
        expect(resultado.modo).toBe("transmitida");
        expect(resultado.destino).toBe("n-2");
        expect(resultado.motivo).toContain("40 ms");
    });

    it("descarta anfitriona sin la app, en uso o con latencia sin medir o por encima del tope", () => {
        const app = appCon({ ejecucion: ["transmitida"], requisitos: { ramMb: 8192 } });
        // Anfitriona en uso: no vale
        const ocupada = { ...anfitriona("n-2", ["nexus"]), energia: { enUso: true } };
        expect(comoAbrir(app, base, { anfitrionas: [ocupada], latenciaMs: { "n-2": 40 } }).modo).toBe("transmitida");
        expect(comoAbrir(app, base, { anfitrionas: [ocupada], latenciaMs: { "n-2": 40 } }).destino).toBe("n-1");
        // Anfitriona sin la app: no vale
        const sinApp = anfitriona("n-3", ["otra-app"]);
        expect(comoAbrir(app, base, { anfitrionas: [sinApp], latenciaMs: { "n-3": 40 } }).destino).toBe("n-1");
        // Latencia sin medir: no se inventa, no vale
        expect(comoAbrir(app, base, { anfitrionas: [anfitriona("n-2", ["nexus"])] }).modo).toBe("transmitida");
        // Latencia por encima del tope: no vale
        const lenta = comoAbrir(app, base, { anfitrionas: [anfitriona("n-2", ["nexus"])], latenciaMs: { "n-2": LATENCIA_TOPE_DEFECTO_MS + 10 } });
        expect(lenta.modo).toBe("transmitida");
        expect(lenta.destino).toBe("n-1");
    });

    it("ramificada solo cuando únicamente falta cálculo y hay modo declarado", () => {
        const app = appCon({
            ejecucion: ["local", "ramificada"],
            requisitos: { ramMb: 8192, gpu: true },
        });
        const plan = { anfitrionas: [anfitriona("n-2", ["nexus"])] };
        const resultado = comoAbrir(app, base, plan);
        expect(resultado.modo).toBe("ramificada");
        expect(resultado.destino).toBe("n-2");

        const conVolumen = appCon({
            ejecucion: ["local", "ramificada"],
            requisitos: { ramMb: 8192, volumen: "vol-libreria" },
        });
        const sinVolumen = faltasEnNeurona(conVolumen.requisitos, base).some((f) => f.startsWith("Volumen"));
        expect(sinVolumen).toBe(false);
        expect(comoAbrir(conVolumen, base, plan)).toMatchObject({ modo: "ramificada" });
        // Volumen ausente: no es «solo cálculo», no ramifica (aquí falta el volumen)
        const appVolAjeno = appCon({
            ejecucion: ["local", "ramificada"],
            requisitos: { volumen: "vol-que-no-está" },
        });
        expect(comoAbrir(appVolAjeno, base, plan).modo).toBe("local");
    });

    it("suelo: nunca «nada», abre en local con el aviso de lo que falta", () => {
        const app = appCon({ ejecucion: ["local"], requisitos: { ramMb: 8192, gpu: true } });
        const resultado = comoAbrir(app, base);
        expect(resultado.modo).toBe("local");
        expect(resultado.motivo).toContain("falta");
        expect(resultado.faltas).toHaveLength(2);
    });

    it("suelo de una app sin modo local: primer modo declarado con aviso", () => {
        const app = appCon({ ejecucion: ["montada"], requisitos: {} });
        const resultado = comoAbrir(app, { ...base, almacen: { prestaMb: 0, volumenes: [] } }, { anfitrionas: [] });
        expect(resultado.modo).toBe("montada");
        expect(resultado.destino).toBe("n-1");
        expect(resultado.motivo).toContain("Sin exigencias declaradas");
    });
});
