#!/usr/bin/env node
/**
 * Shelly WebSocket Log Monitor
 * Real-time monitoring of script console output
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import chalk from 'chalk'
import { program } from 'commander'
import WebSocket from 'ws'

import { getConfig } from './config'

// Kill any existing monitor processes (Shelly only allows 1 debug stream)
// Controlled by KILL_EXISTING_MONITORS env var (default: true)
const earlyConfig = getConfig()
if (earlyConfig.killExistingMonitors) {
  try {
    const myPid = process.pid
    const result = execSync('pgrep -f "monitor.ts" 2>/dev/null || true', { encoding: 'utf-8' })
    const pids = result.trim().split('\n').filter((p) => p && parseInt(p) !== myPid)
    if (pids.length > 0) {
      // Silently kill existing monitors
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid), 'SIGTERM')
        } catch {
          // Process may have already exited
        }
      }
      // Give time for connections to close
      execSync('sleep 1')
    }
  } catch {
    // pgrep not available or failed, continue anyway
  }
}

// Parse command line arguments
program
  .name('shelly-monitor')
  .description('Monitor Shelly script logs in real-time')
  .option('-f, --filter <pattern>', 'Filter log messages by pattern')
  .option('-l, --level <level>', 'Minimum log level to display (debug, info, warn, error)')
  .option('-s, --save', 'Save logs to file')
  .option('-t, --timestamp', 'Show timestamps')
  .option('-r, --raw', 'Show raw messages without formatting')
  .option('-v, --verbose', 'Show all messages including debug info')
  .option('-q, --quiet', 'Minimal output (for scripted use)')
  .parse(process.argv)

const options = program.opts()
const quiet = options.quiet

interface LogMessage {
  timestamp: number
  level: string
  message: string
  source?: string
}

class ShellyMonitor {
  private ws?: WebSocket
  private config = getConfig()
  private reconnectTimer?: NodeJS.Timeout
  private logFile?: fs.WriteStream
  private filterRegex?: RegExp
  private minLevel: number
  private isShuttingDown = false

  constructor() {
    // Set up log level filtering
    const levels: Record<string, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      warning: 2,
      error: 3,
    }
    this.minLevel = levels[options.level?.toLowerCase()] || 0

    // Set up message filtering
    if (options.filter) {
      try {
        this.filterRegex = new RegExp(options.filter, 'i')
      } catch (_error) {
        console.error(chalk.red('Invalid filter pattern'))
        process.exit(1)
      }
    }

    // Set up log file
    if (options.save || this.config.logToFile) {
      const logDir = path.dirname(this.config.logFilePath!)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      this.logFile = fs.createWriteStream(this.config.logFilePath!, { flags: 'a' })
      console.log(chalk.gray(`Saving logs to: ${this.config.logFilePath}`))
    }

    // Handle process signals
    process.on('SIGINT', () => this.shutdown())
    process.on('SIGTERM', () => this.shutdown())
  }

  /**
   * Connect to WebSocket
   */
  private connect(): void {
    const wsUrl = `ws://${this.config.shellyIp}/debug/log`
    if (!quiet) console.log(chalk.blue(`[MONITOR] Connecting to ${this.config.shellyIp}...`))

    this.ws = new WebSocket(wsUrl)

    this.ws.on('open', () => {
      console.log(chalk.green('[MONITOR] ✓ Connected (Ctrl+C to stop)\n'))

      // Clear reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = undefined
      }
    })

    this.ws.on('message', (data: Buffer) => {
      const message = data.toString()
      if (options.verbose) {
        console.log(chalk.gray('[DEBUG] Received:'), message)
      }
      this.handleMessage(message)
    })

    this.ws.on('error', (error: Error) => {
      console.error(chalk.red('WebSocket error:'), error.message)
    })

    this.ws.on('close', (code: number, _reason: string) => {
      // Don't reconnect if we're shutting down
      if (this.isShuttingDown) {
        return
      }

      console.log(chalk.yellow(`\n[MONITOR] Disconnected (code: ${code})`))

      // Attempt to reconnect
      if (!this.reconnectTimer) {
        if (!quiet) console.log(chalk.gray(`[MONITOR] Reconnecting in ${this.config.websocketReconnectInterval}ms...`))
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined
          this.connect()
        }, this.config.websocketReconnectInterval)
      }
    })
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(data)

      // Shelly log format: { ts: number, level: number, data: string }
      if (parsed.ts && parsed.level !== undefined && parsed.data) {
        this.handleShellyLog(parsed)
      } else if (parsed.method === 'NotifyEvent' && parsed.params) {
        this.handleEvent(parsed.params)
      } else if (parsed.src && parsed.msg) {
        // Script console output
        this.handleScriptLog(parsed)
      } else if (options.raw) {
        // Show raw message
        console.log(chalk.gray('RAW:'), data)
      }
    } catch {
      // Not JSON, might be plain text log
      if (data.trim()) {
        this.handlePlainLog(data)
      }
    }
  }

  /**
   * Handle Shelly system log message
   * Format: { ts: number, level: number, data: string }
   * Level: 0=error, 1=warn, 2=info, 3=debug, 4=verbose
   */
  private handleShellyLog(log: { ts: number; level: number; data: string }): void {
    const levelMap = ['error', 'warn', 'info', 'debug', 'verbose']
    const levelName = levelMap[log.level] || 'info'

    const message: LogMessage = {
      timestamp: log.ts * 1000, // Convert to milliseconds
      level: levelName,
      message: log.data.trim(),
      source: 'system',
    }

    this.displayLog(message)
  }

  /**
   * Handle script log message
   */
  private handleScriptLog(log: any): void {
    const message: LogMessage = {
      timestamp: Date.now(),
      level: this.detectLogLevel(log.msg),
      message: log.msg,
      source: log.src,
    }

    this.displayLog(message)
  }

  /**
   * Handle plain text log
   */
  private handlePlainLog(text: string): void {
    const message: LogMessage = {
      timestamp: Date.now(),
      level: this.detectLogLevel(text),
      message: text,
    }

    this.displayLog(message)
  }

  /**
   * Handle system event
   */
  private handleEvent(event: any): void {
    if (event.events) {
      for (const evt of event.events) {
        if (evt.component === 'script' || evt.event === 'script') {
          const message: LogMessage = {
            timestamp: Date.now(),
            level: 'info',
            message: `Script event: ${JSON.stringify(evt)}`,
            source: 'system',
          }
          this.displayLog(message)
        }
      }
    }
  }

  /**
   * Detect log level from message content
   */
  private detectLogLevel(message: string): string {
    const lower = message.toLowerCase()

    if (lower.includes('[error]') || lower.includes('error:')) {
      return 'error'
    }
    if (lower.includes('[warn]') || lower.includes('[warning]') || lower.includes('warning:')) {
      return 'warning'
    }
    if (lower.includes('[info]') || lower.includes('info:')) {
      return 'info'
    }
    if (lower.includes('[debug]') || lower.includes('debug:')) {
      return 'debug'
    }

    // Check for common log patterns
    if (lower.startsWith('✗') || lower.includes('fail')) {
      return 'error'
    }
    if (lower.startsWith('⚠')) {
      return 'warning'
    }
    if (lower.startsWith('✓') || lower.startsWith('✔')) {
      return 'info'
    }

    return 'info'
  }

  /**
   * Display formatted log message
   */
  private displayLog(log: LogMessage): void {
    // Apply level filter
    const levelValues: Record<string, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      warning: 2,
      error: 3,
    }

    if (levelValues[log.level] < this.minLevel) {
      return
    }

    // Apply message filter
    if (this.filterRegex && !this.filterRegex.test(log.message)) {
      return
    }

    // Format the message
    let output = ''

    if (options.timestamp) {
      const time = new Date(log.timestamp).toISOString().substr(11, 12)
      output += chalk.gray(`[${time}] `)
    }

    // Add level indicator
    const levelColors: Record<string, typeof chalk.gray> = {
      debug: chalk.gray,
      info: chalk.cyan,
      warning: chalk.yellow,
      error: chalk.red,
    }

    const levelLabels: Record<string, string> = {
      debug: 'DEBUG',
      info: 'INFO ',
      warning: 'WARN ',
      error: 'ERROR',
    }

    const color = levelColors[log.level] || chalk.white
    const label = levelLabels[log.level] || 'LOG  '

    if (!options.raw) {
      output += color(`[${label}] `)
    }

    // Add the message (source is always 'system' in debug stream, so skip it)
    output += log.message

    // Display
    console.log(output)

    // Save to file if enabled
    if (this.logFile) {
      this.logFile.write(output + '\n')
    }
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.connect()
  }

  /**
   * Graceful shutdown
   */
  private shutdown(): void {
    // Prevent reconnect attempts
    this.isShuttingDown = true

    console.log(chalk.gray('\n[MONITOR] Stopped'))

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    if (this.ws) {
      this.ws.close()
    }

    if (this.logFile) {
      this.logFile.end()
    }

    process.exit(0)
  }
}

// Run the monitor
const monitor = new ShellyMonitor()
monitor.start()
