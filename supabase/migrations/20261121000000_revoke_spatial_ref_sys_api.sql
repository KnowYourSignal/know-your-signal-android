-- ==============================================================================
-- TICKET C_01 / HALLAZGO A04: Restringir acceso PostgREST sobre spatial_ref_sys
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'spatial_ref_sys'
  ) THEN
    BEGIN
      EXECUTE 'REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'spatial_ref_sys owned by managed superuser; skip direct revoke in non-superuser context';
    END;
  END IF;
END $$;
