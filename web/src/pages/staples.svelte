<script lang="ts">
  import RegularItem from '$lib/components/regular-item.svelte'
  import Input from '$lib/components/ui/input/input.svelte'
  import { toast } from 'svelte-sonner'
  import { nanoid } from 'nanoid'
  import { type AutomergeDocumentStore } from '@automerge/automerge-repo-svelte-store'
  import { isStaple, type Root, type Staple } from '$src/lib/core/types'
  import { toggleInCart, deleteItem, updateItemText, createItem } from '$src/lib/core'
  import * as Drawer from '$lib/components/ui/drawer'
  import { Button } from '$lib/components/ui/button'

  // Move drawer state
  let moveDrawerOpen = $state(false)
  let movingStapleId = $state<string | null>(null)

  // List of special lists as move targets
  let moveTargets = $derived(() => {
    const targets = [];
    if ($root && $root.specials && $root.specials.order && $root.specials.lists) {
      for (const id of $root.specials.order) {
        const list = $root.specials.lists[String(id)];
        if (list && list.name) {
          targets.push({ id: String(id), name: list.name });
        }
      }
    }
    return targets;
  });

  function openMoveDrawer(stapleId: string) {
    movingStapleId = stapleId;
    moveDrawerOpen = true;
  }

  function moveStapleTo(targetListId: string) {
    if (!movingStapleId || !$root) return;
    const id = movingStapleId;
    const item = $root.items[id];
    if (!item) return;
    root?.change(doc => {
      // Move staple to special list
      createItem(doc, {
        kind: 'special',
        text: item.text,
        purchased: false,
        inCart: item.inCart,
        specialId: targetListId
      });
      deleteItem(doc, id);
    });
    movingStapleId = null;
    moveDrawerOpen = false;
  }
  import { sortable } from '../sortable'
  import Sortable, { type SortableEvent } from 'sortablejs'

  interface Props {
    root: AutomergeDocumentStore<Root> | null
  }
  const { root }: Props = $props()


  let text = $state('')
  let commonItems = $derived(
    $root?.globalOrder.filter(id => isStaple($root.items[id])) || []
  )
  let commonItemsRenderKey = $derived(commonItems.join('|'))

  function addStaple() {
    let formatted = text.toLowerCase().trim()
    if (!formatted) {
      toast.error('You have to type something')
      return
    }
    root?.change(doc => {
      createItem(doc, {
        kind: 'staple',
        text: text.trim(),
        purchased: false,
        inCart: false
      })
    })
    text = ''
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      addStaple()
    }
  }

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
      const ids = commonItems.slice()
      const [removed] = ids.splice(oldIndex, 1)
      ids.splice(newIndex, 0, removed)
      // update globalOrder for common items only
      const stapleIds = doc.globalOrder.filter(id => isStaple(doc.items[id]))
      for (let i = 0; i < stapleIds.length; i++) {
        doc.globalOrder[doc.globalOrder.indexOf(stapleIds[i])] = ids[i]
      }
    })
  }
</script>

<div class="container max-w-2xl px-4 pt-2">
  <h1 class="text-3xl font-bold mb-4">Common items</h1>
  <div class="mb-4 mt-4 flex flex-col gap-1">
    <Input
      class="text-md focus-visible:ring-offset-1"
      bind:value={text}
      onkeydown={(e: KeyboardEvent) => handleKeydown(e)}
      required
    />
    <Button class="mt-3" onclick={addStaple} size="lg">Add</Button>
  </div>
  {#if commonItems.length > 0}
    {#key commonItemsRenderKey}
      <ul use:sortable={options} class="grid gap-2">
        {#each commonItems as id, i (id)}
          <li>
            <RegularItem
              item={$root.items[id] as Staple}
              toggleInCart={() => root?.change(doc => toggleInCart(doc, id))}
              deleteItem={() => root?.change(doc => deleteItem(doc, id))}
              updateText={(text) => root?.change(doc => updateItemText(doc, id, text))}
              onMoveRequest={() => { movingStapleId = id; moveDrawerOpen = true; }}
            />
          </li>
        {/each}
      </ul>
    {/key}
    <Drawer.Root bind:open={moveDrawerOpen}>
      <Drawer.Content>
        <div class="mx-auto mb-4 w-full max-w-sm">
          <Drawer.Header>
            <Drawer.Title>Move to list</Drawer.Title>
            <Drawer.Description>Choose a special list to move this staple to</Drawer.Description>
          </Drawer.Header>
          <div class="flex flex-col gap-2 p-4">
            {#each moveTargets() as list}
              <Button variant="outline" onclick={() => moveStapleTo(list.id)}>{list.name}</Button>
            {/each}
            <Button variant="ghost" onclick={() => { moveDrawerOpen = false; movingStapleId = null; }}>Cancel</Button>
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  {:else}
    <div class="text-slate-400 italic">No common items yet</div>
  {/if}
</div>
