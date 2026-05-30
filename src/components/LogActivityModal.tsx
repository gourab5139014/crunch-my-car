import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Car {
  id: string
  name: string
}

interface LogActivityModalProps {
  isOpen: boolean
  onClose: () => void
  cars: Car[]
  onSuccess: () => void
}

type ActivityType = 'fuel' | 'service' | 'expense'

export default function LogActivityModal({ isOpen, onClose, cars, onSuccess }: LogActivityModalProps) {
  const [activeTab, setActiveTab] = useState<ActivityType>('fuel')
  const [selectedCarId, setSelectedCarId] = useState(cars.length > 0 ? cars[0].id : '')
  const [loading, setLoading] = useState(false)

  // Form states
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [odometer, setOdometer] = useState('')
  const [liters, setLiters] = useState('')
  const [cost, setCost] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('General')

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let error;

    if (activeTab === 'fuel') {
      const { error: fuelError } = await supabase.from('refuelings').insert({
        car_id: selectedCarId,
        user_id: user.id,
        date,
        odometer: parseInt(odometer),
        liters: parseFloat(liters),
        total_cost: parseFloat(cost)
      })
      error = fuelError
    } else if (activeTab === 'service') {
      const { error: serviceError } = await supabase.from('services').insert({
        car_id: selectedCarId,
        user_id: user.id,
        date,
        odometer: parseInt(odometer),
        description,
        total_cost: parseFloat(cost)
      })
      error = serviceError
    } else if (activeTab === 'expense') {
      const { error: expenseError } = await supabase.from('expenses').insert({
        car_id: selectedCarId,
        user_id: user.id,
        date,
        amount: parseFloat(amount),
        description,
        category
      })
      error = expenseError
    }

    if (error) {
      alert('Error saving log: ' + error.message)
    } else {
      onSuccess()
      onClose()
      // Reset form
      setOdometer('')
      setLiters('')
      setCost('')
      setAmount('')
      setDescription('')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                <h3 className="text-lg font-medium leading-6 text-gray-900" id="modal-title">
                  Log New Activity
                </h3>
                
                {/* Tabs */}
                <div className="mt-4 border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {(['fuel', 'service', 'expense'] as ActivityType[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`
                          whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium capitalize
                          ${activeTab === tab 
                            ? 'border-indigo-500 text-indigo-600' 
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}
                        `}
                      >
                        {tab}
                      </button>
                    ))}
                  </nav>
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  {/* Car Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Vehicle</label>
                    <select
                      value={selectedCarId}
                      onChange={(e) => setSelectedCarId(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Odometer (km)</label>
                        <input
                          type="number"
                          value={odometer}
                          onChange={(e) => setOdometer(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Liters</label>
                          <input
                            type="number"
                            step="0.01"
                            value={liters}
                            onChange={(e) => setLiters(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
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
                      </div>
                    </>
                  )}

                  {activeTab === 'service' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Odometer (km)</label>
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

                  <div className="mt-8 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Log'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
