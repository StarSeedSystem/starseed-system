import { describe, it, expect } from "vitest";

import {
  crearTesela,
  fusionarTesela,
  fusionarTodas,
  caducar,
  senalesDeReticula,
  huellaReticula,
} from "../teselas";
import type { NeuronaReticula, SenalMedida } from "../tipos";

describe("teselas (CRDT)", () => {
  describe("crearTesela", () => {
    it("should create a tesela with given data", () => {
      // TODO
    });
  });

  describe("fusionarTesela", () => {
    it("should merge a tesela into an empty reticula", () => {
      // TODO
    });
  });

  describe("fusionarTodas", () => {
    it("should merge multiple teselas", () => {
      // TODO
    });
  });

  describe("caducar", () => {
    it("should remove expired teselas", () => {
      // TODO
    });
  });

  describe("senalesDeReticula", () => {
    it("should combine signals by claveSenal taking the worse", () => {
      // TODO
    });
  });

  describe("huellaReticula", () => {
    it("should compute FNV-1a 64-bit hash", () => {
      // TODO
    });
  });
});