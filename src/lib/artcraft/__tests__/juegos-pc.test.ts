/**
 * «Juegos de PC» (Rare, contrato `architecture/artcraft-y-rare.md` §5 y §5.3).
 * Arriba, las funciones puras de `juegos-pc.ts`: planificador de las rutas A, B y C,
 * carpeta de Legendary por persona, guarda de credenciales de Epic y URLs permitidas.
 * Al fondo se conservan los casos del rescate (RTART1025L) de la ficha viva `rare`
 * del catálogo de la Protomolécula, que también tiene su prueba propia.
 * Ninguna clave real: los valores con forma de sesión se montan con `join("")`.
 */
import { describe, expect, it } from "vitest";
import {
  CONDICIONES_EPIC_DECIDIDAS, esUrlPermitidaRare, planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic,
} from "../juegos-pc";
import { herramientaPorId } from "../../protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "../../protomolecula/catalogo-herramientas";

type EntradaPlan = Parameters<typeof planificarJuegoPc>[0];
const NEURONA_A: EntradaPlan["neurona"] = { sistema: "macos", tienePantalla: true, binarioRare: true, gpu: true, memoriaMB: 16384 };
const NEURONA_SERVIDOR: EntradaPlan["neurona"] = { sistema: "linux", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 8192 };
const SERVIDOR_PROPIO: EntradaPlan["servidores"][number] =
  { id: "casa", propio: true, compartido: false, gpu: true, wineOProton: true, transmision: "selkies", libreDiscoGB: 500 };
const SERVIDOR_COMPARTIDO: EntradaPlan["servidores"][number] =
  { id: "grupo", propio: false, compartido: true, gpu: true, wineOProton: true, transmision: "sunshine", libreDiscoGB: 200 };
const plan = (neurona: EntradaPlan["neurona"], servidores: EntradaPlan["servidores"], aceptaCondicionesEpic = true) =>
  planificarJuegoPc({ neurona, servidores, persona: { id: "alex", aceptaCondicionesEpic } });

describe("planificarJuegoPc · rutas A, B y C (§5.1)", () => {
  it("ruta A: pantalla y Rare instalado, con la sesión de Epic de la persona", () => {
    const r = plan(NEURONA_A, [SERVIDOR_COMPARTIDO]);
    expect(r.ruta).toBe("neurona-propia");
    expect(r.pasos.join(" ")).toContain("abre Rare");
    expect(r.pasos.join(" ")).toContain("inicia sesión en Epic tú mismo");
  });
  it("ruta A manda sobre los servidores compartidos y da los pasos exactos", () => {
    const r = plan(NEURONA_A, [SERVIDOR_COMPARTIDO]);
    expect(r.ruta).toBe("neurona-propia");
    expect(r.pasos).toEqual(["abre Rare", "inicia sesión en Epic tú mismo"]);
  });
  it("ruta B: servidor propio con GPU, Wine o Proton y transmisión", () => {
    expect(plan(NEURONA_SERVIDOR, [SERVIDOR_PROPIO]).ruta).toBe("servidor-propio");
  });
  it("ruta B salta el servidor propio sin GPU y elige el que la tiene", () => {
    const r = plan(NEURONA_SERVIDOR, [
      { id: "sin-gpu", propio: true, compartido: false, gpu: false, wineOProton: true, transmision: null, libreDiscoGB: 40 },
      { id: "con-gpu", propio: true, compartido: false, gpu: true, wineOProton: true, transmision: "sunshine", libreDiscoGB: 40 },
    ]);
    expect(r.ruta).toBe("servidor-propio");
  });
  it("sin pantalla ni servidor viable: ninguna, sin pasos", () => {
    const r = plan(NEURONA_SERVIDOR, []);
    expect(r.ruta).toBe("ninguna");
    expect(r.pasos).toEqual([]);
  });
  it("ruta C bloqueada mientras las condiciones de Epic no estén decididas", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    expect(plan(NEURONA_SERVIDOR, [SERVIDOR_COMPARTIDO]).ruta).toBe("ninguna");
  });
  it("sin condiciones de Epic, aceptar no abre la ruta C y se avisa", () => {
    const r = plan(NEURONA_SERVIDOR, [SERVIDOR_COMPARTIDO], true);
    expect(r.ruta).toBe("ninguna");
    expect(r.pasos).toEqual([]);
    expect(r.avisos).toContain("no hay ruta disponible en las condiciones actuales");
  });
});

describe("rutaConfigEpic · carpeta de Legendary por persona (§5.3)", () => {
  it("devuelve <datos>/juegos/<persona>/legendary con modo 0700", () => {
    expect(rutaConfigEpic("/datos", "alex-b")).toEqual({ ruta: "/datos/juegos/alex-b/legendary", modo: 0o700 });
  });
  it("rechaza ids que no sean minúsculas, números o guiones de 1 a 64", () => {
    for (const id of ["", "Alex", "a b", "../x", "a".repeat(65)]) {
      expect(() => rutaConfigEpic("/datos", id)).toThrow();
    }
  });
});

describe("validarSinCredencialesEpic · nada con forma de sesión de Epic", () => {
  const VALOR = ["Abc123de", "f9Xy8Zq7", "0203"].join("");
  it("un texto limpio pasa", () => {
    expect(validarSinCredencialesEpic("La sesión vive en la carpeta privada de la persona.")).toEqual({ ok: true, hallazgos: [] });
  });
  it("detecta access_token y exchange_code con valor largo", () => {
    const cuerpo = ["{\"access_token\":\"", VALOR, "\",\"exchange_code\":\"código1234\"}"].join("");
    const r = validarSinCredencialesEpic(cuerpo);
    expect(r.ok).toBe(false);
    expect(r.hallazgos.join(" ")).toContain("access_token");
    expect(r.hallazgos.join(" ")).toContain("exchange_code");
  });
  it("detecta tokens con prefijo eg1~", () => {
    const token = ["eg1", "~", "TkAb12-9_kk"].join("");
    expect(validarSinCredencialesEpic(`el texto contiene ${token} y ya`).ok).toBe(false);
  });
});

describe("esUrlPermitidaRare · solo releases oficiales, descargas remotas bloqueadas", () => {
  it("las páginas de releases de RareDevs/Rare valen", () => {
    for (const u of ["https://github.com/RareDevs/Rare/releases/tag/1.12.0.237", "https://github.com/RareDevs/Rare/releases/latest"]) {
      expect(esUrlPermitidaRare(u), u).toBe(true);
    }
  });
  it("dominios remotos, http y otros repos quedan fuera", () => {
    for (const u of [
      "https://raredevs.github.io/wring/workarounds.json", "https://www.protondb.com/app/1",
      "http://github.com/RareDevs/Rare/releases/tag/1", "https://github.com/RareDevs/Otro/releases/1",
    ]) expect(esUrlPermitidaRare(u), u).toBe(false);
  });
  it("acepta el binario de una release oficial y rechaza la raíz de releases sin barra", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/download/1.12.0.237/Rare.dmg")).toBe(true);
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases")).toBe(false);
  });
});

function rare(): HerramientaProto {
  const ficha = herramientaPorId("rare");
  expect(ficha, "Rare debe estar en el catálogo de la Protomolécula").toBeDefined();
  return ficha as HerramientaProto;
}

describe("Rare: ficha viva del catálogo, programa aparte y credenciales de Epic", () => {
  it("ruta A: programa aparte solo por cli, llamado por la persona y sin canal de control", () => {
    const ficha = rare();
    expect(ficha.control.via).toEqual(["cli"]);
    expect(ficha.control.notas).toContain("rare launch");
    expect(ficha.control.notas).toContain("rare login");
    expect(ficha.control.notas).toContain("--offline");
    expect(ficha.control.notas).toMatch(/no tiene servidor MCP ni canal de control/);
    expect(ficha.motivo).toMatch(/SOLO como programa aparte/);
    expect(ficha.motivo).toMatch(/nunca enlazado ni en un Worker/);
    expect(ficha.motivo).toMatch(/una neurona con pantalla/);
  });

  it("una Mac sin pantalla: ningún modo disponible (la Qt de Rare no va sin pantalla)", () => {
    expect(rare().control.notas).toContain("no tiene modo sin pantalla");
  });

  it("cuenta de Epic por persona: LEGENDARY_CONFIG_PATH con permisos 0700, fuera de repo, memoria y sala", () => {
    const notas = rare().control.notas;
    expect(notas).toContain("LEGENDARY_CONFIG_PATH");
    expect(notas).toContain("0700");
    expect(notas).toMatch(/por persona/);
    expect(notas).toMatch(/nunca la lleva a un repositorio, una memoria ni una sala/);
  });

  it("la ficha publicada no lleva campos de la sesión de Epic ni claves reales", () => {
    const texto = JSON.stringify(rare());
    for (const campo of ["access_token", "refresh_token", "account_id", "exchange_code"]) {
      expect(texto).not.toContain(campo);
    }
  });

  it("nombra las descargas remotas sin huella que bloquea y solo permite el repo oficial de RareDevs", () => {
    const ficha = rare();
    const avisos = (ficha.avisos ?? []).join(" ");
    expect(avisos).toContain("raredevs.github.io/wring");
    expect(avisos).toContain("ProtonDB");
    expect(avisos).toMatch(/bloquea o se aloja con SHA fijado/);
    expect(ficha.codigo).toBe("https://github.com/RareDevs/Rare");
  });

  it("sin condiciones de Epic decididas por Alex, las rutas de servidores siguen sin cablear", () => {
    const ficha = rare();
    expect(ficha.motivo).toMatch(/sin cablear/);
    const avisos = (ficha.avisos ?? []).join(" ");
    expect(avisos).toContain("una cuenta por persona");
    expect(avisos).toMatch(/las decide Alex/);
    expect(avisos).toContain("servidores compartidos");
  });
});
