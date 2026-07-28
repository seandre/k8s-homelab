# Women’s Road Calendar — Checkpoint 3 Evidence

Checkpoint 3 is the final local approval gate for the Women’s Road Calendar.
Production build, container creation, image publication, DNS, and Kubernetes
deployment remain prohibited until the owner approves this evidence and the
live responsive review.

Evidence date: 2026-07-27.

## Automated evidence

| Area | Check | Result |
|---|---|---|
| Dataset | 196 race records validated against the maintained contract | Pass |
| Type safety | TypeScript project check | Pass |
| Source quality | ESLint 10 with React and TypeScript rules | Pass |
| Unit and interaction tests | 23 tests across four files | Pass |
| Accessibility semantics | Axe scan with color contrast handled separately | Pass; zero detected violations |
| Palette contrast | Core small-text paper, ink, muted, accent, and dark-panel combinations | Pass; WCAG AA ratio at least 4.5:1 |
| Touch | Interactive select, link, filter action, footer, spotlight, and race controls | Pass; minimum target height 44px or larger |
| Keyboard | Native controls, race expansion, visible focus, skip link | Pass |
| Reduced motion | Smooth scrolling and transitions disabled under `prefers-reduced-motion` | Pass |
| Long content | Long race-name wrapping and detail metadata wrapping | Pass |
| Missing links | UCI calendar fallback when organizer and PCS links are absent | Pass |
| Overlapping events | All active events or all events sharing the earliest next date | Pass |
| Schedule edge cases | Cancelled, postponed, rescheduled, and date-TBC records | Pass |
| Responsive source guards | Desktop/tablet breakpoints, mobile stacked rows, horizontal overflow prevention | Pass |
| Dependencies | Full npm advisory audit | Pass; zero known advisories |
| Documentation | VitePress link and page build | Pass at Checkpoint 2; no link paths changed by polish |

The automated accessibility test disables Axe’s color-contrast rule because
JSDOM has no rendered color model. A separate deterministic WCAG luminance test
covers the core palette instead.

## Live viewport review

Use the hot-reload preview at `http://127.0.0.1:5174`.

Review these viewport baselines:

| Baseline | Viewport | Expected layout |
|---|---:|---|
| Desktop | `1440 × 1000` | Full masthead, three-column spotlight, five-column statistics and sortable race rows |
| Tablet | `834 × 1112` | Compact editorial grid, two-row filters, preserved five-column race layout |
| Mobile | `390 × 844` | Stacked spotlight, two-column filters and labelled race records with no horizontal page scrolling |

At each size verify:

1. the masthead remains legible and intentional;
2. search and every select control fit without clipping;
3. active and changed schedule labels do not cover race names;
4. the longest visible names wrap without widening the page;
5. one expanded row fits the viewport and its links wrap cleanly;
6. keyboard focus is visible;
7. the page has no horizontal scrollbar.

Automated browser image capture is unavailable in the current execution
environment. The owner’s live desktop, tablet, and mobile review is therefore
the visual approval record for this checkpoint. No generated or simulated
image is accepted as a substitute for the running application.

## Owner decision

Status: **Approved by the owner on 27 July 2026.**

Approval authorizes only the next ordered steps:

1. build the production application;
2. serve and verify that exact output locally;
3. build and scan the unprivileged container;
4. add the reviewed GitOps resources and workflow;
5. merge or push only after the approved revision and deployment prerequisites
   are confirmed.
