"use client";

/**
 * confirm-dialog.tsx — Reemplazo accesible de window.confirm/prompt (Adenda 137).
 * ============================================================================
 * Los diálogos NATIVOS del navegador (confirm/alert/prompt) son inaccesibles
 * (sin foco gestionado, sin tema, bloquean el hilo, rompen la estética "Crystal
 * Liquid Glass"). Este módulo expone dos hooks que devuelven una PROMESA,
 * respaldados por un único `<ConfirmProvider>` montado una vez cerca de la raíz:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "¿Eliminar?", destructive: true }))) return;
 *
 *   const prompt = usePrompt();
 *   const value = await prompt({ title: "Nombre", placeholder: "…" });
 *   if (value === null) return; // usuario canceló
 *
 * Patrón estándar: contexto + estado + "resolver" de promesa guardado en un
 * ref. Al confirmar/cancelar se resuelve la promesa pendiente y se cierra el
 * diálogo; solo puede haber una confirmación y un prompt "en vuelo" a la vez
 * (igual que los nativos, que también eran modales y bloqueantes).
 */

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** true → botón de confirmación en rojo (acción destructiva: borrar/restablecer/eliminar). */
  destructive?: boolean;
}

export interface PromptOptions {
  title?: string;
  description?: string;
  /** Etiqueta del campo (opcional; si falta, el input queda sin <Label>). */
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  type?: "text" | "number" | "email" | "url" | "password";
  /** Validación simple; devolver string = mensaje de error, null/undefined = válido. */
  validate?: (value: string) => string | null | undefined;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
/** Devuelve el string introducido, o `null` si el usuario canceló. */
type PromptFn = (opts: PromptOptions) => Promise<string | null>;

interface ConfirmContextValue {
  confirm: ConfirmFn;
  prompt: PromptFn;
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

type ConfirmState = ConfirmOptions & { open: boolean };
type PromptState = PromptOptions & { open: boolean };

const CLOSED_CONFIRM: ConfirmState = { open: false };
const CLOSED_PROMPT: PromptState = { open: false };

export function ConfirmProvider({ children }: { children?: React.ReactNode }) {
  const [confirmState, setConfirmState] = React.useState<ConfirmState>(CLOSED_CONFIRM);
  const confirmResolver = React.useRef<((value: boolean) => void) | null>(null);

  const [promptState, setPromptState] = React.useState<PromptState>(CLOSED_PROMPT);
  const [promptValue, setPromptValue] = React.useState("");
  const [promptError, setPromptError] = React.useState<string | null>(null);
  const promptResolver = React.useRef<((value: string | null) => void) | null>(null);

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      // Si había una confirmación previa sin resolver (no debería ocurrir:
      // el diálogo es modal), la resolvemos como cancelada para no perderla.
      confirmResolver.current?.(false);
      confirmResolver.current = resolve;
      setConfirmState({ ...opts, open: true });
    });
  }, []);

  const settleConfirm = React.useCallback((value: boolean) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmState((s) => ({ ...s, open: false }));
    resolve?.(value);
  }, []);

  const prompt = React.useCallback<PromptFn>((opts) => {
    return new Promise<string | null>((resolve) => {
      promptResolver.current?.(null);
      promptResolver.current = resolve;
      setPromptValue(opts.defaultValue ?? "");
      setPromptError(null);
      setPromptState({ ...opts, open: true });
    });
  }, []);

  const settlePrompt = React.useCallback((value: string | null) => {
    const resolve = promptResolver.current;
    promptResolver.current = null;
    setPromptState((s) => ({ ...s, open: false }));
    resolve?.(value);
  }, []);

  const submitPrompt = React.useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const err = promptState.validate?.(promptValue);
      if (err) {
        setPromptError(err);
        return;
      }
      settlePrompt(promptValue);
    },
    [promptState, promptValue, settlePrompt]
  );

  const ctxValue = React.useMemo<ConfirmContextValue>(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <ConfirmContext.Provider value={ctxValue}>
      {children}

      <AlertDialog
        open={confirmState.open}
        onOpenChange={(open) => {
          if (!open) settleConfirm(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState.title ?? "¿Estás seguro?"}</AlertDialogTitle>
            {confirmState.description ? (
              <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleConfirm(false)}>
              {confirmState.cancelText ?? "Cancelar"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settleConfirm(true)}
              className={confirmState.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            >
              {confirmState.confirmText ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={promptState.open}
        onOpenChange={(open) => {
          if (!open) settlePrompt(null);
        }}
      >
        <DialogContent>
          <form onSubmit={submitPrompt}>
            <DialogHeader>
              <DialogTitle>{promptState.title ?? "Introduce un valor"}</DialogTitle>
              {promptState.description ? (
                <DialogDescription>{promptState.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <div className="space-y-2 py-4">
              {promptState.label ? (
                <Label htmlFor="ss-prompt-input">{promptState.label}</Label>
              ) : null}
              <Input
                id="ss-prompt-input"
                autoFocus
                type={promptState.type ?? "text"}
                value={promptValue}
                placeholder={promptState.placeholder}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  if (promptError) setPromptError(null);
                }}
                aria-invalid={promptError ? true : undefined}
                aria-describedby={promptError ? "ss-prompt-error" : undefined}
              />
              {promptError ? (
                <p id="ss-prompt-error" className="text-sm text-destructive">
                  {promptError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => settlePrompt(null)}>
                {promptState.cancelText ?? "Cancelar"}
              </Button>
              <Button type="submit">{promptState.confirmText ?? "Aceptar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Devuelve `confirm(opts) => Promise<boolean>`. Requiere `<ConfirmProvider>` como ancestro. */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm() debe usarse dentro de <ConfirmProvider>");
  }
  return ctx.confirm;
}

/** Devuelve `prompt(opts) => Promise<string | null>` (null = cancelado). Requiere `<ConfirmProvider>`. */
export function usePrompt(): PromptFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("usePrompt() debe usarse dentro de <ConfirmProvider>");
  }
  return ctx.prompt;
}
