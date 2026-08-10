<script lang="ts">
  import Header from '$lib/components/header/header.svelte'
  import CreateDrawer from '$lib/components/create-drawer.svelte'
  import RemoveDrawer from '$lib/components/remove-drawer.svelte'
  import PwaBadge from '$lib/components/pwa-badge.svelte'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import AppSidebar from '$lib/components/app-sidebar.svelte'

  import Main from './pages/main.svelte'
  import Settings from './pages/settings.svelte'
  import ListPage from './pages/list.svelte'
  import Common from './pages/staples.svelte'

  import { router } from '$stores/router'
  import { openPage } from '@nanostores/router'

  import { getNotebookUrl, getRepo, persistedNotebookUrl } from '$src/lib/core/repo'
  import {
    document,
    type AutomergeDocumentStore
  } from '@automerge/automerge-repo-svelte-store'
  import { type Notebook } from '$src/lib/core/types'
  import type { AutomergeUrl } from '@automerge/automerge-repo'
  import { nanoid } from 'nanoid'
  import { createList, deleteList } from '$src/lib/core'

  let notebookUrl = $state<AutomergeUrl | null>(null)
  let root = $state<AutomergeDocumentStore<Notebook> | null>(null)

  async function loadNotebook() {
    const url = await getNotebookUrl()
    if (!url) return
    try {
      root = await document<Notebook>(url, getRepo())
      notebookUrl = url
    } catch (err) {
    console.error('Failed to load', url, err)
  }

}

  $effect(() => {
    loadNotebook().catch((err: unknown) => {
      console.error('Load Notebook Document:', err)
    })
  })

  $effect.root(() => {
    if (root) {
      root.subscribe(() => {})
    }
  })

  function onRemove(id: string) {
    root?.change(doc => {
      deleteList(doc, id)
    })
  }

  function onCreate(name: string): string {
    if (!root) {
      throw Error('unreachable')
    }

    const id = nanoid()
    root.change(doc => {
      createList(doc, id, name)
    })
    return id
  }

  async function setNotebookId(newNotebookUrl: AutomergeUrl): Promise<null | string> {
    try {
      await getRepo().find(newNotebookUrl, {
        allowableStates: ['ready']
      })

      notebookUrl = newNotebookUrl
      persistedNotebookUrl.set(newNotebookUrl)
      // openPage(router, 'main')

      return null
    } catch (err: unknown) {
      return `Error: ${(err as Error).message || 'Something went wrong'}`
    }
  }
    // Read the sidebar cookie so open state persists across page loads
  function getInitialSidebarOpen(): boolean {
    if (typeof window === 'undefined') return true
    const match = window.document.cookie.match(/sidebar:state=([^;]+)/)
    return match ? match[1] === 'true' : true
  }

  let sidebarOpen = $state(getInitialSidebarOpen())

  $inspect($router)
</script>

<Sidebar.Provider bind:open={sidebarOpen} class="pt-safe">
  <AppSidebar notebook={root} />

    <Sidebar.Inset class="touch-pan-y pb-24 min-w-0 overflow-x-hidden">
      <Header />

      {#if $root}
        {#if !$router}
          <Main {root} />
        {:else if $router.route === 'list'}
          <ListPage {root} listId={$router.params.id} />
        {:else if $router.route === 'staples'}
          <Common {root} />
        {:else if $router.route === 'settings'}
          <Settings {setNotebookId} />
        {:else}
          <Main {root} />
        {/if}

        <RemoveDrawer {onRemove} />
        <CreateDrawer {onCreate} />
        <div
          class="z-1 fixed bottom-0 left-0 h-20 w-full bg-gradient-to-t from-background"
        ></div>
    {/if}

    <PwaBadge />
  </Sidebar.Inset>
</Sidebar.Provider>
