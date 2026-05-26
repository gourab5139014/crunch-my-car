import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabaseAuth } from '../lib/supabase'

export default function Login() {
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
        <Auth
          supabaseClient={supabaseAuth}
          appearance={{ theme: ThemeSupa }}
          theme="light"
          providers={[]}
        />
      </div>
    </div>
  )
}
