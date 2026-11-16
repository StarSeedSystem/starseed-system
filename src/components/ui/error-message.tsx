"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, X, Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

export type ErrorSeverity = "error" | "warning" | "success" | "info";
export type ErrorContext = "network" | "validation" | "permission" | "server" | "unknown";

export interface ErrorMessageProps {
  message: string;
  severity?: ErrorSeverity;
  context?: ErrorContext;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
  compact?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

const baseStyles = "relative flex items-start gap-3 rounded-xl border p-4 transition-all duration-200";
const compactStyles = "gap-2 rounded-lg p-3";

const severityVariants = cva("", {
  variants: {
    severity: {
      error: "border-trinity-crimson/40 bg-trinity-crimson/10 text-trinity-crimson",
      warning: "border-trinity-amber/40 bg-trinity-amber/10 text-trinity-amber",
      success: "border-trinity-emerald/40 bg-trinity-emerald/10 text-trinity-emerald",
      info: "border-trinity-cyan/40 bg-trinity-cyan/10 text-trinity-cyan",
    },
    compact: {
      true: compactStyles,
      false: baseStyles,
    },
  },
  defaultVariants: { severity: "error", compact: false },
});

const iconVariants = cva("shrink-0 flex items-center justify-center", {
  variants: {
    severity: {
      error: "text-trinity-crimson",
      warning: "text-trinity-amber",
      success: "text-trinity-emerald",
      info: "text-trinity-cyan",
    },
    compact: {
      true: "h-4 w-4",
      false: "h-5 w-5",
    },
  },
  defaultVariants: { severity: "error", compact: false },
});

const titleStyles = cva("font-semibold tracking-tight", {
  variants: {
    compact: {
      true: "text-sm",
      false: "text-base",
    },
  },
  defaultVariants: { compact: false },
});

const messageStyles = cva("leading-relaxed", {
  variants: {
    compact: {
      true: "text-xs",
      false: "text-sm",
    },
  },
  defaultVariants: { compact: false },
});

const actionStyles = cva(
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      severity: {
        error: "bg-trinity-crimson/20 text-trinity-crimson hover:bg-trinity-crimson/30 focus:ring-trinity-crimson/40",
        warning: "bg-trinity-amber/20 text-trinity-amber hover:bg-trinity-amber/30 focus:ring-trinity-amber/40",
        success: "bg-trinity-emerald/20 text-trinity-emerald hover:bg-trinity-emerald/30 focus:ring-trinity-emerald/40",
        info: "bg-trinity-cyan/20 text-trinity-cyan hover:bg-trinity-cyan/30 focus:ring-trinity-cyan/40",
      },
      compact: {
        true: "px-2 py-1 text-xs",
        false: "px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: { severity: "error", compact: false },
  }
);

const dismissStyles = cva(
  "absolute top-3 right-3 rounded-md p-1 text-foreground/50 hover:text-foreground hover:bg-white/10 transition-colors focus:outline-none focus:ring-2",
  {
    variants: {
      severity: {
        error: "focus:ring-trinity-crimson/40",
        warning: "focus:ring-trinity-amber/40",
        success: "focus:ring-trinity-emerald/40",
        info: "focus:ring-trinity-cyan/40",
      },
      compact: {
        true: "top-2 right-2 p-0.5",
        false: "top-3 right-3 p-1",
      },
    },
    defaultVariants: { severity: "error", compact: false },
  }
);

function DefaultIcon({ severity, compact }: { severity: ErrorSeverity; compact: boolean }) {
  const size = compact ? 16 : 20;
  switch (severity) {
    case "error":
      return <AlertCircle className={cn(iconVariants({ severity, compact }))} aria-hidden />;
    case "warning":
      return <AlertCircle className={cn(iconVariants({ severity, compact }))} aria-hidden />;
    case "success":
      return <CheckCircle2 className={cn(iconVariants({ severity, compact }))} aria-hidden />;
    case "info":
      return <Info className={cn(iconVariants({ severity, compact }))} aria-hidden />;
  }
}

export function ErrorMessage({
  message,
  severity = "error",
  context,
  title,
  actionLabel,
  onAction,
  dismissible = false,
  onDismiss,
  compact = false,
  icon,
  className,
}: ErrorMessageProps) {
  const Icon = icon || <DefaultIcon severity={severity} compact={compact} />;

  const contextLabels: Record<ErrorContext, string> = {
    network: "Sin conexión",
    validation: "Dato inválido",
    permission: "Permiso denegado",
    server: "Servidor no disponible",
    unknown: "Error inesperado",
  };

  const contextIconMap: Record<ErrorContext, React.ReactNode> = {
    network: <span className="text-[10px]">📡</span>,
    validation: <span className="text-[10px]">✏️</span>,
    permission: <span className="text-[10px]">🔒</span>,
    server: <span className="text-[10px]">🖥️</span>,
    unknown: <span className="text-[10px]">❓</span>,
  };

  return (
    <div
      role="alert"
      className={cn(severityVariants({ severity, compact }), className)}
      data-severity={severity}
      data-context={context}
    >
      <div className="flex-1 min-w-0">
        {(title || context) && (
          <div className="flex items-center gap-2 mb-1">
            <span className={titleStyles({ compact })}>{title || contextLabels[context || "unknown"]}</span>
            {context && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider opacity-80">
                {contextIconMap[context]}
                {contextLabels[context]}
              </span>
            )}
          </div>
        )}
        <p className={messageStyles({ compact })}>{message}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(actionStyles({ severity, compact }), "mt-3")}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(dismissStyles({ severity, compact }))}
          aria-label="Descartar mensaje"
        >
          <X className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} aria-hidden />
        </button>
      )}
    </div>
  );
}

export interface InlineErrorProps {
  message: string;
  severity?: Exclude<ErrorSeverity, "success">;
  className?: string;
}

export function InlineError({ message, severity = "error", className }: InlineErrorProps) {
  return (
    <p
      role="alert"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        severity === "error" && "bg-trinity-crimson/20 text-trinity-crimson border border-trinity-crimson/30",
        severity === "warning" && "bg-trinity-amber/20 text-trinity-amber border border-trinity-amber/30",
        severity === "info" && "bg-trinity-cyan/20 text-trinity-cyan border border-trinity-cyan/30",
        className
      )}
    >
      {severity === "error" && <AlertCircle className="h-3 w-3" aria-hidden />}
      {severity === "warning" && <AlertCircle className="h-3 w-3" aria-hidden />}
      {severity === "info" && <Info className="h-3 w-3" aria-hidden />}
      {message}
    </p>
  );
}

export interface FieldErrorProps {
  message: string;
  className?: string;
}

export function FieldError({ message, className }: FieldErrorProps) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium text-trinity-crimson",
        "bg-trinity-crimson/10 border border-trinity-crimson/30 rounded-lg px-3 py-2",
        className
      )}
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

export interface ToastErrorProps {
  message: string;
  severity?: ErrorSeverity;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ToastError({ message, severity = "error", title, actionLabel, onAction }: ToastErrorProps) {
  return (
    <ErrorMessage
      message={message}
      severity={severity}
      title={title}
      actionLabel={actionLabel}
      onAction={onAction}
      dismissible={true}
      compact={true}
    />
  );
}