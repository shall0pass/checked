# Rename Plan: Grocery List → List / Notebook / Library

Status: **implemented** · Owner: TBD · Scope: `web/`, `server/`, `README.md`

Executed per the decisions recorded in §6. See §8 for how the implementation differs from the mapping tables below (mainly around which persisted property keys/literals had to stay stable).

## 1. Why

The app began as a single-purpose grocery shopping list ("OnlyGroceries" → "Checked") and has since repositioned as a general-purpose list app. Grocery use is still the primary use case, but the product now models a three-level hierarchy:

- **Library** — the collection of all Notebooks a user has.
- **Notebook** — a collection of Lists (what today's code calls a "root document").
- **List** — a named, ordered set of items (what today's code calls a `SpecialList`).

UI copy in `settings.svelte` and `app-sidebar.svelte` already uses "Notebook" and "Library" in places, but the underlying identifiers, types, routes, and storage keys still use the old grocery/shopping vocabulary, and in one important place ("list") the old code overloads a single word across two different hierarchy levels. This plan defines the target vocabulary, resolves that overload, and lays out the rename in dependency order so it can be executed (by a human or by Claude) in a future session without re-deriving this analysis.

**This plan is analysis and sequencing only. No code has been changed.**

## 2. Target vocabulary

| Term | Definition | Replaces |
|---|---|---|
| **Library** | All Notebooks a given browser/user knows about. Persisted client-side as a list of name+URL links. | `rootDocLinks`, `RootDocLink[]` (the collection, as already used in Settings' "Export/Import Library") |
| **Notebook** | One Automerge document: a set of Lists plus their items. Today called the "root document". | `Root`, `rootDoc`, `RootDocLink` (the single entry), `createRootDoc` |
| **List** | A named, ordered set of items inside a Notebook. Today called a `SpecialList`. The "Common items"/staples set and the derived "Shopping List" cart view are special cases of this, see §3. | `SpecialList`, `SpecialLists` |
| **Item** | A single line entry inside a List. | `Item`, `Staple`, `Rare`, `Special` (kept, see §5.6 — out of scope for this pass) |

## 3. The core ambiguity to resolve first

The audit found that the word **"list" is currently used for two different hierarchy levels at once**, which is the single biggest risk to doing this rename mechanically:

1. **List = `SpecialList`** — a named list *inside* a notebook (`special.svelte`, `create-drawer.svelte`'s "Create New List" button, sidebar "Add List"/"Remove List", "Move to list" drawer). This usage already matches the target meaning.
2. **List = Notebook** — Settings' "List Name" field, "Create New List" button (which actually calls `createRootDoc()`), "List ID" (an Automerge URL for a whole notebook), and the entire backend (`/api/lists`, `ListMetadata`, `MetadataStore.lists`) all use "list" to mean what this plan calls a Notebook.
3. **List = the cart view** — the "Shopping List" heading on the main page is a *derived* aggregation of in-cart items across every List in the current Notebook. It is not a stored list at all and should not be renamed to "List" — it's a view, not a hierarchy entity.

**Resolution used throughout this plan:**
- Anywhere "list" currently means (2), rename to **Notebook** (`createNewList()` → `createNewNotebook()`, `/api/lists` → `/api/notebooks`, `ListMetadata` → `NotebookMetadata`, "List Name"/"List ID" fields → "Notebook Name"/"Notebook ID").
- Anywhere "list" currently means (1) — i.e. `SpecialList` — rename to plain **List** (`SpecialList` → `List`, `createSpecialList` → `createList`, `specialId` → `listId`), since it already carries the target meaning and dropping the "Special" qualifier is the whole point of genericizing it.
- Anywhere "list" currently means (3), leave the concept alone but stop calling it a "List" in code/copy — it's a view/aggregate (e.g. rename `cartIds` → keep as-is, but reconsider the "Shopping List" *heading* only if the broader shopping/cart theme is revisited, see §5.6).

This is a product decision as much as a naming one — confirm it before starting §5.

## 4. Critical constraint: persisted data, not just code

Automerge documents are CRDTs stored on disk (server) and in IndexedDB (client) with the *current* field names (`specials`, `globalOrder`, `inCart`, etc.) baked into every existing document. Renaming a TypeScript field name does **not** rename the field inside already-persisted documents.

Two ways to handle this, to decide before touching `types.ts`:

- **(a) Compatibility layer (recommended):** keep the Automerge document's on-disk/on-wire shape unchanged (`specials`, `globalOrder`, ...), and introduce renamed types/accessors in application code that map onto the same underlying fields (e.g. a `List` type that is structurally `SpecialList`, exposed through renamed functions). Zero data migration, zero risk to existing users' documents. Downside: the "true" field names in the CRDT stay old forever, visible to anyone inspecting raw documents or writing future sync-server tooling.
- **(b) Real data migration:** write an Automerge change that copies each old field to a new field name (additive — CRDTs generally can't rename in place) across every document the sync server holds, plus a client-side one-time migration for IndexedDB. Higher effort, real risk (every historical document has to be touched, no rollback once shipped), but leaves no old vocabulary in persisted data.

This plan defaults to **(a)** for the Automerge document shape and treats the rename as a code/API/UI-level rename, not a data migration. If (b) is wanted instead, that needs its own separate migration plan before starting.

The same issue applies to **localStorage keys** in `repo.ts`: `checked:syncServerUrl`, `checked:rootDocUrl`, `checked:rootDocLinks` are read by every existing user's browser on load. If these keys are renamed, existing users lose their saved notebooks unless a one-time migration reads the old key and writes it under the new key (then optionally clears the old one). This migration is small and should be included in the repo.ts rename step (§5.3), not treated as optional.

## 5. Rename mapping by layer

Do these in order — each layer's renamed names are used by the next.

### 5.1 Core types — `web/src/lib/core/types.ts`

| Old | New |
|---|---|
| `SpecialLists` (type, field `Root.specials`) | `Lists` (field `Notebook.lists`) |
| `SpecialList` | `List` |
| `Special` (item kind) | keep `kind: 'special'` → rename to `kind: 'listed'` or similar (item belongs to a List) — needs a decision, see open question in §6 |
| `specialId` (field on `Special` item) | `listId` |
| `isSpecial()` | `isListItem()` (or matching kind rename) |
| `Root` (type) | `Notebook` |

Also rename the file/module conceptually: consider whether `core/types.ts` should introduce a `Library`-level type (currently `RootDocLink[]` lives in `repo.ts`, not `types.ts` — decide whether Library types belong here for consistency).

### 5.2 Core domain functions — `web/src/lib/core/index.ts`

| Old | New |
|---|---|
| `createSpecialList(doc, id, name)` | `createList(doc, id, name)` |
| `renameSpecialList` | `renameList` |
| `reorderSpecialLists` | `reorderLists` |
| `setSpecialListOrder` | `setListOrder` |
| `deleteSpecialList` | `deleteList` |
| `// Special Lists` comment | `// Lists` |
| `// Cart` comment | leave as-is unless §5.6 cart rename is in scope |
| `defaultState()` demo content (`"Xmas Market"`, `"Bratwurst 🌭"`, etc.) | replace with generic demo content, see §5.7 |

### 5.3 State/repo layer — `web/src/lib/core/repo.ts`

| Old | New |
|---|---|
| `RootDocLink` (type) | `NotebookLink` |
| `rootDocLinks` (persistentAtom) | `notebookLinks` |
| `persistedRootUrl` | `persistedNotebookUrl` |
| `createRootDoc()` | `createNotebook()` |
| `getRootDocLinks()` | `getNotebookLinks()` |
| `upsertRootDocLink` / `addRootDocLink` / `removeRootDocLink` / `replaceRootDocLinks` / `ensureDefaultRootDocLink` | `upsertNotebookLink` / `addNotebookLink` / `removeNotebookLink` / `replaceNotebookLinks` / `ensureDefaultNotebookLink` |
| `getRoot()` | `getNotebookUrl()` (name TBD — currently returns a URL, not a doc) |
| localStorage key `checked:rootDocUrl` | `checked:notebookUrl` **with migration**, see §4 |
| localStorage key `checked:rootDocLinks` | `checked:notebookLinks` **with migration**, see §4 |
| localStorage key `checked:syncServerUrl` | leave as-is (not domain vocabulary) |

### 5.4 Frontend components & pages — `web/src`

| File | Renames |
|---|---|
| `lib/components/cart-item.svelte` | keep filename/scope if cart/shopping theme stays (§5.6); internal `ShoppingBasket` icon likewise out of scope unless §5.6 is adopted |
| `lib/components/add-item-block.svelte` | `addToCart` prop — leave unless §5.6 |
| `lib/components/special-item.svelte` | rename file → `list-item.svelte`; prop `toggleInCart` stays (cart concept, §5.6) |
| `lib/components/regular-item.svelte` | prop `toggleInCart` stays (§5.6) |
| `pages/staples.svelte` | `commonItems` etc. stay — "Common items"/staples is an item-kind concept (§5.6), not a hierarchy rename target |
| `pages/special.svelte` | rename file → `pages/list.svelte`; prop `listId` (already correct name!); `addSpecial()` → `addItem()`; component `SpecialItem` → `ListItem` |
| `pages/main.svelte` | `SpecialGroup` type → `ListGroup`; `specialCartGroups` → `listCartGroups`; `moveItemToList` (already correct) |
| `lib/components/app-sidebar.svelte` | prop `rootDoc` → `notebook`; `"Special Lists"` label → `"Lists"`; `setSpecialListOrder` → `setListOrder`; `specialListsMenuEl` → `listsMenuEl`; `handleSpecialListSort` → `handleListSort`; `data-special-list-id` → `data-list-id`; reconcile "Save Notebook"/"Import Notebook" export filename `checked-lists-and-items.json` → `checked-notebook.json` (see collision note in audit §6) |
| `pages/settings.svelte` | `rootName` → `notebookName`; `newRootId` → `newNotebookId`; `savedRootLinks` → `savedNotebookLinks`; `sortedRootLinks` → `sortedNotebookLinks`; `activateRootLink` → `activateNotebookLink`; `renameRootLink` → `renameNotebookLink`; `createNewList()` → `createNewNotebook()`; `updateRootDoc()` → `updateNotebook()`; `saveRootLink()` → `saveNotebookLink()`; `listMap`/`savedLists` payload fields → `notebookMap`/`savedNotebooks`; labels `"List Name"` → `"Notebook Name"`, `"ID (rootdocID)"` → `"ID (notebook ID)"`, `"Create New List"` → `"Create New Notebook"` |
| `lib/components/create-drawer.svelte` | `createList()` stays (already creates a `SpecialList` = target List) — no rename needed, just confirm after §5.1–5.2 land it still compiles |
| `lib/components/remove-drawer.svelte`, `stores/remove-drawer.svelte.ts` | `specialList` field → `list` |
| `stores/router.ts` | route `special: '/special/:id'` → `list: '/list/:id'` (URL path change — confirm no external links depend on `/special/`) |
| `layout.svelte` | `Special`/`Common` imports, `createSpecialList`/`deleteSpecialList` calls → follow §5.2 renames |
| `lib/components/header/header.svelte` | reads `getRootDocLinks()`/`persistedRootUrl` → follow §5.3 renames |

### 5.5 Backend / API — `server/src`

| Old | New |
|---|---|
| Routes `GET/DELETE /api/lists`, `/api/lists/:documentId`, `POST /api/lists/prune` | `/api/notebooks`, `/api/notebooks/:documentId`, `/api/notebooks/prune` |
| `ListSummary` (type) | `NotebookSummary` |
| `ListMetadata` (type, `metadata-store.ts`) | `NotebookMetadata` |
| `MetadataFile.lists` field | `MetadataFile.notebooks` |
| `MetadataStore` methods keyed by `documentId` | keep `documentId` (that's still correct — one Automerge doc = one notebook) |
| Admin portal inline copy: `"Manage lists..."`, `"Prune Old Lists"`, `"All Lists"`, `"List ID"`, `"List Content"`, `viewList()`/`deleteList()`/`loadLists()` | `"Manage notebooks..."`, `"Prune Old Notebooks"`, `"All Notebooks"`, `"Notebook ID"`, `"Notebook Content"`, `viewNotebook()`/`deleteNotebook()`/`loadNotebooks()` |

Note: renaming `/api/lists` is a breaking API change for anything calling the admin portal outside the bundled UI (scripts, bookmarks). Confirm nothing external depends on the current path before renaming, or keep the old route as an alias.

### 5.6 Explicitly out of scope for this pass (flag as open questions)

The audit found these are grocery/shopping-specific but are about **item behavior**, not the **list/notebook/library hierarchy** the user asked to rename. Listed here so they aren't silently renamed or silently left inconsistent:

- `Staple` / `Rare` item kinds, "Common items" page, `ShoppingBasket` icon, `cart`/`inCart`/`toggleInCart`/`CartItem`, "Shopping List" heading.
- These form a second, separate "grocery shopping" vocabulary layer (staples vs. occasional items, a cart/checkout metaphor) that sits *underneath* the list/notebook/library hierarchy and is still arguably correct for the primary grocery use case. Recommend a separate decision (and separate plan) on whether these should also generalize, rather than folding it into this rename.

### 5.7 Demo data, docs, misc.

- `defaultState()` demo seed (`web/src/lib/core/index.ts`) — replace `"Xmas Market"`, `"Bratwurst 🌭✨"` etc. with generic example content once §5.1–5.2 land.
- `docker-compose.yaml` comment `"# set to true to enable demo data for Staples and Xmas Market"` — update wording after demo data changes.
- `README.md` — full rewrite needed: line 3 tagline ("Minimalistic grocery list app..."), "Main Page"/"Special lists"/"Settings Page"/"Admin Portal" sections all describe old naming and should describe Library/Notebook/List instead. Do this last, once the rename is actually implemented, so the README describes real code rather than aspirational naming.
- Export/import file names: `checked-lists-and-items.json` → `checked-notebook.json`; `checked-library.json` stays (already correctly named).

## 6. Open questions to confirm before implementation

1. Confirm the §3 resolution (List = `SpecialList`, Notebook = `Root`/root doc, Library = `RootDocLink[]`) matches product intent.
    Yes

2. Confirm §4's choice of compatibility layer (a) vs. real data migration (b) for the Automerge document shape.
    do a compatibility layer

3. Decide whether `/api/lists` can be renamed outright or needs a temporary alias for backward compatibility.
    this can be renamed outright

4. Decide whether §5.6 (staples/rare/cart/shopping-basket vocabulary) is in scope now, later, or never.
    don't do this

5. Decide the new name for the `Special` item kind (`kind: 'special'` → `kind: 'listed'`? `'inList'`? something else) — needed 
before §5.1 can be finalized.
    change it to kind: inList

## 7. Suggested execution order

1. Confirm §6 open questions.
2. `web/src/lib/core/types.ts` (§5.1) — foundation, nothing else compiles correctly until this is settled.
3. `web/src/lib/core/index.ts` (§5.2).
4. `web/src/lib/core/repo.ts` (§5.3), including the localStorage migration.
5. Frontend components & pages (§5.4), file renames included — expect this to be the largest diff.
6. Backend API & admin portal (§5.5) — coordinate with anything that calls `/api/lists` externally.
7. Demo data, `docker-compose.yaml`, `README.md` (§5.7) — last, so docs describe the shipped result.
8. Grep the whole repo for the old identifiers (`grep -rniE "special|rootDoc|rootLink" web/src server/src`) as a final check that nothing was missed.

Each numbered step above is a reasonable unit for a single PR/commit.

## 8. Implementation notes (post-hoc, what actually shipped)

The tables in §5 describe the rename as originally scoped. Two refinements were made during implementation, both consistent with §6's answers but more precise about what "compatibility layer" (§4/§6 Q2) actually requires at the code level:

- **Type/function names vs. persisted property keys are different things.** A TypeScript type or function name (`SpecialList`, `createSpecialList`, `Root`) is erased at compile time and safe to rename freely. An object property *key* actually written into an Automerge document (`specials`, `lists`, `specialId`) or a `localStorage`/metadata-file field is real, persisted data — renaming the key breaks reading every already-synced document. So `Notebook.specials` and `ListItem.specialId` keep their original key names even though their *type names* (`Notebook`, `ListItem`) were renamed. This wasn't fully spelled out in §5.1's table; treat "keep the key, rename the type" as the general rule wherever this plan's tables imply a field rename on a persisted structure.
- **The `kind: 'special'` → `kind: 'inList'` rename (§6 Q5) is the one literal *value* that was intentionally changed**, since the user asked for it explicitly and confirmed a compatibility layer (not a data migration) in the same breath. This was implemented as: new items are always written with `kind: 'inList'`; `ListItem.kind` is typed as `'inList' | 'special'`; a new `isAnyListItem()` guard (and `isListItem()`, which now delegates to it) recognize both values, so items persisted before this rename keep working. If `'special'` is ever fully retired, that's a real data migration (§4 option (b)) — not done here.
- **§5.5's `/api/lists` alias was *not* added.** §6 Q3 said the API can be renamed outright, so only `/api/notebooks*` routes exist; `/api/lists*` returns 404.
- **`MetadataFile.lists` → `MetadataFile.notebooks` (§5.5) was implemented with a read-side migration**, not left as a hard break: `MetadataStore.init()` accepts either field name on load (preferring `notebooks`, falling back to `lists`) and always persists under `notebooks` going forward. This wasn't explicitly asked for but follows the same "compatibility layer" spirit as §6 Q2, applied to the one other place (besides the client) that persists data to disk.
- Everything else in §5 (types, functions, repo.ts + localStorage migration, all frontend files, file renames, demo data, README) shipped as scoped, including the §5.4 file renames (`special.svelte` → `pages/list.svelte`, `special-item.svelte` → `lib/components/list-item.svelte`) and the `/special/:id` → `/list/:id` route change.
- §5.6 (staples/rare/cart/shopping-basket vocabulary) was left untouched, per §6 Q4.

Both packages type-check clean (`pnpm check` in `web/`, `tsc --noEmit` in `server/`) with zero new errors introduced by this rename — the 6 errors `pnpm check` reports are pre-existing (a `svelte-sonner` toast-typing mismatch and one `$root`-possibly-null warning) and were present identically before this work started.
