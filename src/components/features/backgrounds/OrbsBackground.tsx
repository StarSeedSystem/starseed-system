"use client";

import React from "react";
import { cn } from "@/lib/utils";

export function OrbsBackground() {
    return (
        <div className="bg-orbs absolute inset-0 overflow-hidden pointer-events-none z-[-1]">
            <div className="orb orb-1"></div>
            <div className="orb orb-2"></div>
            <div className="orb orb-3"></div>
        </div>
    );
}
