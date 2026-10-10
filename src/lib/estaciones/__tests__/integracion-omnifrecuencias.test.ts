/**
 * El módulo que se copia al repo de Omnifrecuencias (`integraciones-de-codigo/omnifrecuencias/`)
 * habla lo mismo que el OS: el enlace «abrir fuera» lo entiende «Nueva estación», el saludo pasa
 * el filtro del puente y la fórmula del reloj es la misma.
 */
import { describe, expect, it } from "vitest";
import {
  enlaceParaAbrirFuera,
  muestra,
  VERSION_PUENTE as VERSION_APP,
} from "../../../../integraciones-de-codigo/omnifrecuencias/estacion-starseed";
import { base64UrlATexto } from "../cripto-estacion";
import { parametrosPegados } from "../opciones-entonacion";
import { esMensajeDeApp, VERSION_PUENTE } from "../puente-omnifrecuencias";
import { muestraNtp } from "../reloj-comun";

describe("integración con la app oficial de Omnifrecuencias", () => {
  it("misma versión de protocolo y el saludo de la app pasa el filtro del OS", () => {
    expect(VERSION_APP).toBe(VERSION_PUENTE);
    expect(esMensajeDeApp({ ss: "estacion", v: VERSION_APP, tipo: "hola", app: "omnifrecuencias", suena: false })).toBe(true);
  });

  it("«abrir fuera» lleva la entonación que «Nueva estación» sabe leer", () => {
    const url = enlaceParaAbrirFuera("https://starseed-os.vercel.app/", {
      titulo: "Sinergia Phi",
      enlace: "https://omnifrecuencias.vercel.app/entonaciones/phi",
      osciladores: [
        { frequency: 432, type: "sine", volume: 0.5, panX: -0.8, panY: 0, panZ: 0, name: "Base Phi (L)" },
        { frequency: 433.618, type: "sine", volume: 0.5, panX: 0.8, panY: 0, panZ: 0, name: "Binaural Phi (R)" },
      ],
    });
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}${u.search}`).toBe("https://starseed-os.vercel.app/estaciones?nueva=omnifrecuencias");
    const h = new URLSearchParams(u.hash.slice(1));
    expect(h.get("t")).toBe("Sinergia Phi");
    const p = parametrosPegados(base64UrlATexto(h.get("p")!), "omnifrecuencias");
    expect(p?.tipo).toBe("omnifrecuencias");
    expect(p && p.tipo === "omnifrecuencias" ? p.entonacion.osciladores.map((o) => [o.f, o.x]) : null).toEqual([[432, -0.8], [433.618, 0.8]]);
  });

  it("la fórmula del reloj de la app es la del OS", () => {
    const a = muestra(1000, 1510, 1512, 1030);
    const b = muestraNtp(1000, 1510, 1512, 1030)!;
    expect(a.desfase).toBe(b.desfaseMs);
    expect(a.retardo).toBe(b.retardoMs);
  });
});

describe("enlaceNuevaEnVivo (widget y versión integrada)", () => {
  it("lleva los osciladores en el fragmento y «Nueva estación» los entiende", async () => {
    const { enlaceNuevaEnVivo } = await import("../enlace-nueva-en-vivo");
    const url = enlaceNuevaEnVivo("omnifrecuencias", {
      titulo: "528 Hz",
      parametros: [{ frequency: 528, type: "sine", volume: 0.6, panX: 0, panY: 0, panZ: 0 }],
    });
    expect(url.startsWith("/estaciones?nueva=omnifrecuencias#")).toBe(true);
    const h = new URLSearchParams(url.split("#")[1]);
    expect(h.get("t")).toBe("528 Hz");
    const p = parametrosPegados(base64UrlATexto(h.get("p")!), "omnifrecuencias");
    expect(p && p.tipo === "omnifrecuencias" ? p.entonacion.osciladores[0].f : null).toBe(528);
  });
});
