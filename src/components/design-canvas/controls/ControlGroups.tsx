"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
    icon: React.ElementType;
    title: string;
    color?: string;
    className?: string;
}

export function SectionHeader({ icon: Icon, title, color = "text-amber-400", className }: SectionHeaderProps) {
    return (
        <h4 className={cn("text-xs text-white/60 uppercase tracking-wider flex items-center gap-2", className)}>
            <Icon className={cn("w-3 h-3", color)} /> {title}
        </h4>
    );
}

interface FamilySectionProps {
    id: string;
    children: React.ReactNode;
    className?: string;
}

export function FamilySection({ id, children, className }: FamilySectionProps) {
    return (
        <div id={`family-${id}`} className={cn("space-y-3 scroll-mt-4", className)}>
            {children}
        </div>
    );
}
