# KnackLabs Design System

> The visual + content language of **KnackLabs** (Chimps At Work Studios) — an AI Transformation Company that builds AI Automation Platforms and AI Agents, with Forward Deployed Engineers who embed and ship on infrastructure the client controls. Tagline: *AI transformation, delivered from inside your business.* Punchier hero: *We don't advise on AI. We ship it.*

**Sources:** `cawstudios/knacklabs-atlas` (GitHub, private) — `Sales and Marketing/Brand Book/` (files 00–12, reproduced under `guidelines/brand-book/`), the consolidated `KnackLabs — Brand Guidelines v1.0.md`, the logo PNGs, and the production sales-deck HTML (`guidelines/reference-artifacts/KnackLabs - Gantry deck.html`) — the working CSS this system's tokens are lifted from.

**Surfaces this brand covers:** marketing website (knacklabs.ai), sales decks / offering docs, LinkedIn & social, proposals. Product UI inverts to a light theme (see Visual Foundations). The brand's three audiences: Enterprise Transformation Sponsor, Mid-Market Owner-Operator, Technical Evaluator.

---

## CONTENT FUNDAMENTALS

**The voice: authoritative, value-focused, direct, precise, grounded.** The team that *ships*. Signature posture: *"We don't advise on AI — we embed our engineers and ship it."*

- **HBR, not TechCrunch.** Argument-driven, specific thesis up front, evidence behind it, no hype. Test before publishing: *would a COO who reads HBR take this seriously?*
- **The capability rule (non-negotiable):** never lead with cost reduction or headcount. Lead with the capability AI unlocks.
- **Specific, not vague.** Name the system, the industry, the real number. Past tense over future promises: "We built a mine-operations platform that runs production, fleet, fuel, and compliance on one screen."
- **Casing:** sentence case everywhere. ALL-CAPS only for short mono eyebrow labels (with letter-spacing). No title-case headlines.
- **Person:** "we" for KnackLabs, "you/your" for the client. First-person and opinionated on LinkedIn; plain and functional in product UI.
- **No emoji.** Anywhere. Ever.
- **CTAs:** exactly two — primary **"Talk to us"**, secondary **"See how we build."** Never "Learn more", "Get started", "Request a demo".
- **Words used:** build, ship, deploy, run, embed, operate, own · platform, agent, system, production-grade, secured, auditable · capability, scale, speed, visibility, control · Forward Deployed Engineer, your cloud, your models.
- **Words banned:** replace, eliminate, cut headcount · revolutionary, cutting-edge, game-changing, disruptive · leverage, synergy · AI-powered, magic, "thrilled to announce" · the internal acronym "COP" (say "AI Automation Platform").
- **Headline formulas:** capability claim ("Do the impossible thing — at scale"), problem → us, proof-led ("We built X that did Y. Here's how."). One accent phrase per headline, max.

## VISUAL FOUNDATIONS

**The posture:** technically credible, precise, allergic to hype. **Premium and dark on marketing surfaces; clean and light in product UI.**

- **Color:** six colors total. Deep Forest `#0C3529` (on-dark anchor), Emerald `#1C6B49` (on-light accent), Mint `#6AF1B0` (highlight on dark ONLY), White, Off-White `#F4F7F6`, Slate `#5F706A`. **The one rule: Mint never carries text or thin elements on light — it's illegible there.** Approved pairs: White on Deep Forest, Mint accents on Deep Forest, Emerald accents on White/Off-White, Deep Forest on Mint, White on Emerald.
- **Dark surfaces** use the radial hero gradient (`--gradient-hero`: #114635 → #0C3529 → #0A2C22) plus the **agent-mesh texture** (`assets/backgrounds/mesh-*.png`) — a low-opacity network of nodes and lines, mint-stroked on dark, emerald-stroked on light. This is the only background decoration the brand uses.
- **Type:** Inter everywhere (300–800). Display 48–60px/800/-0.03em; H1 32–40px/700; H2 24–28px/600; body 16–18px/400/1.55. JetBrains Mono is **restricted**: terminal mockups, isometric diagram labels, and mono eyebrows/footers inside brand artifacts. Eyebrows: mono, uppercase, 13–15px, tracking 0.22–0.26em, Emerald on light / Mint on dark.
- **Hierarchy comes from hairlines, not shadows.** 1px `#D9E1DD` lines on light; `rgba(106,241,176,.18)` on dark. Shadows only on floating brand frames (`--shadow-float`).
- **Cards on light:** white, 1px `rgba(12,53,41,.10)` border, radius 10px, very soft shadow. Proof cards may use a 3px Emerald left border (production deck pattern). **Cards on dark:** `rgba(255,255,255,.06)` fill, 1px `rgba(106,241,176,.25)` border, radius 10px.
- **Radii:** 6 / 10 / 14px. Pills for badges only.
- **Buttons:** primary = Emerald bg + white text; secondary = white bg + Emerald border/text. On dark: Mint bg + Deep Forest text (high-emphasis), or white-outline ghost. Never yellow, never gradients on buttons.
- **Hover:** darken slightly (Emerald → Deep Forest direction), or lift border to Emerald/Mint. Press: scale .98 or darker still. Transitions ~0.2s ease. No bounces; motion is calm — fades and small translates (the deck slides at .5s cubic-bezier(.4,0,.2,1)).
- **Whitespace:** generous — "dense = desperate." One idea per section. Max measure ~75ch. Container ~1180px.
- **Imagery:** two systems only (Brand Book 08). **Terminal Mockup** (shows *what we built*): Deep Forest card, three Emerald dots, mono URL, Mint status badge, Mint data bars, Emerald-tinted metric boxes with Mint numbers + Slate labels — required on every case study. **Isometric Technical Illustration** (shows *how it works*): cubes/cylinders on light, Deep Forest outlines, Emerald fills, Mint highlights, dashed connectors, JetBrains Mono labels with real metrics — **componentized in `components/isometric/`** (compose on an IsoCanvas; don't hand-draw). Never blend the two. Photography: real teams working, real dashboards. Avoid: generic stock, glowing brains, robot hands, neural swirls.
- **Product/application UI inverts:** Off-White canvas, white cards, Deep Forest headings, body `#2A3B35`, captions `#94A3A8`, Emerald links/CTAs/labels, and a Deep Forest top nav (the one dark element, where Mint accents are allowed).

## ICONOGRAPHY

The brand book defines **no icon set** — the production artifacts use *zero icons*. Structure is carried by mono eyebrows, numbered circles (34px, Emerald bg/white text on light; Mint bg/Deep Forest text on dark), tick dots (12px circles), and `→` arrows between flow steps. **Default to no icons.** If a UI genuinely needs them (product UI), use **Lucide** at stroke 1.5, 16–18px, colored to match surrounding text — consistent with CAW's production apps — and flag it as an extension. No emoji, no icon fonts, no decorative SVG art.

**Logos** (`assets/logos/`, PNG; SVG masters on request — never redraw): Full Dark/White (default, light/dark bg), Short Dark/White (compact), Avatars on Deep-Forest/White/Mint/Black circles (Black = third-party fallback only, never on KnackLabs material). Clear space = height of the "K"; min 120px (Full) / 32px (Short) digital. Never stretch, recolor, add effects, or place on busy backgrounds.

---

## Index

| Path | What's there |
|---|---|
| `styles.css` | Global CSS entry — `@import`s every token + font file |
| `tokens/` | `colors.css`, `typography.css`, `spacing.css`, `fonts.css` |
| `assets/logos/` | The 8 logo PNG variants |
| `assets/backgrounds/` | Agent-mesh textures (light + dark) — static render of the hero orchestration mesh |
| `components/core/` | Button, Eyebrow, Badge, Card, Input |
| `components/forms/` | Field, TextField, Select, Checkbox, Radio, Switch — website form controls (Emerald focus rings, hairline borders; error color `--kl-error` is a flagged extension) |
| `components/brand/` | TerminalMockup, MetricBox, NumberedPoints, FlowSteps, EventAnnouncementBar |
| `components/isometric/` | System-2 isometric library: IsoService, IsoAgent, IsoModel, IsoDatabase, IsoWarehouse, IsoAppScreen, IsoShards, IsoQueue, IsoDocs, IsoCloud, IsoRings, IsoUser + glue (IsoCanvas/IsoAt, IsoConnector, IsoLabel, IsoDiamond). Rules: **max 5 components per diagram; generic names (never vendor names) unless asked; omit obvious plumbing; connectors anchor to shape edges** |
| `components/partners/` | PartnerBadge, PartnerStrip — placement frames for the OpenAI Partner Network (Select tier) and Sarvam Circle badges. **The artwork is never drawn by this system**; the components supply locked aspect, minimum size and guideline clear space around the official file. Rules: `guidelines/Partner Badge Usage.md` |
| `components/navigation/` | TopNav, Footer, SiteHeader |
| `ui_kits/presentation/` | Slide-deck kit — reusable slide-layout **templates** in `Slide Layouts - Dark.dc.html` (deep-forest surfaces) and `Slide Layouts - Light.dc.html` (Off-White surfaces), plus an authoring guide (`README.md`). Brand rules for decks live in **Brand Book 13 · Presentation Guidelines**; surfaced in the Design System tab under **Presentation**. |
| `ui_kits/social/` | LinkedIn post/cover kit (`LinkedIn Kit.dc.html`) and `Email Signature.dc.html`, with `kl-logo-data.js` (inline logo data) |
| `Hero.dc.html`, `Canvas.dc.html`, `Form Controls.dc.html` (root) | Standalone showcase Design Components — a marketing hero, an isometric-diagram canvas, and the assembled form controls |
| `cards/Employee ID Cards.dc.html` | Branded employee ID-card template (`cards/id-card-assets/`) |
| `guidelines/brand-book/` | The full 14-file brand book (canonical source) — incl. **13 · Presentation Guidelines** (deck brand rules + the slide kit) |
| `guidelines/Partner Badge Usage.md` | OpenAI Partner Network + Sarvam Circle badge rules — our standing, geometry, clear space, do/don'ts, placement per surface, attribution |
| `guidelines/reference-artifacts/` | Production Gantry sales deck (working CSS reference) |
| `cards/` | Foundation specimen cards (Design System tab) — colors, type, spacing, brand logos + avatars |
| `SKILL.md` | Agent skill prompt for designing with this system |

**Open questions / discrepancies:** body ink is `#28332E` in production decks vs `#2A3B35` in the brand book's UI table — both are tokenized (`--kl-ink`, `--kl-ink-ui`). SVG logo masters are "available on request" — only PNGs are bundled here.
