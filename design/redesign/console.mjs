import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const b = await chromium.launch(); const p = await b.newPage();
p.on("console", m => console.log(m.type(), m.text())); p.on("pageerror", e => console.log("ERR", e.message));
for (const n of process.argv.slice(2)) { await p.goto(pathToFileURL(`${n}.html`).href); await p.waitForTimeout(300); }
await b.close();
