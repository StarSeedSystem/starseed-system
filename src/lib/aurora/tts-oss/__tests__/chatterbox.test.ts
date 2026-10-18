import { describe, it, expect } from "vitest";
import { spaceIdToHost, looksLikeChatterboxStandard, looksLikeAudio } from "../chatterbox";

describe("chatterbox.ts (pure functions)", () => {
  describe("spaceIdToHost", () => {
     it("converts owner/space to hostname", () => {
       expect(spaceIdToHost("username/spacename")).toBe("username-spacename");
       expect(spaceIdToHost("User_Name/Space_Name")).toBe("user-name-space-name");
       expect(spaceIdToHost("user/space/with/slashes")).toBe("user-space-with-slashes");
       expect(spaceIdToHost("  leading/trailing  ")).toBe("leading-trailing");
     });
  });

  describe("looksLikeChatterboxStandard", () => {
    it("returns true for a standard Chatterbox contract", () => {
      const ep: any = {
        parameters: [
          { python_type: { type: "string" }, label: "Text" },
          { python_type: { type: "string" }, label: "Language" },
          { python_type: { type: "number" }, label: "Exaggeration" },
          { component: "Audio", label: "Reference" },
        ],
      };
      expect(looksLikeChatterboxStandard(ep)).toBe(true);
    });

    it("returns false for non-standard contract", () => {
      const ep: any = {
        parameters: [
          { python_type: { type: "number" }, label: "Number" }, // first param not string
        ],
      };
      expect(looksLikeChatterboxStandard(ep)).toBe(false);
    });

    it("returns false for missing parameters", () => {
      const ep: any = { parameters: [] };
      expect(looksLikeChatterboxStandard(ep)).toBe(false);
    });
  });

   describe("looksLikeAudio", () => {
     it("detects WAV audio", () => {
       const wavHeader = new Uint8Array([82, 73, 70, 70]); // "RIFF"
       expect(looksLikeAudio(wavHeader)).toBe(true);
     });

     it("detects OGG audio", () => {
       const oggHeader = new Uint8Array([79, 103, 103, 83]); // "OggS"
       expect(looksLikeAudio(oggHeader)).toBe(true);
     });

     it("detects FLAC audio", () => {
       const flacHeader = new Uint8Array([102, 76, 97, 67]); // "fLaC"
       expect(looksLikeAudio(flacHeader)).toBe(true);
     });

     it("detects MP3 audio", () => {
       const mp3Header = new Uint8Array([255, 224]); // 0xFF 0xE0
       expect(looksLikeAudio(mp3Header)).toBe(true);
     });

     it("returns false for non-audio", () => {
       const notAudio = new Uint8Array([0, 0, 0, 0]);
       expect(looksLikeAudio(notAudio)).toBe(false);
     });

     it("returns false for too short array", () => {
       const short = new Uint8Array([1, 2, 3]);
       expect(looksLikeAudio(short)).toBe(false);
     });
   });
});