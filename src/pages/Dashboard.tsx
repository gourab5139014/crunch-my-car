import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogActivityModal from '../components/LogActivityModal'
import { UnitSystem } from '../components/VehicleAnalytics'

interface Car {
  id: string
  name: string
  unit_preference: UnitSystem
  avg_efficiency?: number | null
}

export default function Dashboard() {
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  async function fetchCars() {
    // Fetch cars and their basic stats via a join or multiple calls
    // For the dashboard, we'll call the rpc per car for now (fine for small fleet)
    const { data: carsData, error } = await supabase
      .from('cars')
      .select('id, name, unit_preference')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching cars:', error)
      setLoading(false)
      return
    }

    if (carsData) {
      const carIds = carsData.map(c => c.id)
      const { data: statsData } = await supabase.rpc('get_fleet_stats', { p_car_ids: carIds })
      
      const statsMap = (statsData as any[])?.reduce((acc, item) => {
        acc[item.car_id] = item.stats
        return acc
      }, {} as Record<string, any>) || {}

      const carsWithStats = carsData.map((car) => ({
        ...car,
        avg_efficiency: statsMap[car.id]?.fuel_efficiency ?? null
      }))
      setCars(carsWithStats)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCars()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Your Vehicles</h2>
        <div className="flex space-x-3">
          {cars.length > 0 && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Log Activity
            </button>
          )}
          <Link
            to="/cars/new"
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Add Vehicle
          </Link>
        </div>
      </div>

      {cars.length === 0 ? (
        <div className="text-center bg-white py-12 px-4 rounded-lg shadow border border-dashed border-gray-300">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
            />
          </svg>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">No vehicles found</h2>
          <p className="mt-1 text-sm text-gray-500">Get started by adding your first car to track expenses.</p>
          <div className="mt-6">
            <Link
              to="/cars/new"
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Add Vehicle
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car) => {
            const isMetric = car.unit_preference === 'metric'
            const efficiency = car.avg_efficiency 
              ? (isMetric ? car.avg_efficiency : car.avg_efficiency * 2.352).toFixed(1)
              : null
            const unit = isMetric ? 'km/L' : 'MPG'

            return (
              <Link
                key={car.id}
                to={`/cars/${car.id}`}
                className="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:shadow-md transition-all"
              >
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">{car.name}</p>
                    {efficiency && (
                      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        {efficiency} {unit}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-gray-500 mt-1">View details & analytics</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* The Floating Action Button (FAB) for mobile speed */}
      {cars.length > 0 && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:hidden"
        >
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      <LogActivityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        cars={cars}
        onSuccess={() => {
          fetchCars()
          alert('Activity logged successfully!')
        }}
      />
    </div>
  )
}
