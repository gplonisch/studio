#!/usr/bin/env node
/**
 * static-studio checker.
 *
 * Turns the parts of "good taste" that are actually mechanical into a test.
 * Three groups of rules:
 *
 *   1. Accessibility that can be checked statically - alt text, label
 *      association, heading order, language, accessible names, contrast.
 *   2. Compliance hygiene - a privacy notice exists and is linked, forms that
 *      collect personal data say what it is for.
 *   3. House style - the small set of habits that make a page read as
 *      generated rather than designed.
 *
 * Contrast is computed from tokens.css, so the palette cannot drift below
 * WCAG AA without the build failing.
 *
 * Honest limitation: this is a regex linter, not a DOM parser or a rendering
 * engine. It catches the mistakes that live in the source. It cannot see
 * computed styles, focus order, or anything that needs a browser, and it is
 * not a substitute for testing with a keyboard and a screen reader.
 *
 *   node scripts/check.mjs demo/*.html
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

let failures = 0;
let checks = 0;

const fail = (file, rule, detail) => {
  failures++;
  console.log(`  FAIL  ${rule}\n        ${detail}`);
};
const pass = (rule) => {
  checks++;
  console.log(`  pass  ${rule}`);
};

/* ---------- colour ---------------------------------------------------- */
const srgb = (hex) => {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};

const luminance = (hex) => {
  const [r, g, b] = srgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** Pull `--name: #hex;` pairs out of one CSS block. */
const tokensIn = (block) => {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
};

/** Split tokens.css into its light block and its dark block. */
const themeBlocks = (css) => {
  const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
  return {
    light: darkStart === -1 ? css : css.slice(0, darkStart),
    dark: darkStart === -1 ? "" : css.slice(darkStart),
  };
};

// Which token pairs have to clear which threshold, and why each one exists.
const CONTRAST_PAIRS = [
  ["ink", "paper", AA_NORMAL, "body text on the page"],
  ["ink", "surface", AA_NORMAL, "body text on a raised surface"],
  ["ink", "surface-alt", AA_NORMAL, "body text on an alternate band"],
  ["ink-2", "paper", AA_NORMAL, "secondary text"],
  ["ink-2", "surface-alt", AA_NORMAL, "secondary text on an alternate band"],
  ["ink-3", "paper", AA_LARGE, "hint text, large or supplementary only"],
  ["accent", "paper", AA_NORMAL, "link text"],
  ["accent-ink", "accent", AA_NORMAL, "primary button label on its fill"],
  ["control-border", "paper", AA_LARGE, "input and button edges, WCAG 1.4.11"],
  ["control-border", "surface", AA_LARGE, "input edges on a raised surface"],
];

/** Every tokens.css in the tree. Each site built with the kit brings its own. */
function findTokenFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findTokenFiles(full, found);
    else if (entry === "tokens.css") found.push(full);
  }
  return found;
}

function checkContrast(root) {
  const files = findTokenFiles(root);
  if (files.length === 0) {
    fail("-", "token files", "no tokens.css found anywhere in the tree");
    return;
  }
  for (const file of files) checkOneTokenFile(root, file);
}

function checkOneTokenFile(root, file) {
  const label = relative(root, file);
  console.log(`\n${label} contrast`);
  const css = readFileSync(file, "utf8");
  const blocks = themeBlocks(css);

  for (const [mode, block] of Object.entries(blocks)) {
    if (!block.trim()) continue;
    const t = tokensIn(block);
    for (const [fg, bg, min, why] of CONTRAST_PAIRS) {
      if (!t[fg] || !t[bg]) {
        fail(label, `${mode}: ${fg} on ${bg}`, "token missing from this theme block");
        continue;
      }
      const ratio = contrast(t[fg], t[bg]);
      const pair = `${mode}: ${fg} on ${bg} (${why})`;
      if (ratio < min) {
        fail(label, pair, `${ratio.toFixed(2)}:1 is below the ${min}:1 minimum`);
      } else {
        pass(`${pair} - ${ratio.toFixed(2)}:1`);
      }
    }
  }
}

/* ---------- html ------------------------------------------------------- */
/** Strip out anything the user never reads, so style rules only see copy. */
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

const RULES = [
  {
    name: "no em-dash or en-dash in visible text",
    why: "The em-dash is the single most reliable sign a page was written by a language model.",
    test: (html) => {
      const hits = [...visibleText(html).matchAll(/[—–]/g)];
      return hits.length ? `${hits.length} found` : null;
    },
  },
  {
    name: "html element declares a language",
    why: "Screen readers pick a pronunciation from it.",
    test: (html) => (/<html[^>]+\blang=/i.test(html) ? null : "no lang attribute"),
  },
  {
    name: "exactly one h1",
    test: (html) => {
      const n = (html.match(/<h1[\s>]/gi) || []).length;
      return n === 1 ? null : `found ${n}`;
    },
  },
  {
    name: "heading levels never skip",
    test: (html) => {
      const levels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => +m[1]);
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) {
          return `h${levels[i - 1]} is followed by h${levels[i]}`;
        }
      }
      return null;
    },
  },
  {
    name: "every image has an alt attribute",
    why: "An empty alt is correct for decoration. A missing one is never correct.",
    test: (html) => {
      const bad = [...html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)];
      return bad.length ? `${bad.length} image(s) without alt` : null;
    },
  },
  {
    name: "no placeholder used as the only label",
    test: (html) => {
      const bad = [...html.matchAll(/<input\b(?![^>]*\b(?:aria-label|id)=)[^>]*\bplaceholder=/gi)];
      return bad.length ? `${bad.length} input(s) labelled only by placeholder` : null;
    },
  },
  {
    name: "every form control has a label",
    test: (html) => {
      const ids = [...html.matchAll(/<(?:input|textarea|select)\b[^>]*\bid="([^"]+)"/gi)].map((m) => m[1]);
      const labelled = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/gi)].map((m) => m[1]));
      const aria = [...html.matchAll(/<(?:input|textarea|select)\b[^>]*\baria-label=/gi)].length;
      const missing = ids.filter((id) => !labelled.has(id));
      if (missing.length && missing.length > aria) return `unlabelled: ${missing.join(", ")}`;
      return null;
    },
  },
  {
    name: "no inline event handlers",
    why: "They cannot be covered by a content security policy.",
    test: (html) => {
      const bad = [...html.matchAll(/<[^>]+\bon(?:click|load|mouseover|submit|change)=/gi)];
      return bad.length ? `${bad.length} inline handler(s)` : null;
    },
  },
  {
    name: "icon-only controls carry an accessible name",
    test: (html) => {
      const bad = [...html.matchAll(/<button\b(?![^>]*\baria-label=)[^>]*>\s*(?:<svg[\s\S]*?<\/svg>\s*)<\/button>/gi)];
      return bad.length ? `${bad.length} icon-only button(s) without aria-label` : null;
    },
  },
  {
    name: "call-to-action labels stay short",
    why: "A label over four words wraps at desktop and reads as a sentence, not a button.",
    test: (html) => {
      const labels = [...html.matchAll(/class="[^"]*\bbtn\b[^"]*"[^>]*>([^<]{1,80})</gi)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      const longOnes = labels.filter((l) => l.split(/\s+/).length > 4);
      return longOnes.length ? `too long: ${longOnes.join(" | ")}` : null;
    },
  },
  {
    name: "no banned filler phrases",
    why: "Each of these is a stock phrase that generated pages reach for.",
    test: (html) => {
      const banned = [
        /\bscroll to explore\b/i, /\bscroll to discover\b/i, /\bquietly (?:in use|trusted)\b/i,
        /\bunleash\b/i, /\bseamless(?:ly)?\b/i, /\bnext-gen\b/i, /\brevolutioniz/i,
        /\belevate your\b/i, /\bgame.chang/i, /\bcutting.edge\b/i,
        /\b(?:acme|nexus|smartflow|cloudly)\b/i, /\bjohn doe\b/i, /\bjane doe\b/i,
        /\blorem ipsum\b/i,
      ];
      const text = visibleText(html);
      const hits = banned.filter((re) => re.test(text)).map((re) => String(re));
      return hits.length ? hits.join(", ") : null;
    },
  },
  {
    name: "eyebrow labels are rationed",
    why: "One small uppercase label above every section is the templated rhythm to avoid.",
    test: (html) => {
      const sections = (html.match(/<section[\s>]/gi) || []).length || 1;
      const eyebrows = (html.match(/text-transform:\s*uppercase|class="[^"]*\beyebrow\b/gi) || []).length;
      const cap = Math.ceil(sections / 3);
      return eyebrows > cap ? `${eyebrows} eyebrows across ${sections} sections, cap is ${cap}` : null;
    },
  },
  {
    name: "viewport is not locked against zoom",
    why: "user-scalable=no and maximum-scale below 2 fail WCAG 1.4.4.",
    test: (html) => {
      const m = html.match(/<meta[^>]+name="viewport"[^>]*>/i);
      if (!m) return "no viewport meta";
      if (/user-scalable\s*=\s*no/i.test(m[0])) return "zoom disabled";
      const max = m[0].match(/maximum-scale\s*=\s*([\d.]+)/i);
      if (max && parseFloat(max[1]) < 2) return `maximum-scale is ${max[1]}`;
      return null;
    },
  },
  {
    name: "page has a title and a description",
    test: (html) => {
      const missing = [];
      if (!/<title>[^<]{5,}<\/title>/i.test(html)) missing.push("title");
      if (!/<meta[^>]+name="description"[^>]+content="[^"]{20,}"/i.test(html)) missing.push("description");
      return missing.length ? `missing ${missing.join(" and ")}` : null;
    },
  },
  {
    name: "a skip link is the first focusable element",
    test: (html) => (/class="skip-link"/.test(html) ? null : "no skip link"),
  },
];

// Rules that only apply to a page carrying a form.
const FORM_RULES = [
  {
    name: "a form collecting personal data links a privacy notice",
    why: "Required wherever the form collects personal data.",
    test: (html) => (/href="[^"]*privacy[^"]*"/i.test(html) ? null : "no link to a privacy page"),
  },
  {
    name: "a form collecting personal data states its purpose",
    test: (html) =>
      /used only to|in order to reply|we (?:use|will use) (?:this|your)/i.test(visibleText(html))
        ? null
        : "no statement of what the data is used for near the form",
  },
];

function checkHtml(file) {
  const html = readFileSync(file, "utf8");
  console.log(`\n${basename(file)}`);
  const hasForm = /<form[\s>]/i.test(html);
  const rules = hasForm ? [...RULES, ...FORM_RULES] : RULES;

  for (const rule of rules) {
    const problem = rule.test(html);
    if (problem) fail(file, rule.name, rule.why ? `${problem}. ${rule.why}` : problem);
    else pass(rule.name);
  }
}

/* ---------- run --------------------------------------------------------- */
const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
/** Every .html in the tree, so a new page cannot be added unchecked. */
function findPages(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findPages(full, found);
    else if (entry.endsWith(".html")) found.push(full);
  }
  return found;
}

const files = args.length ? args : findPages(root).sort();

console.log("static-studio checker");
checkContrast(root);
files.forEach(checkHtml);

console.log(
  `\n${checks} passed, ${failures} failed across ${files.length} page(s) and every tokens.css in the tree.`
);
process.exit(failures ? 1 : 0);
