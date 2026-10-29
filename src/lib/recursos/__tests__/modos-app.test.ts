import { describe, it, expect } from "vitest";
import { Compass } from "lucide-react";
import { comoAbrir, faltaLocal, modosAdmitidos } from "../modos-app";
import type { ModoEjecucion, StarseedApp } from "@/components/dashboard/apps/launcher-types";
import type { OfertaNeurona } from "../oferta";

const app = (o: Partial<StarseedApp> = {}): StarseedApp => ({
    id: "dibujo",
    name: "Dibujo",
    description: "App de prueba",
    icon: Compass,
    accent: "azure",
    category: "creacion",
    open: { primary: "route", allowed: ["route"] },
    ...o,
});

const neurona = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
    nodoId: "n1",
    cuentaId: "cuentaA",
    medio: "wifi",
    computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, motores: ["imagen"] },
    almacen: { prestaMb: 512, volumenes: [] },
    apps: [],
    enlaces: {},
    energia: { enUso: false },
    presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
    t: 0,
    ...o,
});

const resultado = (destino: string) => ({ destino, motivo: "prueba" });
const plan = (porParte: Record<string, { destino: string; motivo: string }[]> = {}) => ({ porParte });

describe("modosAdmitidos y faltaLocal", () => {
    it("sin campo devuelve ['local']; los declarados se ordenan por preferencia", () => {
        expect(modosAdmitidos(app())).toEqual(["local"]);
        expect(
            modosAdmitidos(app({ ejecucion: ["ramificada", "local"] as ModoEjecucion[] }))
        ).toEqual(["local", "ramificada"]);
    });

    it("faltaLocal enumera RAM, GPU y motores que faltan; vacía sin requisitos", () => {
        const con = faltaLocal(
            app({ requisitos: { ramMb: 4096, motores: ["voz", "imagen"] } }),
            neurona({ computo: { nucleos: 2, ramLibreMb: 1024, gpu: false, motores: ["imagen"] } })
        );
        expect(con).toEqual(["RAM 4096 MB", "motor voz"]);
        expect(faltaLocal(app(), neurona())).toEqual([]);
    });
});

describe("comoAbrir", () => {
    it("local si los requisitos caben en la neurona", () => {
        const d = comoAbrir(app({ requisitos: { ramMb: 512, gpu: true } }), neurona(), plan());
        expect(d.modo).toBe("local");
        expect(d.destino).toBe("n1");
        expect(d.motivo).toContain("cumple los requisitos");
    });

    it("local que no cabe y sin plan → suelo con aviso de lo que falta", () => {
        const d = comoAbrir(
            app({ requisitos: { ramMb: 8192 } }),
            neurona({ computo: { nucleos: 1, ramLibreMb: 512, gpu: false, motores: [] } }),
            plan()
        );
        expect(d.modo).toBe("local");
        expect(d.destino).toBe("local");
        expect(d.motivo).toContain("Suelo");
        expect(d.motivo).toContain("RAM 8192 MB");
    });

    it("por-bandas cuando el volumen vive en la neurona", () => {
        const d = comoAbrir(
            app({ ejecucion: ["local", "por-bandas"], requisitos: { volumen: "vol-dibujo" } }),
            neurona({ almacen: { prestaMb: 512, volumenes: ["vol-dibujo"] } }),
            plan()
        );
        expect(d.modo).toBe("por-bandas");
        expect(d.destino).toBe("local");
        expect(d.motivo).toContain("vol-dibujo");
    });

    it("por-bandas cuando el plan trae las bandas de la red", () => {
        const d = comoAbrir(
            app({ ejecucion: ["local", "por-bandas"], requisitos: { volumen: "vol-dibujo" } }),
            neurona({ computo: { nucleos: 1, ramLibreMb: 256, gpu: false, motores: [] } }),
            plan({ bytes: [resultado("n2")] })
        );
        expect(d.modo).toBe("por-bandas");
        expect(d.destino).toBe("local");
    });

    it("montada para la app nativa que corre desde su volumen", () => {
        const d = comoAbrir(
            app({ ejecucion: ["montada", "por-bandas"], requisitos: { volumen: "vol-nativa" } }),
            neurona({ almacen: { prestaMb: 1024, volumenes: ["vol-nativa"] } }),
            plan()
        );
        expect(d.modo).toBe("montada");
        expect(d.destino).toBe("local");
        expect(d.motivo).toContain("vol-nativa");
    });

    it("transmitida cuando otra neurona la tiene prestada", () => {
        const d = comoAbrir(
            app({ ejecucion: ["transmitida"] }),
            neurona(),
            plan({ ventana: [resultado("n2")] })
        );
        expect(d.modo).toBe("transmitida");
        expect(d.destino).toBe("n2");
        expect(d.motivo).toContain("vídeo");
    });

    it("suelo si el anfitrión prestado es esta misma neurona", () => {
        const d = comoAbrir(
            app({ ejecucion: ["transmitida"] }),
            neurona(),
            plan({ ventana: [resultado("n1")] })
        );
        expect(d.modo).toBe("local");
        expect(d.destino).toBe("local");
        expect(d.motivo).toContain("Suelo");
    });

    it("ramificada cuando solo falta cálculo y el plan lo ofrece", () => {
        const d = comoAbrir(
            app({ ejecucion: ["local", "ramificada"], requisitos: { ramMb: 4096 } }),
            neurona({ computo: { nucleos: 2, ramLibreMb: 512, gpu: true, motores: [] } }),
            plan({ computo: [resultado("n3")] })
        );
        expect(d.modo).toBe("ramificada");
        expect(d.destino).toBe("n3");
        expect(d.motivo).toContain("Interfaz");
        expect(d.motivo).toContain("RAM 4096 MB");
    });

    it("suelo sin ninguna vía disponible", () => {
        const d = comoAbrir(app({ ejecucion: ["transmitida"] }), neurona(), plan());
        expect(d.modo).toBe("local");
        expect(d.destino).toBe("local");
        expect(d.motivo).toContain("Suelo");
    });
});
