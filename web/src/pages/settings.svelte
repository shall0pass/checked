<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import Input from '$lib/components/ui/input/input.svelte'
  import { Label } from '$lib/components/ui/label'
  import * as Drawer from '$lib/components/ui/drawer'
  import { Share, Undo2, Check, Trash2, Download, Upload, Pencil } from 'lucide-svelte'

  import { toast } from 'svelte-sonner'
  import { useRegisterSW } from 'virtual:pwa-register/svelte'

  import {
    createRootDoc,
    persistedRootUrl,
    syncServerUrl,
    addRootDocLink,
    getRootDocLinks,
    removeRootDocLink,
    replaceRootDocLinks,
    upsertRootDocLink,
    ensureDefaultRootDocLink,
    // setRootDocLinks, (not exported)
    type RootDocLink
  } from '$src/lib/core/repo'
  import {
    highlightColor,
    themePreference,
    type ThemePreference
  } from '$src/stores/theme'
  import { tick } from 'svelte'
  import type { AutomergeUrl } from '@automerge/automerge-repo'
  import { addAutomergePrefix } from '$src/utils'

  type SavePickerWindow = Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string
      types?: Array<{
        description?: string
        accept: Record<string, string[]>
      }>
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: string) => Promise<void>
        close: () => Promise<void>
      }>
    }>
  }

  type OpenPickerWindow = Window & {
    showOpenFilePicker?: (options?: {
      multiple?: boolean
      types?: Array<{
        description?: string
        accept: Record<string, string[]>
      }>
    }) => Promise<Array<{ getFile: () => Promise<File> }>>
  }

  const { needRefresh, updateServiceWorker } = useRegisterSW({})

  interface Props {
    setRootId: (newId: AutomergeUrl) => Promise<null | string>
  }
  const { setRootId }: Props = $props()

  function normalizeColorForPicker(value: string): string {
    const trimmed = value.trim()
    const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`

    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      return normalized.toLowerCase()
    }

    if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
      const r = normalized[1]
      const g = normalized[2]
      const b = normalized[3]
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }

    return '#2563eb'
  }

  let version = $state(__APP_VERSION__)
  let buildTime = $state(__BUILD_TIME__)
  let theme = $state<ThemePreference>($themePreference)
  let highlight = $state(normalizeColorForPicker($highlightColor))
  let url = $state($syncServerUrl)
  let rootName = $state('default')
  let newRootId = $state($persistedRootUrl)
  let savedRootLinks = $state<RootDocLink[]>([])
  let confirmingDeleteKey = $state<string | null>(null)
  let deleteResetTimer: ReturnType<typeof setTimeout> | null = null
  let isRenameDrawerOpen = $state(false)
  let isExportDrawerOpen = $state(false)
  let renamingLinkUrl = $state<AutomergeUrl | null>(null)
  let renameNotebookValue = $state('')
  let selectedExportKeys = $state<string[]>([])
  let isShareDisabled = $derived(!newRootId)
  let isUpdateDisabled = $derived(!newRootId || newRootId === $persistedRootUrl)

  $effect(() => {
    const links = ensureDefaultRootDocLink($persistedRootUrl)
    savedRootLinks = links

    const activeLink = links.find(link => link.url === $persistedRootUrl)
    if (activeLink) {
      rootName = activeLink.name
    }
  })

  $effect(() => {
    $themePreference = theme
  })

  $effect(() => {
    const normalizedHighlight = normalizeColorForPicker(highlight)
    if (normalizedHighlight !== highlight) {
      highlight = normalizedHighlight
      return
    }

    $highlightColor = normalizedHighlight
  })

  $effect(() => {
    const normalizedStoreHighlight = normalizeColorForPicker($highlightColor)
    if (normalizedStoreHighlight !== highlight) {
      highlight = normalizedStoreHighlight
    }
  })

  async function checkForUpdates() {
    if ($needRefresh) {
      toast('New update available!', {
        position: 'bottom-center',
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: 'Update Now',
          onClick: () => {
            updateServiceWorker()
          }
        },
        cancel: {
          label: 'Later'
        }
      })
    } else {
      toast('App is up to date.', {
        position: 'bottom-center',
        cancel: {
          label: 'OK'
        }
      })
    }
  }

  function save() {
    $syncServerUrl = url
    toast.success('The new sync server URL has been saved', {
      description: `Use the same one on another peer`
    })
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({
        text: $persistedRootUrl
      })
    } else {
      await navigator.clipboard.writeText($persistedRootUrl)
      toast.success('List ID has been copied to clipboard', {
        description: 'Send it to your friend'
      })
    }
  }
  
  function generateRandomListName(): string {
    const adjectives = [
      'Ancient',
      'Amber',
      'Astral',
      'Bold',
      'Brave',
      'Bright',
      'Breezy',
      'Calm',
      'Clever',
      'Cloudy',
      'Cozy',
      'Crimson',
      'Curious',
      'Daring',
      'Dazzling',
      'Deep',
      'Delightful',
      'Dreamy',
      'Eager',
      'Electric',
      'Emerald',
      'Epic',
      'Fair',
      'Fearless',
      'Flying',
      'Friendly',
      'Frozen',
      'Gentle',
      'Golden',
      'Grand',
      'Hidden',
      'Hollow',
      'Humble',
      'Icy',
      'Infinite',
      'Ivory',
      'Jolly',
      'Joyful',
      'Kind',
      'Lively',
      'Lonely',
      'Lucky',
      'Lunar',
      'Magic',
      'Majestic',
      'Mellow',
      'Midnight',
      'Mighty',
      'Misty',
      'Modern',
      'Moonlit',
      'Mystic',
      'Noble',
      'Northern',
      'Oceanic',
      'Optimistic',
      'Peaceful',
      'Playful',
      'Polished',
      'Proud',
      'Purple',
      'Quiet',
      'Radiant',
      'Rapid',
      'Rare',
      'Restless',
      'Rising',
      'Royal',
      'Rustic',
      'Sapphire',
      'Scarlet',
      'Secret',
      'Serene',
      'Shining',
      'Silent',
      'Silver',
      'Sleeping',
      'Smart',
      'Snowy',
      'Solar',
      'Southern',
      'Sparkling',
      'Speedy',
      'Spirited',
      'Starry',
      'Steady',
      'Stormy',
      'Sunny',
      'Swift',
      'Thunderous',
      'Timeless',
      'Traveling',
      'Tranquil',
      'Verdant',
      'Vibrant',
      'Vivid',
      'Wandering',
      'Warm',
      'Whispering',
      'Wild',
      'Wise',
      'Wonderous',
      'Young',
      'Zealous'
    ]

    const nouns = [
      'Anchor',
      'Arbor',
      'Arrow',
      'Aurora',
      'Badger',
      'Beacon',
      'Bear',
      'Bird',
      'Blossom',
      'Brook',
      'Cabin',
      'Canyon',
      'Castle',
      'Cedar',
      'Cherry',
      'Cloud',
      'Coast',
      'Comet',
      'Compass',
      'Coral',
      'Creek',
      'Crown',
      'Dawn',
      'Desert',
      'Diamond',
      'Dolphin',
      'Dragon',
      'Dream',
      'Eagle',
      'Echo',
      'Falcon',
      'Feather',
      'Fern',
      'Field',
      'Firefly',
      'Flower',
      'Forest',
      'Fox',
      'Frog',
      'Garden',
      'Gazelle',
      'Glade',
      'Glen',
      'Harbor',
      'Hawk',
      'Hedgehog',
      'Heron',
      'Hill',
      'Horizon',
      'Journey',
      'Juniper',
      'Kingfisher',
      'Knoll',
      'Lake',
      'Lantern',
      'Leaf',
      'Lighthouse',
      'Lion',
      'Lotus',
      'Maple',
      'Marsh',
      'Meadow',
      'Meteor',
      'Mist',
      'Moon',
      'Mountain',
      'Nest',
      'Nightingale',
      'Ocean',
      'Oasis',
      'Oak',
      'Otter',
      'Owl',
      'Panda',
      'Path',
      'Peak',
      'Pebble',
      'Pine',
      'Planet',
      'Prairie',
      'Quest',
      'Rabbit',
      'Rain',
      'Raven',
      'Reef',
      'River',
      'Robin',
      'Rose',
      'Sailboat',
      'Sequoia',
      'Shadow',
      'Shelter',
      'Shore',
      'Sky',
      'Snowflake',
      'Song',
      'Sparrow',
      'Spring',
      'Star',
      'Stone',
      'Stream',
      'Summit',
      'Sunrise',
      'Sunset',
      'Swan',
      'Temple',
      'Thunder',
      'Tiger',
      'Trail',
      'Tree',
      'Valley',
      'Voyage',
      'Waterfall',
      'Wave',
      'Whale',
      'Willow',
      'Wind',
      'Wolf',
      'Woodland',
      'Wren'
    ]

    const adjective =
      adjectives[Math.floor(Math.random() * adjectives.length)]

    const noun =
      nouns[Math.floor(Math.random() * nouns.length)]

    return `${adjective} ${noun}`
  }

  function createNewList() {
    newRootId = createRootDoc()

    const randomName = generateRandomListName()

    rootName = randomName

    toast.success('Created a new list ID', {
      description: 'Save or activate it to start using the new Automerge list'
    })
  }

  async function updateRootDoc() {
    let loadingToast = toast.loading('Wait...', { position: 'bottom-center' })

    // Uncomment the line below to test the toast
    // await new Promise(resolve => setTimeout(resolve, 2000))

    const normalizedRootId = normalizeAutomergeUrl(newRootId)
    if (!normalizedRootId) {
      toast.error('Please enter a valid Automerge list ID or URL', {
        id: loadingToast
      })
      return
    }

    const error = await setRootId(normalizedRootId)
    if (error != null) {
      toast.error(error, { id: loadingToast })
    } else {
      upsertRootDocLink(rootName, normalizedRootId)
      savedRootLinks = ensureDefaultRootDocLink(normalizedRootId)
      newRootId = normalizedRootId
      toast.success('Root document has been changed', { id: loadingToast })
    }

    await tick()
  }

  function normalizeAutomergeUrl(value: string): AutomergeUrl | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('automerge:')) return trimmed as AutomergeUrl
    return addAutomergePrefix(trimmed)
  }

  async function saveRootLink() {
    const normalizedRootId = normalizeAutomergeUrl(newRootId)
    if (!normalizedRootId) {
      toast.error('Please enter a valid Automerge list ID or URL')
      return
    }

    const trimmedName = rootName.trim() || 'Unnamed list'
    addRootDocLink(trimmedName, normalizedRootId)
    savedRootLinks = getRootDocLinks()
    newRootId = normalizedRootId
    toast.success('Saved list link', {
      description: `"${trimmedName}" is available in collaboration links`
    })

    await tick()
    window.location.reload()
  }

  async function activateRootLink(link: RootDocLink) {
    const loadingToast = toast.loading('Switching list...', {
      position: 'bottom-center'
    })

    const error = await setRootId(link.url)
    if (error != null) {
      toast.error(error, { id: loadingToast })
      return
    }

    rootName = link.name
    newRootId = link.url
    savedRootLinks = ensureDefaultRootDocLink(link.url)
    toast.success(`Now using "${link.name}"`, { id: loadingToast })

    await tick()
    window.location.reload()
  }

  function renameRootLink(link: RootDocLink) {
    if (isDefaultLink(link)) {
      return
    }

    renamingLinkUrl = link.url
    renameNotebookValue = link.name
    isRenameDrawerOpen = true
  }

  function getUniqueNotebookName(baseNameInput: string, targetUrl: AutomergeUrl): string {
    const baseName = baseNameInput.trim() || 'Unnamed list'
    const usedNames = new Set(
      savedRootLinks
        .filter(savedLink => savedLink.url !== targetUrl)
        .map(savedLink => savedLink.name.trim().toLowerCase())
        .filter(Boolean)
    )

    if (!usedNames.has(baseName.toLowerCase())) {
      return baseName
    }

    let suffix = 1
    let nextName = `${baseName}-${suffix}`
    while (usedNames.has(nextName.toLowerCase())) {
      suffix += 1
      nextName = `${baseName}-${suffix}`
    }

    return nextName
  }

  async function submitRenameRootLink() {
    if (!renamingLinkUrl) {
      return
    }

    const nextName = getUniqueNotebookName(renameNotebookValue, renamingLinkUrl)
    upsertRootDocLink(nextName, renamingLinkUrl)
    savedRootLinks = getRootDocLinks()

    if (renamingLinkUrl === $persistedRootUrl) {
      rootName = nextName
    }

    toast.success(`Renamed notebook to "${nextName}"`)
    isRenameDrawerOpen = false
    renamingLinkUrl = null
    renameNotebookValue = ''

    await tick()
  }

  function closeRenameDrawer() {
    isRenameDrawerOpen = false
    renamingLinkUrl = null
    renameNotebookValue = ''
  }

  function handleRenameInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      submitRenameRootLink()
    }
  }

  function getSavedListKey(link: RootDocLink, index: number): string {
    return `${link.url}:${link.name}:${index}`
  }

  function isDefaultLink(link: RootDocLink): boolean {
    return link.name.trim().toLowerCase() === 'default'
  }

  let sortedRootLinks = $derived.by(() => {
    const defaultLinks = savedRootLinks.filter(isDefaultLink)
    const otherLinks = savedRootLinks.filter(link => !isDefaultLink(link))
    return [...defaultLinks, ...otherLinks]
  })

  async function handleDeleteSavedLink(link: RootDocLink, index: number) {
    if (isDefaultLink(link)) {
      return
    }

    const key = getSavedListKey(link, index)
    if (confirmingDeleteKey === key) {
      confirmingDeleteKey = null
      if (deleteResetTimer) clearTimeout(deleteResetTimer)

      const deletingActiveLink = link.url === $persistedRootUrl
      if (deletingActiveLink) {
        const defaultLink = getRootDocLinks().find(savedLink => isDefaultLink(savedLink))
        if (!defaultLink) {
          toast.error('Default list link is missing and cannot be activated')
          return
        }

        const switchError = await setRootId(defaultLink.url)
        if (switchError != null) {
          toast.error(switchError)
          return
        }

        rootName = defaultLink.name
        newRootId = defaultLink.url
      }

      savedRootLinks = removeRootDocLink(link.name, link.url)
      savedRootLinks = getRootDocLinks()
      toast.success(`Removed "${link.name}" from saved lists`)

      await tick()
      window.location.reload()
      return
    }

    confirmingDeleteKey = key
    if (deleteResetTimer) clearTimeout(deleteResetTimer)
    deleteResetTimer = setTimeout(() => {
      confirmingDeleteKey = null
    }, 3000)
  }

  function openExportDrawer() {
    selectedExportKeys = sortedRootLinks.map((link, index) => getSavedListKey(link, index))
    isExportDrawerOpen = true
  }

  function closeExportDrawer() {
    isExportDrawerOpen = false
    selectedExportKeys = []
  }

  function updateExportSelection(key: string, checked: boolean) {
    if (checked) {
      if (!selectedExportKeys.includes(key)) {
        selectedExportKeys = [...selectedExportKeys, key]
      }
      return
    }

    selectedExportKeys = selectedExportKeys.filter(existingKey => existingKey !== key)
  }

  function getSelectedExportLinks(): RootDocLink[] {
    return sortedRootLinks.filter((link, index) =>
      selectedExportKeys.includes(getSavedListKey(link, index))
    )
  }

  async function submitExportSelection() {
    const selectedLinks = getSelectedExportLinks()
    if (selectedLinks.length === 0) {
      toast.error('Select at least one notebook to export')
      return
    }

    await exportListMap(selectedLinks)
    closeExportDrawer()
  }

  async function exportListMap(linksToExport: RootDocLink[] = getRootDocLinks()) {
    const payload = {
      syncServerUrl: $syncServerUrl,
      listMap: linksToExport
    }

    const fileName = 'checked-library-map.json'
    const contents = JSON.stringify(payload, null, 2)

    try {
      const win = window as SavePickerWindow
      if (typeof win.showSaveFilePicker === 'function') {
        const handle = await win.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'JSON Files',
              accept: {
                'application/json': ['.json']
              }
            }
          ]
        })

        const writable = await handle.createWritable()
        await writable.write(contents)
        await writable.close()
      } else {
        const blob = new Blob([contents], { type: 'application/json' })
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = fileName
        link.click()
        URL.revokeObjectURL(blobUrl)
      }

      toast.success('Library exported successfully')
    } catch (error: unknown) {
      if ((error as DOMException)?.name === 'AbortError') {
        return
      }

      toast.error(`Library export failed: ${(error as Error)?.message || 'Unknown error'}`)
    }
  }

  async function importListMap() {
    try {
      const contents = await selectImportFileContents()
      if (!contents) {
        return
      }

      const parsed = JSON.parse(contents) as {
        syncServerUrl?: unknown
        listMap?: unknown
        savedLists?: unknown
      }

      if (typeof parsed.syncServerUrl !== 'string') {
        throw new Error('Backup is missing a valid syncServerUrl')
      }

      const importedRawLinks = Array.isArray(parsed.listMap)
        ? parsed.listMap
        : parsed.savedLists

      if (!Array.isArray(importedRawLinks)) {
        throw new Error('Backup is missing a valid library array')
      }

      const importedLinks = importedRawLinks.filter(
        (link): link is RootDocLink =>
          Boolean(link) &&
          typeof link === 'object' &&
          typeof link.name === 'string' &&
          typeof link.url === 'string' &&
          link.url.startsWith('automerge:')
      )


      url = parsed.syncServerUrl
      $syncServerUrl = parsed.syncServerUrl
      // Ensure repo uses the new sync server before opening documents
      import('$src/lib/core/repo').then(mod => {
        mod.setRepoSyncServerUrl(parsed.syncServerUrl as string)
      })

      // Merge imported links with existing, skipping duplicates by url and de-duplicating names.
      const existingLinks = getRootDocLinks()
      const mergedLinks = [...existingLinks]
      const usedNames = new Set(
        existingLinks.map(link => link.name.trim().toLowerCase()).filter(Boolean)
      )

      function getUniqueImportedName(name: string): string {
        const baseName = name.trim() || 'Unnamed list'
        const normalizedBaseName = baseName.toLowerCase()

        if (!usedNames.has(normalizedBaseName)) {
          usedNames.add(normalizedBaseName)
          return baseName
        }

        let suffix = 1
        while (usedNames.has(`${normalizedBaseName}-${suffix}`)) {
          suffix += 1
        }

        const uniqueName = `${baseName}-${suffix}`
        usedNames.add(uniqueName.toLowerCase())
        return uniqueName
      }

      for (const imported of importedLinks) {
        if (!existingLinks.some(link => link.url === imported.url)) {
          mergedLinks.push({
            ...imported,
            name: getUniqueImportedName(imported.name)
          })
        }
      }
      savedRootLinks = replaceRootDocLinks(mergedLinks)
      savedRootLinks = ensureDefaultRootDocLink($persistedRootUrl)

      let activeLink = savedRootLinks.find(link => link.url === $persistedRootUrl)
      if (!activeLink && savedRootLinks.length > 0) {
        // Fallback: activate the first imported list
        activeLink = savedRootLinks[0]
        rootName = activeLink.name
        newRootId = activeLink.url
        $persistedRootUrl = activeLink.url
        toast('Activated first imported list as fallback', { position: 'bottom-center' })
      } else if (activeLink) {
        rootName = activeLink.name
        newRootId = activeLink.url
      } else {
        toast.error('No valid list could be activated after import')
        return
      }

      toast.success('Library imported successfully')
    } catch (error: unknown) {
      if ((error as DOMException)?.name === 'AbortError') {
        return
      }

      toast.error(`Library import failed: ${(error as Error)?.message || 'Unknown error'}`)
    }
  }

  async function selectImportFileContents(): Promise<string | null> {
    const win = window as OpenPickerWindow
    if (typeof win.showOpenFilePicker === 'function') {
      const [handle] = await win.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'JSON Files',
            accept: {
              'application/json': ['.json']
            }
          }
        ]
      })

      const file = await handle.getFile()
      return file.text()
    }

    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'

      input.onchange = async () => {
        try {
          const file = input.files?.[0]
          if (!file) {
            resolve(null)
            return
          }

          resolve(await file.text())
        } catch (error) {
          reject(error)
        }
      }

      input.click()
    })
  }

  $effect(() => {
    return () => {
      if (deleteResetTimer) clearTimeout(deleteResetTimer)
    }
  })
</script>

<main class="container max-w-2xl px-4 pt-2">
  <section class="space-y-6">
    <h1 class="text-3xl font-bold">Settings</h1>

    <section class="rounded-lg border p-4">
      <h2 class="mb-3 text-xl font-semibold">About</h2>

      <dl class="space-y-2">
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Version:</dt>
          <dd class="text-foreground">{version}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Build Date:</dt>
          <dd class="text-foreground">{buildTime}</dd>
        </div>
      </dl>

      <Button onclick={checkForUpdates} class="mt-3 w-full"
        >Check for Updates</Button
      >
    </section>

    <section class="rounded-lg border p-4">
      <h2 class="mb-3 text-xl font-semibold">Hosting</h2>

      <Label for="url">Sync Server URL</Label>
      <Input
        type="url"
        id="url"
        placeholder="wss://my-super-server"
        bind:value={url}
      />

      <Button class="mt-3 w-full" onclick={save}>Save</Button>
    </section>

    <section class="rounded-lg border p-4">
      <h2 class="mb-3 text-xl font-semibold">Appearance</h2>

      <div class="grid grid-cols-3 gap-2">
        <Button
          variant={theme === 'light' ? 'default' : 'outline'}
          onclick={() => (theme = 'light')}>Light</Button
        >
        <Button
          variant={theme === 'dark' ? 'default' : 'outline'}
          onclick={() => (theme = 'dark')}>Dark</Button
        >
        <Button
          variant={theme === 'system' ? 'default' : 'outline'}
          onclick={() => (theme = 'system')}>System</Button
        >
      </div>

      <div class="mt-4 flex items-center justify-between gap-3 rounded-md border p-3">
        <div>
          <p class="text-sm font-medium">Highlight color</p>
          <p class="text-xs text-muted-foreground">Used for primary accents and focus ring</p>
        </div>
        <Input
          type="color"
          bind:value={highlight}
          class="h-10 w-16 cursor-pointer rounded-md p-1"
          aria-label="Highlight color"
        />
      </div>

    </section>

    <section class="rounded-lg border p-4">
      <h2 class="mb-3 text-xl font-semibold">Collaboration</h2>

      <Label for="rootname">List Name</Label>
      <Input
        type="text"
        id="rootname"
        placeholder="default"
        bind:value={rootName}
      />

      <Label for="rootdocid" class="mt-3 block">ID (rootdocID)</Label>
      <Input
        type="text"
        id="rootdocid"
        placeholder="..."
        bind:value={newRootId}
      />
      <Button
        variant="secondary"
        class="mt-3 w-full"
        onclick={saveRootLink}>Save Link</Button
      >
      <Button
        variant="secondary"
        class="mt-3 w-full"
        onclick={() => (newRootId = $persistedRootUrl)}><Undo2 />Reset</Button
      >
      <Button
        variant="secondary"
        class="mt-3 w-full"
        onclick={createNewList}>Create New List</Button
      >
      <Button
        variant="secondary"
        class="mt-3 w-full"
        disabled={isShareDisabled}
        onclick={share}><Share />Copy & Share</Button
      >
      <Button
        disabled={isUpdateDisabled}
        class="mt-3 w-full"
        onclick={updateRootDoc}><Check />Activate Entered List</Button
      >

      <div class="mt-4 space-y-2">
        <p class="text-sm font-medium">Notebooks</p>
        {#if savedRootLinks.length === 0}
          <p class="text-muted-foreground text-sm">No saved notebooks yet</p>
        {:else}
          {#each sortedRootLinks as link, index (getSavedListKey(link, index))}
            <div
              class={`flex items-center justify-between gap-2 rounded-md border p-2 ${link.url === $persistedRootUrl
                ? 'border-primary bg-primary/10'
                : ''}`}
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">{link.name}</p>
                <p class="text-muted-foreground truncate text-xs">{link.url}</p>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant={link.url === $persistedRootUrl ? 'default' : 'outline'}
                  onclick={() => activateRootLink(link)}
                  >{link.url === $persistedRootUrl ? 'Active' : 'Use'}</Button
                >
                {#if !isDefaultLink(link)}
                  <button
                    class="rounded-md border px-3 py-2 text-slate-500 transition-colors duration-200 hover:text-slate-800"
                    aria-label={`Rename saved list ${link.name}`}
                    onclick={() => renameRootLink(link)}
                  >
                    <Pencil class="size-4" />
                  </button>
                {/if}
                {#if !isDefaultLink(link)}
                  <button
                    class={`relative overflow-hidden rounded-md border px-3 py-2 transition-colors duration-200 ${confirmingDeleteKey ===
                    getSavedListKey(link, index)
                      ? 'border-red-500 text-white'
                      : 'text-slate-500'}`}
                    aria-label={`Delete saved list ${link.name}`}
                    onclick={() => handleDeleteSavedLink(link, index)}
                  >
                    <span
                      class="absolute inset-0 bg-red-500 transition-transform duration-200 ease-out"
                      style:transform={confirmingDeleteKey === getSavedListKey(link, index)
                        ? 'translateX(0)'
                        : 'translateX(100%)'}
                    ></span>
                    <Trash2
                      class={`relative z-10 size-4 transition-colors duration-200 ${confirmingDeleteKey ===
                      getSavedListKey(link, index)
                        ? 'text-white'
                        : 'text-slate-500'}`}
                    />
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Button class="w-full" variant="secondary" onclick={importListMap}
        ><Upload />Import Library</Button
      >
      <Button class="w-full" variant="secondary" onclick={openExportDrawer}
        ><Download />Export Library</Button
      >
    </div>

    <Drawer.Root bind:open={isExportDrawerOpen}>
      <Drawer.Content>
        <div class="mx-auto mb-4 w-full max-w-sm">
          <Drawer.Header>
            <Drawer.Title class="mb-2">Export Library</Drawer.Title>
            <Drawer.Description>Select notebooks to include</Drawer.Description>
          </Drawer.Header>

          <div class="flex max-h-80 flex-col gap-3 overflow-y-auto p-4">
            {#if sortedRootLinks.length === 0}
              <p class="text-muted-foreground text-sm">No notebooks available to export</p>
            {:else}
              {#each sortedRootLinks as link, index (getSavedListKey(link, index))}
                {@const exportKey = getSavedListKey(link, index)}
                {@const checkboxId = `export-notebook-${index}`}
                <label
                  for={checkboxId}
                  class="flex items-start gap-3 rounded-md border p-3"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={selectedExportKeys.includes(exportKey)}
                    onCheckedChange={(checked) => updateExportSelection(exportKey, Boolean(checked))}
                  />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium">{link.name}</span>
                    <span class="text-muted-foreground block truncate text-xs">{link.url}</span>
                  </span>
                </label>
              {/each}
            {/if}

            <div class="grid grid-cols-2 gap-2 pt-1">
              <Button variant="secondary" onclick={closeExportDrawer}>Cancel</Button>
              <Button onclick={submitExportSelection}>Export Selected</Button>
            </div>
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>

    <Drawer.Root bind:open={isRenameDrawerOpen}>
      <Drawer.Content>
        <div class="mx-auto mb-4 w-full max-w-sm">
          <Drawer.Header>
            <Drawer.Title class="mb-2">Rename Notebook</Drawer.Title>
            <Drawer.Description>Enter a notebook name</Drawer.Description>
          </Drawer.Header>

          <div class="flex flex-col gap-3 p-4">
            <Input
              type="text"
              class="text-md"
              bind:value={renameNotebookValue}
              onkeydown={handleRenameInputKeydown}
            />

            <div class="grid grid-cols-2 gap-2">
              <Button variant="secondary" onclick={closeRenameDrawer}>Cancel</Button>
              <Button onclick={submitRenameRootLink}>Save</Button>
            </div>
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  </section>
</main>
