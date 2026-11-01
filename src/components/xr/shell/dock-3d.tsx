'use client';

import { DockItemConfig } from "@/components/layout/dock-config";
import { loadDockConfig } from "@/components/layout/dock-config";
import { itemsDelDock, resolverApp } from "./apps-3d";
import { PanelCristal } from "../panel-cristal";
import { useEffect, useState } from "react";

export function Dock3D({ postura, abrir }: { postura: string; abrir: (id: string) => void }) {
  const [items, setItems] = useState<DockItemConfig[]>([]);

  useEffect(() => {
    const config = loadDockConfig();
    setItems(itemsDelDock(config, postura as any));

    const handler = () => {
      const config = loadDockConfig();
      setItems(itemsDelDock(config, postura as any));
    };
    window.addEventListener('storage', (e) => {
      if (e.key === 'starseed.dock.items.v2') handler();
    });
    return () => window.removeEventListener('storage', handler);
  }, [postura]);

  return (
    <div role="dock">
      {items.map(item => (
        <PanelCristal key={item.id} color={item.color}>
          {item.label}
        </PanelCristal>
      ))}
    </div>
  );
}
