"use client";

// ══════════════════════════════════════════════════════════════
// Diálogo «Nuevo vínculo» — Ola 281 · E3 (2026-09-07)
// Nombre, permisos (interruptores con descripción) y caducidad. Al
// crear muestra el token completo UNA sola vez con «Copiar», su ejemplo
// curl y el aviso de no volver a mostrarse. El token nunca se persiste
// ni se loguea: vive solo en el estado local mientras el diálogo existe.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
// (2026-09-08) Desde `tipos.ts`, no desde `vinculos.ts`: aquel importa
// `node:crypto` y traerlo a un componente de cliente rompía el build de
// producción («UnhandledSchemeError: Reading from "node:crypto"»).
import type { PermisosVinculo } from "@/lib/externos/tipos";
import { PERMISOS_DEFECTO } from "@/lib/externos/tipos";
import {
  crearVinculoCliente,
  ejemploCurl,
  type AmbitoExterno,
  type VinculoCreado,
} from "@/lib/externos/cliente";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export interface NuevoVinculoProps {
  ambito: AmbitoExterno;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  onCreado: () => void;
}

/** Opciones de caducidad: etiqueta → días (null = nunca). */
const CADUCIDADES: { dias: number | null; etiqueta: string }[] = [
  { dias: 1 / 24, etiqueta: "1 hora" },
  { dias: 1, etiqueta: "1 día" },
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: null, etiqueta: "nunca" },
];

/** Descripción de cada permiso para la UI. */
const DESCRIPCIONES: Record<keyof PermisosVinculo, { titulo: string; ayuda: string }> = {
  leer: { titulo: "Leer", ayuda: "Consultar el estado y la actividad de este ámbito." },
  escribir: { titulo: "Escribir", ayuda: "Enviar mensajes o peticiones (p. ej. chatear)." },
  hablar: { titulo: "Hablar", ayuda: "Generar respuestas habladas con la voz del ámbito." },
  memoria: { titulo: "Memoria", ayuda: "Leer las memorias y recuerdos del ámbito." },
  herramientas: { titulo: "Herramientas", ayuda: "Invocar herramientas y acciones del OS." },
};

export function NuevoVinculo({ ambito, abierto, onAbierto, onCreado }: NuevoVinculoProps) {
  const [nombre, setNombre] = useState("");
  const [permisos, setPermisos] = useState<PermisosVinculo>({ ...PERMISOS_DEFECTO });
  const [caducidad, setCaducidad] = useState<string>("30 días");
  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState<VinculoCreado | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Reinicia el formulario cada vez que se abre el diálogo.
  useEffect(() => {
    if (abierto) {
      setNombre("");
      setPermisos({ ...PERMISOS_DEFECTO });
      setCaducidad("30 días");
      setCreado(null);
      setCopiado(false);
    }
  }, [abierto]);

  const caducaEnDias = CADUCIDADES.find((c) => c.etiqueta === caducidad)?.dias ?? 30;

  const alternar = (clave: keyof PermisosVinculo) =>
    setPermisos((p) => ({ ...p, [clave]: !p[clave] }));

  const crear = async () => {
    setCreando(true);
    const r = await crearVinculoCliente(ambito, { nombre, permisos, caducaEnDias: caducaEnDias });
    setCreando(false);
    if (!r.ok || !r.creado) {
      toast.error(r.error ?? "No se pudo crear el vínculo.");
      return;
    }
    setCreado(r.creado);
    onCreado();
  };

  const copiarToken = async () => {
    if (!creado) return;
    try {
      await navigator.clipboard.writeText(creado.token);
      setCopiado(true);
    } catch {
      toast.error("No se pudo copiar al portapapeles.");
    }
  };

  const cerrar = () => {
    onAbierto(false);
    setCreado(null);
    setCopiado(false);
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? onAbierto(true) : cerrar())}>
      <DialogContent>
        {creado ? (
          <VerToken creado={creado} copiado={copiado} onCopiar={copiarToken} onCerrar={cerrar} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nuevo vínculo externo</DialogTitle>
              <DialogDescription>
                Un token de acceso para que otras apps hablen con {ambito.nombre ?? "este ámbito"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nombre-vinculo">Nombre</Label>
                <Input
                  id="nombre-vinculo"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="p. ej. bot de Telegram"
                />
              </div>
              <Permisos permisos={permisos} onAlternar={alternar} />
              <Caducidad valor={caducidad} onCambiar={setCaducidad} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
              <Button onClick={() => void crear()} disabled={creando || !nombre.trim()}>
                {creando ? "Creando…" : "Crear vínculo"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Interruptores de permisos con su descripción. */
function Permisos({
  permisos,
  onAlternar,
}: {
  permisos: PermisosVinculo;
  onAlternar: (clave: keyof PermisosVinculo) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Permisos</Label>
      <div className="space-y-1 rounded-lg border p-2">
        {(Object.keys(DESCRIPCIONES) as (keyof PermisosVinculo)[]).map((clave) => (
          <div key={clave} className="flex items-center justify-between gap-2 py-1">
            <div className="min-w-0">
              <p className="text-sm font-medium">{DESCRIPCIONES[clave].titulo}</p>
              <p className="text-xs text-muted-foreground">{DESCRIPCIONES[clave].ayuda}</p>
            </div>
            <Switch checked={permisos[clave]} onCheckedChange={() => onAlternar(clave)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Selector de caducidad con aviso cuando se elige «nunca». */
function Caducidad({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  const esNunca = valor === "nunca";
  return (
    <div className="space-y-1.5">
      <Label>Caducidad</Label>
      <Select value={valor} onValueChange={onCambiar}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CADUCIDADES.map((c) => (
            <SelectItem key={c.etiqueta} value={c.etiqueta}>{c.etiqueta}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {esNunca ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-500">
          <TriangleAlert className="h-3.5 w-3.5" />
          Sin caducidad: el token durará hasta que lo revoques tú.
        </p>
      ) : null}
    </div>
  );
}

/** Pantalla de token generado: se muestra UNA sola vez, con copiar y ejemplo curl. */
function VerToken({
  creado,
  copiado,
  onCopiar,
  onCerrar,
}: {
  creado: VinculoCreado;
  copiado: boolean;
  onCopiar: () => void;
  onCerrar: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Vínculo creado
        </DialogTitle>
        <DialogDescription>
          Guarda el token ahora: no volverá a mostrarse.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <code className="block rounded-lg border bg-muted p-3 font-mono text-xs break-all">
          {creado.token}
        </code>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{`ssk_${creado.vinculo.prefijo}…`}</Badge>
          <Badge variant="outline">
            {creado.vinculo.expira_en ? "con caducidad" : "sin caducidad"}
          </Badge>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Ejemplo de uso (curl)</p>
          <pre className="rounded-lg border bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
            {ejemploCurl(creado.vinculo.prefijo, { tipo: creado.vinculo.ambito_tipo, id: creado.vinculo.ambito_id })}
          </pre>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-amber-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Este token solo se muestra ahora. Si lo pierdes, revócalo y crea otro.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCopiar}>
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
        <Button onClick={onCerrar}>Entendido</Button>
      </DialogFooter>
    </>
  );
}