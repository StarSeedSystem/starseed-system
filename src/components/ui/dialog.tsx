"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"
import { acquireFullscreenModal } from "@/lib/ui/fullscreen-modal"
import { useAppearance } from "@/context/appearance-context"
import { BotonCerrar } from "@/components/ui/boton-cerrar"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { config } = useAppearance();
  const isPrimary = config.themeStore.activeMode === 'primary';

  // Adenda 188: mientras este diálogo esté montado (= abierto), el dock
  // Trinity se repliega a sus esquinas y el modal manda en la pantalla.
  React.useEffect(() => acquireFullscreenModal(), []);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-[121] flex flex-col w-[95vw] md:w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 ss-dialogo sm:rounded-lg",
          isPrimary ? "bg-black/10 border-white/10 text-white shadow-2xl backdrop-blur-sm overflow-hidden" : "bg-background liquid-glass-panel",
          className
        )}
        data-component="dialog"
        data-ss-modal-content=""
        {...props}
      >
        {isPrimary && (
          <div className="absolute inset-0 z-0 opacity-40 bg-gradient-to-br from-white/10 to-transparent pointer-events-none sm:rounded-lg" />
        )}
        {/* (Adenda 190) flex-1 + min-h-0 + overflow: el contenido largo SCROLLEA
            dentro del diálogo (antes h-full lo recortaba en pantallas bajas). */}
        <div className={cn("relative z-10 w-full flex-1 min-h-0 overflow-y-auto", isPrimary && "drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]")}>
          {children}
        </div>
        {/* X común del OS (2026-09-25): antes 32 px y casi invisible; ahora el
            disco de cristal con área táctil de 44 px, igual en todos los menús. */}
        <DialogPrimitive.Close asChild>
          <BotonCerrar etiqueta="Cerrar" atajo="Esc" tamano="sm" posicion="interior" className="z-20" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
