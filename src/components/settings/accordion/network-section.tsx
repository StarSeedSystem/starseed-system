"use client";

import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioTower, Wifi, Shield } from "lucide-react";
import { RedMeshSection } from "./red-mesh-section";

export interface NetworkSectionProps {
  defaultOpen?: boolean;
}

export function NetworkSection({ defaultOpen = true }: NetworkSectionProps) {
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? "red-mesh" : undefined} className="w-full space-y-2">
      <AccordionItem value="red-mesh" className="border border-border/60 rounded-lg px-4 bg-card/30">
        <AccordionTrigger className="hover:no-underline py-4 cursor-pointer">
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <RadioTower className="h-5 w-5 text-emerald-400" />
            <span>Red Mesh, Señales y Voz de Borde</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-4">
          <RedMeshSection />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
