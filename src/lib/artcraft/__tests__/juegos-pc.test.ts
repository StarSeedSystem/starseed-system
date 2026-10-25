import { describe, expect, it } from "vitest";
import { AVISO_SIN_GPU, CONDICIONES_EPIC_DECIDIDAS, esUrlPermitidaRare, planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic } from "../juegos-pc";
import type { EntradaJuegoPc, ServidorJuegoPc } from "../juegos-pc";

// Los valores con forma de clave se montan en tiempo de ejecución: ninguna cadena con forma de clave vive en el repo.
const VALOR = ["aB9", "cdE4", "fGh7", "jKm1"].join("");
const EG1 = ["eg1", "~", VALOR].join("");
const SESION_JSON = `{"${["access", "_token"].join("")}": "${["zx", "12345678", "Y"].join("")}"}`;

const mac = (t: boolean, rare: boolean): EntradaJuegoPc["neurona"] => ({ sistema: "macos", tienePantalla: t, binarioRare: rare, gpu: true, memoriaMB: 16_000 });
const srv = (extra: Partial<ServidorJuegoPc>): ServidorJuegoPc =>
  ({ id: "oraculo-a1", propio: true, compartido: false, gpu: false, wineOProton: true, transmision: "selkies", libreDiscoGB: 120, ...extra });
const entrada = (n: EntradaJuegoPc["neurona"], s: ServidorJuegoPc[], acepta = false): EntradaJuegoPc =>
  ({ neurona: n, servidores: s, persona: { id: "alex", aceptaCondicionesEpic: acepta } });

describe("juegos-pc · planificarJuegoPc (rutas §5.1)", () => {
  it("ruta A: neurona con pantalla y Rare instalado", () => { expect(planificarJuegoPc(entrada(mac(true, true), [])) ).toMatchObject({ ruta: "neurona-propia", motivo: expect.stringContaining("pantalla") });
    expect(planificarJuegoPc(entrada(mac(true, true), [])).pasos.some((p) => p.includes("Epic"))).toBe(true); });
  it("ruta A sin GPU: aviso del A1 de Oracle, pero sigue abierta para 2D", () => {
    const p = planificarJuegoPc(entrada({ sistema: "linux", tienePantalla: true, binarioRare: true, gpu: false, memoriaMB: 0 }, []));
    expect(p.ruta).toBe("neurona-propia"); expect(p.avisos).toContain(AVISO_SIN_GPU);
  });
  it("sin Rare ni servidores: ninguna, con el motivo", () => {
    expect(planificarJuegoPc(entrada(mac(true, false), []))).toMatchObject({ ruta: "ninguna", motivo: expect.stringContaining("no hay ruta") });
  });
});

describe("juegos-pc · rutas B y C", () => {
  it("Mac sin pantalla, servidor propio con GPU y transmisión: ruta B", () => {
    const p = planificarJuegoPc(entrada(mac(false, false), [srv({ id: "jde", gpu: true, transmision: "sunshine" })]));
    expect(p).toMatchObject({ ruta: "servidor-propio", motivo: expect.stringContaining("jde") });
    expect(p.pasos.some((x) => x.includes("sunshine"))).toBe(true);
  });
  it("ruta B sobre el A1 sin GPU: aviso de que no sirve para 3D", () => {
    expect(planificarJuegoPc(entrada(mac(false, false), [srv({})])).avisos).toContain(AVISO_SIN_GPU);
  });
  it("servidor sin Wine/Proton o sin transmisión no vale para la ruta B", () => {
    expect(planificarJuegoPc(entrada(mac(false, false), [srv({ wineOProton: false }), srv({ transmision: null })])).ruta).toBe("ninguna");
  });
  it("ruta C existe a nivel de máquina, pero la constante sin decidir la bloquea", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    const compartido = srv({ propio: false, compartido: true, gpu: true, id: "grupo" });
    const p = planificarJuegoPc(entrada(mac(false, false), [compartido], true));
    expect(p).toMatchObject({ ruta: "ninguna", motivo: expect.stringContaining("Alex") });
  });
  it("sin condiciones decididas, el motivo distingue si la persona aceptó", () => {
    const compartido = srv({ propio: false, compartido: true, gpu: true });
    sinCondiciones(compartido, false);
    const p2 = planificarJuegoPc(entrada(mac(false, false), [compartido], true));
    expect(p2.motivo).toMatch(/espera la palabra de Alex/);
  });
  it("un servidor compartido no sirve como propio", () => {
    expect(planificarJuegoPc(entrada(mac(false, false), [srv({ propio: false, compartido: true, gpu: true })])).ruta).toBe("ninguna");
  });
});

const sinCondiciones = (compartido: ServidorJuegoPc, acepta: boolean): string => {
  const m = planificarJuegoPc(entrada(mac(false, false), [compartido], acepta)).motivo;
  expect(m).toMatch(/condiciones de Epic/); return m;
};

describe("juegos-pc · guarda de credenciales Epic (§5.3)", () => {
  it("texto limpio: ok", () => {
    expect(validarSinCredencialesEpic("Aquí nada que ver: frase cualquiera sin secretos.")).toEqual({ ok: true, hallazgos: [] });
  });
  it("access_token con valor largo: detectado sin repetir el valor (JSON de user.json)", () => {
    const r = validarSinCredencialesEpic(SESION_JSON);
    expect(r.ok).toBe(false); expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0]).toContain("token de acceso"); expect(r.hallazgos[0]).not.toContain("zx12345678Y");
  });
  it("valor corto de 8 o menos no se marca; de más de 8 sí", () => {
    expect(validarSinCredencialesEpic(`{"access_token": "${["x"].join("")}"}`).ok).toBe(true);
    expect(validarSinCredencialesEpic(`{"refresh_token": "${VALOR}"}`).hallazgos).toHaveLength(1);
  });
  it("todos los campos típicos y formas sin comillas; cada campo un hallazgo, sin el valor", () => {
    const texto = `account_id=${["d41", "d8", "cd98f00b204e", "9800998e"].join("")} exchange_code: ${VALOR} "refresh_token":"${["x", "yz123456", "78"].join("")}"`;
    const r = validarSinCredencialesEpic(texto);
    expect(r.hallazgos).toHaveLength(3);
    for (const h of r.hallazgos) expect(texto.includes(h)).toBe(false);
  });
  it("token con prefijo eg1~ montado en tiempo de ejecución: detectado sin el valor", () => {
    const r = validarSinCredencialesEpic(`token ${EG1} en un registro`);
    expect(r.ok).toBe(false); expect(r.hallazgos[0]).toContain("eg1~"); expect(r.hallazgos[0]).not.toContain(VALOR);
  });
  it("rutaConfigEpic: carpeta por persona con 0700", () => {
    expect(rutaConfigEpic("/home/alex/datos", "alex")).toEqual({ ruta: "/home/alex/datos/juegos/alex/legendary", modo: 0o700 });
  });
  it("rutaConfigEpic: persona inválida (mayúsculas, _, larga) lanza", () => {
    for (const id of ["Alex", "a_b", "a".repeat(65), "", "niño"]) expect(() => rutaConfigEpic("/datos", id)).toThrow(/inválido/);
  });
});

describe("juegos-pc · esUrlPermitidaRare", () => {
  it("solo releases de GitHub de RareDevs/Rare se permiten", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases")).toBe(true);
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/tag/1.12.0.237")).toBe(true);
  });
  it("bloqueadas: raredevs.github.io, protondb.com, rutas ajenas, http y sin URL", () => {
    for (const u of ["https://raredevs.github.io/wring/workarounds.json", "https://protondb.com/app/123",
      "https://github.com/RareDevs/Otro/releases", "https://github.com/RareDevs/Rare/blob/main/README.md",
      "http://github.com/RareDevs/Rare/releases", "https://evil.example/Rare/releases", "no es url"])
      expect(esUrlPermitidaRare(u)).toBe(false);
  });
});
