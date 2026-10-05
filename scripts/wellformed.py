"""Check that every demo page is well-formed HTML.

    python3 scripts/wellformed.py

The checker in check.mjs reads the source with regular expressions, which is
fine for the rules it enforces but says nothing about whether the markup nests
correctly. This closes that gap with the standard library, so neither script
needs a dependency.
"""

from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
ROOT = Path(__file__).resolve().parents[1]


class Nesting(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[tuple[str, tuple[int, int]]] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"stray </{tag}> at line {self.getpos()[0]}")
            return
        open_tag, pos = self.stack.pop()
        if open_tag != tag:
            self.errors.append(
                f"</{tag}> at line {self.getpos()[0]} closes <{open_tag}> "
                f"opened at line {pos[0]}"
            )


def main() -> int:
    pages = sorted(
        p for p in ROOT.rglob("*.html")
        if not any(part.startswith(".") or part == "node_modules" for part in p.parts)
    )
    if not pages:
        print("no pages found")
        return 1

    failures = 0
    for page in pages:
        parser = Nesting()
        parser.feed(page.read_text())
        problems = parser.errors + [
            f"<{tag}> opened at line {pos[0]} is never closed" for tag, pos in parser.stack
        ]
        if problems:
            failures += 1
            print(f"FAIL  {page.name}")
            for p in problems[:8]:
                print(f"        {p}")
        else:
            print(f"pass  {page.name}")

    print(f"\n{len(pages) - failures} of {len(pages)} page(s) well-formed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
