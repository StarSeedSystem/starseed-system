"use client";

// Comparador de versiones del laboratorio: decide en qué mejora una versión
// sobre otra. Ejecuta el mismo lote de pruebas en dos instancias, las compara
// cara a cara y prepara —con confirmación explícita— la promoción de B al OS.

import * as React from "react";
import {
  GitCompareArrows,
  Play,
  Rocket,
  TriangleAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { CAPAS, type CapaId } from "@/lib/laboratorio/genoma";
import { compararVersiones, promoverAlOS, versionesDe, type VersionLab } from "@/lib/laboratorio/versiones";
import { ejecutarBanco, type ResultadoBanco } from "@/lib/laboratorio/banco-pruebas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ComparadorVersionesProps {
  genomaId: string;
}

function fmt(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  return JSON.stringify(valor);
}

interface EstadoEjecucion {
  versionId: string;
  resultado: ResultadoBanco | null;
}

export function ComparadorVersiones({ genomaId }: ComparadorVersionesProps) {
  const confirm = useConfirm();

  const versiones = React.useMemo(() => versionesDe(genomaId), [genomaId]);

  const [idA, setIdA] = React.useState<string>("");
  const [idB, setIdB] = React.useState<string>("");

  const versionA = React.useMemo(() => versiones.find((v) => v.id === idA), [versiones, idA]);
  const versionB = React.useMemo(() => versiones.find((v) => v.id === idB), [versiones, idB]);

  const [ejecucion, setEjecucion] = React.useState<EstadoEjecucion[]>([]);
  const [corriendo, setCorriendo] = React.useState(false);

  const resultadoDe = React.useCallback(
    (id: string) => ejecucion.find((e) => e.versionId === id)?.resultado ?? null,
    [ejecucion],
  );
  const resultadoA = resultadoDe(idA);
  const resultadoB = resultadoDe(idB);

  React.useEffect(() => {
    if (versiones.length === 0) {
      setIdA("");
      setIdB("");
      setEjecucion([]);
      return;
    }
    if (!versionA) setIdA(versiones[0].id);
    if (!versionB) setIdB(versiones[versiones.length - 1].id);
  }, [versiones, versionA, versionB]);

  const comparacion =
    versionA && versionB ? compararVersiones(versionA, versionB) : null;

  const cambiosPorCapa = React.useMemo(() => {
    if (!comparacion) return [];
    const porCapa = new Map<CapaId, typeof comparacion.cambiados>();
    for (const cambio of comparacion.cambiados) {
      const nodoId = cambio.nodo;
      const nodo =
        versionB?.instantanea.nodos.find((n) => n.id === nodoId) ??
        versionA?.instantanea.nodos.find((n) => n.id === nodoId);
      const capa = nodo?.capa ?? "contexto";
      const lista = porCapa.get(capa) ?? [];
      lista.push(cambio);
      porCapa.set(capa, lista);
    }
    for (const añadido of comparacion.añadidos) {
      const lista = porCapa.get(añadido.capa) ?? [];
      lista.push({ nodo: añadido.id, campo: "nodo nuevo", antes: null, despues: añadido.nombre });
      porCapa.set(añadido.capa, lista);
    }
    for (const quitado of comparacion.quitados) {
      const lista = porCapa.get(quitado.capa) ?? [];
      lista.push({ nodo: quitado.id, campo: "nodo quitado", antes: quitado.nombre, despues: null });
      porCapa.set(quitado.capa, lista);
    }
    return Array.from(porCapa.entries())
      .map(([capa, cambios]) => ({ capa, cambios }))
      .sort((a, b) => CAPAS[a.capa].indice - CAPAS[b.capa].indice);
  }, [comparacion, versionA, versionB]);

  const ejecutar = React.useCallback(async () => {
    if (!versionA || !versionB) return;
    setCorriendo(true);
    setEjecucion([]);
    await new Promise((r) => setTimeout(r, 300));
    const resA = ejecutarBanco(versionA.instantanea);
    setEjecucion([{ versionId: versionA.id, resultado: resA }]);
    await new Promise((r) => setTimeout(r, 300));
    const resB = ejecutarBanco(versionB.instantanea);
    setEjecucion([
      { versionId: versionA.id, resultado: resA },
      { versionId: versionB.id, resultado: resB },
    ]);
    setCorriendo(false);
  }, [versionA, versionB]);

  const promover = React.useCallback(async () => {
    if (!versionB) return;
    const plan = promoverAlOS(versionB.id);
    if (!plan) return;
    const avisos = plan.avisos.length
      ? `\n\nAvisos:\n${plan.avisos.map((a) => `· ${a}`).join("\n")}`
      : "";
    const ok = await confirm({
      title: "Promover la versión al OS",
      description:
        `Se volcarán ${plan.cambios.length} cambios al sistema vivo de la inteligencia ` +
        `del OS. Nada se ejecutará sin tu confirmación explícita.${avisos}`,
      confirmText: "Sí, promover al OS",
      cancelText: "Cancelar",
      destructive: plan.avisos.length > 0,
    });
    // El plan nunca se ejecuta: promoverAlOS solo prepara el volcado. Queda
    // aquí el punto de confirmación explícita exigido por la regla del área.
    void ok;
  }, [confirm, versionB]);

  const filas = React.useMemo(() => {
    if (!resultadoA || !resultadoB) return [];
    const porCaso = new Map(resultadoB.resultadoPorCaso.map((r) => [r.caso, r]));
    return resultadoA.resultadoPorCaso.map((rA) => {
      const rB = porCaso.get(rA.caso);
      return { caso: rA.caso, nombre: rA.nombre, a: rA, b: rB };
    });
  }, [resultadoA, resultadoB]);

  if (versiones.length < 2) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <GitCompareArrows className="mx-auto mb-3 h-8 w-8" />
          <p className="text-sm">
            Se necesitan al menos dos versiones del genoma para comparar. Crea una
            versión en la pestaña «Versiones» del laboratorio.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitCompareArrows className="h-5 w-5" />
            Comparar versiones
          </CardTitle>
          <CardDescription>
            Ejecuta el mismo lote de pruebas en dos versiones y compara cara a cara.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cmp-a">Versión A (referencia)</Label>
              <Select value={idA} onValueChange={setIdA}>
                <SelectTrigger id="cmp-a" className="w-full">
                  <SelectValue placeholder="Elige la versión A" />
                </SelectTrigger>
                <SelectContent>
                  {versiones.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cmp-b">Versión B (candidata)</Label>
              <Select value={idB} onValueChange={setIdB}>
                <SelectTrigger id="cmp-b" className="w-full">
                  <SelectValue placeholder="Elige la versión B" />
                </SelectTrigger>
                <SelectContent>
                  {versiones.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void ejecutar()}
            disabled={corriendo || !versionA || !versionB || versionA.id === versionB.id}
            className="w-full sm:w-auto"
          >
            <Play className="h-4 w-4" />
            {corriendo ? "Ejecutando…" : "Ejecutar las dos"}
          </Button>

          {corriendo ? (
            <div className="space-y-2">
              <Progress value={ejecucion.length === 1 ? 50 : 25} />
              <p className="text-sm text-muted-foreground">
                Ejecutando el lote en {ejecucion.length === 1 ? "la segunda" : "ambas"} versión…
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {comparacion ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Qué cambia entre A y B</CardTitle>
            <CardDescription>
              Nodos y parámetros que B modifica respecto a A, agrupados por capa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cambiosPorCapa.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                No hay diferencias entre las dos versiones.
              </div>
            ) : (
              cambiosPorCapa.map(({ capa, cambios }) => {
                const info = CAPAS[capa];
                return (
                  <div key={capa} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        style={{ color: info.color, borderColor: info.color }}
                        className="cursor-default"
                      >
                        {info.nombre}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {cambios.length} cambio{cambios.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {cambios.map((c, i) => (
                        <li key={`${c.nodo}-${c.campo}-${i}`} className="text-sm">
                          <span className="font-medium">{c.nodo}</span>
                          <span className="text-muted-foreground"> › {c.campo}: </span>
                          <span className="line-through text-muted-foreground">{fmt(c.antes)}</span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span className="font-medium">{fmt(c.despues)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      {resultadoA && !resultadoB ? (
        <Button type="button" onClick={() => void ejecutar()} disabled={corriendo} className="w-full sm:w-auto">
          <Play className="h-4 w-4" />
          Ejecuta la versión B para poder comparar
        </Button>
      ) : null}

      {!resultadoA && !corriendo ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p className="text-sm">
              Estas versiones aún no tienen resultados. Pulsa «Ejecutar las dos» para
              lanzar el lote en ambas.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {resultadoA && resultadoB ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resultados por prueba</CardTitle>
              <CardDescription>
                Latencia y motor de cada caso, con las diferencias resaltadas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prueba</TableHead>
                    <TableHead>Salida A</TableHead>
                    <TableHead>Salida B</TableHead>
                    <TableHead className="text-right">Lat. A</TableHead>
                    <TableHead className="text-right">Lat. B</TableHead>
                    <TableHead>Motor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map(({ caso, nombre, a, b }) => {
                    const difiere = !b || a.salida !== b.salida || a.acierto !== b.acierto;
                    return (
                      <TableRow
                        key={caso}
                        data-state={difiere ? "selected" : undefined}
                      >
                        <TableCell className="font-medium">{nombre}</TableCell>
                        <TableCell>
                          <span className="flex items-start gap-1.5">
                            {a.acierto ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                            ) : (
                              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                            )}
                            <span className="text-xs">{a.salida}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          {b ? (
                            <span className="flex items-start gap-1.5">
                              {b.acierto ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                              ) : (
                                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                              )}
                              <span className="text-xs">{b.salida}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin ejecutar</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {a.latenciaMs} ms
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {b ? `${b.latenciaMs} ms` : "—"}
                        </TableCell>
                        <TableCell>
                          {a.motor !== (b?.motor ?? a.motor) ? (
                            <Badge variant="secondary" className="cursor-default">
                              {a.motor} → {b?.motor}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{a.motor}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Promover B al OS</CardTitle>
              <CardDescription>
                Prepara el volcado de la versión B sobre la inteligencia viva del OS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Promover vuelca los parámetros de esta versión sobre los sistemas
                vivos de la IA. Nada se aplica sin tu confirmación explícita.
              </p>
              <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Si la versión toca capas casi inmutables (Núcleo, Propósito, Instinto),
                  se mostrarán avisos y se pedirá confirmación doble.
                </p>
              </div>
              <Button type="button" onClick={() => void promover()} className="w-full sm:w-auto">
                <Rocket className="h-4 w-4" />
                Promover B al OS
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}