import { useState, useEffect, useRef } from 'react'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import type { ViewType } from '@supabase/auth-ui-shared'
import { supabaseAuth } from '../lib/supabase'

export default function Login() {
  const [view, setView] = useState<ViewType>('sign_in')
  const [confirmationSent, setConfirmationSent] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const originalSignUp = supabaseAuth.auth.signUp.bind(supabaseAuth.auth)

    const patchedAuth = supabaseAuth.auth as unknown as { signUp: typeof originalSignUp }
    patchedAuth.signUp = async (...args: Parameters<typeof originalSignUp>) => {
      const result = await originalSignUp(...args)
      if (result.data?.user && !result.data?.session) {
        setConfirmationSent(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          setView('sign_in')
          setConfirmationSent(false)
        }, 4000)
      }
      return result
    }

    return () => {
      patchedAuth.signUp = originalSignUp
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-10 shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Crunch My Car
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to manage your vehicle expenses
          </p>
        </div>
        {confirmationSent && (
          <div className="rounded-md bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              Please check your email to confirm your account.
            </p>
          </div>
        )}
        <Auth
          supabaseClient={supabaseAuth}
          appearance={{ theme: ThemeSupa }}
          theme="light"
          providers={[]}
          view={view}
        />
      </div>
    </div>
  )
}
