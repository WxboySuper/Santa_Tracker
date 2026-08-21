import { Button } from '@santa-tracker/ui';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-300">Christmas 2026 — Foundation</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Santa Tracker workspace is live.</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-slate-300">
          This is the Next.js App Router shell wired to the typed pnpm workspace. Seasonal scenes, the route engine,
          activity SDK, and admin studio land in follow-up issues. The legacy Flask app remains at{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm">src/app.py</code> until parity is accepted.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow">
        <h2 className="text-lg font-semibold">Workspace boundaries</h2>
        <ul className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
          <li>
            <code className="text-teal-300">apps/web</code> — Next.js composition root
          </li>
          <li>
            <code className="text-teal-300">packages/contracts</code> — Zod schemas &amp; stable IDs
          </li>
          <li>
            <code className="text-teal-300">packages/route-engine</code> — pure domain logic
          </li>
          <li>
            <code className="text-teal-300">packages/database</code> — Drizzle + PostgreSQL
          </li>
          <li>
            <code className="text-teal-300">packages/ui</code> — design tokens &amp; a11y primitives
          </li>
          <li>
            <code className="text-teal-300">packages/activity-sdk</code> — game/activity lifecycle
          </li>
          <li>
            <code className="text-teal-300">packages/config</code> — typed env at process start
          </li>
          <li>
            <code className="text-teal-300">packages/test-fixtures</code> — deterministic clocks &amp; routes
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Next steps</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Follow <code>docs/planning/christmas-2026-reinvention.md</code> and issue #199 for the tracked delivery order.
          This scaffold deliberately contains no seasonal content — it proves the workspace, typegraph, and build.
        </p>
      </section>
    </main>
  );
}
