// Tests del perfil de hardware (HW-1): ocho fixtures literales de dispositivos.
import { describe, expect, it } from "vitest";
import {
  ajustesBitnet,
  dondeRazona,
  medirPerfil,
  type EntornoMedicion,
} from "@/lib/astraura/perfil-hardware";

const macM1Tauri: EntornoMedicion = {
  userAgent: "Mozilla/5.0 (Macintosh; Apple Silicon Mac)",
  esTauri: true,
  esPWA: false,
  hardwareConcurrency: 8,
  deviceMemory: 8,
};
const pc32Tauri: EntornoMedicion = {
  userAgent: "Mozilla/5.0 (X11; Linux x86_64; Intel)",
  esTauri: true,
  esPWA: false,
  hardwareConcurrency: 16,
  deviceMemory: 32,
};
const iphone: EntornoMedicion = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 6,
};
const android4: EntornoMedicion = {
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 8,
  deviceMemory: 4,
};
const chromeWeb: EntornoMedicion = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Intel)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 16,
  deviceMemory: 8,
};
const safari: EntornoMedicion = {
  userAgent: "Mozilla/5.0 (Macintosh; Apple Silicon; Safari)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 8,
};
const conSaveData: EntornoMedicion = { ...android4, saveData: true };
const bateriaBaja: EntornoMedicion = { ...pc32Tauri, bateriaBaja: true };

describe("medirPerfil", () => {
  it("Mac M1 8 GB con Tauri: nivel justo, arm64", () => {
    const p = medirPerfil(macM1Tauri);
    expect(p.nivel).toBe("justo");
    expect(p.plataforma).toBe("tauri");
    expect(p.arq).toBe("arm64");
  });
  it("PC 32 GB con Tauri: nivel pleno, x86_64", () => {
    const p = medirPerfil(pc32Tauri);
    expect(p.nivel).toBe("pleno");
    expect(p.arq).toBe("x86_64");
  });
  it("iPhone sin deviceMemory: plataforma ios", () => {
    const p = medirPerfil(iphone);
    expect(p.plataforma).toBe("ios");
    expect(p.ramGb).toBeNull();
    expect(p.nivel).toBe("minimo");
  });
  it("Android 4 GB: nivel mínimo", () => {
    const p = medirPerfil(android4);
    expect(p.plataforma).toBe("android");
    expect(p.nivel).toBe("minimo");
  });
  it("Chrome de escritorio sin Tauri: siempre remoto", () => {
    expect(medirPerfil(chromeWeb).nivel).toBe("remoto");
  });
  it("Safari sin deviceMemory: remoto por ser web", () => {
    expect(medirPerfil(safari).nivel).toBe("remoto");
  });
  it("saveData: conexión lenta", () => {
    expect(medirPerfil(conSaveData).conexion).toBe("lenta");
  });
  it("batería baja: baja un nivel (pleno → justo)", () => {
    const p = medirPerfil(bateriaBaja);
    expect(p.nivel).toBe("justo");
    expect(p.bateria).toBe(true);
  });
});

describe("dondeRazona", () => {
  it("tauri justo: needle y bitnet en local", () => {
    expect(dondeRazona(medirPerfil(macM1Tauri))).toEqual({ needle: "local", jev: "red", bitnet: "local" });
  });
  it("web: needle al backend y bitnet a la nube", () => {
    expect(dondeRazona(medirPerfil(chromeWeb))).toEqual({ needle: "backend", jev: "red", bitnet: "nube" });
  });
  it("mínimo: bitnet razona en un vecino de la mesh", () => {
    expect(dondeRazona(medirPerfil(android4)).bitnet).toBe("vecino");
  });
  it("sin conexión: ninguno si no puede ser local", () => {
    const p = medirPerfil(android4);
    expect(dondeRazona({ ...p, conexion: "sin" }).bitnet).toBe("ninguno");
  });
});

describe("ajustesBitnet", () => {
  it("≤ 8,5 GB: 2 hilos, ctx 2048, 1 slot", () => {
    expect(ajustesBitnet(medirPerfil(macM1Tauri))).toEqual({ hilos: 2, ctx: 2048, paralelo: 1 });
  });
  it("≤ 16,5 GB: mitad de núcleos (tope 4), 4096, 2", () => {
    const p = medirPerfil({ ...pc32Tauri, deviceMemory: 16 });
    expect(ajustesBitnet(p)).toEqual({ hilos: 4, ctx: 4096, paralelo: 2 });
  });
  it("más: tope 6 hilos, 4096, 3 slots", () => {
    expect(ajustesBitnet(medirPerfil(pc32Tauri))).toEqual({ hilos: 6, ctx: 4096, paralelo: 3 });
  });
});
