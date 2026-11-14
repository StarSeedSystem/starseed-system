// @vitest-environment jsdom
/**
 * MAP1114C — el mapa del Hub NO cambia cuando no se le pasa `extension`:
 * misma clave de vista guardada, mismas opciones de `L.map`, sin sección de Señales ni vigilancia de posición propia.
 * Y con `extension`, usa su clave aparte, añade su sección y no toca la del Hub.
 */
import React from "react";
import { cleanup, render, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registro = vi.hoisted(() => ({ mapas: [] as Array<{ opts: any }>, deseosDeVista: [] as string[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => {
  const N = () => null;
  return { Dialog: N, DialogContent: N, DialogHeader: N, DialogTitle: N, DialogDescription: N, DialogFooter: N, DialogTrigger: N };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/os-social", () => ({ getCurrentUserId: async () => "u1" }));
vi.mock("@/lib/social/os-profiles", () => ({ fetchMyProfile: async () => null, searchUsers: async () => [], searchGroups: async () => [] }));
vi.mock("@/lib/sync/entity-state", () => ({ deviceId: () => "d1" }));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => undefined }));
vi.mock("@/lib/map/map-data", () => ({
  MAP_PROPOSAL_KIND: "map_zone", APPROVED_STATUSES: [], ZONE_KINDS: [],
  fetchGeoPosts: async () => [], fetchGeoEvents: async () => [], fetchGeoPlaces: async () => [], fetchMapProposals: async () => [],
  createGeoQuickPost: async () => ({ ok: false }), createZoneProposal: async () => ({ ok: false }), geoPostHref: () => "#",
}));

function falso(): any {
  const fn: any = new Proxy(function () { /* */ }, {
    get: (_t, k) => (k === "then" ? undefined : k === "getZoom" ? () => 15 : k === "getCenter" ? () => ({ lat: 1, lng: 2 }) : k === "getSize" ? () => ({ x: 800, y: 600 }) : k === "getBounds" ? () => ({ getNorth: () => 1, getSouth: () => 0, getEast: () => 1, getWest: () => 0 }) : fn),
    apply: () => fn,
  });
  return fn;
}
vi.mock("@/lib/map/leaflet-loader", () => ({
  loadLeaflet: async () => {
    const L: any = new Proxy({}, {
      get: (_t, k) => {
        if (k === "then") return undefined;
        if (k === "map") return (_el: unknown, opts: unknown) => { registro.mapas.push({ opts }); return falso(); };
        return falso();
      },
    });
    return L;
  },
}));

import { MapView } from "../map-view";
import type { MapViewExtension } from "../map-view-extension";

const geoWatch = vi.fn(() => 1);

beforeEach(() => {
  localStorage.clear();
  registro.mapas.length = 0;
  geoWatch.mockClear();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition: geoWatch, clearWatch: vi.fn(), getCurrentPosition: vi.fn() } });
  (navigator as any).permissions = { query: async () => ({ state: "prompt", addEventListener() {}, removeEventListener() {} }) };
});
afterEach(() => cleanup());

describe("MapView sin extensión (Hub)", () => {
  it("crea el mapa con las mismas opciones, sin sección de Señales y sin vigilar la posición", async () => {
    const { container, queryByText } = render(<MapView />);
    await waitFor(() => expect(registro.mapas.length).toBe(1));
    expect(registro.mapas[0].opts).toMatchObject({ zoomControl: false, attributionControl: true, worldCopyJump: true });
    expect(queryByText(/Señales de mi cuenta/i)).toBeNull();
    expect(container.querySelector("[data-testid='pie-mapa']")).toBeNull();
    expect(geoWatch).not.toHaveBeenCalled();
  });

  it("conserva el enlace ?lat=&lng=&zoom= del Hub", async () => {
    window.history.replaceState({}, "", "/hub?lat=10&lng=20&zoom=7");
    render(<MapView />);
    await waitFor(() => expect(registro.mapas.length).toBe(1));
    const o = registro.mapas[0].opts;
    expect([o.center[0], o.center[1], o.zoom]).toEqual([10, 20, 7]);
    window.history.replaceState({}, "", "/");
  });

  it("la clave de vista por defecto sigue siendo la del Hub y la de Señales es otra", async () => {
    const { loadMapView, saveMapView, MAP_VIEW_KEY } = await import("@/lib/map/map-config");
    expect(MAP_VIEW_KEY).toBe("starseed.map.view.v1");
    const v = { ...loadMapView(), lat: 11, lng: 22, zoom: 9 };
    saveMapView(v);
    expect(localStorage.getItem("starseed.map.view.v1")).toContain("\"lat\":11");
    expect(localStorage.getItem("starseed.senales.mapa.view.v1")).toBeNull();
    saveMapView({ ...v, lat: 33 }, "starseed.senales.mapa.view.v1");
    expect(loadMapView().lat).toBe(11);
    expect(loadMapView("starseed.senales.mapa.view.v1").lat).toBe(33);
  });
});

describe("MapView con extensión (Señales)", () => {
  const ext: MapViewExtension = {
    viewKey: "starseed.senales.mapa.view.v1",
    seccionCapas: () => <div>SECCION-SENALES-PRUEBA</div>,
    superposicion: () => <div data-testid="sup-senales" />,
  };

  it("lee su propia vista, no la del Hub, y monta su superposición", async () => {
    localStorage.setItem("starseed.map.view.v1", JSON.stringify({ lat: 10, lng: 20, zoom: 7, base: "osm", layers: [], weather: [], dataLayers: [] }));
    localStorage.setItem("starseed.senales.mapa.view.v1", JSON.stringify({ lat: 19.4326, lng: -99.1332, zoom: 17, base: "osm", layers: [], weather: [], dataLayers: [] }));
    const { getByTestId } = render(<MapView extension={ext} />);
    await waitFor(() => expect(registro.mapas.length).toBe(1));
    const o = registro.mapas[0].opts;
    expect([o.center[0], o.center[1], o.zoom]).toEqual([19.4326, -99.1332, 17]);
    expect(getByTestId("sup-senales")).toBeTruthy();
  });

  it("vigilarPosicion=true arranca la vigilancia de posición del propio mapa", async () => {
    render(<MapView extension={{ ...ext, vigilarPosicion: true }} />);
    await waitFor(() => expect(geoWatch).toHaveBeenCalled());
  });
});
