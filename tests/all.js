/* Runs every suite in turn and prints one table at the end.  Suites that need a browser are run
   one at a time so the machine is not swamped; the node-only ones go first because they are quick.
   export NODE_PATH=/opt/node22/lib/node_modules && node tests/all.js  [pattern]              */
const { spawnSync, execSync } = require("child_process");
const fs = require("fs"), path = require("path");

const DIR = __dirname;
const SKIP = { "lib.js": 1, "all.js": 1, "make-fixtures.py": 1 };
const files = fs.readdirSync(DIR).filter((f) => /\.js$/.test(f) && !SKIP[f]).sort();
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const suites = files.filter((f) => !only || only.test(f));

/* the fixtures are generated, not committed: make them once if they are missing */
const fixDir = path.join(DIR, "fixtures");
if (!fs.existsSync(fixDir) || !fs.readdirSync(fixDir).length){
  console.log("making fixtures…");
  try { execSync("python3 " + JSON.stringify(path.join(DIR, "make-fixtures.py")), { stdio: "inherit" }); }
  catch (e){ console.log("could not make fixtures: " + e.message); }
}

const rows = [];
let failed = 0;
for (const f of suites){
  process.stdout.write("\n── " + f + " " + "─".repeat(Math.max(0, 60 - f.length)) + "\n");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { stdio: ["ignore", "pipe", "pipe"], env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + "" + (r.stderr || "");
  const tail = out.split("\n").filter((l) => /checks passed|FAIL |Failures:|^ - /.test(l));
  console.log(tail.slice(-12).join("\n") || out.split("\n").slice(-6).join("\n"));
  const m = /(\d+)\/(\d+) checks passed/.exec(out);
  const ok = r.status === 0;
  if (!ok) failed++;
  rows.push({ suite: f, ok, passed: m ? +m[1] : null, total: m ? +m[2] : null, secs: Math.round((Date.now() - t0) / 100) / 10 });
}

const w = Math.max.apply(null, rows.map((r) => r.suite.length).concat([5]));
console.log("\n" + "=".repeat(w + 26));
let sum = 0, all = 0;
rows.forEach((r) => {
  if (r.total){ sum += r.passed; all += r.total; }
  console.log((r.ok ? "  ok   " : "  FAIL ") + r.suite + " ".repeat(w - r.suite.length) +
              (r.total ? "  " + r.passed + "/" + r.total : "  (no count)") + "   " + r.secs + "s");
});
console.log("=".repeat(w + 26));
console.log(rows.length + " suites, " + (rows.length - failed) + " green, " + sum + "/" + all + " checks");
process.exit(failed ? 1 : 0);
