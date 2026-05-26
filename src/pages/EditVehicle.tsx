import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function EditVehicle() {
  const { id } = useParams<{ id: string }>()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchCar() {
      const { data, error } = await supabase
        .from('cars')
        .select('name')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error fetching car:', error)
        navigate('/')
      } else if (data) {
        setName(data.name)
      }
      setFetching(false)
    }

    if (id) fetchCar()
  }, [id, navigate])

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('cars')
      .update({ name })
      .eq('id', id)

    if (error) {
      alert('Error updating vehicle: ' + error.message)
    } else {
      navigate('/')
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
    <div className="max-w-2xl mx-auto">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Edit Vehicle
          </h2>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
          >
            Delete Vehicle
          </button>
        </div>
      </div>

      <form onSubmit={handleUpdate} className="space-y-6 bg-white p-8 rounded-lg shadow border border-gray-200">
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-x-6">
          <Link to="/" className="text-sm font-semibold leading-6 text-gray-900">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Update Vehicle'}
          </button>
        </div>
      </form>
    </div>
  )
}
