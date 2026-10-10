"use client";

/*
 * MetaGenesisAccesos — Ajustes de MetaGenesis › Accesos (2026-10-10).
 * Quién puede entrar en MetaGenesis (el Genesis de los desarrolladores) desde cualquier neurona.
 * Los dueños dan acceso por correo o @usuario y lo quitan; los demás miembros ven la lista.
 * Explica de un vistazo la diferencia con Genesis (cada persona) y PoliGenesis (grupos).
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  darAcceso,
  listarMiembros,
  miAccesoMetaGenesis,
  quitarAcceso,
  type MiembroMetaGenesis,
  type RolMetaGenesis,
} from "@/lib/metagenesis/accesos";

export function MetaGenesisAccesos() {
  const [yo, setYo] = useState<{ miembro: boolean; dueno: boolean } | null | undefined>(undefined);
  const [miembros, setMiembros] = useState<MiembroMetaGenesis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ident, setIdent] = useState("");
  const [rol, setRol] = useState<RolMetaGenesis>("desarrollador");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const acceso = await miAccesoMetaGenesis();
    setYo(acceso);
    if (!acceso?.miembro) {
      setMiembros([]);
      return;
    }
    const r = await listarMiembros();
    if (r.ok) {
      setMiembros(r.datos ?? []);
      setError(null);
    } else setError(r.motivo ?? "No se pudo leer la lista.");
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const dar = async () => {
    setOcupado("dar");
    const r = await darAcceso(ident, rol);
    setOcupado(null);
    if (r.ok) {
      toast.success(`Acceso dado a ${ident.trim()}.`);
      setIdent("");
      void cargar();
    } else toast.error(r.motivo ?? "No se pudo dar acceso.");
  };

  const quitar = async (m: MiembroMetaGenesis) => {
    setOcupado(m.account_id);
    const r = await quitarAcceso(m.account_id);
    setOcupado(null);
    if (r.ok) {
      toast.success("Acceso quitado.");
      void cargar();
    } else toast.error(r.motivo ?? "No se pudo quitar.");
  };

  const dueños = miembros.filter((m) => m.rol === "dueño").length;

  return (
    <section className="space-y-4" data-testid="metagenesis-accesos">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4">
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0 space-y-1.5 text-sm">
            <h3 className="font-semibold text-amber-50">Accesos de MetaGenesis</h3>
            <p className="text-xs leading-relaxed text-white/65">
              <strong>MetaGenesis</strong> es este Genesis: el de los desarrolladores de StarSeed OS, el que edita el código del
              sistema (enjambre, olas, publicación). Solo entran las cuentas de esta lista, desde cualquier neurona. Cada persona
              tiene su <strong>Genesis</strong> para cambiar su cuenta, perfiles y páginas, y cada grupo o comunidad su{" "}
              <strong>PoliGenesis</strong>; ninguno de esos dos toca el código del OS.
            </p>
            <p className="text-[11px] text-white/45">
              En esta Mac se entra sin sesión (la máquina es el perímetro). Desde cualquier otro sitio —otro aparato del mismo
              Wi‑Fi, un túnel— hace falta sesión y estar en la lista.
            </p>
          </div>
        </div>
      </div>

      {yo === undefined ? (
        <p className="flex items-center gap-2 text-xs text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comprobando tu acceso…
        </p>
      ) : yo === null ? (
        <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60">
          Inicia sesión con tu cuenta StarSeed para ver y gestionar los accesos.
        </p>
      ) : !yo.miembro ? (
        <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60">
          Tu cuenta no está en la lista de MetaGenesis. Pide acceso a un dueño.
        </p>
      ) : (
        <>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-100">
              {error}
            </p>
          )}
          <ul className="space-y-2" aria-label="Cuentas con acceso a MetaGenesis">
            {miembros.map((m) => (
              <li key={m.account_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <ShieldCheck className={cn("h-4 w-4 shrink-0", m.rol === "dueño" ? "text-amber-300" : "text-cyan-300")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">
                    {m.nombre || (m.handle ? `@${m.handle}` : m.correo)}
                    {m.soy_yo ? <span className="ml-1.5 text-[11px] text-white/45">(tú)</span> : null}
                  </span>
                  <span className="block truncate text-[11px] text-white/45">
                    {[m.handle ? `@${m.handle}` : null, m.correo].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Badge variant="outline" className={cn("text-[10px]", m.rol === "dueño" ? "border-amber-400/40 text-amber-200" : "border-cyan-400/40 text-cyan-200")}>
                  {m.rol === "dueño" ? "Dueño" : "Desarrollador"}
                </Badge>
                {yo.dueno && !(m.rol === "dueño" && dueños <= 1) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 cursor-pointer gap-1 text-rose-200"
                    disabled={ocupado !== null}
                    onClick={() => void quitar(m)}
                    aria-label={`Quitar el acceso de ${m.nombre || m.correo}`}
                  >
                    {ocupado === m.account_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {yo.dueno ? (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="block text-xs text-white/70" htmlFor="mg-ident">
                Dar acceso a una cuenta (correo o @usuario)
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="mg-ident"
                  value={ident}
                  onChange={(e) => setIdent(e.target.value)}
                  placeholder="persona@correo.org o @usuario"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                />
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as RolMetaGenesis)}
                  className="cursor-pointer rounded-lg border border-white/15 bg-black/30 p-2 text-sm"
                  aria-label="Rol"
                >
                  <option value="desarrollador">Desarrollador</option>
                  <option value="dueño">Dueño</option>
                </select>
                <Button className="cursor-pointer gap-1.5" disabled={ocupado !== null || !ident.trim()} onClick={() => void dar()}>
                  {ocupado === "dar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                  Dar acceso
                </Button>
              </div>
              <p className="text-[11px] text-white/45">
                Un desarrollador usa MetaGenesis entero; un dueño además da y quita accesos. MetaGenesis nunca se queda sin dueño.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-white/45">Solo los dueños dan y quitan accesos.</p>
          )}
        </>
      )}
    </section>
  );
}

export default MetaGenesisAccesos;
