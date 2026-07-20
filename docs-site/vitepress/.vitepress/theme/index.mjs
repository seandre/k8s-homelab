import DefaultTheme from 'vitepress/theme';
import {h} from 'vue';
import CodeBlockScrollbars from './CodeBlockScrollbars.vue';
import NavigationScrollSync from './NavigationScrollSync.vue';
import ProductSwitcher from './ProductSwitcher.vue';
import ThemeSelector from './ThemeSelector.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-content-after': () => h(ThemeSelector),
    'sidebar-nav-before': () => h(ProductSwitcher),
    'layout-bottom': () => [
      h(NavigationScrollSync),
      h(CodeBlockScrollbars),
    ],
  }),
};
