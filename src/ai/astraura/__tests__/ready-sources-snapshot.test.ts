/**
 * ready-sources-snapshot (Ola 368): módulo puro sin dependencias — publica y
 * lee el snapshot barato de "qué fuentes están listas ahora" que alimenta
 * `fuentesServibles` en la ficha de la malla de neuronas, sin sondear nada.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  fuentesListasSnapshot,
  publicarFuentesListas,
  reiniciarFuentesListasSnapshotParaTests,
} from "@/ai/astraura/ready-sources-snapshot";

describe("ready-sources-snapshot", () => {
  beforeEach(() => reiniciarFuentesListasSnapshotParaTests());

  it("empieza vacío", () => {
    expect(fuentesListasSnapshot()).toEqual({ ids: [], at: 0 });
  });

  it("publica y deduplica ids, con marca de tiempo", () => {
    publicarFuentesListas(["ollama-local", "groq", "ollama-local"]);
    const snap = fuentesListasSnapshot();
    expect(snap.ids.sort()).toEqual(["groq", "ollama-local"]);
    expect(snap.at).toBeGreaterThan(0);
  });

  it("una publicación posterior reemplaza a la anterior por completo", () => {
    publicarFuentesListas(["a", "b"]);
    publicarFuentesListas(["c"]);
    expect(fuentesListasSnapshot().ids).toEqual(["c"]);
  });
});
