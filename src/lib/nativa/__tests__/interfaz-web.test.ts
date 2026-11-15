import { describe, expect, it } from "vitest";
import { decidirCambioBuild } from "@/lib/pwa/decision-build";
import { interpretarEstadoServidor, type EstadoServidorLocal } from "../estado-servidor-local";
import { etiquetaWeb, hace, vistaInterfazWeb } from "../interfaz-web";
import { lineasPorEnviar } from "../relevo-capa-cliente";
import { decidirRelevoNativo } from "../relevo-capa";

const local = (o: Partial<EstadoServidorLocal> = {}): EstadoServidorLocal => ({ fase: "local", web_corre: "aaaa1111/fe1de48459", web_publicada: "bbbb2222/312ea42d1f", relevo: "sin-capa", ...o });

describe("AND1114L · bloque «Interfaz web»", () => {
  it("sin app no hay vista y 'otro-sistema' tampoco", () => {
    expect(vistaInterfazWeb(null)).toBeNull();
    expect(vistaInterfazWeb({ fase: "otro-sistema" })).toBeNull();
  });
  it("al día cuando corre lo publicado (mismo sha aunque cambie la compilación)", () => {
    const v = vistaInterfazWeb(local({ web_publicada: "zzzz9999/fe1de48459", relevo: "al-dia" }))!;
    expect(v.estado).toBe("al-dia");
    expect(v.corre).toBe("aaaa1111 · fe1de484");
  });
  it("bajando: buscando, descargando y verificando", () => {
    for (const f of ["buscando", "descargando", "verificando"]) expect(vistaInterfazWeb(local({ capas_fase: f }))!.estado).toBe("bajando");
  });
  it("lista: dice cuándo se aplica según la llamada o el texto sin enviar", () => {
    const e = local({ capa_nueva: "AbC", web_nueva: "cccc3333/312ea42d1f", capas_fase: "lista", relevo: "capa-lista" });
    expect(vistaInterfazWeb(e, { enLlamada: true, escribiendo: false })!.titulo).toContain("al terminar la llamada");
    expect(vistaInterfazWeb(e, { enLlamada: false, escribiendo: true })!.titulo).toContain("texto sin enviar");
    expect(vistaInterfazWeb(e)!.estado).toBe("lista");
  });
  it("error con el motivo, sin inventar nada", () => {
    const v = vistaInterfazWeb(local({ capas_fase: "error", capas_aviso: "No se pudo traer la capa nueva del servidor: sin red" }))!;
    expect(v.estado).toBe("error");
    expect(v.motivo).toContain("sin red");
  });
  it("publicada sin capa en el canal, y sin dato si no se leyó la publicada", () => {
    expect(vistaInterfazWeb(local())!.estado).toBe("sin-capa");
    const v = vistaInterfazWeb(local({ web_publicada: null, relevo: "sin-datos" }))!;
    expect(v.estado).toBe("sin-dato");
    expect(v.publicada).toBeNull();
  });
  it("sin servidor local propio lo dice", () => {
    expect(vistaInterfazWeb({ fase: "web-publicada" })!.estado).toBe("sin-sirve-local");
  });
  it("etiquetas y 'hace cuánto'", () => {
    expect(etiquetaWeb("desconocida")).toBeNull();
    expect(etiquetaWeb("?/abcdef1234")).toBe("abcdef12");
    expect(hace(null, 1000)).toBeNull();
    expect(hace(0, 1000)).toBeNull();
    expect(hace(1_000_000, 1_000_000 + 5 * 60_000)).toBe("hace 5 min");
  });
});

describe("AND1114L · la decisión trata a Android como escritorio cuando la app releva", () => {
  const base = { corriendo: "a", publicada: "b", enLlamada: false, escribiendo: false, enLinea: true, recargasEstaSesion: 0, topeRecargas: 2, origenLocal: true };
  it("copia local sin relevo nativo → local-sin-relevo; con relevo nativo → relevo-nativo (no se recarga)", () => {
    expect(decidirCambioBuild(base)).toBe("local-sin-relevo");
    expect(decidirCambioBuild({ ...base, relevoNativo: true })).toBe("relevo-nativo");
  });
  it("en la web publicada nada cambia", () => {
    expect(decidirCambioBuild({ ...base, origenLocal: false, relevoNativo: true })).toBe("aplicar");
    expect(decidirCambioBuild({ ...base, origenLocal: false, enLlamada: true })).toBe("esperar-llamada");
  });
});

describe("AND1114L · estado y líneas [capas] hacia el Mac", () => {
  it("interpreta los campos nuevos y descarta líneas mal formadas", () => {
    const e = interpretarEstadoServidor({ fase: "local", ultima_mirada_ms: 123, plataforma: "android", capas_lineas: [{ n: 1, t: 5, texto: "sirve web=a/b" }, { n: "x" }, null] })!;
    expect(e.ultima_mirada_ms).toBe(123);
    expect(e.plataforma).toBe("android");
    expect(e.capas_lineas).toEqual([{ n: 1, t: 5, texto: "sirve web=a/b" }]);
    expect(interpretarEstadoServidor({ fase: "local" })!.capas_lineas).toEqual([]);
  });
  it("solo se mandan las líneas que no se mandaron (la clave lleva la hora: el número se reinicia con cada proceso)", () => {
    const ya = new Set(["5:1"]);
    const out = lineasPorEnviar([{ n: 1, t: 5, texto: "a" }, { n: 2, t: 6, texto: "b" }, { n: 1, t: 900, texto: "c (proceso nuevo)" }], ya);
    expect(out.map((x) => x.texto)).toEqual(["b", "c (proceso nuevo)"]);
  });
});

describe("AND1114L · el relevo de capa en una tablet (estado de Android) sigue la regla de escritorio", () => {
  const android = (o: Partial<EstadoServidorLocal> = {}): EstadoServidorLocal => ({ fase: "local", plataforma: "android", capa_nueva: "AbCd", web_corre: "aaaa1111/fe1de48459", web_nueva: "cccc3333/312ea42d1f", relevo: "capa-lista", ...o });
  const ctx = { enLlamada: false, escribiendo: false, enLinea: true, yaPedidas: new Set<string>() };
  it("capa lista y momento seguro: aplica", () => {
    expect(decidirRelevoNativo(android(), ctx).accion).toBe("aplicar");
  });
  it("llamada en curso o texto sin enviar: espera; sin red: espera", () => {
    expect(decidirRelevoNativo(android(), { ...ctx, enLlamada: true }).accion).toBe("esperar");
    expect(decidirRelevoNativo(android(), { ...ctx, escribiendo: true }).accion).toBe("esperar");
    expect(decidirRelevoNativo(android(), { ...ctx, enLinea: false }).accion).toBe("esperar");
  });
  it("sin capa lista no hace nada, y una capa ya pedida no se pide dos veces (sin bucles si la app no se reabre)", () => {
    expect(decidirRelevoNativo(android({ capa_nueva: null }), ctx).accion).toBe("nada");
    expect(decidirRelevoNativo(android(), { ...ctx, yaPedidas: new Set(["AbCd"]) }).accion).toBe("nada");
  });
});
