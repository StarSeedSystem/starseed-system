import { vi } from 'vitest';

// Mock window before importing any module that uses window
self.window = self.window || {};
self.window.speechSynthesis = {
    getVoices: () => [],
    speak: () => {},
    cancel: () => {}
};

// Mock SpeechSynthesisUtterance class
class MockSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = 'en';
        this.voice = null;
    }
    onend = null;
    onerror = null;
}

// Mock SpeechSynthesisVoice
class MockSpeechSynthesisVoice {
    constructor(lang, name) {
        this.lang = lang;
        this.name = name;
    }
}

self.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
self.SpeechSynthesisVoice = MockSpeechSynthesisVoice;
