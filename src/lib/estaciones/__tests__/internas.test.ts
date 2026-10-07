import { describe, it, expect } from "vitest";
import {
    estacionesInternas,
    estacionDeServidor,
    estacionDeDashboard,
    estacionDeJuego,
    tipoDeKind,
} from "../internas";
import type { AppServerSummary } from "@/lib/servers/app-servers";
import type { ResumenEspacio } from "@/lib/vivo/tabla/espacio";

function servidor(parcial: Partial<AppServerSummary> = {}): AppServerSummary {
    return {
        id: "s1",
        slug: "mi-servidor",
        name: "Mi servidor",
        description: "Una app pública",
        kind: "app",
        visibility: "public",
        groupSlug: null,
        appRoute: "/apps/ciencia",
        appUrl: null,
        icon: null,
        payload: {},
        owner: "u1",
        createdAt: "2026-10-01T10:00:00.000Z",
        memberCount: 3,
        myStatus: null,
        myRole: null,
        isOwner: false,
        ...parcial,
    };
}

const resumen = (p: Partial<ResumenEspacio> = {}): ResumenEspacio => ({
    refId: "d1",
    titulo: "Dashboard del clima",
    actualizado: "2026-10-06T12:00:00.000Z",
    esMio: true,
    pendiente: false,
    ...p,
});

describe("tipoDeKind", () => {
    it("mapea cada kind", () => {
        expect(tipoDeKind("juego")).toBe("juego");
        expect(tipoDeKind("programa")).toBe("programa");
        expect(tipoDeKind("entorno")).toBe("xr");
        expect(tipoDeKind("app")).toBe("app");
        expect(tipoDeKind("otro")).toBe("app");
    });
});

describe("estacionDeServidor", () => {
    it("usa appRoute y latido de la fecha de creación", () => {
        const e = estacionDeServidor(servidor());
        expect(e.id).toBe("interna:servidor:s1");
        expect(e.fuente).toBe("starseed");
        expect(e.licencia).toBe("propia-abierta");
        expect(e.tipo).toBe("app");
        expect(e.enlace).toBe("/apps/ciencia");
        expect(e.ultimo_latido).toBe("2026-10-01T10:00:00.000Z");
        expect(e.formato).toBe("interno");
    });

    it("cae en el panel de /servidores-apps cuando no hay appRoute", () => {
        const e = estacionDeServidor(servidor({ appRoute: null, kind: "entorno" }));
        expect(e.tipo).toBe("xr");
        expect(e.enlace).toBe("/servidores-apps?panel=mi-servidor");
    });
});

describe("estacionDeDashboard / estacionDeJuego", () => {
    it("dashboard con su ruta y latido", () => {
        const e = estacionDeDashboard(resumen());
        expect(e.id).toBe("interna:dashboard:d1");
        expect(e.tipo).toBe("dashboard");
        expect(e.enlace).toBe("/dashboard-compartido/d1");
        expect(e.ultimo_latido).toBe("2026-10-06T12:00:00.000Z");
    });

    it("juego sin latido propio", () => {
        const e = estacionDeJuego({ refId: "j1", titulo: "Ajedrez con Ana" });
        expect(e.id).toBe("interna:juego:j1");
        expect(e.tipo).toBe("juego");
        expect(e.enlace).toBe("/juego/j1");
        expect(e.ultimo_latido).toBeNull();
    });
});

describe("estacionesInternas", () => {
    it("combina las tres fuentes", async () => {
        const lista = await estacionesInternas({
            listServers: async () => [servidor()],
            listarDashboardsVivos: async () => [resumen()],
            listarJuegosVivos: async () => [{ refId: "j1", titulo: "Sala" }],
        });
        expect(lista.map((e) => e.id)).toEqual([
            "interna:servidor:s1",
            "interna:dashboard:d1",
            "interna:juego:j1",
        ]);
    });

    it("la fuente que lanza se salta y nunca se propaga el error", async () => {
        const lista = await estacionesInternas({
            listServers: async () => {
                throw new Error("sin red");
            },
            listarDashboardsVivos: async () => [resumen()],
            listarJuegosVivos: async () => {
                throw new Error("sin sesión");
            },
        });
        expect(lista).toHaveLength(1);
        expect(lista[0].id).toBe("interna:dashboard:d1");
    });

    it("listas vacías devuelven vacío", async () => {
        const lista = await estacionesInternas({
            listServers: async () => [],
            listarDashboardsVivos: async () => [],
            listarJuegosVivos: async () => [],
        });
        expect(lista).toEqual([]);
    });
});
