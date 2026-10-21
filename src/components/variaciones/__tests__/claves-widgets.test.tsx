import { describe, it, expect } from "vitest";

// Tests de funciones puras para verificar las claves de widgets
const buildWidgetKey = (widgetType: string) => `widget:${widgetType}`;

describe('Widget Keys', () => {
    it('should build widget key correctly', () => {
        const key = buildWidgetKey('TEST_WIDGET');
        expect(key).toBe('widget:TEST_WIDGET');
    });

    it('should validate widget key format', () => {
        const widgetType = 'CLOCK_DATE';
        const expectedKey = 'widget:CLOCK_DATE';
        const actualKey = buildWidgetKey(widgetType);
        expect(actualKey).toBe(expectedKey);
    });

    it('should generate consistent keys for multiple widget types', () => {
        const types = ['WEATHER_BASIC', 'TASKS_QUICK', 'MUSIC_PLAYER'];
        const keys = types.map(t => buildWidgetKey(t));
        expect(keys).toEqual([
            'widget:WEATHER_BASIC',
            'widget:TASKS_QUICK',
            'widget:MUSIC_PLAYER'
        ]);
    });
});