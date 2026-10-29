"use client";

/**
 * StarSeed XR · PARÁMETROS DE LA PROTOMOLÉCULA EN 3D (XR1010AP).
 * Contrato: `architecture/starseed-xr.md` §3 (e)/(h); `architecture/protomolecula.md` §4/§11.1.
 * Cascarón fino de uikit: la lógica pura vive en `vinculos-protomolecula.ts`. Un control por
 * `Parametro` (deslizador/dial, interruptor, disparo), `Texto3D` ≥ 1° y valor exacto visible.
 * La frase de XR1010P entra por `frase`; el agente en grupo queda pendiente (tarjeta XR1010Q).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@react-three/uikit";
import type { ThreeEvent } from "@react-three/fiber";
import type { Controlador } from "@/lib/protomolecula/controlador";
import { candidatosDe } from "@/lib/protomolecula/registro-atomos";
import { claveDe, formatearValor, valorActual } from "@/lib/protomolecula/parametros";
import type { Ambito, Autor, CandidatoParametro, Operacion, ParametroRef, Rol, ValorParametro } from "@/lib/protomolecula/tipos";
import { CRISTAL, type NodoCardinal } from "@/lib/xr/tokens-3d";
import { useEstadoControl } from "@/components/protomolecula/use-molecula";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { colorAcento, pixeles } from "./material-cristal";
import { aplicarEnVisor, rangoAGesto } from "./vinculos-protomolecula";

const AUTOR_VISOR: Autor = { tipo: "persona", id: "visor" };
const idSeguro = (): string => (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `op-xr-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export interface PropsParametros3D {
  controlador: Controlador;
  autor?: Autor;
  /** Ámbito de la molécula con foco; si falta se lee de la propia molécula. */
  ambito?: Ambito;
  rol?: Rol | null;
  nodo?: NodoCardinal;
  distancia?: number;
  ancho?: number;
  alto?: number;
  /** Frase ya repartida por XR1010P; se aplica con el dictado real de la Protomolécula. */
  frase?: string | null;
  alPendiente?: (op: Operacion, motivo: string) => void;
  alDicho?: (resumen: string) => void;
}

function Continuo({ c, valor, dial, alGesto, alSoltar }: { c: CandidatoParametro; valor: number; dial: boolean; alGesto: (x: number) => void; alSoltar: () => void }) {
  const [arrastre, setArrastre] = useState(false);
  const min = c.parametro.min ?? 0, max = c.parametro.max ?? 1;
  const pct = max === min ? 0 : Math.min(1, Math.max(0, (valor - min) / (max - min)));
  const alPunto = (e: ThreeEvent<PointerEvent>) => {
    const x = e.uv?.x;
    if (x !== undefined) alGesto(Math.min(1, Math.max(0, x)));
  };
  return (
    <Container width={pixeles(dial ? 0.055 : 0.24)} height={pixeles(dial ? 0.055 : 0.026)} borderRadius={pixeles(dial ? 0.0275 : 0.013)} backgroundColor={CRISTAL.borde.color} cursor="pointer" onPointerDown={(e) => { setArrastre(true); alPunto(e); }} onPointerMove={(e) => { if (arrastre) alPunto(e); }} onPointerUp={() => { setArrastre(false); alSoltar(); }} onPointerLeave={() => { if (arrastre) { setArrastre(false); alSoltar(); } }}>
      <Container width={dial ? pixeles(0.014) : `${pct * 100}%`} height={dial ? pixeles(0.014) : "100%"} borderRadius={pixeles(dial ? 0.007 : 0.013)} backgroundColor={colorAcento("horizon")} marginLeft={dial ? pixeles(0.02 * pct) : undefined} marginTop={dial ? pixeles(0.02) : undefined} />
    </Container>
  );
}

function Simple({ c, valor, distancia, alOperar }: { c: CandidatoParametro; valor: ValorParametro; distancia: number; alOperar: (accion: Operacion["accion"]) => void }) {
  const p = c.parametro;
  if (p.tipo === "booleano") return <Container width={pixeles(0.06)} height={pixeles(0.03)} borderRadius={pixeles(0.015)} backgroundColor={valor === true ? colorAcento("horizon") : CRISTAL.borde.color} cursor="pointer" onClick={() => alOperar({ tipo: "exacta", valor: valor !== true })} />;
  if (p.tipo === "opcion") return (
    <Container flexDirection="row" gapColumn={pixeles(0.006)}>
      {(p.opciones ?? []).map((o) => (
        <Container key={o} paddingTop={pixeles(0.004)} paddingBottom={pixeles(0.004)} paddingLeft={pixeles(0.008)} paddingRight={pixeles(0.008)} borderRadius={pixeles(0.006)} backgroundColor={o === valor ? colorAcento("horizon") : CRISTAL.borde.color} cursor="pointer" onClick={() => alOperar({ tipo: "exacta", valor: o })}>
          <Texto3D distancia={distancia}>{o}</Texto3D>
        </Container>
      ))}
    </Container>
  );
  return <Container width={pixeles(0.14)} height={pixeles(0.03)} borderRadius={pixeles(0.006)} backgroundColor={colorAcento("horizon")} cursor="pointer" onClick={() => alOperar({ tipo: "disparo" })}><Texto3D distancia={distancia}>{p.nombre}</Texto3D></Container>;
}

export function Parametros3D({ controlador, autor = AUTOR_VISOR, ambito, rol = null, nodo = "horizon", distancia = 1.4, ancho = 0.7, alto = 0.5, frase, alPendiente, alDicho }: PropsParametros3D) {
  const estado = useEstadoControl(controlador);
  const [borrador, setBorrador] = useState<Record<string, ValorParametro>>({});
  const ultima = useRef<string | null>(null);
  const candidatos = useMemo(() => (estado ? candidatosDe(estado.molecula) : []), [estado]);
  useEffect(() => {
    if (!frase) { ultima.current = null; return; }
    if (frase === ultima.current || !estado) return;
    ultima.current = frase;
    const r = controlador.dictar(frase, autor);
    for (const p of r.pendientes) alPendiente?.(p.operacion, p.motivo);
    const resumen = r.resultados.flatMap((x) => (x.ok ? [x.resumen] : [])).join(" · ");
    if (resumen) alDicho?.(resumen);
  }, [frase, estado, controlador, autor, alPendiente, alDicho]);
  if (!estado) return null;
  const ambitoReal = ambito ?? estado.molecula.ambito;
  const operar = (ref: ParametroRef, accion: Operacion["accion"]) => {
    const op: Operacion = { id: idSeguro(), objetivo: ref, accion, autor, origen: "mano", t: Date.now() };
    const r = aplicarEnVisor(controlador, ref, op, { ambito: ambitoReal, rol });
    if (!r.ok && r.pendiente) alPendiente?.(r.pendiente, r.motivo);
  };
  const valorDe = (c: CandidatoParametro) => borrador[claveDe(c.ref)] ?? valorActual(estado.molecula.valores, c.ref, c.parametro);
  const gesto = (c: CandidatoParametro, x: number) => setBorrador((b) => ({ ...b, [claveDe(c.ref)]: rangoAGesto(c.parametro, x) }));
  const soltar = (c: CandidatoParametro) => {
    const v = borrador[claveDe(c.ref)];
    setBorrador((b) => { const n = { ...b }; delete n[claveDe(c.ref)]; return n; });
    if (v !== undefined) operar(c.ref, { tipo: "exacta", valor: v });
  };
  return (
    <PanelCristal nodo={nodo} ancho={ancho} alto={alto} curvatura={2.5}>
      <Texto3D distancia={distancia}>Protomolécula · {estado.molecula.titulo}</Texto3D>
      {candidatos.length === 0 && <Texto3D distancia={distancia} tono="textoSecundario">Próximamente: esta molécula aún no tiene parámetros.</Texto3D>}
      {candidatos.map((c) => {
        const valor = valorDe(c), numerico = c.parametro.tipo === "numero" || c.parametro.tipo === "entero";
        return (
          <Container key={claveDe(c.ref)} flexDirection="column" gapRow={pixeles(0.006)}>
            <Texto3D distancia={distancia}>{c.parametro.nombre} · {formatearValor(c.parametro, valor)}</Texto3D>
            {numerico ? (
              <Container flexDirection="row" gapColumn={pixeles(0.008)} alignItems="center">
                <Continuo c={c} valor={Number(valor)} dial={false} alGesto={(x) => gesto(c, x)} alSoltar={() => soltar(c)} />
                <Continuo c={c} valor={Number(valor)} dial alGesto={(x) => gesto(c, x)} alSoltar={() => soltar(c)} />
              </Container>
            ) : <Simple c={c} valor={valor} distancia={distancia} alOperar={(accion) => operar(c.ref, accion)} />}
          </Container>
        );
      })}
    </PanelCristal>
  );
}
