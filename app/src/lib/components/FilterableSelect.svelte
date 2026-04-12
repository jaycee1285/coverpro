<script lang="ts">
  import { tick } from 'svelte';

  export interface FilterSelectOption {
    value: string;
    label: string;
    meta?: string;
    keywords?: string[];
  }

  interface Props {
    id: string;
    label?: string;
    options: FilterSelectOption[];
    selectedValue: string;
    disabled?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    compact?: boolean;
    onChange?: (value: string) => void;
  }

  let {
    id,
    label = '',
    options,
    selectedValue,
    disabled = false,
    placeholder = 'Select an option',
    searchPlaceholder = 'Filter options...',
    emptyMessage = 'No matches',
    compact = false,
    onChange
  }: Props = $props();

  let isOpen = $state(false);
  let search = $state('');
  let container = $state<HTMLDivElement | null>(null);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  const selectedOption = $derived(
    options.find((opt) => opt.value === selectedValue)
  );

  const filteredOptions = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      if (opt.label.toLowerCase().includes(q)) return true;
      if (opt.value.toLowerCase().includes(q)) return true;
      if (opt.meta?.toLowerCase().includes(q)) return true;
      return opt.keywords?.some((word) => word.toLowerCase().includes(q)) ?? false;
    });
  });

  function toggleMenu() {
    if (disabled) return;
    isOpen = !isOpen;
    if (!isOpen) {
      search = '';
    }
  }

  function closeMenu() {
    isOpen = false;
    search = '';
  }

  async function openMenu(): Promise<void> {
    if (disabled) return;
    isOpen = true;
    await tick();
    searchInputEl?.focus();
    searchInputEl?.select();
  }

  function handleSelect(value: string) {
    onChange?.(value);
    closeMenu();
    triggerEl?.focus();
  }

  async function handleTriggerKeyDown(event: KeyboardEvent): Promise<void> {
    if (disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      await openMenu();
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeMenu();
      triggerEl?.focus();
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeMenu();
    triggerEl?.focus();
  }

  $effect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container) return;
      const target = event.target as Node | null;
      if (target && !container.contains(target)) {
        closeMenu();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  $effect(() => {
    if (!isOpen) return;
    void tick().then(() => {
      searchInputEl?.focus();
      searchInputEl?.select();
    });
  });
</script>

<div class="filter-select" class:compact bind:this={container}>
  {#if label}
    <label class="filter-label" for={`${id}-trigger`}>{label}</label>
  {/if}

  <button
    bind:this={triggerEl}
    id={`${id}-trigger`}
    class="filter-trigger"
    type="button"
    disabled={disabled}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-controls={`${id}-menu`}
    aria-label={label || placeholder}
    onclick={toggleMenu}
    onkeydown={handleTriggerKeyDown}
  >
    <span class="trigger-label">{selectedOption?.label ?? placeholder}</span>
    <span class="trigger-chevron" aria-hidden="true">{isOpen ? '^' : 'v'}</span>
  </button>

  {#if isOpen}
    <div id={`${id}-menu`} class="filter-menu" role="listbox" aria-label={label || id}>
      <input
        bind:this={searchInputEl}
        class="filter-input"
        type="text"
        bind:value={search}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        onkeydown={handleSearchKeyDown}
      />

      <div class="option-list">
        {#if filteredOptions.length === 0}
          <div class="empty-state">{emptyMessage}</div>
        {:else}
          {#each filteredOptions as opt}
            <button
              type="button"
              class="option-item"
              class:selected={opt.value === selectedValue}
              role="option"
              aria-selected={opt.value === selectedValue}
              onclick={() => handleSelect(opt.value)}
            >
              <span class="option-label">{opt.label}</span>
              {#if opt.meta}
                <span class="option-meta">{opt.meta}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .filter-select {
    position: relative;
    min-width: 12rem;
  }

  .filter-select.compact {
    min-width: 10rem;
  }

  .filter-label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .filter-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.86rem;
    text-align: left;
  }

  .filter-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .filter-trigger:focus-visible,
  .filter-input:focus-visible,
  .option-item:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: 2px;
  }

  .trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-chevron {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .filter-menu {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    z-index: 30;
    overflow: hidden;
  }

  .filter-input {
    width: calc(100% - 1rem);
    margin: 0.5rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  .option-list {
    max-height: 14rem;
    overflow-y: auto;
    padding: 0.25rem;
  }

  .option-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    padding: 0.55rem 0.65rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .option-item:hover {
    background: var(--bg-hover);
  }

  .option-item.selected {
    background: rgb(var(--color-primary-500) / 0.14);
    color: rgb(var(--color-primary-500));
  }

  .option-meta {
    font-size: 0.74rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .empty-state {
    padding: 0.65rem;
    font-size: 0.82rem;
    color: var(--text-muted);
    text-align: center;
  }

  @media (max-width: 767px) {
    .filter-select,
    .filter-select.compact {
      min-width: 100%;
    }

    .option-item {
      padding-top: 0.65rem;
      padding-bottom: 0.65rem;
    }
  }
</style>
