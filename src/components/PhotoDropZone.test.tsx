import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PhotoDropZone from './PhotoDropZone'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeJpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
const fakeHeic = new File(['x'], 'photo.heic', { type: '' })
const fakePdf  = new File(['x'], 'doc.pdf',   { type: 'application/pdf' })

function renderZone(onExtracted = vi.fn()) {
  return render(<PhotoDropZone onExtracted={onExtracted} />)
}

function getFileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

function stageFiles(files: File[]) {
  fireEvent.change(getFileInput(), { target: { files } })
}

async function stageAndScan(files: File[]) {
  stageFiles(files)
  await waitFor(() => expect(screen.getByText('Read with AI')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Read with AI'))
}

// Metric mock values (what the edge function returns)
const highConfResult = {
  data: {
    odometer: 54321,   // km
    volume: 42.5,      // liters
    total_cost: 68.4,
    confidence: { odometer: 'high', volume: 'high', total_cost: 'high' },
  },
  error: null,
}

// ── Idle state ────────────────────────────────────────────────────────────────

describe('idle state', () => {
  it('renders drop zone with hint text', () => {
    const { container } = renderZone()
    expect(screen.getByText(/Drop photos here or click to browse/i)).toBeInTheDocument()
    expect(screen.getByText(/JPG.*HEIC.*up to 5/i)).toBeInTheDocument()
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument()
  })

  it('file input accepts images and heic', () => {
    const { container } = renderZone()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toContain('image/*')
    expect(input.accept).toContain('.heic')
    expect(input.multiple).toBe(true)
  })
})

// ── Drag state ────────────────────────────────────────────────────────────────

describe('drag state', () => {
  it('shows release-to-add on dragenter', () => {
    const { container } = renderZone()
    const zone = container.firstChild as HTMLElement
    fireEvent.dragEnter(zone, { dataTransfer: { files: [fakeJpeg] } })
    expect(screen.getByText(/Release to add photos/i)).toBeInTheDocument()
  })

  it('reverts to idle on dragleave when counter reaches zero', () => {
    const { container } = renderZone()
    const zone = container.firstChild as HTMLElement
    fireEvent.dragEnter(zone, { dataTransfer: { files: [fakeJpeg] } })
    fireEvent.dragLeave(zone)
    expect(screen.getByText(/Drop photos here/i)).toBeInTheDocument()
  })
})

// ── Collecting state ──────────────────────────────────────────────────────────

describe('collecting state', () => {
  it('shows thumbnails and Read with AI button after selecting a file', () => {
    renderZone()
    stageFiles([fakeJpeg])
    expect(screen.getByText('Read with AI')).toBeInTheDocument()
    expect(screen.getByText('Clear all')).toBeInTheDocument()
  })

  it('shows add-more button when below the 5-photo limit', () => {
    renderZone()
    stageFiles([fakeJpeg])
    expect(screen.getByLabelText('Add more photos')).toBeInTheDocument()
  })

  it('hides add-more button when 5 photos are staged', () => {
    renderZone()
    const files = Array.from({ length: 5 }, (_, i) =>
      new File(['x'], `photo${i}.jpg`, { type: 'image/jpeg' }),
    )
    stageFiles(files)
    expect(screen.queryByLabelText('Add more photos')).not.toBeInTheDocument()
  })

  it('removes a photo when its × button is clicked', async () => {
    renderZone()
    const twoFiles = [
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]
    stageFiles(twoFiles)
    const removeButtons = screen.getAllByLabelText('Remove photo')
    expect(removeButtons).toHaveLength(2)
    fireEvent.click(removeButtons[0])
    await waitFor(() =>
      expect(screen.getAllByLabelText('Remove photo')).toHaveLength(1),
    )
  })

  it('returns to idle when last photo is removed', async () => {
    renderZone()
    stageFiles([fakeJpeg])
    fireEvent.click(screen.getByLabelText('Remove photo'))
    await waitFor(() =>
      expect(screen.getByText(/Drop photos here/i)).toBeInTheDocument(),
    )
  })

  it('returns to idle when Clear all is clicked', () => {
    renderZone()
    stageFiles([fakeJpeg])
    fireEvent.click(screen.getByText('Clear all'))
    expect(screen.getByText(/Drop photos here/i)).toBeInTheDocument()
  })

  it('accepts a HEIC file by extension', () => {
    renderZone()
    stageFiles([fakeHeic])
    expect(screen.getByText('Read with AI')).toBeInTheDocument()
  })

  it('silently ignores non-image files (stays idle)', () => {
    renderZone()
    stageFiles([fakePdf])
    expect(screen.getByText(/Drop photos here/i)).toBeInTheDocument()
  })
})

// ── Processing state ──────────────────────────────────────────────────────────

describe('processing state', () => {
  it('shows spinner after clicking Read with AI', async () => {
    mockInvoke.mockImplementation(() => new Promise(() => {})) // never resolves
    renderZone()
    stageFiles([fakeJpeg])
    await waitFor(() => expect(screen.getByText('Read with AI')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Read with AI'))

    await waitFor(() =>
      expect(document.querySelector('.animate-spin')).toBeInTheDocument(),
    )
    expect(screen.getByText(/Reading with AI/i)).toBeInTheDocument()
  })
})

// ── Success states ────────────────────────────────────────────────────────────

describe('success — all 3 found', () => {
  beforeEach(() => { mockInvoke.mockReset() })

  it('shows green state with American unit summary', async () => {
    mockInvoke.mockResolvedValueOnce(highConfResult)
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(screen.getByText(/Re-scan/i)).toBeInTheDocument())

    // 54321 km ÷ 1.609344 = 33754 mi; 42.5 L ÷ 3.785411 = 11.23 gal
    expect(screen.getByText(/33,754 mi/)).toBeInTheDocument()
    expect(screen.getByText(/11\.2\d gal/)).toBeInTheDocument()
    expect(screen.getByText(/\$68\.40/)).toBeInTheDocument()
  })

  it('calls onExtracted with metric values', async () => {
    mockInvoke.mockResolvedValueOnce(highConfResult)
    const onExtracted = vi.fn()
    render(<PhotoDropZone onExtracted={onExtracted} />)
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(onExtracted).toHaveBeenCalledOnce())
    const arg = onExtracted.mock.calls[0][0]
    expect(arg.odometer).toBe(54321)
    expect(arg.volume).toBe(42.5)
    expect(arg.total_cost).toBe(68.4)
  })

  it('sends images array in the request body', async () => {
    mockInvoke.mockResolvedValueOnce(highConfResult)
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledOnce())
    const [fnName, opts] = mockInvoke.mock.calls[0]
    expect(fnName).toBe('scan-refuel')
    expect(Array.isArray(opts.body.images)).toBe(true)
    expect(opts.body.images).toHaveLength(1)
  })

  it('sends all staged images when multiple files are queued', async () => {
    mockInvoke.mockResolvedValueOnce(highConfResult)
    renderZone()
    const twoJpegs = [
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    ]
    await stageAndScan(twoJpegs)

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledOnce())
    const [, opts] = mockInvoke.mock.calls[0]
    expect(opts.body.images).toHaveLength(2)
  })
})

describe('success — partial (2 of 3)', () => {
  beforeEach(() => { mockInvoke.mockReset() })

  it('shows amber state naming the missing field', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        odometer: 54321,
        volume: 42.5,
        confidence: { odometer: 'high', volume: 'high', total_cost: 'none' },
      },
      error: null,
    })
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(screen.getByText(/2 of 3 values found/i)).toBeInTheDocument())
    expect(screen.getByText(/Total cost not found/i)).toBeInTheDocument()
  })
})

describe('success — nothing found', () => {
  beforeEach(() => { mockInvoke.mockReset() })

  it('shows red no-values state', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        confidence: { odometer: 'none', volume: 'none', total_cost: 'none' },
      },
      error: null,
    })
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(screen.getByText(/No values found/i)).toBeInTheDocument())
    expect(screen.getByText(/Try again/i)).toBeInTheDocument()
  })
})

// ── Error state ───────────────────────────────────────────────────────────────

describe('error state', () => {
  beforeEach(() => { mockInvoke.mockReset() })

  it('shows error when invoke returns an error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('Network error') })
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument())
    expect(screen.getByText(/Start again/i)).toBeInTheDocument()
  })

  it('shows error when invoke returns null data', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: null })
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument())
  })
})

// ── Re-scan ───────────────────────────────────────────────────────────────────

describe('re-scan', () => {
  it('resets to idle when Re-scan is clicked', async () => {
    mockInvoke.mockResolvedValueOnce(highConfResult)
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(screen.getByText(/Re-scan/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Re-scan/i))

    expect(screen.getByText(/Drop photos here or click to browse/i)).toBeInTheDocument()
  })

  it('resets to idle when Retry is clicked after error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('fail') })
    renderZone()
    await stageAndScan([fakeJpeg])

    await waitFor(() => expect(screen.getByText(/Start again/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Start again/i))

    expect(screen.getByText(/Drop photos here or click to browse/i)).toBeInTheDocument()
  })
})
