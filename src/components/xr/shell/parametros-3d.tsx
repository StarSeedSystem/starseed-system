"use client";

/**
 * StarSeed XR · PARÁMETROS 3D DE LA PROTOMOLÉCULA (XR1010AP · contrato §3 e y h).
 *
 * Cascarón fino de uikit sobre la molécula con foco: un control de cristal por `Parametro` con el
 * valor exacto visible. La lógica (mapa de gatillos, curvas, permisos y pendientes) vive en
 * `vinculos-protomolecula.ts`. Los motores pesados siguen en `src/components/xr/shell/**`.
 */
import { useEffect } from "react";
import { Container } from "@react-three/uikit";
import type { Controlador } from "../../../lib/protomolecula/controlador";
import { candidatosDe } from "../../../lib/protomolecula/registro-atomos";
import { formatearValor, valorActual } from "../../../lib/protomolecula/parametros";
import type { Accion, Autor, CandidatoParametro, Operacion, ParametroRef, ValorParametro } from "../../../lib/protomolecula/tipos";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { colorAcento, colorConAlfa } from "./material-cristal";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { aplicarEnVisor, controlDeParametro, fraccionDesdeUv, rangoAGesto } from "./vinculos-protomolecula";

interface EventoRayo { uv?: { x?: number } | null; intersection?: { uv?: { x?: number } | null } | null }

const AUTOR: Autor = { tipo: "persona", id: "visor" };
const idSeguro = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `visor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const uvDe = (e: EventoRayo) => e.uv ?? e.intersection?.uv;

export interface PropsParametros3D {
  controlador: Controlador;
  autor?: Autor;
  /** Frase ya repartida por XR1010P (`repartirFrase` → `dictado.ts`). */
  frase?: string | null;
  /** Operación propuesta por un agente; en grupo queda pendiente de la tarjeta XR1010Q. */
  operacionAgente?: Operacion | null;
  ancho?: number;
  alto?: number;
}

export function Parametros3D({ controlador, autor = AUTOR, frase, operacionAgente, ancho = 1.1, alto = 1.3 }: PropsParametros3D) {
  const estado = controlador.obtener();

  useEffect(() => {
    if (frase && frase.trim()) controlador.dictar(frase, autor, "dictado");
  }, [frase, controlador, autor]);

  useEffect(() => {
    if (operacionAgente) aplicarEnVisor(controlador, operacionAgente.objetivo, operacionAgente);
  }, [operacionAgente, controlador]);

  const operar = (ref: ParametroRef, accion: Accion) => {
    const op: Operacion = { id: idSeguro(), objetivo: ref, accion, autor, origen: "mano", t: Date.now() };
    return aplicarEnVisor(controlador, ref, op);
  };

  const candidatos = candidatosDe(estado.molecula);
  return (
    <PanelCristal nodo="horizon" ancho={ancho} alto={alto} curvatura={2.5}>
      <Container flexDirection="column" gap={8} padding={16} width="100%">
        <Texto3D distancia={1.35}>{estado.molecula.titulo}</Texto3D>
        <Texto3D distancia={1.35} tono="textoSecundario">{`Ámbito: ${estado.molecula.ambito}`}</Texto3D>
        {estado.pendientes.length > 0 && (
          <Texto3D distancia={1.35} tono="textoSecundario">{`${estado.pendientes.length} pendiente(s) de confirmar`}</Texto3D>
        )}
        {candidatos.map((c) => (
          <Fila key={`${c.ref.atomoId}::${c.ref.parametroId}`} c={c} valor={valorActual(estado.molecula.valores, c.ref, c.parametro)} operar={operar} />
        ))}
      </Container>
    </PanelCristal>
  );
}

function Fila({ c, valor, operar }: { c: CandidatoParametro; valor: ValorParametro; operar: (r: ParametroRef, a: Accion) => void }) {
  const p = c.parametro;
  const tipo = controlDeParametro(p);
  const acento = colorConAlfa(colorAcento("horizon"), 0.85);
  const mover = (v: ValorParametro) => operar(c.ref, { tipo: "exacta", valor: v });
  return (
    <Container flexDirection="column" gap={4} padding={8} backgroundColor={colorConAlfa(CRISTAL.borde.color, 0.06)}>
      <Texto3D distancia={1.35}>{`${p.nombre}: ${formatearValor(p, valor)}`}</Texto3D>
      {tipo === "interruptor" && (
        <Container width="100%" height={28} backgroundColor={acento} onClick={() => mover(!Boolean(valor))}>
          <Texto3D distancia={1.35}>{Boolean(valor) ? "Activado" : "Desactivado"}</Texto3D>
        </Container>
      )}
      {tipo === "disparo" && (
        <Container width="100%" height={28} backgroundColor={acento} onClick={() => operar(c.ref, { tipo: "disparo" })}>
          <Texto3D distancia={1.35}>{p.nombre}</Texto3D>
        </Container>
      )}
      {(tipo === "deslizador" || tipo === "dial") && (
        <Container
          width="100%"
          height={20}
          backgroundColor={colorConAlfa(CRISTAL.texto, 0.18)}
          onPointerMove={(e: EventoRayo) => mover(rangoAGesto(p, fraccionDesdeUv(uvDe(e))))}
          onPointerUp={(e: EventoRayo) => mover(rangoAGesto(p, fraccionDesdeUv(uvDe(e))))}
        >
          <Container width="100%" height={20} backgroundColor={colorConAlfa(colorAcento("horizon"), 0.28)} />
        </Container>
      )}
    </Container>
  );
}
