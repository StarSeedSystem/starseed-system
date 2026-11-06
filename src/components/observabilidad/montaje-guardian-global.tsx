"use client";

import { useEffect } from "react";
import { registrarUnhandledRejectionHandler } from "@/lib/observabilidad/unhandled-rejection";

export function MontajeGuardianGlobal() {
  useEffect(() => {
    const cleanup = registrarUnhandledRejectionHandler();
    return cleanup;
  }, []);
  return null;
}
