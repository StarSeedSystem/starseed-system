import { describe, it, expect } from "vitest";
import { isSafeHttpUrl, safeHttpUrl } from "@/lib/library/url-utils";

// Helper isSafeHttpUrl (SP092920): solo http(s) y rutas internas "/…"
// pasan; javascript:, data: y evasiones con caracteres de control, no.

describe("isSafeHttpUrl", () => {
  it("acepta URLs http y https absolutas", () => {
    expect(isSafeHttpUrl("https://starseed-os.vercel.app")).toBe(true);
    expect(isSafeHttpUrl("http://127.0.0.1:9002/mando")).toBe(true);
  });

  it("acepta rutas internas del OS", () => {
    expect(isSafeHttpUrl("/library?tab=explorar")).toBe(true);
    expect(isSafeHttpUrl("/pagina/abc")).toBe(true);
  });

  it("rechaza esquemas ejecutables y demás protocolos", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("JavaScript:alert(1)")).toBe(false);
  });

  it("neutraliza evasiones con espacios, control y protocolo-relativo", () => {
    // El parser ignora \t/\n: sin esta puerta "jav\tascript:" colaría.
    expect(isSafeHttpUrl("jav\tascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("//evil.com")).toBe(false);
    expect(isSafeHttpUrl(" https://con-espacios.com ")).toBe(true);
  });

  it("rechaza la barra invertida que el navegador lee como protocolo-relativo", () => {
    expect(isSafeHttpUrl("/\\evil.com")).toBe(false);
    expect(isSafeHttpUrl("/\\\\evil.com/x")).toBe(false);
    expect(isSafeHttpUrl("/biblioteca/archivo")).toBe(true);
  });

  it("rechaza vacíos, anclas y relativos sin barra inicial", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("   ")).toBe(false);
    expect(isSafeHttpUrl("#")).toBe(false);
    expect(isSafeHttpUrl("library")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
  });
});

describe("safeHttpUrl", () => {
  it("devuelve la URL recortada cuando es segura", () => {
    expect(safeHttpUrl("  https://ejemplo.com  ")).toBe("https://ejemplo.com");
    expect(safeHttpUrl("/library")).toBe("/library");
  });

  it("devuelve undefined para todo lo que no se pueda abrir", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("#")).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
  });
});
