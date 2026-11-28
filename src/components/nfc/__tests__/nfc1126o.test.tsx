import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NOMBRE_TIPO_TARJETA,
  etiquetaAccionPrincipal,
  enlaceDeTarjeta,
  resumenTarjetaOferta,
  notificacionDeTarjetaOferta,
  TarjetaOfertaDisplay,
} from "../tarjeta-oferta";
import type { TarjetaOferta } from "@/lib/nfc/tarjetas-oferta";

const h = (c: string, n: number) => c.repeat(n);

function tarjeta(over: Partial<TarjetaOferta> = {}): TarjetaOferta {
  return {
    version: 1,
    tipo: "presentacion",
    emisor: "nodo-luna",
    titulo: "Hola",
    contenido: { descripcion: "Nos conocimos en el café" },
    emitidaEn: 1_000,
    firma: h("a", 128),
    ...over,
  };
}

describe("NFC1126O · resumen de la tarjeta", () => {
  it("deriva la acción principal y su etiqueta humana", () => {
    const r = resumenTarjetaOferta(tarjeta(), 2_000);
    expect(r.accion).toBe("anadir_contacto");
    expect(r.etiquetaAccion).toBe("Añadir a contactos");
    expect(r.firmada).toBe(true);
    expect(r.caducada).toBe(false);
    expect(r.comercial).toBe(false);
    expect(r.puedeBloquear).toBe(false);
  });

  it("marca caducada y comercial no solicitada", () => {
    const r = resumenTarjetaOferta(tarjeta({ caducidad: 1_500, marcaComercial: true }), 2_000);
    expect(r.caducada).toBe(true);
    expect(r.comercial).toBe(true);
    expect(r.puedeBloquear).toBe(true);
    expect(r.caducidadTexto).toBeTruthy();
  });

  it("sin firma lo dice", () => {
    expect(resumenTarjetaOferta({ ...tarjeta(), firma: undefined }, 2_000).firmada).toBe(false);
  });
});

describe("NFC1126O · etiquetas y enlace", () => {
  it("nombra los 14 tipos del contrato §13", () => {
    expect(Object.keys(NOMBRE_TIPO_TARJETA)).toHaveLength(14);
    expect(NOMBRE_TIPO_TARJETA.enlace_libre).toBe("Enlace libre");
  });

  it("cae a «Abrir» con una acción desconocida", () => {
    expect(etiquetaAccionPrincipal("desconocida")).toBe("Abrir");
  });

  it("lee la url del contenido libre", () => {
    expect(enlaceDeTarjeta(tarjeta({ contenido: { url: "https://example.com" } }))).toBe("https://example.com");
    expect(enlaceDeTarjeta(tarjeta({ contenido: { url: "  " } }))).toBeUndefined();
  });
});

describe("NFC1126O · notificación de recepción", () => {
  it("lleva la acción principal y el enlace", () => {
    const n = notificacionDeTarjetaOferta(tarjeta({ contenido: { url: "https://example.com" } }), 2_000);
    expect(n).not.toBeNull();
    expect(n?.accion).toBe("anadir_contacto");
    expect(n?.titulo).toContain("nodo-luna");
    expect(n?.href).toBe("https://example.com");
  });

  it("avisa del bloqueo si es comercial", () => {
    expect(notificacionDeTarjetaOferta(tarjeta({ marcaComercial: true }), 2_000)?.cuerpo).toContain("bloquear");
  });

  it("no notifica una tarjeta caducada", () => {
    expect(notificacionDeTarjetaOferta(tarjeta({ caducidad: 1_500 }), 2_000)).toBeNull();
  });
});

describe("NFC1126O · vista de la tarjeta", () => {
  const pintar = (t: TarjetaOferta) =>
    renderToStaticMarkup(createElement(TarjetaOfertaDisplay, { tarjeta: t, ahora: 2_000 }));

  it("muestra título, emisor, firma y acción", () => {
    const html = pintar(tarjeta());
    expect(html).toContain("Hola");
    expect(html).toContain("nodo-luna");
    expect(html).toContain("Firmada por el emisor");
    expect(html).toContain("Añadir a contactos");
    expect(html).toContain('data-testid="tarjeta-oferta-accion"');
    expect(html).not.toContain("Publicidad no pedida");
  });

  it("una comercial enseña el aviso y el botón de bloquear", () => {
    const html = pintar(tarjeta({ marcaComercial: true }));
    expect(html).toContain("Publicidad no pedida");
    expect(html).toContain('data-testid="tarjeta-oferta-bloquear"');
  });

  it("una caducada desactiva la acción", () => {
    const html = pintar(tarjeta({ caducidad: 1_500 }));
    expect(html).toContain("Caducada");
    expect(html).toMatch(/data-testid="tarjeta-oferta-accion"[^>]*disabled/);
  });
});
