import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AppearanceProvider } from "@/context/appearance-context";
import {
  TarjetaOferta,
  NOMBRE_TIPO_TARJETA,
  etiquetaTipoTarjeta,
  etiquetaAccionTarjeta,
  estadoTarjeta,
  textoVigencia,
  textoFirma,
} from "../tarjeta-oferta";
import {
  TIPO_TARJETA_OFERTA,
  crearTarjetaOferta,
  marcarComercialNoSolicitada,
  type TarjetaOferta as DatosTarjeta,
} from "@/lib/nfc/tarjetas-oferta";

const tarjetaBase = (extra: Partial<DatosTarjeta> = {}): DatosTarjeta => {
  const r = crearTarjetaOferta({
    tipo: "presentacion",
    emisor: "neurona-luna",
    titulo: "Hola, soy Luna",
    contenido: { texto: "Encantada" },
    emitidaEn: 1_000,
    caducidad: 5_000,
  });
  if (!r.ok) throw new Error("tarjeta de prueba inválida");
  return { ...r.tarjeta, ...extra };
};

const pintar = (tarjeta: DatosTarjeta, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(AppearanceProvider, null, createElement(TarjetaOferta, { tarjeta, ...props })),
  );

describe("NFC1126O · etiquetas de tarjeta", () => {
  it("nombra los catorce tipos del contrato", () => {
    for (const tipo of TIPO_TARJETA_OFERTA) {
      expect(NOMBRE_TIPO_TARJETA[tipo].length).toBeGreaterThan(0);
      expect(etiquetaTipoTarjeta(tipo)).toBe(NOMBRE_TIPO_TARJETA[tipo]);
    }
    expect(Object.keys(NOMBRE_TIPO_TARJETA)).toHaveLength(TIPO_TARJETA_OFERTA.length);
  });

  it("traduce la acción principal según el tipo", () => {
    expect(etiquetaAccionTarjeta("presentacion")).toBe("Guardar en contactos");
    expect(etiquetaAccionTarjeta("amistad")).toBe("Guardar en contactos");
    expect(etiquetaAccionTarjeta("pagina")).toBe("Abrir enlace");
    expect(etiquetaAccionTarjeta("evento")).toBe("Registrar entrada");
    expect(etiquetaAccionTarjeta("grupo")).toBe("Unirse al grupo");
  });
});

describe("NFC1126O · estado de la tarjeta", () => {
  it("marca caducidad, comercio y bloqueo", () => {
    const vigente = tarjetaBase();
    expect(estadoTarjeta(vigente, 2_000)).toEqual({ caducada: false, comercial: false, bloqueable: false });
    expect(estadoTarjeta(vigente, 9_000)).toEqual({ caducada: true, comercial: false, bloqueable: false });
    const comercial = marcarComercialNoSolicitada(vigente);
    expect(estadoTarjeta(comercial, 2_000)).toEqual({ caducada: false, comercial: true, bloqueable: true });
  });

  it("describe la vigencia sin depender del reloj de pared", () => {
    expect(textoVigencia(tarjetaBase({ caducidad: undefined }), 2_000)).toBe("Sin caducidad");
    expect(textoVigencia(tarjetaBase(), 2_000)).toBe("Vigente hasta el 1970-01-01");
    expect(textoVigencia(tarjetaBase(), 9_000)).toBe("Caducada");
  });

  it("describe la firma del emisor", () => {
    expect(textoFirma(tarjetaBase())).toBe("Sin firma");
    expect(textoFirma(tarjetaBase({ firma: "a".repeat(128) }))).toBe("Firmada por el emisor");
    expect(textoFirma(tarjetaBase({ firma: "a".repeat(128) }), true)).toBe("Firma verificada");
    expect(textoFirma(tarjetaBase({ firma: "a".repeat(128) }), false)).toBe("Firma no verificada");
  });
});

describe("NFC1126O · tarjeta recibida en notificaciones", () => {
  it("pinta título, emisor, tipo y acción principal", () => {
    const html = pintar(tarjetaBase(), { ahora: 2_000 });
    expect(html).toContain('data-testid="tarjeta-oferta"');
    expect(html).toContain("Hola, soy Luna");
    expect(html).toContain("neurona-luna");
    expect(html).toContain("Presentación o amistad");
    expect(html).toContain("Guardar en contactos");
    expect(html).toContain('data-testid="tarjeta-oferta-accion"');
    expect(html).not.toContain('data-testid="tarjeta-oferta-bloquear"');
  });

  it("una tarjeta caducada avisa y no ofrece la acción", () => {
    const html = pintar(tarjetaBase(), { ahora: 9_000 });
    expect(html).toContain("Caducada");
    expect(html).toContain('disabled=""');
  });

  it("marca lo comercial no pedido y deja bloquear al emisor", () => {
    const comercial = marcarComercialNoSolicitada(tarjetaBase());
    const html = pintar(comercial, { ahora: 2_000 });
    expect(html).toContain('data-testid="tarjeta-oferta-marca-comercial"');
    expect(html).toContain("No solicitada");
    expect(html).toContain('data-testid="tarjeta-oferta-bloquear"');
    expect(html).toContain("Bloquear emisor");
  });

  it("muestra el estado de la firma y permite cerrar", () => {
    const html = pintar(tarjetaBase({ firma: "a".repeat(128) }), {
      ahora: 2_000,
      firmaVerificada: true,
      onCerrar: () => undefined,
    });
    expect(html).toContain("Firma verificada");
    expect(html).toContain('aria-label="Cerrar tarjeta"');
  });
});
