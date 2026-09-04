const { chromium } = require('playwright');

(async () => {
  const userDataDir = '/tmp/chrome-persistent-debug2-' + Date.now();
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio'
    ]
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));

  // Log network requests for auth
  page.on('response', async response => {
    if (response.url().includes('/api/auth') || response.url().includes('/login') || response.url().includes('/session')) {
      console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
      try {
        const text = await response.text();
        console.log('[RESPONSE BODY]', text.substring(0, 200));
      } catch (e) {
        console.log('[RESPONSE BODY] could not read as text');
      }
    }
  });

  console.log('Navigating to root...');
  await page.goto('http://localhost:9002', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('Current URL:', page.url());
  console.log('Page title:', await page.title());

  // Look for login or sign in links/buttons
  const loginLinks = await page.$$('a:has-text("Entrar"), a:has-text("Iniciar Sesión"), a:has-text("Sign In"), button:has-text("Entrar"), button:has-text("Iniciar Sesión"), button:has-text("Sign In")');
  console.log('Found login links/buttons:', loginLinks.length);
  for (let i = 0; i < loginLinks.length; i++) {
    const txt = await loginLinks[i].textContent();
    console.log(`  Link/Button ${i}:`, txt.trim());
  }

  // If we find a login link, click it
  if (loginLinks.length > 0) {
    console.log('Clicking the first login link/button...');
    await loginLinks[0].click();
    await page.waitForTimeout(3000);
    console.log('After click, URL:', page.url());
  }

  // Now check if we have a form for email and password
  await page.waitForTimeout(2000);
  const emailInputs = await page.$$('input[type="email"], input[name="email"]');
  const passwordInputs = await page.$$('input[type="password"], input[name="password"]');
  console.log('Email inputs found:', emailInputs.length);
  console.log('Password inputs found:', passwordInputs.length);

  if (emailInputs.length > 0 && passwordInputs.length > 0) {
    console.log('Found login form, filling in credentials...');
    await emailInputs[0].fill('prueba-hermes@star.seed');
    await passwordInputs[0].fill('PruebaHermes2026!');
    // Look for submit button
    const submitButtons = await page.$$('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar Sesión"), button:has-text("Sign In")');
    console.log('Submit buttons found:', submitButtons.length);
    if (submitButtons.length > 0) {
      await submitButtons[0].click({ force: true });
      console.log('Clicked submit button');
      await page.waitForTimeout(5000);
      console.log('After submit, URL:', page.url());
    } else {
      console.log('No submit button found');
    }
  } else {
    console.log('Did not find email/password inputs. Looking for any form...');
    const forms = await page.$$('form');
    console.log('Forms found:', forms.length);
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      const inputs = await form.$$('input');
      console.log(`Form ${i} has ${inputs.length} inputs`);
      for (let j = 0; j < inputs.length; j++) {
        const type = await inputs[j].getAttribute('type');
        const name = await inputs[j].getAttribute('name');
        const placeholder = await inputs[j].getAttribute('placeholder');
        console.log(`  Input ${j}: type=${type}, name=${name}, placeholder=${placeholder}`);
      }
    }
  }

  // Take a screenshot
  await page.screenshot({ path: '/tmp/debug-login2.png' });
  console.log('Screenshot saved to /tmp/debug-login2.png');

  await browser.close();
})();
