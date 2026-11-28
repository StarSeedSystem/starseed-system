import { describe, it, expect, beforeAll } from "vitest";
import {
  TIPO_TARJETA_OFERTA,
  tipoTarjetaOfertaValido,
  accionPrincipalPorTipo,
  crearTarjetaOferta,
  validarTarjetaOferta,
  firmarTarjetaOferta,
  verificarFirmaTarjetaOferta,
  caducada,
  esComercialNoSolicitada,
  marcarComercialNoSolicitada,
  puedeBloquearEmisor,
  __setCrypto,
  type TarjetaOferta,
  type TipoTarjetaOferta,
  type ResultadoValidarTarjetaOferta,
} from "../tarjetas-oferta";

const h = (c: string, n: number) => c.repeat(n);
const clavePublica = h("a", 64);
const clavePrivada = h("b", 64);

beforeAll(() => {
  const hash = (msg: Uint8Array) => {
    let h = 0;
    for (const b of msg) h = (h * 31 + b) >>> 0;
    return h.toString(16).padStart(128, "0");
  };
  __setCrypto(
    (msg: Uint8Array, _priv: string) => hash(msg),
    (msg: Uint8Array, firma: string, pub: string) => firma === hash(msg) && pub === clavePublica,
  );
});

describe("TIPO_TARJETA_OFERTA", () => {
  it("contiene todos los tipos del contrato §13", () => {
    const esperados = [
      "presentacion", "amistad", "evento", "pagina", "grupo", "partido",
      "perfil", "cuenta", "cerebro", "repositorio", "archivo", "app", "programa", "enlace_libre",
    ] as const;
    expect(TIPO_TARJETA_OFERTA).toEqual(esperados);
  });
});

describe("tipoTarjetaOfertaValido", () => {
  it("acepta todos los tipos válidos", () => {
    for (const t of TIPO_TARJETA_OFERTA) {
      expect(tipoTarjetaOfertaValido(t)).toBe(true);
    }
  });
  it("rechaza tipos inválidos", () => {
    expect(tipoTarjetaOfertaValido("invalido")).toBe(false);
    expect(tipoTarjetaOfertaValido("")).toBe(false);
  });
});

describe("accionPrincipalPorTipo", () => {
  it("devuelve la acción principal para cada tipo", () => {
    expect(accionPrincipalPorTipo("presentacion")).toBe("anadir_contacto");
    expect(accionPrincipalPorTipo("amistad")).toBe("anadir_contacto");
    expect(accionPrincipalPorTipo("evento")).toBe("registrar_entrada_evento");
    expect(accionPrincipalPorTipo("pagina")).toBe("abrir_enlace");
    expect(accionPrincipalPorTipo("grupo")).toBe("invitar_grupo");
    expect(accionPrincipalPorTipo("partido")).toBe("invitar_grupo");
    expect(accionPrincipalPorTipo("perfil")).toBe("ver_perfil");
    expect(accionPrincipalPorTipo("cuenta")).toBe("ver_cuenta");
    expect(accionPrincipalPorTipo("cerebro")).toBe("abrir_cerebro");
    expect(accionPrincipalPorTipo("repositorio")).toBe("abrir_repositorio");
    expect(accionPrincipalPorTipo("archivo")).toBe("abrir_archivo");
    expect(accionPrincipalPorTipo("app")).toBe("abrir_app");
    expect(accionPrincipalPorTipo("programa")).toBe("abrir_programa");
    expect(accionPrincipalPorTipo("enlace_libre")).toBe("abrir_enlace");
  });
});

describe("crearTarjetaOferta", () => {
  it("crea una tarjeta válida con campos mínimos", () => {
    const base = {
      tipo: "presentacion" as const,
      emisor: "neurona-1",
      titulo: "Mi presentación",
      contenido: { texto: "Hola, soy Alex" },
      emitidaEn: 1_000_000,
    };
    const r = crearTarjetaOferta(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = r.tarjeta;
      expect(t.version).toBe(1);
      expect(t.tipo).toBe("presentacion");
      expect(t.emisor).toBe("neurona-1");
      expect(t.titulo).toBe("Mi presentación");
      expect(t.contenido).toEqual({ texto: "Hola, soy Alex" });
      expect(t.emitidaEn).toBe(1_000_000);
      expect(t.caducidad).toBeUndefined();
      expect(t.firma).toBeUndefined();
      expect(t.marcaComercial).toBe(false);
    }
  });
  it("incluye caducidad si se proporciona", () => {
    const r = crearTarjetaOferta({
      tipo: "evento",
      emisor: "neurona-2",
      titulo: "Fiesta",
      contenido: { lugar: "Parque", hora: "20:00" },
      emitidaEn: 1_000_000,
      caducidad: 2_000_000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tarjeta.caducidad).toBe(2_000_000);
  });
  it("rechaza tipo inválido", () => {
    const r = crearTarjetaOferta({
      tipo: "invalido" as any,
      emisor: "n1",
      titulo: "X",
      contenido: {},
      emitidaEn: 1,
    });
    expect(r.ok).toBe(false);
  });
  it("rechaza emisor vacío", () => {
    const r = crearTarjetaOferta({
      tipo: "presentacion",
      emisor: "",
      titulo: "X",
      contenido: {},
      emitidaEn: 1,
    });
    expect(r.ok).toBe(false);
  });
  it("rechaza título vacío o muy largo", () => {
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "", contenido: {}, emitidaEn: 1 }).ok).toBe(false);
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "x".repeat(101), contenido: {}, emitidaEn: 1 }).ok).toBe(false);
  });
  it("rechaza contenido no objeto", () => {
    const r = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: "no es objeto" as any, emitidaEn: 1 });
    expect(r.ok).toBe(false);
  });
  it("rechaza emitidaEn no numérico", () => {
    const r = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: "hoy" as any });
    expect(r.ok).toBe(false);
  });
  it("rechaza caducidad en el pasado respecto a emitidaEn", () => {
    const r = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000, caducidad: 500 });
    expect(r.ok).toBe(false);
  });
});

describe("validarTarjetaOferta", () => {
  it("acepta tarjeta bien formada sin firma", () => {
    const t = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const r = validarTarjetaOferta(t.tarjeta);
    expect(r.ok).toBe(true);
  });
  it("acepta tarjeta bien formada con firma válida", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const r = validarTarjetaOferta(firmada, clavePublica);
    expect(r.ok).toBe(true);
  });
  it("rechaza firma inválida", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const mala = { ...firmada, firma: "z".repeat(128) };
    const r = validarTarjetaOferta(mala, clavePublica);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("firma");
  });
  it("rechaza tarjeta caducada", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000, caducidad: 2000 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const r = validarTarjetaOferta(firmada, clavePublica, 3000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("caducada");
  });
});

describe("firmarTarjetaOferta / verificarFirmaTarjetaOferta", () => {
  it("firma y verifica correctamente", () => {
    const base = crearTarjetaOferta({ tipo: "pagina", emisor: "n1", titulo: "Página", contenido: { url: "https://example.com" }, emitidaEn: 1 });
    if (!base.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(base.tarjeta, clavePrivada);
    expect(firmada.firma).toBeDefined();
    expect(firmada.firma?.length).toBe(128);
    const ok = verificarFirmaTarjetaOferta(firmada, clavePublica);
    expect(ok).toBe(true);
  });
  it("la firma cambia si cambia cualquier campo", () => {
    const base = crearTarjetaOferta({ tipo: "pagina", emisor: "n1", titulo: "Página", contenido: { url: "https://example.com" }, emitidaEn: 1 });
    if (!base.ok) throw new Error("setup");
    const f1 = firmarTarjetaOferta(base.tarjeta, clavePrivada);
    const f2 = firmarTarjetaOferta({ ...base.tarjeta, titulo: "Otra" }, clavePrivada);
    expect(f1.firma).not.toBe(f2.firma);
  });
  it("verificar falla con clave pública distinta", () => {
    const base = crearTarjetaOferta({ tipo: "pagina", emisor: "n1", titulo: "Página", contenido: { url: "https://example.com" }, emitidaEn: 1 });
    if (!base.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(base.tarjeta, clavePrivada);
    const otraClave = h("c", 64);
    expect(verificarFirmaTarjetaOferta(firmada, otraClave)).toBe(false);
  });
});

describe("caducada", () => {
  it("detecta tarjeta caducada por caducidad explícita", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000, caducidad: 2000 });
    if (!t.ok) throw new Error("setup");
    expect(caducada(t.tarjeta, 1500)).toBe(false);
    expect(caducada(t.tarjeta, 2500)).toBe(true);
  });
  it("tarjeta sin caducidad nunca está caducada por tiempo", () => {
    const t = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000 });
    if (!t.ok) throw new Error("setup");
    expect(caducada(t.tarjeta, 999_999_999)).toBe(false);
  });
});

describe("marcarComercialNoSolicitada / esComercialNoSolicitada", () => {
  it("marca una tarjeta como comercial no solicitada", () => {
    const t = crearTarjetaOferta({ tipo: "app", emisor: "n1", titulo: "Compra esto", contenido: { url: "https://shop.com" }, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const marcada = marcarComercialNoSolicitada(t.tarjeta);
    expect(marcada.marcaComercial).toBe(true);
    expect(esComercialNoSolicitada(marcada)).toBe(true);
  });
  it("no muta la original", () => {
    const t = crearTarjetaOferta({ tipo: "app", emisor: "n1", titulo: "Compra esto", contenido: { url: "https://shop.com" }, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const original = t.tarjeta;
    marcarComercialNoSolicitada(original);
    expect(original.marcaComercial).toBe(false);
  });
});

describe("puedeBloquearEmisor", () => {
  it("permite bloquear emisor de tarjeta comercial no solicitada", () => {
    const t = crearTarjetaOferta({ tipo: "app", emisor: "spammer", titulo: "Compra", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const marcada = marcarComercialNoSolicitada(t.tarjeta);
    expect(puedeBloquearEmisor(marcada)).toBe(true);
  });
  it("no permite bloquear emisor de tarjeta normal", () => {
    const t = crearTarjetaOferta({ tipo: "presentacion", emisor: "amigo", titulo: "Hola", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    expect(puedeBloquearEmisor(t.tarjeta)).toBe(false);
  });
});