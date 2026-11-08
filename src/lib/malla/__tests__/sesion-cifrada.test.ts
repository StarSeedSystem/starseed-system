/**
 * sesion-cifrada (CIF1108A): acuerdo ECDH efímero, claves por sentido, contador y repetición, renovación
 * (15 min · 500 tramas · bytes), alteración, sesión desconocida, empate de aperturas, límites de trama y
 * un banco de rendimiento. Contrato: architecture/datos-por-la-malla.md §6.
 */
import { describe, expect, it } from "vitest";
import {
  GRACIA_PREVIA_MS,
  RENOVAR_BYTES,
  RENOVAR_MS,
  RENOVAR_TRAMAS,
  VENTANA_REPETICION,
  VERSION_CIFRADO,
  crearSesionesCifradas,
  decidirModo,
  esTextoSiempreEnClaro,
  etiquetaCifrado,
  leerAcuerdo,
  limitesParaCifrado,
  type SesionesCifradas,
} from "@/lib/malla/sesion-cifrada";
import { maxTextoPorTrama, trozoArchivoParaTrama, MARGEN_TRAMA } from "@/lib/malla/red-local-nativa";

function par() {
  const reloj = { t: 1_000_000 };
  const mk = () => crearSesionesCifradas({ ahora: () => reloj.t, firmar: async (c) => c });
  return { reloj, A: mk(), B: mk() };
}

/** Acuerdo completo: A abre, B contesta. */
async function acordar(A: SesionesCifradas, B: SesionesCifradas) {
  const ini = await A.iniciar("NA", "NB");
  expect(ini).toBeTruthy();
  const r = await B.recibirAcuerdo("NB", "NA", ini);
  expect(r.ok).toBe(true);
  if (!r.ok || !r.respuesta) throw new Error("sin respuesta");
  const f = await A.recibirAcuerdo("NA", "NB", r.respuesta);
  expect(f).toMatchObject({ ok: true, activa: true });
}

describe("acuerdo de sesión", () => {
  it("las dos neuronas llegan a la misma sesión y hablan en los dos sentidos", async () => {
    const { A, B } = par();
    expect(A.estado("NB")).toBe("sin");
    await acordar(A, B);
    expect(A.estado("NB")).toBe("activa");
    expect(B.estado("NA")).toBe("activa");
    const ida = await A.cifrar("NB", '{"t":"tu.msg","x":"hola"}');
    expect(ida.ok).toBe(true);
    if (!ida.ok) return;
    expect(ida.texto).not.toContain("hola");
    expect(ida.texto.startsWith('{"t":"nl.cif"')).toBe(true);
    expect(await B.descifrar("NA", ida.texto)).toEqual({ ok: true, texto: '{"t":"tu.msg","x":"hola"}' });
    const vuelta = await B.cifrar("NA", "ñandú 🦤 € texto UTF-8");
    expect(vuelta.ok).toBe(true);
    if (!vuelta.ok) return;
    expect(await A.descifrar("NB", vuelta.texto)).toEqual({ ok: true, texto: "ñandú 🦤 € texto UTF-8" });
  });

  it("cada sentido usa su clave: una trama de A no se descifra como si viniera de B", async () => {
    const { A, B } = par();
    await acordar(A, B);
    const c = await A.cifrar("NB", "secreto");
    if (!c.ok) throw new Error("no cifró");
    // Reflejada hacia A misma (ataque de reflexión): la etiqueta no cuadra.
    const r = await A.descifrar("NB", c.texto);
    expect(r.ok).toBe(false);
  });

  it("dos acuerdos distintos dan sesiones y claves distintas (secreto hacia adelante)", async () => {
    const x = par();
    const y = par();
    await acordar(x.A, x.B);
    await acordar(y.A, y.B);
    const c = await x.A.cifrar("NB", "mismo texto");
    if (!c.ok) throw new Error("no cifró");
    expect((await y.B.descifrar("NA", c.texto)).ok).toBe(false);
    expect(x.A.info("NB")?.sesion).not.toBe(y.A.info("NB")?.sesion);
  });

  it("rechaza un acuerdo que no es entre estas dos neuronas o está mal formado", async () => {
    const { A, B } = par();
    const ini = (await A.iniciar("NA", "NB")) as Record<string, unknown>;
    expect((await B.recibirAcuerdo("NB", "NX", ini)).ok).toBe(false); // viene de «NA», no de «NX»
    expect((await B.recibirAcuerdo("OTRA", "NA", ini)).ok).toBe(false); // no es para «OTRA»
    expect((await B.recibirAcuerdo("NB", "NA", { ...ini, ef: "AAAA" })).ok).toBe(false);
    expect(leerAcuerdo({ ...ini, k: "x" })).toBeNull();
  });

  it("una clave efímera que no es un punto P-256 válido no abre sesión", async () => {
    const { A, B } = par();
    const ini = (await A.iniciar("NA", "NB")) as Record<string, unknown>;
    const falsa = btoa(String.fromCharCode(4, ...new Array(64).fill(7)));
    const r = await B.recibirAcuerdo("NB", "NA", { ...ini, ef: falsa });
    expect(r.ok).toBe(false);
    expect(B.estado("NA")).toBe("sin");
  });

  it("si las dos abren a la vez gana la de id menor y la otra contesta", async () => {
    const { A, B } = par();
    const iniA = await A.iniciar("NA", "NB"); // NA < NB
    const iniB = await B.iniciar("NB", "NA");
    // A (la menor) ignora la apertura de B…
    const rA = await A.recibirAcuerdo("NA", "NB", iniB);
    expect(rA).toMatchObject({ ok: true, respuesta: null });
    // …y B (la mayor) contesta a la de A.
    const rB = await B.recibirAcuerdo("NB", "NA", iniA);
    if (!rB.ok || !rB.respuesta) throw new Error("B debía contestar");
    expect(await A.recibirAcuerdo("NA", "NB", rB.respuesta)).toMatchObject({ ok: true, activa: true });
    const c = await A.cifrar("NB", "tras el empate");
    if (!c.ok) throw new Error("no cifró");
    expect(await B.descifrar("NA", c.texto)).toEqual({ ok: true, texto: "tras el empate" });
  });

  it("no abre un segundo acuerdo mientras hay uno en marcha", async () => {
    const { A } = par();
    expect(await A.iniciar("NA", "NB")).toBeTruthy();
    expect(await A.iniciar("NA", "NB")).toBeNull();
    expect(A.estado("NB")).toBe("pendiente");
  });

  it("sin sesión no se cifra", async () => {
    const { A } = par();
    expect(await A.cifrar("NB", "x")).toEqual({ ok: false, motivo: "sin-sesion" });
  });
});

describe("contador y repetición", () => {
  it("el contador crece, una trama repetida se rechaza y el desorden dentro de la ventana vale", async () => {
    const { A, B } = par();
    await acordar(A, B);
    const t: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await A.cifrar("NB", `m${i}`);
      if (!c.ok) throw new Error("no cifró");
      t.push(c.texto);
    }
    expect(t.map((x) => JSON.parse(x).n)).toEqual([0, 1, 2, 3, 4]);
    expect((await B.descifrar("NA", t[2])).ok).toBe(true);
    expect((await B.descifrar("NA", t[0])).ok).toBe(true); // llegó tarde, pero está en la ventana
    const rep = await B.descifrar("NA", t[2]);
    expect(rep).toMatchObject({ ok: false, motivo: "invalida" });
    expect((await B.descifrar("NA", t[4])).ok).toBe(true);
  });

  it("una trama más vieja que la ventana se rechaza", async () => {
    const { A, B } = par();
    await acordar(A, B);
    const primera = await A.cifrar("NB", "vieja");
    if (!primera.ok) throw new Error("no cifró");
    for (let i = 0; i < VENTANA_REPETICION + 2; i++) {
      const c = await A.cifrar("NB", "relleno");
      if (!c.ok) throw new Error("no cifró");
      if (i === VENTANA_REPETICION + 1) expect((await B.descifrar("NA", c.texto)).ok).toBe(true);
    }
    expect(await B.descifrar("NA", primera.texto)).toMatchObject({ ok: false, motivo: "invalida" });
  });

  it("alterar un bit del cifrado, el contador o la sesión → rechazo; una trama falsa no gasta el contador", async () => {
    const { A, B } = par();
    await acordar(A, B);
    const c = await A.cifrar("NB", "intacto");
    if (!c.ok) throw new Error("no cifró");
    const o = JSON.parse(c.texto) as { t: string; s: string; n: number; c: string };
    const bytes = Uint8Array.from(atob(o.c), (ch) => ch.charCodeAt(0));
    bytes[3] ^= 1;
    const alterada = { ...o, c: btoa(String.fromCharCode(...bytes)) };
    expect(await B.descifrar("NA", JSON.stringify(alterada))).toMatchObject({ ok: false, motivo: "invalida" });
    expect(await B.descifrar("NA", JSON.stringify({ ...o, n: o.n + 1 }))).toMatchObject({ ok: false, motivo: "invalida" });
    expect(await B.descifrar("NA", JSON.stringify({ ...o, s: "OTRASESION1=" }))).toMatchObject({ ok: false, motivo: "desconocida" });
    // La buena sigue valiendo: las falsas no anotaron su contador.
    expect(await B.descifrar("NA", c.texto)).toEqual({ ok: true, texto: "intacto" });
    expect(await B.descifrar("NA", "no es json")).toMatchObject({ ok: false, motivo: "invalida" });
    expect(await B.descifrar("NA", JSON.stringify({ t: "nl.cif", s: o.s, n: -1, c: o.c }))).toMatchObject({ ok: false, motivo: "invalida" });
  });
});

describe("renovación (15 min · 500 tramas · bytes)", () => {
  it("a las 500 tramas pide renovar; la nueva sesión sustituye y la vieja vale 60 s para lo que iba en vuelo", async () => {
    const { reloj, A, B } = par();
    await acordar(A, B);
    let ultima = "";
    let pidio = false;
    for (let i = 0; i < RENOVAR_TRAMAS; i++) {
      const c = await A.cifrar("NB", "x");
      if (!c.ok) throw new Error("no cifró");
      ultima = c.texto;
      pidio = c.renovar;
    }
    expect(pidio).toBe(true);
    expect(A.tocaRenovar("NB")).toBe(true);
    const vieja = A.info("NB")?.sesion;
    await acordar(A, B);
    expect(A.info("NB")?.sesion).not.toBe(vieja);
    expect(A.tocaRenovar("NB")).toBe(false);
    // Lo que iba en vuelo con la sesión vieja todavía se lee…
    expect((await B.descifrar("NA", ultima)).ok).toBe(true);
    // …pero pasada la gracia, no.
    const otra = await (async () => {
      const x = par();
      await acordar(x.A, x.B);
      const c = await x.A.cifrar("NB", "en vuelo");
      if (!c.ok) throw new Error("no cifró");
      await acordar(x.A, x.B);
      x.reloj.t += GRACIA_PREVIA_MS + 1;
      return x.B.descifrar("NA", c.texto);
    })();
    expect(otra).toMatchObject({ ok: false, motivo: "desconocida" });
    void reloj;
  });

  it("a los 15 minutos toca renovar", async () => {
    const { reloj, A, B } = par();
    await acordar(A, B);
    expect(A.tocaRenovar("NB")).toBe(false);
    reloj.t += RENOVAR_MS;
    expect(A.tocaRenovar("NB")).toBe(true);
    const c = await A.cifrar("NB", "todavía vale");
    expect(c.ok && c.renovar).toBe(true);
  });

  it("a los 32 MiB cifrados (flujo de archivos) toca renovar, y al doble del límite ya no se cifra", async () => {
    const { A, B } = par();
    await acordar(A, B);
    const trozo = "a".repeat(1024 * 1024);
    let renovar = false;
    for (let i = 0; i < 32; i++) {
      const c = await A.cifrar("NB", trozo);
      if (!c.ok) throw new Error("no cifró");
      renovar = c.renovar;
    }
    expect(RENOVAR_BYTES).toBe(32 * 1024 * 1024);
    expect(renovar).toBe(true);
    for (let i = 0; i < 32; i++) await A.cifrar("NB", trozo);
    expect(await A.cifrar("NB", "más")).toEqual({ ok: false, motivo: "limite" });
    await acordar(A, B);
    expect((await A.cifrar("NB", "otra vez")).ok).toBe(true);
  });
});

describe("tamaños, modos y compatibilidad", () => {
  it("la trama cifrada de un texto del máximo cabe en el tope del otro lado", async () => {
    const { A } = par();
    const { B } = par();
    await acordar(A, B);
    for (const maxCuerpo of [64 * 1024, 16 * 1024, 88 * 1024]) {
      const lim = { maxCuerpo, porVentana: 300, ventanaMs: 10_000 };
      const claro = maxTextoPorTrama(limitesParaCifrado(lim));
      const c = await A.cifrar("NB", "a".repeat(claro));
      if (!c.ok) throw new Error("no cifró");
      expect(c.texto.length).toBeLessThanOrEqual(maxCuerpo - MARGEN_TRAMA + 0);
    }
    // El trozo de archivo con cifrado cabe SOLO en una trama cifrada.
    const lim = { maxCuerpo: 64 * 1024, porVentana: 300, ventanaMs: 10_000 };
    const trozo = trozoArchivoParaTrama(limitesParaCifrado(lim));
    const b64 = btoa("x".repeat(trozo));
    const chunk = `{"t":"archivo.chunk","id":"${"f".repeat(36)}","index":12345,"datosB64":"${b64}"}`;
    const c = await A.cifrar("NB", chunk);
    if (!c.ok) throw new Error("no cifró");
    expect(c.texto.length).toBeLessThanOrEqual(64 * 1024 - MARGEN_TRAMA);
  });

  it("modo: ambos cifran → cifrado; app anterior → en claro (sin cifrar); con «exigir» → bloqueado", () => {
    expect(decidirModo({ propio: true, cifPar: VERSION_CIFRADO, exigir: false })).toBe("cifrado");
    expect(decidirModo({ propio: true, cifPar: VERSION_CIFRADO, exigir: true })).toBe("cifrado");
    expect(decidirModo({ propio: true, cifPar: undefined, exigir: false })).toBe("claro");
    expect(decidirModo({ propio: true, cifPar: undefined, exigir: true })).toBe("bloqueado");
    expect(decidirModo({ propio: false, cifPar: VERSION_CIFRADO, exigir: false })).toBe("claro");
    expect(etiquetaCifrado("cifrado", "activa")).toBe("cifrado");
    expect(etiquetaCifrado("cifrado", "sin")).toBe("pendiente");
    expect(etiquetaCifrado("claro", "sin")).toBe("sin-cifrar");
    expect(etiquetaCifrado("bloqueado", "sin")).toBe("sin-cifrar");
  });

  it("solo el saludo y el acuerdo van siempre en claro", () => {
    expect(esTextoSiempreEnClaro('{"t":"nl.hola","v":1}')).toBe(true);
    expect(esTextoSiempreEnClaro('{"t":"nl.cs","s":{}}')).toBe(true);
    expect(esTextoSiempreEnClaro('{"t":"nl.sen","s":{}}')).toBe(false);
    expect(esTextoSiempreEnClaro('{"t":"tu.msg"}')).toBe(false);
    expect(esTextoSiempreEnClaro('{"t":"archivo.chunk"}')).toBe(false);
  });
});

describe("rendimiento", () => {
  it("cifrar+descifrar trozos de archivo de 34 KiB queda muy por encima de los ~550 KB/s del canal", async () => {
    const { A, B } = par();
    await acordar(A, B);
    const lim = limitesParaCifrado({ maxCuerpo: 64 * 1024, porVentana: 300, ventanaMs: 10_000 });
    const trozo = trozoArchivoParaTrama(lim);
    const texto = `{"t":"archivo.chunk","datosB64":"${btoa("z".repeat(trozo))}"}`;
    const N = 60;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const c = await A.cifrar("NB", texto);
      if (!c.ok) throw new Error("no cifró");
      const d = await B.descifrar("NA", c.texto);
      if (!d.ok) throw new Error("no descifró");
    }
    const ms = performance.now() - t0;
    const kbs = (N * trozo) / 1024 / (ms / 1000);
    const msPorTrama = ms / N;
    // eslint-disable-next-line no-console
    console.log(`[CIF1108A] trozo ${(trozo / 1024).toFixed(0)} KiB: ${msPorTrama.toFixed(2)} ms por trama (cifrar+descifrar), ${kbs.toFixed(0)} KB/s de carga útil`);
    expect(kbs).toBeGreaterThan(5_000); // ≥ 10× lo que mueve hoy el canal TCP
    expect(msPorTrama).toBeLessThan(50);
  });
});
