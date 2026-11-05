/**
 * GUI1021G · Las tarjetas de la Guía de la red usan la fuente única de textos.
 * Cada ruta nueva abre su explicación (cuerpo, puntos y pregunta a Aurora) y
 * ninguna tarjeta habla de «varios cerebros».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
import {
  AreasExplicadas,
  TEMA_POR_RUTA,
  explicacionDe,
} from "../areas-explicadas";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";

afterEach(() => cleanup());

type AreaTip = {
  path: string;
  label: string;
  icon: typeof Sparkles;
  tip: string;
  accent: string;
};

const area = (path: string, label: string): AreaTip => ({
  path,
  label,
  icon: Sparkles,
  tip: "tip de prueba",
  accent: "text-cyan-300",
});

const temaDe = (ruta: string) =>
  TODOS_LOS_TEMAS.find((t) => t.key === TEMA_POR_RUTA[ruta]);

const RUTAS: Array<[string, string]> = [
  ["/protomolecula", "Protomolécula"],
  ["/network/politics", "Política"],
  ["/network/education", "Educación"],
  ["/network/culture", "Cultura"],
  ["/genesis", "Genesis"],
  ["/cerebro", "Cerebro"],
];

const AREAS: AreaTip[] = [
  { path: "/agent", label: "Agente · Aurora", icon: Sparkles, accent: "text-fuchsia-300", tip: "Usar: configura tu IA y habla con Aurora por voz o texto." },
  { path: "/protomolecula", label: "Protomolécula", icon: Sparkles, accent: "text-purple-300", tip: "Crear: imagen, audio, vídeo y 3D en moléculas vivas de átomos." },
  { path: "/memorias", label: "Memorias", icon: Sparkles, accent: "text-amber-300", tip: "Crear: guarda notas, ideas y archivos; vincúlalos en baúles." },
  { path: "/cerebro", label: "Cerebro", icon: Sparkles, accent: "text-cyan-300", tip: "Conectar: un cerebro por cuenta con memorias, neuronas y permisos." },
  { path: "/decisiones", label: "Decisiones", icon: Sparkles, accent: "text-emerald-300", tip: "Publicar: propón y vota decisiones de la red." },
  { path: "/network/politics", label: "Política", icon: Sparkles, accent: "text-blue-300", tip: "Publicar: propón, debate con enmiendas y vota con voto líquido." },
  { path: "/network/education", label: "Educación", icon: Sparkles, accent: "text-teal-300", tip: "Aprender: mapa del conocimiento, estudio con Aurora e insignias." },
  { path: "/network/culture", label: "Cultura", icon: Sparkles, accent: "text-violet-300", tip: "Crear: publica, mira el directo, agenda y entra al Multiverso." },
  { path: "/pizarra", label: "Pizarra", icon: Sparkles, accent: "text-violet-300", tip: "Crear: dibuja y co-crea ideas en un lienzo compartido." },
  { path: "/navegador", label: "Navegador", icon: Sparkles, accent: "text-sky-300", tip: "Usar: explora la red y descubre contenidos y nodos." },
  { path: "/conexiones", label: "Conexiones", icon: Sparkles, accent: "text-pink-300", tip: "Vincular: enlaza personas, grupos y servicios externos." },
  { path: "/correos", label: "Correos · @star.seed", icon: Sparkles, accent: "text-indigo-300", tip: "Usar: tu correo interno @star.seed y vincula correos externos (DNS/sync)." },
  { path: "/seguridad", label: "Seguridad", icon: Sparkles, accent: "text-rose-300", tip: "Usar: gestiona claves, recuperación y privacidad." },
  { path: "/library", label: "Librería y Biblioteca", icon: Sparkles, accent: "text-yellow-300", tip: "Crear: catálogo de la red; tu Biblioteca guarda referencias, no copias." },
  { path: "/genesis", label: "Genesis · PoliGenesis", icon: Sparkles, accent: "text-fuchsia-300", tip: "Usar: pide cambios con tus palabras y ve la propuesta antes." },
  { path: "/hub", label: "Hub · Comunidades", icon: Sparkles, accent: "text-teal-300", tip: "Conectar: únete a comunidades y nodos territoriales (Sanghas)." },
  { path: "/crear", label: "Crear · Lienzo Universal", icon: Sparkles, accent: "text-lime-300", tip: "Crear: publica entidades únicas que se referencian, no se duplican." },
  { path: "/profile", label: "Perfil", icon: Sparkles, accent: "text-orange-300", tip: "Usar: tus facetas públicas (cívica, artística, profesional) de la cuenta." },
  { path: "/escritorios", label: "Escritorios", icon: Sparkles, accent: "text-purple-300", tip: "Usar: tu espacio principal con widgets, apps y el OmniDock." },
  { path: "/red-mesh", label: "Redes mesh", icon: Sparkles, accent: "text-red-300", tip: "Conectar: tus aparatos forman una malla, con o sin internet." },
];

describe("Guía de la red · tarjetas con los temas nuevos (GUI1021G)", () => {
  it("cada ruta nueva está en AREAS con icono y tip", () => {
    for (const [ruta] of RUTAS) {
      const tarjeta = AREAS.find((a) => a.path === ruta);
      expect(tarjeta, `falta la tarjeta ${ruta}`).toBeDefined();
      expect(tarjeta?.icon).toBeTruthy();
      expect(tarjeta?.tip.length).toBeGreaterThan(0);
    }
  });

  it("la explicación copia cuerpo, puntos y pregunta del tema", () => {
    for (const [ruta, label] of RUTAS) {
      const tema = temaDe(ruta);
      expect(tema, `sin tema para ${ruta}`).toBeDefined();
      if (!tema) continue;
      const explicacion = explicacionDe(area(ruta, label));
      expect(explicacion.queEs).toBe(tema.cuerpo);
      expect(explicacion.comoFunciona.map((p) => p.texto)).toEqual([
        ...tema.puntos,
      ]);
      expect(explicacion.empiezaPor).toBe(tema.preguntaAurora);
    }
  });

  it("cada ruta nueva abre su explicación al pulsar la tarjeta", () => {
    for (const [ruta, label] of RUTAS) {
      const tema = temaDe(ruta);
      if (!tema) continue;
      const { unmount } = render(
        <AreasExplicadas areas={[area(ruta, label)]} onIr={() => {}} />,
      );
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      expect(screen.getByText(tema.cuerpo)).toBeTruthy();
      for (const punto of tema.puntos) {
        expect(screen.getByText(punto)).toBeTruthy();
      }
      expect(screen.getByText(tema.preguntaAurora)).toBeTruthy();
      unmount();
    }
  });

  it("Librería, Red Mesh y el antiguo /cerebros también usan sus temas", () => {
    expect(TEMA_POR_RUTA["/library"]).toBe("libreria-biblioteca");
    expect(TEMA_POR_RUTA["/red-mesh"]).toBe("malla");
    expect(TEMA_POR_RUTA["/cerebros"]).toBe("neuronas-cerebro");
    expect(explicacionDe(area("/library", "Librería")).queEs).toBe(
      "La Librería es el catálogo en línea de toda la red: apps, repos, diseños y recursos que se actualizan solos desde sus fuentes. Tu Biblioteca es lo que tú (o tu página, grupo o comunidad) guardas: referencias organizadas en carpetas, nunca copias, así que siempre ves la última versión.",
    );
    expect(explicacionDe(area("/red-mesh", "Redes mesh")).queEs).toBe(
      temaDe("/red-mesh")?.cuerpo,
    );
  });

  it("ninguna tarjeta habla de «varios cerebros»", () => {
    const texto = AREAS.map((a) => `${a.label} ${a.tip}`).join(" ");
    expect(texto).not.toMatch(/varios cerebros/i);
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
    expect(AREAS.find((a) => a.path === "/cerebro")?.tip).toMatch(
      /un cerebro por cuenta/i,
    );
  });
});