// https://www.figma.com/plugin-docs/manifest/
export default {
  name: 'Turbo Variable',
  id: '1424792120148154073',
  api: '1.0.0',
  main: 'plugin.js',
  capabilities: [],
  enableProposedApi: false,
  editorType: ['figma'],
  ui: 'index.html',
  permissions: ['teamlibrary'],
  documentAccess: 'dynamic-page',
  networkAccess: { allowedDomains: ['none'] }
};
