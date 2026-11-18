/**
 * (UPD1118A) Manejo del error "plataforma ausente en el manifiesto".
 * Cuando el actualizador Tauri no encuentra la plataforma en latest-prueba.json,
 * se muestra un aviso ámbar (no error rojo) y sin duplicar el prefijo.
 */
import { describe, expect, it } from "vitest";
import { describirError, formatearErrorActualizacion } from "../errores";

describe("error de plataforma ausente en el manifiesto (UPD1118A)", () => {
  it("detecta el error de Tauri 'were found in the response platforms object' y devuelve código 'sin-plataforma'", () => {
    const error = 'None of the fallback platforms ["linux-x86_64-appimage","linux-x86_64"] were found in the response platforms object';
    const d = describirError(error);
    expect(d.codigo).toBe("sin-plataforma");
    expect(d.reintentable).toBe(true);
    expect(d.esperarRed).toBe(false);
  });

  it("formatea el mensaje para UI: ámbar con versión instalada, sin prefijo duplicado", () => {
    const error = 'None of the fallback platforms ["linux-x86_64-appimage","linux-x86_64"] were found in the response platforms object';
    const versionInstalada = "0.5.1-prueba.53";
    const formateado = formatearErrorActualizacion(error, versionInstalada);
    expect(formateado).not.toBeNull();
    if (!formateado) return;
    expect(formateado.tipo).toBe("ámbar");
    expect(formateado.texto).toBe(
      `Esta versión de prueba aún no tiene paquete para tu sistema; sigues en la ${versionInstalada}. Vuelve a comprobar más tarde.`
    );
  });

  it("error de red sigue en rojo con texto habitual", () => {
    const error = "TypeError: Failed to fetch";
    const formateado = formatearErrorActualizacion(error, "0.5.1-prueba.53");
    expect(formateado).not.toBeNull();
    if (!formateado) return;
    expect(formateado.tipo).toBe("rojo");
    expect(formateado.texto).toBe("Sin conexión: lo intentaré cuando vuelva la red.");
  });

  it("sin error (éxito) no muestra mensaje de error", () => {
    const formateado = formatearErrorActualizacion(null, "0.5.1-prueba.53");
    expect(formateado).toBeNull();
  });
});