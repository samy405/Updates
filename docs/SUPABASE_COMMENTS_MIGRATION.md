# Supabase comments: restore after update ID change

Comments are stored by **update_id** (the update’s `id` in `updates.json`). If an update’s `id` is changed (e.g. after re-ingesting and fixing dates), existing comments stay under the **old** `update_id` and no longer show on that card until you repoint them.

## Example: “A routing error” (Jan 2026 fix)

Comments were posted when the update had id **`20260128-a-routing-error`**. After the date fix, that update’s id became **`20260127-a-routing-error`**. The comments are still in Supabase under the old id.

**To restore them**, run this in the Supabase Dashboard → SQL Editor:

```sql
UPDATE public.comments
SET update_id = '20260127-a-routing-error'
WHERE update_id = '20260128-a-routing-error';
```

Then run **once** (no need to repeat). After that, those comments will appear again on the “A routing error” card.

## If you change other update IDs later

For any update whose `id` changed from `old_id` to `new_id`, run:

```sql
UPDATE public.comments
SET update_id = 'new_id'
WHERE update_id = 'old_id';
```

Replace `old_id` and `new_id` with the actual values from your `updates.json`.
