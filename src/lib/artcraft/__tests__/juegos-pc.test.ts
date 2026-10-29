/**
 * Pruebas de «Juegos de PC» (ART1025L, contrato §5 de `architecture/artcraft-y-rare.md`).
 * El módulo puro `juegos-pc.ts` tiene su bloque abajo. Los casos del rescate
 * (RTART1025L) de la ficha `rare` del catálogo se conservan al fondo: prueban el
 * contrato vivo del catálogo, que tiene además su propia prueba en
 * `catalogo-herramientas.test.ts`. Ninguna cadena con forma de clave real: se
 * montan en tiempo de ejecución con `join("")`.
 */
import { describe, expect, it } from "vitest";
import { CONDICIONES_EPIC_DECIDIDAS, planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic, esUrlPermitidaRare } from "../juegos-pc";
import type { NeuronaJuegos, ServidorJuegos } from "../juegos-pc";
import { herramientaPorId } from "../../protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "../../protomolecula/catalogo-herramientas";

function rare(): HerramientaProto {
  const ficha = herramientaPorId("rare");
  expect(ficha, "Rare debe estar en el catálogo de la Protomolécula").toBeDefined();
  return ficha as HerramientaProto;
}
const NEURONA: NeuronaJuegos = { sistema: "macos", tienePantalla: true, binarioRare: true, gpu: true, memoriaMB: 16000 };
const NEURONA_SERVIDOR: NeuronaJuegos = { sistema: "linux", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 8000 };
const SERVIDOR = (s: Partial<ServidorJuegos>): ServidorJuegos =>
  ({ id: "a1", propio: false, compartido: false, gpu: false, wineOProton: false, transmision: null, libreDiscoGB: 400, ...s });
const persona = (aceptaCondicionesEpic: boolean) => ({ id: "alex", aceptaCondicionesEpic });
const plan = (neurona: NeuronaJuegos, servidores: ServidorJuegos[] = [], aceptaCondicionesEpic = true) =>
  planificarJuegoPc({ neurona, servidores, persona: persona(aceptaCondicionesEpic) });

describe("planificarJuegoPc · ruta A (neurona propia con pantalla)", () => {
  it("con pantalla y Rare instalado: neurona-propia, con la sesión de Epic de la persona", () => {
    const r = plan(NEURONA);
    expect(r.ruta).toBe("neurona-propia");
    expect(r.pasos).toContain("abre Rare");
    expect(r.pasos.join(" ")).toMatch(/inicia sesión en Epic tú mismo/);
    expect(r.motivo).toMatch(/persona confirma/);
  });
  it("neurona sin GPU: aviso de que no sirve para 3D (y del A1 de Oracle)", () => {
    expect(plan({ ...NEURONA, gpu: false }).avisos.join(" ")).toMatch(/no tiene GPU.*A1 de Oracle.*no sirve para 3D/);
  });
  it("Mac sin pantalla: ninguna, y lo dice el motivo", () => {
    const r = plan({ ...NEURONA, tienePantalla: false });
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toMatch(/pantalla/);
    expect(r.pasos).toEqual([]);
  });
  it("sin el binario de Rare instalado: ninguna", () => {
    expect(plan({ ...NEURONA, binarioRare: false }).motivo).toMatch(/no está instalado/);
  });
  it("sistema sin build de Rare («otro»): ninguna pese a pantalla y binario", () => {
    expect(plan({ ...NEURONA, sistema: "otro" }).motivo).toMatch(/no tiene build de Rare/);
  });
  it("poca memoria en la neurona: ninguna", () => {
    expect(plan({ ...NEURONA, memoriaMB: 1024 }).motivo).toMatch(/memoria/);
  });
});

describe("planificarJuegoPc · ruta B (servidor propio con GPU, Wine o Proton y transmisión)", () => {
  it("servidor propio listo: servidor-propio, con la ventana transmitida y la sesión de la persona", () => {
    const r = plan(NEURONA_SERVIDOR, [SERVIDOR({ id: "folio", propio: true, gpu: true, wineOProton: true, transmision: "selkies" })]);
    expect(r.ruta).toBe("servidor-propio");
    expect(r.motivo).toContain("folio");
    expect(r.motivo).toContain("selkies");
    expect(r.pasos.join(" ")).toMatch(/inicia sesión en Epic tú mismo/);
  });
  it("el servidor elegido con poco disco avisa de cuántos GB quedan", () => {
    const r = plan(NEURONA_SERVIDOR, [SERVIDOR({ id: "g", propio: true, gpu: true, wineOProton: true, transmision: "sunshine", libreDiscoGB: 60 })]);
    expect(r.avisos.join(" ")).toMatch(/60 GB/);
  });
  it("servidor propio sin GPU (el A1): no se elige y el aviso del A1 está", () => {
    const r = plan(NEURONA_SERVIDOR, [SERVIDOR({ id: "a1", propio: true })]);
    expect(r.ruta).toBe("ninguna");
    expect(r.avisos.join(" ")).toMatch(/A1 de Oracle .*no sirve para juegos 3D/);
  });
  it("sin Wine o Proton, o sin transmisión: no se elige", () => {
    expect(plan(NEURONA_SERVIDOR, [SERVIDOR({ id: "x", propio: true, gpu: true, wineOProton: true })]).ruta).toBe("ninguna");
    expect(plan(NEURONA_SERVIDOR, [SERVIDOR({ id: "x", propio: true, gpu: true, transmision: "sunshine" })]).ruta).toBe("ninguna");
  });
  it("el motivo enumera por qué no hay ruta", () => {
    const r = plan(NEURONA_SERVIDOR, [SERVIDOR({ id: "a1", propio: true })]);
    expect(r.motivo).toMatch(/pantalla/);
    expect(r.motivo).toMatch(/no está instalado/);
    expect(r.motivo).toMatch(/junta GPU, Wine o Proton y transmisión/);
  });
});

describe("planificarJuegoPc · ruta C (servidor compartido, esperando la palabra de Alex)", () => {
  const listo = SERVIDOR({ id: "casa", compartido: true, gpu: true, wineOProton: true, transmision: "selkies" });
  it("con la constante en false la ruta C no se ofrece, aunque la persona la acepte", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    const r = plan(NEURONA_SERVIDOR, [listo]);
    expect(r.ruta).toBe("ninguna");
    expect(r.motivo).toMatch(/Alex/);
    expect(r.motivo).toMatch(/cuenta por persona/);
  });
  it("una persona que no aceptó las condiciones tampoco ve la ruta C", () => {
    expect(plan(NEURONA_SERVIDOR, [listo], false).ruta).toBe("ninguna");
  });
});

describe("rutaConfigEpic · carpeta 0700 por persona (§5.3)", () => {
  it("(datos)/juegos/(persona)/legendary, con modo 0700", () => {
    expect(rutaConfigEpic("/datos", "alex")).toEqual({ ruta: "/datos/juegos/alex/legendary", modo: 0o700 });
    expect(rutaConfigEpic("/datos/", "maria-q")).toEqual({ ruta: "/datos/juegos/maria-q/legendary", modo: 0o700 });
  });
  it("una persona con forma rara lanza: solo minúsculas, números y guiones (1 a 64)", () => {
    for (const p of ["", "Pe", "../alex", "a".repeat(65), "alex*q"]) expect(() => rutaConfigEpic("/datos", p)).toThrow();
  });
});

describe("validarSinCredencialesEpic · detecta sesiones de Legendary sin repetir el valor", () => {
  it("un texto limpio no lleva hallazgos", () => {
    expect(validarSinCredencialesEpic("La sesión vive en tu carpeta 0700 y el OS no la lee tú ni yo.")).toEqual({ ok: true, hallazgos: [] });
  });
  it("detecta access_token y refresh_token largos, montados en tiempo de ejecución, sin repetir el valor", () => {
    const token = ["abcdef", "0123", "4567"].join("");
    const r = validarSinCredencialesEpic(`{"access_token": "${token}", "refresh_token": "${["x", "987654321", "z"].join("")}"}`);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toHaveLength(2);
    expect(JSON.stringify(r.hallazgos)).not.toContain(token);
    const juntos = r.hallazgos.join(" ");
    expect(juntos).toMatch(/access_token/);
    expect(juntos).toMatch(/refresh_token/);
  });
  it("un campo con valor de 8 o menos caracteres no se cuenta", () => {
    expect(validarSinCredencialesEpic('{"exchange_code": "abc12", "account_id": "a"}').ok).toBe(true);
  });
  it("detecta tokens con prefijo eg1~ y account_id con valor largo", () => {
    const token = ["eg1", "~", "AAA", "BBB", "12345"].join("");
    const r = validarSinCredencialesEpic(`{"account_id": "${["cafe", "babe", "12345"].join("")}", "t": "${token}"}`);
    expect(r.ok).toBe(false);
    expect(r.hallazgos.join(" ")).toMatch(/account_id/);
    const delToken = r.hallazgos.find((h) => h.includes("eg1~"));
    expect(delToken).toMatch(/token de Epic/);
    expect(delToken).not.toContain("AAA");
  });
});

describe("esUrlPermitidaRare · solo las releases oficiales de RareDevs", () => {
  it("una release del repo oficial vale", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/tag/1.12.0.237")).toBe(true);
  });
  it("las descargas y datos remotos de Rare quedan bloqueados hasta fijar su SHA", () => {
    for (const u of [
      "http://github.com/RareDevs/Rare/releases/tag/1.12.0.237",
      "https://raredevs.github.io/wring/workarounds.json",
      "https://www.protondb.com/app/12345",
      "https://github.com/RareDevs/Rare",
      "https://example.com/Rare-1.12.0.dmg",
    ]) expect(esUrlPermitidaRare(u), u).toBe(false);
  });
});

describe("Rare: «Juegos de PC», lanzamiento confirmado y credenciales de Epic", () => {
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
