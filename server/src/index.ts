import { Repo } from '@automerge/automerge-repo'
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket'
import express from 'express'
import { WebSocketServer } from 'ws'
import crypto from 'crypto'
import path from 'path'
import type { Server } from 'http'

import { MetadataStore } from './metadata-store.js'
import { TrackingStorageAdapter } from './tracking-storage-adapter.js'
import { startAdminServer } from './admin-server.js'

import 'dotenv/config'

type Config = {
  port: number
  adminPort: number
  baseDir: string
  metadataFile: string
  allowedTokens: string[]
  adminToken: string
  debugWs: boolean
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})

async function main(): Promise<void> {
  let config = parseEnvConfig()
  let metadataStore = new MetadataStore(config.metadataFile)
  await metadataStore.init()

  let storageAdapter = new TrackingStorageAdapter(config.baseDir, metadataStore)

  let app = express()
  let syncServer = app.listen(config.port, () => {
    console.log(`server started at ${config.port}`)
  })
  let wss = new WebSocketServer({
    noServer: true
  })
  let repo = new Repo({
    storage: storageAdapter,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    network: [new NodeWSServerAdapter(wss as any)]
  })
  let adminServer = startAdminServer({
    port: config.adminPort,
    token: config.adminToken,
    baseDir: config.baseDir,
    repo,
    storage: storageAdapter,
    metadata: metadataStore
  })

  if (config.debugWs) {
    console.log('[debug] ws config', {
      port: config.port,
      baseDir: config.baseDir,
      tokenCount: config.allowedTokens.length,
      tokenFingerprints: config.allowedTokens.map(token => {
        const normalizedToken = token || ''
        const hash = crypto
          .createHash('sha256')
          .update(normalizedToken)
          .digest('hex')
        return {
          length: normalizedToken.length,
          sha256_8: hash.slice(0, 8)
        }
      })
    })
  }

  app.get('/', (_, resp) => {
    resp.send('OK')
  })

  syncServer.on('upgrade', async (req, socket, head) => {
    let params: URLSearchParams = new URLSearchParams()
    let url = req.url || ''
    let paramsPos = url.indexOf('?')
    if (paramsPos != -1) {
      params = new URLSearchParams(url.slice(paramsPos + 1))
    }

    let accessToken = params.get('access-token')

    if (config.debugWs) {
      const normalizedToken = accessToken || ''
      const tokenHash = crypto
        .createHash('sha256')
        .update(normalizedToken)
        .digest('hex')
        .slice(0, 8)

      console.log('[debug] ws upgrade', {
        method: req.method,
        url,
        host: req.headers.host || '',
        remoteAddress: req.socket.remoteAddress || 'unknown',
        xForwardedFor: req.headers['x-forwarded-for'] || '',
        xForwardedProto: req.headers['x-forwarded-proto'] || '',
        cfConnectingIp: req.headers['cf-connecting-ip'] || '',
        hasAccessToken: Boolean(accessToken),
        accessTokenLength: normalizedToken.length,
        accessTokenSha256_8: tokenHash,
        tokenMatch: config.allowedTokens.includes(normalizedToken)
      })
    }

    if (!accessToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    // Cool guys use sets, but for a couple of tokens, who cares
    if (!config.allowedTokens.includes(accessToken)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, currSocket => {
      wss.emit('connection', currSocket, req)
    })
  })

  process.on('uncaughtException', e => console.log(e))

  const closeServer = (server: Server): Promise<void> =>
    new Promise(resolve => {
      server.close(() => resolve())
    })

  let isShuttingDown = false
  const shutdown = async () => {
    if (isShuttingDown) return
    isShuttingDown = true

    await metadataStore.flush()
    await Promise.allSettled([
      closeServer(syncServer),
      closeServer(adminServer)
    ])
  }

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0))
  })

  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0))
  })
}

function parseEnvConfig(): Config {
  // exit instead of throw because:
  //   1. I prefer clean one-line error message instead of entire stacktrace
  //   2. If we couldn't parse the config, we can't start the server, so that's ok to exit right away.
  const exitLog = (msg: string) => {
    console.log(msg)
    process.exit(1)
  }

  // tokens
  let tokens: string[] = []
  for (let [env, value] of Object.entries(process.env)) {
    if (env.startsWith('ALLOWED_TOKEN') && typeof value === 'string') {
      tokens.push(value)
    }
  }
  if (tokens.length === 0) {
    exitLog(
      'read configuration: at least one environment variable with pattern ALLOWED_TOKEN_{TOKEN_NAME} required'
    )
  }

  // port
  let portStr = process.env.PORT || '8080'
  let port = parseInt(portStr)
  if (isNaN(port) || port <= 0 || port > 65535) {
    exitLog(
      'read configuration: PORT variable must be a number between 0 and 65535'
    )
  }

  // admin port
  let adminPortStr = process.env.ADMIN_PORT || '8081'
  let adminPort = parseInt(adminPortStr)
  if (isNaN(adminPort) || adminPort <= 0 || adminPort > 65535) {
    exitLog(
      'read configuration: ADMIN_PORT variable must be a number between 0 and 65535'
    )
  }

  if (adminPort === port) {
    exitLog('read configuration: ADMIN_PORT must be different from PORT')
  }

  // base dir
  let baseDir = process.env.BASE_DIR || 'automerge-repo-data'

  // admin token
  let adminToken = process.env.ADMIN_TOKEN || tokens[0]
  if (!adminToken) {
    exitLog('read configuration: ADMIN_TOKEN must be provided')
  }

  // metadata file
  let metadataFile = process.env.METADATA_FILE || path.join(baseDir, 'admin-metadata.json')

  // debug ws logs
  let debugWs = process.env.DEBUG_WS === '1'

  return {
    port: port,
    adminPort: adminPort,
    baseDir: baseDir,
    metadataFile: metadataFile,
    allowedTokens: tokens,
    adminToken: adminToken,
    debugWs: debugWs
  }
}
