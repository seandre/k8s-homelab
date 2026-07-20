<template>
  <nav class="ProductSwitcher" aria-label="Homelab products">
    <a
      class="product-link is-active"
      href="/"
      aria-current="page"
    >
      <svg class="product-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H6.5A2.5 2.5 0 0 0 4 20.5Z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v18a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 1 2.5 2.5Z" />
      </svg>
      <span>Docs</span>
    </a>
    <a
      class="product-link"
      href="https://home.lab.seandre.dev"
    >
      <svg class="product-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 4h18v16H3z" />
        <path d="m7 9 2 2-2 2M12 15h5" />
      </svg>
      <span>Homepage</span>
    </a>
  </nav>
</template>

<style scoped>
.ProductSwitcher {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  width: 100%;
  margin-bottom: 14px;
  padding: 3px;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.625rem;
  background: var(--vp-c-bg-alt);
  box-shadow: var(--docs-surface-shadow);
}

.product-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-width: 0;
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.4375rem;
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  transition:
    color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.product-link:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-brand-soft);
}

.product-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.product-link.is-active {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-1);
}

.product-icon {
  flex: 0 0 auto;
  width: 0.9375rem;
  height: 0.9375rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  .product-link {
    transition: none;
  }
}
</style>
