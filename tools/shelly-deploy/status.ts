#!/usr/bin/env node
/**
 * Shelly Script Status Monitor
 * Shows real-time CPU and memory usage of running scripts
 */

import chalk from 'chalk'

import { ShellyRPCClient } from './client'
import { getConfig } from './config'

async function showStatus() {
  const config = getConfig()
  const client = new ShellyRPCClient({
    ip: config.shellyIp,
    auth: config.shellyAuth,
  })

  try {
    // Get device info
    const deviceInfo = await client.getDeviceInfo()

    // Get all scripts
    const { scripts } = await client.listScripts()

    console.log('\n' + chalk.cyan('═'.repeat(60)))
    console.log(chalk.cyan.bold(`Device: ${deviceInfo.name} (${deviceInfo.model})`))
    console.log(chalk.cyan('═'.repeat(60)))

    if (scripts.length === 0) {
      console.log(chalk.yellow('No scripts found on device'))
      return
    }

    // Get status for each script
    for (const script of scripts) {
      const status = await client.getStatus(script.id)

      console.log('\n' + chalk.white.bold(`Script: ${script.name} (ID: ${script.id})`))
      console.log(chalk.gray('─'.repeat(40)))

      if (status.running) {
        console.log(chalk.green('● Status: RUNNING'))
        console.log(chalk.blue(`  Memory: ${status.mem_used} bytes (peak: ${status.mem_peak})`))
        console.log(chalk.blue(`  Free Memory: ${status.mem_free} bytes`))
        console.log(chalk.blue(`  CPU Usage: ${status.cpu}%`))

        // Calculate memory percentage
        const totalMem = status.mem_used + status.mem_free
        const memPercent = ((status.mem_used / totalMem) * 100).toFixed(1)

        // Memory bar
        const barLength = 30
        const usedBars = Math.round((status.mem_used / totalMem) * barLength)
        const memBar = '█'.repeat(usedBars) + '░'.repeat(barLength - usedBars)
        console.log(chalk.blue(`  Memory Bar: [${memBar}] ${memPercent}%`))

        // Show errors if any
        if (status.errors && Array.isArray(status.errors) && status.errors.length > 0) {
          console.log(chalk.red(`  Errors: ${(status.errors as string[]).join(', ')}`))
        }
      } else {
        console.log(chalk.gray('○ Status: STOPPED'))
        if (!script.enable) {
          console.log(chalk.gray('  Disabled'))
        }
      }
    }

    console.log('\n' + chalk.cyan('═'.repeat(60)) + '\n')

  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message)
    process.exit(1)
  }
}

// Terminal control functions for smooth updates
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0f') // Clear screen and move cursor to top
}

function moveCursor(line: number, col: number) {
  process.stdout.write(`\x1b[${line};${col}H`)
}

function hideCursor() {
  process.stdout.write('\x1b[?25l')
}

function showCursor() {
  process.stdout.write('\x1b[?25h')
}

// Live monitoring with smooth updates
async function liveMonitor() {
  const config = getConfig()
  const client = new ShellyRPCClient({
    ip: config.shellyIp,
    auth: config.shellyAuth,
  })

  hideCursor()
  clearScreen()

  const update = async () => {
    try {
      moveCursor(1, 1) // Move to top without clearing

      const deviceInfo = await client.getDeviceInfo()
      const { scripts } = await client.listScripts()

      // Static header
      console.log(chalk.cyan('═'.repeat(60)))
      console.log(chalk.cyan.bold(`Device: ${deviceInfo.name} (${deviceInfo.model})`))
      console.log(chalk.cyan('═'.repeat(60)))
      console.log(chalk.gray('Monitoring... (Press Ctrl+C to stop)\n'))

      if (scripts.length === 0) {
        console.log(chalk.yellow('No scripts found on device'))
        return
      }

      let lineNum = 6
      for (const script of scripts) {
        const status = await client.getStatus(script.id)

        moveCursor(lineNum, 1)
        console.log(chalk.white.bold(`Script: ${script.name} (ID: ${script.id})`))
        lineNum++

        moveCursor(lineNum, 1)
        console.log(chalk.gray('─'.repeat(40)))
        lineNum++

        if (status.running) {
          const totalMem = status.mem_used + status.mem_free
          const memPercent = ((status.mem_used / totalMem) * 100).toFixed(1)
          const barLength = 30
          const usedBars = Math.round((status.mem_used / totalMem) * barLength)
          const memBar = '█'.repeat(usedBars) + '░'.repeat(barLength - usedBars)

          moveCursor(lineNum, 1)
          console.log(chalk.green('● Status: RUNNING                    ')) // Extra spaces to clear old text
          lineNum++

          moveCursor(lineNum, 1)
          console.log(chalk.blue(`  Memory: ${status.mem_used.toString().padEnd(6)} bytes (peak: ${status.mem_peak})    `))
          lineNum++

          moveCursor(lineNum, 1)
          console.log(chalk.blue(`  Free:   ${status.mem_free.toString().padEnd(6)} bytes                    `))
          lineNum++

          moveCursor(lineNum, 1)
          console.log(chalk.blue(`  CPU:    ${(status.cpu || 0).toString().padEnd(3)}%                            `))
          lineNum++

          moveCursor(lineNum, 1)
          console.log(chalk.blue(`  Usage:  [${memBar}] ${memPercent}%     `))
          lineNum++

          if (status.errors && Array.isArray(status.errors) && status.errors.length > 0) {
            moveCursor(lineNum, 1)
            console.log(chalk.red(`  Errors: ${(status.errors as string[]).join(', ')}    `))
            lineNum++
          }
        } else {
          moveCursor(lineNum, 1)
          console.log(chalk.gray('○ Status: STOPPED                    '))
          lineNum++
          if (!script.enable) {
            moveCursor(lineNum, 1)
            console.log(chalk.gray('  Disabled                          '))
            lineNum++
          }
        }

        lineNum += 2 // Space between scripts
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message)
    }
  }

  // Initial update
  await update()

  // Set up interval
  const interval = parseInt(process.argv[3] || '2000')
  const intervalId = setInterval(update, interval)

  // Handle exit
  process.on('SIGINT', () => {
    clearInterval(intervalId)
    showCursor()
    clearScreen()
    console.log('Stopped monitoring')
    process.exit(0)
  })
}

// Add continuous monitoring option
if (process.argv.includes('--watch') || process.argv.includes('-w')) {
  liveMonitor()
} else {
  showStatus()
}
