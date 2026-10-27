import { describe, it, expect } from "vitest";
import { CONDICIONES_EPIC_DECIDIDAS, esUrlPermitidaRare, planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic } from "../juegos-pc";
import type { DatosJuegoPc, ServidorJuegoPc } from "../juegos-pc";

const servidor = (extra: Partial<ServidorJuegoPc> = {}): ServidorJuegoPc =>
  ({ id: "srv", propio: true, compartido: false, gpu: true, wineOProton: true, transmision: "selkies", libreDiscoGB: 120, ...extra });
const datos = (sinExtra: Partial<DatosJuegoPc> = {}, conServidor: Partial<ServidorJuegoPc> = {}): DatosJuegoPc =>
  ({ neurona: { sistema: "macos", tienePantalla: true, binarioRare: true, gpu: false, memoriaMB: 8192 },
    servidores: [servidor(conServidor)], persona: { id: "alex", aceptaCondicionesEpic: true }, ...sinExtra });
const PANTALLA_CERO: DatosJuegoPc = { neurona: { sistema: "macos", tienePantalla: false, binarioRare: true, gpu: false, memoriaMB: 8192 }, servidores: [], persona: { id: "alex", aceptaCondicionesEpic: true } };

describe("planificarJuegoPc · rutas (§5.1)", () => {
  it("ruta A con pantalla y Rare instalado", () => {
    const p = planificarJuegoPc(datos());
    expect(p.ruta).toBe("neurona-propia");
    expect(p.pasos).toEqual(expect.arrayContaining(["abre Rare"]));
    expect(p.pasos.some((s) => s.includes("inicia sesión en Epic tú mismo"))).toBe(true);
  });

  it("Mac sin pantalla no va por la ruta A", () => {
    expect(planificarJuegoPc({ ...PANTALLA_CERO }).ruta).toBe("ninguna");
  });

  it("neurona sin Rare tampoco", () => {
    expect(planificarJuegoPc({ ...datos({ neurona: { sistema: "windows", tienePantalla: true, binarioRare: false, gpu: true, memoriaMB: 16384 } }), servidores: [] }).ruta).toBe("ninguna");
  });

  it("sin casi nada, el «ninguna» dice que no hay ruta", () => {
    const p = planificarJuegoPc({ ...PANTALLA_CERO });
    expect(p.ruta).toBe("ninguna");
    expect(p.pasos).toEqual([]);
    expect(p.avisos.length).toBeGreaterThan(0);
  });

  it("ruta B con servidor propio con GPU, Wine o Proton y transmisión", () => {
    const p = planificarJuegoPc(datos({ neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } }));
    expect(p.ruta).toBe("servidor-propio");
    expect(p.motivo).toContain("srv");
    expect(p.pasos.some((s) => s.includes("selkies"))).toBe(true);
  });

  it("servidor Sunshine también vale para la ruta B", () => {
    expect(planificarJuegoPc(datos({ servidores: [servidor({ transmision: "sunshine" })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } })).ruta).toBe("servidor-propio");
  });

  it("sin transmisión no hay ruta B", () => {
    expect(planificarJuegoPc(datos({ servidores: [servidor({ transmision: null })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } })).ruta).toBe("ninguna");
  });

  it("sin Wine o Proton no hay ruta B", () => {
    expect(planificarJuegoPc(datos({ servidores: [servidor({ wineOProton: false })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } })).ruta).toBe("ninguna");
  });

  it("sin disco libre no hay ruta B (los juegos pesan decenas de GB)", () => {
    expect(planificarJuegoPc(datos({ servidores: [servidor({ libreDiscoGB: 0 })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } })).ruta).toBe("ninguna");
  });

  it("un servidor no propio no computa para la ruta B", () => {
    expect(planificarJuegoPc(datos({ servidores: [servidor({ propio: false })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } })).ruta).toBe("ninguna");
  });

  it("el A1 de Oracle (sin GPU) se avisa: no sirve para 3D", () => {
    const p = planificarJuegoPc(datos({ servidores: [servidor({ gpu: false })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } }));
    expect(p.avisos.some((a) => a.includes("sin GPU") && a.includes("3D"))).toBe(true);
  });

  it("la ruta C está bloqueada mientras CONDICIONES_EPIC_DECIDIDAS sea false", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    const p = planificarJuegoPc(datos({ servidores: [servidor({ propio: false, compartido: true })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } }));
    expect(p.ruta).toBe("ninguna");
    expect(p.motivo).toMatch(/condiciones de Epic|Alex/iu);
  });

  it("aunque la persona acepte condiciones, sin decisión de Alex no hay ruta C", () => {
    const p = planificarJuegoPc(datos({ servidores: [servidor({ propio: false, compartido: true })], persona: { id: "alex", aceptaCondicionesEpic: true }, neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } }));
    expect(p.ruta).not.toBe("servidor-compartido");
  });

  it("un servidor compartido no vale para la ruta B", () => {
    expect(planificarJuegoPc(datos({ servidores: [servidor({ propio: false, compartido: true })], neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } })).ruta).toBe("ninguna");
  });

  it("la ruta B tiene el aviso de que el juego lo instala la persona en su sesión", () => {
    const p = planificarJuegoPc(datos({ neurona: { sistema: "otro", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 4096 } }));
    expect(p.pasos.some((s) => s.includes("instala los juegos"))).toBe(true);
  });
});

describe("rutaConfigEpic (§5.3)", () => {
  it("ruta con la persona dentro y modo 0700", () => {
    expect(rutaConfigEpic("/var/starseed", "alex")).toEqual({ ruta: "/var/starseed/juegos/alex/legendary", modo: 0o700 });
  });

  it("personas con guiones valen", () => {
    expect(rutaConfigEpic("/d", "a-1").ruta).toBe("/d/juegos/a-1/legendary");
  });

  it("persona inválida lanza (mayúsculas, guion bajo, vacía o demasiado larga)", () => {
    for (const id of ["Alex", "a_b", "", "x".repeat(65)]) expect(() => rutaConfigEpic("/d", id)).toThrow();
  });
});

const KEY_TOKEN = ["eg1", "~", "abc", "defgh", "12345"].join("");
const DESMENUZADO = (campo: string, valor: string): string => [campo, ": ", valor].join("");

describe("validarSinCredencialesEpic (§5.3)", () => {
  it("texto limpio está en verde", () => {
    expect(validarSinCredencialesEpic("Rare 1.12 listo; la sesión la hace cada persona.")).toEqual({ ok: true, hallazgos: [] });
  });

  it("detecta los cuatro campos típicos de user.json y no repite el valor", () => {
    const texto = DESMENUZADO("access_token", "xxxxxxxxxxxxx") + " " + DESMENUZADO("refresh_token", "xxxxxxxxxxxxx");
    const v = validarSinCredencialesEpic(texto);
    expect(v.ok).toBe(false);
    expect(v.hallazgos).toEqual(["campo «access_token» de una sesión de Epic", "campo «refresh_token» de una sesión de Epic"]);
    expect(v.hallazgos.join(" ")).not.toContain("x");
  });

  it("detecta account_id y exchange_code", () => {
    const v = validarSinCredencialesEpic(DESMENUZADO("account_id", "xxxxxxxxxxx") + " " + DESMENUZADO("exchange_code", "yyyyyyyyyyyy"));
    expect(v.ok).toBe(false);
    expect(v.hallazgos.length).toBe(2);
  });

  it("detecta el token con prefijo eg1~ sin exponerlo", () => {
    const v = validarSinCredencialesEpic(`token ${KEY_TOKEN}`);
    expect(v.ok).toBe(false);
    expect(v.hallazgos.join(" ")).toContain("eg1~");
    expect(v.hallazgos.join(" ")).not.toContain(KEY_TOKEN);
  });

  it("un valor corto no cuenta como sesión filtrada", () => {
    expect(validarSinCredencialesEpic("access_token: nil")).toEqual({ ok: true, hallazgos: [] });
  });
});

describe("esUrlPermitidaRare (§5.3)", () => {
  it("releases oficiales de GitHub sí", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/download/1.12.0/rare.zip")).toBe(true);
  });

  it("el sitio de Rare se bloquea hasta fijar SHA", () => {
    expect(esUrlPermitidaRare("https://raredevs.github.io/rare/descarga")).toBe(false);
  });

  it("ProtonDB se bloquea", () => {
    expect(esUrlPermitidaRare("https://www.protondb.com/app/480")).toBe(false);
  });

  it("otra descarga remota se bloquea", () => {
    expect(esUrlPermitidaRare("https://ejemplo.org/rare-instalador.exe")).toBe(false);
  });

  it("http y basura se bloquean", () => {
    expect(esUrlPermitidaRare("http://github.com/RareDevs/Rare/releases/latest")).toBe(false);
    expect(esUrlPermitidaRare("no-es-url")).toBe(false);
  });
});
