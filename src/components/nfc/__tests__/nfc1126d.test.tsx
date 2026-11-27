import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { HojaCerca } from "../hoja-cerca";
import { decidir } from "@/lib/nfc/decidir";
import { establecerRelacion, ignorar, preferenciasPorDefecto } from "@/lib/nfc/preferencias";
import type { TarjetaNeurona } from "@/lib/nfc/tarjeta";
import {
  anadirAlRegistro, botonesDe, lineaRegistro, marcarHecha, MAX_REGISTRO, registrarEncuentro, textoNotificacion,
} from "@/lib/nfc/encuentros";

const h = (c: string, n: number) => c.repeat(n);
const tarjeta = (neuronaId: string): TarjetaNeurona => ({
  version: 1, neuronaId, clavePublica: h("a", 64), cuenta: { modo: "alias", valor: "luna" },
  claveEfimera: h("b", 64), nonce: h("c", 32), emitidaEn: 1, ofertas: ["pagina"],
  transportes: [{ tipo: "ble", direccion: "x" }], firma: h("d", 128),
});
const propia = tarjeta("propia");
const ver = (relacion: Parameters<typeof decidir>[0]["relacion"], prefs = preferenciasPorDefecto()) =>
  decidir({ propia, ajena: tarjeta("ajena"), relacion, prefs });

describe("NFC1126D · botones y notificación", () => {
  it("misma cuenta: botones de acción más ignorar, sin recordar", () => {
    const ids = botonesDe(ver("misma_cuenta")).map((b) => b.id);
    expect(ids).toContain("enviar_cerebro");
    expect(ids).toContain("ignorar");
    expect(ids).not.toContain("recordar");
  });
  it("cuenta nueva: ofrece recordar", () => {
    expect(botonesDe(ver("cuenta_nueva")).map((b) => b.id)).toContain("recordar");
  });
  it("una neurona ignorada no genera notificación", () => {
    const d = ver("cuenta_nueva", ignorar(preferenciasPorDefecto(), "ajena"));
    expect(d.mostrar).toBe(false);
    expect(textoNotificacion(d, "nfc")).toBeNull();
  });
  it("aviso silenciado no notifica; notificar dice la vía", () => {
    const silencio = establecerRelacion(preferenciasPorDefecto(), "misma_cuenta", { aviso: "silenciar" });
    expect(textoNotificacion(ver("misma_cuenta", silencio), "ble")).toBeNull();
    const t = textoNotificacion(ver("misma_cuenta"), "ble");
    expect(t?.cuerpo).toContain("Bluetooth");
  });
});

describe("NFC1126D · registro de Señales", () => {
  it("registra con la vía, sin duplicar y con tope", () => {
    const d = ver("misma_cuenta");
    const r = registrarEncuentro(d, "ajena", "qr", 1_000);
    expect(anadirAlRegistro(anadirAlRegistro([], r), r)).toHaveLength(1);
    let reg = [r];
    for (let i = 0; i < MAX_REGISTRO + 5; i++) reg = anadirAlRegistro(reg, { ...r, id: `x${i}` });
    expect(reg).toHaveLength(MAX_REGISTRO);
    expect(lineaRegistro(r)).toContain("Código QR");
  });
  it("marcarHecha es idempotente y no muta", () => {
    const r = registrarEncuentro(ver("misma_cuenta"), "ajena", "nfc", 1);
    const a = marcarHecha([r], r.id, "mandar_mensaje");
    expect(a[0].hechas).toEqual(["mandar_mensaje"]);
    expect(marcarHecha(a, r.id, "mandar_mensaje")[0].hechas).toHaveLength(1);
    expect(r.hechas).toEqual([]);
  });
});

describe("NFC1126D · hoja «Cerca de ti»", () => {
  const noop = () => undefined;
  it("pinta los botones de la decisión", () => {
    const html = renderToStaticMarkup(createElement(HojaCerca, { decision: ver("misma_cuenta"), via: "nfc", onBoton: noop, onCerrar: noop }));
    expect(html).toContain("Cerca de ti");
    expect(html).toContain('data-testid="boton-ignorar"');
    expect(html).toContain('data-testid="boton-enviar_cerebro"');
  });
  it("no pinta nada si la neurona está ignorada", () => {
    const d = ver("cuenta_nueva", ignorar(preferenciasPorDefecto(), "ajena"));
    expect(renderToStaticMarkup(createElement(HojaCerca, { decision: d, via: "nfc", onBoton: noop, onCerrar: noop }))).toBe("");
  });
});
