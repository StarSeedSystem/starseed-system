/**
 * (BLE1108B) La vía de un archivo lleva la ruta de los dos aparatos y la etiqueta de un enlace local dice la ruta MEDIDA.
 *   NODE_ENV=test npx vitest run src/lib/mensajeria/neuronas/__tests__/ruta-acordada.test.ts
 */
import { describe, expect, it } from "vitest";
import { viaConRutas } from "../archivos-neurona";
import { etiquetaViaLocal } from "@/lib/malla/transporte-universal";
import type { ViaMensaje } from "@/lib/mensajeria/medios/tipos";

const via: ViaMensaje = { medio: "p2p-internet", direccion: "sale", ruta: "internet-directo", confirmado: true, enlaceId: "cuenta:x" };

describe("viaConRutas", () => {
  it("guarda la ruta propia y la del otro y la verificación", () => {
    const v = viaConRutas(via, { rutaEnlace: "misma-red-local", rutaEnlaceOtro: "misma-red-local", rutaEnlaceVerificada: true });
    expect(v).toMatchObject({ ruta: "misma-red-local", rutaOtro: "misma-red-local", rutaVerificada: true });
  });
  it("si el otro aún no contestó, deja la ruta que había", () => {
    const v = viaConRutas(via, {});
    expect(v.ruta).toBe("internet-directo");
    expect(v.rutaOtro).toBeUndefined();
  });
});

describe("etiquetaViaLocal", () => {
  it("sin medir o en la misma red, la etiqueta de siempre", () => {
    expect(etiquetaViaLocal(true, "misma-red-local")).toBe("Red local (app nativa) · enlace directo WebRTC");
    expect(etiquetaViaLocal(true, null)).toBe("Red local (app nativa) · enlace directo WebRTC");
    expect(etiquetaViaLocal(false, null)).toBe("Enlace local sin internet (WebRTC)");
  });
  it("un enlace abierto en la red local que ahora va por internet o por TURN ya no dice «red local»", () => {
    expect(etiquetaViaLocal(true, "internet-directo")).toContain("internet directo (NAT atravesado)");
    expect(etiquetaViaLocal(true, "internet-directo")).not.toContain("Red local");
    expect(etiquetaViaLocal(false, "reenviado-turn")).toContain("relé TURN");
  });
});
