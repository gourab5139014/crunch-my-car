import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { 
  formatDistance, 
  formatEfficiency, 
  getDistanceLabel, 
  getEfficiencyLabel, 
  UnitSystem 
} from '../lib/units'

interface SpendingBreakdown {
  fuel: number
  service: number
  expense: number
}

export interface VehicleStats {
  total_spend: number
  spending_breakdown: SpendingBreakdown
  total_distance: number
  fuel_efficiency: number
  refueling_count: number
}

interface VehicleAnalyticsProps {
  carId: string
  unitPreference: UnitSystem
}

export default function VehicleAnalytics({ carId, unitPreference }: VehicleAnalyticsProps) {
  const [stats, setStats] = useState<VehicleStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_vehicle_stats', { p_car_id: carId })
      
      if (error) {
        console.error('Error fetching vehicle stats:', error)
      } else {
        setStats(data as VehicleStats)
      }
      setLoading(false)
    }

    fetchStats()
  }, [carId])

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-100 h-24 rounded-lg"></div>
        ))}
      </div>
    )
  }

  if (!stats) return null

  // Derived values using centralized units utility
  const displayDistance = formatDistance(stats.total_distance, unitPreference)
  const displayEfficiency = formatEfficiency(stats.fuel_efficiency, unitPreference)
  
  const distanceUnit = getDistanceLabel(unitPreference)
  const efficiencyUnit = getEfficiencyLabel(unitPreference)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* Fuel Efficiency */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Avg Efficiency</p>
        <p className="mt-1 text-2xl font-bold text-indigo-600">
          {stats.refueling_count < 2 ? '---' : `${displayEfficiency} ${efficiencyUnit}`}
        </p>
        <p className="text-xs text-gray-400 mt-1">Based on {stats.refueling_count} fill-ups</p>
      </div>

      {/* Total Spend */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Spend</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">${stats.total_spend.toFixed(2)}</p>
        <div className="flex gap-2 mt-1">
          <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded" title="Fuel">F: ${stats.spending_breakdown.fuel.toFixed(0)}</span>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded" title="Service">S: ${stats.spending_breakdown.service.toFixed(0)}</span>
          <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded" title="Expense">E: ${stats.spending_breakdown.expense.toFixed(0)}</span>
        </div>
      </div>

      {/* Distance */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Distance</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">
          {displayDistance.toLocaleString()} <span className="text-sm font-normal text-gray-500">{distanceUnit}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">Lifetime tracked distance</p>
      </div>
    </div>
  )
}
