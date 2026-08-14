import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig, type UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-qwen-voice'
const EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-runtime/client',
]
const CSS_PREFIX = '\0dsh-css:'
const CSS_SUFFIX = '.mjs'

const config: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: EXTERNALS,
  noExternal: id => EXTERNALS.includes(id) ? undefined : true,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [{
    name: 'dsh-qwen-voice-css',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const emitted = importer === undefined ? source : resolvePath(dirname(importer), source)
      let asset = emitted
      if (!existsSync(asset)) {
        const marker = `${sep}lib${sep}`
        const index = asset.indexOf(marker)
        if (index !== -1) asset = `${asset.slice(0, index)}${sep}src${sep}${asset.slice(index + marker.length)}`
      }
      return CSS_PREFIX + asset + CSS_SUFFIX
    },
    load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null
      const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
      const result = transform({ filename: file, code: readFileSync(file), cssModules: { pattern: '[hash]_[local]' }, minify: true })
      const classes: Record<string, string> = {}
      for (const [local, value] of Object.entries(result.exports ?? {})) classes[local] = value.name
      const tagId = `${PLUGIN_ID}/${basename(file)}`
      return [
        `const css=${JSON.stringify(result.code.toString())};`,
        `const tagId=${JSON.stringify(tagId)};`,
        "if(typeof document!=='undefined'&&!document.querySelector('style[data-plugin-css='+JSON.stringify(tagId)+']')){const tag=document.createElement('style');tag.dataset.pluginCss=tagId;tag.textContent=css;document.head.appendChild(tag)}",
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig(config)
