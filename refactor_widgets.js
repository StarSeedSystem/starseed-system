const fs = require('fs');
const path = require('path');

const widgetsDir = path.join(__dirname, 'src/components/dashboard/widgets');
const files = fs.readdirSync(widgetsDir).filter(f => f.startsWith('weather-') && f.endsWith('.tsx'));

for (const file of files) {
    const filePath = path.join(widgetsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Check if it needs replacement for weather API
    if (content.includes("http://localhost:5000/api/starseed/weather-all") || content.includes("http://127.0.0.1:5000/api/starseed/weather-all")) {

        // 1. Add import for context
        if (!content.includes('useWeatherLocation')) {
            const importStatement = "import { useWeatherLocation } from '@/contexts/weather-location-context';\n";
            content = importStatement + content;
        }

        // 2. Add hook inside the component function
        // Match export function SomethingWidget() {
        const componentRegex = /export\s+function\s+([A-Za-z0-9_]+)\s*\(\s*(?:\{[^\}]*\})?\s*\)\s*\{/;
        if (componentRegex.test(content) && !content.includes('const { location } = useWeatherLocation();')) {
            content = content.replace(componentRegex, (match) => {
                return `${match}\n    const { location } = useWeatherLocation();`;
            });
        }

        // 3. Replace fetch URL
        content = content.replace(
            /fetch\(['"`]http:\/\/(localhost|127\.0\.0\.1):5000\/api\/starseed\/weather-all['"`]\)/g,
            "fetch(`http://127.0.0.1:5000/api/starseed/weather-all?lat=${location.lat}&lon=${location.lon}`)"
        );

        // 4. Update useEffect dependencies
        // Find useEffect(() => { ... fetch ... }, []) and change to [location.lat, location.lon]
        // Since regexing entire useEffect blocks is fragile, we'll try a simpler approach 
        // replacing the dependency array for empty useEffects if they contain the fetch.
        if (content.includes('location.lat')) {
            // Search for generic `}, []);` or `}, [])` at the end of hooks and add location.
            content = content.replace(/\}, \[\]\)/g, "}, [location.lat, location.lon])");
            content = content.replace(/\}, \[\]\);/g, "}, [location.lat, location.lon]);");
        }

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${file}`);
        } else {
            console.log(`No changes made to ${file}`);
        }
    }
}
