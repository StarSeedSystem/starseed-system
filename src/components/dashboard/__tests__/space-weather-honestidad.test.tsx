import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
    hayLectura,
    numeroDe,
    lecturaDe,
    lecturasDisponibles,
    SelloHora,
    SpaceWeatherWidget,
} from "../widgets/space/space-weather-widget";
import { SpaceWeatherApp } from "../widgets/space/space-weather-app";
import type {
    SpaceMetric,
    SpaceWeatherSnapshot,
} from "../apps/data-sources/space-weather-sources";

// ════════════════════════════════════════════════════════════════
// Honestidad del clima espacial (Ola 305)
// ----------------------------------------------------------------
// Lo que se protege aquí: ninguna cifra de relleno se pinta como
// telemetría real, y toda magnitud visible lleva su hora de lectura
// (marcada como antigua si supera la hora).
// ════════════════════════════════════════════════════════════════

afterEach(() => {
    cleanup();
});

/** Magnitud sin lectura, tal y como la compone la fuente ("—", raw null). */
function sinLectura(label: string, unit?: string): SpaceMetric {
    return { label, value: "—", raw: null, unit, severity: "calm" };
}

/** Marca temporal de NOAA (UTC implícito, sin zona) de hace N minutos. */
function marcaHace(minutos: number): string {
    return new Date(Date.now() - minutos * 60_000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");
}

/** Snapshot completo SIN ninguna lectura: la fuente respondió vacía. */
function snapshotSinLecturas(): SpaceWeatherSnapshot {
    return {
        solarWind: {
            speed: sinLectura("Velocidad", "km/s"),
            density: sinLectura("Densidad", "p/cm³"),
            temperature: sinLectura("Temperatura", "K"),
            bt: sinLectura("Bt (total)", "nT"),
            bz: sinLectura("Bz (IMF)", "nT"),
            speedSeries: [],
            bzSeries: [],
        },
        geomagnetic: {
            kp: sinLectura("Índice Kp"),
            gScale: sinLectura("Tormenta geomagnética"),
            kpSeries: [],
        },
        radiation: {
            flare: sinLectura("Llamarada (rayos X)"),
            rScale: sinLectura("Apagón de radio"),
            sScale: sinLectura("Tormenta de radiación"),
            protonFlux: sinLectura("Flujo de protones", "pfu"),
            xraySeries: [],
        },
        indices: {
            f107: sinLectura("Flujo F10.7", "sfu"),
            sunspots: sinLectura("Manchas solares", "SSN"),
        },
        aurora: sinLectura("Aurora (potencia)", "GW"),
        fetchedAt: Date.now(),
    };
}

// ── Ninguna cifra de relleno ─────────────────────────────────────
describe("Clima espacial · sin cifras inventadas", () => {
    it("el guion de «sin dato» no cuenta como lectura", () => {
        expect(hayLectura(sinLectura("Índice Kp"))).toBe(false);
    });

    it("una lectura real de la fuente sí cuenta", () => {
        expect(hayLectura({ label: "Índice Kp", value: "3,67", raw: 3.67 })).toBe(true);
    });

    it("sin número crudo no hay gauge: numeroDe devuelve null, nunca 0", () => {
        expect(numeroDe(sinLectura("Índice Kp"))).toBeNull();
        // Las escalas R/S llegan con raw null aunque tengan valor: tampoco
        // pueden alimentar un gauge con un cero inventado.
        expect(numeroDe({ label: "Apagón de radio", value: "R1", raw: null })).toBeNull();
        expect(numeroDe({ label: "Índice Kp", value: "0", raw: 0 })).toBe(0);
    });

    it("si la fuente responde sin ninguna lectura, el widget queda vacío", () => {
        expect(lecturasDisponibles(snapshotSinLecturas())).toHaveLength(0);
    });

    it("solo se listan las magnitudes que traen lectura real", () => {
        const snap = snapshotSinLecturas();
        snap.geomagnetic.kp = { label: "Índice Kp", value: "3,67", raw: 3.67 };
        const disponibles = lecturasDisponibles(snap);
        expect(disponibles).toHaveLength(1);
        expect(disponibles[0].label).toBe("Índice Kp");
    });
});

// ── Cada magnitud con su hora ────────────────────────────────────
describe("Clima espacial · hora de lectura", () => {
    it("usa la marca de la fuente en UTC cuando existe", () => {
        const lectura = lecturaDe(marcaHace(10), Date.now());
        expect(lectura.etiqueta).toMatch(/^Medida \d{2}:\d{2} UTC$/);
        expect(lectura.antigua).toBe(false);
    });

    it("una lectura de hace más de una hora se marca como antigua", () => {
        expect(lecturaDe(marcaHace(90), Date.now()).antigua).toBe(true);
    });

    it("sin marca de la fuente dice cuándo se consultó, no cuándo se midió", () => {
        const lectura = lecturaDe(undefined, Date.now());
        expect(lectura.etiqueta).toMatch(/^Consultada \d{2}:\d{2}$/);
        expect(lectura.antigua).toBe(false);
    });

    it("una consulta vieja también queda marcada como antigua", () => {
        expect(lecturaDe(undefined, Date.now() - 2 * 3_600_000).antigua).toBe(true);
    });

    it("una marca ilegible no inventa fecha: cae en la hora de consulta", () => {
        expect(lecturaDe("no-es-una-fecha", Date.now()).etiqueta).toMatch(/^Consultada /);
    });
});

// ── El sello visible ─────────────────────────────────────────────
describe("SelloHora", () => {
    it("pinta la hora de la lectura", () => {
        render(<SelloHora lectura={{ etiqueta: "Medida 21:00 UTC", antigua: false }} />);
        expect(screen.getByText("Medida 21:00 UTC")).toBeInTheDocument();
    });

    it("avisa cuando la lectura es antigua", () => {
        render(<SelloHora lectura={{ etiqueta: "Medida 19:00 UTC", antigua: true }} />);
        expect(screen.getByText("Medida 19:00 UTC · antigua")).toBeInTheDocument();
    });
});

// ── La familia sigue siendo la misma ─────────────────────────────
// El encargo era honestidad de estados, no rediseño: los dos módulos
// conservan su nombre exportado y siguen siendo componentes.
describe("Clima espacial · superficie pública intacta", () => {
    it("el widget y su vista app conservan su nombre exportado", () => {
        expect(typeof SpaceWeatherWidget).toBe("function");
        expect(typeof SpaceWeatherApp).toBe("function");
    });
});
