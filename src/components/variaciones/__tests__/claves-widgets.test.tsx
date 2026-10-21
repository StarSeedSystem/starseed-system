import { render } from '@testing-library/react';
import { WidgetRegistry } from '@/components/dashboard/widget-registry';
import { GridArea } from '@/components/dashboard/grid-area';
import { DashboardWidget } from '@/components/dashboard/dashboard-types';

describe('Widget Keys', () => {
    it('should render widget with data-ss-elemento attribute', () => {
        const widget: DashboardWidget = {
            id: 'test-widget',
            widget_type: 'TEST_WIDGET',
            layout: { i: 'test-widget', x: 0, y: 0, w: 2, h: 2 },
            settings: {}
        };
        
        const { container } = render(
            <GridArea
                dashboardId="test-dashboard"
                widgets={[widget]}
                setWidgets={() => {}}
                isEditMode={false}
            />
        );
        
        const widgetElement = container.querySelector('[data-ss-elemento]');
        expect(widgetElement).toBeInTheDocument();
        expect(widgetElement).toHaveAttribute('data-ss-elemento', 'widget:TEST_WIDGET');
    });

    it('should render widget with correct widget type in registry', () => {
        const widget: DashboardWidget = {
            id: 'test-widget',
            widget_type: 'TEST_WIDGET',
            layout: { i: 'test-widget', x: 0, y: 0, w: 2, h: 2 },
            settings: {}
        };
        
        const { container } = render(<WidgetRegistry widget={widget} />);
        const widgetElement = container.querySelector('[data-ss-elemento]');
        expect(widgetElement).toBeInTheDocument();
        expect(widgetElement).toHaveAttribute('data-ss-elemento', 'widget:TEST_WIDGET');
    });
});