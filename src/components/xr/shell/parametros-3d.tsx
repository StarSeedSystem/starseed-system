"use client";
/**
 * StarSeed XR · PARÁMETROS 3D DE LA PROTOMOLÉCULA (XR1010AP · contrato §3 e/h y
 * `architecture/protomolecula.md` §4). Panel de cristal con un control por `Parametro`:
 * deslizador (rayo o pellizco), dial (giro de muñeca o mando), interruptor y botón de disparo.
 * La lógica vive en `vinculos-protomolecula.ts`; aquí solo se pinta con uikit y se conecta al
 * `Controlador` real. Sirve igual sobre una pizarra o en una llamada: la molécula trae su `ambito`.
 */
import { useEffect, useState } from "react";
import { Container } from "@react-three/uikit";
import type { Controlador, Pendiente } from "@/lib/protomolecula/controlador";
import { formatearValor, valorActual } from "@/lib/protomolecula/parametros";
import type { Accion, Ambito, Autor, CandidatoParametro, Parametro, ParametroRef, ValorParametro } from "@/lib/protomolecula/tipos";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { aplicarEnVisor, operacionEnVisor, rangoAGesto } from "./vinculos-protomolecula";
const AUTOR_VISOR: Autor = { tipo: "persona", id: "visor" };
const idSeguro = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `visor-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface PropsParametros3D {
  controlador: Controlador;
  candidatos: CandidatoParametro[];
  ambito?: Ambito;
  /** Frase ya repartida por XR1010P; llega a `dictado.ts` por el controlador. */
  fraseDictada?: string | null;
  /** Operación que espera la tarjeta de confirmación de XR1010Q. */
  alPendiente?: (pendiente: Pendiente) => void;
  autor?: Autor;
  ahora?: () => number;
  nuevoId?: () => string;
}

function Deslizador({ p, valor, alValor }: { p: Parametro; valor: number; alValor: (v: number) => void }) {
  const [borrador, setBorrador] = useState<number | null>(null);
  const min = p.min ?? 0;
  const max = p.max ?? 1;
  const fraccion = max === min ? 0 : Math.min(1, Math.max(0, ((borrador ?? valor) - min) / (max - min)));
  const gesto = (e: { uv?: { x: number } }): number => Number(rangoAGesto(p, e.uv?.x ?? 0.5));
  return (
    <Container width={360} height={28} borderRadius={14} backgroundColor={CRISTAL.fondoB.color}
      onPointerDown={(e) => setBorrador(gesto(e))}
      onPointerMove={(e) => { if (borrador !== null) setBorrador(gesto(e)); }}
      onPointerUp={(e) => { const v = gesto(e); setBorrador(null); alValor(v); }}
      onPointerLeave={() => setBorrador(null)}>
      <Container width={Math.max(8, fraccion * 360)} height={28} borderRadius={14} backgroundColor={CRISTAL.borde.color} />
    </Container>
  );
}

function Control({ p, valor, alAccion }: { p: Parametro; valor: ValorParametro; alAccion: (a: Accion) => void }) {
  if (p.tipo === "numero" || p.tipo === "entero")
    return <Deslizador p={p} valor={Number(valor)} alValor={(v) => alAccion({ tipo: "exacta", valor: v })} />;
  if (p.tipo === "booleano")
    return (
      <Container width={72} height={32} borderRadius={16} cursor="pointer"
        backgroundColor={valor ? CRISTAL.borde.color : CRISTAL.fondoB.color}
        onClick={() => alAccion({ tipo: "exacta", valor: !valor })}>
        <Container width={28} height={28} borderRadius={14} backgroundColor={CRISTAL.texto} marginLeft={valor ? 40 : 2} marginTop={2} />
      </Container>
    );
  const etiqueta = p.tipo === "opcion" ? String(valor) : "Disparar";
  const alPulsar = p.tipo === "opcion"
    ? () => { const ops = p.opciones ?? []; const i = ops.indexOf(String(valor)); alAccion({ tipo: "exacta", valor: ops[(i + 1) % Math.max(1, ops.length)] ?? String(valor) }); }
    : () => alAccion({ tipo: "disparo" });
  return (
    <Container paddingX={12} paddingY={6} borderRadius={8} borderWidth={1} borderColor={CRISTAL.borde.color}
      backgroundColor={CRISTAL.fondoB.color} onClick={alPulsar} cursor="pointer">
      <Texto3D distancia={1.2}>{etiqueta}</Texto3D>
    </Container>
  );
}

function Fila({ c, valor, alAccion }: { c: CandidatoParametro; valor: ValorParametro; alAccion: (a: Accion) => void }) {
  return (
    <Container flexDirection="row" alignItems="center" gap={12} paddingY={4}>
      <Container width={280}><Texto3D distancia={1.2}>{c.parametro.nombre}</Texto3D></Container>
      <Control p={c.parametro} valor={valor} alAccion={alAccion} />
      <Container width={120}>
        <Texto3D distancia={1.2} tono="textoSecundario">{formatearValor(c.parametro, valor)}</Texto3D>
      </Container>
    </Container>
  );
}

export function Parametros3D({
  controlador, candidatos, ambito, fraseDictada, alPendiente,
  autor = AUTOR_VISOR, ahora = Date.now, nuevoId = idSeguro,
}: PropsParametros3D) {
  const ambitoEfectivo = ambito ?? controlador.obtener().molecula.ambito;
  useEffect(() => {
    if (!fraseDictada) return;
    const r = controlador.dictar(fraseDictada, autor);
    for (const pendiente of r.pendientes) alPendiente?.(pendiente);
  }, [fraseDictada, controlador, autor, alPendiente]);
  const aplicar = (ref: ParametroRef, accion: Accion) => {
    const op = operacionEnVisor(ref, accion, { autor, ahora: ahora(), id: nuevoId });
    const r = aplicarEnVisor(controlador, ref, op, ambitoEfectivo);
    if (!r.ok && r.pendiente) alPendiente?.(r.pendiente);
  };
  const valores = controlador.obtener().molecula.valores;
  return (
    <PanelCristal nodo="horizon" ancho={1.6} alto={0.22 + candidatos.length * 0.1} curvatura={2}>
      <Container flexDirection="column" padding={16} gap={6}>
        <Texto3D distancia={1.2}>Protomolécula · parámetros</Texto3D>
        {candidatos.length === 0 ? (
          <Texto3D distancia={1.2} tono="textoSecundario">Esta molécula no tiene controles todavía.</Texto3D>
        ) : (
          candidatos.map((c) => (
            <Fila key={`${c.ref.atomoId}::${c.ref.parametroId}`} c={c} valor={valorActual(valores, c.ref, c.parametro)} alAccion={(a) => aplicar(c.ref, a)} />
          ))
        )}
      </Container>
    </PanelCristal>
  );
}

export default Parametros3D;
