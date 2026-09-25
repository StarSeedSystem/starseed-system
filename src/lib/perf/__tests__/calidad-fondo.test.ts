/**
 * Calidad adaptativa del fondo animado (2026-09-24): niveles, techo por equipo y el
 * gobernador que baja/sube en vivo según la fluidez de la página.
 */
import { describe, expect, it } from "vitest";

import {
    ESPERA_ENTRE_CAMBIOS_MS,
    HOLGURA_PARA_SUBIR_MS,
    PERFILES,
    bajarUno,
    escalaEfectiva,
    gobernar,
    leerPreferencia,
    masLigera,
    subirUno,
    techoYArranque,
    type EstadoGobernador,
} from "@/lib/perf/calidad-fondo";

describe("niveles", () => {
    it("cada nivel más bajo pinta menos píxeles, siempre a su ritmo (sin tope de fps)", () => {
        expect(escalaEfectiva(PERFILES.alta, 2)).toBe(2);
        expect(escalaEfectiva(PERFILES.media, 2)).toBe(0.75);
        expect(escalaEfectiva(PERFILES.baja, 2)).toBe(0.5);
        expect(escalaEfectiva(PERFILES.minima, 2)).toBe(0.35);
        // (2026-09-25) La calidad es de píxeles, no de ritmo ni de duración.
        for (const p of Object.values(PERFILES)) expect(p.fps).toBe(0);
    });

    it("la escala nunca supera la del monitor ni 2", () => {
        expect(escalaEfectiva(PERFILES.alta, 3)).toBe(2);
        expect(escalaEfectiva(PERFILES.alta, 1)).toBe(1);
        expect(escalaEfectiva(PERFILES.media, 1)).toBe(0.75);
    });

    it("bajar, subir y la más ligera", () => {
        expect(bajarUno("alta")).toBe("media");
        expect(bajarUno("minima")).toBe("minima");
        expect(subirUno("baja", "alta")).toBe("media");
        expect(subirUno("media", "media")).toBe("media");
        expect(masLigera("alta", "baja")).toBe("baja");
    });
});

describe("techo y arranque según el equipo", () => {
    it("un equipo potente puede llegar a alta, pero arranca en media y sube si sobra", () => {
        const r = techoYArranque({ memoriaGb: 8, nucleos: 8, gpu: "Apple M1", pixelesAlta: 4_700_000 });
        expect(r.techo).toBe("alta");
        expect(r.arranque).toBe("media");
    });

    it("GPU por software se queda en mínima", () => {
        expect(techoYArranque({ gpu: "Google SwiftShader" }).techo).toBe("minima");
    });

    it("móvil modesto, ahorro o pantallas enormes limitan el techo", () => {
        expect(techoYArranque({ tactil: true, memoriaGb: 4 }).techo).toBe("baja");
        expect(techoYArranque({ ahorro: true }).techo).toBe("baja");
        expect(techoYArranque({ pixelesAlta: 12_000_000 }).techo).toBe("media");
    });
});

describe("gobernador en vivo", () => {
    const base: EstadoGobernador = { actual: "alta", ultimoCambio: 0, holguraDesde: null };
    const ahora = 100_000;

    it("baja un nivel cuando la página se atasca", () => {
        const e = gobernar(base, { fpsPagina: 38, tareasLargas: 0, refresco: 60 }, "alta", null, ahora);
        expect(e.actual).toBe("media");
    });

    it("las tareas largas del hilo principal también cuentan como atasco", () => {
        const e = gobernar(base, { fpsPagina: 59, tareasLargas: 3, refresco: 60 }, "alta", null, ahora);
        expect(e.actual).toBe("media");
    });

    it("no da bandazos: espera entre cambios", () => {
        const reciente = { ...base, ultimoCambio: ahora - ESPERA_ENTRE_CAMBIOS_MS / 2 };
        expect(gobernar(reciente, { fpsPagina: 20, tareasLargas: 0, refresco: 60 }, "alta", null, ahora).actual).toBe("alta");
    });

    it("sube solo tras un rato seguido de holgura y sin pasar del techo", () => {
        const baja: EstadoGobernador = { actual: "baja", ultimoCambio: 0, holguraDesde: ahora - HOLGURA_PARA_SUBIR_MS - 1 };
        expect(gobernar(baja, { fpsPagina: 60, tareasLargas: 0, refresco: 60 }, "media", null, ahora).actual).toBe("media");
        const enTecho: EstadoGobernador = { ...baja, actual: "media" };
        expect(gobernar(enTecho, { fpsPagina: 60, tareasLargas: 0, refresco: 60 }, "media", null, ahora).actual).toBe("media");
        const sinHolgura: EstadoGobernador = { actual: "baja", ultimoCambio: 0, holguraDesde: null };
        expect(gobernar(sinHolgura, { fpsPagina: 60, tareasLargas: 0, refresco: 60 }, "alta", null, ahora).actual).toBe("baja");
    });

    it("un límite del sistema (p. ej. la voz) se aplica al instante", () => {
        const e = gobernar({ ...base, ultimoCambio: ahora }, { fpsPagina: 60, tareasLargas: 0, refresco: 60 }, "alta", "baja", ahora);
        expect(e.actual).toBe("baja");
    });

    it("en pantallas de 120 Hz se mide contra 60 fps", () => {
        const e = gobernar(base, { fpsPagina: 58, tareasLargas: 0, refresco: 120 }, "alta", null, ahora);
        expect(e.actual).toBe("alta");
    });
});

describe("preferencia guardada", () => {
    it("valores raros cuentan como automática", () => {
        expect(leerPreferencia(null)).toBe("auto");
        expect(leerPreferencia("ultra")).toBe("auto");
        expect(leerPreferencia("baja")).toBe("baja");
    });
});
