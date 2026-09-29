/**
 * NOAA SWPC (sin clave, CORS abierto): índice Kp observado y previsto, escalas R/S/G, viento
 * solar (resumen y plasma de la sonda activa), rayos X de GOES y llamaradas de 7 días, regiones
 * activas, flujo F10.7, óvalo auroral OVATION y magnetómetro de GOES.
 *
 * Todas las marcas de NOAA vienen en UTC (a veces sin «Z»): se normalizan aquí. Los
 * analizadores son PUROS; si un feed cambia de forma, lanzan en vez de inventar.
 * (Las rutas `products/solar-wind/*` que usaba el OS dejaron de existir en 2026: aquí se usan
 * `products/summary/*` y `json/rtsw/*`.)
 */
import { claveCoordenadas, crearFuente, pedirJson } from "./cache-compartida";
import { num } from "./open-meteo";

const SWPC = "https://services.swpc.noaa.gov";

/** Marca de NOAA → ms (UTC implícito si no trae zona). */
export function msUtc(marca: unknown): number | null {
    if (typeof marca !== "string" || !marca.trim()) return null;
    const iso = marca.trim().replace(" ", "T");
    const conZona = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
    const t = Date.parse(conZona);
    return Number.isFinite(t) ? t : null;
}

function numeroLaxo(v: unknown): number | null {
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return num(v);
}

function filas(j: unknown): Record<string, unknown>[] {
    if (!Array.isArray(j)) throw new Error("Formato de NOAA inesperado");
    return j.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
}

// ── Kp ────────────────────────────────────────────────────────────────

export type TipoKp = "observado" | "estimado" | "previsto";
export interface PuntoKp { t: number; kp: number; tipo: TipoKp }
export interface DatosKp {
    /** Bloques de 3 h: una semana observada y tres días previstos. */
    serie: PuntoKp[];
    /** Estimación de minuto (la más reciente), si llegó. */
    minuto: { t: number; kp: number } | null;
}

export function analizarKpPrevision(j: unknown): PuntoKp[] {
    const serie: PuntoKp[] = [];
    for (const r of filas(j)) {
        const t = msUtc(r.time_tag), kp = numeroLaxo(r.kp ?? r.Kp);
        if (t === null || kp === null) continue;
        const o = String(r.observed ?? "observed");
        serie.push({ t, kp, tipo: o === "predicted" ? "previsto" : o === "estimated" ? "estimado" : "observado" });
    }
    if (!serie.length) throw new Error("NOAA no trajo lecturas de Kp");
    return serie.sort((a, b) => a.t - b.t);
}

export function analizarKpMinuto(j: unknown): { t: number; kp: number } | null {
    const f = filas(j);
    for (let i = f.length - 1; i >= 0; i--) {
        const t = msUtc(f[i].time_tag), kp = numeroLaxo(f[i].estimated_kp ?? f[i].kp_index);
        if (t !== null && kp !== null) return { t, kp };
    }
    return null;
}

export interface ResumenKp {
    actual: { t: number; kp: number; fuente: "minuto" | "bloque" } | null;
    /** Máximo de las últimas 24 h (observado o estimado). */
    max24h: number | null;
    /** Máximo previsto en las próximas 72 h y cuándo. */
    maxPrevisto: { t: number; kp: number } | null;
    pasadas: PuntoKp[];
    previstas: PuntoKp[];
}

export function resumirKp(d: DatosKp, ahora = Date.now()): ResumenKp {
    const pasadas = d.serie.filter((p) => p.t <= ahora && p.tipo !== "previsto");
    const previstas = d.serie.filter((p) => p.t > ahora - 3 * 3_600_000 && p.t <= ahora + 72 * 3_600_000 && (p.tipo !== "observado"));
    const ultimo = pasadas[pasadas.length - 1];
    const minutoFresco = d.minuto && ahora - d.minuto.t < 3 * 3_600_000 ? d.minuto : null;
    const actual = minutoFresco
        ? { t: minutoFresco.t, kp: minutoFresco.kp, fuente: "minuto" as const }
        : ultimo ? { t: ultimo.t, kp: ultimo.kp, fuente: "bloque" as const } : null;
    const ult24 = pasadas.filter((p) => p.t > ahora - 24 * 3_600_000);
    const futuras = d.serie.filter((p) => p.t > ahora && p.tipo === "previsto");
    const maxPrevisto = futuras.reduce<{ t: number; kp: number } | null>((m, p) => (!m || p.kp > m.kp ? { t: p.t, kp: p.kp } : m), null);
    return {
        actual,
        max24h: ult24.length ? Math.max(...ult24.map((p) => p.kp)) : null,
        maxPrevisto,
        pasadas: pasadas.slice(-8),
        previstas: previstas.filter((p) => p.t > ahora).slice(0, 24),
    };
}

// ── Escalas R/S/G ─────────────────────────────────────────────────────

export interface NivelEscalas { r: number | null; s: number | null; g: number | null }
export interface DiaEscalas { fecha: string; probRMenor: number | null; probRMayor: number | null; probS: number | null; g: number | null }
export interface DatosEscalas { t: number | null; actual: NivelEscalas; ultimas24: NivelEscalas | null; dias: DiaEscalas[] }

export function analizarEscalas(j: unknown): DatosEscalas {
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("Escalas de NOAA ilegibles");
    const o = j as Record<string, Record<string, unknown>>;
    const nivel = (b: Record<string, unknown> | undefined): NivelEscalas => ({
        r: numeroLaxo((b?.R as Record<string, unknown> | undefined)?.Scale),
        s: numeroLaxo((b?.S as Record<string, unknown> | undefined)?.Scale),
        g: numeroLaxo((b?.G as Record<string, unknown> | undefined)?.Scale),
    });
    const cero = o["0"];
    if (!cero) throw new Error("Escalas de NOAA sin estado actual");
    const dias: DiaEscalas[] = ["1", "2", "3"].flatMap((k) => {
        const b = o[k];
        if (!b) return [];
        const R = (b.R ?? {}) as Record<string, unknown>, S = (b.S ?? {}) as Record<string, unknown>, G = (b.G ?? {}) as Record<string, unknown>;
        return [{ fecha: String(b.DateStamp ?? ""), probRMenor: numeroLaxo(R.MinorProb), probRMayor: numeroLaxo(R.MajorProb), probS: numeroLaxo(S.Prob), g: numeroLaxo(G.Scale) }];
    });
    return {
        t: msUtc(`${cero.DateStamp ?? ""}T${cero.TimeStamp ?? "00:00:00"}`),
        actual: nivel(cero),
        ultimas24: o["-1"] ? nivel(o["-1"]) : null,
        dias,
    };
}

// ── Viento solar ──────────────────────────────────────────────────────

export interface VientoResumen { t: number | null; velocidad: number | null; bt: number | null; bz: number | null }

export function analizarVientoResumen(vel: unknown, mag: unknown): VientoResumen {
    const v = filas(vel)[0] ?? {}, m = filas(mag)[0] ?? {};
    const velocidad = numeroLaxo(v.proton_speed ?? v.WindSpeed);
    const bz = numeroLaxo(m.bz_gsm ?? m.Bz), bt = numeroLaxo(m.bt ?? m.Bt);
    if (velocidad === null && bz === null && bt === null) throw new Error("NOAA no trajo viento solar");
    const t = Math.max(msUtc(v.time_tag) ?? 0, msUtc(m.time_tag) ?? 0);
    return { t: t || null, velocidad, bt, bz };
}

export interface PuntoPlasma { t: number; velocidad: number | null; densidad: number | null }
export interface DatosPlasma {
    fuente: string | null;
    actual: { t: number; velocidad: number | null; densidad: number | null; temperatura: number | null } | null;
    /** Promedios de 30 min de las últimas 24 h. */
    serie: PuntoPlasma[];
}

export function analizarPlasma(j: unknown, ahora = Date.now()): DatosPlasma {
    const f = filas(j);
    const activas = f.filter((r) => r.active === true);
    const base = activas.length ? activas : f;
    const fuente = typeof base[0]?.source === "string" ? (base[0].source as string) : null;
    const lecturas = base
        .filter((r) => !fuente || r.source === fuente)
        .map((r) => ({ t: msUtc(r.time_tag), v: numeroLaxo(r.proton_speed), n: numeroLaxo(r.proton_density), k: numeroLaxo(r.proton_temperature) }))
        .filter((r): r is { t: number; v: number | null; n: number | null; k: number | null } => r.t !== null)
        .sort((a, b) => a.t - b.t);
    const ultima = [...lecturas].reverse().find((r) => r.v !== null || r.n !== null) ?? null;
    const cubos = new Map<number, { v: number[]; n: number[] }>();
    const desde = ahora - 24 * 3_600_000;
    for (const r of lecturas) {
        if (r.t < desde) continue;
        const c = Math.floor(r.t / 1_800_000) * 1_800_000;
        const cubo = cubos.get(c) ?? { v: [], n: [] };
        if (r.v !== null) cubo.v.push(r.v);
        if (r.n !== null) cubo.n.push(r.n);
        cubos.set(c, cubo);
    }
    const media = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    const serie = [...cubos.entries()].sort((a, b) => a[0] - b[0]).map(([t, c]) => ({ t, velocidad: media(c.v), densidad: media(c.n) }));
    if (!ultima && !serie.length) throw new Error("NOAA no trajo plasma del viento solar");
    return {
        fuente,
        actual: ultima ? { t: ultima.t, velocidad: ultima.v, densidad: ultima.n, temperatura: ultima.k } : null,
        serie,
    };
}

// ── Sol: rayos X, llamaradas, regiones y F10.7 ────────────────────────

export interface PuntoRayos { t: number; flujo: number }
export interface Llamarada { inicio: number; maximo: number | null; fin: number | null; clase: string; flujo: number | null }
export interface Region { numero: number; ubicacion: string; area: number | null; manchas: number | null; claseMagnetica: string | null; pC: number | null; pM: number | null; pX: number | null }
export interface DatosSol {
    rayos: PuntoRayos[];
    satelite: number | null;
    llamaradas: Llamarada[];
    regiones: { fecha: string | null; lista: Region[] };
    f107: { t: number | null; flujo: number | null };
}

export function analizarRayosX(j: unknown): { serie: PuntoRayos[]; satelite: number | null } {
    const f = filas(j).filter((r) => r.energy === "0.1-0.8nm");
    const cubos = new Map<number, number>();
    let satelite: number | null = null;
    for (const r of f) {
        const t = msUtc(r.time_tag), flujo = numeroLaxo(r.flux);
        if (t === null || flujo === null || flujo <= 0) continue;
        satelite = numeroLaxo(r.satellite) ?? satelite;
        const c = Math.floor(t / 300_000) * 300_000;
        cubos.set(c, Math.max(cubos.get(c) ?? 0, flujo));
    }
    const serie = [...cubos.entries()].sort((a, b) => a[0] - b[0]).map(([t, flujo]) => ({ t, flujo }));
    if (!serie.length) throw new Error("GOES no trajo rayos X");
    return { serie, satelite };
}

export function analizarLlamaradas(j: unknown): Llamarada[] {
    return filas(j)
        .map((r) => ({
            inicio: msUtc(r.begin_time),
            maximo: msUtc(r.max_time),
            fin: msUtc(r.end_time),
            clase: typeof r.max_class === "string" && r.max_class ? r.max_class : typeof r.begin_class === "string" ? r.begin_class : "",
            flujo: numeroLaxo(r.max_xrlong),
        }))
        .filter((l): l is Llamarada => l.inicio !== null && /^[ABCMX]\d/.test(l.clase))
        .sort((a, b) => a.inicio - b.inicio);
}

export function analizarRegiones(j: unknown): { fecha: string | null; lista: Region[] } {
    const f = filas(j);
    const fechas = f.map((r) => String(r.observed_date ?? "")).filter(Boolean).sort();
    const fecha = fechas[fechas.length - 1] ?? null;
    const lista = f
        .filter((r) => r.observed_date === fecha)
        .map((r) => ({
            numero: numeroLaxo(r.region) ?? 0,
            ubicacion: String(r.location ?? ""),
            area: numeroLaxo(r.area),
            manchas: numeroLaxo(r.number_spots),
            claseMagnetica: typeof r.mag_class === "string" ? r.mag_class : null,
            pC: numeroLaxo(r.c_flare_probability),
            pM: numeroLaxo(r.m_flare_probability),
            pX: numeroLaxo(r.x_flare_probability),
        }))
        .sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
    return { fecha, lista };
}

export function analizarF107(j: unknown): { t: number | null; flujo: number | null } {
    const r = filas(j)[0];
    return { t: msUtc(r?.time_tag), flujo: numeroLaxo(r?.flux) };
}

// ── Aurora (OVATION) ──────────────────────────────────────────────────

export interface DatosAurora {
    observada: number | null;
    prevista: number | null;
    /** Probabilidad (%) de aurora justo encima. */
    sobreTi: number | null;
    /** Máxima probabilidad hasta ~9° hacia el polo: lo que asomaría en tu horizonte. */
    horizonte: number | null;
    /** Máximo del hemisferio del usuario. */
    maxHemisferio: number | null;
    /** Borde ecuatorial del óvalo (≥ 10 %) cada 10° de longitud, en el hemisferio del usuario. */
    ovalo: { lon: number; lat: number | null }[];
    hemisferio: "norte" | "sur";
}

export function reducirAurora(j: unknown, lat: number, lon: number): DatosAurora {
    const o = (j ?? {}) as Record<string, unknown>;
    const coords = Array.isArray(o.coordinates) ? (o.coordinates as unknown[]) : null;
    if (!coords || !coords.length) throw new Error("OVATION sin datos");
    const rejilla = new Map<number, number>();
    const clave = (lo: number, la: number) => (((Math.round(lo) % 360) + 360) % 360) * 1000 + (Math.round(la) + 90);
    const norte = lat >= 0;
    let maxHem = 0;
    for (const c of coords) {
        if (!Array.isArray(c) || c.length < 3) continue;
        const lo = num(c[0]), la = num(c[1]), v = num(c[2]);
        if (lo === null || la === null || v === null) continue;
        rejilla.set(clave(lo, la), v);
        if ((la >= 0) === norte && v > maxHem) maxHem = v;
    }
    const valor = (lo: number, la: number) => rejilla.get(clave(lo, la)) ?? null;
    const sobreTi = valor(lon, lat);
    let horizonte: number | null = null;
    const paso = norte ? 1 : -1;
    for (let d = 0; d <= 9; d++) {
        for (let dl = -2; dl <= 2; dl++) {
            const v = valor(lon + dl, lat + d * paso);
            if (v !== null) horizonte = Math.max(horizonte ?? 0, v);
        }
    }
    const ovalo: { lon: number; lat: number | null }[] = [];
    for (let lo = 0; lo < 360; lo += 10) {
        let borde: number | null = null;
        for (let a = norte ? 30 : -30; norte ? a <= 89 : a >= -89; a += paso) {
            const v = valor(lo, a);
            if (v !== null && v >= 10) { borde = a; break; }
        }
        ovalo.push({ lon: lo, lat: borde });
    }
    return {
        observada: msUtc(o["Observation Time"]),
        prevista: msUtc(o["Forecast Time"]),
        sobreTi, horizonte, maxHemisferio: maxHem, ovalo,
        hemisferio: norte ? "norte" : "sur",
    };
}

// ── Magnetómetro de GOES ──────────────────────────────────────────────

export interface PuntoCampo { t: number; hp: number | null; he: number | null; hn: number | null; total: number | null }
export interface DatosMagnetometro { satelite: number | null; serie: PuntoCampo[] }

export function analizarMagnetometro(j: unknown): DatosMagnetometro {
    const f = filas(j);
    let satelite: number | null = null;
    const cubos = new Map<number, PuntoCampo>();
    for (const r of f) {
        const t = msUtc(r.time_tag);
        if (t === null || r.arcjet_flag === true) continue;
        satelite = numeroLaxo(r.satellite) ?? satelite;
        const c = Math.floor(t / 300_000) * 300_000;
        cubos.set(c, { t: c, hp: numeroLaxo(r.Hp), he: numeroLaxo(r.He), hn: numeroLaxo(r.Hn), total: numeroLaxo(r.total) });
    }
    const serie = [...cubos.values()].sort((a, b) => a.t - b.t);
    if (!serie.length) throw new Error("GOES no trajo magnetómetro");
    return { satelite, serie };
}

// ── Fuentes compartidas ───────────────────────────────────────────────

const unica = () => "global";

export const fuenteKp = crearFuente<void, DatosKp>({
    nombre: "kp",
    ttlMs: 15 * 60_000,
    clave: unica,
    cargar: async (_a, senal) => {
        const [prev, minuto] = await Promise.all([
            pedirJson(`${SWPC}/products/noaa-planetary-k-index-forecast.json`, senal),
            pedirJson(`${SWPC}/json/planetary_k_index_1m.json`, senal).catch(() => null),
        ]);
        return { serie: analizarKpPrevision(prev), minuto: minuto ? analizarKpMinuto(minuto) : null };
    },
});

export const fuenteEscalas = crearFuente<void, DatosEscalas>({
    nombre: "escalas",
    ttlMs: 15 * 60_000,
    clave: unica,
    cargar: async (_a, senal) => analizarEscalas(await pedirJson(`${SWPC}/products/noaa-scales.json`, senal)),
});

export const fuenteVientoResumen = crearFuente<void, VientoResumen>({
    nombre: "viento-resumen",
    ttlMs: 15 * 60_000,
    clave: unica,
    cargar: async (_a, senal) => {
        const [v, m] = await Promise.all([
            pedirJson(`${SWPC}/products/summary/solar-wind-speed.json`, senal),
            pedirJson(`${SWPC}/products/summary/solar-wind-mag-field.json`, senal),
        ]);
        return analizarVientoResumen(v, m);
    },
});

/** Plasma de la sonda activa (~90 kB comprimido): solo cuando un widget lo pinta. */
export const fuentePlasma = crearFuente<void, DatosPlasma>({
    nombre: "plasma",
    ttlMs: 30 * 60_000,
    clave: unica,
    tiempoMaxMs: 25_000,
    cargar: async (_a, senal) => analizarPlasma(await pedirJson(`${SWPC}/json/rtsw/rtsw_wind_1m.json`, senal)),
});

export const fuenteSol = crearFuente<void, DatosSol>({
    nombre: "sol",
    ttlMs: 20 * 60_000,
    clave: unica,
    tiempoMaxMs: 20_000,
    cargar: async (_a, senal) => {
        const [rx, ll, rg, f] = await Promise.all([
            pedirJson(`${SWPC}/json/goes/primary/xrays-6-hour.json`, senal),
            pedirJson(`${SWPC}/json/goes/primary/xray-flares-7-day.json`, senal).catch(() => []),
            pedirJson(`${SWPC}/json/solar_regions.json`, senal).catch(() => []),
            pedirJson(`${SWPC}/products/summary/10cm-flux.json`, senal).catch(() => []),
        ]);
        const rayos = analizarRayosX(rx);
        return {
            rayos: rayos.serie, satelite: rayos.satelite,
            llamaradas: analizarLlamaradas(ll),
            regiones: analizarRegiones(rg),
            f107: analizarF107(f),
        };
    },
});

/** OVATION (~140 kB comprimido): reducido al sitio del usuario; la rejilla no se guarda. */
export const fuenteAurora = crearFuente<{ lat: number; lon: number }, DatosAurora>({
    nombre: "aurora",
    ttlMs: 30 * 60_000,
    clave: ({ lat, lon }) => claveCoordenadas(lat, lon, 0),
    tiempoMaxMs: 25_000,
    cargar: async ({ lat, lon }, senal) => reducirAurora(await pedirJson(`${SWPC}/json/ovation_aurora_latest.json`, senal), lat, lon),
});

export const fuenteMagnetometro = crearFuente<void, DatosMagnetometro>({
    nombre: "magnetometro",
    ttlMs: 15 * 60_000,
    clave: unica,
    cargar: async (_a, senal) => analizarMagnetometro(await pedirJson(`${SWPC}/json/goes/primary/magnetometers-6-hour.json`, senal)),
});
