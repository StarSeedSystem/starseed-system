"use client";

/**
 * usePerfilCentro — el perfil activo de la cuenta para el centro del radar: nombre, foto (la de la faceta
 * activa o, si no tiene, la del perfil de la cuenta) y avatar 3D con su peso MEDIDO. Funciona sin
 * proveedor de cuenta (mini radar, pruebas): lee la copia local del perfil y consulta las facetas de
 * forma defensiva. Nunca lanza; sin sesión devuelve null.
 */

import { useEffect, useState } from "react";
import { listMyProfiles, PROFILE_ACTIVE_EVENT, PROFILES_LIST_EVENT, resolveActiveProfile } from "@/lib/profiles/profiles";
import { CLAVE_PERFIL_CACHE, perfilDesdeCuenta, type PerfilCentro } from "@/lib/senales/perfil-centro";

const pesos = new Map<string, number | null>();

/** Peso del modelo 3D por su cabecera `content-length` (HEAD). null = el servidor no lo dice o lo bloquea. */
export async function medirPesoModelo(url: string, ms = 4000): Promise<number | null> {
  if (pesos.has(url)) return pesos.get(url) ?? null;
  let peso: number | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { method: "HEAD", signal: ctrl.signal, referrerPolicy: "no-referrer" });
    clearTimeout(t);
    const n = Number(r.headers.get("content-length"));
    peso = r.ok && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    peso = null;
  }
  pesos.set(url, peso);
  return peso;
}

function leerCuenta(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(CLAVE_PERFIL_CACHE);
    if (!raw) return null;
    const j = JSON.parse(raw) as { profile?: Record<string, unknown> | null };
    return j?.profile ?? null;
  } catch {
    return null;
  }
}

export function usePerfilCentro(): PerfilCentro | null {
  const [perfil, setPerfil] = useState<PerfilCentro | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const cuenta = leerCuenta();
      let faceta: { name?: string | null; handle?: string | null; avatarUrl?: string | null } | null = null;
      try {
        const activa = resolveActiveProfile(await listMyProfiles());
        if (activa) faceta = { name: activa.name, handle: activa.handle, avatarUrl: activa.avatarUrl };
      } catch { /* sin sesión o sin red: queda la copia local */ }
      if (!vivo) return;
      const base = perfilDesdeCuenta(cuenta, faceta);
      setPerfil(base);
      if (base?.avatar3dUrl) {
        const bytes = await medirPesoModelo(base.avatar3dUrl);
        if (vivo) setPerfil(perfilDesdeCuenta(cuenta, faceta, bytes));
      }
    };
    void cargar();
    const otra = () => void cargar();
    window.addEventListener(PROFILE_ACTIVE_EVENT, otra);
    window.addEventListener(PROFILES_LIST_EVENT, otra);
    return () => {
      vivo = false;
      window.removeEventListener(PROFILE_ACTIVE_EVENT, otra);
      window.removeEventListener(PROFILES_LIST_EVENT, otra);
    };
  }, []);

  return perfil;
}

export default usePerfilCentro;
