/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Overview',
      collapsed: false,
      items: [
        'overview/documentation-order',
        'overview/infrastructure-reference',
        'overview/learning-roadmap',
        'overview/architecture-decisions',
      ],
    },
    {
      type: 'category',
      label: 'Required Builds',
      collapsed: false,
      items: [
        'build/public-domain-tls',
        'build/utility-automation-server',
        'build/pve-02-and-bastion',
        'build/compact-okd',
      ],
    },
    {
      type: 'category',
      label: 'Optional Projects',
      items: [
        'optional/utility-desktop-koreader',
        'optional/koreader-sync-runbook',
        'optional/sealed-secrets',
        'optional/docusaurus-site',
      ],
    },
    {
      type: 'category',
      label: 'Operations',
      items: [
        'operations/rebuild-runbook',
        'operations/troubleshooting',
        'operations/stable-admin-credentials',
      ],
    },
  ],
};

export default sidebars;
