import { describe, it, expect, vi, afterEach } from "vitest";
import {
  claveCache,
  leerCache,
  guardarCache,
  CACHE_MAX_ENTRADAS,
  CACHE_TTL_MS,
} from "@/ai/astraura/cache-respuestas";

describe("cache-respuestas (Ola 223)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("genera una clave estable e idéntica para los mismos parámetros", () => {
    const msgs = [{ role: "user", content: "hola" }];
    const a = claveCache(msgs, "modelo-x", 0.2);
    const b = claveCache([{ role: "user", content: "hola" }], "modelo-x", 0.2);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });

  it("distingue claves distintas (mensajes, modelo o temperatura)", () => {
    const base = claveCache([{ role: "user", content: "hola" }], "m", 0.2);
    expect(claveCache([{ role: "user", content: "adiós" }], "m", 0.2)).not.toBe(base);
    expect(claveCache([{ role: "user", content: "hola" }], "otro", 0.2)).not.toBe(base);
    expect(claveCache([{ role: "user", content: "hola" }], "m", 0.3)).not.toBe(base);
  });

  // (Ola 223 · I4F) Revisión: la clave incluye ámbito de sesión/usuario — dos
  // sesiones con el mismo prompt NO comparten respuesta.
  it("el ámbito de sesión separa las claves del mismo prompt", () => {
    const msgs = [{ role: "user", content: "hola" }];
    const a = claveCache(msgs, "m", 0.2, "chat-1");
    const b = claveCache(msgs, "m", 0.2, "chat-2");
    expect(a).not.toBe(b);
    guardarCache(a, "respuesta-sesion-a");
    expect(leerCache(b)).toBeNull();
    expect(leerCache(a)).toBe("respuesta-sesion-a");
  });

  // (Ola 223 · I4F) Hash doble (~64 bits hex) para reducir colisiones djb2.
  it("genera claves de doble hash (16 hex)", () => {
    expect(claveCache([{ role: "user", content: "x" }], "m", 0.1)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("lee lo guardado y expira tras el TTL", () => {
    vi.useFakeTimers();
    const clave = claveCache([{ role: "user", content: "q" }], "m", 0.1);
    guardarCache(clave, "respuesta");
    expect(leerCache(clave)).toBe("respuesta");
    vi.advanceTimersByTime(CACHE_TTL_MS + 1000);
    expect(leerCache(clave)).toBeNull();
  });

  it("no cachea respuestas vacías", () => {
    const clave = claveCache([{ role: "user", content: "v" }], "m", 0.1);
    guardarCache(clave, "");
    guardarCache(clave, "   ");
    expect(leerCache(clave)).toBeNull();
  });

  it("respeta el límite LRU expulsando la entrada menos reciente", () => {
    const primeras: string[] = [];
    for (let i = 0; i < CACHE_MAX_ENTRADAS + 5; i++) {
      const clave = claveCache([{ role: "user", content: `m-${i}` }], "m", 0.1);
      if (i === 0) primeras.push(clave);
      guardarCache(clave, `r-${i}`);
    }
    // La primera entrada fue expulsada al superar el máximo.
    expect(leerCache(primeras[0])).toBeNull();
    const ultima = claveCache([{ role: "user", content: `m-${CACHE_MAX_ENTRADAS + 4}` }], "m", 0.1);
    expect(leerCache(ultima)).toBe(`r-${CACHE_MAX_ENTRADAS + 4}`);
  });

  it("una lectura refresca la entrada en el orden LRU", () => {
    vi.useFakeTimers();
    const claveA = claveCache([{ role: "user", content: "LRU-A" }], "m", 0.1);
    guardarCache(claveA, "A");
    // Llena la caché con más entradas.
    for (let i = 0; i < CACHE_MAX_ENTRADAS - 1; i++) {
      guardarCache(claveCache([{ role: "user", content: `LRU-extra-${i}` }], "m", 0.1), "x");
    }
    // Leer A la hace "reciente": la siguiente inserción NO debe expulsarla.
    expect(leerCache(claveA)).toBe("A");
    guardarCache(claveCache([{ role: "user", content: "LRU-final" }], "m", 0.1), "z");
    expect(leerCache(claveA)).toBe("A");
  });
});
