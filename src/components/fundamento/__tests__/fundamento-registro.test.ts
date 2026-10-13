import { describe, it, expect } from "vitest";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { STARSEED_CORE_REPO } from "@/lib/library/packages";

describe("Fundamento de StarSeed registration", () => {
  it("should be in the app catalog", () => {
    const fundamentoApp = APP_CATALOG.find((app) => app.id === "fundamento");
    expect(fundamentoApp).toBeDefined();
    expect(fundamentoApp?.open.route).toBe("/fundamento");
  });

  it("should be in the library packages", () => {
    const fundamentoPackage = STARSEED_CORE_REPO.packages.find(
      (pkg) => pkg.id === "app-fundamento"
    );
    expect(fundamentoPackage).toBeDefined();
    expect(fundamentoPackage?.payload.route).toBe("/fundamento");
  });
});