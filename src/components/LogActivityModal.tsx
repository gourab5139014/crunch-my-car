import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PhotoDropZone, { type ExtractionResult } from './PhotoDropZone'

type ScanConfidence = 'high' | 'low' | 'none' | null

// American ↔ metric conversions (UI inputs in American; DB stores metric)
const KM_PER_MILE = 1.609344
const L_PER_GAL = 3.785411
function miToKm(mi: number) { return mi * KM_PER_MILE }
function kmToMi(km: number) { return Math.round(km / KM_PER_MILE) }
function galToL(gal: number) { return gal * L_PER_GAL }
function lToGal(l: number) { return parseFloat((l / L_PER_GAL).toFixed(3)) }

export type ActivityType = 'fuel' | 'service' | 'expense'

export interface EditingRecord {
  id: string
  type: ActivityType
  date: string
  odometer?: number   // stored in km
  volume?: number     // stored in liters
  total_cost?: number
  amount?: number
  description?: string
  category?: string
}

interface Car {
  id: string
  name: string
}

interface LogActivityModalProps {
  isOpen: boolean
  onClose: () => void
  cars: Car[]
  onSuccess: () => void
  editingRecord?: EditingRecord | null
}

export default function LogActivityModal({ isOpen, onClose, cars, onSuccess, editingRecord }: LogActivityModalProps) {
  const [activeTab, setActiveTab] = useState<ActivityType>(editingRecord?.type ?? 'fuel')
  const [selectedCarId, setSelectedCarId] = useState(cars.length > 0 ? cars[0].id : '')
  const [loading, setLoading] = useState(false)

  // Form state in American display units; DB values converted on load and save.
  const [date, setDate] = useState(editingRecord?.date ?? new Date().toISOString().split('T')[0])
  const [odometer, setOdometer] = useState(
    editingRecord?.odometer != null ? String(kmToMi(editingRecord.odometer)) : ''
  )
  const [gallons, setGallons] = useState(
    editingRecord?.volume != null ? String(lToGal(editingRecord.volume)) : ''
  )
  const [cost, setCost] = useState(editingRecord?.total_cost?.toString() ?? '')
  const [description, setDescription] = useState(editingRecord?.description ?? '')
  const [amount, setAmount] = useState(editingRecord?.amount?.toString() ?? '')
  const [category, setCategory] = useState(editingRecord?.category ?? 'General')

  const [odometerConf, setOdometerConf] = useState<ScanConfidence>(null)
  const [gallonsConf, setGallonsConf] = useState<ScanConfidence>(null)
  const [costConf, setCostConf] = useState<ScanConfidence>(null)

  // Pre-fill if editing
  useEffect(() => {
    if (editingRecord) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(editingRecord.type)
      setDate(editingRecord.date)
      setOdometer(editingRecord.odometer != null ? String(kmToMi(editingRecord.odometer)) : '')
      setGallons(editingRecord.volume != null ? String(lToGal(editingRecord.volume)) : '')
      setCost(editingRecord.total_cost?.toString() || '')
      setAmount(editingRecord.amount?.toString() || '')
      setDescription(editingRecord.description || '')
      setCategory(editingRecord.category || 'General')
    } else {
      // Reset to defaults for "Add" mode
      setActiveTab('fuel')
      setDate(new Date().toISOString().split('T')[0])
      setOdometer('')
      setGallons('')
      setCost('')
      setAmount('')
      setDescription('')
      setCategory('General')
    }
    setOdometerConf(null)
    setGallonsConf(null)
    setCostConf(null)
  }, [editingRecord, isOpen])

  if (!isOpen) return null

  function handleExtracted(result: ExtractionResult) {
    // Values are metric (km, liters) — convert to American for form display
    if (result.confidence.odometer !== 'none' && result.odometer != null) {
      setOdometer(String(kmToMi(result.odometer)))
      setOdometerConf(result.confidence.odometer)
    }
    if (result.confidence.volume !== 'none' && result.volume != null) {
      setGallons(String(lToGal(result.volume)))
      setGallonsConf(result.confidence.volume)
    }
    if (result.confidence.total_cost !== 'none' && result.total_cost != null) {
      setCost(String(result.total_cost))
      setCostConf(result.confidence.total_cost)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const isEditing = !!editingRecord
    let error;

    const commonData = {
      car_id: selectedCarId,
      user_id: user.id,
      date,
    }

    if (activeTab === 'fuel') {
      const fuelData = {
        ...commonData,
        odometer: Math.round(miToKm(parseFloat(odometer))),
        volume: galToL(parseFloat(gallons)),
        total_cost: parseFloat(cost),
        unit_system: 'metric',
      }
      if (isEditing) {
        const { error: err } = await supabase.from('refuelings').update(fuelData).eq('id', editingRecord.id)
        error = err
      } else {
        const { error: err } = await supabase.from('refuelings').insert(fuelData)
        error = err
      }
    } else if (activeTab === 'service') {
      const serviceData = {
        ...commonData,
        odometer: Math.round(miToKm(parseFloat(odometer))),
        description,
        total_cost: parseFloat(cost)
      }
      if (isEditing) {
        const { error: err } = await supabase.from('services').update(serviceData).eq('id', editingRecord.id)
        error = err
      } else {
        const { error: err } = await supabase.from('services').insert(serviceData)
        error = err
      }
    } else if (activeTab === 'expense') {
      const expenseData = {
        ...commonData,
        amount: parseFloat(amount),
        description,
        category
      }
      if (isEditing) {
        const { error: err } = await supabase.from('expenses').update(expenseData).eq('id', editingRecord.id)
        error = err
      } else {
        const { error: err } = await supabase.from('expenses').insert(expenseData)
        error = err
      }
    }

    if (error) {
      alert('Error saving log: ' + error.message)
    } else {
      onSuccess()
      onClose()
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!editingRecord) return
    if (!confirm('Are you sure you want to delete this log?')) return

    setLoading(true)
    let table = ''
    if (editingRecord.type === 'fuel') table = 'refuelings'
    else if (editingRecord.type === 'service') table = 'services'
    else if (editingRecord.type === 'expense') table = 'expenses'

    const { error } = await supabase.from(table).delete().eq('id', editingRecord.id)

    if (error) {
      alert('Error deleting log: ' + error.message)
    } else {
      onSuccess()
      onClose()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">

                  {/* Top Header Actions */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold leading-6 text-gray-900" id="modal-title">
                      {editingRecord ? 'Edit Activity' : 'Log Activity'}
                    </h3>
                    <div className="flex items-center space-x-2">
                      {editingRecord && (
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={loading}
                          title="Delete activity"
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onClose}
                        title="Cancel"
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-1.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none disabled:opacity-50 transition-all"
                      >
                        {loading ? '...' : editingRecord ? 'Update' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {/* Tabs - Disabled when editing */}
                  <div className="mb-6 border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                      {(['fuel', 'service', 'expense'] as ActivityType[]).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          disabled={!!editingRecord}
                          onClick={() => setActiveTab(tab)}
                          className={`
                            whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium capitalize transition-all
                            ${activeTab === tab
                              ? 'border-indigo-500 text-indigo-600'
                              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}
                            ${editingRecord ? 'cursor-not-allowed opacity-50' : ''}
                          `}
                        >
                          {tab}
                        </button>
                      ))}
                    </nav>
                  </div>

                  <div className="space-y-4">
                    {/* Car Selector - Disabled when editing */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Vehicle</label>
                      <select
                        value={selectedCarId}
                        disabled={!!editingRecord}
                        onChange={(e) => setSelectedCarId(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 disabled:bg-gray-50 transition-colors"
                        required
                      >
                        {cars.map(car => (
                          <option key={car.id} value={car.id}>{car.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Common: Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Date</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                        required
                      />
                    </div>

                    {activeTab === 'fuel' && (
                      <>
                        {!editingRecord && (
                          <PhotoDropZone onExtracted={handleExtracted} />
                        )}

                        <div>
                          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                            Odometer (mi)
                            {odometerConf === 'low' && (
                              <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800" title="Low confidence — please verify">
                                ⚠ Verify
                              </span>
                            )}
                          </label>
                          <input
                            type="number"
                            value={odometer}
                            onChange={(e) => { setOdometer(e.target.value); setOdometerConf(null) }}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                              Gallons
                              {gallonsConf === 'low' && (
                                <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800" title="Low confidence — please verify">
                                  ⚠ Verify
                                </span>
                              )}
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              value={gallons}
                              onChange={(e) => { setGallons(e.target.value); setGallonsConf(null) }}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                              required
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                              Total Cost
                              {costConf === 'low' && (
                                <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800" title="Low confidence — please verify">
                                  ⚠ Verify
                                </span>
                              )}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={cost}
                              onChange={(e) => { setCost(e.target.value); setCostConf(null) }}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                              required
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {activeTab === 'service' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Odometer (mi)</label>
                          <input
                            type="number"
                            value={odometer}
                            onChange={(e) => setOdometer(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Description</label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            rows={2}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Total Cost</label>
                          <input
                            type="number"
                            step="0.01"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            required
                          />
                        </div>
                      </>
                    )}

                    {activeTab === 'expense' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Amount</label>
                          <input
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Category</label>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                          >
                            <option>General</option>
                            <option>Insurance</option>
                            <option>Parking</option>
                            <option>Toll</option>
                            <option>Wash</option>
                            <option>Fine</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Description</label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            rows={2}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
