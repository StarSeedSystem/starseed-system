import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("importPorcupine - caché de promesas rechazadas (verificación estática)", () => {
  const filePath = path.join(process.cwd(), "src/lib/aurora/wake-acoustic/porcupine-wake.ts");
  const content = fs.readFileSync(filePath, "utf-8");

  it("importPorcupine debe ser exportada", () => {
    expect(content).toContain("export async function importPorcupine");
  });

  it("importPorcupine debe tener .catch que limpia la variable en rechazo", () => {
    // Verificar que existe el patrón .catch(() => { porcupineModPromise = null; throw err; })
    const hasCatchCleanup = content.includes("porcupineModPromise = null") && 
                           content.includes(".catch((err) => {");
    expect(hasCatchCleanup).toBe(true);
  });

  it("variable porcupineModPromise debe declararse como let y null inicial", () => {
    expect(content).toMatch(/let porcupineModPromise: Promise<any> \| null = null;/);
  });

  it("debe tener el patrón completo de limpieza en rechazo", () => {
    // Verificar el patrón completo: })().catch((err) => { porcupineModPromise = null; throw err; }
    expect(content).toContain("})().catch((err) => {");
    expect(content).toContain("porcupineModPromise = null;");
    expect(content).toContain("throw err;");
  });
});

describe("Consistencia con otros cargadores de modelos", () => {
  it("oss-stt.ts debe tener limpieza de promesa rechazada", () => {
    const filePath = path.join(process.cwd(), "src/lib/aurora/stt-oss/oss-stt.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("transformersModPromise = null;");
    expect(content).toContain("pipelinePromise = null;");
  });

  it("oss-tts.ts debe tener limpieza de promesa rechazada", () => {
    const filePath = path.join(process.cwd(), "src/lib/aurora/tts-oss/oss-tts.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("kokoroModPromise = null;");
    expect(content).toContain("ttsPromise = null;");
  });

  it("cargar-modelo.ts debe tener limpieza de promesa rechazada", () => {
    const filePath = path.join(process.cwd(), "src/components/vivo/espacial/cargar-modelo.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Patrón: p.catch(() => cache.delete(url))
    expect(content).toContain("p.catch(() => cache.delete(url))");
  });

  it("leaflet-loader.ts debe tener limpieza de promesa rechazada", () => {
    const filePath = path.join(process.cwd(), "src/lib/map/leaflet-loader.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Patrón: pending = null en callbacks de error
    expect(content).toContain("pending = null;");
  });

  it("voice-identity.ts debe tener limpieza de promesa rechazada", () => {
    const filePath = path.join(process.cwd(), "src/lib/aurora/tts-oss/voice-identity.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Patrón: if (!blob) cache.delete(key)
    expect(content).toContain("if (!blob) cache.delete(key)");
  });
});