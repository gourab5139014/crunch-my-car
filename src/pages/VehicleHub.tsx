import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogActivityModal, { EditingRecord, ActivityType } from '../components/LogActivityModal'
import VehicleAnalytics, { UnitSystem } from '../components/VehicleAnalytics'

interface TimelineEntry {
  source_id: string
  activity_type: ActivityType
  date: string
  amount: number
  odometer: number | null
  description: string
}

interface Car {
  id: string
  name: string
  unit_preference: UnitSystem
}

export default function VehicleHub() {
  const { id } = useParams<{ id: string }>()
  const [car, setCar] = useState<Car | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [showSettings, setShowSettings] = useState(false)
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<EditingRecord | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const [modalKey, setModalKey] = useState(0)
  const navigate = useNavigate()

  function refresh() {
    setFetching(true)
    setRefreshTick(t => t + 1)
  }

  function openModal(record: EditingRecord | null = null) {
    setEditingRecord(record)
    setModalKey(k => k + 1)
    setIsModalOpen(true)
  }

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [carResult, timelineResult] = await Promise.all([
        supabase.from('cars').select('id, name, unit_preference').eq('id', id).single(),
        supabase.from('vehicle_timeline').select('*').eq('car_id', id).order('date', { ascending: false }),
      ])

      if (carResult.error) {
        console.error('Error fetching car:', carResult.error)
        navigate('/')
        return
      }

      if (timelineResult.error) {
        console.error('Error fetching timeline:', timelineResult.error)
      }

      setCar(carResult.data)
      setTimeline(timelineResult.data || [])
      setFetching(false)
    })()
  }, [id, navigate, refreshTick])

  async function handleItemClick(entry: TimelineEntry) {
    setLoading(true)
    let table = ''
    if (entry.activity_type === 'fuel') table = 'refuelings'
    else if (entry.activity_type === 'service') table = 'services'
    else if (entry.activity_type === 'expense') table = 'expenses'

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', entry.source_id)
      .single()

    if (error) {
      alert('Error fetching details: ' + error.message)
    } else {
      // Map raw data to EditingRecord interface
      const record: EditingRecord = {
        id: data.id,
        type: entry.activity_type,
        date: data.date,
        odometer: data.odometer,
        volume: data.volume,
        total_cost: data.total_cost,
        amount: data.amount,
        description: data.description,
        category: data.category
      }
      openModal(record)
    }
    setLoading(false)
  }

  async function handleUpdateSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!car) return
    setLoading(true)

    const { error } = await supabase
      .from('cars')
      .update({ 
        name: car.name,
        unit_preference: car.unit_preference
      })
      .eq('id', id)

    if (error) {
      alert('Error updating vehicle: ' + error.message)
    } else {
      setShowSettings(false)
      refresh()
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this vehicle? All related data will be lost.')) return
    
    setLoading(true)
    const { error } = await supabase
      .from('cars')
      .delete()
      .eq('id', id)

    if (error) {
      alert('Error deleting vehicle: ' + error.message)
    } else {
      navigate('/')
    }
    setLoading(false)
  }

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <nav className="flex mb-2" aria-label="Breadcrumb">
            <Link to="/" className="text-sm font-medium text-gray-500 hover:text-gray-700">Vehicles</Link>
            <span className="mx-2 text-gray-400">/</span>
            <span className="text-sm font-medium text-gray-900">{car?.name}</span>
          </nav>
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            {car?.name}
          </h2>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0 space-x-3">
          <button
            onClick={() => openModal(null)}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Log Activity
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {showSettings ? 'Close Settings' : 'Vehicle Settings'}
          </button>
        </div>
      </div>

      {/* Settings Panel (Collapsible) */}
      {showSettings && car && (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-6 animate-in fade-in slide-in-from-top-4">
          <form onSubmit={handleUpdateSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                  Vehicle Name
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    value={car.name}
                    onChange={(e) => setCar({ ...car, name: e.target.value })}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="unit_preference" className="block text-sm font-medium leading-6 text-gray-900">
                  Unit System
                </label>
                <div className="mt-2">
                  <select
                    id="unit_preference"
                    value={car.unit_preference}
                    onChange={(e) => setCar({ ...car, unit_preference: e.target.value as UnitSystem })}
                    className="block w-full rounded-md border-0 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm px-3"
                  >
                    <option value="imperial">Imperial (MPG, miles)</option>
                    <option value="metric">Metric (km/L, km)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                Save Settings
              </button>
            </div>
          </form>
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="text-sm font-semibold text-red-600 hover:text-red-500"
            >
              Delete this vehicle...
            </button>
          </div>
        </div>
      )}

      {/* Analytics Summary */}
      {car && (
        <VehicleAnalytics 
          carId={car.id} 
          unitPreference={car.unit_preference} 
          key={`analytics-${car.id}-${refreshTick}`} 
        />
      )}

      {/* Timeline */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Activity History</h3>
        
        {timeline.length === 0 ? (
          <div className="text-center bg-gray-50 py-12 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-sm text-gray-500">No activity logged for this vehicle yet.</p>
          </div>
        ) : (
          <div className="flow-root">
            <ul role="list" className="-mb-8">
              {timeline.map((entry, idx) => (
                <li key={entry.source_id}>
                  <div className="relative pb-8">
                    {idx !== timeline.length - 1 && (
                      <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                    )}
                    <div className="relative flex space-x-3">
                      <div>
                        <span className={`
                          h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white
                          ${entry.activity_type === 'fuel' ? 'bg-green-500' : ''}
                          ${entry.activity_type === 'service' ? 'bg-blue-500' : ''}
                          ${entry.activity_type === 'expense' ? 'bg-amber-500' : ''}
                        `}>
                          {/* Icons */}
                          {entry.activity_type === 'fuel' && (
                            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          )}
                          {entry.activity_type === 'service' && (
                            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            </svg>
                          )}
                          {entry.activity_type === 'expense' && (
                            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3 1.343 3-3-1.343-3-3-3zM12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
                            </svg>
                          )}
                        </span>
                      </div>
                      <div 
                        onClick={() => handleItemClick(entry)}
                        className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors"
                      >
                        <div>
                          <p className="text-sm text-gray-500">
                            <span className="font-medium text-gray-900 capitalize">{entry.activity_type}</span>: {entry.description}
                          </p>
                          {entry.odometer && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Odometer: {
                                (car?.unit_preference === 'metric'
                                  ? entry.odometer 
                                  : Math.round(entry.odometer * 0.621371)
                                ).toLocaleString()
                              } {car?.unit_preference === 'metric' ? 'km' : 'mi'}
                            </p>
                          )}
                        </div>
                        <div className="whitespace-nowrap text-right text-sm text-gray-500">
                          <div className="font-medium text-gray-900">${entry.amount.toFixed(2)}</div>
                          <time dateTime={entry.date}>{new Date(entry.date).toLocaleDateString()}</time>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {car && (
        <LogActivityModal
          key={modalKey}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setEditingRecord(null)
          }}
          cars={[car]}
          onSuccess={refresh}
          editingRecord={editingRecord}
        />
      )}
    </div>
  )
}
