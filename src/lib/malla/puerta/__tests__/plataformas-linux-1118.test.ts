/**
 * T306 · Texto honesto de la puerta de internet en Linux (TRI1118).
 * Comprueba que la nota de compartir y noPasa de usar reflejan que la puerta
 * es de la app, no un punto de acceso ni router (no hace NAT).
 */
import { describe, expect, it } from "vitest";
import { capacidadesPuerta, type EntornoPuerta } from "@/lib/malla/puerta/plataformas";

describe("Linux (TRI1118): puerta de app, no punto de acceso", () => {
  const linux = { plataforma: "linux", nativo: true } as EntornoPuerta;
  const macos = { plataforma: "macos", nativo: true, macosMayor: 15 } as EntornoPuerta;
  const android = { plataforma: "android", nativo: true, androidSdk: 34 } as EntornoPuerta;

  it("compartir.puede es true", () => {
    expect(capacidadesPuerta(linux).compartir.puede).toBe(true);
  });

  it("compartir.nota contiene 'punto de acceso' y explica que no es router", () => {
    const nota = capacidadesPuerta(linux).compartir.nota ?? "";
    expect(nota).toContain("punto de acceso");
    expect(nota).toContain("no convierte este equipo en un punto de acceso ni en un router");
  });

  it("usar.noPasa incluye la frase de NAT", () => {
    const noPasa = capacidadesPuerta(linux).usar.noPasa.join(" ");
    expect(noPasa).toContain("la puerta no hace NAT");
  });

  it("usar.noPasa no contiene la palabra 'Mando'", () => {
    const noPasa = capacidadesPuerta(linux).usar.noPasa.join(" ");
    expect(noPasa).not.toContain("Mando");
  });

  it("con proxyApagadoPorEntorno:true, usar.webview es false y nota menciona STARSEED_SIN_PROXY_PUERTA", () => {
    const c = capacidadesPuerta({ ...linux, proxyApagadoPorEntorno: true });
    expect(c.usar.webview).toBe(false);
    expect(c.usar.nota).toContain("STARSEED_SIN_PROXY_PUERTA");
  });

  it("macOS y Android mantienen su compartir.puede original", () => {
    const antes = {
      macos: capacidadesPuerta(macos).compartir.puede,
      android: capacidadesPuerta(android).compartir.puede,
    };
    expect(antes.macos).toBe(true);
    expect(antes.android).toBe(true);
  });
});