import {defineConfig} from 'vitepress';
import {fileURLToPath} from 'node:url';

const vuePackage = fileURLToPath(new URL('../node_modules/vue', import.meta.url));

export default defineConfig({
  lang: 'en-US',
  title: 'seandre homelab',
  titleTemplate: ':title | seandre homelab',
  description: 'Build, operations, and recovery documentation',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: 'https://docs.lab.seandre.dev',
  },
  srcDir: '../../docs',
  outDir: './dist',
  cacheDir: './.vitepress/cache',
  appearance: true,

  // Markdown lives outside the VitePress package root. Resolve Vue from this
  // package so SSR does not search for it beside the repository-level docs.
  vite: {
    resolve: {
      alias: [
        {find: /^vue(?=\/|$)/, replacement: vuePackage},
      ],
    },
  },

  markdown: {
    lineNumbers: false,
  },

  themeConfig: {
    siteTitle: 'seandre homelab',
    sidebar: [
      {text: 'Home', link: '/'},
      {
        text: 'Overview',
        collapsed: false,
        items: [
          {text: 'Documentation Order', link: '/overview/documentation-order'},
          {text: 'Infrastructure Reference', link: '/overview/infrastructure-reference'},
          {text: 'Network Topology', link: '/overview/network-topology'},
          {text: 'Learning Roadmap', link: '/overview/learning-roadmap'},
          {text: 'Architecture Decisions', link: '/overview/architecture-decisions'},
          {text: 'Homepage Architecture', link: '/overview/homepage-architecture'},
          {text: 'Homepage Build Plan', link: '/build/homepage-rework'},
        ],
      },
      {
        text: 'Required Builds',
        collapsed: false,
        items: [
          {text: '01 · Public DNS and TLS', link: '/build/public-domain-tls'},
          {text: '02 · Utility Automation Server', link: '/build/utility-automation-server'},
          {text: '03 · pve-02 and bastion-01', link: '/build/pve-02-and-bastion'},
          {text: '04 · Compact OKD', link: '/build/compact-okd'},
        ],
      },
      {
        text: 'Optional Projects',
        collapsed: true,
        items: [
          {text: '01 · Utility Desktop and KOReader', link: '/optional/utility-desktop-koreader'},
          {text: '02 · KOReader Sync Runbook', link: '/optional/koreader-sync-runbook'},
          {text: '03 · Sealed Secrets', link: '/optional/sealed-secrets'},
          {text: '04 · VitePress Site', link: '/optional/vitepress-site'},
          {text: '05 · Temporary Ubuntu + HPL', link: '/optional/hpl-benchmark'},
        ],
      },
      {
        text: 'Operations',
        collapsed: true,
        items: [
          {text: '01 · Rebuild Runbook', link: '/operations/rebuild-runbook'},
          {text: '02 · Troubleshooting', link: '/operations/troubleshooting'},
          {text: '03 · Stable Admin Credentials', link: '/operations/stable-admin-credentials'},
          {text: '04 · Proxmox Public TLS', link: '/operations/proxmox-public-tls'},
          {text: '05 · Proxmox Backup Server', link: '/operations/proxmox-backup-server'},
        ],
      },
    ],
    search: {
      provider: 'local',
      options: {
        detailedView: true,
        miniSearch: {
          searchOptions: {
            // Avoid false positives for short technical terms such as PXE/PVE.
            // Prefix matching still supports partial searches (for example,
            // "proxm" finds "Proxmox") without spelling substitutions.
            fuzzy: false,
            prefix: true,
          },
        },
      },
    },
    socialLinks: [
      {icon: 'github', link: 'https://github.com/seandre/k8s-homelab'},
    ],
    editLink: {
      pattern: 'https://github.com/seandre/k8s-homelab/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    },
    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },
    outline: {
      level: [2, 3],
      label: 'On this page',
    },
    externalLinkIcon: true,
    footer: {
      message: 'Homelab documentation generated from Git.',
    },
  },
});
