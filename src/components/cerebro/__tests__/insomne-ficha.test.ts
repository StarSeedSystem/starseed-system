/**
 * Rescate de la rama `nube/40695130948` (tarea VGM1016Db-d2, parte 2/2): casos
 * de la ficha insomne de la neurona que main no cubría con ese nombre. La
 * función vive hoy en `src/lib/neurons/insomne.ts` (pura); aquí se prueba la
 * parte de la ficha que registra la capacidad por plataforma.
 */
import { describe, it, expect } from "vitest";
import { capacidadInsomne } from "@/lib/neurons/insomne";
import {
  plataformaInsomne,
  estadoDePresencia,
  type MedioAnuncio,
} from "../insomne-ficha";
import { debeSoltarTrabajo } from "@/lib/neurons/insomne";

describe("capacidadInsomne · ficha", () => {
  it("un servidor no depende de la plataforma que declare", () => {
    expect(capacidadInsomne("server").proveedor).toBe("siempre");
    expect(capacidadInsomne("vps").proveedor).toBe("siempre");
    expect(capacidadInsomne("server").disponible).toBe(true);
  });

  it("lo que no reconoce no se inventa una capacidad", () => {
    const d = capacidadInsomne("linux-morado-9000");
    expect(d.proveedor).toBe("no");
    expect(d.disponible).toBe(false);
    expect(d.motivo).toContain("no reconocida");
  });
});

describe("plataformaInsomne · ficha", () => {
  it("traduce las plataformas del navegador a las del contrato", () => {
    expect(plataformaInsomne({ platform: "macOS" })).toBe("macos");
    expect(plataformaInsomne({ platform: "iPadOS" })).toBe("ios");
    expect(plataformaInsomne({ platform: "Android" })).toBe("android");
    expect(plataformaInsomne({ platform: "Windows" })).toBe("windows");
    expect(plataformaInsomne({ platform: "Linux" })).toBe("linux");
  });

  it("un servidor no depende de la plataforma: ya está siempre encendido", () => {
    expect(plataformaInsomne({ platform: "Linux" }, "server")).toBe("servidor");
    expect(plataformaInsomne(undefined, "server")).toBe("servidor");
  });

  it("lo que no reconoce no se inventa: cae al navegador (contrato de hoy)", () => {
    // Rescate rama `nube/40659574880`: la rama asociaba lo desconocido a
    // «otro»/«freebsd»; main normaliza a un set cerrado y lo desconocido
    // mira su capacidad de navegador (wake-lock, pestaña visible).
    expect(plataformaInsomne(undefined)).toBe("navegador");
    expect(plataformaInsomne({ platform: "FreeBSD" })).toBe("navegador");
    expect(capacidadInsomne("navegador").proveedor).toBe("wake-lock");
  });
});

describe("estadoDePresencia · ficha", () => {
  const AHORA = Date.parse("2026-10-30T12:00:00.000Z");

  it("la señal de presencia marca la sesión activa y hasta cuándo", () => {
    const hasta = AHORA + 2 * 60 * 60_000;
    const medios: MedioAnuncio[] = [
      { n: "otra", t: AHORA, s: { insomne: { hasta: AHORA - 1_000, proveedor: "insomnia" } } },
      { n: "n1", t: AHORA, s: { insomne: { hasta, proveedor: "insomnia" } } },
    ];
    const estado = estadoDePresencia(medios, "n1", AHORA);
    expect(estado).toMatchObject({
      activo: true,
      hasta: new Date(hasta).toISOString(),
      proveedor: "insomnia",
      motivo: "lo anuncia la presencia",
    });
    // Con más de 15 minutos por delante la sesión no suelta trabajo.
    expect(debeSoltarTrabajo(estado!, AHORA)).toBe(false);
  });

  it("una sesión vencida no se finge activa (no hay anuncio)", () => {
    const medios: MedioAnuncio[] = [
      { n: "n1", t: AHORA, s: { insomne: { hasta: AHORA - 1_000, proveedor: "insomnia" } } },
    ];
    expect(estadoDePresencia(medios, "n1", AHORA)).toBeNull();
  });
});
