"use client";

/** Seguridad y privacidad de un cerebro, una memoria o una carpeta (CB1013T, contrato §8 y §9 a).
 * Controlado por props: enseña `valor` y avisa con `onCambio(parcial)`; no guarda nada. Las marcas salen de
 * `APLICACION` (ajustes.ts). Cada acceso guarda `quien` como «tipo:id», con los tipos de los permisos universales. */

import { useState } from "react";
import { Lock, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { APLICACION, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import type { GranteeKind } from "@/lib/sharing/access";

export type NivelAjustes = "cerebro" | "memoria" | "carpeta";
type NivelAcceso = AjustesObjetivo["acceso"][number]["nivel"];

export interface AjustesSeguridadProps {
  valor: Pick<AjustesObjetivo, "privacidad" | "cifradoLocal" | "acceso">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  nivel: NivelAjustes;
}

const PRIVACIDADES: { id: AjustesObjetivo["privacidad"]; texto: string; ayuda: string }[] = [
  { id: "privado", texto: "Privado", ayuda: "Solo tu cuenta." },
  { id: "perfil", texto: "Perfil", ayuda: "Quien vea tu perfil." },
  { id: "grupo", texto: "Grupo", ayuda: "Los miembros del grupo, la comunidad o la página." },
  { id: "publico", texto: "Público", ayuda: "Cualquier persona." },
];
const QUIENES: { id: Exclude<GranteeKind, "link">; texto: string }[] = [{ id: "profile", texto: "Perfil" }, { id: "account", texto: "Cuenta" }, { id: "group", texto: "Grupo" }, { id: "page", texto: "Página" }];
const NIVELES: { id: NivelAcceso; texto: string }[] = [{ id: "leer", texto: "Leer" }, { id: "escribir", texto: "Escribir" }, { id: "admin", texto: "Administrar" }];
const SELECTOR = "h-9 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white";
const opciones = (lista: { id: string; texto: string }[]) => lista.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>);

/** Marca honesta de un ajuste: «se aplica ya» o «solo se guarda por ahora». */
export function MarcaAplicacion({ estado }: { estado: "se-aplica" | "solo-se-guarda" }) {
  const aplica = estado === "se-aplica";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", aplica ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200")}>{aplica ? "Se aplica ya" : "Solo se guarda por ahora"}</span>;
}

/** En una memoria o carpeta, privacidad y permisos solo se guardan: la lectura compartida es del cerebro entero (§8). */
function marcaDe(campo: keyof typeof APLICACION, nivel: NivelAjustes) {
  return nivel !== "cerebro" && (campo === "privacidad" || campo === "acceso") ? "solo-se-guarda" : APLICACION[campo];
}

function textoQuien(quien: string): string {
  const [tipo, ...resto] = quien.split(":");
  const t = QUIENES.find((q) => q.id === tipo);
  return t && resto.length ? `${t.texto} · ${resto.join(":")}` : quien;
}

export function AjustesSeguridad({ valor, onCambio, nivel }: AjustesSeguridadProps) {
  const [tipo, setTipo] = useState<(typeof QUIENES)[number]["id"]>("profile");
  const [ref, setRef] = useState("");
  const [nivelNuevo, setNivelNuevo] = useState<NivelAcceso>("leer");
  const cambiarAcceso = (acceso: AjustesObjetivo["acceso"]) => onCambio({ acceso });
  const anadir = () => {
    const quien = `${tipo}:${ref.trim()}`;
    cambiarAcceso([...valor.acceso.filter((a) => a.quien !== quien), { quien, nivel: nivelNuevo }]);
    setRef("");
  };

  return (
    <section className="space-y-5 text-white" aria-label="Seguridad y privacidad">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><Lock className="h-4 w-4 text-white/60" /><h3 className="text-sm font-semibold">Privacidad</h3><MarcaAplicacion estado={marcaDe("privacidad", nivel)} /></div>
        <div className="flex flex-wrap gap-2">
          {PRIVACIDADES.map((p) => (
            <Button key={p.id} type="button" size="sm" variant={valor.privacidad === p.id ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" aria-pressed={valor.privacidad === p.id} title={p.ayuda} onClick={() => onCambio({ privacidad: p.id })}>
              {p.texto}
            </Button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-white/60">
          {nivel === "cerebro"
            ? "Grupo o Público pasan este cerebro a la pestaña Públicos; Privado o Perfil lo dejan en Privados. El cambio de pestaña lo hace el alcance del cerebro (scope)."
            : "La privacidad de una memoria o carpeta se guarda, pero hoy la lectura compartida es la del cerebro entero."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Switch id="cifrado-local" checked={valor.cifradoLocal} onCheckedChange={(v) => onCambio({ cifradoLocal: v })} />
        <label htmlFor="cifrado-local" className="flex cursor-pointer items-center gap-1.5 text-sm"><ShieldCheck className="h-4 w-4 text-white/60" />Cifrado local</label>
        <MarcaAplicacion estado={marcaDe("cifradoLocal", nivel)} />
        <p className="w-full text-xs text-white/60">Cifrará en este aparato lo que guarde el cerebro; llega con su tarea propia.</p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Lista de acceso</h3><MarcaAplicacion estado={marcaDe("acceso", nivel)} /></div>
        <p className="text-xs leading-relaxed text-white/60">
          {nivel === "cerebro"
            ? "Con Compartir o Telepatía lo leen quienes tengan permiso; escribir sigue siendo solo tuyo."
            : "La lectura compartida es por cerebro entero: esta lista se guarda para cuando llegue por memoria o carpeta."}
        </p>
        {valor.acceso.length === 0 ? <p className="text-xs text-white/50">Nadie más tiene acceso todavía.</p> : (
          <ul className="space-y-1.5">
            {valor.acceso.map((a) => (
              <li key={a.quien} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 break-words">{textoQuien(a.quien)}</span>
                <select aria-label={`Nivel de ${textoQuien(a.quien)}`} className={SELECTOR} value={a.nivel} onChange={(e) => cambiarAcceso(valor.acceso.map((x) => (x.quien === a.quien ? { ...x, nivel: e.target.value as NivelAcceso } : x)))}>{opciones(NIVELES)}</select>
                <Button type="button" size="sm" variant="ghost" className="h-auto whitespace-normal py-1" aria-label={`Quitar ${textoQuien(a.quien)}`} onClick={() => cambiarAcceso(valor.acceso.filter((x) => x.quien !== a.quien))}><X className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Tipo de quien entra" className={SELECTOR} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>{opciones(QUIENES)}</select>
          <Input aria-label="Id o nombre" placeholder="Id o nombre" value={ref} onChange={(e) => setRef(e.target.value)} className="h-9 w-40 flex-1 border-white/15 bg-black/40" />
          <select aria-label="Nivel nuevo" className={SELECTOR} value={nivelNuevo} onChange={(e) => setNivelNuevo(e.target.value as NivelAcceso)}>{opciones(NIVELES)}</select>
          <Button type="button" size="sm" variant="outline" className="h-auto whitespace-normal py-1.5" disabled={!ref.trim()} onClick={anadir}><Plus className="h-4 w-4" />Añadir</Button>
        </div>
      </div>
    </section>
  );
}
