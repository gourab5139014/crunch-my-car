-- Baseline schema for public tables

-- Cars
CREATE TABLE IF NOT EXISTS public.cars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    car_id UUID NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Refuelings
CREATE TABLE IF NOT EXISTS public.refuelings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    car_id UUID NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    odometer INTEGER NOT NULL,
    liters NUMERIC,
    total_cost NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.refuelings ENABLE ROW LEVEL SECURITY;

-- Services
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    car_id UUID NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    odometer INTEGER NOT NULL,
    description TEXT,
    total_cost NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
