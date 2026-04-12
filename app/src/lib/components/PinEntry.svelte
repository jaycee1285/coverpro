<script lang="ts">
  import { verifyPin, isLocked, getRemainingLockoutTime, getFailedAttempts } from '$lib/utils/security';
  import { onMount, onDestroy } from 'svelte';

  let { onUnlock }: { onUnlock: () => void } = $props();

  let pin = $state('');
  let error = $state('');
  let locked = $state(false);
  let remainingSeconds = $state(0);
  let intervalId: number | null = null;
  let pinInputEl: HTMLInputElement | null = null;

  function updateLockStatus() {
    locked = isLocked();
    if (locked) {
      const remaining = getRemainingLockoutTime();
      remainingSeconds = Math.ceil(remaining / 1000);
    } else {
      remainingSeconds = 0;
    }
  }

  onMount(() => {
    updateLockStatus();
    if (!locked) {
      pinInputEl?.focus();
    }

    // Update lockout timer every 100ms for smooth countdown
    intervalId = window.setInterval(() => {
      updateLockStatus();
    }, 100);
  });

  onDestroy(() => {
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
  });

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    // Only allow digits
    pin = input.value.replace(/\D/g, '');
    error = '';
  }

  function handleSubmit(e: Event) {
    e.preventDefault();

    if (locked) {
      return;
    }

    if (pin.length < 4) {
      error = 'PIN must be at least 4 digits';
      return;
    }

    const valid = verifyPin(pin);

    if (valid) {
      onUnlock();
    } else {
      const attempts = getFailedAttempts();
      pin = '';

      if (attempts >= 2) {
        error = 'Too many attempts. Wait 5 seconds.';
        locked = true;
        updateLockStatus();
      } else {
        error = 'Incorrect PIN';
      }
    }
  }

</script>

<div class="pin-overlay">
  <div class="pin-card">
    <div class="pin-header">
      <h1>CoverPro</h1>
      <p>Enter PIN to continue</p>
    </div>

    <form onsubmit={handleSubmit}>
      <div class="pin-input-wrapper">
        <input
          bind:this={pinInputEl}
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          bind:value={pin}
          oninput={handleInput}
          disabled={locked}
          placeholder="Enter PIN"
          maxlength="6"
          aria-label="PIN input"
          aria-invalid={error ? 'true' : 'false'}
          class="pin-input"
          class:error={error}
        />
      </div>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      {#if locked && remainingSeconds > 0}
        <div class="lockout-message">
          Locked for {remainingSeconds} second{remainingSeconds !== 1 ? 's' : ''}
        </div>
      {/if}

      <button
        type="submit"
        disabled={locked || pin.length < 4}
        class="unlock-button"
      >
        {locked ? 'Locked' : 'Unlock'}
      </button>
    </form>
  </div>
</div>

<style>
  .pin-overlay {
    position: fixed;
    inset: 0;
    background-color: var(--bg-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .pin-card {
    background-color: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    width: 90%;
    max-width: 400px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .pin-header {
    text-align: center;
    margin-bottom: var(--space-xl);
  }

  .pin-header h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .pin-header p {
    margin: var(--space-sm) 0 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .pin-input-wrapper {
    margin-bottom: var(--space-md);
  }

  .pin-input {
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    font-size: 1.25rem;
    letter-spacing: 0.25em;
    text-align: center;
    background-color: var(--bg-input);
    color: var(--text-primary);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color 0.2s;
    font-family: 'Mulish', system-ui, -apple-system, sans-serif;
  }

  .pin-input:focus {
    border-color: var(--accent-color);
  }

  .pin-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pin-input.error {
    border-color: rgb(var(--color-error-500));
  }

  .error-message {
    color: rgb(var(--color-error-500));
    font-size: 0.875rem;
    margin-bottom: var(--space-md);
    text-align: center;
  }

  .lockout-message {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: var(--space-md);
    text-align: center;
    font-weight: 500;
  }

  .unlock-button {
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    font-size: 1rem;
    font-weight: 600;
    color: white;
    background-color: var(--accent-color);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.2s;
    font-family: 'Mulish', system-ui, -apple-system, sans-serif;
  }

  .unlock-button:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }

  .unlock-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
