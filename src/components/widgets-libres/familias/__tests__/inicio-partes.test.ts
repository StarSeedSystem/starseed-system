import { afterEach, describe, expect, it, vi } from "vitest";

let respuesta: unknown = null;
const pedir = vi.fn(async () => respuesta);
vi.mock("@/lib/weather-mock", () => ({ fetchWeatherData: () => pedir() }));
vi.mock("@/lib/tasks/quick-tasks", () => ({ readQuickTasks: () => [], QUICK_TASKS_KEY: "k", QUICK_TASKS_EVENT: "e" }));

import { agendaCeleste, colocarGlifos, duracion, fraccionDelDia, proximaFaseDe } from "../reloj-partes";
import { agruparPorDia, claveDia, cuentaAtras, cuentaCorta, etiquetaDia, franjaSemana, prepararEventos, progresoHacia } from "../eventos-partes";
import { analizarEntrada, diaISO, estadoVence, hechasPorDia, mover, ordenarPendientes, progresoDelDia, resumen, type TareaInicio } from "../tareas-partes";
import { alternarFijado, claveRuta, coincide, fijadosDe, frecencia, recientesDe, registrarUso, sugeridosDe } from "../accesos-partes";
import { agruparAvisos, enlaceSeguro, estaPospuesta, grupoDe, opcionesPosponer, ordenarPorPrioridad, vigentes } from "../notificaciones-partes";
import { diagnosticar, pausaDeConsumo, porGravedad, saludGeneral, titular, type Senales } from "../estado-partes";
import { _olvidarClima, avisoLluvia, cieloPorCodigo, climaCompartido, proximasHoras, proximosDias, rumbo } from "../clima-partes";

const T = (iso: string) => new Date(iso);
afterEach(() => { vi.clearAllMocks(); });

describe("reloj · agenda del cielo y glifos", () => {
    const base = {
        orto: T("2026-09-30T06:11:00Z"), ocaso: T("2026-09-29T18:02:00Z"),
        doradas: { manana: null, tarde: { inicio: T("2026-09-29T17:25:00Z"), fin: T("2026-09-29T18:19:00Z") } },
        lunaHorizonte: { salida: T("2026-09-29T19:15:00Z"), puesta: null },
        fases: [{ tipo: "menguante" as const, fecha: T("2026-10-03T13:25:00Z") }, { tipo: "nueva" as const, fecha: T("2026-10-10T15:50:00Z") }],
        proximoSigno: { fecha: T("2026-10-23T08:00:00Z"), signo: { nombre: "Escorpio", glifo: "♏︎", elemento: "agua" } as const },
        eclipse: { tipo: "sol" as const, clase: "anular" as const, fecha: T("2027-02-06T16:00:00Z"), gamma: -0.29, magnitud: null },
        estacion: { fecha: T("2026-12-21T20:50:00Z"), lon: 270 as const, tipo: "solsticio" as const },
        lat: 40.4,
    };
    it("ordena lo que viene y descarta lo pasado", () => {
        const a = agendaCeleste(base, T("2026-09-29T17:00:00Z"), { max: 20 });
        expect(a.map((x) => x.clave)).toEqual(["dorada-t", "ocaso", "luna-sale", "orto", "fase-menguante", "fase-nueva", "signo", "estacion", "eclipse"]);
        expect(a.find((x) => x.clave === "estacion")!.texto).toBe("Empieza el invierno (solsticio)");
        expect(a.find((x) => x.clave === "eclipse")!.texto).toBe("Eclipse anular de Sol");
    });
    it("solo lo cercano o solo lo lejano; en el sur, el solsticio de diciembre es verano", () => {
        expect(agendaCeleste(base, T("2026-09-29T17:00:00Z"), { lejanos: false }).every((x) => ["sol", "dorada", "luna"].includes(x.clase))).toBe(true);
        expect(agendaCeleste(base, T("2026-09-29T17:00:00Z"), { cercanos: false }).every((x) => !["sol", "dorada", "luna"].includes(x.clase))).toBe(true);
        expect(agendaCeleste({ ...base, lat: -33 }, T("2026-09-29T17:00:00Z"), { max: 20 }).find((x) => x.clave === "estacion")!.texto).toContain("verano");
        expect(proximaFaseDe(base, T("2026-10-05T00:00:00Z"))!.tipo).toBe("nueva");
    });
    it("los glifos que se pisan se separan sin cambiar de orden", () => {
        const d = colocarGlifos([{ clave: "a", lon: 100 }, { clave: "b", lon: 101 }, { clave: "c", lon: 250 }], 8);
        expect(d.b - d.a).toBeGreaterThanOrEqual(7.99);
        expect(d.c).toBe(250);
        const vuelta = colocarGlifos([{ clave: "x", lon: 359 }, { clave: "y", lon: 1 }], 8);
        expect(((vuelta.y - vuelta.x) % 360 + 360) % 360).toBeGreaterThanOrEqual(7.99);
    });
    it("fracción del día y duración", () => {
        expect(fraccionDelDia(T("2026-09-29T12:00:00Z"), T("2026-09-29T06:00:00Z"), T("2026-09-29T18:00:00Z"))).toBeCloseTo(0.5);
        expect(fraccionDelDia(T("2026-09-29T20:00:00Z"), T("2026-09-29T06:00:00Z"), T("2026-09-29T18:00:00Z"))).toBeNull();
        expect(duracion(11 * 3_600_000 + 52 * 60_000)).toBe("11 h 52 min");
    });
});

describe("eventos · agenda", () => {
    const ahora = new Date(2026, 8, 29, 13, 0).getTime();
    const fila = (id: string, horas: number, extra: Record<string, unknown> = {}) => ({ id, slug: id, title: `Evento ${id}`, kind: null, location: null, attendee_count: null, starts_at: new Date(ahora + horas * 3_600_000).toISOString(), ...extra });
    it("próximos y en curso (hora y media), sin fecha ni título fuera, en orden", () => {
        const e = prepararEventos([fila("c", 30), fila("a", -1), fila("viejo", -3), fila("b", 2), { ...fila("x", 1), starts_at: null }, { ...fila("y", 1), title: "  " }], ahora);
        expect(e.map((x) => x.id)).toEqual(["a", "b", "c"]);
        expect(e[0].enCurso).toBe(true);
    });
    it("cuenta atrás larga y corta", () => {
        expect(cuentaAtras(0)).toBe("ahora");
        expect(cuentaAtras(90_000)).toBe("01:30");
        expect(cuentaAtras(2 * 86_400_000 + 4 * 3_600_000)).toBe("2 d 4 h");
        expect(cuentaCorta(12 * 60_000)).toBe("12 min");
        expect(cuentaCorta(5 * 3_600_000)).toBe("5 h");
        expect(cuentaCorta(3 * 86_400_000)).toBe("3 d");
    });
    it("días: hoy, mañana, agrupación y franja con su cuenta", () => {
        const hoy = new Date(ahora);
        expect(etiquetaDia(new Date(ahora + 3_600_000), hoy)).toBe("Hoy");
        expect(etiquetaDia(new Date(ahora + 24 * 3_600_000), hoy)).toBe("Mañana");
        const e = prepararEventos([fila("a", 1), fila("b", 2), fila("c", 26)], ahora);
        expect(agruparPorDia(e, hoy).map((g) => [g.etiqueta, g.items.length])).toEqual([["Hoy", 2], ["Mañana", 1]]);
        const f = franjaSemana(e, hoy);
        expect(f).toHaveLength(7);
        expect(f[0]).toMatchObject({ hoy: true, n: 2, clave: claveDia(hoy) });
        expect(f[1].n).toBe(1);
    });
    it("el anillo avanza hacia el evento", () => {
        expect(progresoHacia(new Date(ahora + 12 * 3_600_000), ahora)).toBeCloseTo(0.5);
        expect(progresoHacia(new Date(ahora - 1), ahora)).toBe(1);
    });
});

describe("tareas · atajos, fechas y orden", () => {
    const ahora = new Date(2026, 8, 29, 10, 0);
    it("«!», «hoy» y «mañana» al escribir", () => {
        expect(analizarEntrada("Llamar a Ana mañana!", ahora)).toEqual({ texto: "Llamar a Ana", vence: "2026-09-30", prioridad: "alta" });
        expect(analizarEntrada("! Regar hoy", ahora)).toEqual({ texto: "Regar", vence: "2026-09-29", prioridad: "alta" });
        expect(analizarEntrada("hoy", ahora)).toEqual({ texto: "hoy" });
        expect(analizarEntrada("Leer el Codex", ahora)).toEqual({ texto: "Leer el Codex" });
    });
    it("vencimientos y resumen del día", () => {
        const hoy = diaISO(ahora), manana = "2026-09-30";
        expect(estadoVence({ vence: "2026-09-28", done: false }, hoy, manana)).toBe("atrasada");
        expect(estadoVence({ vence: hoy, done: false }, hoy, manana)).toBe("hoy");
        expect(estadoVence({ vence: manana, done: false }, hoy, manana)).toBe("manana");
        expect(estadoVence({ vence: hoy, done: true }, hoy, manana)).toBeNull();
        const tareas: TareaInicio[] = [
            { id: "1", text: "a", done: false, createdAt: 1, vence: "2026-09-28" },
            { id: "2", text: "b", done: false, createdAt: 2, vence: hoy },
            { id: "3", text: "c", done: true, createdAt: 3, doneAt: ahora.getTime() - 1000 },
            { id: "4", text: "d", done: false, createdAt: 4 },
        ];
        const r = resumen(tareas, ahora);
        expect(r).toEqual({ pendientes: 3, atrasadas: 1, paraHoy: 1, hechasHoy: 1 });
        expect(progresoDelDia(r)).toBeCloseTo(1 / 3);
        expect(progresoDelDia({ pendientes: 0, atrasadas: 0, paraHoy: 0, hechasHoy: 0 })).toBeNull();
        expect(hechasPorDia(tareas, ahora).at(-1)!.n).toBe(1);
    });
    it("orden: arrastre primero, luego las nuevas y la prioridad", () => {
        const t = (id: string, extra: Partial<TareaInicio> = {}): TareaInicio => ({ id, text: id, done: false, createdAt: Number(id), ...extra });
        expect(ordenarPendientes([t("1", { orden: 1 }), t("2", { orden: 0 }), t("3"), t("4", { priority: "alta" })]).map((x) => x.id)).toEqual(["4", "3", "2", "1"]);
        expect(mover(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
        expect(mover(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    });
});

describe("accesos · fijados, recientes y frecencia", () => {
    const acc = ["/red", "/hub?tab=x", "/biblioteca", "/mensajes"].map((href) => ({ href, label: href }));
    const ahora = 1_000_000_000_000;
    it("ruta sin consulta; visitas con decaimiento de una semana", () => {
        expect(claveRuta("/hub?tab=x#y")).toBe("/hub");
        expect(claveRuta("/a/")).toBe("/a");
        expect(frecencia({ n: 4, ultimo: ahora - 7 * 86_400_000 }, ahora)).toBeCloseTo(2);
        const uso = registrarUso(registrarUso({}, "/hub?tab=x", ahora), "/hub", ahora + 1);
        expect(uso["/hub"]).toEqual({ n: 2, ultimo: ahora + 1 });
    });
    it("fijados de fábrica, alternar, recientes y sugeridos", () => {
        expect(fijadosDe(acc, { fijados: null, uso: {} })).toHaveLength(4);
        const fijados = alternarFijado(null, ["/red", "/biblioteca"], "/mensajes");
        expect(fijados).toEqual(["/red", "/biblioteca", "/mensajes"]);
        expect(alternarFijado(fijados, [], "/red")).toEqual(["/biblioteca", "/mensajes"]);
        const estado = { fijados: ["/red"], uso: { "/mensajes": { n: 5, ultimo: ahora - 1000 }, "/hub": { n: 1, ultimo: ahora - 10 } } };
        expect(recientesDe(acc, estado).map((r) => r.acceso.href)).toEqual(["/hub?tab=x", "/mensajes"]);
        expect(sugeridosDe(acc, estado, ahora)[0].href).toBe("/mensajes");
        expect(coincide("Biblioteca", "BIBLIO")).toBe(true);
        expect(coincide("Música", "musica")).toBe(true);
    });
});

describe("avisos · fuente, prioridad y posponer", () => {
    const a = (id: string, kind: string | null, title: string, min: number) => ({ id, kind, title, body: null, link: null, seen: false, created_at: new Date(1_000_000_000_000 - min * 60_000).toISOString() });
    it("cada aviso a su fuente; lo importante primero", () => {
        expect(grupoDe({ kind: "otp", title: "Código de acceso" })).toBe("seguridad");
        expect(grupoDe({ kind: null, title: "Lía te mencionó" })).toBe("menciones");
        expect(grupoDe({ kind: "proposal", title: "Votación abierta" })).toBe("politica");
        expect(grupoDe({ kind: "update-app", title: "Nueva versión" })).toBe("sistema");
        expect(grupoDe({ kind: null, title: "Ana reaccionó" })).toBe("otras");
        const orden = ordenarPorPrioridad([a("1", null, "Ana reaccionó", 1), a("2", "otp", "Nuevo acceso", 50), a("3", "mention", "Te mencionó", 5)]);
        expect(orden.map((x) => x.id)).toEqual(["2", "3", "1"]);
        expect(agruparAvisos(orden).map((g) => g.grupo)).toEqual(["seguridad", "menciones", "otras"]);
    });
    it("posponer: opciones, vigencia y enlaces solo internos", () => {
        const manana = opcionesPosponer(new Date(2026, 8, 29, 17, 30));
        expect(manana.map((o) => o.etiqueta)).toEqual(["Una hora", "Mañana a las 9:00"]);
        expect(opcionesPosponer(new Date(2026, 8, 29, 10, 0)).map((o) => o.etiqueta)).toContain("Esta tarde (18:00)");
        expect(vigentes({ a: 10, b: 30 }, 20)).toEqual({ b: 30 });
        expect(estaPospuesta({ b: 30 }, "b", 20)).toBe(true);
        expect(enlaceSeguro("/decisiones")).toBe("/decisiones");
        expect(enlaceSeguro("https://fuera.example")).toBe("/notifications");
        expect(enlaceSeguro("//fuera.example")).toBe("/notifications");
    });
});

describe("estado · diagnóstico honesto", () => {
    const base: Senales = {
        enLinea: true, red: { tipo: "4g", mbps: 10, rtt: 50 }, sync: "connected", ultimoCambio: null,
        almacen: { usado: 100 * 1024 ** 2, cuota: 2 * 1024 ** 3, persistente: true }, bateria: null,
        consumo: { corte: false, corteHasta: null, frenoLocalHasta: null, diaAgotado: false, frenoRemoto: false, hoy: 1000, presupuesto: 8000 },
        neuronas: { en: 1, total: 2 }, memoria: null, eco: false,
    };
    it("todo bien; lo que no se mide es «sin dato» y no empeora la salud", () => {
        const d = diagnosticar(base, 0);
        expect(saludGeneral(d)).toBe("bien");
        expect(titular(d)).toBe("Todo en orden");
        expect(d.find((x) => x.clave === "bateria")).toMatchObject({ nivel: "sin-dato", valor: "sin dato" });
    });
    it("sin red manda; la sincronía rota ofrece arreglo, bloqueado si la nube está en pausa", () => {
        const sinRed = diagnosticar({ ...base, enLinea: false }, 0);
        expect(porGravedad(sinRed)[0]).toMatchObject({ clave: "red", nivel: "mal" });
        const enPausa = { ...base, sync: "error" as const, consumo: { ...base.consumo, corte: true, corteHasta: 3_600_000 } };
        const d = diagnosticar(enPausa, 0);
        expect(d.find((x) => x.clave === "sync")!.arreglo).toMatchObject({ accion: "sincronizar", bloqueado: "La nube está en pausa por consumo" });
        expect(d.find((x) => x.clave === "consumo")).toMatchObject({ nivel: "mal", valor: "En pausa" });
        expect(pausaDeConsumo(enPausa.consumo, 0)).toContain("pausa");
        expect(saludGeneral(d)).toBe("mal");
    });
    it("batería baja propone modo eco; almacén sin proteger propone protegerlo; consumo alto avisa", () => {
        const d = diagnosticar({ ...base, bateria: { nivel: 0.1, cargando: false }, almacen: { usado: 1, cuota: 10, persistente: false }, consumo: { ...base.consumo, hoy: 6000 } }, 0);
        expect(d.find((x) => x.clave === "bateria")).toMatchObject({ nivel: "mal", arreglo: { accion: "modo-eco" } });
        expect(d.find((x) => x.clave === "almacen")!.arreglo!.accion).toBe("persistir");
        expect(d.find((x) => x.clave === "consumo")!.nivel).toBe("atencion");
        expect(diagnosticar({ ...base, eco: true, bateria: { nivel: 0.9, cargando: true } }, 0).find((x) => x.clave === "bateria")!.arreglo!.accion).toBe("salir-eco");
    });
});

describe("clima · lo puro y la caché compartida", () => {
    it("código WMO → cielo (poco nuboso con el astro asomando)", () => {
        expect(cieloPorCodigo(0, true)).toBe("sol");
        expect(cieloPorCodigo(2, false)).toBe("luna-nubes");
        expect(cieloPorCodigo(3)).toBe("nubes");
        expect(cieloPorCodigo(45)).toBe("niebla");
        expect(cieloPorCodigo(73)).toBe("nieve");
        expect(cieloPorCodigo(null)).toBeNull();
        expect(rumbo(250)).toBe("O");
    });
    it("próximas horas, aviso de lluvia y días", () => {
        const d = { hourly: { time: ["13:00", "14:00", "15:00"], temperature_2m: [20, 21, 19], precipitation_probability: [0, 60, 10] }, daily: { time: ["h", "m", "p"], temperature_2m_max: [25, 22, 18], temperature_2m_min: [14, 12, 10], precipitation_probability_max: [0, 70, 5] } };
        expect(proximasHoras(d, 2)).toEqual([{ hora: "13:00", temp: 20, lluvia: 0 }, { hora: "14:00", temp: 21, lluvia: 60 }]);
        expect(avisoLluvia(proximasHoras(d))).toBe("Lluvia probable a las 14:00 (60 %)");
        expect(avisoLluvia([{ hora: "1", lluvia: 10 }])).toBeNull();
        expect(proximosDias(d)).toEqual([{ dia: "m", max: 22, min: 12, lluvia: 70 }, { dia: "p", max: 18, min: 10, lluvia: 5 }]);
    });
    it("una sola petición por lugar: en vuelo se comparte y lo fresco no vuelve a la red", async () => {
        _olvidarClima();
        respuesta = { _sources: ["open-meteo"], terrestrial: { current: { temperature_2m: 20 } } };
        const [a, b] = await Promise.all([climaCompartido(40.41, -3.7), climaCompartido(40.412, -3.701)]);
        expect(pedir).toHaveBeenCalledTimes(1);
        expect(a).toBe(b);
        expect(a.real).toBe(true);
        await climaCompartido(40.41, -3.7);
        expect(pedir).toHaveBeenCalledTimes(1);
        respuesta = { _sources: [], terrestrial: { current: { temperature_2m: 99 } } };
        const falsa = await climaCompartido(10, 10);
        expect(falsa).toMatchObject({ real: false, datos: null });
    });
});
