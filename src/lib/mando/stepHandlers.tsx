"use client";

import type {
  StepKindProps,
  KindCardProps,
  StepKindState,
  AccountKind,
  StepKindHandlers,
  StepKindUtils,
} from "@/lib/mando/stepKind";
import { User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Componente principal StepKind tipado. */
export function StepKind({ state, setState, onNext }: StepKindProps) {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-3xl font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-200">
        Bienvenido a StarSeed
      </h1>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Antes de empezar, dinos quién eres en esta red. Tu cuenta puede ser personal o representar a una comunidad.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-6">
        <KindCard
          icon={User}
          label="Individuo"
          desc="Una persona soberana en la red."
          selected={state.kind === "individual"}
          onClick={() => setState({ ...state, kind: "individual" })}
        />
        <KindCard
          icon={Users}
          label="Grupo"
          desc="Comunidad / Sangha / colectivo."
          selected={state.kind === "grupo"}
          onClick={() => setState({ ...state, kind: "grupo" })}
        />
      </div>
      <button
        onClick={onNext}
        disabled={!state.kind}
        className={cn(
          "mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-gradient-to-r from-purple-600 to-cyan-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:from-purple-500 hover:to-cyan-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        Continuar
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </button>
    </div>
  );
}

/** Componente KindCard tipado. */
export function KindCard({ icon: Icon, label, desc, selected, onClick }: KindCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-5 rounded-2xl border-2 transition-all text-left hover:scale-[1.02]",
        selected
          ? "border-purple-400 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.25)]"
          : "border-white/10 hover:border-white/30 bg-white/[0.02]"
      )}
    >
      <Icon className="w-8 h-8 text-purple-300 mb-2" />
      <h3 className="font-bold text-base mb-1">{label}</h3>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

/** Utilidades puras para el paso Kind. */
export const stepKindUtils: StepKindUtils = {
  /** Valida si el estado tiene un kind válido. */
  isKindValid: (state: StepKindState): boolean => {
    return state.kind === "individual" || state.kind === "grupo";
  },

  /** Obtiene la etiqueta legible para un kind. */
  getKindLabel: (kind: AccountKind | undefined): string | null => {
    switch (kind) {
      case "individual":
        return "Individuo";
      case "grupo":
        return "Grupo";
      default:
        return null;
    }
  },

  /** Obtiene la descripción legible para un kind. */
  getKindDescription: (kind: AccountKind | undefined): string | null => {
    switch (kind) {
      case "individual":
        return "Una persona soberana en la red.";
      case "grupo":
        return "Comunidad / Sangha / colectivo.";
      default:
        return null;
    }
  },

  /** Obtiene el icono para un kind. */
  getKindIcon: (kind: AccountKind | undefined): React.ComponentType<{ className?: string }> | null => {
    switch (kind) {
      case "individual":
        return User;
      case "grupo":
        return Users;
      default:
        return null;
    }
  },
};

/** Handlers tipados para el paso Kind. */
export const stepKindHandlers: StepKindHandlers = {
  StepKind,
  KindCard,
};