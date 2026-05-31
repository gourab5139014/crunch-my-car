import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Canvas mock
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  drawImage: vi.fn(),
})
HTMLCanvasElement.prototype.toDataURL = vi
  .fn()
  .mockReturnValue('data:image/jpeg;base64,bW9ja2ltYWdl')

window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-object-url')
window.URL.revokeObjectURL = vi.fn()

// Image mock — fires onload synchronously
class MockImage {
  onload: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  width = 800
  height = 600
  set src(_: string) {
    if (this.onload) this.onload()
  }
}
vi.stubGlobal('Image', MockImage)

// createImageBitmap mock — resolves immediately with a fake bitmap
vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
  width: 800,
  height: 600,
  close: vi.fn(),
}))
