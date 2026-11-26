import {
  isRare,
  isListItem,
  type Item,
  type Notebook,
  type Lists
} from '$src/lib/core/types'
import { nanoid } from 'nanoid'

declare const __DEMO__: boolean
const isDemoMode = typeof __DEMO__ !== 'undefined' && __DEMO__

// Base

export function createItem(doc: Notebook, item: Item) {
  const id = nanoid()
  doc.items[id] = item
  doc.globalOrder.push(id)
}

export function deleteItem(doc: Notebook, itemId: string) {
  let globalIdx = -1
  for (let i = 0; i < doc.globalOrder.length; i++) {
    if (String(doc.globalOrder[i]) === itemId) { globalIdx = i; break }
  }
  if (globalIdx === -1) return
  doc.globalOrder.splice(globalIdx, 1)
  delete doc.items[itemId]
}

export function handleDnd(
  doc: Notebook,
  itemsView: string[],
  oldIndex: number,
  newIndex: number
) {
  const oldId = itemsView[oldIndex]
  const newId = itemsView[newIndex]
  let globalOld = -1, globalNew = -1
  for (let i = 0; i < doc.globalOrder.length; i++) {
    const s = String(doc.globalOrder[i])
    if (s === oldId) globalOld = i
    if (s === newId) globalNew = i
  }
  const [movedItem] = doc.globalOrder.splice(globalOld, 1)
  doc.globalOrder.splice(globalNew, 0, movedItem)
}

// Cart

export function deleteFromCart(doc: Notebook, itemId: string) {
  if (isRare(doc.items[itemId])) {
    deleteItem(doc, itemId)
  } else {
    doc.items[itemId].inCart = false
    doc.items[itemId].purchased = false
  }
}

export function togglePurchased(doc: Notebook, itemId: string) {
  doc.items[itemId].purchased = !doc.items[itemId].purchased
}

export function toggleInCart(doc: Notebook, id: string) {
  doc.items[id].inCart = !doc.items[id].inCart
}

export function updateItemText(doc: Notebook, id: string, text: string) {
  doc.items[id].text = text
}

// Lists

export function createList(doc: Notebook, id: string, name: string) {
  doc.specials.lists[id] = { name }
  doc.specials.order.push(id)
}

export function renameList(doc: Notebook, id: string, name: string) {
  doc.specials.lists[id].name = name
}

export function reorderLists(
  doc: Notebook,
  oldIndex: number,
  newIndex: number
) {
  if (
    oldIndex === newIndex ||
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= doc.specials.order.length ||
    newIndex >= doc.specials.order.length
  ) {
    return
  }

  const [moved] = doc.specials.order.splice(oldIndex, 1)
  doc.specials.order.splice(newIndex, 0, moved)
}

export function setListOrder(doc: Notebook, orderedIds: string[]) {
  if (orderedIds.length !== doc.specials.order.length) return

  const knownIds = new Set(doc.specials.order.map(id => String(id)))
  for (const id of orderedIds) {
    if (!knownIds.has(id)) return
  }

  doc.specials.order.splice(0, doc.specials.order.length, ...orderedIds)
}

export function deleteList(doc: Notebook, id: string) {
  const targetId = String(id)
  const items = Object.entries(doc.items)
    .filter(([_, item]) => isListItem(item, targetId))
    .map(([itemId]) => itemId)

  const idx = doc.specials.order.findIndex(listId => String(listId) === targetId)
  if (idx >= 0) {
    const normalizedListId = String(doc.specials.order[idx])
    doc.specials.order.splice(idx, 1)
    delete doc.specials.lists[normalizedListId]

    for (const item of items) {
      deleteItem(doc, item)
    }
  }
}

export function defaultState(): Notebook {
  const defaultListId = nanoid()
  const defaultListItems: Record<string, Item> = {
    [nanoid()]: {
      text: 'Sunscreen 🧴',
      purchased: false,
      inCart: true,
      kind: 'inList',
      specialId: defaultListId
    },
    [nanoid()]: {
      text: 'Passport 📖',
      purchased: false,
      inCart: false,
      kind: 'inList',
      specialId: defaultListId
    },
    [nanoid()]: {
      text: 'Phone charger 🔌',
      purchased: false,
      inCart: false,
      kind: 'inList',
      specialId: defaultListId
    },
    [nanoid()]: {
      text: 'Snacks for the road 🍫',
      purchased: false,
      inCart: false,
      kind: 'inList',
      specialId: defaultListId
    }
  }
  const defaultStaples: Record<string, Item> = {
    [nanoid()]: {
      text: 'Milk 🥛',
      kind: 'staple',
      purchased: false,
      inCart: false
    },
    [nanoid()]: {
      text: 'Bread 🍞',
      kind: 'staple',
      purchased: false,
      inCart: false
    },
    [nanoid()]: {
      text: 'Salad 🥬',
      kind: 'staple',
      purchased: false,
      inCart: false
    },
    [nanoid()]: {
      text: 'Tomatoes 🍅',
      kind: 'staple',
      purchased: false,
      inCart: false
    },
    [nanoid()]: {
      text: 'Avocado 🥑',
      kind: 'staple',
      purchased: false,
      inCart: false
    },
    [nanoid()]: {
      text: 'Eggs 🥚',
      kind: 'staple',
      purchased: false,
      inCart: false
    },
    [nanoid()]: {
      text: 'Cheese 🧀',
      kind: 'staple',
      purchased: false,
      inCart: false
    },
    [nanoid()]: {
      text: 'Chocolate 🍫',
      kind: 'staple',
      purchased: false,
      inCart: false
    }
  }
  const defaultItems = { ...defaultStaples, ...defaultListItems }
  const defaultLists: Lists = {
    order: [defaultListId],
    lists: {
      [defaultListId]: {
        name: 'Weekend Trip'
      }
    }
  }

  if (!isDemoMode) {
    return {
      items: {},
      globalOrder: [],
      specials: {
        order: [],
        lists: {}
      }
    }
  }

  return {
    items: defaultItems,
    globalOrder: Object.keys(defaultItems),
    specials: defaultLists
  }
}
