<script setup>
import {onBeforeUnmount, onMounted, ref} from 'vue';

const appearanceKey = 'vitepress-theme-appearance';
const validModes = new Set(['light', 'dark', 'auto']);
const mode = ref('auto');

function normalizeMode(value) {
  return validModes.has(value) ? value : 'auto';
}

function applyMode(nextMode) {
  const normalizedMode = normalizeMode(nextMode);
  const previousMode = window.localStorage.getItem(appearanceKey);

  mode.value = normalizedMode;
  window.localStorage.setItem(appearanceKey, normalizedMode);

  // VitePress uses VueUse's storage listener for appearance. Dispatching the
  // same event keeps its internal state in sync and lets `auto` continue to
  // react whenever the operating system preference changes.
  window.dispatchEvent(new StorageEvent('storage', {
    key: appearanceKey,
    oldValue: previousMode,
    newValue: normalizedMode,
    storageArea: window.localStorage,
  }));
}

function handleStorage(event) {
  if (event.key === appearanceKey) {
    mode.value = normalizeMode(event.newValue);
  }
}

onMounted(() => {
  mode.value = normalizeMode(window.localStorage.getItem(appearanceKey));
  window.addEventListener('storage', handleStorage);
});

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorage);
});
</script>

<template>
  <div
    class="ThemeSelector"
    :class="`is-${mode}`"
    role="radiogroup"
    aria-label="Color theme"
  >
    <span class="selection" aria-hidden="true" />

    <button
      type="button"
      class="theme-option"
      :class="{active: mode === 'light'}"
      role="radio"
      :aria-checked="mode === 'light'"
      title="Light theme"
      @click="applyMode('light')"
    >
      <svg class="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </svg>
      <span class="visually-hidden">Light</span>
    </button>

    <button
      type="button"
      class="theme-option"
      :class="{active: mode === 'auto'}"
      role="radio"
      :aria-checked="mode === 'auto'"
      title="Use system theme"
      @click="applyMode('auto')"
    >
      <svg class="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
      <span class="visually-hidden">Auto</span>
    </button>

    <button
      type="button"
      class="theme-option"
      :class="{active: mode === 'dark'}"
      role="radio"
      :aria-checked="mode === 'dark'"
      title="Dark theme"
      @click="applyMode('dark')"
    >
      <svg class="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z" />
      </svg>
      <span class="visually-hidden">Dark</span>
    </button>
  </div>
</template>

<style scoped>
.ThemeSelector {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  width: 6rem;
  height: 2.25rem;
  margin-left: 0.5rem;
  padding: 2px;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  color: var(--vp-c-text-2);
  background: var(--vp-input-bg-color);
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease;
}

.ThemeSelector:hover,
.ThemeSelector:focus-within {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
  background: var(--vp-c-brand-soft);
}

.selection {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  background: var(--vp-c-bg-elv);
  box-shadow: 0 1px 4px rgb(0 0 0 / 18%);
  transition: transform 180ms ease;
}

.is-auto .selection {
  transform: translateX(1.875rem);
}

.is-dark .selection {
  transform: translateX(3.75rem);
}

.theme-option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 1.875rem;
  width: 1.875rem;
  height: 1.875rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: transparent;
  cursor: pointer;
  transition: color 150ms ease;
}

.theme-option:hover,
.theme-option.active {
  color: var(--vp-c-brand-1);
}

.theme-option:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.mode-icon {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 479px) {
  .ThemeSelector {
    margin-left: 0;
  }
}
</style>
