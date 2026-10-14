import { describe, it, expect } from "vitest";
import { 
  elegirCanaria, 
  NeuronaCandidata,
  evaluarHumo,
  ResultadoHumo,
  siguienteEstado,
  EstadoDespliegue,
  EventoDespliegue
} from "../canario";

describe("elegirCanaria", () => {
     it("returns null when no neurons are online", () => {
       const neurons: NeuronaCandidata[] = [
         { id: "a", online: false, usoReciente: 0 },
         { id: "b", online: false, usoReciente: 5 }
       ];
       expect(elegirCanaria(neurons)).toBeNull();
     });

     it("returns the neuron with elegida true when online", () => {
       const neurons: NeuronaCandidata[] = [
         { id: "a", online: true, usoReciente: 0, elegida: true },
         { id: "b", online: true, usoReciente: 10, elegida: false }
       ];
       expect(elegirCanaria(neurons)).toBe("a");
     });

     it("returns the only online neuron when no elegida", () => {
       const neurons: NeuronaCandidata[] = [
         { id: "a", online: true, usoReciente: 0 },
         { id: "b", online: false, usoReciente: 5 }
       ];
       expect(elegirCanaria(neurons)).toBe("a");
     });

     it("returns the elegida neuron when multiple online and one elegida", () => {
       const neurons: NeuronaCandidata[] = [
         { id: "a", online: true, usoReciente: 0, elegida: false },
         { id: "b", online: true, usoReciente: 10, elegida: true },
         { id: "c", online: true, usoReciente: 20, elegida: false }
       ];
       expect(elegirCanaria(neurons)).toBe("b");
     });

     it("returns the neuron with highest usoReciente when no elegida", () => {
       const neurons: NeuronaCandidata[] = [
         { id: "a", online: true, usoReciente: 0 },
         { id: "b", online: true, usoReciente: 10 },
         { id: "c", online: true, usoReciente: 5 }
       ];
       expect(elegirCanaria(neurons)).toBe("b");
     });

     it("returns the neuron with smaller id in case of tie in usoReciente", () => {
       const neurons: NeuronaCandidata[] = [
         { id: "b", online: true, usoReciente: 5 },
         { id: "a", online: true, usoReciente: 5 },
         { id: "c", online: true, usoReciente: 3 }
       ];
       expect(elegirCanaria(neurons)).toBe("a");
     });

     it("returns null when all neurons are offline even if one has elegida", () => {
       const neurons: NeuronaCandidata[] = [
         { id: "a", online: false, usoReciente: 0, elegida: true },
         { id: "b", online: false, usoReciente: 10 }
       ];
       expect(elegirCanaria(neurons)).toBeNull();
     });
   });

describe("evaluarHumo", () => {
     it("returns ok true when paginaCarga true and all services true", () => {
       const r: ResultadoHumo = {
         paginaCarga: true,
         servicios: { auth: true, db: true, api: true }
       };
       const result = evaluarHumo(r);
       expect(result.ok).toBe(true);
       expect(result.fallos).toEqual([]);
     });

     it("returns ok false when paginaCarga false", () => {
       const r: ResultadoHumo = {
         paginaCarga: false,
         servicios: { auth: true, db: true }
       };
       const result = evaluarHumo(r);
       expect(result.ok).toBe(false);
       expect(result.fallos).toEqual(["paginaCarga"]);
     });

     it("returns ok false when paginaCarga true and one service false", () => {
       const r: ResultadoHumo = {
         paginaCarga: true,
         servicios: { auth: true, db: false, api: true }
       };
       const result = evaluarHumo(r);
       expect(result.ok).toBe(false);
       expect(result.fallos).toEqual(["db"]);
     });

     it("returns ok false when paginaCarga true and multiple services false", () => {
       const r: ResultadoHumo = {
         paginaCarga: true,
         servicios: { auth: false, db: false, api: true }
       };
       const result = evaluarHumo(r);
       expect(result.ok).toBe(false);
       expect(result.fallos).toEqual(["auth", "db"]);
     });

     it("returns ok false when paginaCarga false and services false", () => {
       const r: ResultadoHumo = {
         paginaCarga: false,
         servicios: { auth: false, db: true }
       };
       const result = evaluarHumo(r);
       expect(result.ok).toBe(false);
       expect(result.fallos).toEqual(["paginaCarga", "auth"]);
     });

     it("returns fallos containing the expected service keys", () => {
       const r: ResultadoHumo = {
         paginaCarga: true,
         servicios: { zebra: false, alpha: false }
       };
       const result = evaluarHumo(r);
       expect(result.ok).toBe(false);
       expect(result.fallos).toContain("alpha");
       expect(result.fallos).toContain("zebra");
       expect(result.fallos.length).toBe(2);
     });
   });

describe("siguienteEstado", () => {
     it("pendiente + aplicada-en-canaria -> canaria", () => {
       const e: EstadoDespliegue = "pendiente";
       const ev: EventoDespliegue = { tipo: "aplicada-en-canaria" };
       expect(siguienteEstado(e, ev)).toBe("canaria");
     });

     it("pendiente + any other event -> pendiente", () => {
       const e: EstadoDespliegue = "pendiente";
       const ev1: EventoDespliegue = { tipo: "humo", ok: true };
       const ev2: EventoDespliegue = { tipo: "propagada" };
       const ev3: EventoDespliegue = { tipo: "revertida" };
       expect(siguienteEstado(e, ev1)).toBe("pendiente");
       expect(siguienteEstado(e, ev2)).toBe("pendiente");
       expect(siguienteEstado(e, ev3)).toBe("pendiente");
     });

     it("canaria + humo ok -> propagando", () => {
       const e: EstadoDespliegue = "canaria";
       const ev: EventoDespliegue = { tipo: "humo", ok: true };
       expect(siguienteEstado(e, ev)).toBe("propagando");
     });

     it("canaria + humo not ok -> revirtiendo", () => {
       const e: EstadoDespliegue = "canaria";
       const ev: EventoDespliegue = { tipo: "humo", ok: false };
       expect(siguienteEstado(e, ev)).toBe("revirtiendo");
     });

     it("canaria + any other event -> canaria", () => {
       const e: EstadoDespliegue = "canaria";
       const ev1: EventoDespliegue = { tipo: "aplicada-en-canaria" };
       const ev2: EventoDespliegue = { tipo: "propagada" };
       const ev3: EventoDespliegue = { tipo: "revertida" };
       expect(siguienteEstado(e, ev1)).toBe("canaria");
       expect(siguienteEstado(e, ev2)).toBe("canaria");
       expect(siguienteEstado(e, ev3)).toBe("canaria");
     });

     it("propagando + propagada -> hecho", () => {
       const e: EstadoDespliegue = "propagando";
       const ev: EventoDespliegue = { tipo: "propagada" };
       expect(siguienteEstado(e, ev)).toBe("hecho");
     });

     it("propagando + any other event -> propagando", () => {
       const e: EstadoDespliegue = "propagando";
       const ev1: EventoDespliegue = { tipo: "aplicada-en-canaria" };
       const ev2: EventoDespliegue = { tipo: "humo", ok: true };
       const ev3: EventoDespliegue = { tipo: "revertida" };
       expect(siguienteEstado(e, ev1)).toBe("propagando");
       expect(siguienteEstado(e, ev2)).toBe("propagando");
       expect(siguienteEstado(e, ev3)).toBe("propagando");
     });

     it("hecho + any event -> hecho", () => {
       const e: EstadoDespliegue = "hecho";
       const ev1: EventoDespliegue = { tipo: "aplicada-en-canaria" };
       const ev2: EventoDespliegue = { tipo: "humo", ok: true };
       const ev3: EventoDespliegue = { tipo: "propagada" };
       const ev4: EventoDespliegue = { tipo: "revertida" };
       expect(siguienteEstado(e, ev1)).toBe("hecho");
       expect(siguienteEstado(e, ev2)).toBe("hecho");
       expect(siguienteEstado(e, ev3)).toBe("hecho");
       expect(siguienteEstado(e, ev4)).toBe("hecho");
     });

     it("revirtiendo + revertida -> revertido", () => {
       const e: EstadoDespliegue = "revirtiendo";
       const ev: EventoDespliegue = { tipo: "revertida" };
       expect(siguienteEstado(e, ev)).toBe("revertido");
     });

     it("revirtiendo + any other event -> revirtiendo", () => {
       const e: EstadoDespliegue = "revirtiendo";
       const ev1: EventoDespliegue = { tipo: "aplicada-en-canaria" };
       const ev2: EventoDespliegue = { tipo: "humo", ok: true };
       const ev3: EventoDespliegue = { tipo: "propagada" };
       expect(siguienteEstado(e, ev1)).toBe("revirtiendo");
       expect(siguienteEstado(e, ev2)).toBe("revirtiendo");
       expect(siguienteEstado(e, ev3)).toBe("revirtiendo");
     });

     it("revertido + any event -> revertido", () => {
       const e: EstadoDespliegue = "revertido";
       const ev1: EventoDespliegue = { tipo: "aplicada-en-canaria" };
       const ev2: EventoDespliegue = { tipo: "humo", ok: true };
       const ev3: EventoDespliegue = { tipo: "propagada" };
       const ev4: EventoDespliegue = { tipo: "revertida" };
       expect(siguienteEstado(e, ev1)).toBe("revertido");
       expect(siguienteEstado(e, ev2)).toBe("revertido");
       expect(siguienteEstado(e, ev3)).toBe("revertido");
       expect(siguienteEstado(e, ev4)).toBe("revertido");
     });
   });