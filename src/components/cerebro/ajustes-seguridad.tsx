"use client";

/** Ajustes de seguridad y privacidad del cerebro. Contrato: §8 (seguridad, privacidad, vinculación). */
import { useState, useCallback } from "react";
import type { AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { Lock, ShieldCheck, User, Users, Globe, FileText } from "lucide-react";

export interface AjustesSeguridadProps {
  valor?: Partial<AjustesObjetivo>;
  onCambio?: (v: Partial<AjustesObjetivo>) => void;
  nivel?: "cerebro" | "memoria" | "carpeta";
}

export function AjustesSeguridad({ valor, onCambio, nivel = "cerebro" }: AjustesSeguridadProps) {
  const priv = valor?.privacidad ?? "privado";
  const cifrado = valor?.cifradoLocal ?? false;
  const acceso = valor?.acceso ?? [];

  const opcionesPrivacidad = [
    { key: "privado" as const, label: "Privado", ayuda: "Solo tú y tu cuenta." },
    { key: "perfil" as const, label: "Perfil", ayuda: "Tu perfil público." },
    { key: "grupo" as const, label: "Grupo", ayuda: "El grupo o comunidad vinculada." },
    { key: "publico" as const, label: "Público", ayuda: "Cualquiera que visite el cerebro." },
  ];

  const setPrivacidad = useCallback(
    (p: string) => {
      if (!onCambio) return;
      onCambio({ ...valor, privacidad: p as AjustesObjetivo["privacidad"] });
    },
    [valor, onCambio],
  );

  const toggleCifrado = useCallback(() => {
    if (!onCambio) return;
    onCambio({ ...valor, cifradoLocal: !cifrado });
  }, [valor, onCambio, cifrado]);

  const esSubnivel = nivel === "memoria" || nivel === "carpeta";

  return (
    <section className="flex flex-col gap-5 p-4">
      <h3 className="text-base font-semibold text-foreground">Seguridad y privacidad</h3>

      {/* Privacidad */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">Privacidad</span>
        <div className="flex flex-wrap gap-2">
          {opcionesPrivacidad.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setPrivacidad(o.key)}
              className={`cursor-pointer whitespace-normal h-auto px-3 py-2 rounded-full text-sm border transition-colors ${
                priv === o.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-muted/40 text-foreground border-border hover:bg-muted/70"
              }`}
              aria-pressed={priv === o.key}
              title={o.ayuda}
            >
              {o.label}
            </button>
          ))}
        </div>
        {nivel === "cerebro" && priv !== "privado" && (
          <p className="text-xs text-muted-foreground mt-1">
            Al cambiar a grupo o público, este cerebro se mueve a la pestaña Públicos y pasa a ser su{" "}
            <code className="text-xs">scope</code>.
          </p>
        )}
      </div>

      {/* Cifrado local */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleCifrado}
          className="cursor-pointer whitespace-normal h-auto inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm border border-border bg-muted/30 hover:bg-muted/60 transition-colors"
          aria-pressed={cifrado}
        >
          <ShieldCheck size={16} />
          <span>Cifrado local</span>
        </button>
        <span className="text-xs text-muted-foreground">Solo se guarda por ahora.</span>
        {esSubnivel && (
          <span className="text-xs text-amber-600 ml-auto">Solo se guarda por ahora · memorias y carpetas.</span>
        )}
      </div>

      {/* Lista de acceso */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">Lista de acceso</span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Quién puede leer o escribir: perfil, cuenta, grupo o página. Nivel: leer, escribir o admin.
        </p>
        <p className="text-xs text-amber-700">
          Con Compartir o Telepatía lo leen quienes tengan permiso; escribir sigue siendo solo tuyo.
        </p>
        <div className="flex flex-wrap gap-2 mt-1">
          {acceso.length === 0 ? (
            <span className="text-xs text-muted-foreground">Sin permisos configurados.</span>
          ) : (
            acceso.map((a, i) => (
              <span
                key={`${a.quien}-${a.nivel}-${i}`}
                className="cursor-default whitespace-normal h-auto px-2.5 py-1 rounded-md text-xs border border-border bg-background/60 text-foreground"
              >
                <span className="font-medium">{a.quien}</span>{" · "}<span className="text-muted-foreground">{a.nivel}</span>
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
