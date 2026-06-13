'use client';

import { useState, useCallback } from "react";
import { Calculator, Equal, Delete } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { WidgetShell } from "../kit";

// ════════════════════════════════════════════════════════════════
// CalculatorWidget — utilidad de cálculo local. Sin fuentes externas
// (procesamiento local, invariante de soberanía). Adaptativo.
// ════════════════════════════════════════════════════════════════
type BtnType = "num" | "operator" | "action" | "equal";
const BUTTONS: { label: string; type: BtnType; wide?: boolean }[] = [
    { label: "C", type: "action" }, { label: "⌫", type: "action" }, { label: "%", type: "action" }, { label: "÷", type: "operator" },
    { label: "7", type: "num" }, { label: "8", type: "num" }, { label: "9", type: "num" }, { label: "×", type: "operator" },
    { label: "4", type: "num" }, { label: "5", type: "num" }, { label: "6", type: "num" }, { label: "−", type: "operator" },
    { label: "1", type: "num" }, { label: "2", type: "num" }, { label: "3", type: "num" }, { label: "+", type: "operator" },
    { label: "0", type: "num", wide: true }, { label: ".", type: "num" }, { label: "=", type: "equal" },
];

function evaluate(expr: string): string {
    try {
        const norm = expr.replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-").replace(/%/g, "/100");
        if (!/^[-+*/().\d\s]+$/.test(norm)) return "Error";
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict";return (${norm})`)();
        if (typeof result !== "number" || !isFinite(result)) return "Error";
        return String(Math.round(result * 1e10) / 1e10);
    } catch {
        return "Error";
    }
}

export function CalculatorWidget() {
    const [expr, setExpr] = useState("");
    const [display, setDisplay] = useState("0");

    const press = useCallback((label: string) => {
        if (label === "C") { setExpr(""); setDisplay("0"); return; }
        if (label === "⌫") { setExpr(e => e.slice(0, -1)); setDisplay(d => (d.length <= 1 ? "0" : d.slice(0, -1))); return; }
        if (label === "=") { const r = evaluate(expr || display); setDisplay(r); setExpr(r === "Error" ? "" : r); return; }
        setExpr(e => (e === "0" ? label : e + label));
        setDisplay(d => (d === "0" || d === "Error" ? label : (d.length < 16 ? d + label : d)));
    }, [expr, display]);

    return (
        <WidgetShell title="Calculadora" subtitle="Cálculo local" icon={Calculator} accent="#6366f1">
            {(size) => {
                const micro = size.tier === "micro" || size.vTier === "micro";
                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="shrink-0 rounded-xl border border-border/40 bg-black/20 px-3 py-2 flex flex-col items-end justify-center overflow-hidden" style={{ height: micro ? 40 : 56 }}>
                            <span className="w-full truncate text-right font-mono font-black tabular-nums tracking-tight text-foreground"
                                style={{ fontSize: display.length > 10 ? "1.1rem" : micro ? "1.25rem" : "1.75rem" }}>
                                {display}
                            </span>
                        </div>
                        <div className="flex-1 grid grid-cols-4 gap-1.5 min-h-0">
                            {BUTTONS.map((btn) => (
                                <motion.button
                                    key={btn.label}
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => press(btn.label)}
                                    className={cn(
                                        "rounded-xl grid place-items-center font-black border transition-colors cursor-pointer min-h-0",
                                        micro ? "text-xs" : "text-sm @sm:text-base",
                                        btn.wide ? "col-span-2" : "col-span-1",
                                        btn.type === "equal" ? "bg-primary text-primary-foreground border-primary/40"
                                            : btn.type === "operator" ? "bg-primary/10 border-primary/25 text-primary hover:bg-primary/20"
                                                : btn.type === "action" ? "bg-white/[0.04] border-border/40 text-muted-foreground hover:text-foreground"
                                                    : "bg-white/[0.04] border-border/40 text-foreground hover:bg-white/[0.08]"
                                    )}
                                >
                                    {btn.label === "=" ? <Equal className="size-4" /> : btn.label === "⌫" ? <Delete className="size-4" /> : btn.label}
                                </motion.button>
                            ))}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
