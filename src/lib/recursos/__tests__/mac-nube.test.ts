import { describe, it, expect } from "vitest";
import {
  planSparseBundle,
  planMoverDatos,
  planVolverAtras,
} from "../mac-nube";

describe("mac-nube.ts", () => {
  describe("planSparseBundle", () => {
    it("devuelve pasos con sintaxis hdiutil y comprueba carpeta Drive", () => {
      const plan = planSparseBundle({
        carpetaDrive: "~/Library/CloudStorage/GoogleDrive-abc",
        nombre: "MiApp",
        tamanoGB: 2,
      });
      expect(plan.comprobacionCarpeta).toBe(true);
      expect(plan.pasos.length).toBe(2);
      expect(plan.pasos[0].orden).toContain("hdiutil create");
      expect(plan.pasos[1].orden).toContain("hdiutil attach");
      expect(plan.rutaBundle).toBe("~/Library/CloudStorage/GoogleDrive-abc/MiApp.sparsebundle");
    });

    it("rechaza carpeta fuera de Drive", () => {
      const plan = planSparseBundle({
        carpetaDrive: "/tmp/otra",
        nombre: "X",
        tamanoGB: 1,
      });
      expect(plan.comprobacionCarpeta).toBe(false);
    });
  });

  describe("planMoverDatos", () => {
    it("incluye respaldo y enlace cuando todo va bien", () => {
      const plan = planMoverDatos({
        app: "MiApp",
        origen: "/Apps/MiApp/datos",
        destino: "/Volumes/Nube/MiApp/datos",
        appCerrada: () => true,
        ejecutarDitto: () => true,
        verificarTamanos: () => true,
        comprobarAbre: () => true,
      });
      expect(plan.pasos.some(p => p.orden === "ditto")).toBe(true);
      expect(plan.pasos.some(p => p.orden === "ln -s")).toBe(true);
      expect(plan.respaldoRenombrado).toBe("/Apps/MiApp/datos.respaldo-starseed");
    });

    it("exige confirmación si la app no está cerrada", () => {
      const plan = planMoverDatos({
        app: "Corriendo",
        origen: "/A",
        destino: "/B",
        appCerrada: () => false,
        ejecutarDitto: () => true,
        verificarTamanos: () => true,
        comprobarAbre: () => true,
      });
      const paso = plan.pasos.find(p => p.orden === "verificar-app-cerrada");
      expect(paso).toBeDefined();
      expect(paso!.requiereConfirmacion).toBe(true);
    });
  });

  describe("planVolverAtras", () => {
    it("restaura el respaldo y elimina el enlace", () => {
      const plan = planVolverAtras({
        respaldo: "/A.respaldo-starseed",
        original: "/A",
      });
      expect(plan.respaldoAUsar).toBe("/A.respaldo-starseed");
      expect(plan.pasos[0].orden).toBe("eliminar-enlace");
      expect(plan.pasos[1].orden).toBe("restaurar-respaldo");
    });
  });
});
