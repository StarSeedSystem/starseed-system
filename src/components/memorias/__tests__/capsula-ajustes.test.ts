import { describe, it, expect } from "vitest";
import { formateaBytes } from "../capsula-ajustes";

describe("formateaBytes", () => {
  it("0 B", () => {
    expect(formateaBytes(0)).toBe("0 B");
  });
  it("bytes", () => {
    expect(formateaBytes(512)).toBe("512 B");
  });
  it("KB", () => {
    expect(formateaBytes(2048)).toBe("2.0 KB");
  });
  it("MB", () => {
    expect(formateaBytes(1048576)).toBe("1.0 MB");
  });
});
