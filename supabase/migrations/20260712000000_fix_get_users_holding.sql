-- Fix get_users_holding to correctly match symbols without requiring .NS/.BO in the database
CREATE OR REPLACE FUNCTION public.get_users_holding(search_symbol text)
RETURNS TABLE (id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id
  FROM public.profiles p, unnest(p.holdings) AS h
  WHERE split_part(h, '.', 1) ILIKE search_symbol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
