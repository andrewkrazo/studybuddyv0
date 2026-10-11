# Syllabuddy design system: the marked-up notebook

Syllabuddy is for students studying the material from their *own* classes, mostly
high school. The visual language comes from that world: clean paper, ink, notebook
rules and highlighters. The highlighter is the one bold element. It marks course
identity and, most importantly, **the exact source text the Class AI cites**.

Tokens live in [`dist/assets/notebook.css`](../dist/assets/notebook.css). Both apps
load it first. Never hardcode a hex value that exists as a token.

## Principles

1. **Ink on paper.** Backgrounds are `--paper` (page) and `--sheet` (cards, inputs).
   Text is `--ink`, secondary text `--pencil`. No dark themes, gradients or glows.
2. **One action color.** `--pen` blue is for primary buttons, links and focus. A screen
   has at most one filled pen button.
3. **Highlighters mean something.** Each course has one highlighter color (`--course`).
   Use it for that course's tab, cover and highlights, and nothing else. Quoted source
   passages get a highlighter swipe (`.hl`) with the citation beside them.
4. **Structure is information.** Lists are ruled rows (1px `--rule` between rows), not
   stacks of identical cards. Use an index card (sheet + border + `--lift`) only for the
   one primary item in a section, like the next lesson or a dialog.
5. **Sentence case, plain words.** No all-caps eyebrow labels, no letter-spaced kickers,
   no single italic or colored word in a heading, no `·`/`•` meta strings (use separate
   elements or a comma), no `→` appended to buttons. Buttons say what happens:
   "Start lesson", "Publish to library".
6. **Quiet motion.** Only animate in response to a person (open, expand, confirm,
   drag). No ambient glows, floating, shimmer or entrance animations.
7. **Accessible by default.** Text contrast ≥ 4.5:1, touch targets ≥ 44px, visible
   `:focus-visible` (uses `--focus`), respects `prefers-reduced-motion`.

## Type

One family: **Atkinson Hyperlegible Next** (variable, 200–800), from the Braille
Institute. It is designed so I/l/1 and O/0 are never confused, which suits a study app.

| Token | Size | Use |
|---|---|---|
| `--t-3xl` | 41px | Home greeting, one per screen at most |
| `--t-2xl` | 33px | Screen titles |
| `--t-xl` | 26px | Section titles |
| `--t-lg` | 21px | Card titles, exercise prompts |
| `--t-md` | 17px | Body, buttons, inputs |
| `--t-sm` | 15px | Secondary text, list meta |
| `--t-xs` | 13px | Fine print, counts (never below this) |

Weights: 400 body, 600 labels and buttons (`--w-label`), 750 headings (`--w-head`).
Body line-height 1.5, headings 1.15. Lines stay under about 70 characters.

## Color

| Token | Hex | Role |
|---|---|---|
| `--paper` | #FAFBFC | Page |
| `--sheet` | #FFFFFF | Cards, inputs, dialogs |
| `--ink` | #1C2433 | Text |
| `--pencil` | #586174 | Secondary text |
| `--faint` | #7C8596 | Placeholders, tertiary |
| `--rule` / `--rule-strong` | #DCE3EC / #C3CDD9 | Rules, borders |
| `--wash` | #F1F4F8 | Hover rows, progress tracks |
| `--pen` / `--pen-dark` / `--pen-wash` | #2448C8 / #1A3699 / #E8EDFC | Action |
| Highlighters | yellow #FFE45C, mint #7BE0B5, pink #FF9EC7, sky #8CCBFF, orange #FFB35C, lilac #C7B5FF | Course identity, marked text |
| Status | ok #1D7A4B, warn #8F5300, err #B8301D (+ `-wash` fills) | Feedback |

Highlighters are always *behind* ink text, never text colors themselves.

Demo course colors: Computer Science `c-sky`, Biology `c-mint`, History `c-orange`,
Economics `c-yellow`. Other courses cycle pink, lilac, then repeat.

## Components (recipes)

- **Primary button:** `--pen` fill, white text, `--w-label`, `--r-control`, min-height 44px,
  padding 0 20px. Hover `--pen-dark`. Disabled: `--wash` fill, `--faint` text.
- **Secondary button:** `--sheet` fill, 1px `--rule-strong` border, `--ink` text. Hover `--wash`.
- **Text button / link:** `--pen` text, no fill, underline on hover.
- **Index card:** `--sheet`, 1px `--rule`, `--r-card`, `--lift`, padding 20px. Optional
  course tab: a 6px `--course` bar on the left edge, or a small `--course` tab on top.
- **Ruled list:** rows on `--paper` or inside a card, separated by 1px `--rule`, 12–16px
  vertical padding, hover `--wash`. Meta on its own line in `--pencil` `--t-sm`.
- **Chip / tag:** `--r-pill`, `--t-xs`/`--t-sm`, `--w-label`; neutral = `--wash` + `--pencil`;
  course = `--course` fill + `--ink`; status = status wash + status text.
- **Input:** `--sheet`, 1px `--rule-strong`, `--r-control`, min-height 44px; focus border `--pen`
  plus `--focus`; error border `--err` with message below in `--err`.
- **Progress bar:** 8px track `--wash`, fill `--course` (or `--pen` when no course), radius pill.
- **Course cover (no image):** a `--course` field with the course code in `--w-head` ink.
  Uploaded cover images show as-is.
- **Citation:** quoted passage with `.hl` in the course color, then the source on its own
  line in `--pencil` `--t-sm` (e.g. "Unit3_Slides.pptx, slide 12").
- **Dialog / sheet:** `--sheet`, `--r-card`, `--lift`, backdrop `rgba(28,36,51,.45)`.

## Student vs teacher

Same tokens, type and components. The student app is a single mobile-first column
with a bottom tab bar and uses course highlighters freely. On screens at least
720×640 it sits inside a dark device frame (`dist/assets/student/device-frame.css`,
the only place dark colors are used); on phones it fills the screen. Inside the
frame the screen scrolls, so view changes call `scrollTop0()` instead of
`window.scrollTo`. The teacher portal is a desktop work surface: white sheets on
paper, a quiet sidebar, highlighters only on course chips and previews, and the pen
button reserved for "Publish to library".
