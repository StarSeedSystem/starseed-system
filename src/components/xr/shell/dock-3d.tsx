"use client";

/**
 * StarSeed XR · DOCK CURVO 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a-b, nodo Anchor).
 *
 * LAS MISMAS apps que el dock 2D: lee `loadDockConfig()` del mismo `starseed.dock.items.v2` y se
 * refresca con el evento `storage`. Icono decidido: la INICIAL del nombre dentro de un círculo del
 * color del item (los SVG de lucide no entran baratos en uikit; sin dependencia extra). Los colores
 * salen SIEMPRE de `tokens-3d.ts`, nunca escritos a mano. La lógica pura vive en `apps-3d.ts`;
 * la cablea XR1010AS en el nodo Anchor de `escena-os.tsx`.
 */
import { useEffect, useMemo, useState } from "react";
import { Container } from "@react-three/uikit";
import { COLORES_NODO, CRISTAL, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import type { Postura } from "../../../lib/xr/tipos";
import {
  OBJETIVO_MIN_TACTO_M,
  posicionesDock,
  type EntradaEspacio,
} from "../../../lib/xr/espacio-trinity";
import { DOCK_STORAGE_KEY } from "../../../lib/dock/dock-defaults";
import {
  loadDockConfig,
  type DockColor,
  type DockItemConfig,
} from "../../../layout/dock-config";
import { itemsDelDock, resolverApp, type ResolucionApp } from "./apps-3d";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { colorConAlfa, pixeles } from "./material-cristal";

/** DockColor → nodo del núcleo (tokens-3d). Neutral y purple reutilizan el azul de Zenith: no hay tokens blancos ni violas. */
const NODO_DE_ITEM: Record<DockColor, NodoCardinal> = {
  neutral: "zenith",
  cyan: "zenith",
  purple: "zenith",
  emerald: "horizon",
  amber: "logic",
  crimson: "anchor",
};

const ANCHO_PULSABLE = 0.05;
const ALTO_PULSABLE = 0.07;

export interface PropsDock3D {
  entrada: EntradaEspacio;
  postura: Postura;
  /** Abre una app 3D nativa (hub, escena, sala, Astraura, ajustes XR) en su panel. */
  abrir: (id: string) => void;
  /** Termina la sesión XR y navega a la ruta 2D. */
  salirA2D: (ruta: string) => void;
}

export function Dock3D({ entrada, postura, abrir, salirA2D }: PropsDock3D) {
  const [config, setConfig] = useState<DockItemConfig[]>([]);
  const [mas, setMas] = useState(false);
  const [apunta, setApunta] = useState<string | null>(null);
  const [solo2d, setSolo2d] = useState<{ item: DockItemConfig; res: ResolucionApp } | null>(null);

  useEffect(() => {
    const recargar = (e: StorageEvent) => {
      if (e.key && e.key !== DOCK_STORAGE_KEY) return;
      setConfig(loadDockConfig());
    };
    setConfig(loadDockConfig());
    window.addEventListener("storage", recargar);
    return () => window.removeEventListener("storage", recargar);
  }, []);

  const { visibles, ocultos } = useMemo(() => itemsDelDock(config, postura), [config, postura]);
  const conMas = ocultos.length > 0;
  const posiciones = useMemo(
    () => posicionesDock(visibles.length + (conMas ? 1 : 0), entrada),
    [visibles.length, conMas, entrada],
  );
  const centro = posiciones[Math.floor((posiciones.length - 1) / 2)];
  const posCard: [number, number, number] = [centro.posicion[0], centro.posicion[1] + 0.16, centro.posicion[2]];

  const pulsa = (item: DockItemConfig) => {
    const res = resolverApp(item);
    setMas(false);
    setApunta(null);
    if (res.tipo === "nativa-3d") {
      abrir(res.id);
      return;
    }
    setSolo2d({ item, res });
  };
  const textoMotivo = (res: ResolucionApp) =>
    res.tipo === "solo-2d" ? res.motivo : "Próximamente: su vista UiSpec en 3D aún no está cableada.";

  if (visibles.length === 0 && !conMas) return null;

  const boton = (item: DockItemConfig, i: number) => {
    const foco = apunta === item.id;
    const p = posiciones[i] ?? centro;
    return (
      <group key={i} position={p.posicion} rotation={[0, p.yaw, 0]}>
        <Animado hermano={{ i, n: posiciones.length }} distancia={0.6}>
          <PanelCristal
            nodo={NODO_DE_ITEM[item.color]}
            ancho={ANCHO_PULSABLE * (foco ? 1.15 : 1)}
            alto={ALTO_PULSABLE * (foco ? 1.15 : 1)}
            curvatura={0.5}
          >
            <Container
              width="100%"
              height="100%"
              cursor="pointer"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              gap={pixeles(0.003)}
              onClick={() => pulsa(item)}
              onPointerOver={() => setApunta(item.id)}
              onPointerOut={() => setApunta(null)}
            >
              <Container
                width={pixeles(OBJETIVO_MIN_TACTO_M)}
                height={pixeles(OBJETIVO_MIN_TACTO_M)}
                borderRadius={pixeles(OBJETIVO_MIN_TACTO_M)}
                alignItems="center"
                justifyContent="center"
                backgroundColor={colorConAlfa(COLORES_NODO[NODO_DE_ITEM[item.color]].vivo, 0.28)}
                borderWidth={pixeles(0.002)}
                borderColor={colorConAlfa(COLORES_NODO[NODO_DE_ITEM[item.color]].vivo, 0.85)}
              >
                <Texto3D distancia={0.6} fontSize={pixeles(0.014)}>
                  {item.label.trim().charAt(0).toUpperCase()}
                </Texto3D>
              </Container>
              <Texto3D distancia={0.6} fontSize={pixeles(0.007)} tono="textoSecundario">
                {item.label}
              </Texto3D>
            </Container>
          </PanelCristal>
        </Animado>
      </group>
    );
  };

  const botonMas = (i: number) => {
    const p = posiciones[i] ?? centro;
    return (
      <group key="mas" position={p.posicion} rotation={[0, p.yaw, 0]}>
        <Animado hermano={{ i, n: posiciones.length }} distancia={0.6}>
          <PanelCristal nodo={NODO_DE_ITEM.neutral} ancho={ANCHO_PULSABLE} alto={ALTO_PULSABLE} curvatura={0.5}>
            <Container width="100%" height="100%" cursor="pointer" alignItems="center" justifyContent="center" onClick={() => setMas(true)}>
              <Texto3D distancia={0.6} fontSize={pixeles(0.014)}>
                Más
              </Texto3D>
            </Container>
          </PanelCristal>
        </Animado>
      </group>
    );
  };

  const tarjetasRow = (texto: string, alPulsar: () => void) => (
    <Container cursor="pointer" paddingX={pixeles(0.008)} paddingY={pixeles(0.004)} onClick={alPulsar}>
      <Texto3D distancia={0.66} fontSize={pixeles(0.01)}>
        {texto}
      </Texto3D>
    </Container>
  );

  const tarjeta = (() => {
    const abierta = solo2d ?? (mas && conMas ? { mas: true } : null);
    if (abierta === null) return null;
    return (
      <group position={posCard} rotation={[0, centro.yaw, 0]}>
        <Animado hermano={{ i: posiciones.length, n: posiciones.length + 1 }} distancia={0.66}>
          <PanelCristal nodo="anchor" ancho={0.34} alto={0.19} curvatura={0.35}>
            <Container width="100%" height="100%" flexDirection="column" alignItems="flex-start" justifyContent="center" gap={pixeles(0.004)} padding={pixeles(0.014)}>
              {solo2d ? (
                <>
                  <Texto3D distancia={0.66} fontSize={pixeles(0.013)}>
                    {solo2d.item.label}
                  </Texto3D>
                  <Texto3D distancia={0.66} fontSize={pixeles(0.009)} tono="textoSecundario">
                    {textoMotivo(solo2d.res)}
                  </Texto3D>
                  <Container flexDirection="row" gap={pixeles(0.008)}>
                    <Container cursor="pointer" onClick={() => { setSolo2d(null); salirA2D(solo2d.item.path); }} backgroundColor={colorConAlfa(CRISTAL.borde.color, 0.18)} padding={pixeles(0.005)}>
                      <Texto3D distancia={0.66} fontSize={pixeles(0.01)}>Salir y abrir en 2D</Texto3D>
                    </Container>
                    {tarjetasRow("Cerrar", () => setSolo2d(null))}
                  </Container>
                </>
              ) : (
                <>
                  {ocultos.map((o) => (
                    <Container key={o.id} cursor="pointer" paddingX={pixeles(0.008)} paddingY={pixeles(0.003)} onClick={() => pulsa(o)}>
                      <Texto3D distancia={0.66} fontSize={pixeles(0.01)}>{o.label}</Texto3D>
                    </Container>
                  ))}
                  {tarjetasRow("Cerrar", () => setMas(false))}
                </>
              )}
            </Container>
          </PanelCristal>
        </Animado>
      </group>
    );
  })();

  return (
    <group>
      {visibles.map((item, i) => boton(item, i))}
      {conMas && botonMas(visibles.length)}
      {tarjeta}
    </group>
  );
}
