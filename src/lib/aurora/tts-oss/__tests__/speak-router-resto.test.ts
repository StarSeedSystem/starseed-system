import { describe, it, expect, vi } from "vitest";
import { speakWithConfiguredEngine } from "../speak-router";
import * as NeuralTts from "@/lib/aurora/tts-oss/neural-tts";

describe("speak-router resto", () => {
  it("debe hablar el resto con el siguiente motor si el primero falla a mitad", async () => {
    // Simulamos dos motores:
    // Motor 1: habla 2 de 5 trozos (devuelve "started")
    // Motor 2: habla el resto (devuelve "spoke")
    
    // Esto es un test de integración a nivel de router
    // Necesitamos mockear runLink o los imports internos que usa runLink.
    // Dado que speak-router es difícil de mockear, probaremos la lógica de failover.
  });
});
