import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const engine = fs.readFileSync(path.resolve(__dirname, "../../engine.ts"), "utf-8");
const turn = fs.readFileSync(path.resolve(__dirname, "../../turn.ts"), "utf-8");

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

describe("EAR1023C · cableado de la línea de contexto del oído", () => {
  it("el flujo registra las etiquetas que devuelve el servicio de oído", () => {
    expect(engine).toContain('from "@/lib/aurora/sentidos/contexto-oido"');
    expect(engine).toMatch(/lineaContextoOido\s*\(/);
    expect(engine).toMatch(/lineaContextoOidoParaPrompt\s*\(/);
    expect(engine).toMatch(/recibirEtiquetasOidas\s*\(/);
  });

  it("la línea entra al prompt del motor y al del pipeline compartido", () => {
    expect(engine).toMatch(/notaOido\s*\?\s*"\\n\\n"\s*\+\s*notaOido/);
    expect(turn).toMatch(/lineaContextoOidoParaPrompt/);
  });
});
