<script lang="ts">
import '../app.css'
import * as Tabs from '$lib/components/ui/tabs'
import * as Drawer from '$lib/components/ui/drawer'
import { Button } from '$lib/components/ui/button'
import AddItemBlock from '$lib/components/add-item-block.svelte'
import RegularItem from '$lib/components/regular-item.svelte'
import CartItem from '$lib/components/cart-item.svelte'

import Sortable, { type SortableEvent } from 'sortablejs'
import { sortable } from '../sortable'

import { type AutomergeDocumentStore } from '@automerge/automerge-repo-svelte-store'
import {
  type Root,
  type Staple,
  isStaple,
  type ItemKind
} from '$src/lib/core/types'
import {
  deleteFromCart,
  toggleInCart,
  togglePurchased,
  createItem,
  deleteItem,
  handleDnd,
  updateItemText
} from '$src/lib/core'

// The pencil icon will open the move drawer for rare items
const editItem = openMoveDrawer;

  interface Props {
    root: AutomergeDocumentStore<Root> | null
  }
  const { root }: Props = $props()

  let activeTab = $state<ItemKind>('staple')

  let staples = $derived(
    $root?.globalOrder.filter(id => isStaple($root.items[id])) || []
  )
  let staplesRenderKey = $derived(staples.join('|'))

  let moveDrawerOpen = $state(false)
  let movingItemId = $state<string | null>(null)


let moveTargets = $derived(() => {
  const targets: { id: string; name: string }[] = [];
  // Add staples as a move target
  targets.push({ id: 'staples', name: 'Staples' });
  // Add all special lists
  if ($root?.specials.order) {
    for (const id of $root.specials.order) {
      targets.push({ id: String(id), name: $root.specials.lists[String(id)].name });
    }
  }
  return targets;
});

  // Drawer edit state for moving/renaming
  let editDrawerMode = $state(false)
  let editDrawerText = $state('')

  function startDrawerEdit() {
    if (!movingItemId || !$root) return;
    editDrawerText = $root.items[movingItemId]?.text || '';
    editDrawerMode = true;
  }
  function commitDrawerEdit() {
    if (!movingItemId || !$root) return;
    const trimmed = editDrawerText.trim();
    if (trimmed && trimmed !== $root.items[movingItemId].text) {
      root?.change(doc => updateItemText(doc, movingItemId as string, trimmed));
    }
    editDrawerMode = false;
  }
  function cancelDrawerEdit() {
    editDrawerMode = false;
  }
  function resetDrawerEdit() {
    editDrawerMode = false;
    editDrawerText = '';
  }

  function openMoveDrawer(itemId: string) {
    movingItemId = itemId
    moveDrawerOpen = true
  }

  // function moveStapleTo(targetListId: string) {
  //   if (!movingItemId) return
  //   const id = movingItemId
  //   root?.change(doc => {
  //     const item = doc.items[id]
  //     if (!item || !isStaple(item)) return
  //     createItem(doc, {
  //       kind: 'special',
  //       text: item.text,
  //       purchased: false,
  //       inCart: false,
  //       specialId: targetListId
  //     })
  //     deleteItem(doc, id)
  //   })
  //   movingItemId = null
  //   moveDrawerOpen = false
  // }
  function moveItemToList(targetListId: string) {
    if (!movingItemId || !$root) return;
    const id = movingItemId;
    const item = $root.items[id];
    if (!item) return;
    root?.change(doc => {
      if (targetListId === 'staples') {
        // Move to staples
        createItem(doc, {
          kind: 'staple',
          text: item.text,
          purchased: false,
          inCart: true
        });
      } else {
        // Move to special list
        createItem(doc, {
          kind: 'special',
          text: item.text,
          purchased: false,
          inCart: true,
          specialId: targetListId
        });
      }
      deleteItem(doc, id);
    });
    movingItemId = null;
    moveDrawerOpen = false;
  }
  let cartIds = $derived(
    $root?.globalOrder.filter(id => $root.items[id].inCart) || []
  )

  let regularCartIds = $derived(
    cartIds.filter(id => $root?.items[id].kind !== 'special')
  )
  let regularCartRenderKey = $derived(regularCartIds.join('|'))

  type AddItemSuggestion = {
    id: string
    text: string
    sourceName: string
  }

  let addItemSuggestions = $derived.by<AddItemSuggestion[]>(() => {
    if (!$root) return []

    const suggestions: AddItemSuggestion[] = []
    for (const [id, item] of Object.entries($root.items)) {
      if (item.kind !== 'staple' && item.kind !== 'special') {
        continue
      }

      const trimmed = item.text.trim()
      if (!trimmed) continue

      const sourceName =
        item.kind === 'staple'
          ? 'Staples'
          : ($root.specials.lists[item.specialId]?.name ?? 'Special list')

      suggestions.push({
        id,
        text: trimmed,
        sourceName
      })
    }

    return suggestions
  })

  type SpecialGroup = { listId: string; name: string; ids: string[] }
  let specialCartGroups = $derived.by<SpecialGroup[]>(() => {
    if (!$root) return []
    const seen = new Map<string, string[]>()
    for (const id of cartIds) {
      const item = $root.items[id]
      if (item.kind === 'special') {
        const bucket = seen.get(item.specialId)
        if (bucket) bucket.push(id)
        else seen.set(item.specialId, [id])
      }
    }
    return $root.specials.order
      .filter(listId => (seen.get(listId)?.length ?? 0) > 0)
      .map(listId => ({
        listId,
        name: $root!.specials.lists[listId]?.name ?? listId,
        ids: seen.get(listId)!
      }))
  })

  const options: Sortable.SortableOptions = {
    animation: 150,
    swapThreshold: 0.5,
    ghostClass: 'ghost',
    onEnd: handleSort,
    forceFallback: true,
    fallbackClass: 'fallback',
    fallbackTolerance: 1,
    delay: 80,
    delayOnTouchOnly: true
  }
  function handleSort(event: SortableEvent) {
    const { oldIndex, newIndex } = event
    if (typeof oldIndex !== 'number' || typeof newIndex !== 'number') return

    root?.change(doc => {
      if (activeTab == 'staple') {
        handleDnd(doc, staples, oldIndex, newIndex)
      } else {
        handleDnd(doc, regularCartIds, oldIndex, newIndex)
      }
    })
  }

  function deleteStaple(id: string) {
    root?.change(doc => {
      if (isStaple(doc.items[id])) {
        deleteItem(doc, id)
      }
    })
  }

  function addItem(text: string, sourceItemId?: string) {
    root?.change(doc => {
      if (sourceItemId && doc.items[sourceItemId]) {
        doc.items[sourceItemId].inCart = true
        return
      }
      createItem(doc, {
        text: text,
        kind: 'rare',
        inCart: true,
        purchased: false
      })
    })
  }

function clearCompletedCartItems() {
  if (!$root) return;
  const toRemove = cartIds.filter(id => $root.items[id]?.purchased);
  if (toRemove.length === 0) return;
  root?.change(doc => {
    for (const id of toRemove) {
      deleteFromCart(doc, id);
    }
  });
}
</script>

{#if $root}
  <div class="container max-w-2xl pt-2">
    <AddItemBlock
      addToCart={addItem}
      suggestionSource={addItemSuggestions}
      activeTab={"rare"}
    />

    {#if regularCartIds.length > 0}
      <details open>
        <summary
          class="flex cursor-pointer select-none items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          <span class="chevron">▶</span>
          Shopping List
          <span class="ml-auto text-xs font-normal text-slate-400"
            >{regularCartIds.length}</span
          >
        </summary>
        {#key regularCartRenderKey}
          <ul use:sortable={options} class="mt-1 grid gap-2 pl-2">
            {#each regularCartIds as id, i (id)}
              <CartItem
                {i}
                itemId={id}
                item={$root?.items[id]}
                togglePurchased={() =>
                  root?.change(doc => togglePurchased(doc, id))}
                deleteCartItem={() =>
                  root?.change(doc => deleteFromCart(doc, id))}
                onEdit={openMoveDrawer}
              />
            {/each}
          </ul>
        {/key}
      </details>

    {/if}


    {#each specialCartGroups as group (group.listId)}
      <details class="mt-3" open>
        <summary
          class="flex cursor-pointer select-none items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          <span class="chevron">▶</span>
          {group.name}
          <span class="ml-auto text-xs font-normal text-slate-400"
            >{group.ids.length}</span
          >
        </summary>
        <ul class="mt-1 grid gap-2 pl-2">
          {#each group.ids as id, i (id)}
            <CartItem
              {i}
              itemId={id}
              item={$root?.items[id]}
              togglePurchased={() =>
                root?.change(doc => togglePurchased(doc, id))}
              deleteCartItem={() =>
                root?.change(doc => deleteFromCart(doc, id))}
            />
          {/each}
        </ul>
      </details>
    {/each}

    {#if cartIds.some(id => $root.items[id]?.purchased)}
      <div class="mt-6 mb-2">
        <Button class="w-full" size="lg" onclick={clearCompletedCartItems}>
          Clear completed items
        </Button>
      </div>
    {/if}
  </div>
{/if}

<Drawer.Root bind:open={moveDrawerOpen}>
  <Drawer.Content>
    <div class="mx-auto mb-4 w-full max-w-sm">
      <div class="flex flex-col gap-2 p-4">
        <!-- No edit name option for shopping list drawer -->
        <div class="mt-2 mb-2 border-t"></div>
        <div class="mb-1 font-semibold">Move to list:</div>
          {#each moveTargets() as list}
            <Button variant="outline" onclick={() => moveItemToList(list.id)}>{list.name}</Button>
          {/each}
        <Button variant="ghost" onclick={() => { moveDrawerOpen = false; resetDrawerEdit(); }}>Cancel</Button>
      </div>
    </div>
  </Drawer.Content>
 </Drawer.Root>

<style>
  :global(.ghost) {
    position: relative;
  }

  :global(.ghost)::before {
    border-radius: calc(var(--radius) - 2px);
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    background-color: #f1f5f9;
  }

  :global(.fallback) {
    border-radius: 8px;
    transform: rotate(4deg);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
  }

  details .chevron {
    display: inline-block;
    font-size: 0.6rem;
    transition: transform 0.2s;
  }

  details[open] .chevron {
    transform: rotate(90deg);
  }
</style>
