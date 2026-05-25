const fs = require('fs');

const dir = './src/components/dashboard/widgets/';
const files = fs.readdirSync(dir).filter(f => f.startsWith('weather-') && f.endsWith('.tsx'));

for (const file of files) {
    const filePath = dir + file;
    let content = fs.readFileSync(filePath, 'utf8');

    let modified = false;

    if (content.includes('fetch(`http://127.0.0.1:5001/api/starseed/weather-all') || content.includes('fetch(`/api/starseed/weather-all')) {

        if (!content.includes('fetchWeatherData')) {
            content = content.replace(
                "import { useWeatherLocation } from '@/contexts/weather-location-context';",
                "import { useWeatherLocation } from '@/contexts/weather-location-context';\nimport { fetchWeatherData } from '@/lib/weather-mock';"
            );
        }

        // 1. Omni Climate (async/await)
        content = content.replace(
            /const res = await fetch\(`\/api\/starseed\/weather-all\?lat=\$\{location\.lat\}&lon=\$\{location\.lon\}`\);\s*if \(!res\.ok\) throw new Error\('Weather API failed'\);\s*const data = await res\.json\(\);/g,
            "const data = await fetchWeatherData(location.lat, location.lon);"
        );

        // 2. WeatherSpaceWidget and others with explicit error throw block
        content = content.replace(
            /fetch\(`http:\/\/127\.0\.0\.1:5001\/api\/starseed\/weather-all\?lat=\$\{location\.lat\}&lon=\$\{location\.lon\}`\)\s*\.then\(\s*res\s*=>\s*\{\s*if\s*\(!res\.ok\)\s*throw new Error\("API failed"\);\s*return res\.json\(\);\s*\}\s*\)/g,
            "fetchWeatherData(location.lat, location.lon)"
        );

        // 3. Simple .then(res => res.json())
        content = content.replace(
            /fetch\(`http:\/\/127\.0\.0\.1:5001\/api\/starseed\/weather-all\?lat=\$\{location\.lat\}&lon=\$\{location\.lon\}`\)\s*\.then\(res => res\.json\(\)\)/g,
            "fetchWeatherData(location.lat, location.lon)"
        );

        fs.writeFileSync(filePath, content);
        modified = true;
        console.log(`Updated ${file}`);
    }
}
console.log("Done.");
