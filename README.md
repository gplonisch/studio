# Plonisch Studio

The studio site, three demonstration builds, and the checks that gate all of them.

[![CI](https://github.com/gplonisch/studio/actions/workflows/ci.yml/badge.svg)](https://github.com/gplonisch/studio/actions/workflows/ci.yml)
![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-green)

**[The site](https://gplonisch.github.io/studio/)**

## What is here

```
index.html          the studio: positioning, work, enquiry
process.html        how a build runs, and the care plans
case/               one case study per build
work/bellwether/    restaurant demo, committed dark, amber on olive
work/hartline/      electrician demo, dual mode, teal on slate
tokens/             the studio's own palette, rust on paper
css/                base and components, shared by every site here
js/site.js          navigation disclosure and form validation, shared
scripts/            the checker and the markup validator
```

Tollgate Cycles, the third build, lives in
[static-studio](https://github.com/gplonisch/static-studio) because it is the kit's
reference demo. Its case study is here and links out to it.

## Three palettes on purpose

Every build uses the same `css/base.css` and `css/components.css` and brings its
own `tokens.css`. That is the actual client workflow: the kit does not change,
the palette does.

| Build | Scheme | Shape | Why |
|---|---|---|---|
| Tollgate | Cobalt on cream, dual mode | Pill | Not the beige-and-brass every craft brief attracts |
| Bellwether | Amber on olive, **committed dark** | Pill | A dining room is dim; the site should not flip to white at breakfast |
| Hartline | Teal on slate, dual mode | **Square** | Trades should look solid, and somebody finding an electrician at midnight gets whatever their phone is set to |

## The checks

```bash
node scripts/check.mjs        # 221 checks across 11 pages and 3 token files
python3 scripts/wellformed.py # markup nesting
```

Both run in CI and gate the deploy. The checker computes contrast from every
`tokens.css` in the tree against WCAG 2.1 AA, per colour scheme, and fails on a
missing alt attribute, an unlabelled control, a skipped heading level, disabled
zoom, a missing skip link, a form that collects personal data without linking a
privacy notice, an em-dash in visible copy, an over-long call-to-action, or an
eyebrow label rate above one per three sections.

It grew two features while this site was built, both because it was quietly not
checking things:

- It only ever read one `tokens.css`, so the two new demo palettes were going
  unverified. It now finds every token file in the tree.
- Its page discovery was hard-coded to a `demo/` folder, so in this repository it
  found nothing at all and exited without checking a single page. It now walks
  the tree.

Both fixes belong upstream in static-studio too.

## Honesty notes

The three builds are self-directed, not client work, and every page says so.
There are no testimonials anywhere, because inventing them violates the FTC's
2024 rule on fake reviews and because a testimonial slot in a new portfolio is
an invitation to fill it dishonestly.

Credentials on the electrician demo are visible `[PLACEHOLDERS]` rather than
plausible-looking scheme numbers, since inventing those claims qualifications
that do not exist. The same applies to prices, the availability note, and every
bracketed value in the legal pages.

## Before this goes to a real client

Fill in every `[BRACKETED]` value: the business name, postal address, contact
email, care plan amounts and change allowances, retention periods, and
jurisdiction. Then wire the enquiry form to a real handler and name it in the
privacy notice.

The legal pages are adapted boilerplate, not legal advice. Have a lawyer read
the care plan terms in particular, since they cover domain ownership and
cancellation.

## License

MIT for the code. The case study text is mine.
