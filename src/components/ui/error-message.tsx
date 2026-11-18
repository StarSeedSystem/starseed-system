"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ErrorMessageProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof errorMessageVariants> {
  title?: string
  message: string
  action?: { label: string; onClick: () => void }
  dismissible?: boolean
  onDismiss?: () => void
}

const errorMessageVariants = cva(
  "relative flex items-start gap-3 rounded-[var(--radius)] border p-4 backdrop-blur-[var(--glass-blur)] bg-[rgba(var(--card-rgb),var(--glass-opacity))] border-white/10 shadow-lg transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full",
  {
    variants: {
      variant: {
        default: "border-destructive/50 text-destructive",
        destructive: "border-destructive/50 text-destructive",
        warning: "border-accent/50 text-accent",
        info: "border-primary/50 text-primary",
      },
      size: {
        sm: "gap-2 p-3 text-sm",
        md: "gap-3 p-4 text-base",
        lg: "gap-4 p-5 text-lg",
      },
    },
    defaultVariants: {
      variant: "destructive",
      size: "md",
    },
  }
)

const ErrorMessage = React.forwardRef<HTMLDivElement, ErrorMessageProps>(
  (
    {
      className,
      variant,
      size,
      title,
      message,
      action,
      dismissible = false,
      onDismiss,
      id,
      role = "alert",
      "aria-live": ariaLive = "assertive",
      children,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(true)

    const handleDismiss = () => {
      setIsOpen(false)
      onDismiss?.()
    }

    if (!isOpen) return null

    return (
      <div
        ref={ref}
        id={id}
        role={role}
        aria-live={ariaLive}
        data-state={isOpen ? "open" : "closed"}
        className={cn(errorMessageVariants({ variant, size }), className)}
        {...props}
      >
        <div className="flex-1 min-w-0">
          {title && (
            <h5 className="mb-1 font-medium leading-none tracking-tight">
              {title}
            </h5>
          )}
          <div className="text-sm [&_p]:leading-relaxed">
            {message}
            {children}
          </div>
          {action && (
            <button
              type="button"
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-current/30 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-current focus:ring-offset-2"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
        {dismissible && (
          <button
            type="button"
            className="absolute right-3 top-3 shrink-0 rounded-md p-1 text-current/50 opacity-0 transition-opacity hover:text-current focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-current focus:ring-offset-2 group-hover:opacity-100"
            onClick={handleDismiss}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)
ErrorMessage.displayName = "ErrorMessage"

export { ErrorMessage, errorMessageVariants }