/**
 * Test de `destinoEsLocal` (Ola 278 · OS4).
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo prueba la función pura de detección de destino de neurona local: distingue
 * la neurona local de Astraura 1.58-bit (`127.0.0.1` / `localhost` / `[::1]`) de
 * la nube y de cualquier host remoto. No importa el route ni parchea módulos de
 * Node (en este repo esos tests fallan), por eso vive en un módulo importable.
 */

import { describe, it, expect } from "vitest";
import { destinoEsLocal } from "@/lib/astraura/destino-local";

describe("destinoEsLocal", () => {
  it("identifica la neurona local por IPv4 de loopback", () => {
    expect(destinoEsLocal("http://127.0.0.1:8000")).toBe(true);
  });

  it("identifica la neurona local por nombre localhost", () => {
    expect(destinoEsLocal("http://localhost:8000")).toBe(true);
  });

  it("identifica la neurona local por IPv6 de loopback", () => {
    expect(destinoEsLocal("http://[::1]:8000")).toBe(true);
  });

  it("NO identifica la nube desplegada como local", () => {
    expect(destinoEsLocal("https://astraura.vercel.app")).toBe(false);
  });

  it("NO identifica una IP de la LAN como local", () => {
    expect(destinoEsLocal("http://192.168.1.40:8000")).toBe(false);
  });
});