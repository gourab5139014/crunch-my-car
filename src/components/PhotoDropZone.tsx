import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

type Confidence = 'high' | 'low' | 'none'
type Status = 'idle' | 'dragging' | 'collecting' | 'processing' | 'done' | 'error'

export interface ExtractionResult {
  odometer?: number  // km (metric)
  volume?: number    // liters (metric)
  total_cost?: number
  confidence: { odometer: Confidence; volume: Confidence; total_cost: Confidence }
}

interface PhotoDropZoneProps {
  onExtracted: (result: ExtractionResult) => void
}

interface StagedPhoto {
  file: File
  previewUrl: string
}

// Display helpers — convert stored metric values to American units for the summary
function toMi(km: number) { return Math.round(km / 1.609344).toLocaleString() }
function toGal(l: number) { return (l / 3.785411).toFixed(2) }

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.85)
}

function drawScaled(source: CanvasImageSource, w: number, h: number): string {
  const MAX = 1024
  const scale = Math.min(1, MAX / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvasToJpeg(canvas)
}

async function imgToJpeg(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(drawScaled(img, img.naturalWidth, img.naturalHeight))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img decode failed')) }
    img.src = url
  })
}

// Read raw file bytes as a data URI — used for HEIC so the edge function can
// decode it server-side with libheif (Claude's API only accepts JPEG/PNG/GIF/WebP).
async function fileToRawDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(new Blob([file], { type: 'image/heic' }))
  })
}

function isHeicFile(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name)
  )
}

async function toSendableDataUri(file: File): Promise<string> {
  if (isHeicFile(file)) {
    return fileToRawDataUri(file)
  }
  const blob = file.type !== '' ? file : new Blob([file], { type: 'image/jpeg' })
  return imgToJpeg(blob)
}

function isValidImageFile(file: File) {
  return (
    file.type.startsWith('image/') ||
    /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(file.name)
  )
}

const MAX_PHOTOS = 5

export default function PhotoDropZone({ onExtracted }: PhotoDropZoneProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [staged, setStaged] = useState<StagedPhoto[]>([])
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    staged.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    setStaged([])
    setResult(null)
    setErrorMsg(null)
    dragCounter.current = 0
    setStatus('idle')
  }

  function addFiles(files: FileList | File[]) {
    const valid = Array.from(files)
      .filter(isValidImageFile)
      .slice(0, MAX_PHOTOS - staged.length)
    if (valid.length === 0) return
    const newPhotos = valid.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }))
    setStaged((prev) => [...prev, ...newPhotos])
    setStatus('collecting')
  }

  function removePhoto(idx: number) {
    setStaged((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl)
      const next = prev.filter((_, i) => i !== idx)
      if (next.length === 0) setStatus('idle')
      return next
    })
  }

  async function handleScan() {
    setStatus('processing')
    const snapshot = staged  // capture before clearing

    try {
      const dataUris = await Promise.all(snapshot.map((p) => toSendableDataUri(p.file)))
      snapshot.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      setStaged([])

      console.log('[PhotoDropZone] encoded', dataUris.length, 'image(s), invoking scan-refuel')
      const { data, error } = await supabase.functions.invoke('scan-refuel', {
        body: { images: dataUris },
      })
      console.log('[PhotoDropZone] invoke result:', { data, error })

      if (error || !data) {
        setErrorMsg('Something went wrong — please try again.')
        setStatus('error')
        return
      }

      setResult(data)
      setStatus('done')
      onExtracted(data)
    } catch (err) {
      console.error('[PhotoDropZone] unexpected error:', err)
      snapshot.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      setStaged([])
      setErrorMsg('Something went wrong — please try again.')
      setStatus('error')
    }
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    if (status === 'processing' || status === 'done') return
    dragCounter.current++
    setStatus('dragging')
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setStatus(staged.length > 0 ? 'collecting' : 'idle')
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    addFiles(e.dataTransfer.files)
  }

  // ── Derived display values ────────────────────────────────────────────────────

  const foundCount = result
    ? [result.confidence.odometer, result.confidence.volume, result.confidence.total_cost].filter(
        (c) => c !== 'none',
      ).length
    : 0

  const summaryParts: string[] = []
  if (result?.odometer != null && result.confidence.odometer !== 'none')
    summaryParts.push(`${toMi(result.odometer)} mi`)
  if (result?.volume != null && result.confidence.volume !== 'none')
    summaryParts.push(`${toGal(result.volume)} gal`)
  if (result?.total_cost != null && result.confidence.total_cost !== 'none')
    summaryParts.push(`$${result.total_cost.toFixed(2)}`)

  const missingLabels: string[] = []
  if (result?.confidence.odometer === 'none') missingLabels.push('odometer')
  if (result?.confidence.volume === 'none') missingLabels.push('fuel volume')
  if (result?.confidence.total_cost === 'none') missingLabels.push('total cost')

  // ── Shared hidden file input ──────────────────────────────────────────────────

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,.heic,.heif"
      multiple
      className="hidden"
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files)
        e.target.value = ''
      }}
    />
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  if (status === 'idle' || status === 'dragging') {
    const isDragging = status === 'dragging'
    return (
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed
          px-4 py-6 text-center cursor-pointer transition-all
          ${isDragging
            ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
            : 'border-gray-300 bg-white hover:border-indigo-400'}
        `}
      >
        {fileInput}
        {isDragging ? (
          <>
            <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <p className="text-sm font-medium text-indigo-700">Release to add photos</p>
          </>
        ) : (
          <>
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drop photos here or click to browse</p>
            <p className="text-xs text-gray-400">JPG · PNG · WebP · HEIC · up to {MAX_PHOTOS} photos</p>
          </>
        )}
      </div>
    )
  }

  if (status === 'collecting') {
    return (
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="rounded-lg border-2 border-indigo-300 bg-indigo-50 px-4 py-4 space-y-3"
      >
        {fileInput}

        {/* Thumbnail grid */}
        <div className="flex flex-wrap gap-2">
          {staged.map((p, i) => (
            <div key={i} className="relative shrink-0">
              <img src={p.previewUrl} alt="" className="h-16 w-16 rounded object-cover ring-1 ring-indigo-200" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gray-600 text-white leading-none flex items-center justify-center hover:bg-red-600 transition-colors"
                aria-label="Remove photo"
              >
                <span className="text-[10px]">×</span>
              </button>
            </div>
          ))}

          {/* Add more button */}
          {staged.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-16 w-16 rounded border-2 border-dashed border-indigo-300 flex flex-col items-center justify-center text-indigo-400 hover:border-indigo-500 hover:text-indigo-600 transition-colors shrink-0"
              aria-label="Add more photos"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[10px] mt-0.5">Add</span>
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={handleScan}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            Read with AI
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  if (status === 'processing') {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-5">
        <div className="flex items-center gap-2 text-sm text-indigo-700">
          <svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reading with AI…
        </div>
      </div>
    )
  }

  if (status === 'done' && result) {
    const allFound = foundCount === 3
    const noneFound = foundCount === 0

    if (noneFound) {
      return (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 px-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-red-700">No values found</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Try a clearer photo or fill in the fields manually.
              </p>
            </div>
            <button type="button" onClick={reset} className="shrink-0 text-xs text-red-600 underline hover:text-red-800">
              Try again
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className={`rounded-lg border-2 px-4 py-4 ${allFound ? 'border-green-500 bg-green-50' : 'border-amber-400 bg-amber-50'}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-sm font-semibold ${allFound ? 'text-green-700' : 'text-amber-700'}`}>
              {allFound ? `✓ ${summaryParts.join(' · ')}` : `⚠ ${foundCount} of 3 values found`}
            </p>
            {!allFound && summaryParts.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-600">{summaryParts.join(' · ')}</p>
            )}
            {missingLabels.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-500">
                {missingLabels.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')}{' '}
                not found — fill in manually.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={reset}
            className={`shrink-0 text-xs underline ${allFound ? 'text-green-600 hover:text-green-800' : 'text-amber-600 hover:text-amber-800'}`}
          >
            Re-scan ↺
          </button>
        </div>
      </div>
    )
  }

  // error state
  return (
    <div className="rounded-lg border-2 border-red-400 bg-red-50 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-red-700">Something went wrong</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {errorMsg ?? 'Check your connection and try again.'}
          </p>
        </div>
        <button type="button" onClick={reset} className="shrink-0 text-xs text-red-600 underline hover:text-red-800">
          Start again
        </button>
      </div>
    </div>
  )
}
