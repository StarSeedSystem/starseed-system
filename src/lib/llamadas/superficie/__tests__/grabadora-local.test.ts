import { describe, expect, it } from "vitest";
import { elegirMime, guardarEnOpfs, iniciarGrabadoraLocal, type CtorGrabadora } from "../grabadora-local";

class Falsa {
  static isTypeSupported = (t: string) => t === "audio/webm" || t === "video/webm";
  state = "inactive"; mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
  start() { this.state = "recording"; this.ondataavailable?.({ data: new Blob(["ab"]) }); this.ondataavailable?.({ data: new Blob([]) }); }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["cd"]) }); this.onstop?.(); }
}

describe("grabadora local (LLA1108C)", () => {
  it("elige un formato soportado según haya vídeo", () => {
    expect(elegirMime(Falsa as unknown as CtorGrabadora, false)).toBe("audio/webm");
    expect(elegirMime(Falsa as unknown as CtorGrabadora, true)).toBe("video/webm");
  });
  it("junta los trozos no vacíos en un Blob al parar", async () => {
    const g = iniciarGrabadoraLocal({} as MediaStream, Falsa as unknown as CtorGrabadora, false);
    const b = await g.parar();
    expect(b.size).toBe(4);
  });
  it("OPFS: guarda o devuelve null sin romper", async () => {
    const escritos: string[] = [];
    const raiz = { getDirectoryHandle: async () => ({ getFileHandle: async () => ({ createWritable: async () => ({ write: async () => { escritos.push("w"); }, close: async () => {} }) }) }) };
    expect(await guardarEnOpfs(new Blob(["x"]), "a.webm", raiz)).toBe("grabaciones-llamada/a.webm");
    expect(await guardarEnOpfs(new Blob(["x"]), "a.webm", null)).toBeNull();
    expect(await guardarEnOpfs(new Blob(["x"]), "a.webm", { getDirectoryHandle: async () => { throw new Error("x"); } })).toBeNull();
  });
});
