<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import type { Item } from '$src/lib/core/types'
  import CircleX from 'lucide-svelte/icons/circle-x'
  import ShoppingBasket from 'lucide-svelte/icons/shopping-basket'
  import { isRare } from '$src/lib/core/types'

  interface Props {
    i: number
    itemId: string
    item: Item
    togglePurchased: () => void
    deleteCartItem: () => void
    onEdit?: (id: string) => void
  }
  let { i, itemId, item, togglePurchased, deleteCartItem, onEdit }: Props = $props()

  let checkboxId = $derived(`cart-item-${itemId}`)
</script>

<li class="mb-2 flex justify-between items-center">
  <label
    for={checkboxId}
    class="item.purchased flex w-full items-center gap-2 leading-8"
    class:line-through={item.purchased}
  >
    <Checkbox
      id={checkboxId}
      checked={item.purchased}
      onCheckedChange={togglePurchased}
    />
    <span class="flex-1 truncate">{item.text}</span>
  </label>
  <div class="flex items-center gap-1">
    {#if isRare(item) && onEdit}
      <Button
        variant="ghost"
        size="icon"
        class="text-slate-500 hover:bg-slate-100"
        onclick={() => onEdit(itemId)}
        aria-label="Move item"
      >
        <ShoppingBasket class="size-4" />
      </Button>
    {/if}
    <Button
      variant="ghost"
      size="lg"
      class="px-4 text-slate-500 hover:bg-red-100"
      onclick={deleteCartItem}
      aria-label="Remove item"
    >
      <CircleX class="size-4" />
    </Button>
  </div>
</li>
