-- Atomic merge of streamed generation rows into synthetic_databases.data_json
-- Eliminates read-modify-write races across concurrent workers for the same row.

CREATE OR REPLACE FUNCTION public.merge_generation_flush(
  p_database_id uuid,
  p_table_name text,
  p_rows jsonb,
  p_row_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'merge_generation_flush: p_rows must be a JSON array'
      USING ERRCODE = '22000';
  END IF;

  UPDATE public.synthetic_databases
  SET
    data_json = jsonb_set(
      COALESCE(data_json, '{}'::jsonb),
      ARRAY[p_table_name],
      COALESCE(data_json->p_table_name, '[]'::jsonb) || p_rows,
      true
    ),
    row_count = GREATEST(0, p_row_count),
    updated_at = now()
  WHERE id = p_database_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_generation_flush: database % not found', p_database_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_generation_flush(uuid, text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_generation_flush(uuid, text, jsonb, integer) TO service_role;
