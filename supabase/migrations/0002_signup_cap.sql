-- Cap the total number of accounts that can be created.
--
-- Apply via the Supabase dashboard SQL editor. Change max_users to the limit
-- you want. New sign-ups beyond the cap fail with the raised error; existing
-- users can still sign in.
--
-- To lift the cap later, raise max_users and re-run, or drop the trigger:
--   drop trigger if exists enforce_max_users on auth.users;

create or replace function public.enforce_max_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_users constant int := 25;  -- <<< EDIT: maximum number of accounts
  current_users int;
begin
  select count(*) into current_users from auth.users;
  if current_users >= max_users then
    raise exception 'Sign-ups are closed: account limit reached.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_max_users on auth.users;
create trigger enforce_max_users
  before insert on auth.users
  for each row execute function public.enforce_max_users();
