import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estadoDesdeSesionInsomnia } from "../insomne";

const AHORA = Date.parse("2026-10-27T12:00:00.000Z");

describe("insomne-servidor con carpeta temporal", () => {
  it("lee session.json y state.json y pasa por estadoDesdeSesionInsomnia", () => {
    const dir = mkdtempSync(join(tmpdir(), "insomne-"));
    const sesion = join(dir, "session.json");
    const estado = join(dir, "state.json");
    writeFileSync(sesion, JSON.stringify({ endsAt: "2026-10-27T13:00:00Z" }));
    writeFileSync(estado, JSON.stringify({ extensions: ["2026-10-27T13:30:00Z"] }));
    const sesionRaw = JSON.parse(require("fs").readFileSync(sesion, "utf8"));
    const estadoRaw = JSON.parse(require("fs").readFileSync(estado, "utf8"));
    const combinado = { ...(sesionRaw as object), ...(estadoRaw as object) };
    const res = estadoDesdeSesionInsomnia(combinado, AHORA);
    expect(res.activo).toBe(true);
    expect(res.proveedor).toBe("insomnia");
    expect(res.hasta).toBe("2026-10-27T13:30:00Z");
  });

  it("si no existen los archivos devuelve sin sesión legible", () => {
    const res = estadoDesdeSesionInsomnia({}, AHORA);
    expect(res.activo).toBe(false);
    expect(res.hasta).toBeNull();
    expect(res.proveedor).toBe("no");
  });
});
