import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { UnitSystem } from '../lib/units'

interface Profile {
  id: string
  unit_preference: UnitSystem
}

interface ProfileContextType {
  profile: Profile | null
  loading: boolean
  updateUnitPreference: (system: UnitSystem) => Promise<void>
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        // If profile doesn't exist, we'll try to create one (failsafe for triggers)
        console.warn('Profile fetch failed, attempting recovery:', error.message)
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({ id: user.id, unit_preference: 'imperial' })
          .select()
          .single()
        
        if (!createError) setProfile(newProfile)
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.error('Unexpected error in profile context:', err)
    } finally {
      setLoading(false)
    }
  }

  async function updateUnitPreference(system: UnitSystem) {
    if (!profile) return
    const { error } = await supabase
      .from('profiles')
      .update({ unit_preference: system, updated_at: new Date().toISOString() })
      .eq('id', profile.id)

    if (error) {
      alert('Error updating preference: ' + error.message)
    } else {
      setProfile({ ...profile, unit_preference: system })
    }
  }

  useEffect(() => {
    fetchProfile()

    // Listen for auth changes to re-fetch profile
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') fetchProfile()
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, loading, updateUnitPreference, refreshProfile: fetchProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return context
}
