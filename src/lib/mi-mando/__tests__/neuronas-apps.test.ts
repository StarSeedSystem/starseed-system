import { describe, expect, it } from "vitest";

import type { Neuron } from "@/lib/neurons/neurons";
import type { InstalledApp, SavedResource } from "@/lib/library-store";
import type { DestinoInstalacion } from "@/lib/instalaciones/destinos";

import {
    capacidadesLegibles,
    fraseResumenNeuronas,
    haceCuanto,
    nombreValido,
    PERMISOS_NEURONA,
    resumenNeuronas,
} from "../neuronas";
import { claveApp, combinarApps, resolverApertura, resumenApps } from "../apps";

const permisos = { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true };

function neurona(p: Partial<Neuron> & { id: string }): Neuron {
    return { name: p.id, kind: "desktop", capabilities: { platform: "macOS" }, permissions: permisos, ...p };
}

describe("neuronas", () => {
    it("los seis permisos tienen explicación de una línea", () => {
        expect(PERMISOS_NEURONA.map((p) => p.clave).sort()).toEqual(["agent", "compute", "senses", "storage", "sync", "wake"]);
        for (const p of PERMISOS_NEURONA) {
            expect(p.explicacion.length).toBeGreaterThan(10);
            expect(p.explicacion).not.toContain("\n");
        }
    });

    it("resume en línea / total / IA local / este dispositivo", () => {
        const lista = [
            neurona({ id: "a", name: "Mac", online: true, isThisDevice: true, capabilities: { platform: "macOS", ollama: true } }),
            neurona({ id: "b", online: false, capabilities: { platform: "Android" } }),
            neurona({ id: "c", online: true, capabilities: { platform: "Linux", webgpu: true } }),
        ];
        const r = resumenNeuronas(lista);
        expect(r).toEqual({ total: 3, enLinea: 2, conIaLocal: 2, esteDispositivo: "Mac" });
        expect(fraseResumenNeuronas(r)).toBe("2 de 3 en línea");
        expect(fraseResumenNeuronas(resumenNeuronas([]))).toBe("Ningún dispositivo registrado todavía");
    });

    it("capacidades legibles: solo lo declarado", () => {
        expect(capacidadesLegibles({ platform: "macOS", memoryGb: 8, webgpu: true, ollama: true, astraura158: { online: true, endpoint: "x" } })).toEqual([
            "macOS",
            "8 GB de RAM",
            "WebGPU (IA en el navegador)",
            "Ollama",
            "Astraura local",
        ]);
        expect(capacidadesLegibles({ platform: "desconocido" })).toEqual([]);
        expect(capacidadesLegibles(undefined)).toEqual([]);
    });

    it("hace cuánto", () => {
        const ahora = Date.parse("2026-09-25T12:00:00Z");
        expect(haceCuanto(undefined, ahora)).toBe("sin registro");
        expect(haceCuanto("no-fecha", ahora)).toBe("sin registro");
        expect(haceCuanto("2026-09-25T11:59:40Z", ahora)).toBe("ahora mismo");
        expect(haceCuanto("2026-09-25T11:55:00Z", ahora)).toBe("hace 5 min");
        expect(haceCuanto("2026-09-25T09:00:00Z", ahora)).toBe("hace 3 h");
        expect(haceCuanto("2026-09-24T12:00:00Z", ahora)).toBe("hace 1 día");
    });

    it("nombre válido", () => {
        expect(nombreValido("   ")).toBeNull();
        expect(nombreValido("  Mi   portátil ")).toBe("Mi portátil");
        expect(nombreValido("x".repeat(80))).toHaveLength(60);
    });
});

describe("apps", () => {
    it("resolverApertura solo abre rutas del OS y webs http(s)", () => {
        expect(resolverApertura("/omnifrecuencias")).toEqual({ tipo: "ruta", destino: "/omnifrecuencias" });
        expect(resolverApertura("https://audiomorphic.vercel.app")).toEqual({ tipo: "web", destino: "https://audiomorphic.vercel.app/" });
        expect(resolverApertura("//malo.com")).toBeNull();
        expect(resolverApertura("/\\malo.com")).toBeNull();
        expect(resolverApertura("javascript:alert(1)")).toBeNull();
        expect(resolverApertura("data:text/html,x")).toBeNull();
        expect(resolverApertura("starseed://app/x")).toBeNull();
        expect(resolverApertura("")).toBeNull();
        expect(resolverApertura(undefined)).toBeNull();
    });

    it("claveApp reconoce la misma app con o sin el prefijo de la Biblioteca", () => {
        expect(claveApp("ss-app-audiomorphic")).toBe("audiomorphic");
        expect(claveApp("Audiomorphic")).toBe("audiomorphic");
    });

    it("combina Biblioteca, Lanzador y destinos sin duplicar y con los sitios de cada app", () => {
        const guardados: SavedResource[] = [
            { id: "ss-app-audiomorphic", kind: "app", title: "Audiomorphic", url: "https://audiomorphic.vercel.app", savedAt: 10 },
            { id: "doc-1", kind: "documento", title: "Un documento", savedAt: 5 },
        ];
        const lanzador: InstalledApp[] = [
            { id: "audiomorphic", name: "Audiomorphic", installedAt: 20 },
            { id: "notas", name: "Notas", installedAt: 30 },
        ];
        const d = (p: Partial<DestinoInstalacion> & { id: string }): DestinoInstalacion => ({
            appId: "audiomorphic",
            appNombre: "Audiomorphic",
            tipo: "web",
            estado: "instalada",
            creada: 1,
            actualizada: 40,
            ...p,
        });
        const destinos = [
            d({ id: "d1" }),
            d({ id: "d2", tipo: "neurona", neuronaId: "mac" }),
            d({ id: "d3", tipo: "neurona", neuronaId: "movil", estado: "cancelada" }),
            d({ id: "d4", appId: "omni", appNombre: "Omnifrecuencias", tipo: "neurona", neuronaId: "mac", actualizada: 50 }),
        ];

        const apps = combinarApps(guardados, lanzador, destinos);
        expect(apps.map((a) => a.nombre)).toEqual(["Omnifrecuencias", "Audiomorphic", "Notas"]);

        const audio = apps.find((a) => a.nombre === "Audiomorphic");
        expect(audio?.origenes).toEqual(["biblioteca", "lanzador", "instalacion"]);
        expect(audio?.idsBiblioteca).toEqual(["ss-app-audiomorphic"]);
        expect(audio?.idsLanzador).toEqual(["audiomorphic"]);
        expect(audio?.apertura).toEqual({ tipo: "web", destino: "https://audiomorphic.vercel.app/" });
        expect(audio?.destinos.map((x) => x.id)).toEqual(["d1", "d2"]);

        const notas = apps.find((a) => a.nombre === "Notas");
        expect(notas?.apertura).toBeNull();
        expect(notas?.destinos).toEqual([]);

        // web + mac (dos apps en la mac cuentan como un solo sitio).
        expect(resumenApps(apps)).toEqual({ apps: 3, sitios: 2 });
    });
});
