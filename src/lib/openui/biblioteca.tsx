"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card as CardBase } from "@/components/ui/card";
import { Table as TableBase } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { cn as cnUtil } from "@/lib/utils";
import { z } from "zod";

// Component Prop Definitions (Zod schemas for OpenUI)
export const CardProps = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  liquid: z.boolean().optional(),
  variant: z.enum(["default", "hover", "active"]).optional(),
  intensity: z.enum(["low", "medium", "high"]).optional(),
  className: z.string().optional(),
}).catchall(z.any());

type CardProps = z.infer<typeof CardProps> & {
  children?: React.ReactNode;
};

export const TableProps = z.object({
  data: z.array(z.record(z.any())).optional(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    sortable: z.boolean().optional(),
  })).optional(),
  className: z.string().optional(),
});

type TableProps = z.infer<typeof TableProps>;

export const StepsProps = z.object({
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(["pending", "active", "completed"]).optional(),
  })),
  currentStep: z.number().optional(),
  className: z.string().optional(),
});

type StepsProps = z.infer<typeof StepsProps>;

export const ComparisonProps = z.object({
  items: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.string(),
    icon: z.any().optional(),
  })),
  className: z.string().optional(),
});

type ComparisonProps = z.infer<typeof ComparisonProps>;

export const TimelineProps = z.object({
  events: z.array(z.object({
    id: z.string(),
    date: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(["upcoming", "current", "completed"]).optional(),
  })),
  className: z.string().optional(),
});

type TimelineProps = z.infer<typeof TimelineProps>;

export const ListProps = z.object({
  items: z.array(z.object({
    id: z.string(),
    content: z.string(),
    completed: z.boolean().optional(),
    action: z.any().optional(),
  })),
  className: z.string().optional(),
});

type ListProps = z.infer<typeof ListProps>;

export const ActionProps = z.object({
  id: z.string(),
  label: z.string(),
  onClick: z.function().optional(),
  variant: z.enum(["default", "secondary", "destructive", "outline", "ghost", "link"]).optional(),
  size: z.enum(["default", "sm", "lg", "icon"]).optional(),
  disabled: z.boolean().optional(),
  className: z.string().optional(),
});

type ActionProps = z.infer<typeof ActionProps>;

// Component Implementations

export function Card({ title, description, liquid, variant = "default", intensity = "medium", className, ...props }: CardProps) {
  return (
    <GlassCard
      variant={variant}
      intensity={intensity}
      className={cnUtil("p-6", className)}
      {...(liquid && { liquid: true })}
      {...props}
    >
      {title && (
        <h3 className="text-lg font-semibold mb-2 text-foreground">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {props.children}
    </GlassCard>
  );
}

Card.displayName = "Card";

export function Table({ data, columns, className, ...props }: TableProps) {
  if (!data || !columns) {
    return null;
  }

  return (
    <div className={cnUtil("rounded-md border w-full", className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((col) => (
              <th key={col.key} className="h-12 px-4 text-left align-middle font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index} className="border-b hover:bg-muted/50">
              {columns.map((col) => (
                <td key={`${index}-${col.key}`} className="p-4 align-middle">
                  {String(row[col.key] || "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Table.displayName = "Table";

export function Steps({ steps, currentStep = 0, className, ...props }: StepsProps) {
  return (
    <div className={cnUtil("relative", className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10">
              <div
                className={cnUtil(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all",
                  isCompleted
                    ? "bg-green-500 border-green-500 text-white"
                    : isActive
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-gray-200 border-gray-300 text-gray-500"
                )}
              >
                {isCompleted ? "✓" : index + 1}
              </div>
              <div className="mt-2 text-center">
                <div className={cnUtil("text-sm font-medium", isActive ? "text-blue-600" : "text-gray-500")}>
                  {step.title}
                </div>
                {step.description && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {step.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-0" />
    </div>
  );
}

Steps.displayName = "Steps";

export function Comparison({ items, className, ...props }: ComparisonProps) {
  return (
    <div className={cnUtil("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {items.map((item) => (
        <GlassCard key={item.id} className="p-6">
          {item.icon && <div className="mb-3">{item.icon}</div>}
          <h4 className="font-semibold text-lg mb-2">{item.label}</h4>
          <p className="text-3xl font-bold text-primary">{item.value}</p>
        </GlassCard>
      ))}
    </div>
  );
}

Comparison.displayName = "Comparison";

export function Timeline({ events, className, ...props }: TimelineProps) {
  return (
    <div className={cnUtil("relative", className)}>
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

      {events.map((event, index) => {
        const isCurrent = event.status === "current";
        const isCompleted = event.status === "completed";

        return (
          <div key={event.id} className="relative pl-12 pb-8">
            <div
              className={cnUtil(
                "absolute left-4 w-6 h-6 rounded-full border-2 -translate-x-1/2",
                isCurrent
                  ? "bg-blue-500 border-blue-500"
                  : isCompleted
                  ? "bg-green-500 border-green-500"
                  : "bg-gray-200 border-gray-300"
              )}
            />

            <div className="bg-card rounded-lg p-4 border shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-muted-foreground">{event.date}</span>
                <h4 className="font-semibold">{event.title}</h4>
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground">{event.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

Timeline.displayName = "Timeline";

export function List({ items, className, ...props }: ListProps) {
  return (
    <div className={cnUtil("space-y-3", className)}>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
          <div className="flex-shrink-0">
            {item.completed ? (
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
            )}
          </div>
          <div className="flex-1 text-sm">{item.content}</div>
          {item.action && <div>{item.action}</div>}
        </div>
      ))}
    </div>
  );
}

List.displayName = "List";

export function Action({ id, label, onClick, variant = "default", size = "default", disabled, className, ...props }: ActionProps) {
  return (
    <Button
      id={id}
      variant={variant}
      size={size}
      disabled={disabled}
      className={cnUtil(className)}
      onClick={onClick}
      {...props}
    >
      {label}
    </Button>
  );
}

Action.displayName = "Action";

// System prompt generated from the library components
export function promptDeSistema() {
  return `Eres un asistente de IA que ayuda a los usuarios a crear interfaces de usuario atractivas y funcionales.

Tienes acceso a la Biblioteca StarSeed OS (Trinity), que incluye los siguientes componentes:

1. **Card**: Componente de tarjeta versátil con soporte para variant y intensidad
2. **Table**: Componente de tabla para mostrar datos estructurados
3. **Steps**: Componente de indicador de pasos para procesos multi-etapa
4. **Comparison**: Componente de comparación para mostrar métricas
5. **Timeline**: Componente de línea de tiempo para eventos cronológicos
6. **List**: Componente de lista para elementos de contenido
7. **Action**: Componente de botón para acciones interactivas

Cada componente está definido con props Zod para validación y usa el estilo Trinity de StarSeed OS.
Usa estos componentes para crear interfaces atractivas y consistentes con vidrio líquido, efectos de cristal y una estética moderna.

Cuando un usuario solicite una interfaz, selecciona los componentes apropiados y configúralos según sus necesidades.
Proporciona ejemplos y guías de uso cuando sea necesario.`;}

export const Biblioteca = {
  Card,
  Table,
  Steps,
  Comparison,
  Timeline,
  List,
  Action,
  promptDeSistema,
};

export default Biblioteca;