import { describe, it, expect } from "vitest";
import { canalListoParaEnviar, claveLimiteDePeticion } from "@/lib/network/canal-listo";

const cab = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });

describe("canalListoParaEnviar", () => {
  it("solo con el canal unido", () => {
    expect(canalListoParaEnviar({ state: "joined" })).toBe(true);
    expect(canalListoParaEnviar({ state: "joining" })).toBe(false);
    expect(canalListoParaEnviar({ state: "closed" })).toBe(false);
    expect(canalListoParaEnviar({})).toBe(false);
    expect(canalListoParaEnviar(null)).toBe(false);
  });
});

describe("claveLimiteDePeticion", () => {
  it("es estable y no revela el token", () => {
    const a = claveLimiteDePeticion(cab({ authorization: "Bearer secreto-123" }));
    expect(a).toBe(claveLimiteDePeticion(cab({ authorization: "Bearer secreto-123" })));
    expect(a).not.toContain("secreto");
  });
  it("distingue sesiones y cae a la IP o a anónimo", () => {
    const a = claveLimiteDePeticion(cab({ cookie: "sb=1" }));
    const b = claveLimiteDePeticion(cab({ cookie: "sb=2" }));
    expect(a).not.toBe(b);
    expect(claveLimiteDePeticion(cab({ "x-forwarded-for": "1.2.3.4" }))).not.toBe(claveLimiteDePeticion(cab({})));
  });
});
