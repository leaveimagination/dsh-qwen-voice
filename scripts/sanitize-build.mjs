#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const lib = new URL('../lib/', import.meta.url)
for (const name of ['client.js', 'client.js.map']) {
  const url = new URL(name, lib)
  if (!fs.existsSync(url)) continue
  const source = fs.readFileSync(url, 'utf8')
  const sanitized = source.replaceAll(path.resolve('src'), '<project>/src')
  fs.writeFileSync(url, sanitized)
}
