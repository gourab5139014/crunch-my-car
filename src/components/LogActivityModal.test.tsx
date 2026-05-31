import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import LogActivityModal, { type EditingRecord } from './LogActivityModal'

// ── Supabase mock ─────────────────────────────────────────────────────────────
// vi.mock is hoisted — use vi.hoisted so mockInvoke is available inside the factory.

const mockInvoke = vi.hoisted(() => vi.fn())

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
    functions: { invoke: mockInvoke },
  },
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

function pickFile(inputIndex: number, file: File) {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
  fireEvent.change(inputs[inputIndex], { target: { files: [file] } })
}

const fakeImage = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

// ── Scan section visibility ───────────────────────────────────────────────────

describe('scan section visibility', () => {
  it('is visible on the fuel tab in add mode', () => {
    renderModal(null)
    expect(screen.getByText('Auto-fill from photos')).toBeInTheDocument()
    expect(screen.getByText('Scan Odometer')).toBeInTheDocument()
    expect(screen.getByText('Scan Receipt')).toBeInTheDocument()
  })

  it('is hidden when editing an existing fuel record', () => {
    const record: EditingRecord = {
      id: 'r1',
      type: 'fuel',
      date: '2026-01-01',
      odometer: 54321,
      liters: 42.5,
      total_cost: 68.4,
    }
    renderModal(record)
    expect(screen.queryByText('Auto-fill from photos')).not.toBeInTheDocument()
  })
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('shows no confidence badges before any scan', () => {
    renderModal(null)
    expect(screen.queryByText('⚠ Verify')).not.toBeInTheDocument()
  })

  it('disables both scan buttons while scanning', async () => {
    mockInvoke.mockImplementation(() => new Promise(() => {})) // never resolves
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /scan/i })
      buttons.forEach((btn) => expect(btn).toBeDisabled())
    })
  })
})

// ── Successful odometer scan ──────────────────────────────────────────────────

describe('odometer scan', () => {
  beforeEach(() => { mockInvoke.mockReset() })

  it('populates the odometer field on high-confidence extraction', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        odometer: 54321,
        confidence: { odometer: 'high', liters: 'none', total_cost: 'none' },
      },
      error: null,
    })
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() =>
      expect(screen.getByDisplayValue('54321')).toBeInTheDocument(),
    )
    expect(screen.queryByText('⚠ Verify')).not.toBeInTheDocument()
  })

  it('populates field and shows Verify badge on low-confidence extraction', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        odometer: 50000,
        confidence: { odometer: 'low', liters: 'none', total_cost: 'none' },
      },
      error: null,
    })
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() =>
      expect(screen.getByDisplayValue('50000')).toBeInTheDocument(),
    )
    expect(screen.getByText('⚠ Verify')).toBeInTheDocument()
  })

  it('leaves odometer blank on none-confidence extraction', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        confidence: { odometer: 'none', liters: 'none', total_cost: 'none' },
      },
      error: null,
    })
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))
    const odometerInput = screen.getAllByRole('spinbutton')[0]
    expect(odometerInput).toHaveValue(null)
  })

  it('clears the Verify badge when user manually edits the field', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        odometer: 50000,
        confidence: { odometer: 'low', liters: 'none', total_cost: 'none' },
      },
      error: null,
    })
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() => expect(screen.getByText('⚠ Verify')).toBeInTheDocument())

    // User manually corrects the value
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '54400' } })
    expect(screen.queryByText('⚠ Verify')).not.toBeInTheDocument()
  })
})

// ── Successful receipt scan ───────────────────────────────────────────────────

describe('receipt scan', () => {
  beforeEach(() => { mockInvoke.mockReset() })

  it('populates liters and total cost on high-confidence extraction', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        liters: 42.5,
        total_cost: 68.4,
        confidence: { odometer: 'none', liters: 'high', total_cost: 'high' },
      },
      error: null,
    })
    renderModal(null)
    pickFile(1, fakeImage) // second input = receipt

    await waitFor(() =>
      expect(screen.getByDisplayValue('42.5')).toBeInTheDocument(),
    )
    expect(screen.getByDisplayValue('68.4')).toBeInTheDocument()
    expect(screen.queryByText('⚠ Verify')).not.toBeInTheDocument()
  })

  it('shows two Verify badges when both receipt fields are low-confidence', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        liters: 40,
        total_cost: 60,
        confidence: { odometer: 'none', liters: 'low', total_cost: 'low' },
      },
      error: null,
    })
    renderModal(null)
    pickFile(1, fakeImage)

    await waitFor(() => {
      const badges = screen.getAllByText('⚠ Verify')
      expect(badges).toHaveLength(2)
    })
  })

  it('passes odometerImage in the request body for odometer scan', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { odometer: 1000, confidence: { odometer: 'high', liters: 'none', total_cost: 'none' } },
      error: null,
    })
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledOnce())
    const [fnName, opts] = mockInvoke.mock.calls[0]
    expect(fnName).toBe('scan-refuel')
    expect(opts.body).toHaveProperty('odometerImage')
    expect(opts.body).not.toHaveProperty('receiptImage')
  })

  it('passes receiptImage in the request body for receipt scan', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { liters: 40, total_cost: 60, confidence: { odometer: 'none', liters: 'high', total_cost: 'high' } },
      error: null,
    })
    renderModal(null)
    pickFile(1, fakeImage)

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledOnce())
    const [, opts] = mockInvoke.mock.calls[0]
    expect(opts.body).toHaveProperty('receiptImage')
    expect(opts.body).not.toHaveProperty('odometerImage')
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('scan error handling', () => {
  beforeEach(() => { mockInvoke.mockReset() })

  it('shows error message when invoke returns an error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('Network error') })
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() =>
      expect(
        screen.getByText('Scan failed — please fill in manually.'),
      ).toBeInTheDocument(),
    )
  })

  it('shows error message when invoke returns null data', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: null })
    renderModal(null)
    pickFile(0, fakeImage)

    await waitFor(() =>
      expect(
        screen.getByText('Scan failed — please fill in manually.'),
      ).toBeInTheDocument(),
    )
  })

  it('clears previous error when a new scan succeeds', async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: new Error('fail') })
      .mockResolvedValueOnce({
        data: { odometer: 54321, confidence: { odometer: 'high', liters: 'none', total_cost: 'none' } },
        error: null,
      })

    renderModal(null)
    pickFile(0, fakeImage)
    await waitFor(() =>
      expect(screen.getByText('Scan failed — please fill in manually.')).toBeInTheDocument(),
    )

    pickFile(0, fakeImage)
    await waitFor(() =>
      expect(screen.queryByText('Scan failed — please fill in manually.')).not.toBeInTheDocument(),
    )
  })
})
