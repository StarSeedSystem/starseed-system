"use client";

/**
 * FIX1114A — una prueba que deja trabajo vivo pone en rojo una tanda verde.
 *
 * QUÉ: `NeuronVoiceChoice` lanza `probeLocalDaemon()` al montarse y, cuando resuelve, llama a
 * `setLocalVivo`. Si la prueba no desmonta el árbol, esa promesa resuelve cuando jsdom ya no está
 * (`window is not defined` en `resolveUpdatePriority`) y vitest sale con 1 aunque todos los
 * archivos estén en verde («Unhandled Errors»). Visto en la Mac (13-11) y en la CI de main (14-11).
 * CÓMO SE PRUEBA SIN DEPENDER DE LA CARGA: el sondeo se sustituye por uno que resuelve cuando la
 * prueba lo ordena, y `afterAll` simula el desmontaje del entorno (quita `window`) ANTES de
 * resolverlo. Sin el `afterEach(cleanup)` de `vitest.setup-dom.ts` el árbol sigue montado y la
 * resolución cae como error no capturado; con él, `alive` ya vale false y no pasa nada.
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";

const sondeo = vi.hoisted(() => ({ resolver: null as null | ((v: boolean) => void) }));

vi.mock("@/lib/aurora/tts-oss/neuron-voice-constants", async (orig) => {
  const m = await orig<typeof import("@/lib/aurora/tts-oss/neuron-voice-constants")>();
  return {
    ...m,
    probeLocalDaemon: () => new Promise<boolean>((r) => { sondeo.resolver = r; }),
  };
});

import { NeuronVoiceChoice } from "@/components/settings/aurora/neuron-voice-choice";

describe("NeuronVoiceChoice — nada vivo al acabar la prueba", () => {
  it("monta la tarjeta con el sondeo local pendiente y NO la desmonta a mano", () => {
    render(
      <AppearanceProvider>
        <NeuronVoiceChoice />
      </AppearanceProvider>,
    );
    expect(sondeo.resolver).not.toBeNull();
  });

  it("la prueba anterior no dejó el árbol montado en el documento", () => {
    expect(document.body.querySelector("[class*='emerald']")).toBeNull();
  });

  afterAll(async () => {
    // Simula la caída de jsdom al terminar el archivo y resuelve el sondeo después.
    delete (globalThis as { window?: unknown }).window;
    sondeo.resolver?.(true);
    await new Promise((r) => setTimeout(r, 20));
  });
});
