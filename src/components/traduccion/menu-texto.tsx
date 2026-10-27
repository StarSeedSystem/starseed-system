"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface ContextoMenuTexto {
  seleccion: string;
  bloqueBajoPuntero: HTMLElement | null;
  paginaTraducida: boolean;
}

export interface EntradaMenuTexto {
  id: string;
  etiqueta: string;
  visible: (ctx: ContextoMenuTexto) => boolean;
  ejecutar: (ctx: ContextoMenuTexto) => void;
}

export const entradasRegistradas: EntradaMenuTexto[] = [];

export function registrarEntradaMenuTexto(entrada: EntradaMenuTexto): void {
  if (!entradasRegistradas.some((e) => e.id === entrada.id)) {
    entradasRegistradas.push(entrada);
  }
}

interface MenuTextoState {
  abierto: boolean;
  x: number;
  y: number;
  ctx: ContextoMenuTexto | null;
}

export function MenuTexto() {
  const [state, setState] = useState<MenuTextoState>({
    abierto: false,
    x: 0,
    y: 0,
    ctx: null,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const cerrar = useCallback(() => {
    setState((s) => ({ ...s, abierto: false, ctx: null }));
  }, []);

  useEffect(() => {
    function alContextMenu(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.shiftKey) return;

      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      const seleccion = window.getSelection()?.toString().trim() ?? "";
      if (!seleccion) return;

      e.preventDefault();

      const bloqueBajoPuntero = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const paginaTraducida = document.documentElement.lang !== "es";

      setState({
        abierto: true,
        x: e.clientX,
        y: e.clientY,
        ctx: { seleccion, bloqueBajoPuntero, paginaTraducida },
      });
    }

    function alClickFuera(e: MouseEvent) {
      if (state.abierto && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        cerrar();
      }
    }

    function alTeclado(e: KeyboardEvent) {
      if (!state.abierto) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
      }
    }

    document.addEventListener("contextmenu", alContextMenu);
    document.addEventListener("mousedown", alClickFuera);
    document.addEventListener("keydown", alTeclado);

    return () => {
      document.removeEventListener("contextmenu", alContextMenu);
      document.removeEventListener("mousedown", alClickFuera);
      document.removeEventListener("keydown", alTeclado);
    };
  }, [state.abierto, cerrar]);

  if (!state.abierto || !state.ctx) return null;

  const entradasVisibles = entradasRegistradas.filter((e) => e.visible(state.ctx!));

  const alTecladoMenu = (e: React.KeyboardEvent) => {
    const items = itemsRef.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.findIndex((x) => x === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      cerrar();
    }
  };

  const ejecutarEntrada = (entrada: EntradaMenuTexto) => {
    if (state.ctx) {
      entrada.ejecutar(state.ctx);
      cerrar();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Acciones de texto"
      onKeyDown={alTecladoMenu}
      style={{ left: state.x, top: state.y, position: "fixed", zIndex: 9999 }}
      className={cn(
        "rounded-2xl border border-white/10 bg-[#0A0F1D]/95 p-1 shadow-lg shadow-black/50 backdrop-blur-[16px]",
        "animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none",
      )}
    >
      {entradasVisibles.map((entrada, idx) => (
        <button
          key={entrada.id}
          ref={(el) => { itemsRef.current[idx] = el; }}
          type="button"
          role="menuitem"
          onClick={() => ejecutarEntrada(entrada)}
          className={cn(
            "flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm",
            "transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none",
          )}
        >
          {entrada.etiqueta}
        </button>
      ))}
    </div>
  );
}