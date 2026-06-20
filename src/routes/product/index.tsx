import { createFileRoute } from '@tanstack/react-router'
import { ProjectIntake } from '~/components/product/ProjectIntake'
import { LiveBuildSequence } from '~/components/product/LiveBuildSequence'

export const Route = createFileRoute('/product/')({
  component: ProductPage,
})

// Page 3 — Permit + compliance product (the demo centerpiece).
// Intake -> Claude redesign -> a single live, pausable 10-step build sequence
// with the Voice Log + RFI + Watchdog agents available inline.
function ProductPage() {
  return (
    <main className="product-page">
      <section className="product-page__intake">
        <h2>Start a project</h2>
        <ProjectIntake />
      </section>
      <section className="product-page__sequence">
        <h2>Live build sequence</h2>
        <LiveBuildSequence />
      </section>
    </main>
  )
}
