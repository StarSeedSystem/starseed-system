import { expect, test } from "vitest";
import { resumirFallos } from "../astraura/router";

test("resumirFallos should classify 401 errors as 'necesita sesión iniciada'", () => {
  const failovers = [
    { sourceId: "openrouter", error: "401 Unauthorized" },
    { sourceId: "another", error: "Session expired" },
  ];
  const result = resumirFallos(failovers);
  expect(result).toContain("openrouter: necesita sesión iniciada");
  expect(result).toContain("another: necesita sesión iniciada");
});

test("resumirFallos should classify 429/quota errors as 'sin cupo ahora mismo'", () => {
  const failovers = [
    { sourceId: "openrouter", error: "429 Too Many Requests" },
    { sourceId: "nvidia", error: "Quota exceeded" },
    { sourceId: "aihubmix", error: "cuota agotada" },
  ];
  const result = resumirFallos(failovers);
  expect(result).toContain("openrouter: sin cupo ahora mismo");
  expect(result).toContain("nvidia: sin cupo ahora mismo");
  expect(result).toContain("aihubmix: sin cupo ahora mismo");
});

test("resumirFallos should classify 400+model errors as 'el modelo ya no existe en el catálogo'", () => {
  const failovers = [
    { sourceId: "openai", error: "400 Bad Request: model not found" },
    { sourceId: "anthropic", error: "Bad Request: model does not exist" },
  ];
  const result = resumirFallos(failovers);
  expect(result).toContain("openai: el modelo ya no existe en el catálogo");
  expect(result).toContain("anthropic: el modelo ya no existe en el catálogo");
});

test("resumirFallos should classify timeout/abort errors as 'no contestó a tiempo'", () => {
  const failovers = [
    { sourceId: "llama", error: "timeout" },
    { sourceId: "mistral", error: "abort" },
    { sourceId: "codellama", error: "no respondió" },
  ];
  const result = resumirFallos(failovers);
  expect(result).toContain("llama: no contestó a tiempo");
  expect(result).toContain("mistral: no contestó a tiempo");
  expect(result).toContain("codellama: no contestó a tiempo");
});

test("resumirFallos should use original error message if no classification matches", () => {
  const failovers = [
    { sourceId: "custom", error: "Connection refused" },
    { sourceId: "unknown", error: "Some other error" },
  ];
  const result = resumirFallos(failovers);
  expect(result).toContain("custom: Connection refused");
  expect(result).toContain("unknown: Some other error");
});

test("resumirFallos should truncate long error messages", () => {
  const longError = "A".repeat(200);
  const failovers = [
    { sourceId: "long", error: longError },
  ];
  const result = resumirFallos(failovers);
  expect(result[0]).toContain("...");
  expect(result[0].length).toBeLessThan(longError.length);
});

test("resumirFallos should not duplicate the same source", () => {
  const failovers = [
    { sourceId: "same", error: "error 1" },
    { sourceId: "same", error: "error 2" },
  ];
  const result = resumirFallos(failovers);
  expect(result.length).toBe(1);
  expect(result[0]).toContain("same: error 1");
});

test("resumirFallos should handle mixed error types correctly", () => {
  const failovers = [
    { sourceId: "auth", error: "401 Unauthorized" },
    { sourceId: "quota", error: "429 Too Many Requests" },
    { sourceId: "model", error: "400 Bad Request: model not found" },
    { sourceId: "timeout", error: "timeout" },
    { sourceId: "other", error: "Some other error" },
  ];
  const result = resumirFallos(failovers);
  expect(result).toContain("auth: necesita sesión iniciada");
  expect(result).toContain("quota: sin cupo ahora mismo");
  expect(result).toContain("model: el modelo ya no existe en el catálogo");
  expect(result).toContain("timeout: no contestó a tiempo");
  expect(result).toContain("other: Some other error");
});