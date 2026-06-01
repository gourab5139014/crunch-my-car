import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { Session } from '@supabase/supabase-js'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProfileProvider } from './contexts/ProfileContext'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import AddVehicle from './pages/AddVehicle'
import VehicleHub from './pages/VehicleHub'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <ProfileProvider>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col bg-gray-100">
          <header className="bg-white shadow">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                <a href="/">Crunch My Car</a>
              </h1>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500 hidden sm:inline">{session.user.email}</span>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <main className="flex-grow">
            <div className="mx-auto max-w-7xl py-12 px-4 sm:px-6 lg:px-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cars/new" element={<AddVehicle />} />
                <Route path="/cars/:id" element={<VehicleHub />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </BrowserRouter>
    </ProfileProvider>
  )
}

export default App
