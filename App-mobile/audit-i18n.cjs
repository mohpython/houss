const fs = require("fs");
const path = require("path");

const ACC = /[\u00C0-\u024F]/;
const hits = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith(".dart")) continue;
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
    lines.forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith("//") || t.startsWith("*")) return;
      if (t.startsWith("import ")) return;
      // litteraux '...' contenant une lettre accentuee
      const m = l.match(/'([^']*[A-Za-z]?[\u00C0-\u024F][^']*)'/);
      if (!m) return;
      const v = m[1];
      if (v.startsWith("package:") || v.startsWith("assets/") || v.includes("/")) return;
      hits.push({ file: p.replace(/\\/g, "/"), line: i + 1, text: v });
    });
  }
}

walk("lib");

const byFile = {};
for (const h of hits) (byFile[h.file] ||= []).push(h);
const files = Object.keys(byFile).sort();
for (const f of files) {
  console.log("### " + f + " (" + byFile[f].length + ")");
  for (const h of byFile[f]) console.log("  " + h.line + ": " + h.text.slice(0, 90));
}
console.log("TOTAL " + hits.length + " lignes / " + files.length + " fichiers");
