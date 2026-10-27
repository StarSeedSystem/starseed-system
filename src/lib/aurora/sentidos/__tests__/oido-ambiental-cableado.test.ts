import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const engine = fs.readFileSync(path.resolve(__dirname, "../../engine.ts"), "utf-8");

describe("EAR1023B · cableado del oído ambiental", () => {
  it("importa la decisión pura y la llama desde el flujo de audio", () => {
    expect(engine).toContain('from "@/lib/aurora/sentidos/oido-ambiental"');
    expect(engine).toMatch(/decidirEnvioAlOido\s*\(/);
  });

  it("solo abre el oído con el sentido de micrófono encendido", () => {
    expect(engine).toContain('getActiveSenses("aurora").includes("microfono")');
  });

  it("marca como voz los tramos vistos por el flujo y los excluye", () => {
    expect(engine).toMatch(/alParcial:[^\n]*ultimaVozFlujo = Date\.now\(\)/);
    expect(engine).toMatch(/alFinal:[^\n]*ultimaVozFlujo = Date\.now\(\)/);
    expect(engine).toContain("contieneVoz: ahora - ultimaVozFlujo < VENTANA_SIN_VOZ_MS");
  });

  it("manda el fragmento aceptado al servicio de oído de la neurona", () => {
    expect(engine).toContain('const URL_SERVICIO_OIDO = "http://127.0.0.1:8081/oir"');
    expect(engine).toMatch(/fetch\(URL_SERVICIO_OIDO/);
    expect(engine).toContain("UMBRAL_ENERGIA_POR_DEFECTO");
    expect(engine).toContain("INTERVALO_MINIMO_MS_POR_DEFECTO");
  });
});
