"use client";

/**
 * StarSeed XR · PARÁMETROS 3D DE LA PROTOMOLÉCULA (XR1010AP · contrato §3 e/h y `protomolecula.md` §4).
 * Cascarón fino: un control por `Parametro` sobre el panel de cristal (XR1010H), con el valor exacto
 * visible y `Texto3D` nunca por debajo de 1° de arco. El deslizador y el dial se arrastran con el rayo
 * o el pellizco; el interruptor y el disparo son un toque. Toda la lógica vive en
 * `vinculos-protomolecula.ts` y en el controlador real: aquí solo se pinta y se delega.
 * Lo dictado llega ya resuelto por `repartirFrase` (XR1010P → `dictado.ts`); las operaciones de un
 * agente en un espacio de grupo se quedan pendientes y las confirma la tarjeta de XR1010Q.
 */
import { useEffect, useRef } from "react";
import { Container } from "@react-three/uikit";
import type { Controlador, Pendiente } from "@/lib/protomolecula/controlador";
import type { ResultadoDictado } from "@/lib/protomolecula/dictado";
import { formatearValor, valorActual } from "@/lib/protomolecula/parametros";
import type { Autor, CandidatoParametro, Operacion, Parametro, ParametroRef, ValorParametro } from "@/lib/protomolecula/tipos";
import { useEstadoControl } from "@/components/protomolecula/use-molecula";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { aplicarEnVisor, operacionDeControl, type ContextoControl } from "./vinculos-protomolecula";

const idSeguro = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `xr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface PropsParametros3D {
  controlador: Controlador;
  candidatos: CandidatoParametro[];
  autor: Autor;
  /** Distancia de la persona al panel, en metros (por defecto 1,2 como la tarjeta de §3 f). */
  distancia?: number;
  ancho?: number;
  alto?: number;
  /** Resultados ya resueltos de `repartirFrase` (XR1010P): se aplican al llegar. */
  dictado?: ResultadoDictado[];
  /** La tarjeta de confirmación de XR1010Q recibe las operaciones que quedan pendientes. */
  alPendiente?: (p: Pendiente) => void;
  ahora?: () => number;
  nuevoId?: () => string;
}

type AlOperar = (op: Operacion) => void;

function Pista({ valor, dial, alCambiar }: { valor: number; dial: boolean; alCambiar: (v: number) => void }) {
  const arrastrando = useRef(false);
  const deEvento = (uv: { x: number; y: number } | undefined): number => {
    if (!uv) return valor;
    if (!dial) return Math.min(1, Math.max(0, uv.x));
    const ang = Math.atan2(uv.y - 0.5, uv.x - 0.5);
    return (ang + Math.PI) / (2 * Math.PI);
  };
  return (
    <Container
      width={dial ? 54 : 130} height={dial ? 54 : 16} borderRadius={dial ? 27 : 8}
      backgroundColor="#ffffff22" borderColor="#ffffff88" borderWidth={1}
      flexDirection="row" alignItems="center" paddingX={2}
      onPointerDown={(e) => { arrastrando.current = true; alCambiar(deEvento(e.uv)); }}
      onPointerMove={(e) => { if (arrastrando.current) alCambiar(deEvento(e.uv)); }}
      onPointerUp={() => { arrastrando.current = false; }}
      onPointerLeave={() => { arrastrando.current = false; }}
    >
      <Container
        width={dial ? 10 : Math.max(6, valor * 126)} height={dial ? 10 : 12}
        backgroundColor="#7C5CFF" borderRadius={6}
        marginLeft={dial ? Math.max(0, valor * 40) : 0}
      />
    </Container>
  );
}

function Fila({ c, valores, ctx, alOperar, distancia }: {
  c: CandidatoParametro; valores: Record<string, ValorParametro>; ctx: ContextoControl; alOperar: AlOperar; distancia: number;
}) {
  const p = c.parametro;
  const valor = valorActual(valores, c.ref, p);
  const mover = (v: number) => alOperar(operacionDeControl(c.ref, p, v, ctx));
  return (
    <Container flexDirection="row" alignItems="center" gap={8} paddingY={3}>
      <Texto3D distancia={distancia}>{p.nombre}</Texto3D>
      <Texto3D distancia={distancia} tono="textoSecundario">{formatearValor(p, valor)}</Texto3D>
      {p.tipo === "numero" || p.tipo === "entero" ? (
        <Container flexDirection="row" alignItems="center" gap={6}>
          <Pista valor={Number(valor)} dial={false} alCambiar={mover} />
          <Pista valor={Number(valor)} dial alCambiar={mover} />
        </Container>
      ) : p.tipo === "booleano" ? (
        <Container width={50} height={24} borderRadius={12} backgroundColor={valor ? "#7C5CFF" : "#ffffff33"}
          onClick={() => mover(valor ? 0 : 1)}>
          <Container width={20} height={20} borderRadius={10} backgroundColor="#ffffff" marginLeft={valor ? 27 : 2} />
        </Container>
      ) : p.tipo === "opcion" ? (
        <Container flexDirection="row" gap={4}>
          {(p.opciones ?? []).map((o, i, todas) => (
            <Container key={o} paddingX={6} paddingY={2} borderRadius={6} backgroundColor={o === valor ? "#7C5CFF" : "#ffffff22"}
              onClick={() => mover((i + 0.5) / todas.length)}>
              <Texto3D distancia={distancia}>{o}</Texto3D>
            </Container>
          ))}
        </Container>
      ) : (
        <Container paddingX={8} paddingY={3} borderRadius={6} backgroundColor="#7C5CFF" onClick={() => mover(1)}>
          <Texto3D distancia={distancia}>{p.nombre}</Texto3D>
        </Container>
      )}
    </Container>
  );
}

export function Parametros3D({
  controlador, candidatos, autor, distancia = 1.2, ancho = 1.2, alto = 0.8, dictado, alPendiente,
  ahora = Date.now, nuevoId = idSeguro,
}: PropsParametros3D) {
  const estado = useEstadoControl(controlador);
  const ctx: ContextoControl = { autor, ahora, nuevoId };
  const alOperar: AlOperar = (op) => {
    const r = aplicarEnVisor(controlador, op.objetivo, op);
    if (!r.ok && r.pendiente) alPendiente?.(r.pendiente);
  };
  const aplicarRef = useRef(alOperar);
  aplicarRef.current = alOperar;
  useEffect(() => {
    for (const r of dictado ?? []) if (r.ok) aplicarRef.current(r.operacion);
  }, [dictado]);
  const valores = estado?.molecula.valores ?? {};
  const pendientes = estado?.pendientes ?? [];
  return (
    <PanelCristal nodo="horizon" ancho={ancho} alto={alto} curvatura={2.5}>
      <Container flexDirection="column" padding={14} gap={4}>
        <Texto3D distancia={distancia}>{estado?.molecula.titulo ?? "Protomolécula"}</Texto3D>
        {candidatos.length === 0 ? (
          <Texto3D distancia={distancia} tono="textoSecundario">Esta molécula aún no tiene controles.</Texto3D>
        ) : candidatos.map((c) => (
          <Fila key={`${c.ref.atomoId}::${c.ref.parametroId}`} c={c} valores={valores} ctx={ctx} alOperar={alOperar} distancia={distancia} />
        ))}
        {pendientes.map((p) => (
          <Texto3D key={p.operacion.id} distancia={distancia} tono="textoSecundario">
            Pendiente de confirmar: {p.motivo}
          </Texto3D>
        ))}
      </Container>
    </PanelCristal>
  );
}

export default Parametros3D;
