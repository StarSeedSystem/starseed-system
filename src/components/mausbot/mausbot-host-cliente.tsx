"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

const MausbotHost = dynamic(() => import("./mausbot-host").then((m) => m.MausbotHost), {
  ssr: false,
  loading: () => null,
});

export function MausbotHostCliente() {
  useEffect(() => {
    const handleVisibilityChange = () => {
      const host = document.querySelector("[data-aurora-exclude]");
      if (host && typeof host !== "string") {
        ;(host as HTMLElement).style.display = document.hidden ? "none" : "block";
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return <MausbotHost />;
}