import { describe, expect, it } from "vitest";
import {
    alturaDe, alturaLuna, ascendente, ecuatorialDesdeEcliptica, horaPlanetaria, horasDelSol, horasDoradas, medioCielo,
    nombreEclipse, nombreEstacion, posicionesPlanetas, proximaEstacion, proximasFases, proximoEclipse, regenteDelDia,
    salidaPuestaLuna, signosDelCielo, tiempoSidereoLocal,
} from "../cielo";

const minutos = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000;
const MADRID = { lat: 40.4168, lon: -3.7038 };
const lonDe = (clave: string, iso: string) => posicionesPlanetas(new Date(iso)).find((p) => p.clave === clave)!;
const separacion = (a: number, b: number) => { const x = Math.abs(a - b) % 360; return Math.min(x, 360 - x); };

describe("fases principales (Meeus)", () => {
    it("abril de 2024 al minuto: nueva del eclipse, cuartos y llena", () => {
        const f = proximasFases(new Date("2024-04-05T00:00:00Z"), 4);
        expect(f.map((x) => x.tipo)).toEqual(["nueva", "creciente", "llena", "menguante"]);
        expect(minutos(f[0].fecha, new Date("2024-04-08T18:21:00Z"))).toBeLessThan(10);
        expect(minutos(f[1].fecha, new Date("2024-04-15T19:13:00Z"))).toBeLessThan(10);
        expect(minutos(f[2].fecha, new Date("2024-04-23T23:49:00Z"))).toBeLessThan(10);
        expect(minutos(f[3].fecha, new Date("2024-05-01T11:27:00Z"))).toBeLessThan(10);
    });
    it("siempre en el futuro y en orden", () => {
        const desde = new Date("2026-09-29T10:00:00Z");
        const f = proximasFases(desde, 6);
        expect(f).toHaveLength(6);
        f.forEach((x, i) => { expect(x.fecha.getTime()).toBeGreaterThan(desde.getTime()); if (i) expect(x.fecha.getTime()).toBeGreaterThan(f[i - 1].fecha.getTime()); });
    });
});

describe("eclipses (Meeus, cap. 54)", () => {
    const casos: [string, "sol" | "luna" | undefined, string, string][] = [
        ["2024-01-01", undefined, "Eclipse penumbral de Luna", "2024-03-25T07:13:00Z"],
        ["2024-04-01", "sol", "Eclipse total de Sol", "2024-04-08T18:17:00Z"],
        ["2025-03-20", undefined, "Eclipse parcial de Sol", "2025-03-29T10:47:00Z"],
        ["2026-02-20", undefined, "Eclipse total de Luna", "2026-03-03T11:33:00Z"],
        ["2026-08-01", undefined, "Eclipse total de Sol", "2026-08-12T17:46:00Z"],
        ["2026-09-29", undefined, "Eclipse anular de Sol", "2027-02-06T16:00:00Z"],
        ["2026-09-29", "luna", "Eclipse penumbral de Luna", "2027-02-20T23:13:00Z"],
    ];
    it.each(casos)("después de %s (%s): %s", (desde, tipo, nombre, cuando) => {
        const e = proximoEclipse(new Date(`${desde}T00:00:00Z`), tipo)!;
        expect(nombreEclipse(e)).toBe(nombre);
        expect(minutos(e.fecha, new Date(cuando))).toBeLessThan(30);
    });
});

describe("estaciones", () => {
    it("solsticio de diciembre de 2026 y equinoccio de marzo de 2027 (±1 h)", () => {
        const s = proximaEstacion(new Date("2026-09-29T00:00:00Z"));
        expect(s).toMatchObject({ tipo: "solsticio", lon: 270 });
        expect(minutos(s.fecha, new Date("2026-12-21T20:50:00Z"))).toBeLessThan(60);
        const e = proximaEstacion(new Date(s.fecha.getTime() + 3_600_000));
        expect(e).toMatchObject({ tipo: "equinoccio", lon: 0 });
        expect(minutos(e.fecha, new Date("2027-03-20T20:24:00Z"))).toBeLessThan(60);
    });
    it("el nombre depende del hemisferio", () => {
        expect(nombreEstacion(270, 40)).toBe("invierno");
        expect(nombreEstacion(270, -33)).toBe("verano");
        expect(nombreEstacion(0)).toBe("primavera");
    });
});

describe("planetas", () => {
    it("gran conjunción Júpiter-Saturno del 21-12-2020 a 0° de Acuario", () => {
        const j = lonDe("jupiter", "2020-12-21T18:00:00Z"), s = lonDe("saturno", "2020-12-21T18:00:00Z");
        expect(separacion(j.lon, s.lon)).toBeLessThan(0.8);
        expect(separacion(j.lon, 300.3)).toBeLessThan(1.5);
        expect(j.signo.nombre).toBe("Acuario");
    });
    it("oposiciones: Marte (13-10-2020) y Júpiter (3-11-2023), ambos retrógrados", () => {
        for (const [clave, iso] of [["marte", "2020-10-13T23:00:00Z"], ["jupiter", "2023-11-03T05:00:00Z"]] as const) {
            const p = lonDe(clave, iso), sol = lonDe("sol", iso);
            expect(separacion(p.lon, sol.lon + 180)).toBeLessThan(1.5);
            expect(p.retrogrado).toBe(true);
        }
    });
    it("Mercurio retrógrado en abril de 2024 y directo a mediados de mayo", () => {
        expect(lonDe("mercurio", "2024-04-10T00:00:00Z").retrogrado).toBe(true);
        expect(lonDe("mercurio", "2024-05-15T00:00:00Z").retrogrado).toBe(false);
        expect(lonDe("venus", "2025-03-20T00:00:00Z").retrogrado).toBe(true);
    });
    it("el Sol y la Luna coinciden con signosDelCielo y nunca retrogradan", () => {
        const f = new Date("2026-09-29T12:00:00Z");
        const pos = posicionesPlanetas(f), s = signosDelCielo(f);
        expect(pos.find((p) => p.clave === "sol")!.signo.nombre).toBe(s.sol.nombre);
        expect(pos.find((p) => p.clave === "luna")!.signo.nombre).toBe(s.luna.nombre);
        expect(pos.filter((p) => p.clave === "sol" || p.clave === "luna").every((p) => !p.retrogrado)).toBe(true);
        pos.forEach((p) => { expect(p.grado).toBeGreaterThanOrEqual(0); expect(p.grado).toBeLessThan(30); });
    });
});

describe("ascendente y medio cielo", () => {
    it("el ascendente está en el horizonte, por el este (Madrid, Tokio, Buenos Aires)", () => {
        for (const [lat, lon, iso] of [[40.4168, -3.7038, "2026-09-29T12:00:00Z"], [35.68, 139.69, "2025-01-15T03:30:00Z"], [-34.6, -58.38, "2024-06-21T22:10:00Z"]] as const) {
            const f = new Date(iso);
            const { ra, dec } = ecuatorialDesdeEcliptica(ascendente(f, lat, lon));
            expect(Math.abs(alturaDe(ra, dec, f, lat, lon))).toBeLessThan(0.05);
            expect(Math.sin(tiempoSidereoLocal(f, lon) - ra)).toBeLessThan(0); // ángulo horario negativo = saliendo
        }
    });
    it("el medio cielo culmina: su ángulo horario es cero", () => {
        const f = new Date("2026-09-29T12:00:00Z");
        const { ra } = ecuatorialDesdeEcliptica(medioCielo(f, MADRID.lon));
        expect(Math.abs(Math.sin(tiempoSidereoLocal(f, MADRID.lon) - ra))).toBeLessThan(0.001);
    });
});

describe("hora planetaria", () => {
    it("el martes 29-9-2026 lo rige Marte y a mediodía corre la sexta hora (Saturno)", () => {
        const h = horaPlanetaria(new Date("2026-09-29T12:00:00Z"), MADRID.lat, MADRID.lon)!;
        expect(h.regenteDia).toBe("marte");
        expect(h).toMatchObject({ planeta: "saturno", indice: 5, deDia: true });
        expect(h.inicio.getTime()).toBeLessThanOrEqual(Date.parse("2026-09-29T12:00:00Z"));
        expect(h.fin.getTime()).toBeGreaterThan(Date.parse("2026-09-29T12:00:00Z"));
    });
    it("la primera hora del día es del regente; la primera de la noche del domingo, de Júpiter", () => {
        const { orto, ocaso } = horasDelSol(new Date("2026-09-27T12:00:00Z"), MADRID.lat, MADRID.lon);
        expect(horaPlanetaria(new Date(orto!.getTime() + 60_000), MADRID.lat, MADRID.lon)).toMatchObject({ planeta: "sol", indice: 0 });
        expect(horaPlanetaria(new Date(ocaso!.getTime() + 60_000), MADRID.lat, MADRID.lon)).toMatchObject({ planeta: "jupiter", indice: 12, deDia: false });
    });
    it("de madrugada sigue siendo la noche del día anterior", () => {
        const h = horaPlanetaria(new Date("2026-09-30T02:00:00Z"), MADRID.lat, MADRID.lon)!;
        expect(h.deDia).toBe(false);
        expect(h.regenteDia).toBe("marte");
    });
    it("sin orto (noche polar) no hay hora; el regente del día no necesita lugar", () => {
        expect(horaPlanetaria(new Date("2024-12-21T12:00:00Z"), 78.2, 15.6)).toBeNull();
        expect(regenteDelDia(new Date(2026, 8, 27, 12))).toBe("sol");
    });
});

describe("la Luna en el horizonte y las horas doradas", () => {
    it("salida y puesta: la altura cruza +0,125° en el instante calculado", () => {
        const f = new Date("2026-09-29T12:00:00Z");
        const { salida, puesta } = salidaPuestaLuna(f, MADRID.lat, MADRID.lon);
        expect(salida && puesta).toBeTruthy();
        for (const t of [salida!, puesta!]) {
            expect(Math.abs(alturaLuna(t, MADRID.lat, MADRID.lon) - 0.125)).toBeLessThan(0.3);
            expect(t.getTime()).toBeGreaterThan(f.getTime());
        }
    });
    it("la hora dorada rodea el orto y el ocaso", () => {
        const f = new Date("2026-09-29T12:00:00Z");
        const { orto, ocaso } = horasDelSol(f, MADRID.lat, MADRID.lon);
        const { manana, tarde } = horasDoradas(f, MADRID.lat, MADRID.lon);
        expect(manana!.inicio.getTime()).toBeLessThan(orto!.getTime());
        expect(manana!.fin.getTime()).toBeGreaterThan(orto!.getTime());
        expect(tarde!.inicio.getTime()).toBeLessThan(ocaso!.getTime());
        expect(tarde!.fin.getTime()).toBeGreaterThan(ocaso!.getTime());
    });
});
