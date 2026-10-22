import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/viabilidade/e2e',fullyParallel:false,workers:1,timeout:45000,
  outputDir:'output/playwright/results',reporter:[['list'],['html',{outputFolder:'output/playwright/report',open:'never'}]],
  use:{baseURL:'http://127.0.0.1:3031',viewport:{width:1365,height:1000},
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'},
    screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node scripts/dev-viabilidade.mjs --port 3031',url:'http://127.0.0.1:3031',
    reuseExistingServer:!process.env.CI,timeout:120000}
});
