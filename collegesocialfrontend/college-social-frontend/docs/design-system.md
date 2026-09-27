# Design system

The frontend's design system is built on Tailwind CSS 3, CSS custom properties, the existing Radix primitives, and Framer Motion. Keep those as the source of truth; avoid introducing a second component or token framework. Implementation lives in `app/globals.css`, `tailwind.config.ts`, and `components/ui/`.

## Foundations

### Typography

- IBM Plex Sans Arabic is the primary font; IBM Plex Sans is the Latin fallback. Preserve the Arabic-first stack and RTL layout.
- Use the fluid `text-fluid-*` scale for new page titles and copy: `xs`, `sm`, `base`, `lg`, `xl`, `2xl`, and `3xl`. Fixed Tailwind text utilities remain supported for established dense UI.
- Keep one page `h1`, section `h2`, and card/subsection `h3`; use `leading-relaxed` for reading text and reserve muted color for supporting copy.

### Spacing and layout

- The underlying spacing rhythm is Tailwind's 4px scale. Use its standard spacing utilities for component internals.
- `px-page-gutter`, `py-page-block`, and `gap-section-gap` are responsive page-level tokens backed by CSS variables. Use `PageContainer` for standard page gutters and widths.
- Width presets: `max-w-reading` (65ch) for forms and prose, `max-w-content` (80rem) for general pages, and wide layouts only for dashboards or dense data surfaces.
- Use `PageGrid` for card collections. Default to one column on phones; add columns at breakpoints instead of constraining mobile widths.

### Color and elevation

- Use semantic classes (`bg-background`, `bg-surface`, `bg-surface-2`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-accent`) rather than raw colors. CSS variables define matching light and dark themes.
- Reserve indigo for primary actions and selected states; amber/gold is a sparing highlight. Use `success`, `warning`, and `danger` tokens for meaning, not decoration.
- Layer surfaces from background to surface to surface-2/3. `shadow-elev-1` through `shadow-elev-4` provide theme-aware elevation; choose the smallest elevation that communicates hierarchy.

### Motion and responsive behavior

- Use `duration-fast/base/slow/slower` and `ease-standard/emphasized/exit` for CSS transitions. Use the shared Framer Motion helpers for animated React content.
- Motion must remain nonessential. Preserve the global reduced-motion override and avoid motion that blocks interaction or content access.
- Breakpoints: `xs` 480px, `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px. Build mobile-first and use logical `start`/`end` positioning for RTL.

## Components and page patterns

- Use `Button`, `Input`, `Card`, `Badge`, `SectionHeader`, `Modal`, `Sheet`, and `Dropdown` before creating local lookalikes. Use existing Radix-backed interactions and give icon-only controls an accessible name.
- `Input` already associates labels, helper text, and errors; provide `label` and either `hint` or `error` rather than hand-rolling field markup.
- Place `PageContainer` inside the shell's existing scroll region (do not add another `<main>`). Compose `PageHeader`, `PageSection`, and `PageGrid` for consistent hierarchy and responsive behavior.
- `PageSection` requires a unique `headingId` and connects the section with `aria-labelledby`. Keep headings in order and provide descriptive link/button names.
- Keep dynamic Tailwind classes in static maps so the content scanner can discover them. Use `cn()` to merge conditional classes.

Example page composition:

```tsx
<PageContainer>
  <div className="space-y-section-gap">
    <PageHeader title="Courses" description="Your current semester at a glance." actions={<Button>Join a course</Button>} />
    <PageSection title="Active courses" headingId="active-courses">
      <PageGrid columns={3}>{/* course cards */}</PageGrid>
    </PageSection>
  </div>
</PageContainer>
```