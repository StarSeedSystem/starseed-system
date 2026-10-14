import { describe, it, expect } from "vitest";
import { APP_CATALOG, APP_COLLECTIONS } from "@/components/dashboard/apps/app-catalog";
import { STARSEED_CORE_REPO } from "@/lib/library/packages";

describe("Fundamento de StarSeed registration", () => {
  it("is in the app catalog", () => {
    const fundamentoApp = APP_CATALOG.find((app) => app.id === "fundamento");
    expect(fundamentoApp).toBeDefined();
    expect(fundamentoApp?.open?.route).toBe("/fundamento");
  });

  it("is in the starseed collection", () => {
    expect(APP_COLLECTIONS.starseed).toContain("fundamento");
  });

  it("is in the library as an app package", () => {
    const fundamentoPackage = STARSEED_CORE_REPO.packages.find(
      (pkg) => pkg.id === "app-fundamento" && pkg.kind === "app"
    );
    expect(fundamentoPackage).toBeDefined();
    expect(fundamentoPackage?.payload.route).toBe("/fundamento");
  });
});