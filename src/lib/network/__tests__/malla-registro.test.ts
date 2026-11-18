import { describe, expect, it } from "vitest";
import {
  crearEmisorMalla,
  idCortoMalla,
  lineaEventoArchivoMalla,
  lineaEventoMensajeMalla,
  type NotaMalla,
} from "../malla-registro";

describe("malla-registro · línea de registro por evento de la malla (AUD1117 · F7)", () => {
  it("la línea de archivo tiene la forma evento id=<8> via=<medio> bytes=<n>", () => {
    expect(lineaEventoArchivoMalla("enviado", "arch_1a2b3c4d", "local", 1024)).toBe("enviado id=arch_1a2 via=local bytes=1024");
    expect(lineaEventoArchivoMalla("hash-ok", "arch_1a2b3c4d", "wifi-local", 4096)).toBe("hash-ok id=arch_1a2 via=wifi-local bytes=4096");
    expect(lineaEventoArchivoMalla("recibido", "x", null, 0)).toBe("recibido id=x bytes=0");
  });

  it("la línea de mensaje tiene la forma evento via=<medio>, sin id ni texto", () => {
    expect(lineaEventoMensajeMalla("enviado", "p2p-internet")).toBe("enviado via=p2p-internet");
    expect(lineaEventoMensajeMalla("entregado", "bluetooth")).toBe("entregado via=bluetooth");
  });

  it("el id se recorta a 8 caracteres y se limpia: un nombre largo no cabe en la línea", () => {
    const largo = "informe-secreto-final-v2.pdf";
    expect(idCortoMalla(largo)).toBe("informe-");
    expect(lineaEventoArchivoMalla("recibido", largo, "local", 10)).not.toContain("secreto");
    expect(lineaEventoArchivoMalla("recibido", largo, "local", 10)).not.toContain(".pdf");
  });

  it("la vía se convierte en un token sin espacios ni controles", () => {
    expect(lineaEventoArchivoMalla("enviado", "abc", "Red local (app nativa) · enlace directo", 5)).toBe(
      "enviado id=abc via=red-local-app-nativa-enl bytes=5",
    );
    expect(lineaEventoArchivoMalla("enviado", "abc", "  ", 5)).toBe("enviado id=abc bytes=5");
  });

  it("cada evento de archivo sale UNA vez por transferencia, aunque se repita la llamada", () => {
    const lineas: NotaMalla[] = [];
    const emisor = crearEmisorMalla((n) => lineas.push(n));
    emisor.archivo("enviado", "arch_1a2b3c4d", "local", 1024);
    emisor.archivo("enviado", "arch_1a2b3c4d", "local", 1024);
    emisor.archivo("hash-ok", "arch_1a2b3c4d", "local", 1024);
    expect(lineas).toHaveLength(2);
    expect(lineas[0].detalle).toBe("enviado id=arch_1a2 via=local bytes=1024");
    expect(lineas[1].detalle).toBe("hash-ok id=arch_1a2 via=local bytes=1024");
  });

  it("cada evento de mensaje sale UNA vez por mensaje, y la línea no lleva el texto", () => {
    const lineas: NotaMalla[] = [];
    const emisor = crearEmisorMalla((n) => lineas.push(n));
    const texto = "hola, este texto nunca debe salir en el registro";
    emisor.mensaje("enviado", texto + "#1", "local");
    emisor.mensaje("enviado", texto + "#1", "local");
    emisor.mensaje("entregado", texto + "#1", "local");
    expect(lineas).toHaveLength(2);
    expect(lineas[0].detalle).toBe("enviado via=local");
    expect(lineas[1].detalle).toBe("entregado via=local");
    for (const n of lineas) {
      expect(n.detalle).not.toContain("hola");
      expect(n.detalle).not.toContain(texto);
    }
  });

  it("todas las líneas encajan en su forma exacta (nada de contenido suelto)", () => {
    const lineas: NotaMalla[] = [];
    const emisor = crearEmisorMalla((n) => lineas.push(n));
    emisor.archivo("enviado", "arch_1a2b3c4d", "local", 1024);
    emisor.archivo("recibido", "arch_9f8e7d6c", "wifi-local", 16);
    emisor.archivo("hash-ok", "arch_9f8e7d6c", null, 16);
    emisor.mensaje("enviado", "m-1", "local");
    emisor.mensaje("entregado", "m-1", "turn");
    const deArchivo = /^(enviado|recibido|hash-ok) id=[A-Za-z0-9_-]{1,8}( via=[a-z0-9_-]{1,24})? bytes=\d+$/;
    const deMensaje = /^(enviado|entregado) via=[a-z0-9_-]{1,24}$/;
    expect(lineas).toHaveLength(5);
    expect(lineas.filter((n) => n.tipo === "archivo").map((n) => n.detalle)).toHaveLength(3);
    expect(lineas.filter((n) => n.tipo === "mensaje-malla").map((n) => n.detalle)).toHaveLength(2);
    for (const n of lineas) {
      expect(deArchivo.test(n.detalle) || deMensaje.test(n.detalle)).toBe(true);
    }
  });

  it("sin vía medible ni id utilizable no sale línea", () => {
    const lineas: NotaMalla[] = [];
    const emisor = crearEmisorMalla((n) => lineas.push(n));
    emisor.mensaje("enviado", "m-2", "  ");
    emisor.archivo("enviado", "   ", "local", 10);
    emisor.archivo("enviado", "arch_ok", "local", Number.NaN);
    expect(lineas).toHaveLength(0);
  });
});
