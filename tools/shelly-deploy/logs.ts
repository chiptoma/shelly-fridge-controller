#!/usr/bin/env node
/**
 * Shelly Script Error Checker
 * Shows script status and any execution errors
 */

import chalk from 'chalk'
import { program } from 'commander'

import { ShellyRPCClient } from './client'
import { getConfig } from './config'

// Parse command line arguments
program
  .name('shelly-logs')
  .description('Check script status and errors')
  .option('-i, --id <id>', 'Script ID to check')
  .option('-n, --name <name>', 'Script name to check')
  .option('-a, --all', 'Check all scripts')
  .parse(process.argv)

const options = program.opts()

async function checkScriptErrors() {
  const config = getConfig()
  const client = new ShellyRPCClient({
    ip: config.shellyIp,
    auth: config.shellyAuth,
  })

  try {
    const { scripts } = await client.listScripts()

    let scriptsToCheck: number[] = []

    if (options.all) {
      scriptsToCheck = scripts.map((s) => s.id)
    } else if (options.id) {
      scriptsToCheck = [parseInt(options.id)]
    } else if (options.name) {
      const id = await client.findScriptByName(options.name)
      if (id === null) {
        console.error(chalk.red(`Script "${options.name}" not found`))
        process.exit(1)
      }
      scriptsToCheck = [id]
    } else {
      // Default to configured script
      const id = await client.findScriptByName(config.scriptName)
      if (id !== null) {
        scriptsToCheck = [id]
      } else {
        // Check all if no default found
        scriptsToCheck = scripts.map((s) => s.id)
      }
    }

    console.log(chalk.cyan('═'.repeat(60)))
    console.log(chalk.cyan.bold('Script Error Check'))
    console.log(chalk.cyan('═'.repeat(60)))

    for (const scriptId of scriptsToCheck) {
      const status = await client.getStatus(scriptId)
      const script = scripts.find((s) => s.id === scriptId)

      console.log(chalk.white.bold(`\n${script?.name} (ID: ${scriptId})`))
      console.log(chalk.gray('─'.repeat(40)))

      if (status.running) {
        console.log(`Status: ${chalk.green('● RUNNING')}`)
        console.log(`Memory: ${status.mem_used} bytes (${((status.mem_used / (status.mem_used + status.mem_free)) * 100).toFixed(1)}%)`)
      } else {
        console.log(`Status: ${chalk.gray('○ STOPPED')}`)
      }

      if (status.errors && Array.isArray(status.errors) && status.errors.length > 0) {
        console.log(chalk.red('Errors:'));
        (status.errors as string[]).forEach((err) => {
          console.log(chalk.red(`  ✗ ${err}`))
        })
      } else {
        console.log(chalk.green('✓ No errors'))
      }
    }

    console.log(chalk.cyan('\n' + '═'.repeat(60)))
    console.log(chalk.blue.bold('\n💡 Tip: To see live logs use:'))
    console.log(chalk.gray('   npm run monitor           # Basic log monitoring'))
    console.log(chalk.gray('   npm run monitor -- -v      # Verbose (shows all messages)'))
    console.log(chalk.gray('   npm run monitor -- -f error # Filter for errors only'))

  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message)
    process.exit(1)
  }
}

// Run the check
checkScriptErrors()
