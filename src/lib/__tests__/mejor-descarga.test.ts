import { describe, it, expect } from "vitest";
import type { NativeOption } from "../install/device-install";
import { mejorDescargaPara, formatosPorSistema } from "../install/mejor-descarga";

function base(): NativeOption[] {
  return [
    {
      label: "Instalar como app (PWA)",
      note: "Vía real disponible ahora.",
      status: "pwa",
      href: "https://starseed-os.vercel.app",
    },
  ];
}

function conRelease(os: string): NativeOption[] {
  const items = base();
  items.push({
    label: "Binario real",
    note: "Paquete nativo real.",
    status: "release",
    href: "https://github.com/StarSeedSystem/starseed-system/releases",
  });
  return items;
}

function sooOnly(losSeis: string[]): NativeOption[] {
  return base().concat(
    losSeis.map(
      (label): NativeOption => ({
        label,
        note: "Todavía en preparación.",
        status: "soon",
      }),
    ),
  );
}

describe("mejorDescargaPara · los seis sistemas", () => {
  it.each(["macos", "windows", "linux", "android"] as const)(
    "%s con binario release disponible → lo ofrece con formato real",
    (os) => {
      const rec = mejorDescargaPara(os, conRelease(os), false, false);
      expect(rec.disponible).toBe(true);
      expect(rec.titulo).toContain("Descarga");
      expect(rec.formato).not.toContain("PWA");
      expect(rec.url).toBeTruthy();
    },
  );

  it("ios sin release propio se resuelve a PWA instalable", () => {
    const rec = mejorDescargaPara("ios", base(), true, false);
    expect(rec.disponible).toBe(true);
    expect(rec.titulo).toBe("Instalar como app");
  });

  it("unknown sin binario ni PWA → web no disponible y motivo honesto", () => {
    const rec = mejorDescargaPara("unknown", sooOnly([]), false, false);
    expect(rec.disponible).toBe(false);
    expect(rec.motivo).toContain("binario firmado");
  });
});

describe("mejorDescargaPara · caso «ya instalada»", () => {
  it("con binario release disponible sigue diciendo que ya la tienes", () => {
    const rec = mejorDescargaPara("macos", conRelease("macos"), true, true);
    expect(rec.disponible).toBe(false);
    expect(rec.motivo).toContain("Ya la tienes instalada");
  });

  it("no ofrece nada aunque la PWA sea instalable", () => {
    const rec = mejorDescargaPara("android", base(), true, true);
    expect(rec.disponible).toBe(false);
    expect(rec.formato).toBe("App instalada");
  });
});

describe("mejorDescargaPara · solo PWA", () => {
  it("sin binario pero con PWA instalable → «Instalar como app» disponible", () => {
    const rec = mejorDescargaPara("windows", base(), true, false);
    expect(rec.disponible).toBe(true);
    expect(rec.titulo).toBe("Instalar como app");
    expect(rec.formato).toContain("PWA");
  });

  it("sin binario y sin PWA → no disponible, con la opción soon más cercana", () => {
    const rec = mejorDescargaPara("linux", sooOnly(["AppImage (.AppImage)"]), false, false);
    expect(rec.disponible).toBe(false);
    expect(rec.detalle).toContain("preparación");
  });
});

describe("mejorDescargaPara · un soon nunca sale disponible", () => {
  it.each(["macos", "windows", "linux", "android", "ios", "unknown"] as const)(
    "%s: solo opciones soon → disponible:false y motivo honesto",
    (os) => {
      const rec = mejorDescargaPara(os, sooOnly([os]), false, false);
      expect(rec.disponible).toBe(false);
      expect(typeof rec.motivo).toBe("string");
      expect(rec.motivo!.length).toBeGreaterThan(0);
    },
  );
});

describe("formatosPorSistema", () => {
  it("cada SO lista sus formatos y unknown solo la web", () => {
    const mapa = formatosPorSistema();
    expect(mapa.android).toEqual(["APK (.apk)", "App Bundle (.aab)"]);
    expect(mapa.macos).toEqual(["Imagen de disco (.dmg)", "Paquete (.pkg)"]);
    expect(mapa.windows).toEqual(["Ejecutable (.exe)", "Instalador (.msi)"]);
    expect(mapa.linux).toEqual(["AppImage (.AppImage)", "Paquete Debian (.deb)", "Paquete RPM (.rpm)"]);
    expect(mapa.unknown).toEqual(["Web (PWA)"]);
  });

  it("no comparte el mismo array entre llamadas (evita mutaciones)", () => {
    const a = formatosPorSistema();
    const b = formatosPorSistema();
    expect(a).not.toBe(b);
    expect(a.macos).not.toBe(b.macos);
  });
});