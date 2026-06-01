import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import LogActivityModal, { type EditingRecord } from './LogActivityModal'

// ── Context mock ──────────────────────────────────────────────────────────────

vi.mock('../contexts/ProfileContext', () => ({
  useProfile: () => ({
    profile: { id: 'user-1', unit_preference: 'imperial' },
    loading: false,
    updateUnitPreference: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}))

// ── Supabase mock ─────────────────────────────────────────────────────────────

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: { invoke: vi.fn() },
  },
}))

// PhotoDropZone makes its own supabase calls; stub it to keep these tests focused
vi.mock('./PhotoDropZone', () => ({
  default: () => <div data-testid="photo-drop-zone">PhotoDropZone</div>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseCars = [{ id: 'car-1', name: 'Test Car' }]

function renderModal(editingRecord: EditingRecord | null = null) {
  return render(
    <LogActivityModal
      isOpen={true}
      onClose={vi.fn()}
      cars={baseCars}
      onSuccess={vi.fn()}
      editingRecord={editingRecord}
    />,
  )
}

// ── Drop zone visibility ──────────────────────────────────────────────────────

describe('drop zone visibility', () => {
  it('is visible on the fuel tab in add mode', () => {
    renderModal(null)
    expect(screen.getByTestId('photo-drop-zone')).toBeInTheDocument()
  })

  it('is hidden when editing an existing fuel record', () => {
    const record: EditingRecord = {
      id: 'r1',
      type: 'fuel',
      date: '2026-01-01',
      odometer: 87415,   // km (≈ 54,321 mi)
      volume: 42.5,      // liters
      total_cost: 68.4,
    }
    renderModal(record)
    expect(screen.queryByTestId('photo-drop-zone')).not.toBeInTheDocument()
  })
})

// ── Unit display ──────────────────────────────────────────────────────────────

describe('unit display', () => {
  it('shows miles and gallons labels on the fuel tab', () => {
    renderModal(null)
    expect(screen.getByText(/Odometer \(mi\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Volume \(gal\)/i)).toBeInTheDocument()
  })

  it('converts stored km to miles when editing a fuel record', () => {
    const record: EditingRecord = {
      id: 'r1',
      type: 'fuel',
      date: '2026-01-01',
      odometer: 80468,   // 80468 km ≈ 50000 mi
      volume: 37.854,    // 37.854 L ≈ 10 gal
      total_cost: 45,
    }
    renderModal(record)
    // odometer input shows miles
    expect(screen.getByDisplayValue('50000')).toBeInTheDocument()
  })

  it('shows miles label on the service tab', () => {
    const record: EditingRecord = {
      id: 's1',
      type: 'service',
      date: '2026-01-01',
      odometer: 80468,
      description: 'Oil change',
      total_cost: 60,
    }
    renderModal(record)
    expect(screen.getByText(/Odometer \(mi\)/i)).toBeInTheDocument()
  })
})
