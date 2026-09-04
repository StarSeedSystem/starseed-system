"use client";

// Laboratorio de Astraura — recinto de pruebas de la inteligencia fásica.
// -------------------------------------------------------------
// Monta las piezas ya existentes del laboratorio (mapa 3D, inspector de nodo,
// banco de pruebas, comparador y plan de hardware) en una única lente de
// trabajo con cuatro pestañas. El estado vive en el componente, y NADA se
// escribe en el OS sin confirmación explícita del usuario: aquí solo se guarda
// en localStorage del laboratorio (genomas y versiones).

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Beaker,
  FlaskConical,
  GitBranch,
  HardDrive,
  Map,
  Plus,
  Save,
  Cpu,
} from "lucide-react";

import {
  cargarGenomas,
  guardarGenoma,
  type Genoma,
} from "@/lib/laboratorio/genoma";
import {
  crearVersion,
  ramificar,
  versionesDe,
  type VersionLab,
} from "@/lib/laboratorio/versiones";
import {
  ejecutarBanco,
  type ResultadoBanco,
} from "@/lib/laboratorio/banco-pruebas";
import {
  estimarMemoria,
  MEDIOS,
  planPorHardware,
  PRECISIONES,
  type Medio,
  type PlanMedio,
  type Precision,
} from "@/lib/laboratorio/cuantizacion";
import {
  detectarCapacidades,
  type Capacidades,
} from "@/lib/aurora/voz-starseed/capacidades";

import { InspectorNodo } from "@/components/laboratorio/inspector-nodo";
import { ComparadorVersiones } from "@/components/laboratorio/comparador-versiones";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePrompt } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// El mapa 3D (Canvas/WebGL) no puede renderizarse en el servidor.
const MapaGenoma3D = dynamic(() =>
  import("@/components/laboratorio/mapa-genoma-3d").then((m) => m.MapaGenoma3D),
{ ssr: false });

const NOMBRE_MEDIO: Record<Medio, string> = {
  texto: "Texto",
  voz: "Voz",
  imagen: "Imagen",
  video: "Vídeo",
  sonido: "Sonido",
  programa: "Programas",
  avatar: "Avatares",
  interaccion: "Interacción",
  red: "Red",
  permisos: "Permisos",
};

/** Parámetros (miles de millones) aproximados por medio, para la estimación de memoria. */
const PARAMETROS_POR_MEDIO: Partial<Record<Medio, number>> = {
  texto: 1.5,
  voz: 0.4,
  imagen: 0.8,
  video: 1.2,
  sonido: 0.3,
  programa: 0.5,
  avatar: 0.6,
  interaccion: 0.9,
  red: 0.2,
  permisos: 0.1,
};

function etiquetaMemoria(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(mb).toLocaleString("es-ES")} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña Hardware: plan por equipo, estimación de memoria y precisión por medio
// ─────────────────────────────────────────────────────────────────────────────
function PestanhaHardware() {
  const [capacidades, setCapacidades] = React.useState<Capacidades | null>(null);
  const [plan, setPlan] = React.useState<Record<Medio, PlanMedio> | null>(null);
  const [precisiones, setPrecisiones] = React.useState<Record<Medio, Precision> | null>(null);

  React.useEffect(() => {
    let activo = true;
    void detectarCapacidades().then((c) => {
      if (!activo) return;
      setCapacidades(c);
      setPlan(planPorHardware(c));
    });
    return () => {
      activo = false;
    };
  }, []);

  // Inicializa el selector de precisión con lo que sugiere el plan.
  React.useEffect(() => {
    if (!plan) return;
    const base = {} as Record<Medio, Precision>;
    for (const m of MEDIOS) {
      base[m] = plan[m].precision;
    }
    setPrecisiones(base);
  }, [plan]);

  const cambioPrecision = React.useCallback((medio: Medio, precision: Precision) => {
    setPrecisiones((prev) => {
      if (!prev) return prev;
      return { ...prev, [medio]: precision };
    });
  }, []);

  const planUI = React.useMemo<Record<Medio, PlanMedio> | null>(() => {
    if (!plan || !precisiones) return null;
    const resultado = {} as Record<Medio, PlanMedio>;
    for (const m of MEDIOS) {
      resultado[m] = { ...plan[m], precision: precisiones[m] ?? plan[m].precision };
    }
    return resultado;
  }, [plan, precisiones]);

  const memoria = React.useMemo(
    () => (planUI ? estimarMemoria(planUI, PARAMETROS_POR_MEDIO) : null),
    [planUI],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cpu className="h-5 w-5" />
            Adaptación por hardware
          </CardTitle>
          <CardDescription>
            Con qué precisión y nivel correría cada medio en este equipo, con la memoria
            estimada para avisar antes de que se ahogue. Ajusta la precisión por medio y
            observa el coste; ninguna decisión se aplica al OS desde aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Equipo detectado:</span>
            <Badge variant="secondary" className="cursor-default">
              {capacidades?.memoriaGB
                ? `${capacidades.memoriaGB} GB de RAM`
                : "memoria desconocida"}
            </Badge>
            {capacidades?.daemonLocal ? (
              <Badge variant="outline" className="cursor-default">
                Demonio local de voz activo
              </Badge>
            ) : null}
            {capacidades?.movil ? (
              <Badge variant="outline" className="cursor-default">
                Móvil
              </Badge>
            ) : null}
          </div>

          {!planUI || !memoria ? (
            <p className="text-sm text-muted-foreground">Sondeando el equipo…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medio</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Precisión</TableHead>
                  <TableHead className="text-right">Memoria</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MEDIOS.map((m) => {
                  const planMedio = planUI[m];
                  const info = PRECISIONES[planMedio.precision];
                  return (
                    <TableRow key={m}>
                      <TableCell className="font-medium">{NOMBRE_MEDIO[m]}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="cursor-default">
                          {planMedio.nivel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={planMedio.precision} onValueChange={(v) => cambioPrecision(m, v as Precision)}>
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PRECISIONES) as Precision[]).map((p) => (
                              <SelectItem key={p} value={p}>
                                {PRECISIONES[p].etiqueta}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {etiquetaMemoria(memoria.porMedio[m])}
                      </TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">
                        {planMedio.motivo} · {info.nota}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {memoria ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Memoria total estimada:</span>
              <span className="font-semibold">{etiquetaMemoria(memoria.totalMB)}</span>
              <span className="text-xs text-muted-foreground">
                ({memoria.totalMB.toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB)
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña Pruebas: elegir versión y lanzar el lote del banco
// ─────────────────────────────────────────────────────────────────────────────
function PestanhaPruebas({
  versiones,
  versionId,
  onCambiarVersion,
}: {
  versiones: VersionLab[];
  versionId: string;
  onCambiarVersion: (id: string) => void;
}) {
  const [resultado, setResultado] = React.useState<ResultadoBanco | null>(null);
  const [corriendo, setCorriendo] = React.useState(false);

  const version = versiones.find((v) => v.id === versionId) ?? null;

  const lanzar = React.useCallback(async () => {
    if (!version) return;
    setCorriendo(true);
    setResultado(null);
    // Pequeña pausa para dar sensación de ejecución y dejar respirar a la UI.
    await new Promise((r) => setTimeout(r, 250));
    setResultado(ejecutarBanco(version.instantanea));
    setCorriendo(false);
  }, [version]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Beaker className="h-5 w-5" />
            Banco de pruebas
          </CardTitle>
          <CardDescription>
            Ejecuta el lote de casos contra la instantánea de una versión para producir sus
            métricas. Es determinista: la misma versión siempre da el mismo resultado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-56 space-y-2">
              <Label htmlFor="prueba-version">Versión a probar</Label>
              <Select value={versionId} onValueChange={onCambiarVersion}>
                <SelectTrigger id="prueba-version" className="w-full">
                  <SelectValue placeholder="Elige una versión" />
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
            <Button type="button" onClick={() => void lanzar()} disabled={corriendo || !version} className="w-full sm:w-auto">
              <FlaskConical className="h-4 w-4" />
              {corriendo ? "Ejecutando…" : "Lanzar el lote"}
            </Button>
          </div>

          {versiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay versiones guardadas. Crea una con «Nueva versión» en la barra superior.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {resultado ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Métricas del lote</CardTitle>
              <CardDescription>{version?.nombre ? `Versión «${version.nombre}»` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Aciertos</p>
                  <p className="text-2xl font-semibold">
                    {resultado.metricas.aciertos}/{resultado.resultadoPorCaso.length}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Latencia</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {resultado.metricas.latenciaMs.toFixed(1)} ms
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Tokens</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {resultado.metricas.tokens.toLocaleString("es-ES")}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Motor</p>
                  <p className="text-sm font-medium break-words">
                    {resultado.resultadoPorCaso[0]?.motor ?? "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resultado por caso</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prueba</TableHead>
                    <TableHead>Salida</TableHead>
                    <TableHead className="text-right">Latencia</TableHead>
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.resultadoPorCaso.map((r) => (
                    <TableRow key={r.caso}>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.salida}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.latenciaMs} ms</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.acierto ? "secondary" : "destructive"}
                          className={r.acierto ? "cursor-default" : "cursor-default"}
                        >
                          {r.acierto ? "Superado" : "Fallado"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LaboratorioAstraura — export principal
// ─────────────────────────────────────────────────────────────────────────────
export function LaboratorioAstraura() {
  const prompt = usePrompt();

  const [genomas, setGenomas] = React.useState<Genoma[]>(() => cargarGenomas());
  const [genomaId, setGenomaId] = React.useState<string>("");
  const [nodoSeleccionado, setNodoSeleccionado] = React.useState<string | null>(null);
  const [versiones, setVersiones] = React.useState<VersionLab[]>([]);
  const [versionId, setVersionId] = React.useState<string>("");
  const [guardadoEn, setGuardadoEn] = React.useState<number>(0);

  React.useEffect(() => {
    if (!genomas.some((g) => g.id === genomaId)) {
      setGenomaId(genomas[0]?.id ?? "");
    }
  }, [genomas, genomaId]);

  React.useEffect(() => {
    const vs = versionesDe(genomaId);
    setVersiones(vs);
    setVersionId((prev) => (vs.some((v) => v.id === prev) ? prev : (vs[vs.length - 1]?.id ?? "")));
    setNodoSeleccionado(null);
  }, [genomaId]);

  const genomaActivo = genomas.find((g) => g.id === genomaId) ?? genomas[0] ?? null;

  const cambiarGenoma = React.useCallback((g: Genoma) => {
    setGenomas((prev) => prev.map((x) => (x.id === g.id ? g : x)));
  }, []);

  const refrescarVersiones = React.useCallback(() => {
    const vs = versionesDe(genomaId);
    setVersiones(vs);
    setVersionId((prev) => (vs.some((v) => v.id === prev) ? prev : (vs[vs.length - 1]?.id ?? "")));
  }, [genomaId]);

  const guardar = React.useCallback(() => {
    if (!genomaActivo) return;
    guardarGenoma(genomaActivo);
    setGuardadoEn(Date.now());
  }, [genomaActivo]);

  const nuevaVersion = React.useCallback(async () => {
    if (!genomaActivo) return;
    const nombre = await prompt({
      title: "Nueva versión",
      description: "Crea una instantánea congelada del genoma activo para probar con seguridad.",
      label: "Nombre de la versión",
      placeholder: "p. ej. Explorar temperatura 1.2",
    });
    if (nombre === null) return;
    const nota = await prompt({
      title: "Nota de la versión",
      description: "Describe brevemente esto que quieres probar (puedes dejarlo vacío).",
      label: "Nota",
      placeholder: "Qué cambia y por qué",
    });
    if (nota === null) return;
    crearVersion(genomaActivo, nombre.trim() || "Versión sin nombre", nota.trim());
    refrescarVersiones();
  }, [genomaActivo, prompt, refrescarVersiones]);

  const ramificarVersion = React.useCallback(async () => {
    if (!versionId) return;
    const nombre = await prompt({
      title: "Ramificar versión",
      description: "Crea una rama hija de la versión seleccionada para explorar una idea arriesgada.",
      label: "Nombre de la rama",
      placeholder: "p. ej. Rama experimental imagen",
    });
    if (nombre === null) return;
    const rama = ramificar(versionId, nombre.trim() || "Rama sin nombre");
    if (!rama) return;
    refrescarVersiones();
  }, [versionId, prompt, refrescarVersiones]);

  // Barra superior.
  const barraSuperior = (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        Laboratorio de Astraura
      </div>

      <div className="min-w-[11rem] flex-1 space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Genoma activo</Label>
        <Select value={genomaActivo?.id ?? ""} onValueChange={setGenomaId}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Elige un genoma" />
          </SelectTrigger>
          <SelectContent>
            {genomas.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[11rem] flex-1 space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Versión</Label>
        <Select value={versionId} onValueChange={setVersionId}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Sin versiones aún" />
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

      <div className="flex flex-wrap items-center gap-2 self-end">
        <Button type="button" variant="outline" size="sm" onClick={() => void nuevaVersion()} disabled={!genomaActivo}>
          <Plus className="h-4 w-4" />
          Nueva versión
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void ramificarVersion()} disabled={!versionId}>
          <GitBranch className="h-4 w-4" />
          Ramificar
        </Button>
        <Button type="button" size="sm" onClick={guardar} disabled={!genomaActivo}>
          <Save className="h-4 w-4" />
          Guardar
        </Button>
      </div>

      {guardadoEn > 0 ? (
        <span
          key={guardadoEn}
          className="self-end text-xs text-emerald-500"
          style={{ animation: "appear 0.5s ease" }}
        >
          Guardado
        </span>
      ) : null}
    </div>
  );

  if (!genomaActivo) {
    return (
      <div className="space-y-4">
        {barraSuperior}
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <p className="text-sm">No hay ningún genoma disponible.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {barraSuperior}

      <Tabs defaultValue="mapa">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="mapa">
            <Map className="h-4 w-4" />
            Mapa
          </TabsTrigger>
          <TabsTrigger value="pruebas">
            <Beaker className="h-4 w-4" />
            Pruebas
          </TabsTrigger>
          <TabsTrigger value="comparar">
            <GitBranch className="h-4 w-4" />
            Comparar
          </TabsTrigger>
          <TabsTrigger value="hardware">
            <Cpu className="h-4 w-4" />
            Hardware
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mapa" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="h-[34rem] overflow-hidden rounded-xl border border-border">
              <MapaGenoma3D
                genoma={genomaActivo}
                seleccionado={nodoSeleccionado}
                onSeleccionar={setNodoSeleccionado}
              />
            </div>
            <InspectorNodo
              genoma={genomaActivo}
              nodoId={nodoSeleccionado}
              onCambiar={cambiarGenoma}
            />
          </div>
        </TabsContent>

        <TabsContent value="pruebas" className="space-y-4">
          <PestanhaPruebas
            versiones={versiones}
            versionId={versionId}
            onCambiarVersion={setVersionId}
          />
        </TabsContent>

        <TabsContent value="comparar" className="space-y-4">
          <ComparadorVersiones genomaId={genomaId} />
        </TabsContent>

        <TabsContent value="hardware" className="space-y-4">
          <PestanhaHardware />
        </TabsContent>
      </Tabs>
    </div>
  );
}