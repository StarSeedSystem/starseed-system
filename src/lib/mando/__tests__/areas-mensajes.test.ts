import { describe, it, expect } from "vitest";
import { mensajeDeArea } from "@/lib/mando/areas";

describe("mensajeDeArea", () => {
  it("nombra el área y dice por dónde se arregla, con su ruta interna", () => {
    const mensaje = mensajeDeArea("rito", "guardado");
    expect(mensaje.tono).toBe("error");
    expect(mensaje.titulo).toContain("Rito y bienvenida");
    expect(mensaje.arreglo).toContain("/bienvenida");
  });

  it("un fallo de red es aviso y nunca afirma que el servicio esté caído", () => {
    const mensaje = mensajeDeArea("nube", "red");
    expect(mensaje.tono).toBe("aviso");
    expect(mensaje.detalle).toMatch(/no sabemos si el servicio está caído/i);
  });

  it("respeta el detalle propio del caso sin perder la guía común", () => {
    const mensaje = mensajeDeArea("rito", "guardado", "No se pudo crear el cerebro.");
    expect(mensaje.detalle).toBe("No se pudo crear el cerebro.");
    expect(mensaje.arreglo.length).toBeGreaterThan(0);
  });

  it("un guardado local es informativo y dice que el rito no vuelve a empezar", () => {
    const mensaje = mensajeDeArea("rito", "local");
    expect(mensaje.tono).toBe("info");
    expect(mensaje.arreglo).toMatch(/bucle/i);
  });

  it("un área desconocida cae en un texto genérico, sin rutas del disco", () => {
    const mensaje = mensajeDeArea("no-existe", "desconocido");
    expect(mensaje.titulo).toContain("esta sección");
    expect(JSON.stringify(mensaje)).not.toMatch(/(\/Users|\/home|[A-Za-z]:\\)/);
  });

  it("solo devuelve texto de interfaz: ni claves ni nombres de variables secretas", () => {
    const texto = JSON.stringify(mensajeDeArea("rito", "red"));
    expect(texto).not.toMatch(/sk-[A-Za-z0-9]|SUPABASE|ANON_KEY|SERVICE_ROLE/i);
  });
});
