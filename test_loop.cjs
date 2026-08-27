const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  for(let i=0; i<3; i++) {
     await new Promise(r => setTimeout(r, 1000));
     const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML);
     console.log(`Tick ${i}, size: ${rootHtml.length}`);
  }
  await browser.close();
})();
