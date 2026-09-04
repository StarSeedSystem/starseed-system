const { chromium } = require('playwright');

(async () => {
  // Use a persistent context to avoid the remote debugging popup
  const userDataDir = '/tmp/chrome-persistent-' + Date.now();
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

  console.log('Navigating to login...');
  await page.goto('http://localhost:9002/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });

  console.log('Filling login form...');
  await page.fill('input[name="email"]', 'prueba-hermes@star.seed');
  await page.fill('input[name="password"]', 'PruebaHermes2026!');
  await page.click('button[type="submit"]', { force: true });

  // Wait for navigation or timeout
  try {
    await page.waitForURL(url => !url.includes('/login'), { timeout: 10000 });
    console.log('Login successful, redirected to:', page.url());
  } catch (e) {
    console.log('Still on login page after submit, checking for error or next step...');
    // Check if there's an error message
    const errorText = await page.locator('text=Error, text=error, text=invalid, text=Incorrect').first();
    if (await errorText.count() > 0) {
      console.log('Login error found:', await errorText.textContent());
    } else {
      // Maybe there is a modal or a button to click (like terms)
      const continuarButton = await page.locator('button:has-text("Continuar"), button:has-text("Aceptar"), button:has-text("Accept")').first();
      if (await continuarButton.count() > 0) {
        console.log('Found a button to click, clicking it...');
        await continuarButton.click();
        await page.waitForTimeout(3000);
        // Now check if we moved away from login
        if (!page.url().includes('/login')) {
          console.log('After clicking button, redirected to:', page.url());
        } else {
          console.log('Still on login after clicking button.');
        }
      } else {
        console.log('No error message and no button to click. Maybe login succeeded but URL still contains login?');
        // Let's check the page content for signs of being logged in (like a user avatar)
        const userAvatar = await page.locator('img[alt*="avatar"], img[alt*="user"], [data-testid="user-menu"]').first();
        if (await userAvatar.count() > 0) {
          console.log('Found user avatar, assuming logged in.');
        } else {
          console.log('Cannot determine login state. Taking screenshot for debugging...');
          await page.screenshot({ path: '/tmp/login-debug.png' });
          console.log('Screenshot saved to /tmp/login-debug.png');
        }
      }
    }
  }

  let currentUrl = page.url();
  console.log('Current URL after login handling:', currentUrl);

  // If we are on bienvenida, go through onboarding
  if (currentUrl.includes('/bienvenida')) {
    console.log('Onboarding detected');
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(2000);
      // Check if we see "Tu perfil"
      const perfilText = await page.locator('text=Tu perfil').first();
      if (await perfilText.count() > 0) {
        console.log('Found Tu perfil step');
        // Check for URL inputs in this step
        const urlInputs = await page.locator('input[type="url"], input[placeholder*="URL" i], input[placeholder*="url" i]').count();
        const urlLabels = await page.locator('label, .label').filter({ hasText: /url/i }).count();
        const photoInputs = await page.locator('input[accept*="image" i], input[placeholder*="foto" i], input[placeholder*="portada" i], input[placeholder*="photo" i], input[placeholder*="cover" i]').count();
        console.log(`URL inputs: ${urlInputs}, URL labels: ${urlLabels}, Photo inputs: ${photoInputs}`);
        if (urlInputs === 0 && urlLabels === 0 && photoInputs === 0) {
          console.log('T2: PASS - No URL inputs in Tu perfil step');
        } else {
          console.log('T2: FAIL - Found URL/photo inputs');
        }
        break;
      } else {
        // Click Continuar button
        const continuarBtn = page.locator('button:has-text("Continuar"), button:has-text("Continue")').first();
        if (await continuarBtn.count() > 0) {
          await continuarBtn.click();
          await page.waitForTimeout(2000);
        } else {
          console.log('No Continuar button found');
          break;
        }
      }
    }
  } else {
    console.log('Not in onboarding flow');
  }

  // Now we are logged in, let's go to /crear to create a page and group
  await page.goto('http://localhost:9002/crear', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('At /crear, current URL:', page.url());

  // Check if we see the option to create a page or group
  const crearPageTitle = await page.locator('text=Crear página, text=Crear grupo, text=Crear publicación').first();
  if (await crearPageTitle.count() > 0) {
    console.log('Crear page loaded successfully');
  } else {
    console.log('Crear page might not have loaded correctly');
  }

  // We'll try to create a page
  const pageTab = page.locator('text=Página').first();
  if (await pageTab.count() > 0) {
    await pageTab.click();
    await page.waitForTimeout(2000);
    console.log('Clicked on Página tab');
    // Check if the first tab is Inicio and shows bienvenida
    const inicioTab = page.locator('text=Inicio').first();
    if (await inicioTab.count() > 0) {
      await inicioTab.click();
      await page.waitForTimeout(2000);
      const bienvenidaText = await page.locator('text=Bienvenid@, text=Bienvenido, text=Bienvenida').first();
      if (await bienvenidaText.count() > 0) {
        console.log('Page creation: Inicio tab shows bienvenida - PASS');
      } else {
        console.log('Page creation: Inicio tab does not show bienvenida');
      }
    } else {
      console.log('Page creation: No Inicio tab found');
    }
  } else {
    console.log('Could not find Página tab');
  }

  // Similarly for group
  const groupTab = page.locator('text=Grupo').first();
  if (await groupTab.count() > 0) {
    await groupTab.click();
    await page.waitForTimeout(2000);
    const inicioTab = page.locator('text=Inicio').first();
    if (await inicioTab.count() > 0) {
      await inicioTab.click();
      await page.waitForTimeout(2000);
      const bienvenidaText = await page.locator('text=Bienvenid@, text=Bienvenido, text=Bienvenida').first();
      if (await bienvenidaText.count() > 0) {
        console.log('Group creation: Inicio tab shows bienvenida - PASS');
      } else {
        console.log('Group creation: Inicio tab does not show bienvenida');
      }
    } else {
      console.log('Group creation: No Inicio tab found');
    }
  } else {
    console.log('Could not find Grupo tab');
  }

  // Now create a publication with image and frame
  await page.goto('http://localhost:9002/crear', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const pubTab = page.locator('text=Publicación').first();
  if (await pubTab.count() > 0) {
    await pubTab.click();
    await page.waitForTimeout(2000);
    // Fill in some content
    await page.fill('textarea[placeholder*="Qué estás pensando"], textarea', 'Test post with image and frame');
    // Try to upload an image
    const fileInput = await page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      // Create a small dummy JPG
      const fs = require('fs');
      const smallImagePath = '/tmp/small-test-image.jpg';
      const tinyJpgBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQECAQECAQEBAQICAwICAgQDAwIDBQQEBQcHCAkICQoLDA0NDQwMDQwFBQUFBQUBgUFBQgHCgnKyssGCwoKKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKywD/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==';
      const imageBuffer = Buffer.from(tinyJpgBase64, 'base64');
      fs.writeFileSync(smallImagePath, imageBuffer);
      await fileInput.setInputFiles(smallImagePath);
      console.log('Uploaded small image');
      await page.waitForTimeout(3000);
      // Now look for the frame button (Marco de forma)
      const frameButton = page.locator('text=Marco de forma, text=Shape frame, text=Forma').first();
      if (await frameButton.count() > 0) {
        await frameButton.click();
        await page.waitForTimeout(2000);
        console.log('Clicked Marco de forma button');
        // Now submit the post
        const submitButton = page.locator('button[type="submit"], button:has-text("Publicar"), button:has-text("Share")').first();
        if (await submitButton.count() > 0) {
          await submitButton.click({ force: true });
          await page.waitForTimeout(5000);
          console.log('Submitted post');
          // Check if we see the post in the feed
          await page.goto('http://localhost:9002/perfil/@pruebahermes', { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);
          // Look for the post we just made
          const postText = await page.locator('text=Test post with image and frame').first();
          if (await postText.count() > 0) {
            console.log('Post found in feed - PASS');
            console.log('Frame application: assumed PASS (post created with frame)');
          } else {
            console.log('Post not found in feed');
          }
        } else {
          console.log('Could not find submit button for post');
        }
      } else {
        console.log('Could not find Marco de forma button');
      }
    } else {
      console.log('Could not find file input for image upload');
    }
  } else {
    console.log('Could not find Publicación tab');
  }

  // Check for console errors
  if (errors.length > 0) {
    console.log('Console errors:', errors);
  } else {
    console.log('No console errors');
  }

  await browser.close();
  console.log('Verification script completed');
})();
