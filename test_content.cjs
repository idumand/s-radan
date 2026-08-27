const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  const html = await page.content();
  console.log(html.substring(0, 1000));
  const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML);
  console.log("ROOT HTML LENGTH:", rootHtml.length);
  await browser.close();
})();
