import { describe, it, expect } from "vitest"
import { PRODUCTIVITY_SKILLS } from "../productividad"

describe("Productivity Skills", () => {
  it("should have 7 skills", () => {
    expect(PRODUCTIVITY_SKILLS).toHaveLength(7)
  })

  it("should contain grill-me skill", () => {
    const grillMe = PRODUCTIVITY_SKILLS.find(skill => skill.id === "grill-me")
    expect(grillMe).toBeDefined()
    expect(grillMe?.label).toBe("Grill Me")
  })

  it("should contain grilling skill", () => {
    const grilling = PRODUCTIVITY_SKILLS.find(skill => skill.id === "grilling")
    expect(grilling).toBeDefined()
    expect(grilling?.label).toBe("Grilling")
  })

  it("should contain handoff skill", () => {
    const handoff = PRODUCTIVITY_SKILLS.find(skill => skill.id === "handoff")
    expect(handoff).toBeDefined()
    expect(handoff?.label).toBe("Handoff")
  })

  it("should contain teach skill", () => {
    const teach = PRODUCTIVITY_SKILLS.find(skill => skill.id === "teach")
    expect(teach).toBeDefined()
    expect(teach?.label).toBe("Teach")
  })

  it("should contain to-questionnaire skill", () => {
    const toQuestionnaire = PRODUCTIVITY_SKILLS.find(skill => skill.id === "to-questionnaire")
    expect(toQuestionnaire).toBeDefined()
    expect(toQuestionnaire?.label).toBe("To Questionnaire")
  })

  it("should contain wait-what skill", () => {
    const waitWhat = PRODUCTIVITY_SKILLS.find(skill => skill.id === "wait-what")
    expect(waitWhat).toBeDefined()
    expect(waitWhat?.label).toBe("Wait What")
  })

  it("should contain writing-for-agents skill", () => {
    const writingForAgents = PRODUCTIVITY_SKILLS.find(skill => skill.id === "writing-for-agents")
    expect(writingForAgents).toBeDefined()
    expect(writingForAgents?.label).toBe("Writing for Agents")
  })
})