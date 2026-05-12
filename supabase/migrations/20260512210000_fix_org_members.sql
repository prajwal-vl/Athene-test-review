-- 1. Fix the departments table first (ensure it has 'id')
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='id') THEN
        -- If the table is empty and broken, just recreate it
        DROP TABLE IF EXISTS departments CASCADE;
        CREATE TABLE departments (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name            text NOT NULL,
            slug            text NOT NULL,
            created_at      timestamptz NOT NULL DEFAULT now(),
            UNIQUE (org_id, slug)
        );
    END IF;
END $$;

-- 2. Now fix org_members
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='org_members' AND column_name='department_id') THEN
        ALTER TABLE org_members ADD COLUMN department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
    END IF;
END $$;
