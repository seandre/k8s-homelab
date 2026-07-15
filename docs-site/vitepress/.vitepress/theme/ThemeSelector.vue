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

function handleChange(event) {
  applyMode(event.target.value);
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
  <label class="ThemeSelector" title="Color theme">
    <svg v-if="mode === 'light'" class="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
    <svg v-else-if="mode === 'dark'" class="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z" />
    </svg>
    <svg v-else class="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>

    <select :value="mode" aria-label="Color theme" @change="handleChange">
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="auto">Auto</option>
    </select>

    <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  </label>
</template>

<style scoped>
.ThemeSelector {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  height: 2.25rem;
  margin-left: 0.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
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

.mode-icon {
  position: absolute;
  left: 0.55rem;
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

select {
  width: 5.75rem;
  height: 100%;
  padding: 0 1.5rem 0 1.85rem;
  border: 0;
  outline: 0;
  appearance: none;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}

select option {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-elv);
}

.chevron {
  position: absolute;
  right: 0.5rem;
  width: 0.75rem;
  height: 0.75rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

@media (max-width: 479px) {
  .ThemeSelector {
    margin-left: 0;
  }

  select {
    width: 5.25rem;
  }
}
</style>
