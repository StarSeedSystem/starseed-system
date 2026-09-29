import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearFuente, MARGEN_FORZADO_MS, RESPIRO_ERROR_MS, TTL_MINIMO_MS, claveCoordenadas } from "../datos/cache-compartida";
import { analizarAire, analizarPronostico, diaDeHoy, horaDeAyer, indiceAhora, proximasHoras, urlPronostico } from "../datos/open-meteo";
import {
    analizarEscalas, analizarKpPrevision, analizarLlamaradas, analizarMagnetometro, analizarPlasma, analizarRayosX, analizarRegiones,
    analizarVientoResumen, msUtc, reducirAurora, resumirKp,
} from "../datos/noaa";
import {
    avisosClima, beaufort, claseRayos, confortRocio, escalaG, explicarKp, familiaCielo, fraseProximas, latitudGeomagnetica, lineaAuroraKp,
    nivelAire, nivelUv, probabilidadCombinada, procedencia, rumbo, textoCielo,
} from "../datos/interpretar";
import {
    aireJson, escalasJson, kpPrevisionJson, llamaradasJson, magnetometroJson, ovationJson, plasmaJson, pronosticoJson, rayosJson, regionesJson,
} from "../__pruebas__/fixtures";

// ── Caché compartida ─────────────────────────────────────────────────
describe("crearFuente · una petición para todos", () => {
    const almacen = new Map<string, string>();
    beforeEach(() => {
        almacen.clear();
        vi.stubGlobal("window", {
            localStorage: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v) },
            addEventListener: () => {},
        });
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

    it("sube el TTL a 15 min como mínimo", () => {
        const f = crearFuente<void, number>({ nombre: "t-ttl", ttlMs: 1000, clave: () => "x", cargar: async () => 1 });
        expect(f.ttlMs).toBe(TTL_MINIMO_MS);
    });

    it("comparte la petición en vuelo y no repite dentro del TTL", async () => {
        const cargar = vi.fn(async () => 42);
        const f = crearFuente<void, number>({ nombre: "t-dedupe", ttlMs: TTL_MINIMO_MS, clave: () => "x", cargar });
        const [a, b] = await Promise.all([f.obtener(), f.obtener()]);
        expect(a).toBe(42);
        expect(b).toBe(42);
        await f.obtener();
        expect(cargar).toHaveBeenCalledTimes(1);
        expect(f.leer().datos).toBe(42);
    });

    it("guarda en el almacén y otra instancia lo lee sin red", async () => {
        const f1 = crearFuente<void, number>({ nombre: "t-alm", ttlMs: TTL_MINIMO_MS, clave: () => "x", cargar: async () => 7 });
        await f1.obtener();
        const cargar = vi.fn(async () => 8);
        const f2 = crearFuente<void, number>({ nombre: "t-alm", ttlMs: TTL_MINIMO_MS, clave: () => "x", cargar });
        expect(f2.leer().datos).toBe(7);
        expect(await f2.obtener()).toBe(7);
        expect(cargar).not.toHaveBeenCalled();
    });

    it("tras un fallo respira 5 min, conserva el dato viejo y deja forzar pasado el margen", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
        let n = 0;
        const cargar = vi.fn(async () => { n++; if (n > 1) throw new Error("caída"); return n; });
        const f = crearFuente<void, number>({ nombre: "t-err", ttlMs: TTL_MINIMO_MS, clave: () => "x", cargar });
        await f.obtener();
        vi.setSystemTime(Date.now() + TTL_MINIMO_MS + 1000);
        expect(await f.obtener()).toBe(1);
        expect(f.leer().error).toBe("caída");
        await f.obtener();
        expect(cargar).toHaveBeenCalledTimes(2);
        vi.setSystemTime(Date.now() + RESPIRO_ERROR_MS + 1000);
        await f.obtener();
        expect(cargar).toHaveBeenCalledTimes(3);
    });

    it("«forzar» no dispara otra petición si el dato es de hace segundos", async () => {
        const cargar = vi.fn(async () => 1);
        const f = crearFuente<void, number>({ nombre: "t-forzar", ttlMs: TTL_MINIMO_MS, clave: () => "x", cargar });
        await f.obtener();
        await f.obtener(undefined, { forzar: true });
        expect(cargar).toHaveBeenCalledTimes(1);
        expect(MARGEN_FORZADO_MS).toBeGreaterThanOrEqual(30_000);
    });

    it("redondea coordenadas para compartir caché entre vecinos", () => {
        expect(claveCoordenadas(39.4712, -0.3763)).toBe("39.47,-0.38");
        expect(urlPronostico(39.4712, -0.3763)).toContain("latitude=39.47&longitude=-0.38");
    });
});

// ── Open-Meteo ───────────────────────────────────────────────────────
describe("Open-Meteo · analizadores", () => {
    const ahora = Date.parse("2026-09-29T12:20:00Z");
    it("convierte horas y días a ms y conserva la zona", () => {
        const c = analizarPronostico(pronosticoJson(ahora), 39.47, -0.38);
        expect(c.zona).toBe("Europe/Madrid");
        expect(c.horas).toHaveLength(72);
        expect(c.dias).toHaveLength(7);
        expect(c.actual.temp).toBe(22.4);
        expect(c.actual.esDia).toBe(true);
        expect(indiceAhora(c.horas, ahora)).toBe(24);
        expect(proximasHoras(c.horas, 5, ahora)[0].t).toBeLessThanOrEqual(ahora);
        expect(horaDeAyer(c.horas, ahora)?.t).toBe(c.horas[0].t);
        expect(diaDeHoy(c.dias, ahora)?.t).toBe(c.dias[0].t);
    });
    it("un campo que falta es null, no un número inventado", () => {
        const j = pronosticoJson(ahora) as any;
        delete j.current.uv_index;
        j.hourly.temperature_2m[30] = null;
        const c = analizarPronostico(j, 0, 0);
        expect(c.actual.uv).toBeNull();
        expect(c.horas[30].temp).toBeNull();
    });
    it("sin tiempo actual, lanza", () => {
        expect(() => analizarPronostico({}, 0, 0)).toThrow();
    });
    it("calidad del aire con pólenes presentes y ausentes", () => {
        const a = analizarAire(aireJson(ahora));
        expect(a.europeo).toBe(34);
        expect(a.polen.map((p) => p.nombre)).toEqual(["Gramíneas", "Olivo"]);
        expect(a.horas).toHaveLength(24);
    });
});

// ── NOAA ─────────────────────────────────────────────────────────────
describe("NOAA SWPC · analizadores", () => {
    const ahora = Date.parse("2026-09-29T12:20:00Z");
    it("marca UTC sin zona", () => {
        expect(msUtc("2026-09-29T12:00:00")).toBe(Date.parse("2026-09-29T12:00:00Z"));
        expect(msUtc("2026-09-29 12:00:00.000")).toBe(Date.parse("2026-09-29T12:00:00Z"));
        expect(msUtc("nada")).toBeNull();
    });
    it("Kp: observado, estimado y previsto; máximo previsto", () => {
        const serie = analizarKpPrevision(kpPrevisionJson(ahora));
        expect(serie.some((p) => p.tipo === "previsto")).toBe(true);
        const r = resumirKp({ serie, minuto: { t: ahora - 60_000, kp: 3.33 } }, ahora);
        expect(r.actual?.fuente).toBe("minuto");
        expect(r.actual?.kp).toBe(3.33);
        expect(r.pasadas.length).toBeGreaterThan(0);
        expect(r.previstas.every((p) => p.t > ahora)).toBe(true);
    });
    it("escalas R/S/G con previsión de tres días", () => {
        const e = analizarEscalas(escalasJson());
        expect(e.actual).toEqual({ r: 0, s: 0, g: 0 });
        expect(e.ultimas24?.g).toBe(1);
        expect(e.dias).toHaveLength(3);
        expect(e.dias[0].probRMenor).toBe(10);
    });
    it("viento solar: resumen y plasma de la sonda ACTIVA", () => {
        expect(analizarVientoResumen([{ proton_speed: 400, time_tag: "2026-09-29T12:00:00Z" }], [{ bt: 5, bz_gsm: -3 }]).bz).toBe(-3);
        const p = analizarPlasma(plasmaJson(ahora), ahora);
        expect(p.fuente).toBe("SOLAR1");
        expect(p.actual?.velocidad).toBeLessThan(600);
        expect(p.serie.length).toBeGreaterThanOrEqual(40);
        expect(() => analizarVientoResumen([], [])).toThrow();
    });
    it("rayos X del canal largo, llamaradas y regiones del último día", () => {
        const r = analizarRayosX(rayosJson(ahora));
        expect(Math.max(...r.serie.map((p) => p.flujo))).toBe(2.4e-5);
        expect(analizarLlamaradas(llamaradasJson(ahora)).map((l) => l.clase)).toEqual(["C4.1", "M2.4"]);
        const g = analizarRegiones(regionesJson());
        expect(g.fecha).toBe("2026-09-29");
        expect(g.lista.map((x) => x.numero)).toEqual([4521, 4522]);
    });
    it("aurora: sobre ti, en tu horizonte y borde del óvalo", () => {
        const norte = reducirAurora(ovationJson(), 60, 10);
        expect(norte.sobreTi).toBe(8);
        expect(norte.horizonte).toBe(40);
        expect(norte.ovalo.every((o) => o.lat === 62)).toBe(true);
        const sur = reducirAurora(ovationJson(), -35, 150);
        expect(sur.hemisferio).toBe("sur");
        expect(sur.sobreTi).toBe(0);
    });
    it("magnetómetro de GOES", () => {
        const m = analizarMagnetometro(magnetometroJson(ahora));
        expect(m.satelite).toBe(19);
        expect(m.serie.length).toBeGreaterThan(60);
    });
});

// ── Interpretación ───────────────────────────────────────────────────
describe("Interpretar en lenguaje llano", () => {
    it("cielo WMO", () => {
        expect(textoCielo(0, false)).toBe("Noche despejada");
        expect(textoCielo(95)).toBe("Tormenta");
        expect(familiaCielo(3)).toBe("nubes");
        expect(familiaCielo(73)).toBe("nieve");
        expect(familiaCielo(null)).toBeNull();
    });
    it("UV, aire, viento, confort", () => {
        expect(nivelUv(2)?.texto).toBe("Bajo");
        expect(nivelUv(9)?.texto).toBe("Muy alto");
        expect(nivelUv(null)).toBeNull();
        expect(nivelAire({ europeo: 34, eeuu: 48 })?.texto).toBe("Razonable");
        expect(nivelAire({ europeo: null, eeuu: 160 })?.texto).toBe("Dañina");
        expect(rumbo(133)).toBe("SE");
        expect(procedencia(0)).toBe("del norte");
        expect(beaufort(30)?.nombre).toBe("Fresquito");
        expect(confortRocio(19)?.texto).toBe("Bochornoso");
    });
    it("avisos y frase de las próximas horas", () => {
        const ahora = Date.parse("2026-09-29T12:20:00Z");
        const j = pronosticoJson(ahora) as any;
        j.hourly.precipitation_probability[27] = 80;
        const c = analizarPronostico(j, 39.47, -0.38);
        const hora = (t: number) => new Date(t).toISOString().slice(11, 16);
        const avisos = avisosClima(c, null, hora, ahora);
        expect(avisos.map((a) => a.id)).toContain("lluvia");
        expect(fraseProximas(c.horas, hora, ahora)).toBe("Lluvia probable hacia las 15:00");
    });
    it("clima espacial: G, rayos X, probabilidad combinada, aurora", () => {
        expect(escalaG(4.67)).toBe(0);
        expect(escalaG(5)).toBe(1);
        expect(escalaG(9)).toBe(5);
        expect(explicarKp(null)).toMatch(/Sin lectura/);
        expect(claseRayos(2.4e-5)?.etiqueta).toBe("M2.4");
        expect(claseRayos(3.2e-7)?.letra).toBe("B");
        expect(claseRayos(null)).toBeNull();
        expect(probabilidadCombinada([45, 10])).toBe(50);
        expect(probabilidadCombinada([null])).toBeNull();
        expect(lineaAuroraKp(0)).toBeCloseTo(66.5);
        expect(latitudGeomagnetica(60, 10)).toBeGreaterThan(55);
        expect(latitudGeomagnetica(40.4, -3.7)).toBeLessThan(45);
    });
});
