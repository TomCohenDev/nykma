// node shoot.mjs editor[:theme] home ... -> shots/<name>[-theme].png at 1440x900
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
mkdirSync("shots", { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
for (const arg of process.argv.slice(2)) {
  const [name, theme] = arg.split(":");
  await p.goto(pathToFileURL(`${name}.html`).href + (theme ? `?theme=${theme}` : ""));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  await p.screenshot({ path: `shots/${name}${theme ? "-" + theme : ""}.png` });
  console.log("shot", name, theme ?? "");
}
await b.close();
