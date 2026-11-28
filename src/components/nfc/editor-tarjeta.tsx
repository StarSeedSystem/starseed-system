"use client";

import { useId, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  CirclePlus,
  Edit2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  TIPO_TARJETA_OFERTA,
  accionPrincipalPorTipo,
  crearTarjetaOferta,
  type TarjetaOferta,
  type TipoTarjetaOferta,
  type ResultadoCrearTarjetaOferta,
  type ContenidoTarjetaOferta,
} from "@/lib/nfc/tarjetas-oferta";
import { NOMBRE_TIPO_TARJETA, NOMBRE_ACCION_TARJETA, type AccionPrincipalTarjeta } from "@/components/nfc/tarjeta-oferta";

export const PLANTILLAS_POR_TIPO: Record<TipoTarjetaOferta, ContenidoTarjetaOferta> = {
  presentacion: { texto: "", enlaces: [] },
  amistad: { texto: "", enlaces: [] },
  evento: { titulo: "", lugar: "", fecha: "", descripcion: "" },
  pagina: { url: "", titulo: "" },
  grupo: { nombre: "", descripcion: "", slug: "" },
  partido: { nombre: "", descripcion: "", slug: "" },
  perfil: { userId: "", username: "", avatarUrl: "" },
  cuenta: { id: "", nombre: "", tipo: "" },
  cerebro: { id: "", nombre: "", descripcion: "" },
  repositorio: { url: "", nombre: "", descripcion: "" },
  archivo: { url: "", nombre: "", tipo: "", tamaño: 0 },
  app: { id: "", nombre: "", descripcion: "", icono: "" },
  programa: { id: "", nombre: "", descripcion: "", version: "" },
  enlace_libre: { url: "", titulo: "", descripcion: "" },
};

export function plantillaParaTipo(tipo: TipoTarjetaOferta): ContenidoTarjetaOferta {
  return PLANTILLAS_POR_TIPO[tipo] ?? {};
}

export function validarTitulo(titulo: string): string | null {
  if (!titulo.trim()) return "El título es obligatorio.";
  if (titulo.length > 100) return "El título no puede superar 100 caracteres.";
  return null;
}

export function validarContenido(contenido: unknown): string | null {
  if (!contenido || typeof contenido !== "object" || Array.isArray(contenido)) {
    return "El contenido debe ser un objeto.";
  }
  return null;
}

export function validarCaducidad(caducidad: string, ahora = Date.now()): string | null {
  if (!caducidad) return null;
  const fecha = new Date(caducidad);
  if (isNaN(fecha.getTime())) return "Fecha de caducidad no válida.";
  if (fecha.getTime() <= ahora) return "La caducidad debe ser posterior a la emisión.";
  return null;
}

export interface EditorTarjetaProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  emisor: string;
  tarjetaInicial?: TarjetaOferta;
  onGuardado?: (tarjeta: TarjetaOferta) => void;
}

const CLASE_CAMPO = "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:bg-white/10 transition-all [&_svg]:pointer-events-none";
const CLASE_BOTON = "inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed";
const CLASE_BOTON_PRINCIPAL = "inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed";
const CLASE_BOTON_ICONO = "inline-flex cursor-pointer items-center justify-center rounded-xl p-2 text-white/60 hover:text-white/90 hover:bg-white/10 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed";

function Bloque({ titulo, icono: Icono, children, ayuda }: { titulo: string; icono: typeof Sparkles; children: ReactNode; ayuda?: string }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="mb-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-white">
        <Icono className="h-4 w-4 text-primary" aria-hidden />
        {titulo}
      </legend>
      {ayuda ? <p className="-mt-1 text-xs text-white/50">{ayuda}</p> : null}
      {children}
    </fieldset>
  );
}

function MensajeError({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return <p id={id} className="text-xs text-rose-300">{texto}</p>;
}

function CampoTexto({
  id,
  label,
  valor,
  onCambio,
  placeholder,
  error,
  tipo = "text",
  autoComplete = "off",
}: {
  id: string;
  label: string;
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
  error?: string;
  tipo?: string;
  autoComplete?: string;
}) {
  const idError = `${id}-err`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-white/65">
        {label}
      </label>
      <Input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={cn(CLASE_CAMPO, error && "border-rose-400/60")}
      />
      <MensajeError id={idError} texto={error} />
    </div>
  );
}

function CampoTextarea({
  id,
  label,
  valor,
  onCambio,
  placeholder,
  error,
  rows = 3,
}: {
  id: string;
  label: string;
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
  error?: string;
  rows?: number;
}) {
  const idError = `${id}-err`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-white/65">
        {label}
      </label>
      <Textarea
        id={id}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={cn(CLASE_CAMPO, "resize-y", error && "border-rose-400/60")}
      />
      <MensajeError id={idError} texto={error} />
    </div>
  );
}

function SelectorTipo({
  valor,
  onCambio,
  error,
}: {
  valor: TipoTarjetaOferta;
  onCambio: (v: TipoTarjetaOferta) => void;
  error?: string;
}) {
  const id = useId();
  const idError = `${id}-err`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-white/65">
        Tipo de tarjeta <span className="text-white/40">(obligatorio)</span>
      </label>
      <Select value={valor} onValueChange={onCambio} aria-invalid={error ? true : undefined} aria-describedby={error ? idError : undefined}>
        <SelectTrigger id={id} className={cn(CLASE_CAMPO, "cursor-pointer [&_svg]:pointer-events-none", error && "border-rose-400/60")}>
          <SelectValue placeholder="Elige el tipo" />
        </SelectTrigger>
        <SelectContent className="bg-black/90 border-white/10 text-white" position="popper">
          {TIPO_TARJETA_OFERTA.map((t) => (
            <SelectItem key={t} value={t}>
              {NOMBRE_TIPO_TARJETA[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MensajeError id={idError} texto={error} />
    </div>
  );
}

function VistaPreviaContenido({ contenido, tipo }: { contenido: ContenidoTarjetaOferta; tipo: TipoTarjetaOferta }) {
  const accion = accionPrincipalPorTipo(tipo);
  const etiquetaAccion = NOMBRE_ACCION_TARJETA[accion];
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-medium text-white/60 mb-2">Vista previa del contenido</p>
      <div className="flex items-center gap-2 text-sm">
        <ExternalLink className="h-4 w-4 text-primary" aria-hidden />
        <span className="text-white/80">{etiquetaAccion}</span>
      </div>
      <pre className="mt-2 text-xs text-white/50 overflow-auto max-h-32">
        {JSON.stringify(contenido, null, 2)}
      </pre>
    </div>
  );
}

function EditorContenidoLibre({
  tipo,
  contenido,
  onCambio,
}: {
  tipo: TipoTarjetaOferta;
  contenido: ContenidoTarjetaOferta;
  onCambio: (c: ContenidoTarjetaOferta) => void;
}) {
  const [jsonTexto, setJsonTexto] = useState(JSON.stringify(contenido, null, 2));
  const [errorJson, setErrorJson] = useState<string | null>(null);

  const manejarCambioJson = (texto: string) => {
    setJsonTexto(texto);
    try {
      const parsed = JSON.parse(texto);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setErrorJson(null);
        onCambio(parsed as ContenidoTarjetaOferta);
      } else {
        setErrorJson("El contenido debe ser un objeto JSON.");
      }
    } catch {
      setErrorJson("JSON no válido.");
    }
  };

  const plantilla = plantillaParaTipo(tipo);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { manejarCambioJson(JSON.stringify(plantilla, null, 2)); setJsonTexto(JSON.stringify(plantilla, null, 2)); }}>
          <CirclePlus className="h-4 w-4" aria-hidden />
          Usar plantilla
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { manejarCambioJson(JSON.stringify({}, null, 2)); setJsonTexto(JSON.stringify({}, null, 2)); }}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Limpiar
        </Button>
      </div>
      <Textarea
        value={jsonTexto}
        onChange={(e) => manejarCambioJson(e.target.value)}
        placeholder='{"clave": "valor"}'
        rows={8}
        className={cn(CLASE_CAMPO, "font-mono text-xs", errorJson && "border-rose-400/60")}
        aria-invalid={errorJson ? true : undefined}
        aria-describedby={errorJson ? "json-error" : undefined}
      />
      {errorJson && <p id="json-error" className="text-xs text-rose-300">{errorJson}</p>}
      <VistaPreviaContenido contenido={contenido} tipo={tipo} />
    </div>
  );
}

export function EditorTarjeta({ open, onOpenChange, emisor, tarjetaInicial, onGuardado }: EditorTarjetaProps) {
  const base = useId();
  const esEdicion = Boolean(tarjetaInicial);

  const [tipo, setTipo] = useState<TipoTarjetaOferta>(tarjetaInicial?.tipo ?? "presentacion");
  const [titulo, setTitulo] = useState(tarjetaInicial?.titulo ?? "");
  const [contenido, setContenido] = useState<ContenidoTarjetaOferta>(tarjetaInicial?.contenido ?? {});
  const [caducidad, setCaducidad] = useState<string>(tarjetaInicial?.caducidad ? new Date(tarjetaInicial.caducidad).toISOString().slice(0, 16) : "");
  const [firmar, setFirmar] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const validar = (): boolean => {
    const nuevosErrores: Record<string, string> = {};
    const errTitulo = validarTitulo(titulo);
    if (errTitulo) nuevosErrores.titulo = errTitulo;
    const errContenido = validarContenido(contenido);
    if (errContenido) nuevosErrores.contenido = errContenido;
    const errCaducidad = validarCaducidad(caducidad);
    if (errCaducidad) nuevosErrores.caducidad = errCaducidad;
    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      const emitidaEn = Date.now();
      const caducidadMs = caducidad ? new Date(caducidad).getTime() : undefined;
      const resultado: ResultadoCrearTarjetaOferta = crearTarjetaOferta({
        tipo,
        emisor,
        titulo: titulo.trim(),
        contenido,
        emitidaEn,
        caducidad: caducidadMs,
      });
      if (!resultado.ok) {
        setErrores({ general: resultado.errores.join(", ") });
        return;
      }
      onGuardado?.(resultado.tarjeta);
      onOpenChange(false);
    } catch (e) {
      setErrores({ general: (e as Error).message || "No se pudo crear la tarjeta." });
    } finally {
      setGuardando(false);
    }
  };

  const accion = accionPrincipalPorTipo(tipo);
  const etiquetaTipo = NOMBRE_TIPO_TARJETA[tipo];
  const etiquetaAccion = NOMBRE_ACCION_TARJETA[accion];

  return (
    <Dialog open={open} onOpenChange={(v) => !guardando && onOpenChange(v)}>
      <DialogContent
        className={cn(
          "gap-0 p-0 text-white sm:max-h-[min(92dvh,920px)] sm:max-w-2xl sm:rounded-[24px]",
          "max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0",
        )}
        data-testid="editor-tarjeta"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          className="flex min-h-full flex-col"
          noValidate
        >
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[rgba(10,12,30,0.88)] px-5 py-4 pr-16 backdrop-blur-xl">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[18px] font-semibold leading-tight text-white">
                {esEdicion ? "Editar tarjeta" : "Nueva tarjeta"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-white/55">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Firma del emisor: {firmar ? "Sí" : "No"} · Acción: {etiquetaAccion}
              </DialogDescription>
            </div>
          </header>

          <div className="flex flex-col gap-6 px-5 py-5">
            <Bloque titulo="Tipo de tarjeta" icono={Sparkles} ayuda="Define la acción principal al recibir la tarjeta.">
              <SelectorTipo valor={tipo} onCambio={setTipo} error={errores.tipo} />
              <p className="text-xs text-white/50">
                Acción principal: <strong className="text-white">{etiquetaAccion}</strong>
              </p>
            </Bloque>

            <Bloque titulo="Título" icono={Edit2} ayuda="Máximo 100 caracteres.">
              <CampoTexto
                id={`${base}-titulo`}
                label="Título"
                valor={titulo}
                onCambio={setTitulo}
                placeholder="Ej: Mi presentación, Invitación al evento, Enlace al repositorio…"
                error={errores.titulo}
                autoComplete="off"
              />
            </Bloque>

            <Bloque
              titulo="Contenido (diseño libre)"
              icono={ExternalLink}
              ayuda="JSON editable. Usa la plantilla del tipo o escribe tu propio contenido. Se vincula a la Protomolécula/lienzo universal."
            >
              <EditorContenidoLibre tipo={tipo} contenido={contenido} onCambio={setContenido} />
            </Bloque>

            <Bloque titulo="Caducidad (opcional)" icono={CalendarClock} ayuda="Si se deja vacío, la tarjeta no caduca.">
              <CampoTexto
                id={`${base}-caducidad`}
                label="Fecha y hora de caducidad"
                valor={caducidad}
                onCambio={setCaducidad}
                placeholder="YYYY-MM-DDTHH:MM"
                tipo="datetime-local"
                error={errores.caducidad}
              />
            </Bloque>

            <Bloque titulo="Firma del emisor" icono={ShieldCheck} ayuda="La tarjeta se firma con la clave Ed25519 de la neurona al enviarse.">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <label className="text-sm font-medium text-white">Firmar esta tarjeta</label>
                  <p className="text-xs text-white/50">Añade firma Ed25519 para verificar autenticidad.</p>
                </div>
                <Switch
                  checked={firmar}
                  onCheckedChange={setFirmar}
                  aria-label="Firmar tarjeta"
                />
              </div>
            </Bloque>

            {errores.general && (
              <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                {errores.general}
              </p>
            )}
          </div>

          <footer className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] bg-[rgba(10,12,30,0.9)] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            <p role="alert" aria-live="assertive" className="mr-auto text-xs text-rose-300">
              {Object.keys(errores).filter((k) => k !== "general").length
                ? `Revisa ${Object.keys(errores).filter((k) => k !== "general").length} campo${Object.keys(errores).filter((k) => k !== "general").length > 1 ? "s" : ""} marcado${Object.keys(errores).filter((k) => k !== "general").length > 1 ? "s" : ""}.`
                : ""}
            </p>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={guardando} className={CLASE_BOTON}>
              <X className="h-4 w-4" aria-hidden />
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} className={CLASE_BOTON_PRINCIPAL}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {esEdicion ? "Guardar cambios" : "Crear tarjeta"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditorTarjeta;