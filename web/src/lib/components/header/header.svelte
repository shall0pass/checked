<script lang="ts">
  import { buttonVariants } from '$lib/components/ui/button/button.svelte'
  import SidebarTrigger from '../ui/sidebar/sidebar-trigger.svelte'
  import { getRootDocLinks, persistedRootUrl } from '$src/lib/core/repo'

  const date = new Date()
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    });
  
  const activeLink = getRootDocLinks().find(
    link => link.url == $persistedRootUrl
  )

  const title = activeLink?.name ?? 'default'
  
</script>

<header class="border-b p-2">
  <div class="grid grid-cols-3">
    <SidebarTrigger
      class="justify-self-start {buttonVariants({
        variant: 'ghost',
        size: 'icon'
      })} [&_svg]:size-5"
    />

    <h1 class="justify-self-center text-4xl font-extrabold tracking-tight">
      { title }
    </h1>
  </div>
</header>
