import { describe, it, expect } from "vitest";
import {
  classifyError,
  formatErrorMessage,
  getSeverityColor,
  getContextIcon,
  type ClassifiedError,
  type ErrorSeverity,
  type ErrorContext,
} from "../error-utils";

describe("classifyError", () => {
  it("clasifica errores de red correctamente", () => {
    const result = classifyError(new Error("Network error: failed to fetch"));
    expect(result.context).toBe("network");
    expect(result.severity).toBe("error");
    expect(result.recoverable).toBe(true);
    expect(result.suggestedAction).toContain("conexión");
  });

  it("clasifica errores de validación correctamente", () => {
    const result = classifyError(new Error("Formato inválido: email requerido"));
    expect(result.context).toBe("validation");
    expect(result.severity).toBe("warning");
    expect(result.recoverable).toBe(true);
    expect(result.suggestedAction).toContain("Corrige");
  });

  it("clasifica errores de permiso correctamente", () => {
    const result = classifyError(new Error("Permission denied: acceso denegado"));
    expect(result.context).toBe("permission");
    expect(result.severity).toBe("error");
    expect(result.suggestedAction).toContain("permisos");
  });

  it("clasifica errores de servidor correctamente", () => {
    const result = classifyError(new Error("Server error 503: servicio no disponible"));
    expect(result.context).toBe("server");
    expect(result.severity).toBe("error");
    expect(result.suggestedAction).toContain("temporalmente");
  });

  it("clasifica errores desconocidos con valores por defecto", () => {
    const result = classifyError(new Error("Algo salió mal"));
    expect(result.context).toBe("unknown");
    expect(result.severity).toBe("error");
    expect(result.recoverable).toBe(true);
    expect(result.suggestedAction).toBeUndefined();
  });

  it("maneja errores sin mensaje (string vacío)", () => {
    const result = classifyError("");
    expect(result.context).toBe("unknown");
    expect(result.message).toBe("Error desconocido");
  });

  it("maneja valores no Error", () => {
    const result = classifyError("Error de red: timeout");
    expect(result.context).toBe("network");
    expect(result.message).toBe("Error de red: timeout");
  });
});

describe("formatErrorMessage", () => {
  it("formatea mensaje simple sin acción", () => {
    const result = formatErrorMessage(new Error("Error de prueba"));
    expect(result).toBe("Error de prueba");
  });

  it("incluye acción sugerida cuando se pide", () => {
    const result = formatErrorMessage(new Error("Network error: failed to fetch"), { includeAction: true });
    expect(result).toContain("Network error");
    expect(result).toContain("→");
    expect(result).toContain("conexión");
  });

  it("funciona con strings planos", () => {
    const result = formatErrorMessage("Validación fallida", { includeAction: true });
    expect(result).toContain("Validación fallida");
    expect(result).toContain("Corrige");
  });
});

describe("getSeverityColor", () => {
  it("devuelve colores correctos para cada severidad", () => {
    expect(getSeverityColor("error")).toBe("trinity-crimson");
    expect(getSeverityColor("warning")).toBe("trinity-amber");
    expect(getSeverityColor("success")).toBe("trinity-emerald");
    expect(getSeverityColor("info")).toBe("trinity-cyan");
  });
});

describe("getContextIcon", () => {
  it("devuelve iconos correctos para cada contexto", () => {
    expect(getContextIcon("network")).toBe("📡");
    expect(getContextIcon("validation")).toBe("✏️");
    expect(getContextIcon("permission")).toBe("🔒");
    expect(getContextIcon("server")).toBe("🖥️");
    expect(getContextIcon("unknown")).toBe("❓");
  });
});

describe("ClassifiedError type", () => {
  it("tiene todas las propiedades requeridas", () => {
    const error: ClassifiedError = {
      severity: "error",
      context: "network",
      title: "Error",
      message: "Test",
      recoverable: true,
      suggestedAction: "Reintentar",
    };
    expect(error.severity).toBe("error");
    expect(error.context).toBe("network");
    expect(error.title).toBe("Error");
    expect(error.message).toBe("Test");
    expect(error.recoverable).toBe(true);
    expect(error.suggestedAction).toBe("Reintentar");
  });

  it("suggestedAction es opcional", () => {
    const error: ClassifiedError = {
      severity: "warning",
      context: "validation",
      title: "Aviso",
      message: "Test",
      recoverable: true,
    };
    expect(error.suggestedAction).toBeUndefined();
  });
});