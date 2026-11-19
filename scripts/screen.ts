// bun run screen <slug> <clip> [--corners "x,y x,y x,y x,y"]
//
// Finds the screen in an unpacked clip (spec.md §6.7), so <ScreenInsert> can play the ad on it: py/screen.py writes
// src/ads/<slug>/<clip>.screen.json, the mattes and despilled plates in gen/footage/<clip>/, and screen-sheet.jpg to
// check. A green screen is found by itself; give --corners for one that isn't green.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { PYTHON } from "./lib/footage.ts";

if (!existsSync(PYTHON)) {
  console.error("No .venv yet. Make it and run: pip install -r py/requirements.txt");
  process.exit(1);
}
const { status } = spawnSync(PYTHON, ["py/screen.py", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(status ?? 1);
