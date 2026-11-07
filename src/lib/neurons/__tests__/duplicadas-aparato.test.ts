/**
 * (NEU1107B) ¿Qué neuronas de la cuenta son ESTE aparato en otro medio? Con los casos reales de la cuenta
 * de Alex (07-11, ids anonimizados): la tableta en línea, la Mac con la app nativa, los dos registros del
 * móvil («Maggadroid» y «Maggadroid phone»), las dos neuronas creadas desde navegadores el 10-10 y la de iOS.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/duplicadas-aparato.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  detectarDuplicadas,
  esNombreGenerico,
  nombresParecidos,
  razonDe,
  sugerirFusion,
  type FilaNeurona,
  type MedioPresente,
  type YoNeurona,
} from "../duplicadas-aparato";

const AHORA = Date.parse("2026-11-07T18:00:00Z");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const MAGGABOARD: FilaNeurona = {
  id: "e0b9faf2-0000-4000-8000-000000000001",
  name: "Maggaboard",
  kind: "mobile",
  capabilities: { platform: "Android", browser: "Chrome 154", cores: 8, gpuRenderer: "Mali-G57 MC2", pantalla: "800x1340@1.5", touch: true },
  last_seen_at: hace(3),
  created_at: "2026-10-10T18:00:00Z",
};
const MAGGABOOK: FilaNeurona = {
  id: "62d50afc-0000-4000-8000-000000000002",
  name: "MaggaBook",
  kind: "desktop",
  capabilities: { platform: "macOS", browser: "", cores: 8, gpuRenderer: "Apple GPU", pantalla: "900x1440@2", maquina: "a1b2c3d4e5f60718" },
  last_seen_at: hace(1),
  created_at: "2026-07-05T12:00:00Z",
};
const MAGGADROID: FilaNeurona = {
  id: "659d5e03-0000-4000-8000-000000000003",
  name: "Maggadroid",
  kind: "mobile",
  capabilities: { platform: "Android", browser: "Chrome 141" },
  last_seen_at: "2026-06-11T09:30:00Z",
  created_at: "2026-05-02T10:00:00Z",
};
const MAGGADROID_PHONE: FilaNeurona = {
  id: "9370fd33-0000-4000-8000-000000000004",
  name: "Maggadroid phone",
  kind: "mobile",
  capabilities: { platform: "Android", browser: "Chrome 141" },
  last_seen_at: hace(2),
  created_at: "2026-06-11T10:05:00Z",
};
const MACOS_WEB: FilaNeurona = {
  id: "f41ed104-0000-4000-8000-000000000005",
  name: "💻 macOS · Chrome 141",
  kind: "desktop",
  capabilities: {
    platform: "macOS",
    browser: "Chrome 141",
    cores: 8,
    gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
    pantalla: "900x1440@2",
  },
  last_seen_at: "2026-10-10T20:00:00Z",
  created_at: "2026-10-10T19:00:00Z",
};
const ANDROID_WEB: FilaNeurona = {
  id: "d3abf6fa-0000-4000-8000-000000000006",
  name: "📱 Android · Chrome 154",
  kind: "mobile",
  capabilities: { platform: "Android", browser: "Chrome 154", cores: 8, gpuRenderer: "Mali-G57 MC2", pantalla: "800x1340@1.5" },
  last_seen_at: "2026-10-10T21:00:00Z",
  created_at: "2026-10-10T20:30:00Z",
};
const ISEED: FilaNeurona = {
  id: "9b054b25-0000-4000-8000-000000000007",
  name: "📱 iseed maggadroid",
  kind: "mobile",
  capabilities: { platform: "iOS", browser: "Safari 18", gpuRenderer: "Apple GPU" },
  last_seen_at: "2026-10-20T08:00:00Z",
  created_at: "2026-10-01T08:00:00Z",
};

const CUENTA = [MAGGABOARD, MAGGABOOK, MAGGADROID, MAGGADROID_PHONE, MACOS_WEB, ANDROID_WEB, ISEED];

/** La tableta anuncia en vivo su equipo (VER1107B). */
const PRESENCIA_TABLETA: MedioPresente = { n: MAGGABOARD.id, plataforma: "Android", t: AHORA - 20_000, d: { so: "android", equipo: "SM-X205", medio: "android" } };

describe("detectarDuplicadas · casos reales de la cuenta de Alex", () => {
  it("la app de escritorio de la MaggaBook reconoce la neurona que creó Chrome en la misma Mac (y nada más)", () => {
    const yo: YoNeurona = { ...MAGGABOOK, equipo: "MaggaBook", so: "macos" };
    const r = detectarDuplicadas({ yo, todas: CUENTA, presentes: [PRESENCIA_TABLETA], ahora: AHORA });
    expect(r.candidatas.map((c) => c.id)).toEqual([MACOS_WEB.id]);
    const c = r.candidatas[0];
    expect(c.confianza).toBe("media");
    expect(c.motivos).toContain("misma huella de hardware");
    expect(c.razon).toMatch(/^Misma huella de hardware/);
    expect(c.enLineaAhora).toBe(false);
    // Los aparatos de otro sistema se descartan con el porqué; la Mac nunca se compara consigo misma.
    const porId = Object.fromEntries(r.descartadas.map((d) => [d.id, d.motivo]));
    expect(porId[MAGGABOARD.id]).toMatch(/otro sistema/);
    expect(porId[ISEED.id]).toMatch(/otro sistema/);
    expect(porId[MAGGABOOK.id]).toBeUndefined();
    // Sugerencia: se queda la MaggaBook (nombre propio y más antigua), con su nombre; sin recargar.
    const s = sugerirFusion(yo, CUENTA, r.candidatas, AHORA);
    expect(s).toEqual({ seleccionadas: [MACOS_WEB.id], principal: MAGGABOOK.id, nombre: "MaggaBook" });
  });

  it("el móvil: «Maggadroid phone» encuentra a «Maggadroid» (reinstalación) y nunca a la tableta en línea", () => {
    const yo: YoNeurona = { ...MAGGADROID_PHONE, equipo: "SM-A536B", so: "android" };
    const r = detectarDuplicadas({ yo, todas: CUENTA, presentes: [PRESENCIA_TABLETA], ahora: AHORA });
    const primera = r.candidatas[0];
    expect(primera.id).toBe(MAGGADROID.id);
    expect(primera.confianza).toBe("media");
    expect(primera.motivos).toEqual(
      expect.arrayContaining(["nombre parecido («Maggadroid» y «Maggadroid phone»)", "dejó de usarse justo cuando nació esta"]),
    );
    // La tableta está en línea ahora con otro equipo: descartada.
    expect(r.candidatas.some((c) => c.id === MAGGABOARD.id)).toBe(false);
    expect(r.descartadas.find((d) => d.id === MAGGABOARD.id)?.motivo).toMatch(/otro equipo/);
    // La de iOS se llama «iseed maggadroid», pero es otro sistema: el nombre nunca gana a eso.
    expect(r.descartadas.find((d) => d.id === ISEED.id)?.motivo).toMatch(/otro sistema/);
    // La de Chrome Android del 10-10 queda como «poco probable» y NO preseleccionada.
    const web = r.candidatas.find((c) => c.id === ANDROID_WEB.id);
    expect(web?.confianza).toBe("baja");
    const s = sugerirFusion(yo, CUENTA, r.candidatas, AHORA);
    expect(s.seleccionadas).toEqual([MAGGADROID.id]);
    expect([MAGGADROID.id, MAGGADROID_PHONE.id]).toContain(s.principal);
    expect(["Maggadroid", "Maggadroid phone"]).toContain(s.nombre);
  });

  it("la tableta (en línea) no se apropia de los registros del móvil", () => {
    const yo: YoNeurona = { ...MAGGABOARD, equipo: "SM-X205", so: "android" };
    const r = detectarDuplicadas({ yo, todas: CUENTA, presentes: [PRESENCIA_TABLETA], ahora: AHORA });
    // «Maggadroid phone» está en línea ahora (otro aparato encendido a la vez): fuera.
    expect(r.descartadas.find((d) => d.id === MAGGADROID_PHONE.id)?.motivo).toMatch(/en línea ahora/);
    // Lo que queda de Android no pasa de «poco probable»: nada se preselecciona por tener el mismo sistema.
    expect(r.candidatas.every((c) => c.confianza === "baja" || c.id === ANDROID_WEB.id)).toBe(true);
    expect(r.candidatas.find((c) => c.id === MAGGADROID.id)?.confianza ?? "baja").toBe("baja");
    // La de Chrome Android del 10-10 SÍ es la tableta: misma GPU, núcleos y pantalla.
    expect(r.candidatas[0]?.id).toBe(ANDROID_WEB.id);
    expect(r.candidatas[0]?.confianza).not.toBe("baja");
  });
});

describe("detectarDuplicadas · señales", () => {
  it("la migración al servidor local es la prueba más fuerte (alta), aunque la otra no diga nada del aparato", () => {
    const yo: YoNeurona = { id: "aaaaaaaa-0000-4000-8000-00000000000a", name: "", capabilities: { platform: "macOS" }, created_at: hace(5), equipo: "MaggaBook", so: "macos" };
    const vieja: FilaNeurona = { id: "bbbbbbbb-0000-4000-8000-00000000000b", name: "MaggaBook", capabilities: {}, last_seen_at: hace(60 * 24), created_at: "2026-07-05T12:00:00Z" };
    const r = detectarDuplicadas({ yo, todas: [yo, vieja], idAnteriorMigracion: vieja.id, ahora: AHORA });
    expect(r.candidatas[0]).toMatchObject({ id: vieja.id, confianza: "alta" });
    expect(r.candidatas[0].razon).toMatch(/servidor local/);
  });

  it("en línea ahora: solo con una prueba fuerte (mismo equipo) sigue siendo candidata", () => {
    const yo: YoNeurona = { ...MAGGABOOK, equipo: "MaggaBook", so: "macos" };
    const chromeAbierto: FilaNeurona = { ...MACOS_WEB, last_seen_at: hace(4) };
    const presente: MedioPresente = { n: chromeAbierto.id, t: AHORA - 5_000, d: { so: "macos", equipo: "MaggaBook.local", medio: "web" } };
    const r = detectarDuplicadas({ yo, todas: [chromeAbierto], presentes: [presente], ahora: AHORA });
    expect(r.candidatas[0]).toMatchObject({ id: chromeAbierto.id, confianza: "alta", enLineaAhora: true });
    expect(r.candidatas[0].motivos[0]).toBe("mismo equipo (MaggaBook) y mismo sistema");
    // El mismo caso sin equipo en vivo y con la huella solo «probable»: otro aparato encendido a la vez.
    const otro: FilaNeurona = { ...chromeAbierto, capabilities: { platform: "macOS", browser: "Chrome 141", cores: 8, gpuRenderer: "Apple GPU" } };
    const r2 = detectarDuplicadas({ yo: { ...yo, capabilities: { platform: "macOS", cores: 8, gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)" } }, todas: [otro], ahora: AHORA });
    expect(r2.candidatas).toEqual([]);
    expect(r2.descartadas[0].motivo).toMatch(/en línea ahora/);
  });

  it("mismo nombre de máquina (huella) → muy probable; nombre de máquina distinto → descartada", () => {
    const yo: YoNeurona = { id: "yo-000001", name: "Portátil", capabilities: { platform: "Linux", maquina: "ffff000011112222" }, created_at: hace(10) };
    const misma: FilaNeurona = { id: "otra-00001", name: "Portátil", capabilities: { platform: "Linux", maquina: "ffff000011112222" }, last_seen_at: hace(60 * 24 * 2) };
    const distinta: FilaNeurona = { id: "otra-00002", name: "Portátil", capabilities: { platform: "Linux", maquina: "0000aaaa0000bbbb" }, last_seen_at: hace(60 * 24 * 2) };
    const r = detectarDuplicadas({ yo, todas: [misma, distinta], ahora: AHORA });
    expect(r.candidatas.map((c) => [c.id, c.confianza])).toEqual([["otra-00001", "alta"]]);
    expect(r.candidatas[0].motivos).toContain("mismo nombre de máquina");
    expect(r.descartadas[0]).toMatchObject({ id: "otra-00002", motivo: "nombre de máquina distinto" });
  });

  it("las ya fusionadas (marca o alias) y las filas vacías no cuentan", () => {
    const yo: YoNeurona = { ...MAGGADROID_PHONE };
    const marcada: FilaNeurona = { ...MAGGADROID, capabilities: { ...MAGGADROID.capabilities, fusionada: { en: "x", ts: 1 } } };
    const conAlias: FilaNeurona = { ...MAGGADROID, id: "alias-000001" };
    const vacia: FilaNeurona = { id: "vacia-000001", capabilities: {}, last_seen_at: hace(100) };
    const r = detectarDuplicadas({ yo, todas: [marcada, conAlias, vacia], alias: { "alias-000001": { a: "otra" } }, ahora: AHORA });
    expect(r.candidatas).toEqual([]);
    expect(r.descartadas.map((d) => d.motivo)).toEqual(["ya se fusionó en otra neurona", "ya se fusionó en otra neurona", "no tiene datos del aparato"]);
  });

  it("nunca lanza con datos raros", () => {
    expect(detectarDuplicadas({ yo: { id: "" }, todas: CUENTA, ahora: AHORA })).toEqual({ candidatas: [], descartadas: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(detectarDuplicadas({ yo: { id: "x-000001" }, todas: [null as any, { id: 5 } as any], ahora: AHORA }).candidatas).toEqual([]);
  });
});

describe("nombres", () => {
  it("«X» y «X phone» (y otros añadidos de medio) son el mismo nombre; bases distintas, no", () => {
    expect(nombresParecidos("Maggadroid", "Maggadroid phone")).toBe(true);
    expect(nombresParecidos("MaggaBook (app)", "maggabook")).toBe(true);
    expect(nombresParecidos("Portátil de casa", "Portátil de casa 2")).toBe(true);
    expect(nombresParecidos("Maggaboard", "Maggadroid")).toBe(false);
    expect(nombresParecidos("iseed maggadroid", "Maggadroid phone")).toBe(false);
    expect(nombresParecidos("Maggadroid", "Maggadroid de Ana")).toBe(false);
  });
  it("los nombres que pone el OS no dicen nada", () => {
    expect(esNombreGenerico("💻 macOS · Chrome 141")).toBe(true);
    expect(esNombreGenerico("📱 Android")).toBe(true);
    expect(esNombreGenerico("Neurona macOS")).toBe(true);
    expect(esNombreGenerico("Mi neurona")).toBe(true);
    expect(esNombreGenerico("")).toBe(true);
    expect(esNombreGenerico("📱 iseed maggadroid")).toBe(false);
    expect(nombresParecidos("📱 Android · Chrome 154", "📱 Android · Chrome 154")).toBe(false);
  });
  it("la razón junta las dos señales más fuertes en una frase", () => {
    expect(razonDe(["misma huella de hardware", "nombre parecido («A» y «A phone»)", "mismo navegador"])).toBe(
      "Misma huella de hardware y nombre parecido («A» y «A phone»).",
    );
    expect(razonDe([])).toBe("");
  });
});
