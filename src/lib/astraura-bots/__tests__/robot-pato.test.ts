import { describe, expect, it } from "vitest";
import { robotPatoCommand } from "../robot-pato";

describe("robotPatoCommand", () => {
  it("genera comando para caminar", () => {
    const action = {
      tipo: "robot.caminar",
      args: { direction: "adelante", distance: 50 },
    };
    expect(robotPatoCommand(action)).toBe("WALK adelante 50");
  });

  it("genera comando para girar", () => {
    const action = {
      tipo: "robot.girar",
      args: { angle: 90 },
    };
    expect(robotPatoCommand(action)).toBe("TURN 90");
  });

  it("genera comando para emoción", () => {
    const action = {
      tipo: "robot.emocion",
      args: { emotion: "alegria" },
    };
    expect(robotPatoCommand(action)).toBe("EMOTION alegria");
  });

  it("genera comando para bailar", () => {
    const action = {
      tipo: "robot.bailar",
      args: { danceType: "waltz", duration: 30 },
    };
    expect(robotPatoCommand(action)).toBe("DANCE waltz 30");
  });

  it("genera comando para negar con la cabeza", () => {
    const action = {
      tipo: "robot.negarCabeza",
      args: { times: 3 },
    };
    expect(robotPatoCommand(action)).toBe("DENY 3");
  });

  it("genera comando para alto", () => {
    const action = {
      tipo: "robot.alto",
      args: {},
    };
    expect(robotPatoCommand(action)).toBe("ALTO");
  });

  it("lanza error para acción desconocida", () => {
    // @ts-expect-error: intentional wrong type
    const action = { tipo: "robot.desconocido", args: {} };
    expect(() => robotPatoCommand(action)).toThrow(
      /Unknown robot pato action/
    );
  });
});