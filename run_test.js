const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`[Browser Console Error] ${msg.text()}`);
        } else {
            console.log(`[Browser Console] ${msg.text()}`);
        }
    });
    
    page.on('pageerror', error => {
        console.log(`[Page Error] ${error.message}`);
    });

    try {
        console.log("Navigating to dashboard...");
        await page.goto('http://localhost:9002/dashboard', { waitUntil: 'domcontentloaded' });

        console.log("Opening Widget Forge...");
        await page.click('button:has-text("Forjar Widget")');
        
        console.log("Waiting for modal...");
        await page.waitForSelector('text=La Fragua de Interfaces');
        
        console.log("Typing prompt...");
        await page.fill('textarea', 'Panel de Monitorización Energética con medidor radial de resonancia cuántica y gráfica de barras de consumo');

        console.log("Clicking Forjar...");
        await page.click('button:has-text("Forjar")');

        console.log("Waiting for Phase 1...");
        await page.waitForSelector('text=Generar 3 Variaciones');
        
        console.log("Clicking Generar 3 Variaciones...");
        await page.click('button:has-text("Generar 3 Variaciones")');
        
        console.log("Waiting for Phase 2...");
        // Wait for the variations container / images to appear
        await page.waitForSelector('img');
        
        console.log("Clicking the first variation...");
        await page.click('button:has(img)');

        console.log("Waiting to see if it crashes...");
        await page.waitForTimeout(3000);
        
        console.log("Flow completed without immediate crash log.");
    } catch (e) {
        console.log(`[Puppeteer Script Error]`, e);
    } finally {
        await browser.close();
    }
})();
