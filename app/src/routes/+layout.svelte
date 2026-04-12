<script lang="ts">
  import '@fontsource/mulish/400.css';
  import '@fontsource/mulish/500.css';
  import '@fontsource/mulish/600.css';
  import '@fontsource/mulish/700.css';
  import '../app.css';
  import { initTheme, listenForThemeChanges } from '$lib/services/theme';
  import { initSecurity, isUnlocked } from '$lib/utils/security';
  import { detectPlatform, isMobile } from '$lib/utils/platform';
  import PinEntry from '$lib/components/PinEntry.svelte';
  import { onMount } from 'svelte';
  import type { Platform } from '$lib/types';

  let { children } = $props();

  let platform = $state<Platform>('desktop');
  let unlocked = $state(false);
  let ready = $state(false);

  onMount(async () => {
    initTheme();
    listenForThemeChanges();

    // Detect platform
    platform = await detectPlatform();

    // Initialize security
    await initSecurity();

    // Check if PIN is required (mobile only)
    const requiresPin = isMobile(platform);

    if (requiresPin) {
      // Wait for PIN unlock
      unlocked = isUnlocked();
    } else {
      // Desktop - no PIN required
      unlocked = true;
    }

    ready = true;
  });

  function handleUnlock() {
    unlocked = true;
  }
</script>

{#if !ready}
  <!-- Loading state while detecting platform -->
  <div class="app"></div>
{:else if !unlocked}
  <!-- PIN entry gate for mobile -->
  <PinEntry onUnlock={handleUnlock} />
{:else}
  <!-- Main app content -->
  <div class="app">
    {@render children()}
  </div>
{/if}
