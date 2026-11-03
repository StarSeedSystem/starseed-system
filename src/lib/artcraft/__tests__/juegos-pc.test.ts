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
  it("ruta B: servidor propio con GPU, Wine o Proton y transmisión", () => {
    expect(plan(NEURONA_SERVIDOR, [SERVIDOR_PROPIO]).ruta).toBe("servidor-propio");
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
  // Rescate RTART1025Ld: sin capa de compatibilidad Y sin transmisión, un
  // servidor propio con GPU no vale para la ruta B (ni para ninguna otra).
  it("servidor propio con GPU, sin Wine ni Proton y sin transmisión: ninguna", () => {
    expect(plan(NEURONA_SERVIDOR, [{ ...SERVIDOR_PROPIO, wineOProton: false, transmision: null }]).ruta).toBe("ninguna");
  });
  // Rescate RTART1025Lbs: sin GPU no vale aunque tenga Wine/Proton y transmisión.
  it("servidor propio sin GPU, con Wine/Proton y transmisión: ninguna", () => {
    expect(plan(NEURONA_SERVIDOR, [{ id: "cpu", propio: true, compartido: false, gpu: false, wineOProton: true, transmision: "sunshine", libreDiscoGB: 200 }]).ruta).toBe("ninguna");
  });
  // Rescate RTART1025Lbs: elegir el servidor propio viable aunque otro sin GPU vaya antes
  // (la búsqueda recorre la lista; el primero inválido no se queda con la ruta).
  it("elige el servidor propio viable aunque un servidor sin GPU vaya antes", () => {
    const servidores: EntradaPlan["servidores"] = [
      { ...SERVIDOR_PROPIO, id: "sin-gpu", gpu: false, transmision: null },
      { ...SERVIDOR_PROPIO, id: "cpu", transmision: "sunshine" },
    ];
    const r = plan(NEURONA_SERVIDOR, servidores);
    expect(r.ruta).toBe("servidor-propio");
    expect(r.pasos.join(" ")).toContain("abre Rare en servidor");
  });
  it("ruta A: pasos exactos, sin instrucciones de más", () => {
    expect(plan(NEURONA_A, []).pasos).toEqual(["abre Rare", "inicia sesión en Epic tú mismo"]);
  });
  it("sin ruta: además de sin pasos, avisa de que no hay ruta disponible", () => {
    expect(plan(NEURONA_SERVIDOR, []).avisos).toContain("no hay ruta disponible en las condiciones actuales");
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
  it("los hallazgos no repiten el valor del secreto detectado (rescate RTART1025Ld)", () => {
    const r = validarSinCredencialesEpic(`{"access_token":"${VALOR}","exchange_code":"código1234"}`);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(VALOR.slice(0, 10));
  });
  it("refresh_token y account_id también se detectan, sin repetir el valor", () => {
    const r = validarSinCredencialesEpic(`refresh_token: ${VALOR} y account_id: abcdef123456`);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toHaveLength(2);
    expect(r.hallazgos.join(" ")).toContain("refresh_token");
    expect(r.hallazgos.join(" ")).toContain("account_id");
    expect(JSON.stringify(r)).not.toContain(VALOR.slice(0, 10));
  });
  it("detecta tokens con prefijo eg1~", () => {
    const token = ["eg1", "~", "TkAb12-9_kk"].join("");
    expect(validarSinCredencialesEpic(`el texto contiene ${token} y ya`).ok).toBe(false);
  });
  it("SUP0111S · los hallazgos nunca repiten el secreto", () => {
    const token = ["eg1", "~", "TkAb12-9_kk"].join("");
    const r = validarSinCredencialesEpic(`uno ${token} y otro ${token}x, con access_token=${VALOR}`);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("TkAb12");
    expect(JSON.stringify(r)).not.toContain(VALOR);
    expect(r.hallazgos).toEqual(["access_token", "2 tokens eg1~ (ocultos)"]);
  });
  it("SUP0111S · nombrar un campo sin valor (o con uno corto) no es una fuga", () => {
    expect(validarSinCredencialesEpic("Nunca guardes el access_token ni el refresh_token aquí.")).toEqual({ ok: true, hallazgos: [] });
    expect(validarSinCredencialesEpic('{"access_token":"corto"}').ok).toBe(true);
    expect(validarSinCredencialesEpic(`refresh_token: '${VALOR}'`).hallazgos).toEqual(["refresh_token"]);
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
      "https://protondb.com/", "https://example.com/RareDevs/Rare.zip", "sin url",
    ]) expect(esUrlPermitidaRare(u), u).toBe(false);
  });
  it("SUP0111H · un `..` en claro o codificado no se escapa del repo oficial", () => {
    for (const u of [
      "https://github.com/RareDevs/Rare/releases/../../../evil/x",
      "https://github.com/RareDevs/Rare/releases/%2e%2e/%2e%2e/evil/x",
      "https://github.com/RareDevs/Rare/releases/%2E%2E/evil/x",
      "https://github.com/RareDevs/Rare/releases/tag/1/..%2f..%2fevil",
    ]) expect(esUrlPermitidaRare(u), u).toBe(false);
  });
  it("SUP0111H · otro host que solo lo parece queda fuera", () => {
    for (const u of [
      "https://github.com.evil.com/RareDevs/Rare/releases/latest",
      "https://evilgithub.com/RareDevs/Rare/releases/latest",
      "https://user@github.com/RareDevs/Rare/releases/latest",
      "https://user:clave@github.com/RareDevs/Rare/releases/latest",
      "https://github.com:8443/RareDevs/Rare/releases/latest",
    ]) expect(esUrlPermitidaRare(u), u).toBe(false);
  });
  // Rescate RTKAL1101A: vectores de parseo que main aún no fijaba por nombre.
  it("SUP0111H · arroba en la ruta, host IPv6 y travesía con barra invertida quedan fuera", () => {
    for (const u of [
      "https://github.com/RareDevs/Rare/releases@evil.com/1",
      "https://[::1]/RareDevs/Rare/releases/1",
      "https://github.com/RareDevs/Rare/releases/..\\evil/x",
      "https://github.com/RareDevs/Rare/releases/../../../../RareDevs/Rare/releases/1",
    ]) expect(esUrlPermitidaRare(u), u).toBe(false);
  });
  it("SUP0111H · URL inválida, con barra invertida o protocolo que no es https: false", () => {
    for (const u of [
      "no es una url", "://", "https://", "https://github.com",
      "https:\\\\github.com\\RareDevs\\Rare\\releases\\latest",
      "ftp://github.com/RareDevs/Rare/releases/latest",
    ]) expect(esUrlPermitidaRare(u), u).toBe(false);
  });
  it("RTART1025Lbs · la ruta de descarga releases/download vale; releases sin cola no", () => {
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

  it("solo se actualiza desde github.com/RareDevs/Rare/releases", () => {
    const ficha = rare();
    expect(ficha.actualizacion.fuente).toBe("github-tags");
    expect(ficha.actualizacion.ref).toBe("RareDevs/Rare");
    expect(ficha.actualizacion.filtro).toBeTruthy();
    expect(ficha.actualizacion.ultimaVersion).toMatch(new RegExp(ficha.actualizacion.filtro as string));
  });
});
