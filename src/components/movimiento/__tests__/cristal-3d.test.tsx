import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { Cristal3D } from "../cristal-3d";

beforeAll(() => {
  if (typeof window !== "undefined") {
    ;(window as any).matchMedia = (query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
});

describe("Cristal3D", () => {
  it("renders without crashing", () => {
    const { unmount } = render(<Cristal3D />);
    expect(unmount).toBeDefined();
    unmount();
  });
});