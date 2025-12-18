/**
 * Shelly RPC Client
 * Type-safe client for communicating with Shelly devices via JSON-RPC
 */

import type {
  ScriptConfig,
  ScriptStatus,
  JSONValue,
} from './types'

export interface ShellyClientConfig {
  ip: string
  timeout?: number
  auth?: {
    user: string
    password: string
  }
}

export interface RPCRequest {
  id: number
  method: string
  params?: Record<string, JSONValue>
}

export interface RPCResponse<T = any> {
  id: number
  result?: T
  error?: {
    code: number
    message: string
  }
}

export class ShellyRPCClient {
  private baseUrl: string
  private requestId = 1
  private timeout: number
  private authHeader?: string

  constructor(config: ShellyClientConfig) {
    this.baseUrl = `http://${config.ip}/rpc`
    this.timeout = config.timeout || 10000

    if (config.auth) {
      const credentials = Buffer.from(
        `${config.auth.user}:${config.auth.password}`,
      ).toString('base64')
      this.authHeader = `Basic ${credentials}`
    }
  }

  /**
   * Send a raw RPC request
   */
  private async sendRequest<T = any>(
    method: string,
    params?: Record<string, JSONValue>,
  ): Promise<T> {
    const request: RPCRequest = {
      id: this.requestId++,
      method,
      params,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authHeader && { Authorization: this.authHeader }),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json() as RPCResponse<T>

      if (data.error) {
        throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`)
      }

      return data.result as T
    } catch (error: any) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`)
      }
      throw error
    }
  }

  /**
   * Script management methods
   */

  async createScript(name: string): Promise<{ id: number }> {
    return this.sendRequest<{ id: number }>('Script.Create', { name })
  }

  async deleteScript(id: number): Promise<null> {
    return this.sendRequest<null>('Script.Delete', { id })
  }

  async listScripts(): Promise<{ scripts: Array<{
    id: number
    name: string
    enable: boolean
    running: boolean
  }> }> {
    return this.sendRequest('Script.List', {})
  }

  async putCode(
    id: number,
    code: string,
    append = false,
  ): Promise<{ len: number }> {
    return this.sendRequest<{ len: number }>('Script.PutCode', {
      id,
      code,
      append,
    })
  }

  async setConfig(
    id: number,
    config: Partial<ScriptConfig>,
  ): Promise<{ restart_required?: boolean }> {
    return this.sendRequest('Script.SetConfig', { id, config })
  }

  async getConfig(id: number): Promise<ScriptConfig> {
    return this.sendRequest<ScriptConfig>('Script.GetConfig', { id })
  }

  async getStatus(id: number): Promise<ScriptStatus> {
    return this.sendRequest<ScriptStatus>('Script.GetStatus', { id })
  }

  async startScript(id: number): Promise<null> {
    return this.sendRequest<null>('Script.Start', { id })
  }

  async stopScript(id: number): Promise<null> {
    return this.sendRequest<null>('Script.Stop', { id })
  }

  /**
   * System configuration methods
   */

  async enableDebugWebsocket(): Promise<{ restart_required?: boolean }> {
    return this.sendRequest('Sys.SetConfig', {
      config: {
        debug: {
          websocket: {
            enable: true,
          },
        },
      },
    })
  }

  async getDeviceInfo(): Promise<{
    name: string
    id: string
    mac: string
    model: string
    gen: number
    fw_id: string
    ver: string
    app: string
  }> {
    return this.sendRequest('Shelly.GetDeviceInfo', {})
  }

  /**
   * Helper methods
   */

  async findScriptByName(name: string): Promise<number | null> {
    const { scripts } = await this.listScripts()
    const script = scripts.find((s) => s.name === name)
    return script ? script.id : null
  }

  async uploadScript(
    id: number,
    code: string,
    chunkSize = 1024,
  ): Promise<void> {
    // Upload in chunks using byte-aware slicing
    // CRITICAL: Must use Buffer to handle UTF-8 multi-byte characters (emojis)
    // String.slice() operates on characters, but Shelly measures bytes
    const buffer = Buffer.from(code, 'utf8')
    const totalBytes = buffer.length

    if (totalBytes <= chunkSize) {
      await this.putCode(id, code, false)
    } else {
      let byteOffset = 0
      let isFirst = true

      while (byteOffset < totalBytes) {
        // Calculate end position, ensuring we don't split multi-byte characters
        let endOffset = Math.min(byteOffset + chunkSize, totalBytes)

        // If we're not at the end, backtrack to avoid splitting UTF-8 sequences
        // UTF-8 continuation bytes start with 10xxxxxx (0x80-0xBF)
        if (endOffset < totalBytes) {
          while (endOffset > byteOffset && (buffer[endOffset] & 0xC0) === 0x80) {
            endOffset--
          }
        }

        // Extract chunk as string
        const chunk = buffer.slice(byteOffset, endOffset).toString('utf8')
        const append = !isFirst

        await this.putCode(id, chunk, append)

        byteOffset = endOffset
        isFirst = false

        // Small delay between chunks to avoid overwhelming the device
        if (byteOffset < totalBytes) {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
    }
  }

  async ensureScript(name: string, _quiet = false): Promise<{
    id: number
    wasCreated: boolean
    wasStopped: boolean
  }> {
    // Check if script already exists
    let scriptId = await this.findScriptByName(name)
    let wasCreated = false
    let wasStopped = false

    if (scriptId === null) {
      // Create new script
      const result = await this.createScript(name)
      scriptId = result.id
      wasCreated = true
    } else {
      // Stop it if running
      try {
        const status = await this.getStatus(scriptId)
        if (status.running) {
          await this.stopScript(scriptId)
          wasStopped = true
        }
      } catch (_error) {
        // Script might not be running
      }
    }

    return { id: scriptId, wasCreated, wasStopped }
  }
}
