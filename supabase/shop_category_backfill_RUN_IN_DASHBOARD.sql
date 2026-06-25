-- =============================================================================
-- shop_category_backfill_RUN_IN_DASHBOARD.sql
--
-- Run AFTER shop_categories_and_personalization_RUN_IN_DASHBOARD.sql
-- Safe to re-run: only fills NULL main_category from legacy category text.
-- =============================================================================

-- Map legacy Dutch category labels → main_category codes
update public.products
set main_category = case lower(trim(category))
  when 'kleding' then 'clothing'
  when 'schoenen' then 'shoes'
  when 'accessoires' then 'accessories'
  when 'beauty' then 'beauty'
  when 'elektronica' then 'electronics'
  when 'wonen' then 'home'
  when 'sport' then 'sports'
  when 'overig' then 'other'
  else main_category
end
where main_category is null
  and category is not null
  and trim(category) <> '';

-- Fallback: anything still without main_category → other
update public.products
set main_category = 'other'
where main_category is null;

-- Subcategory fallback for legacy products
update public.products
set subcategory = 'other'
where subcategory is null
  and main_category is not null;

-- Keep legacy category text in sync where empty but main_category is set
update public.products
set category = case main_category
  when 'clothing' then 'Kleding'
  when 'shoes' then 'Schoenen'
  when 'accessories' then 'Accessoires'
  when 'beauty' then 'Beauty'
  when 'electronics' then 'Elektronica'
  when 'home' then 'Wonen'
  when 'sports' then 'Sport'
  when 'other' then 'Overig'
  else category
end
where (category is null or trim(category) = '')
  and main_category is not null;

-- Diagnostic (optional — review in SQL editor)
-- select id, name, category, main_category, audience, subcategory, is_active, stock
-- from public.products
-- order by created_at desc;
