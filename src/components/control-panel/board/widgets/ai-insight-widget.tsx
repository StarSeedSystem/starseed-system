import React, { useState, useEffect } from "react";
import { Sparkles, BrainCircuit } from "lucide-react";
import { useUserContext } from "@/context/user-context";

export function AIInsightWidget() {
    const { getContextSummary, analyzeContext } = useUserContext();
    const [summary, setSummary] = useState("Initializing Neural Link...");

    useEffect(() => {
        analyzeContext(); // Trigger analysis on mount
        const timer = setTimeout(() => {
            setSummary(getContextSummary());
        }, 1500); // Fake delay for effect
        return () => clearTimeout(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-indigo-950/20 rounded-lg backdrop-blur-md relative overflow-hidden group">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 animate-pulse" />

            {/* Decorative Elements */}
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
            <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />

            <div className="relative z-10 flex flex-col items-center">
                <div className="mb-4 relative">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                    <Sparkles className="w-8 h-8 text-indigo-400 relative z-10 animate-pulse duration-[3000ms]" />
                </div>

                <h4 className="text-xs font-bold text-indigo-200 mb-3 tracking-widest uppercase flex items-center gap-2">
                    <BrainCircuit className="w-3 h-3" />
                    Neural Insight
                </h4>

                <p className="text-xs text-indigo-100/70 leading-relaxed max-w-[90%] transition-all duration-500 font-light">
                    {summary}
                </p>
            </div>

            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-indigo-500/10 blur-2xl rounded-full pointer-events-none" />
        </div>
    );
}
