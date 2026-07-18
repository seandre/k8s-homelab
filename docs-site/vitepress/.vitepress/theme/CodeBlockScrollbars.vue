<script setup>
import {onBeforeUnmount, onMounted} from 'vue';

const codeScrollerSelector = [
  '.vp-doc div[class*="language-"]',
  '.vp-doc [class*="language-"] pre',
  '.vp-code-group .tabs',
].join(', ');

const fadeTimers = new Map();

function handleCodeScroll(event) {
  const scroller = event.target;

  if (!(scroller instanceof HTMLElement)
    || !scroller.matches(codeScrollerSelector)
    || scroller.scrollWidth <= scroller.clientWidth) {
    return;
  }

  scroller.classList.add('is-code-scrolling');
  window.clearTimeout(fadeTimers.get(scroller));

  const fadeTimer = window.setTimeout(() => {
    scroller.classList.remove('is-code-scrolling');
    fadeTimers.delete(scroller);
  }, 700);

  fadeTimers.set(scroller, fadeTimer);
}

onMounted(() => document.addEventListener('scroll', handleCodeScroll, true));

onBeforeUnmount(() => {
  document.removeEventListener('scroll', handleCodeScroll, true);
  fadeTimers.forEach((fadeTimer, scroller) => {
    window.clearTimeout(fadeTimer);
    scroller.classList.remove('is-code-scrolling');
  });
  fadeTimers.clear();
});
</script>

<template></template>
