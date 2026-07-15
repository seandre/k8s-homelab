import DefaultTheme from 'vitepress/theme';
import {h} from 'vue';
import ThemeSelector from './ThemeSelector.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-content-after': () => h(ThemeSelector),
  }),
};
