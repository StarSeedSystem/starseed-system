"use client";

/**
 * AreasExplicadas — rejilla de áreas de la red en el último paso de la
 * bienvenida («Guía de la red»). Cada tarjeta abre una ventana que explica
 * qué es el área, cómo funciona y por dónde empezar, además de un botón
 * directo para ir a ella.
 */

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ChevronRight,
  Compass,
  Info,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TEMAS_SISTEMA,
  TEMAS_RED,
  type TemaGuia,
  type ExplicacionArea,
} from "@/lib/onboarding/guia-temas-sistema";

export type AreaTip = {
  path: string;
  label: string;
  icon: LucideIcon;
  tip: string;
  accent: string;
};

// Explicaciones para las áreas que tienen contenido propio (las del sistema y
// algunas de la red). Usadas por las tarjetas que correspondan a su `path`.
const EXPLICACIONES: Record<string, ExplicacionArea> = {
  "/protomolecula": {
    queEs: TEMAS_SISTEMA[0].cuerpo,
    comoFunciona: TEMAS_SISTEMA[0].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_SISTEMA[0].preguntaAurora,
  },
  "/red-mesh": {
    queEs: TEMAS_SISTEMA[1].cuerpo,
    comoFunciona: TEMAS_SISTEMA[1].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_SISTEMA[1].preguntaAurora,
  },
  "/agent?tab=config-ia": {
    queEs: TEMAS_SISTEMA[2].cuerpo,
    comoFunciona: TEMAS_SISTEMA[2].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_SISTEMA[2].preguntaAurora,
  },
  "/cerebro": {
    queEs: TEMAS_SISTEMA[3].cuerpo,
    comoFunciona: TEMAS_SISTEMA[3].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_SISTEMA[3].preguntaAurora,
  },
  "/network/politics": {
    queEs: TEMAS_RED[0].cuerpo,
    comoFunciona: TEMAS_RED[0].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_RED[0].preguntaAurora,
  },
  "/network/education": {
    queEs: TEMAS_RED[1].cuerpo,
    comoFunciona: TEMAS_RED[1].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_RED[1].preguntaAurora,
  },
  "/network/culture": {
    queEs: TEMAS_RED[2].cuerpo,
    comoFunciona: TEMAS_RED[2].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_RED[2].preguntaAurora,
  },
  "/genesis": {
    queEs: TEMAS_RED[4].cuerpo,
    comoFunciona: TEMAS_RED[4].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_RED[4].preguntaAurora,
  },
  "/library": {
    queEs: TEMAS_RED[3].cuerpo,
    comoFunciona: TEMAS_RED[3].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_RED[3].preguntaAurora,
  },
  "/red-mesh": {
    queEs: TEMAS_RED[8].cuerpo,
    comoFunciona: TEMAS_RED[8].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_RED[8].preguntaAurora,
  },
  "/cerebros": {
    queEs: TEMAS_SISTEMA[3].cuerpo,
    comoFunciona: TEMAS_SISTEMA[3].puntos.map((texto) => ({
      icono: ListChecks,
      texto,
    })),
    empiezaPor: TEMAS_SISTEMA[3].preguntaAurora,
  },
};