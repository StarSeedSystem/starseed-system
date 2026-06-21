// ════════════════════════════════════════════════════════════════
// StarSeed OS — Fuentes de CLIMA ESPACIAL en tiempo real (NOAA SWPC)
// ----------------------------------------------------------------
// Datos OFICIALES, sin clave y con CORS abierto, del Space Weather
// Prediction Center (NOAA SWPC). Cada fetcher parsea su JSON crudo a un
// modelo claro (`SpaceMetric`) y, ante cualquier problema, LANZA un
// error para que la capa de UI muestre "fuente no disponible" + un
// botón de reintento. NUNCA inventamos datos (sin mocks): si no hay
// dato real, se omite o se degrada con elegancia.
//
// Tipos de dato (los que referencia spaceweatherlive.com):
//   • Escalas NOAA R/S/G (apagón de radio / radiación solar / tormenta
//     geomagnética), ahora y previsión.
//   • Índice K planetario (Kp).
//   • Viento solar (velocidad, densidad, temperatura) y campo (Bz/Bt).
//   • Rayos X GOES → clase de llamarada (A/B/C/M/X) y apagón de radio R.
//   • Protones GOES → tormenta de radiación S.
//   • Resúmenes: F10.7, velocidad de viento, Bz.
//   • Manchas solares (SSN) — vía índices del ciclo solar.
//   • Aurora (potencia hemisférica OVATION, GW).
//
// Atribución OBLIGATORIA: "NOAA SWPC" (se muestra siempre en la UI).
// ════════════════════════════════════════════════════════════════

// ── Modelo de salida ─────────────────────────────────────────────

/** Nivel de severidad genérico para teñir la UI (verde → ámbar → rojo). */
export type Severity = "calm" | "minor" | "moderate" | "strong" | "extreme";

/** Una métrica normalizada de clima espacial. */
export interface SpaceMetric {
    /** Etiqueta humana corta. */
    label: string;
    /** Valor formateado listo para pintar (string para tabular-nums). */
    value: string;
    /** Valor numérico crudo (para gauges/sparklines), si aplica. */
    raw?: number | null;
    /** Unidad ("nT", "km/s", "GW"…). */
    unit?: string;
    /** Etiqueta de nivel/escala (p. ej. "G2 · Moderada", "Clase M1.4"). */
    level?: string;
    /** Severidad para color. */
    severity?: Severity;
    /** Detalle secundario (hora UTC, fuente de la región…). */
    detail?: string;
}

/** Bloque temático completo de clima espacial (lo consume el widget). */
export interface SpaceWeatherSnapshot {
    solarWind: {
        speed: SpaceMetric;
        density: SpaceMetric;
        temperature: SpaceMetric;
        bt: SpaceMetric;
        bz: SpaceMetric;
        /** Serie de velocidad (para sparkline), más antiguo → más reciente. */
        speedSeries: number[];
        bzSeries: number[];
        timeTag?: string;
    };
    geomagnetic: {
        kp: SpaceMetric;
        gScale: SpaceMetric;
        kpSeries: number[];
        timeTag?: string;
    };
    radiation: {
        flare: SpaceMetric;     // clase de rayos X (A/B/C/M/X)
        rScale: SpaceMetric;    // apagón de radio
        sScale: SpaceMetric;    // tormenta de radiación (protones)
        protonFlux: SpaceMetric;
        xraySeries: number[];   // log10(flux) para sparkline
    };
    indices: {
        f107: SpaceMetric;
        sunspots: SpaceMetric;
    };
    aurora: SpaceMetric;
    /** Timestamp (ms) de cuando se compuso este snapshot. */
    fetchedAt: number;
}

// ── Helpers de red / parseo ──────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.json();
}

async function fetchText(url: string): Promise<string> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.text();
}

function asNumber(v: unknown): number | null {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
}

function fmt(n: number, decimals = 1): string {
    return n.toLocaleString("es-ES", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    });
}

/** Compacta números grandes (temperatura en K) a "1.2M", "120k"… */
function fmtCompact(n: number): string {
    return new Intl.NumberFormat("es-ES", {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(n);
}

const DASH = "—";

/** Métrica vacía/desconocida (cuando un dato real no está disponible). */
function unknownMetric(label: string, unit?: string): SpaceMetric {
    return { label, value: DASH, raw: null, unit, severity: "calm" };
}

// ── Clasificadores de severidad y color ──────────────────────────

/** Color hex por severidad (verde → ámbar → rojo). */
export function severityColor(sev: Severity): string {
    switch (sev) {
        case "extreme": return "#ef4444"; // rojo
        case "strong": return "#fb7185";  // rosa-rojo
        case "moderate": return "#f59e0b"; // ámbar
        case "minor": return "#facc15";   // amarillo
        case "calm":
        default: return "#34d399";        // verde esmeralda
    }
}

/** Peso numérico de la severidad (para ordenar/elegir la "peor"). */
export function severityWeight(sev: Severity): number {
    return { calm: 0, minor: 1, moderate: 2, strong: 3, extreme: 4 }[sev];
}

/** La severidad más alta de una lista (la que dominará el diseño). */
export function worstSeverity(sevs: Severity[]): Severity {
    return sevs.reduce<Severity>(
        (acc, s) => (severityWeight(s) > severityWeight(acc) ? s : acc),
        "calm",
    );
}

/** Escala NOAA (R/S/G) número 0–5 → severidad. */
function scaleSeverity(scale: number): Severity {
    if (scale >= 5) return "extreme";
    if (scale >= 4) return "strong";
    if (scale >= 3) return "strong";
    if (scale >= 2) return "moderate";
    if (scale >= 1) return "minor";
    return "calm";
}

/** Índice Kp → severidad (G-scale subyacente). */
export function kpSeverity(kp: number): Severity {
    if (kp >= 8) return "extreme";  // G4–G5
    if (kp >= 7) return "strong";   // G3
    if (kp >= 6) return "moderate"; // G2
    if (kp >= 5) return "minor";    // G1
    return "calm";
}

/** Índice Kp → etiqueta de escala G de NOAA. */
export function kpToGScale(kp: number): string {
    if (kp >= 9) return "G5 · Extrema";
    if (kp >= 8) return "G4 · Severa";
    if (kp >= 7) return "G3 · Fuerte";
    if (kp >= 6) return "G2 · Moderada";
    if (kp >= 5) return "G1 · Menor";
    if (kp >= 4) return "Activo";
    return "Tranquilo";
}

/** Número de escala G (0–5) a partir de Kp. */
export function kpToGNumber(kp: number): number {
    if (kp >= 9) return 5;
    if (kp >= 8) return 4;
    if (kp >= 7) return 3;
    if (kp >= 6) return 2;
    if (kp >= 5) return 1;
    return 0;
}

/**
 * Flujo de rayos X (W/m²) → clase de llamarada (A/B/C/M/X) + severidad.
 * Umbrales NOAA: A<1e-7, B 1e-7, C 1e-6, M 1e-5, X 1e-4.
 */
export function classifyXRay(flux: number): { label: string; severity: Severity } {
    if (!Number.isFinite(flux) || flux <= 0) return { label: "A0.0", severity: "calm" };
    if (flux >= 1e-4) return { label: `X${(flux / 1e-4).toFixed(1)}`, severity: "extreme" };
    if (flux >= 1e-5) return { label: `M${(flux / 1e-5).toFixed(1)}`, severity: "strong" };
    if (flux >= 1e-6) return { label: `C${(flux / 1e-6).toFixed(1)}`, severity: "moderate" };
    if (flux >= 1e-7) return { label: `B${(flux / 1e-7).toFixed(1)}`, severity: "minor" };
    return { label: `A${Math.max(0, flux / 1e-8).toFixed(1)}`, severity: "calm" };
}

/**
 * Clase de rayos X → escala R de apagón de radio (NOAA).
 * R1=M1, R2=M5, R3=X1, R4=X10, R5=X20.
 */
export function xrayToRScale(flux: number): { label: string; severity: Severity } {
    if (!Number.isFinite(flux) || flux <= 0) return { label: "R0 · Ninguno", severity: "calm" };
    if (flux >= 2e-3) return { label: "R5 · Extremo", severity: "extreme" };
    if (flux >= 1e-3) return { label: "R4 · Severo", severity: "strong" };
    if (flux >= 1e-4) return { label: "R3 · Fuerte", severity: "strong" };
    if (flux >= 5e-5) return { label: "R2 · Moderado", severity: "moderate" };
    if (flux >= 1e-5) return { label: "R1 · Menor", severity: "minor" };
    return { label: "R0 · Ninguno", severity: "calm" };
}

/**
 * Flujo de protones ≥10 MeV (pfu) → escala S de tormenta de radiación.
 * S1=10, S2=1e2, S3=1e3, S4=1e4, S5=1e5 pfu.
 */
export function protonToSScale(pfu: number): { label: string; severity: Severity } {
    if (!Number.isFinite(pfu) || pfu < 10) return { label: "S0 · Ninguno", severity: "calm" };
    if (pfu >= 1e5) return { label: "S5 · Extremo", severity: "extreme" };
    if (pfu >= 1e4) return { label: "S4 · Severo", severity: "strong" };
    if (pfu >= 1e3) return { label: "S3 · Fuerte", severity: "strong" };
    if (pfu >= 1e2) return { label: "S2 · Moderado", severity: "moderate" };
    return { label: "S1 · Menor", severity: "minor" };
}

/** Bz (nT): cuanto más negativo, más acoplamiento al campo terrestre. */
function bzSeverity(bz: number): Severity {
    if (bz <= -20) return "extreme";
    if (bz <= -15) return "strong";
    if (bz <= -10) return "moderate";
    if (bz <= -5) return "minor";
    return "calm";
}

/** Velocidad del viento solar (km/s) → severidad orientativa. */
function windSpeedSeverity(v: number): Severity {
    if (v >= 800) return "strong";
    if (v >= 650) return "moderate";
    if (v >= 500) return "minor";
    return "calm";
}

/** Potencia auroral hemisférica (GW) → severidad/visibilidad. */
function auroraSeverity(gw: number): Severity {
    if (gw >= 100) return "extreme";
    if (gw >= 70) return "strong";
    if (gw >= 40) return "moderate";
    if (gw >= 20) return "minor";
    return "calm";
}

// ── Fetchers individuales (cada uno parsea su JSON real) ─────────

/** Escalas NOAA R/S/G — usa el bloque "0" (condiciones de las últimas 24h). */
async function fetchNoaaScales(): Promise<{
    r: SpaceMetric; s: SpaceMetric; g: SpaceMetric;
}> {
    const data = (await fetchJson(
        "https://services.swpc.noaa.gov/products/noaa-scales.json",
    )) as Record<string, unknown>;
    const now = (data?.["0"] ?? {}) as Record<string, unknown>;

    const pick = (key: "R" | "S" | "G", label: string): SpaceMetric => {
        const block = (now?.[key] ?? {}) as Record<string, unknown>;
        const scale = asNumber(block.Scale);
        const text = typeof block.Text === "string" ? block.Text : undefined;
        if (scale === null) return unknownMetric(label);
        const sev = scaleSeverity(scale);
        return {
            label,
            value: `${key}${scale}`,
            raw: scale,
            level: scale === 0 ? "Ninguno" : `${key}${scale}`,
            severity: sev,
            detail: text && text !== "none" ? text : undefined,
        };
    };

    return {
        r: pick("R", "Apagón de radio"),
        s: pick("S", "Radiación solar"),
        g: pick("G", "Tormenta geomagnética"),
    };
}

/** Índice K planetario (Kp) — array de objetos {time_tag, Kp}. */
async function fetchKp(): Promise<{ kp: SpaceMetric; gScale: SpaceMetric; series: number[]; timeTag?: string }> {
    const rows = (await fetchJson(
        "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    )) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("Kp: sin filas");

    const records = rows
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
        .map((r) => ({ kp: asNumber(r.Kp), time: typeof r.time_tag === "string" ? r.time_tag : undefined }))
        .filter((r): r is { kp: number; time: string | undefined } => r.kp !== null);

    if (!records.length) throw new Error("Kp: sin lecturas numéricas");

    const last = records[records.length - 1];
    const series = records.slice(-12).map((r) => r.kp);
    const sev = kpSeverity(last.kp);

    return {
        kp: {
            label: "Índice Kp",
            value: fmt(last.kp, 2),
            raw: last.kp,
            level: kpToGScale(last.kp),
            severity: sev,
        },
        gScale: {
            label: "Escala geomagnética",
            value: kpToGScale(last.kp),
            raw: kpToGNumber(last.kp),
            level: kpToGScale(last.kp),
            severity: sev,
        },
        series,
        timeTag: last.time,
    };
}

/** Viento solar: plasma (densidad/velocidad/temp) + campo (Bz/Bt). */
async function fetchSolarWind(): Promise<SpaceWeatherSnapshot["solarWind"]> {
    const [plasma, mag] = await Promise.all([
        fetchJson("https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json"),
        fetchJson("https://services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json"),
    ]);

    // Formato: primera fila cabecera, resto filas de datos.
    const plasmaRows = Array.isArray(plasma) ? (plasma as unknown[][]) : [];
    const magRows = Array.isArray(mag) ? (mag as unknown[][]) : [];
    if (plasmaRows.length < 2 || magRows.length < 2) throw new Error("Viento solar: sin filas");

    const pHead = plasmaRows[0].map(String);
    const mHead = magRows[0].map(String);
    const pi = {
        density: pHead.indexOf("density"),
        speed: pHead.indexOf("speed"),
        temperature: pHead.indexOf("temperature"),
        time: pHead.indexOf("time_tag"),
    };
    const mi = {
        bz: mHead.indexOf("bz_gsm"),
        bt: mHead.indexOf("bt"),
    };

    const pData = plasmaRows.slice(1);
    const mData = magRows.slice(1);
    const lastP = pData[pData.length - 1];
    const lastM = mData[mData.length - 1];

    const speed = pi.speed >= 0 ? asNumber(lastP[pi.speed]) : null;
    const density = pi.density >= 0 ? asNumber(lastP[pi.density]) : null;
    const temperature = pi.temperature >= 0 ? asNumber(lastP[pi.temperature]) : null;
    const bz = mi.bz >= 0 ? asNumber(lastM[mi.bz]) : null;
    const bt = mi.bt >= 0 ? asNumber(lastM[mi.bt]) : null;
    const timeTag = pi.time >= 0 && typeof lastP[pi.time] === "string" ? (lastP[pi.time] as string) : undefined;

    // Series (submuestreadas para no saturar): ~30 puntos.
    const sample = (rows: unknown[][], idx: number, n = 30): number[] => {
        if (idx < 0) return [];
        const vals = rows.map((r) => asNumber(r[idx])).filter((v): v is number => v !== null);
        if (vals.length <= n) return vals;
        const step = Math.ceil(vals.length / n);
        return vals.filter((_, i) => i % step === 0);
    };

    const speedMetric: SpaceMetric = speed === null
        ? unknownMetric("Velocidad", "km/s")
        : {
            label: "Velocidad",
            value: fmt(speed, 0),
            raw: speed,
            unit: "km/s",
            severity: windSpeedSeverity(speed),
        };

    const densityMetric: SpaceMetric = density === null
        ? unknownMetric("Densidad", "p/cm³")
        : { label: "Densidad", value: fmt(density, 1), raw: density, unit: "p/cm³", severity: density >= 15 ? "moderate" : density >= 8 ? "minor" : "calm" };

    const tempMetric: SpaceMetric = temperature === null
        ? unknownMetric("Temperatura", "K")
        : { label: "Temperatura", value: fmtCompact(temperature), raw: temperature, unit: "K", severity: "calm" };

    const bzMetric: SpaceMetric = bz === null
        ? unknownMetric("Bz (IMF)", "nT")
        : {
            label: "Bz (IMF)",
            value: fmt(bz, 1),
            raw: bz,
            unit: "nT",
            severity: bzSeverity(bz),
            detail: bz < 0 ? "Sur (acoplado)" : "Norte (protegido)",
        };

    const btMetric: SpaceMetric = bt === null
        ? unknownMetric("Bt (total)", "nT")
        : { label: "Bt (total)", value: fmt(bt, 1), raw: bt, unit: "nT", severity: bt >= 20 ? "moderate" : bt >= 10 ? "minor" : "calm" };

    return {
        speed: speedMetric,
        density: densityMetric,
        temperature: tempMetric,
        bz: bzMetric,
        bt: btMetric,
        speedSeries: sample(pData, pi.speed),
        bzSeries: sample(mData, mi.bz),
        timeTag,
    };
}

/** Rayos X GOES (canal 0.1-0.8 nm) → clase de llamarada + escala R + serie. */
async function fetchXRay(): Promise<{ flare: SpaceMetric; rScale: SpaceMetric; series: number[] }> {
    const data = (await fetchJson(
        "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json",
    )) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || !data.length) throw new Error("Rayos X: sin datos");

    const long = data.filter((d) => d.energy === "0.1-0.8nm");
    const usable = long.length ? long : data;
    const fluxes = usable
        .map((d) => asNumber(d.flux))
        .filter((f): f is number => f !== null && f > 0);
    if (!fluxes.length) throw new Error("Rayos X: sin flujo numérico");

    const lastFlux = fluxes[fluxes.length - 1];
    const peakFlux = Math.max(...fluxes);
    const cls = classifyXRay(lastFlux);
    const r = xrayToRScale(peakFlux);

    // Serie en log10 (los flujos abarcan varios órdenes de magnitud).
    const sampled = (() => {
        const n = 36;
        const logs = fluxes.map((f) => Math.log10(f));
        if (logs.length <= n) return logs;
        const step = Math.ceil(logs.length / n);
        return logs.filter((_, i) => i % step === 0);
    })();

    return {
        flare: {
            label: "Llamarada (rayos X)",
            value: cls.label,
            raw: lastFlux,
            level: `Clase ${cls.label.charAt(0)}`,
            severity: cls.severity,
            detail: `Pico 6h: ${classifyXRay(peakFlux).label}`,
        },
        rScale: {
            label: "Apagón de radio",
            value: r.label.split(" ")[0],
            raw: null,
            level: r.label,
            severity: r.severity,
        },
        series: sampled,
    };
}

/** Protones GOES ≥10 MeV → tormenta de radiación S. */
async function fetchProtons(): Promise<{ protonFlux: SpaceMetric; sScale: SpaceMetric }> {
    const data = (await fetchJson(
        "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json",
    )) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || !data.length) throw new Error("Protones: sin datos");

    const ge10 = data.filter((d) => d.energy === ">=10 MeV");
    const usable = ge10.length ? ge10 : data;
    const fluxes = usable
        .map((d) => asNumber(d.flux))
        .filter((f): f is number => f !== null && f >= 0);
    if (!fluxes.length) throw new Error("Protones: sin flujo numérico");

    const last = fluxes[fluxes.length - 1];
    const s = protonToSScale(last);

    return {
        protonFlux: {
            label: "Flujo de protones",
            value: last >= 1000 ? fmtCompact(last) : fmt(last, last < 10 ? 2 : 0),
            raw: last,
            unit: "pfu",
            severity: s.severity,
            detail: "≥10 MeV",
        },
        sScale: {
            label: "Tormenta de radiación",
            value: s.label.split(" ")[0],
            raw: null,
            level: s.label,
            severity: s.severity,
        },
    };
}

/** F10.7 cm radio flux (resumen). */
async function fetchF107(): Promise<SpaceMetric> {
    try {
        const data = (await fetchJson(
            "https://services.swpc.noaa.gov/products/summary/10cm-flux.json",
        )) as Array<{ flux?: unknown; time_tag?: unknown }>;
        const first = Array.isArray(data) ? data[0] : undefined;
        const flux = asNumber(first?.flux);
        if (flux === null) return unknownMetric("Flujo F10.7", "sfu");
        return {
            label: "Flujo F10.7",
            value: fmt(flux, 0),
            raw: flux,
            unit: "sfu",
            severity: flux >= 200 ? "moderate" : flux >= 150 ? "minor" : "calm",
        };
    } catch {
        return unknownMetric("Flujo F10.7", "sfu");
    }
}

/**
 * Manchas solares (SSN) — el resumen dedicado da 404, así que usamos los
 * índices observados del ciclo solar y tomamos el último SSN válido.
 */
async function fetchSunspots(): Promise<SpaceMetric> {
    try {
        const data = (await fetchJson(
            "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json",
        )) as Array<{ "time-tag"?: unknown; ssn?: unknown }>;
        if (!Array.isArray(data) || !data.length) return unknownMetric("Manchas solares");
        // Recorremos desde el final buscando un SSN observado válido (>= 0).
        for (let i = data.length - 1; i >= 0; i--) {
            const ssn = asNumber(data[i]?.ssn);
            if (ssn !== null && ssn >= 0) {
                const tag = typeof data[i]?.["time-tag"] === "string" ? (data[i]["time-tag"] as string) : undefined;
                return {
                    label: "Manchas solares",
                    value: fmt(ssn, 0),
                    raw: ssn,
                    unit: "SSN",
                    severity: ssn >= 150 ? "moderate" : ssn >= 80 ? "minor" : "calm",
                    detail: tag ? `Media ${tag}` : undefined,
                };
            }
        }
        return unknownMetric("Manchas solares", "SSN");
    } catch {
        return unknownMetric("Manchas solares", "SSN");
    }
}

/**
 * Aurora — potencia hemisférica (GW) del modelo OVATION. El JSON OVATION
 * completo es muy pesado (~1.4 MB de probabilidades por coordenada), así
 * que usamos el resumen de potencia hemisférica (texto, columnas:
 * obs_time, forecast_time, norte_GW, sur_GW). Degradamos con elegancia.
 */
async function fetchAurora(): Promise<SpaceMetric> {
    try {
        const txt = await fetchText(
            "https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt",
        );
        const lines = txt
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#"));
        if (!lines.length) return unknownMetric("Aurora (potencia)", "GW");

        const last = lines[lines.length - 1].split(/\s+/);
        // [obs_time, forecast_time, north_gw, south_gw]
        const north = asNumber(last[2]);
        const south = asNumber(last[3]);
        const peak = Math.max(north ?? 0, south ?? 0);
        if (north === null && south === null) return unknownMetric("Aurora (potencia)", "GW");

        const sev = auroraSeverity(peak);
        return {
            label: "Aurora (potencia)",
            value: fmt(peak, 0),
            raw: peak,
            unit: "GW",
            severity: sev,
            level: sev === "calm" ? "Baja" : sev === "minor" ? "Visible en latitudes altas" : sev === "moderate" ? "Activa" : "Intensa",
            detail: north !== null && south !== null ? `N ${fmt(north, 0)} · S ${fmt(south, 0)} GW` : undefined,
        };
    } catch {
        return unknownMetric("Aurora (potencia)", "GW");
    }
}

// ── Orquestador: compone el snapshot completo ────────────────────

/**
 * Recupera TODO el clima espacial en paralelo. Los bloques CRÍTICOS
 * (viento solar, Kp, rayos X, protones, escalas) lanzan si fallan: el
 * widget mostrará el estado de error global. Los bloques secundarios
 * (F10.7, manchas, aurora) ya degradan a "—" por su cuenta.
 *
 * NOTA: la atribución visible es "NOAA SWPC" (responsabilidad de origen).
 */
export async function fetchSpaceWeather(): Promise<SpaceWeatherSnapshot> {
    const [wind, kp, xray, protons, scales, f107, sunspots, aurora] = await Promise.all([
        fetchSolarWind(),
        fetchKp(),
        fetchXRay(),
        fetchProtons(),
        fetchNoaaScales(),
        fetchF107(),
        fetchSunspots(),
        fetchAurora(),
    ]);

    // Para la escala G priorizamos la oficial de NOAA (24h) si supera a la
    // derivada del Kp instantáneo; así "tormenta" refleja el peor caso real.
    const gFromScales = scales.g;
    const gFromKp = kp.gScale;
    const gScale =
        (gFromScales.raw ?? 0) >= (gFromKp.raw ?? 0) && (gFromScales.raw ?? 0) > 0
            ? { ...gFromScales, level: kpToGScale(kp.kp.raw ?? 0) }
            : gFromKp;

    return {
        solarWind: wind,
        geomagnetic: {
            kp: kp.kp,
            gScale,
            kpSeries: kp.series,
            timeTag: kp.timeTag,
        },
        radiation: {
            flare: xray.flare,
            // Si NOAA reporta un apagón R activo (escala 24h), priorízalo sobre
            // el derivado del flujo instantáneo; si no, usa el de rayos X.
            rScale: (scales.r.raw ?? 0) > 0 ? scales.r : xray.rScale,
            // Igual con la escala S oficial frente a la derivada de protones.
            sScale: (scales.s.raw ?? 0) > 0 ? scales.s : protons.sScale,
            protonFlux: protons.protonFlux,
            xraySeries: xray.series,
        },
        indices: { f107, sunspots },
        aurora,
        fetchedAt: Date.now(),
    };
}

/**
 * Severidad GLOBAL del snapshot (la peor de las escalas clave). El widget
 * la usa para teñir el halo general y destacar "tormenta" si G ≥ 1.
 */
export function snapshotSeverity(s: SpaceWeatherSnapshot): Severity {
    return worstSeverity([
        s.geomagnetic.gScale.severity ?? "calm",
        s.geomagnetic.kp.severity ?? "calm",
        s.radiation.flare.severity ?? "calm",
        s.radiation.rScale.severity ?? "calm",
        s.radiation.sScale.severity ?? "calm",
        s.solarWind.bz.severity ?? "calm",
    ]);
}

/** ¿Hay tormenta geomagnética activa (G ≥ 1, es decir Kp ≥ 5)? */
export function isGeomagneticStorm(s: SpaceWeatherSnapshot): boolean {
    return (s.geomagnetic.gScale.raw ?? 0) >= 1 || (s.geomagnetic.kp.raw ?? 0) >= 5;
}

/** Atribución oficial (mostrar SIEMPRE). */
export const SPACE_WEATHER_ATTRIBUTION = "NOAA SWPC";

/** Frecuencia de Schumann de referencia (no hay fuente NOAA estable con CORS). */
export const SCHUMANN_REFERENCE_HZ = 7.83;
