// NOTE: property keys below (`specials`, `lists`, `specialId`) are
// persisted verbatim inside existing users' Automerge documents. Renaming a
// *type alias* is compile-time only and safe; renaming one of these *keys*
// would silently orphan data in every already-synced notebook. See
// docs/rename-plan.md §4.
//
// The `kind` literal is the one exception: it was deliberately renamed
// from 'special' to 'inList' per the rename plan (§6, Q5). New items are
// always written with 'inList'; 'special' is kept as a recognized legacy
// value so items created before this rename still read back correctly.
export type Notebook = {
  items: Record<string, Item>
  globalOrder: string[]
  specials: Lists
}

export type Lists = {
  lists: Record<string, List>
  order: string[]
}

export type List = {
  name: string
}

export type BaseItem = {
  text: string
  inCart: boolean
  purchased: boolean
}

export type Staple = BaseItem & {
  kind: 'staple'
}

export type Rare = BaseItem & {
  kind: 'rare'
}

export type ListItem = BaseItem & {
  kind: 'inList' | 'special'
  specialId: string
}

export type Item = Staple | Rare | ListItem

export type ItemKind = Item['kind']

export function isStaple(item: Item): item is Staple {
  return item.kind === 'staple'
}

export function isAnyListItem(item: Item): item is ListItem {
  return item.kind === 'inList' || item.kind === 'special'
}

export function isListItem(item: Item, listId: string): item is ListItem {
  return isAnyListItem(item) && item.specialId == listId
}

export function isRare(item: Item): item is Rare {
  return item.kind === 'rare'
}
