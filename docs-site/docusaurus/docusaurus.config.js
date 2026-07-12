import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'seandre homelab',
  tagline: 'Build, operations, and recovery documentation',
  url: 'https://docs.lab.seandre.dev',
  baseUrl: '/',
  organizationName: 'seandre',
  projectName: 'k8s-homelab',
  trailingSlash: false,
  onBrokenLinks: 'throw',

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../../docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: ({docPath}) =>
            `https://github.com/seandre/k8s-homelab/edit/main/docs/${docPath}`,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: 'filename',
        docsDir: '../../docs',
        docsRouteBasePath: '/',
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        language: 'en',
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        searchBarShortcutKeymap: 'mod+k',
        searchResultLimits: 8,
        searchResultContextMaxLength: 80,
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'seandre homelab',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/seandre/k8s-homelab',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Homelab documentation generated from Git.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'ini', 'json', 'yaml'],
    },
  },
};

export default config;
