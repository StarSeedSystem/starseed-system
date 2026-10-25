import { describe, expect, it } from "vitest";
import {
  CONDICIONES_EPIC_DECIDIDAS,
  esUrlPermitidaRare,
  planificarJuegoPc,
  rutaConfigEpic,
  validarSinCredencialesEpic,
} from "../juegos-pc";
import type { EntradaJuegoPc, NeuronaJuego, PersonaJuego, ServidorJuego } from "../juegos-pc";

const neurona = (extra: Partial<NeuronaJuego> = {}): NeuronaJuego =>
  ({ sistema: "macos", tienePantalla: true, binarioRare: true, gpu: true, memoriaMB: 16384, ...extra });
const servidor = (extra: Partial<ServidorJuego> = {}): ServidorJuego =>
  ({ id: "servidor-1", propio: true, compartido: false, gpu: true, wineOProton: true,
    transmision: "sunshine", libreDiscoGB: 200, ...extra });
const persona = (extra: Partial<PersonaJuego> = {}): PersonaJuego =>
  ({ id: "alex", aceptaCondicionesEpic: true, ...extra });
const plan = (e: Partial<EntradaJuegoPc> = {}) =>
  planificarJuegoPc({ neurona: neurona(), servidores: [servidor()], persona: persona(), ...e });

describe("planificarJuegoPc · ruta A, neurona propia", () => {
  it("con pantalla y Rare instalado juega en la neurona y una persona confirma", () => {
    const p = plan();
    expect(p.ruta).toBe("neurona-propia");
    expect(p.pasos.join(" ")).toMatch(/abre rare/i);
    expect(p.pasos.join(" ")).toMatch(/inicia sesión en epic tú mismo/i);
    expect(p.pasos.join(" ")).toMatch(/confirma tú/i);
  });
  it("sin GPU avisa de que los 3D irán mal, aunque la ruta siga siendo la propia", () => {
    const p = plan({ neurona: neurona({ gpu: false }) });
    expect(p.ruta).toBe("neurona-propia");
    expect(p.avisos.join(" ")).toMatch(/sin GPU/);
  });
  it("Mac sin pantalla no puede usar la ruta A", () => {
    const p = plan({ neurona: neurona({ tienePantalla: false, sistema: "macos" }), servidores: [] });
    expect(p.ruta).toBe("ninguna");
    expect(p.motivo).toMatch(/no tiene pantalla/);
  });
  it("sin Rare instalado y sin servidores válidos no hay ruta", () => {
    const p = plan({ neurona: neurona({ binarioRare: false }), servidores: [] });
    expect(p.ruta).toBe("ninguna");
    expect(p.motivo).toMatch(/Rare no está instalado/);
  });
});

describe("planificarJuegoPc · ruta B, servidor propio", () => {
  it("con GPU, Wine o Proton y transmisión, la ventana llega a tu pantalla", () => {
    const p = plan({ neurona: neurona({ tienePantalla: false }), servidores: [servidor()] });
    expect(p.ruta).toBe("servidor-propio");
    expect(p.pasos.join(" ")).toMatch(/Selkies o Sunshine/);
    expect(p.pasos.join(" ")).toMatch(/inicia sesión en Epic tú mismo/i);
  });
  it("sin GPU no sirve, y avisa de que el A1 de Oracle no vale para 3D", () => {
    const p = plan({ neurona: neurona({ tienePantalla: false }), servidores: [servidor({ gpu: false })] });
    expect(p.ruta).toBe("ninguna");
    expect(p.avisos.join(" ")).toMatch(/A1 de Oracle \(sin GPU\)/);
  });
  it("sin Wine ni Proton no se ofrece la ruta B", () => {
    const p = plan({ neurona: neurona({ tienePantalla: false }), servidores: [servidor({ wineOProton: false })] });
    expect(p.ruta).toBe("ninguna");
  });
  it("sin transmisión (Selkies o Sunshine) no se ofrece la ruta B", () => {
    const p = plan({ neurona: neurona({ tienePantalla: false }), servidores: [servidor({ transmision: null })] });
    expect(p.ruta).toBe("ninguna");
  });
  it("un servidor propio tiene prioridad sobre uno compartido", () => {
    const p = plan({
      neurona: neurona({ tienePantalla: false }),
      servidores: [servidor({ id: "grupo", propio: false, compartido: true }), servidor({ id: "mio" })],
    });
    expect(p.ruta).toBe("servidor-propio");
  });
});

describe("planificarJuegoPc · ruta C, servidor compartido", () => {
  const compartido = (): ServidorJuego => servidor({ id: "grupo", propio: false, compartido: true });
  it("hasta que Alex decida, la ruta C no se ofrece", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    const p = plan({ neurona: neurona({ tienePantalla: false }), servidores: [compartido()] });
    expect(p.ruta).toBe("ninguna");
    expect(p.motivo).toMatch(/espera la palabra de Alex/);
  });
  it("tampoco se ofrece aunque la persona acepte las condiciones mientras la constante siga en false", () => {
    const p = plan({
      neurona: neurona({ tienePantalla: false }),
      servidores: [compartido()],
      persona: persona({ aceptaCondicionesEpic: true }),
    });
    expect(p.ruta).not.toBe("servidor-compartido");
  });
  it("una persona sin condiciones aceptadas tampoco desbloquea el servidor compartido", () => {
    const p = plan({
      neurona: neurona({ tienePantalla: false }),
      servidores: [compartido()],
      persona: persona({ aceptaCondicionesEpic: false }),
    });
    expect(p.ruta).toBe("ninguna");
  });
});

describe("rutaConfigEpic · sesión de Legendary por persona", () => {
  it("deja la configuración bajo <datos>/juegos/<persona>/legendary con modo 0700", () => {
    expect(rutaConfigEpic("/srv/datos", "alex-01")).toEqual({
      ruta: "/srv/datos/juegos/alex-01/legendary",
      modo: 0o700,
    });
    expect(rutaConfigEpic("/srv/datos/", "alex").ruta).toBe("/srv/datos/juegos/alex/legendary");
  });
  it("rechaza identificadores de persona que no sean minúsculas, números o guiones", () => {
    for (const mal of ["Alex", "../alex", "alex/otra", "", "con espacio", "a".repeat(65)]) {
      expect(() => rutaConfigEpic("/srv/datos", mal)).toThrow(/identificador de persona/);
    }
  });
});

describe("validarSinCredencialesEpic · guarda de credenciales", () => {
  const valor = ["abc", "def", "ghi", "jkl"].join("");
  it("un texto limpio pasa sin hallazgos", () => {
    expect(validarSinCredencialesEpic("Rare se abre a mano; la sesión de Epic es de cada persona.")).toEqual({
      ok: true,
      hallazgos: [],
    });
    expect(validarSinCredencialesEpic('{"account_id": "123"}').ok).toBe(true);
  });
  it("detecta access_token sin repetir su valor", () => {
    const r = validarSinCredencialesEpic(`{"access_token": "${valor}"}`);
    expect(r.ok).toBe(false);
    expect(r.hallazgos.join(" ")).toMatch(/access_token/);
    expect(r.hallazgos.join(" ")).not.toContain(valor.slice(0, 6));
  });
  it("detecta refresh_token, account_id y exchange_code con valores largos", () => {
    for (const campo of ["refresh_token", "account_id", "exchange_code"]) {
      const r = validarSinCredencialesEpic(`${campo} = ${valor}`);
      expect(r.ok).toBe(false);
      expect(r.hallazgos.join(" ")).toContain(campo);
    }
  });
  it("detecta un token con prefijo eg1~ montado en tiempo de ejecución", () => {
    const token = ["eg1", "~AbCdEf123456"].join("");
    const r = validarSinCredencialesEpic(`cabecera: ${token}`);
    expect(r.ok).toBe(false);
    expect(r.hallazgos.join(" ")).toMatch(/eg1~/);
    expect(r.hallazgos.join(" ")).not.toContain(token.slice(4, 10));
  });
});

describe("esUrlPermitidaRare · solo releases oficiales", () => {
  it("acepta las releases de Rare en GitHub", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/tag/1.12.0.237")).toBe(true);
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/")).toBe(true);
  });
  it("bloquea raredevs.github.io, ProtonDB y las descargas remotas de datos", () => {
    for (const url of [
      "https://raredevs.github.io/wring/workarounds.json",
      "https://www.protondb.com/api/v1/reports/summaries/123.json",
      "https://github.com/RareDevs/Rare/raw/main/rare/wrapper.py",
      "https://raw.githubusercontent.com/RareDevs/Rare/main/steam_appids.json.xz",
      "https://github.com/otro/Rare/releases/tag/1.0",
    ]) {
      expect(esUrlPermitidaRare(url)).toBe(false);
    }
  });
  it("rechaza http, otros esquemas y URLs inválidas", () => {
    for (const url of ["http://github.com/RareDevs/Rare/releases/tag/1", "file:///tmp/rare", "no-es-url"]) {
      expect(esUrlPermitidaRare(url)).toBe(false);
    }
  });
});
