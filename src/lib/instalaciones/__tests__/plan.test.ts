import { describe, expect, it } from "vitest";

import { APPS_OFICIALES, instalables, mejorInstalable } from "@/lib/apps-oficiales/apps-oficiales";

import type { DestinoInstalacion } from "../destinos";
import {
    CARPETA_DESCARGAS,
    appPorId,
    planAceptarPedido,
    planInstalacion,
    resumenSeleccion,
    vistoHace,
    type ContextoPlan,
    type SeleccionInstalacion,
} from "../plan";

const AHORA = 1_000_000;
const omni = appPorId("omnifrecuencias")!;
const cafe = appPorId("cafe")!;
const apk = mejorInstalable(instalables(APPS_OFICIALES.omnifrecuencias.respaldo.assets), { sistema: "android", arquitectura: "arm64" });

let n = 0;
const ctxBase = (extra: Partial<ContextoPlan> = {}): ContextoPlan => ({
    estaNeurona: { id: "yo", nombre: "Móvil de Alex" },
    neuronas: [
        { id: "mac", nombre: "MacBook" },
        { id: "ana", nombre: "Móvil de Ana" },
    ],
    instalable: null,
    ahora: AHORA,
    nuevoId: () => `id-${++n}`,
    ...extra,
});
const sel = (extra: Partial<SeleccionInstalacion> = {}): SeleccionInstalacion => ({
    web: false,
    esteDispositivo: false,
    otrasNeuronas: [],
    perfil: null,
    ...extra,
});

describe("appPorId", () => {
    it("une el listado de la Librería con la app oficial", () => {
        expect(omni).toEqual({
            id: "omnifrecuencias",
            nombre: "Omnifrecuencias",
            web: "https://omnifrecuencias.vercel.app",
            ruta: "/omnifrecuencias",
            oficialId: "omnifrecuencias",
        });
        expect(cafe.oficialId).toBeUndefined();
        expect(appPorId("no-existe")).toBeNull();
    });
});

describe("planInstalacion", () => {
    it("web: destino instalado en la biblioteca, sin descargas", () => {
        const p = planInstalacion(omni, sel({ web: true }), ctxBase({ version: "v2.0.0" }));
        expect(p.destinos).toEqual([
            expect.objectContaining({ tipo: "web", estado: "instalada", medio: "web", version: "v2.0.0", perfilId: null, creada: AHORA }),
        ]);
        expect(p.acciones).toEqual([{ tipo: "guardar-biblioteca", url: "/omnifrecuencias" }]);
        expect(p.resumen).toBe("Se instalará en: web · biblioteca de la cuenta");
    });

    it("este dispositivo con instalador: descarga, Lanzador y destino «descargada» en Descargas", () => {
        const p = planInstalacion(
            omni,
            sel({ esteDispositivo: true, carpetaBiblioteca: "Música" }),
            ctxBase({ instalable: apk, version: "v2.0.0" }),
        );
        expect(p.acciones).toEqual([
            { tipo: "descargar", url: apk!.url, archivo: "OmniFrequency.apk", via: "enlace" },
            { tipo: "anadir-lanzador" },
        ]);
        expect(p.destinos[0]).toMatchObject({
            tipo: "neurona",
            neuronaId: "yo",
            estado: "descargada",
            medio: "descarga",
            archivo: "OmniFrequency.apk",
            version: "v2.0.0",
        });
        // Honestidad: el instalador va a Descargas; la carpeta elegida solo se anota.
        expect(p.destinos[0].carpeta).toBe(`${CARPETA_DESCARGAS} (para mover a «Música»)`);
    });

    it("en la app nativa la descarga se abre en una ventana", () => {
        const p = planInstalacion(omni, sel({ esteDispositivo: true }), ctxBase({ instalable: apk, esNativa: true }));
        expect(p.acciones[0]).toMatchObject({ tipo: "descargar", via: "ventana" });
    });

    it("este dispositivo sin instalador (o app sin releases): Lanzador y web", () => {
        const p = planInstalacion(cafe, sel({ esteDispositivo: true }), ctxBase());
        expect(p.acciones).toEqual([{ tipo: "anadir-lanzador" }]);
        expect(p.destinos[0]).toMatchObject({ tipo: "neurona", estado: "instalada", medio: "web" });
        expect(p.destinos[0].carpeta).toBeUndefined();
    });

    it("otras neuronas: un pedido por neurona, con quién lo pidió y el perfil", () => {
        const p = planInstalacion(
            omni,
            sel({ otrasNeuronas: ["mac", "ana", "yo"], perfil: { id: "p1", nombre: "Arte" } }),
            ctxBase({ version: "v2.0.0" }),
        );
        expect(p.destinos).toHaveLength(2);
        expect(p.destinos.map((x) => [x.neuronaId, x.neuronaNombre, x.estado, x.pedidaDesde, x.perfilNombre])).toEqual([
            ["mac", "MacBook", "pedida", "Móvil de Alex", "Arte"],
            ["ana", "Móvil de Ana", "pedida", "Móvil de Alex", "Arte"],
        ]);
        expect(p.acciones).toEqual([{ tipo: "avisar-neuronas", neuronaIds: ["mac", "ana"] }]);
        expect(p.resumen).toBe("Se instalará en: MacBook · Móvil de Ana · perfil Arte");
    });

    it("reinstalar en el mismo sitio actualiza el destino en vez de duplicarlo", () => {
        const previo: DestinoInstalacion = {
            id: "viejo",
            appId: "omnifrecuencias",
            appNombre: "Omnifrecuencias",
            tipo: "web",
            estado: "cancelada",
            perfilId: null,
            creada: 5,
            actualizada: AHORA + 50,
        };
        const p = planInstalacion(omni, sel({ web: true }), ctxBase({ existentes: [previo] }));
        expect(p.destinos[0]).toMatchObject({ id: "viejo", creada: 5, estado: "instalada", actualizada: AHORA + 51 });
    });

    it("sin nada marcado el plan queda vacío", () => {
        const p = planInstalacion(omni, sel(), ctxBase());
        expect(p.vacio).toBe(true);
        expect(p.resumen).toBe("Elige al menos un sitio donde instalarla.");
    });
});

describe("resumenSeleccion", () => {
    it("combina todos los sitios", () => {
        expect(
            resumenSeleccion(sel({ web: true, esteDispositivo: true, otrasNeuronas: ["ana"], perfil: { id: "p", nombre: "Arte" } }), ctxBase()),
        ).toBe("Se instalará en: web · este dispositivo (Móvil de Alex) · Móvil de Ana · perfil Arte");
    });

    it("sin nombre de esta neurona todavía, no inventa uno pero guarda el destino por su id", () => {
        const ctx = ctxBase({ estaNeurona: { id: "yo", nombre: "" } });
        expect(resumenSeleccion(sel({ esteDispositivo: true }), ctx)).toBe("Se instalará en: este dispositivo · biblioteca de la cuenta");
        const p = planInstalacion(cafe, sel({ esteDispositivo: true, otrasNeuronas: ["mac"] }), ctx);
        expect(p.destinos[0]).toMatchObject({ neuronaId: "yo", neuronaNombre: undefined });
        expect(p.destinos[1].pedidaDesde).toBeUndefined();
    });
});

describe("planAceptarPedido", () => {
    const pedido: DestinoInstalacion = {
        id: "p",
        appId: "omnifrecuencias",
        appNombre: "Omnifrecuencias",
        tipo: "neurona",
        neuronaId: "yo",
        estado: "pedida",
        version: "v1.0.0",
        creada: 1,
        actualizada: 1,
    };

    it("con instalador: mismo camino que «Este dispositivo»", () => {
        const r = planAceptarPedido(pedido, apk, { version: "v2.0.0" });
        expect(r.estado).toBe("descargada");
        expect(r.extra).toEqual({ medio: "descarga", archivo: "OmniFrequency.apk", version: "v2.0.0", carpeta: CARPETA_DESCARGAS });
        expect(r.acciones.map((a) => a.tipo)).toEqual(["descargar", "anadir-lanzador"]);
    });

    it("sin instalador: Lanzador y web, conserva la versión pedida", () => {
        const r = planAceptarPedido(pedido, null);
        expect(r.estado).toBe("instalada");
        expect(r.extra).toMatchObject({ medio: "web", version: "v1.0.0" });
        expect(r.acciones).toEqual([{ tipo: "anadir-lanzador" }]);
    });
});

describe("vistoHace", () => {
    const t = Date.parse("2026-09-25T12:00:00Z");
    it("dice cuándo se vio por última vez", () => {
        expect(vistoHace(undefined, true, t)).toBe("en línea");
        expect(vistoHace("2026-09-25T11:55:00Z", false, t)).toBe("visto hace 5 min");
        expect(vistoHace("2026-09-25T09:00:00Z", false, t)).toBe("visto hace 3 h");
        expect(vistoHace("2026-09-24T12:00:00Z", false, t)).toBe("visto hace 1 día");
        expect(vistoHace("2026-09-20T12:00:00Z", false, t)).toBe("visto hace 5 días");
        expect(vistoHace(undefined, false, t)).toBe("sin datos de conexión");
    });
});
