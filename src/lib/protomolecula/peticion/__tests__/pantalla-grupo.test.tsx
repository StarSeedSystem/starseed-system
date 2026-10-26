// @vitest-environment jsdom
/**
 * La página de un grupo anuncia a la ventana de la Protomolécula qué enseña: la entidad es el grupo y el gobierno que
 * manda es el del propio grupo. Se monta en estado «cargando» (solo esqueletos): el anuncio no depende del resto.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  grupo: null as null | { slug: string; name: string; kind: string },
  cargando: true,
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "semilla" }), notFound: () => { throw new Error("404"); }, usePathname: () => "/grupo/semilla" }));
vi.mock("@/hooks/use-os-entities", () => ({
  useOsEntity: () => ({ data: m.grupo, loading: m.cargando, usingFallback: false, refetch: vi.fn() }),
  useOsPosts: () => ({ data: [], loading: false }),
  useOsPostCount: () => 0,
  useMembership: () => ({ isMember: false }),
  useEntityOwner: () => ({ isOwner: false }),
}));
vi.mock("@/lib/entity-layout", async (orig) => ({
  ...(await orig<object>()),
  useEntityLayout: () => ({ layout: { accent: "", coverUrl: "", tabs: [], sections: [], integrations: {}, gallery: [] } }),
}));
vi.mock("@/lib/design/entity-theme-scope", () => ({ useEntityThemeScope: () => undefined }));

import { leerContexto, reiniciarContexto } from "../contexto";
import GrupoPage from "@/app/(app)/grupo/[slug]/page";

beforeEach(() => { reiniciarContexto(); m.cargando = true; m.grupo = null; window.history.pushState({}, "", "/grupo/semilla"); });
afterEach(() => { cleanup(); reiniciarContexto(); });

describe("/grupo/[slug] anuncia su contexto", () => {
  it("el grupo es la entidad y también el gobierno que manda, en ámbito de grupo", async () => {
    m.grupo = { slug: "semilla", name: "Semilla", kind: "colectivo" };
    render(<GrupoPage />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const c = leerContexto();
    expect(c.entidad).toEqual({ tipo: "grupo", id: "semilla", nombre: "Semilla" });
    expect(c.gobernadaPor).toEqual({ tipo: "grupo", id: "semilla", nombre: "Semilla" });
    expect(c.ambito).toBe("grupo");
  });

  it("sin grupo cargado todavía solo vale lo que dice la ruta (sin nombre), y no lanza", async () => {
    render(<GrupoPage />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const c = leerContexto();
    expect(c.entidad).toEqual({ tipo: "grupo", id: "semilla" });
    expect(c.ambito).toBe("grupo");
  });

  it("al salir de la pantalla retira el nombre anunciado", async () => {
    m.grupo = { slug: "semilla", name: "Semilla", kind: "colectivo" };
    render(<GrupoPage />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(leerContexto().entidad?.nombre).toBe("Semilla");
    cleanup();
    expect(leerContexto().entidad?.nombre).toBeUndefined();
  });
});
