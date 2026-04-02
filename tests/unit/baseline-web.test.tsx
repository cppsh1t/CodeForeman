// ── Baseline smoke test: proves vitest web (jsdom) environment renders React ──
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Minimal component to prove React + jsdom work end-to-end
function SmokeComponent(): React.JSX.Element {
  return <div data-testid="smoke">baseline-ok</div>
}

describe('vitest web environment (jsdom)', () => {
  it('renders a React component', () => {
    render(<SmokeComponent />)
    expect(screen.getByTestId('smoke')).toBeInTheDocument()
    expect(screen.getByTestId('smoke')).toHaveTextContent('baseline-ok')
  })
})
