"use client";

/**
 * AjusteAmbitosMalla — Internet compartido: datos móviles, grupos y comunidades, y capa pública (PTA1110B · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3 «Ámbitos de confianza». Cada ámbito tiene su ajuste de COMPARTIR y su espejo de USAR.
 * Una cadena de neuronas nunca ensancha la confianza: cada salto aplica su propia política al ámbito de quien pide.
 */

import { useState } from "react";
import { Smartphone, Users, Globe, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUid, useLiveGroups, useMyMemberships } from "@/lib/widget-data/os-live";
import { miembrosNeuronasDeGrupo } from "@/lib/malla/puerta/grupos-fuente";
import { cn } from "@/lib/utils";
import { cambiarAjustesPuerta, configurarGrupo } from "@/lib/malla/puerta/servicio";
import type { AjustesPuerta, ModoGrupo, ModoMovil } from "@/lib/malla/puerta/politica";

const MODOS_MOVIL: Array<{ id: ModoMovil; nombre: string; detalle: string }> = [
  { id: "nunca", nombre: "Nunca", detalle: "Si esta neurona sale por datos móviles, no presta su internet a nadie." },
  { id: "preguntar", nombre: "Preguntar", detalle: "Cada neurona que pide por datos móviles me lo pregunta (puedo recordar la respuesta)." },
  { id: "si", nombre: "Sí, con tope", detalle: "Presta también por datos móviles hasta el tope diario de abajo." },
];

const MODOS_GRUPO: Array<{ id: ModoGrupo; nombre: string }> = [
  { id: "nunca", nombre: "Nunca" },
  { id: "preguntar", nombre: "Preguntar" },
  { id: "automatico", nombre: "Automático con tope" },
];

const selectCls = "rounded-md border border-white/15 bg-background/60 px-2 py-1 text-xs";
const mibDe = (b: number): number => Math.round(b / 1024 / 1024);

/** «Añadir grupo o comunidad»: elige uno de MIS grupos; entra con Preguntar en los dos sentidos y guarda sus neuronas conocidas si hay red. */
function AnadirGrupoMalla({ a, alTerminar }: { a: AjustesPuerta; alTerminar: () => void }) {
  const { uid } = useCurrentUid();
  const mias = useMyMemberships(uid);
  const grupos = useLiveGroups();
  const nombres = new Map((grupos.rows ?? []).map((g) => [g.slug, g.name]));
  const opciones = (mias.rows ?? []).filter((m) => !a.grupos[m.group_slug]);
  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 px-3 py-2" data-testid="anadir-grupo">
      {opciones.length === 0 ? (
        <p className="text-xs text-muted-foreground">No hay más grupos ni comunidades tuyos que añadir (hace falta sesión y red para verlos).</p>
      ) : (
        <ul className="space-y-1">
          {opciones.map((m) => (
            <li key={m.group_slug} className="flex items-center justify-between gap-2 text-xs">
              <span>{nombres.get(m.group_slug) ?? m.group_slug}</span>
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={async () => {
                  const miembros = await miembrosNeuronasDeGrupo(m.group_slug);
                  configurarGrupo(m.group_slug, { nombre: nombres.get(m.group_slug) ?? m.group_slug, ...(miembros ? { miembros } : {}) });
                  alTerminar();
                }}
              >
                Añadir
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="ghost" className="cursor-pointer" onClick={alTerminar}>Cerrar</Button>
    </div>
  );
}

export function AjusteAmbitosMalla({ a, esMovil }: { a: AjustesPuerta; esMovil?: boolean }) {
  const grupos = Object.entries(a.grupos);
  const [anadiendo, setAnadiendo] = useState(false);
  const recordadas = Object.entries(a.usoOtrasRecordadas ?? {});
  return (
    <div className="space-y-3" data-testid="ajuste-puerta-ambitos">
      <fieldset className="space-y-1.5" aria-label="Compartir también por datos móviles" data-testid="datos-moviles">
        <legend className="mb-1 flex items-center gap-2 font-medium">
          <Smartphone className="h-4 w-4 text-[#39FF14]" aria-hidden /> Compartir también por datos móviles
        </legend>
        {MODOS_MOVIL.map((m) => (
          <label
            key={m.id}
            className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors", a.datosMoviles.modo === m.id ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/10 hover:border-white/25")}
          >
            <input type="radio" name="puerta-movil" checked={a.datosMoviles.modo === m.id} onChange={() => cambiarAjustesPuerta((x) => ({ ...x, datosMoviles: { ...x.datosMoviles, modo: m.id } }))} className="mt-1 accent-[#39FF14]" />
            <span>
              <span className="font-medium">{m.nombre}</span>
              <span className="block text-xs text-muted-foreground">{m.detalle}</span>
            </span>
          </label>
        ))}
        {a.datosMoviles.modo === "si" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Tope diario por datos móviles
            <input
              type="number"
              min={10}
              max={5000}
              step={10}
              value={mibDe(a.datosMoviles.bytesDia)}
              onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, datosMoviles: { ...x.datosMoviles, bytesDia: Math.max(10, Math.min(5000, Number(e.target.value) || 200)) * 1024 * 1024 } }))}
              className="w-20 rounded-md border border-white/15 bg-background/60 px-2 py-1"
              aria-label="Tope diario por datos móviles en MiB"
            />
            MiB
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          {esMovil ? "Un teléfono es la neurona con salida más común: por defecto no gasta tus datos." : "Se aplica solo cuando esta neurona sale por una red medida (datos móviles o punto de acceso del teléfono)."} La capa pública nunca sale por datos móviles.
        </p>
      </fieldset>

      <fieldset className="space-y-1.5" aria-label="Usar el internet de neuronas de otras cuentas" data-testid="usar-otras-cuentas">
        <legend className="mb-1 font-medium">Usar el internet de neuronas de otras cuentas</legend>
        <p className="text-xs text-muted-foreground">Una neurona de otra cuenta enlazada contigo (vínculo aceptado) que presta su internet. Quien la presta ve a qué servidores te conectas y cuántos datos mueves, nunca el contenido.</p>
        <select
          className={selectCls}
          value={a.usarOtrasCuentas}
          onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, usarOtrasCuentas: e.target.value as ModoGrupo }))}
          aria-label="Usar el internet de neuronas de otras cuentas"
        >
          {MODOS_GRUPO.map((m) => (
            <option key={m.id} value={m.id}>{m.id === "automatico" ? "Automático" : m.nombre}</option>
          ))}
        </select>
        {recordadas.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground" data-testid="uso-otras-recordadas">
            {recordadas.map(([id, r]) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <span>{id.slice(0, 8)}: {r === "permitir" ? "permitida" : "rechazada"}</span>
                <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => cambiarAjustesPuerta((x) => { const { [id]: _quitada, ...resto } = x.usoOtrasRecordadas; void _quitada; return { ...x, usoOtrasRecordadas: resto }; })}>Retirar</Button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="space-y-1.5" aria-label="Grupos y comunidades" data-testid="grupos-puerta">
        <legend className="mb-1 flex items-center gap-2 font-medium">
          <Users className="h-4 w-4 text-[#39FF14]" aria-hidden /> Grupos y comunidades
        </legend>
        {grupos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aún no hay grupos con ajuste. Los grupos y comunidades a los que perteneces aparecen aquí cuando esta neurona conoce a sus miembros; mientras no, sus neuronas se tratan como «otras cuentas» (Preguntar).
          </p>
        ) : (
          grupos.map(([id, g]) => (
            <div key={id} className="space-y-1.5 rounded-lg border border-white/10 px-3 py-2" data-testid={`grupo-${id}`}>
              <p className="font-medium">
                {g.nombre ?? id} <span className="text-xs font-normal text-muted-foreground">({g.miembros.length} {g.miembros.length === 1 ? "neurona conocida" : "neuronas conocidas"})</span>
              </p>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Compartir internet con este grupo</span>
                <select className={selectCls} value={g.compartir} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, grupos: { ...x.grupos, [id]: { ...x.grupos[id], compartir: e.target.value as ModoGrupo } } }))} aria-label={`Compartir internet con ${g.nombre ?? id}`}>
                  {MODOS_GRUPO.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Usar el internet de este grupo</span>
                <select className={selectCls} value={g.usar} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, grupos: { ...x.grupos, [id]: { ...x.grupos[id], usar: e.target.value as ModoGrupo } } }))} aria-label={`Usar el internet de ${g.nombre ?? id}`}>
                  {MODOS_GRUPO.map((m) => (
                    <option key={m.id} value={m.id}>{m.id === "automatico" ? "Automático" : m.nombre}</option>
                  ))}
                </select>
              </label>
            </div>
          ))
        )}
        {anadiendo ? (
          <AnadirGrupoMalla a={a} alTerminar={() => setAnadiendo(false)} />
        ) : (
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setAnadiendo(true)}>
            <Plus className="mr-1 h-3 w-3" aria-hidden /> Añadir grupo o comunidad
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Hoy la pertenencia a un grupo es la lista de miembros que esta neurona guardó cuando hubo red; sin una prueba firmada que se pueda comprobar sin internet, «Preguntar» muestra siempre la identidad de la neurona que pide.
        </p>
      </fieldset>

      <fieldset className="space-y-1.5" aria-label="Capa pública" data-testid="capa-publica">
        <legend className="mb-1 flex items-center gap-2 font-medium">
          <Globe className="h-4 w-4 text-[#39FF14]" aria-hidden /> Pública (apagada por defecto)
        </legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
          <input type="checkbox" checked={a.publica.ofrecer} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, publica: { ...x.publica, ofrecer: e.target.checked } }))} className="mt-1 accent-[#39FF14]" />
          <span>
            <span className="font-medium">Ofrecer mi internet a cualquier neurona StarSeed cercana</span>
            <span className="block text-xs text-muted-foreground">
              Solo web (puertos 80, 443, 8080 y 8443), hasta {mibDe(a.publica.topes.bytesDia)} MiB al día, {a.publica.topes.maxTuneles} túneles a la vez, con batería por encima del {Math.round(a.publica.topes.bateriaMin * 100)} % y nunca por datos móviles. Sin tu red local ni tus servidores.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
          <input type="checkbox" checked={a.publica.usar} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, publica: { ...x.publica, usar: e.target.checked } }))} className="mt-1 accent-[#39FF14]" />
          <span>
            <span className="font-medium">Usar puertas públicas</span>
            <span className="block text-xs text-amber-200/90">
              Quien presta la puerta ve a qué servidores te conectas y cuántos datos mueves; nunca el contenido (va cifrado de punta a punta con el sitio). No es un VPN y no te oculta de ella.
            </span>
          </span>
        </label>
      </fieldset>
    </div>
  );
}
