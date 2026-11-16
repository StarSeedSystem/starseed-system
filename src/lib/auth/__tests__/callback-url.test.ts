import { describe, expect, it } from "vitest";
import { buildErrorRedirect, buildSuccessRedirect } from "@/lib/auth/callback-url";

describe("callback-url", () => {
  it("construye redirección de éxito", () => {
    expect(buildSuccessRedirect("http://localhost:9002", "/escritorios")).toBe("http://localhost:9002/escritorios");
    expect(buildSuccessRedirect("https://starseed-os.vercel.app", "/perfil")).toBe("https://starseed-os.vercel.app/perfil");
  });

  it("construye redirección de error al login", () => {
    expect(buildErrorRedirect("http://localhost:9002")).toBe("http://localhost:9002/login?error=auth-callback");
    expect(buildErrorRedirect("https://starseed-os.vercel.app")).toBe("https://starseed-os.vercel.app/login?error=auth-callback");
  });
});
