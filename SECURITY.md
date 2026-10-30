# Security policy

BPMN files are often made by someone other than the person viewing them — a
colleague, a customer, a system that exports them. The package is built so
that a file can never become active content in the viewer's page.

## What is guaranteed

- **No markup from text.** Every name, annotation and attribute value is
  escaped by the one SVG builder that produces the output; the HTML of DMN
  decision tables escapes every cell the same way.
- **No external content.** A document type declaration is refused, so there
  are no external entities and no entity expansion. Only the five predefined
  entities and character references are decoded. Nothing in the file is
  fetched or evaluated.
- **Colours are filtered.** A colour stored in the file is used only when it
  is a hex value, a colour name or an `rgb()`/`hsl()` of numbers; anything
  that could load a resource or add a style rule is dropped.
- **Bounded work.** Files are limited to 20 million characters, 200 000
  elements and 256 levels of nesting (adjustable downwards with `limits`).

The SVG returned by `render` and `renderDmn` and the HTML returned by
`renderDecision` are therefore safe to insert with `innerHTML`
without a sanitiser.

## Supported versions

The latest minor version of the current major receives security fixes.

## Reporting a vulnerability

Please report privately through GitHub's
[security advisories](https://github.com/dskripchenko/bpmn/security/advisories/new)
rather than a public issue. Include a file that reproduces the problem. You
will get an answer within a few days.
