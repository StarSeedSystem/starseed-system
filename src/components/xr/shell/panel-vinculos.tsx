"use client";

/**
 * StarSeed XR · VÍNCULOS DE ENTRADA (XR1010AG · contrato `architecture/starseed-xr.md` §3 e).
 * Lista las 11 acciones con los gatillos de la forma de entrada presente. «Cambiar» arma el
 * modo aprender: el siguiente gatillo que capture la capa de entrada entra por la prop
 * `capturado` y se asigna con `asignar` (nunca en silencio: si estaba ocupado, dice a quién se
 * lo quitó). `validarMapa` bloquea guardar un mapa sin «salir»/«menu-mano» o con un gesto
 * reservado. «Restaurar» vuelve a `MAPAS_DEFECTO[entrada]`. La captura real del visor la cablea
 * XR1010AS; aquí queda la lógica completa y probada.
 */
import { useEffect, useState } from "react";
import { Container, Text } from "@react-three/uikit";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import {
  ACCIONES_XR, MAPAS_DEFECTO, asignar, validarMapa,
  type AccionXR, type Gatillo, type MapaEntrada,
} from "../../../lib/xr/vinculos-xr";
import type { EntradaXR } from "../../../lib/xr/tipos";

const ACENTO = COLORES_NODO.logic;
const SEC = CRISTAL.textoSecundario;

export const NOMBRE_ACCION: Record<AccionXR, string> = {
  seleccionar: "Seleccionar", agarrar: "Agarrar", "menu-mano": "Menú de mano",
  "abrir-dock": "Abrir dock", recentrar: "Recentrar", salir: "Salir", hablar: "Hablar",
  teletransporte: "Teletransporte", "giro-izquierda": "Girar a la izquierda",
  "giro-derecha": "Girar a la derecha", atras: "Atrás",
};

export function etiquetaGatillo(g: Gatillo): string {
  if (g.tipo === "boton") return `Botón ${g.indice} (${g.mano})`;
  if (g.tipo === "eje") return `Eje ${g.indice}${g.direccion} (${g.mano})`;
  if (g.tipo === "gesto") return `Gesto ${g.gesto} (${g.mano})`;
  if (g.tipo === "tecla") return `Tecla ${g.codigo}`;
  return `Frase «${g.texto}»`;
}

export interface PropiedadesPanelVinculos {
  entrada: EntradaXR;
  mapas: Partial<Record<EntradaXR, MapaEntrada>>;
  alGuardar: (entrada: EntradaXR, mapa: MapaEntrada) => void;
  /** Siguiente pulsación/gesto/tecla/frase capturada; `null` = aún escuchando. */
  capturado?: Gatillo | null;
  alAvisar?: (texto: string) => void;
}

export function PanelVinculos({ entrada, mapas, alGuardar, capturado = null, alAvisar }: PropiedadesPanelVinculos) {
  const [mapa, setMapa] = useState<MapaEntrada>(() => mapas[entrada] ?? MAPAS_DEFECTO[entrada]);
  const [aprendiendo, setAprendiendo] = useState<AccionXR | null>(null);
  const [aviso, setAviso] = useState("");
  const [problemas, setProblemas] = useState<string[]>([]);

  useEffect(() => {
    setMapa(mapas[entrada] ?? MAPAS_DEFECTO[entrada]);
    setAprendiendo(null);
    setProblemas([]);
  }, [entrada, mapas]);

  useEffect(() => {
    if (!aprendiendo || !capturado) return;
    const { mapa: nuevo, desplazada } = asignar(mapa, aprendiendo, capturado);
    const texto = desplazada
      ? `Se lo quité a «${NOMBRE_ACCION[desplazada]}».`
      : `«${NOMBRE_ACCION[aprendiendo]}» ahora usa ${etiquetaGatillo(capturado)}.`;
    setMapa(nuevo);
    setAviso(texto);
    alAvisar?.(texto);
    const v = validarMapa(entrada, nuevo);
    setProblemas(v.problemas);
    if (v.ok) alGuardar(entrada, nuevo);
    setAprendiendo(null);
    // Solo cuando llega un gatillo nuevo; el resto se lee del cierre vigente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturado]);

  const restaurar = () => {
    const defecto = MAPAS_DEFECTO[entrada];
    setMapa(defecto);
    setProblemas([]);
    setAprendiendo(null);
    const texto = "Restaurado el mapa por defecto de esta forma de entrada.";
    setAviso(texto);
    alAvisar?.(texto);
    alGuardar(entrada, defecto);
  };

  return (
    <Container flexDirection="column" gap={6}>
      <Text color={ACENTO.vivo} fontSize={11}>Entrada con {entrada}</Text>
      {ACCIONES_XR.map((a) => (
        <Container key={a} flexDirection="row" gap={6} alignItems="center">
          <Text color={CRISTAL.texto} fontSize={10}>{NOMBRE_ACCION[a]}</Text>
          <Text color={SEC} fontSize={9}>{(mapa[a] ?? []).map(etiquetaGatillo).join(" · ") || "sin gatillo"}</Text>
          <Container
            cursor="pointer"
            padding={3}
            borderRadius={6}
            backgroundColor={aprendiendo === a ? ACENTO.base : undefined}
            onClick={() => setAprendiendo(a)}
          >
            <Text color={CRISTAL.texto} fontSize={9}>{aprendiendo === a ? "Toca ahora…" : "Cambiar"}</Text>
          </Container>
        </Container>
      ))}
      {aviso !== "" && <Text color={ACENTO.vivo} fontSize={9}>{aviso}</Text>}
      {problemas.map((p) => <Text key={p} color="#FF8A80" fontSize={9}>{p}</Text>)}
      <Container flexDirection="row" gap={6} alignItems="center">
        <Container cursor="pointer" padding={4} borderRadius={8} borderWidth={1} borderColor={CRISTAL.borde.color} onClick={restaurar}>
          <Text color={CRISTAL.texto} fontSize={9}>Restaurar</Text>
        </Container>
        <Text color={SEC} fontSize={8}>
          Captura real de la siguiente pulsación: próximamente la cablea XR1010AS con la entrada del visor.
        </Text>
      </Container>
    </Container>
  );
}
export default PanelVinculos;
