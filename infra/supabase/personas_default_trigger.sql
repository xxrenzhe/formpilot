create or replace function enforce_single_default_persona()
returns trigger as $$
begin
  if new.is_default then
    update personas
    set is_default = false
    where user_id = new.user_id
      and id <> new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists personas_default_guard on personas;
create trigger personas_default_guard
before insert or update on personas
for each row execute function enforce_single_default_persona();
