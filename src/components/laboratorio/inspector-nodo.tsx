"use client";

// Inspector de nodo del laboratorio del genoma fásico.
// Permite entender y editar un nodo: qué es, sus parámetros y los enlaces
// que lo fusionan con otros sistemas del genoma.

import * as React from "react";
import {
  Info,
  Link2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
  TriangleAlert,
} from "lucide-react";

import {
  CAPAS,
  genomaBase,
  type CapaId,
  type Genoma,
  type MedioNodo,
  type NodoGenoma,
} from "@/lib/laboratorio/genoma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MEDIO_LABEL: Record<MedioNodo, string> = {
  texto: "Texto",
  voz: "Voz",
  imagen: "Imagen",
  video: "Vídeo",
  sonido: "Sonido",
  programa: "Programa",
  avatar: "Avatar",
  interaccion: "Interacción",
  red: "Red",
  permisos: "Permisos",
};

const EXPLICA_ENLACE: Record<CapaId, string> = {
  nucleo: "integra las reglas matemáticas base del sistema",
  proposito: "alinea el comportamiento con la Tríada StarSeed",
  instinto: "une reflejos y prioridades de reacción inmediata",
  intuicion: "enlaza heurísticas aprendidas por la experiencia",
  creatividad: "funde divergencia e imaginación para explorar lo inédito",
  capacidad: "habilita un medio o capacidad concreta",
  datos: "vincula corpus, memorias y recuerdos relevantes",
  caracter: "une la personalidad activa y su forma de ser",
  contexto: "conecta permisos y sabiduría vigentes",
};

function rangoSensato(clave: string, valor: number): { min: number; max: number; step: number } {
  const k = clave.toLowerCase();
  if (/temperatura/i.test(k)) {
    return { min: 0, max: 2, step: 0.05 };
  }
  if (/probabilidad|umbral|nivel|suavizado|vibrato|importancia|top|ratio|fresco|temporal/i.test(k)) {
    return { min: 0, max: 1, step: 0.01 };
  }
  if (/flops|entrada|tokens|duracion|resolucion|frecuencia|fps|semilla|segundo|ttl|maximo|canal|articulacion|bit/i.test(k)) {
    const v = valor > 0 ? valor : 1;
    const mag = Math.max(1, Math.pow(10, Math.ceil(Math.log10(v * 4))));
    return { min: 0, max: mag, step: mag / 100 };
  }
  if (Number.isInteger(valor)) {
    return { min: 0, max: Math.max(1, Math.ceil(valor * 2)), step: 1 };
  }
  const max = Math.max(1, valor * 2);
  return { min: 0, max: Math.round(max * 100) / 100, step: 0.05 };
}

function actualizarParametro(
  g: Genoma,
  nodoId: string,
  clave: string,
  valor: number | string | boolean,
): Genoma {
  return {
    ...g,
    nodos: g.nodos.map((n) =>
      n.id === nodoId ? { ...n, parametros: { ...n.parametros, [clave]: valor } } : n,
    ),
  };
}

function actualizarEnlaces(
  g: Genoma,
  nodoId: string,
  enlaces: string[],
): Genoma {
  return {
    ...g,
    nodos: g.nodos.map((n) => (n.id === nodoId ? { ...n, enlaces } : n)),
  };
}

export interface InspectorNodoProps {
  genoma: Genoma;
  nodoId: string | null;
  onCambiar: (g: Genoma) => void;
}

export function InspectorNodo({ genoma, nodoId, onCambiar }: InspectorNodoProps) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const confirmadoRef = React.useRef<Set<string>>(new Set());

  const nodo = nodoId ? genoma.nodos.find((n) => n.id === nodoId) : undefined;

  const aplicarParametro = React.useCallback(
    async (clave: string, valor: number | string | boolean) => {
      if (!nodo) return;
      const capa = CAPAS[nodo.capa];
      const requierenConfirmacion = capa.mutabilidad < 0.2;
      if (requierenConfirmacion && !confirmadoRef.current.has(nodo.id)) {
        const ok = await confirm({
          title: "Tocando lo esencial",
          description:
            `«${nodo.nombre}» pertenece a la capa «${capa.nombre}», casi inmutable (mutabilidad ${capa.mutabilidad}). ` +
            "Confirmar aquí es tocar algo fundamental del genoma. ¿Continuar?",
          confirmText: "Sí, cambiar",
          cancelText: "Cancelar",
          destructive: true,
        });
        if (!ok) return;
        confirmadoRef.current.add(nodo.id);
      }
      onCambiar(actualizarParametro(genoma, nodo.id, clave, valor));
    },
    [confirm, genoma, nodo, onCambiar],
  );

  const quitarEnlace = React.useCallback(
    (destino: string) => {
      if (!nodo) return;
      onCambiar(actualizarEnlaces(genoma, nodo.id, nodo.enlaces.filter((e) => e !== destino)));
    },
    [genoma, nodo, onCambiar],
  );

  const añadirEnlace = React.useCallback(async () => {
    if (!nodo) return;
    const candidatoId = await prompt({
      title: "Fusionar con un nodo",
      description:
        "Introduce el id de un nodo del genoma para enlazarlo (fusionar sus sistemas).",
      label: "Id del nodo",
      placeholder: "p. ej. nuc-contexto",
    });
    if (candidatoId === null) return;
    const destino = genoma.nodos.find((n) => n.id === candidatoId.trim());
    if (!destino) return;
    if (destino.id === nodo.id || nodo.enlaces.includes(destino.id)) return;
    onCambiar(actualizarEnlaces(genoma, nodo.id, [...nodo.enlaces, destino.id]));
  }, [confirm, genoma, nodo, onCambiar, prompt]);

  if (!nodo) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
          <div>
            <Info className="mx-auto mb-3 h-8 w-8" />
            <p className="text-sm">Selecciona un nodo del genoma para inspeccionarlo.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const capa = CAPAS[nodo.capa];
  const fundamental = capa.mutabilidad < 0.2;
  const fraseCapa = fundamental
    ? "Capa esencial: cámbiala con cuidado."
    : "Capa cambiante: aquí se aprende.";
  const baseNodo = genomaBase().nodos.find((n) => n.id === nodo.id);
  const enlaces = nodo.enlaces
    .map((id) => genoma.nodos.find((n) => n.id === id))
    .filter((n): n is NodoGenoma => n !== undefined);

  const valorPorDefecto = (clave: string): number | string | boolean => {
    const base = baseNodo?.parametros[clave];
    return base !== undefined ? base : nodo.parametros[clave];
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{nodo.nombre}</CardTitle>
          <Badge
            variant="outline"
            style={{ color: capa.color, borderColor: capa.color }}
            className="cursor-default"
          >
            Capa {capa.indice} · {capa.nombre}
          </Badge>
          {nodo.medio ? (
            <Badge variant="secondary" className="cursor-default">
              Medio: {MEDIO_LABEL[nodo.medio]}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          <span style={{ color: capa.color }}>●</span>{" "}
          <span className="text-foreground/90">{fraseCapa}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {fundamental ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Estás tocando algo fundamental: los parámetros de esta capa son casi inmutables.
              Se pedirá confirmación antes de aplicar cada cambio.
            </p>
          </div>
        ) : null}

        <Tabs defaultValue="que-es" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="que-es">Qué es</TabsTrigger>
            <TabsTrigger value="parametros">Parámetros</TabsTrigger>
            <TabsTrigger value="conexiones">Conexiones</TabsTrigger>
          </TabsList>

          <TabsContent value="que-es" className="space-y-4">
            <div>
              <Label>Descripción</Label>
              <p className="mt-1 text-sm text-muted-foreground">{nodo.descripcion}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Mutabilidad</p>
                <p className="font-medium">{Math.round(capa.mutabilidad * 100)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Origen</p>
                <p className="font-medium capitalize">
                  {nodo.origen === "usuario" ? "Del usuario" : "Por defecto"}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="parametros" className="space-y-4">
            {Object.entries(nodo.parametros).map(([clave, valor]) => {
              const defecto = valorPorDefecto(clave);
              const esDefecto = defecto === valor;
              return (
                <div key={clave} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="font-medium capitalize">{clave}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={esDefecto}
                      onClick={() => void aplicarParametro(clave, defecto)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restablecer
                    </Button>
                  </div>

                  {typeof valor === "boolean" ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Defecto: {defecto ? "activo" : "inactivo"}
                      </span>
                      <Switch
                        checked={valor}
                        onCheckedChange={(v) => void aplicarParametro(clave, v)}
                        aria-label={`Alterar parámetro ${clave}`}
                      />
                    </div>
                  ) : typeof valor === "number" ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Defecto: {defecto}</span>
                        <span className="font-medium text-foreground">{valor}</span>
                      </div>
                      <Slider
                        value={[valor]}
                        min={rangoSensato(clave, valor).min}
                        max={rangoSensato(clave, valor).max}
                        step={rangoSensato(clave, valor).step}
                        onValueChange={(v) => void aplicarParametro(clave, v[0])}
                        aria-label={`Alterar valor numérico de ${clave}`}
                      />
                    </div>
                  ) : (
                    <Input
                      value={String(valor)}
                      onChange={(e) => void aplicarParametro(clave, e.target.value)}
                      aria-label={`Editar texto de ${clave}`}
                    />
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="conexiones" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link2 className="h-4 w-4" />
                Sistemas enlazados ({enlaces.length})
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void añadirEnlace()}>
                <Plus className="h-4 w-4" />
                Fusionar
              </Button>
            </div>

            {enlaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este nodo no enlaza con otros. Úsalo para fusionar sistemas.
              </p>
            ) : (
              <ul className="space-y-2">
                {enlaces.map((destino) => {
                  const infoDest = CAPAS[destino.capa];
                  return (
                    <li
                      key={destino.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{destino.nombre}</span>
                          <Badge
                            variant="outline"
                            style={{ color: infoDest.color, borderColor: infoDest.color }}
                            className="cursor-default"
                          >
                            {infoDest.nombre}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {destino.id} — {EXPLICA_ENLACE[destino.capa]}.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        aria-label={`Quitar enlace con ${destino.nombre}`}
                        onClick={() => quitarEnlace(destino.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}