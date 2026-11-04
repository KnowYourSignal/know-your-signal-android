import { createHandler } from './handler.ts';
import { createDependencies } from './transport.ts';

Deno.serve(
  createHandler(
    createDependencies(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
        Deno.env.get('SUPABASE_ANON_KEY') ??
        ''
    )
  )
);
