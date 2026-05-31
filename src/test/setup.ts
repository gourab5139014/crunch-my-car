import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Canvas mock — resizeAndEncode uses HTMLCanvasElement + Image
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  drawImage: vi.fn(),
})
HTMLCanvasElement.prototype.toDataURL = vi
  .fn()
  .mockReturnValue('data:image/jpeg;base64,bW9ja2ltYWdl')

window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-object-url')
window.URL.revokeObjectURL = vi.fn()

// Image mock — fires onload synchronously so resizeAndEncode resolves immediately
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
