const fs = require('fs');
const path = require('path');

const widgetsDir = path.join(__dirname, 'src/components/dashboard/widgets');
const files = fs.readdirSync(widgetsDir).filter(f => f.startsWith('weather-') && f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(widgetsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace the fetch URL to include template literal and context
  if (content.includes("fetch('http://localhost:5000/api/starseed/weather-all')")) {
    // Add import if not exists
    if (!content.includes('useWeatherLocation')) {
      content = content.replace(
        "import React, { useState, useEffect }",
        "import React, { useState, useEffect } from 'react';\nimport { useWeatherLocation } from '@/contexts/weather-location-context';"
      );
      // Fallback for different import styles
      if(!content.includes('useWeatherLocation')) {
          content = "import { useWeatherLocation } from '@/contexts/weather-location-context';\n" + content;
      }
    }
    
    // Inject hook
    content = content.replace(
      /export function ([A-Za-z0-9_]+)\(\s*(?:\{[^\}]*\})?\s*\)\s*\{/,
      "export function $1() {\n    const { location } = useWeatherLocation();\n"
    );
    
    // Replace fetch
    content = content.replace(
      "fetch('http://localhost:5000/api/starseed/weather-all')",
      "fetch(`http://127.0.0.1:5000/api/starseed/weather-all?lat=${location.lat}&lon=${location.lon}`)"
    );
    
    // Add dependency to useEffect
    content = content.replace(
      "useEffect(() => {",
      "useEffect(() => {\n        let mounted = true;"
    );
    // this regex might be tough to get right generally, just simple replacing
    content = content.replace(
      /\[\]\);/g,
      "[location.lat, location.lon]);"
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
