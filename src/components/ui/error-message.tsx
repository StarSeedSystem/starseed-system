"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  Loader2,
} from "lucide-react";

export type ErrorSeverity = "error" | "warning" | "info" | "success" | "loading";
export type ErrorVariant = "inline" | "banner" | "toast" | "card";

const severityIconMap: Record<ErrorSeverity, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
  loading: Loader2,
};

const severityAriaMap: Record<ErrorSeverity, "alert" | "status"> = {
  error: "alert",
  warning: "alert",
  info: "status",
  success: "status",
  loading: "status",
};

const errorMessageVariants = cva(
  "relative flex items-start gap-3 rounded-xl border p-4 transition-all duration-200 [&>svg]:shrink-0 [&>svg]:mt-0.5",
  {
    variants: {
      severity: {
        error: "border-rose-500/30 bg-rose-500/10 text-rose-100 [&>svg]:text-rose-400",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-100 [&>svg]:text-amber-400",
        info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100 [&>svg]:text-cyan-400",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 [&>svg]:text-emerald-400",
        loading: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100 [&>svg]:text-cyan-400 animate-pulse",
      },
      variant: {
        inline: "w-full",
        banner: "w-full rounded-2xl shadow-lg",
        toast: "w-full max-w-sm shadow-xl",
        card: "w-full rounded-2xl",
      },
      dismissible: {
        true: "pr-10",
        false: "",
      },
    },
    compoundVariants: [
      {
        severity: "error",
        variant: "banner",
        className: "ring-1 ring-rose-500/20",
      },
      {
        severity: "warning",
        variant: "banner",
        className: "ring-1 ring-amber-500/20",
      },
    ],
    defaultVariants: {
      severity: "error",
      variant: "inline",
      dismissible: false,
    },
  }
);

export interface ErrorMessageProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof errorMessageVariants> {
  /** Título del mensaje de error */
  title?: string;
  /** Descripción detallada */
  description?: React.ReactNode;
  /** Acción opcional (botón, enlace, etc.) */
  action?: React.ReactNode;
  /** Si se muestra el icono de severidad */
  showIcon?: boolean;
  /** Callback al cerrar (para dismissible) */
  onDismiss?: () => void;
  /** Texto alternativo para el botón de cerrar */
  dismissLabel?: string;
  /** Clase adicional para el contenedor del contenido */
  contentClassName?: string;
}

const ErrorMessage = React.forwardRef<HTMLDivElement, ErrorMessageProps>(
  (
    {
      className,
      severity = "error",
      variant = "inline",
      dismissible = false,
      title,
      description,
      action,
      showIcon = true,
      onDismiss,
      dismissLabel = "Cerrar",
      contentClassName,
      role,
      ...props
    },
    ref
  ) => {
    const Icon = severityIconMap[severity as ErrorSeverity];
    const ariaRole = role || severityAriaMap[severity as ErrorSeverity];

    return (
      <div
        ref={ref}
        role={ariaRole}
        aria-live={severity === "error" || severity === "warning" ? "assertive" : "polite"}
        className={cn(errorMessageVariants({ severity, variant, dismissible }), className)}
        {...props}
      >
        {showIcon && <Icon className="h-5 w-5" aria-hidden="true" />}
        <div className={cn("flex-1 min-w-0", contentClassName)}>
          {title && (
            <p className="font-medium leading-tight" id={props.id ? `${props.id}-title` : undefined}>
              {title}
            </p>
          )}
          {description && (
            <div
              className="mt-1.5 text-sm leading-relaxed [&_p]:leading-relaxed"
              id={props.id ? `${props.id}-description` : undefined}
            >
              {description}
            </div>
          )}
          {action && (
            <div className="mt-3 flex items-center gap-2">{action}</div>
          )}
        </div>
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            className="absolute right-3 top-3 rounded-md p-1 text-current/50 opacity-0 transition-opacity hover:text-current focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
);
ErrorMessage.displayName = "ErrorMessage";

export interface InlineErrorProps {
  /** Mensaje de error */
  message: string;
  /** Texto adicional de ayuda */
  hint?: string;
  /** ID del campo asociado (para aria-describedby) */
  fieldId?: string;
  /** Severidad */
  severity?: "error" | "warning";
}

export function InlineError({
  message,
  hint,
  fieldId,
  severity = "error",
}: InlineErrorProps) {
  const errorId = React.useId();
  const hintId = React.useId();

  return (
    <ErrorMessage
      id={errorId}
      severity={severity}
      variant="inline"
      title={message}
      description={hint}
      className="mt-2"
      role="alert"
      aria-describedby={hint ? `${errorId}-description ${hintId}` : `${errorId}-description`}
    />
  );
}

export interface FieldErrorProps {
  /** Mensaje de error */
  message: string;
  /** ID del campo de formulario asociado */
  fieldId: string;
}

export function FieldError({ message, fieldId }: FieldErrorProps) {
  return (
    <ErrorMessage
      id={`${fieldId}-error`}
      severity="error"
      variant="inline"
      title={message}
      className="mt-1.5"
      role="alert"
    />
  );
}

export interface BannerErrorProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  severity?: "error" | "warning" | "info";
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function BannerError({
  title,
  description,
  action,
  severity = "error",
  onDismiss,
  dismissible = true,
}: BannerErrorProps) {
  return (
    <ErrorMessage
      severity={severity}
      variant="banner"
      dismissible={dismissible}
      onDismiss={onDismiss}
      title={title}
      description={description}
      action={action}
      role="alert"
    />
  );
}

export interface ToastErrorProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  severity?: "error" | "warning" | "info" | "success";
  onDismiss?: () => void;
}

export function ToastError({
  title,
  description,
  action,
  severity = "error",
  onDismiss,
}: ToastErrorProps) {
  const role = severity === "error" || severity === "warning" ? "alert" : "status";
  return (
    <ErrorMessage
      severity={severity}
      variant="toast"
      dismissible={true}
      onDismiss={onDismiss}
      title={title}
      description={description}
      action={action}
      role={role}
    />
  );
}

export interface CardErrorProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  severity?: "error" | "warning" | "info";
}

export function CardError({
  title,
  description,
  action,
  severity = "error",
}: CardErrorProps) {
  const role = severity === "error" || severity === "warning" ? "alert" : "status";
  return (
    <ErrorMessage
      severity={severity}
      variant="card"
      title={title}
      description={description}
      action={action}
      role={role}
    />
  );
}

export { ErrorMessage, AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X, errorMessageVariants };