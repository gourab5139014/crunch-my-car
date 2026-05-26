BEGIN;
SELECT plan(16);

-- 1-4: Verify tables exist
SELECT has_table('public', 'cars', 'cars table should exist');
SELECT has_table('public', 'refuelings', 'refuelings table should exist');
SELECT has_table('public', 'services', 'services table should exist');
SELECT has_table('public', 'expenses', 'expenses table should exist');

-- Setup two mock users
INSERT INTO auth.users (id, email)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'user-a@test.com'),
    ('00000000-0000-0000-0000-000000000002', 'user-b@test.com');

-- [ACTION] AS USER A
SET local role authenticated;
SET local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- User A creates their car and refueling
INSERT INTO public.cars (id, user_id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'Car A');
INSERT INTO public.refuelings (car_id, user_id, date, odometer) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', '2026-05-24', 100);

-- [ACTION] AS USER B
SET local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

-- User B creates their car and refueling
INSERT INTO public.cars (id, user_id, name) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000002', 'Car B');
INSERT INTO public.refuelings (car_id, user_id, date, odometer) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000002', '2026-05-24', 200);

-- --- BI-DIRECTIONAL ISOLATION TESTS ---

-- 5-7: TEST USER A'S VIEW
SET local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

SELECT results_eq(
    $$ SELECT count(*) FROM public.cars $$,
    ARRAY[1::bigint],
    'User A should see exactly 1 car'
);

SELECT results_eq(
    $$ SELECT name FROM public.cars $$,
    ARRAY['Car A'],
    'User A should ONLY see Car A'
);

SELECT results_eq(
    $$ SELECT count(*) FROM public.refuelings $$,
    ARRAY[1::bigint],
    'User A should see exactly 1 refueling'
);

-- 8-10: TEST USER B'S VIEW
SET local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

SELECT results_eq(
    $$ SELECT count(*) FROM public.cars $$,
    ARRAY[1::bigint],
    'User B should see exactly 1 car'
);

SELECT results_eq(
    $$ SELECT name FROM public.cars $$,
    ARRAY['Car B'],
    'User B should ONLY see Car B'
);

SELECT results_eq(
    $$ SELECT count(*) FROM public.refuelings $$,
    ARRAY[1::bigint],
    'User B should see exactly 1 refueling'
);

-- 11-13: TEST CROSS-USER INTERFERENCE (Negative Tests)
-- User B tries to update User A's car
SELECT results_ne(
    $$ UPDATE public.cars SET name = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING 1 $$,
    $$ VALUES(1) $$,
    'User B should NOT be able to update User A''s car'
);

-- User A tries to update User B's car
SET local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT results_ne(
    $$ UPDATE public.cars SET name = 'Hacked' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' RETURNING 1 $$,
    $$ VALUES(1) $$,
    'User A should NOT be able to update User B''s car'
);

-- User A tries to insert a refueling for User B's car (using User B's user_id)
SELECT throws_ok(
    $$ INSERT INTO public.refuelings (car_id, user_id, date, odometer) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000002', '2026-05-24', 999) $$,
    'new row violates row-level security policy for table "refuelings"',
    'User A should NOT be able to insert data for User B'
);

-- 14-16: VERIFY SECURITY FOR SERVICES AND EXPENSES
-- Quick check that they are also isolated (empty by default for cross-check)
SELECT results_eq(
    $$ SELECT count(*) FROM public.services $$,
    ARRAY[0::bigint],
    'User A should see 0 services'
);

SET local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SELECT results_eq(
    $$ SELECT count(*) FROM public.expenses $$,
    ARRAY[0::bigint],
    'User B should see 0 expenses'
);

-- Final check: User B can only see their own car ID
SELECT results_eq(
    $$ SELECT id FROM public.cars $$,
    ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
    'User B should see their own car UUID'
);

SELECT * FROM finish();
ROLLBACK;
