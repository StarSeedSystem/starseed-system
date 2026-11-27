"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCIONES_LUGAR, TIPOS_OFERTA, configPorDefecto, prepararEtiqueta, resumenParaVisitante, validarConfig,
  type AccionLugar, type ConfigNodo, type EtiquetaNdef, type GuardaVisitante, type OfertaNodo, type TipoOferta, type TipoNodo,
} from "@/lib/nfc/nodo-oferta";

const NOMBRE_OFERTA: Record<TipoOferta, string> = {
  informacion: "Información", app: "App", publicacion: "Publicación", pagina: "Página de StarSeed OS",
  enlace: "Enlace funcional", archivo: "Archivo", folder: "Folder", capa: "Capa de conciencia",
};
const NOMBRE_ACCION: Record<AccionLugar, string> = {
  registro_evento: "Registro de entrada a evento", casa: "Casa", espacio_publico: "Espacio público",
  registro_visitas: "Registro de visitas", notificacion: "Notificación al dueño", ubicacion_mapa: "Ubicación en el mapa de señales",
};

interface Props {
  tipo?: TipoNodo;
  inicial?: ConfigNodo;
  /** Guarda la configuración del nodo (neurona en modo nodo). */
  onGuardar?: (c: ConfigNodo) => void;
  /** Escribe la etiqueta con `nfc_escribir_etiqueta` (Protomolécula / lienzo universal). */
  onEscribirEtiqueta?: (e: EtiquetaNdef) => void;
}

export function ConfigurarNodoNfc({ tipo = "neurona", inicial, onGuardar, onEscribirEtiqueta }: Props) {
  const [cfg, setCfg] = useState<ConfigNodo>(inicial ?? configPorDefecto(tipo));
  const validacion = useMemo(() => validarConfig(cfg), [cfg]);
  const errores = validacion.ok ? [] : validacion.errores;
  const cambiar = (c: Partial<ConfigNodo>) => setCfg((a) => ({ ...a, ...c }));
  const cambiarOferta = (i: number, o: Partial<OfertaNodo>) =>
    cambiar({ ofertas: cfg.ofertas.map((x, j) => (j === i ? { ...x, ...o } : x)) });
  const alternar = (a: AccionLugar) =>
    cambiar({ acciones: cfg.acciones.includes(a) ? cfg.acciones.filter((x) => x !== a) : [...cfg.acciones, a] });

  const escribir = () => {
    const r = prepararEtiqueta(cfg);
    if (r.ok) onEscribirEtiqueta?.(r.etiqueta);
  };

  return (
    <section aria-label="Configurar nodo NFC" data-testid="configurar-nodo-nfc" className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
      <Input aria-label="Nombre del nodo" placeholder="Nombre del nodo" value={cfg.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Oferta</legend>
        {cfg.ofertas.map((o, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <select aria-label={`Tipo de la oferta ${i + 1}`} className="cursor-pointer rounded-md border bg-transparent px-2 py-1 text-sm" value={o.tipo} onChange={(e) => cambiarOferta(i, { tipo: e.target.value as TipoOferta })}>
              {TIPOS_OFERTA.map((t) => <option key={t} value={t}>{NOMBRE_OFERTA[t]}</option>)}
            </select>
            <Input aria-label={`Título de la oferta ${i + 1}`} className="w-40" placeholder="Título" value={o.titulo} onChange={(e) => cambiarOferta(i, { titulo: e.target.value })} />
            <Input aria-label={`Destino de la oferta ${i + 1}`} className="w-56" placeholder="/ruta, id o https://…" value={o.destino} onChange={(e) => cambiarOferta(i, { destino: e.target.value })} />
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => cambiar({ ofertas: cfg.ofertas.filter((_, j) => j !== i) })}>Quitar</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-fit cursor-pointer" onClick={() => cambiar({ ofertas: [...cfg.ofertas, { tipo: "pagina", titulo: "", destino: "" }] })}>Añadir oferta</Button>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Acciones del lugar</legend>
        {ACCIONES_LUGAR.map((a) => (
          <label key={a} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="cursor-pointer" checked={cfg.acciones.includes(a)} onChange={() => alternar(a)} />
            {NOMBRE_ACCION[a]}
          </label>
        ))}
        {cfg.acciones.includes("registro_evento") && (
          <Input aria-label="Evento" placeholder="Id del evento" value={cfg.eventoId ?? ""} onChange={(e) => cambiar({ eventoId: e.target.value })} />
        )}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-2 text-sm">
        <legend className="text-sm font-medium">Qué guarda del visitante</legend>
        <select aria-label="Qué guarda" className="cursor-pointer rounded-md border bg-transparent px-2 py-1" value={cfg.privacidad.guarda}
          onChange={(e) => { const g = e.target.value as GuardaVisitante; cambiar({ privacidad: { guarda: g, retencionDias: g === "nada" ? 0 : cfg.privacidad.retencionDias || 30 } }); }}>
          <option value="nada">Nada</option>
          <option value="alias">Alias</option>
          <option value="cuenta">Cuenta</option>
        </select>
        {cfg.privacidad.guarda !== "nada" && (
          <Input aria-label="Días de retención" type="number" min={1} max={365} className="w-24" value={cfg.privacidad.retencionDias}
            onChange={(e) => cambiar({ privacidad: { ...cfg.privacidad, retencionDias: Number(e.target.value) } })} />
        )}
        <select aria-label="Mapa de señales" className="cursor-pointer rounded-md border bg-transparent px-2 py-1" value={cfg.mapa} onChange={(e) => cambiar({ mapa: e.target.value as ConfigNodo["mapa"] })}>
          <option value="privada">Mapa privado</option>
          <option value="publica">Mapa público</option>
        </select>
      </fieldset>

      {validacion.ok ? (
        <ul aria-label="Lo que verá el visitante" className="list-disc space-y-1 pl-5 text-xs opacity-90">
          {resumenParaVisitante(validacion.config).map((l) => <li key={l}>{l}</li>)}
        </ul>
      ) : (
        <ul role="alert" className="list-disc space-y-1 pl-5 text-xs text-amber-200">
          {errores.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="flex gap-2">
        <Button type="button" className="cursor-pointer" disabled={!validacion.ok} onClick={() => validacion.ok && onGuardar?.(validacion.config)}>Guardar nodo</Button>
        {cfg.tipo === "etiqueta" && (
          <Button type="button" variant="outline" className="cursor-pointer" disabled={!validacion.ok} onClick={escribir}>Escribir etiqueta</Button>
        )}
      </div>
    </section>
  );
}
