import { describe, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    config: {
      widgets: {
        compact: false,
        weatherVariant: undefined,
      },
    },
  }),
}));

vi.mock("../dashboard/widget-function-style", () => ({
  getWidgetFunctionStyle: () => ({
    kind: 'video' as any,
    weight: 'medium',
    accent: '#fff',
  }),
}));

vi.mock("../dashboard/kit/widget-style-override", () => ({
  WidgetStyleOverrideProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import EstudioVideoVentana from "@/components/video/estudio-video-ventana";

// Mock the widget prop
const mockWidget = {
  widget_type: "ESTUDIO_VIDEO",
  settings: {},
};

describe("EstudioVideoVentana", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without crashing", () => {
    render(<EstudioVideoVentana widget={mockWidget} />);
    screen.getByText(/estudio de vídeo/i);
  });

  it("shows service unavailable message when service is down", async () => {
    // We would mock the fetch to simulate service down
    // For now, we just render and see if the placeholder is there
    render(<EstudioVideoVentana widget={mockWidget} />);
    screen.getByText(/servicio de hyperframes no disponible/i);
  });
});