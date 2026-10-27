"""Assemble the Tier 5 migration's function bodies from Tier 4's file.

Tier 4 (20261028000000_checkout.sql) already has the exact, proven
bodies. Rather than retyping 390 lines of SQL by hand (a typo would
silently ship a broken confirm path), this script extracts them
verbatim and applies two surgical patches:

  create_checkout_order : a digital line is never out of stock.
  confirm_paid_order    : digital lines skip stock, and the clean branch
                          upserts the order_downloads grants.

Each patch asserts it fired exactly once, then the result is appended
to supabase/migrations/20261029000000_digital_delivery.sql.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'supabase' / 'migrations' / '20261028000000_checkout.sql'
DST = ROOT / 'supabase' / 'migrations' / '20261029000000_digital_delivery.sql'

text = SRC.read_text(encoding='utf-8')
lines = text.split('\n')


def body(start: int, end: int) -> str:
    """1-indexed inclusive slice, exactly as the file has it."""
    return '\n'.join(lines[start - 1:end])


create = body(186, 384)   # header comment .. $$
confirm = body(386, 577)

assert create.rstrip().endswith('$$;'), 'create slice wrong'
assert confirm.rstrip().endswith('$$;'), 'confirm slice wrong'
assert 'create or replace function public.create_checkout_order' in create
assert 'create or replace function public.confirm_paid_order' in confirm

# ---------------------------------------------------------------- create
OLD_STOCK_CHECK = """    if v_eff_stock < (v_line->>'quantity')::integer then
      raise exception 'out_of_stock:%', v_line->>'productId';
    end if;
"""
NEW_STOCK_CHECK = """    -- Tier 5: digital goods have nothing to run out of (they are
    -- delivered by signed link, and products.stock defaults to 0 for
    -- them). The stock gate applies to physical lines only.
    if v_product.product_type <> 'digital'
       and v_eff_stock < (v_line->>'quantity')::integer then
      raise exception 'out_of_stock:%', v_line->>'productId';
    end if;
"""
assert create.count(OLD_STOCK_CHECK) == 1, 'create stock gate not found exactly once'
create = create.replace(OLD_STOCK_CHECK, NEW_STOCK_CHECK)

# -------------------------------------------------------------- confirm
OLD_SHORTFALL = """    if v_eff_stock < v_item.quantity then
      v_shortfall := true;
      v_reasons := array_append(v_reasons, 'stock_shortfall:' || v_item.product_id);
      continue; -- leave stock untouched for this line; flagged below
    end if;
"""
NEW_SHORTFALL = """    -- Tier 5: digital lines carry no stock. Skip the check AND the
    -- decrement below (a digital row with stock 0 must never flag a
    -- shortfall, and there is nothing to take).
    if v_product.product_type = 'digital' then
      continue;
    end if;

    if v_eff_stock < v_item.quantity then
      v_shortfall := true;
      v_reasons := array_append(v_reasons, 'stock_shortfall:' || v_item.product_id);
      continue; -- leave stock untouched for this line; flagged below
    end if;
"""
assert confirm.count(OLD_SHORTFALL) == 1, 'confirm stock gate not found exactly once'
confirm = confirm.replace(OLD_SHORTFALL, NEW_SHORTFALL)

OLD_CONFIRM_RETURN = """  select * into v_order from public.orders where id = v_order.id;

  return jsonb_build_object(
    'ok', true, 'alreadyProcessed', false,
"""
NEW_CONFIRM_RETURN = """  -- Tier 5: grant every digital line on this order, atomically with the
  -- confirmation (ON CONFLICT DO NOTHING keeps a re-entry a no-op, and
  -- the WHERE clause makes an already-granted order produce no new rows
  -- while a genuinely new digital line still gets its grant).
  insert into public.order_downloads (
    order_id, product_id, product_name, storage_path, filename
  )
  select
    v_order.id,
    oi.product_id,
    oi.product_name,
    p.download_path,
    coalesce(p.download_filename, oi.product_name)
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = v_order.id
    and p.product_type = 'digital'
    and coalesce(p.download_path, '') <> ''
  on conflict (order_id, product_id) do nothing;

  select * into v_order from public.orders where id = v_order.id;

  return jsonb_build_object(
    'ok', true, 'alreadyProcessed', false,
"""
assert confirm.count(OLD_CONFIRM_RETURN) == 1, 'confirm return anchor not found exactly once'
confirm = confirm.replace(OLD_CONFIRM_RETURN, NEW_CONFIRM_RETURN)

out = DST.read_text(encoding='utf-8')
assert 'create or replace function public.create_checkout_order' not in out
DST.write_text(out.rstrip('\n') + '\n\n' + create.rstrip('\n') + '\n\n' + confirm.rstrip('\n') + '\n',
               encoding='utf-8')
print('appended:', DST)
print('create lines:', len(create.split('\n')), 'confirm lines:', len(confirm.split('\n')))
