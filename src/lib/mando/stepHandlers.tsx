"use client";

import { User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StepKindProps,
  KindCardProps,
  StepKindState,
  AccountKind,
  StepKindHandlers,
  StepKindUtils,
} from "./stepKind";

export const stepKindHandlers: StepKindHandlers = {
  StepKind: function StepKindComponent({ state, setState, onNext }: StepKindProps) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-200">
          Bienvenido a StarSeed
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Antes de empezar, dinos quién eres en esta red. Tu cuenta puede ser personal o representar a una comunidad.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-6">
          <stepKindHandlers.KindCard
            icon={User}
            label="Individuo"
            desc="Una persona soberana en la red."
            selected={state.kind === "individual"}
            onClick={() => setState({ ...state, kind: "individual" })}
          />
          <stepKindHandlers.KindCard
            icon={Users}
            label="Grupo"
            desc="Comunidad / Sangha / colectivo."
            selected={state.kind === "grupo"}
            onClick={() => setState({ ...state, kind: "grupo" })}
          />
        </div>
        <Button onClick={onNext} disabled={!state.kind} className="mt-4">
          Continuar <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    );
  },
  KindCard: function KindCardComponent({ icon: Icon, label, desc, selected, onClick }: KindCardProps) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "p-5 rounded-2xl border-2 transition-all text-left hover:scale-[1.02] cursor-pointer",
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
  },
};

export const stepKindUtils: StepKindUtils = {
  isKindValid: (state: StepKindState): boolean => {
    return state.kind === "individual" || state.kind === "grupo";
  },

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