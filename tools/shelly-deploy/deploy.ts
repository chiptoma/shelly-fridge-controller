#!/usr/bin/env node
/**
 * Shelly Script Deployment Tool
 * Builds and deploys scripts to Shelly devices
 */

import * as fs from 'fs'
import * as path from 'path'

import chalk from 'chalk'
import { program } from 'commander'

import { ShellyRPCClient } from './client'
import { ConfigManager, getConfig } from './config'

// Parse command line arguments
program
  .name('shelly-deploy')
  .description('Deploy scripts to Shelly devices')
  .option('-s, --status', 'Show script status')
  .option('-x, --stop', 'Stop the script')
  .option('-d, --delete', 'Delete the script from device')
  .option('-l, --list', 'List all scripts on device')
  .option('-b, --skip-build', 'Skip building, use existing file')
  .option('-u, --no-upload', 'Build only, don\'t upload')
  .option('--no-start', 'Don\'t start the script after upload')
  .option('--start-only', 'Only start the script (no build/upload)')
  .option('-q, --quiet', 'Minimal output (for scripted use)')
  .parse(process.argv)

const options = program.opts()
const quiet = options.quiet

interface DeployActions {
  scriptId: number
  wasCreated: boolean
  wasStopped: boolean
  stoppedOthers: string[]
  uploaded: boolean
  started: boolean
  memUsed?: number
}

class ShellyDeployer {
  private client: ShellyRPCClient
  private config = getConfig()
  private actions: DeployActions = {
    scriptId: 0,
    wasCreated: false,
    wasStopped: false,
    stoppedOthers: [],
    uploaded: false,
    started: false,
  }

  constructor() {
    this.client = new ShellyRPCClient({
      ip: this.config.shellyIp,
      auth: this.config.shellyAuth,
    })
  }

  /**
   * Deploy the script to the device
   */
  private async deployScript(scriptCode: string): Promise<void> {
    // Get device info
    let deviceName = this.config.shellyIp
    let deviceModel = ''
    try {
      const deviceInfo = await this.client.getDeviceInfo()
      deviceName = deviceInfo.name
      deviceModel = deviceInfo.model
    } catch (error) {
      throw new Error(`Failed to connect to device at ${this.config.shellyIp}: ${error}`)
    }

    // Find or create script
    const result = await this.client.ensureScript(this.config.scriptName, quiet)
    this.actions.scriptId = result.id
    this.actions.wasCreated = result.wasCreated
    this.actions.wasStopped = result.wasStopped

    // Upload script code
    await this.client.uploadScript(result.id, scriptCode, this.config.chunkSize)
    this.actions.uploaded = true

    // Configure script
    await this.client.setConfig(result.id, {
      name: this.config.scriptName,
      enable: true,
    })

    // Start script if requested
    if (options.start !== false && this.config.autoStart) {
      await this.client.startScript(result.id)
      const status = await this.client.getStatus(result.id)
      this.actions.started = true
      this.actions.memUsed = status.mem_used
    }

    // Enable debug websocket if needed
    if (this.config.enableDebug) {
      await this.client.enableDebugWebsocket()
    }

    // Display deploy summary
    this.displayDeploySummary(deviceName, deviceModel, scriptCode.length)
  }

  /**
   * Display formatted deploy summary
   */
  private displayDeploySummary(deviceName: string, deviceModel: string, codeSize: number): void {
    const sizeKB = (codeSize / 1024).toFixed(2)

    // Header
    console.log(chalk.green('[DEPLOY]  ✓ Deployed to device'))
    console.log(chalk.gray(`          Device: ${this.config.shellyIp} → ${deviceName}${deviceModel ? ` (${deviceModel})` : ''}`))
    console.log(chalk.gray(`          Script: ${this.config.scriptName} (id: ${this.actions.scriptId})`))

    // Actions taken - explicit list
    const actions: string[] = []
    if (this.actions.wasCreated) {
      actions.push('Created new script')
    } else if (this.actions.wasStopped) {
      actions.push('Stopped existing script')
    } else {
      actions.push('Script was not running')
    }

    if (this.actions.stoppedOthers.length > 0) {
      actions.push(`Stopped ${this.actions.stoppedOthers.length} other script(s): ${this.actions.stoppedOthers.join(', ')}`)
    }

    actions.push(`Uploaded ${sizeKB} KB`)

    if (this.actions.started) {
      actions.push(`Started script${this.actions.memUsed ? ` (memory: ${this.actions.memUsed} bytes)` : ''}`)
    } else {
      actions.push('Script not started (--no-start)')
    }

    // Print actions
    console.log(chalk.gray('          Actions:'))
    for (const action of actions) {
      console.log(chalk.gray(`            • ${action}`))
    }
  }

  /**
   * Show script status
   */
  private async showStatus(): Promise<void> {
    const scriptId = await this.client.findScriptByName(this.config.scriptName)

    if (scriptId === null) {
      console.log(chalk.yellow(`Script "${this.config.scriptName}" not found on device`))
      return
    }

    const status = await this.client.getStatus(scriptId)
    const config = await this.client.getConfig(scriptId)

    console.log('\nScript Status:')
    console.log('==============')
    console.log(`Name: ${config.name}`)
    console.log(`ID: ${scriptId}`)
    console.log(`Enabled: ${config.enable ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`Running: ${status.running ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`Memory Used: ${status.mem_used} bytes`)
    console.log(`Memory Peak: ${status.mem_peak} bytes`)
    console.log(`Memory Free: ${status.mem_free} bytes`)
  }

  /**
   * Stop the script
   */
  private async stopScript(): Promise<void> {
    const scriptId = await this.client.findScriptByName(this.config.scriptName)

    if (scriptId === null) {
      console.log(chalk.yellow(`Script "${this.config.scriptName}" not found on device`))
      return
    }

    console.log(chalk.blue('Stopping script...'))
    await this.client.stopScript(scriptId)
    console.log(chalk.green('✓ Script stopped'))
  }

  /**
   * Delete the script
   */
  private async deleteScript(): Promise<void> {
    const scriptId = await this.client.findScriptByName(this.config.scriptName)

    if (scriptId === null) {
      console.log(chalk.yellow(`Script "${this.config.scriptName}" not found on device`))
      return
    }

    // Stop if running
    try {
      await this.client.stopScript(scriptId)
    } catch {
      // Ignore if not running
    }

    console.log(chalk.blue('Deleting script...'))
    await this.client.deleteScript(scriptId)
    console.log(chalk.green('✓ Script deleted'))
  }

  /**
   * List all scripts
   */
  private async listScripts(): Promise<void> {
    const { scripts } = await this.client.listScripts()

    console.log('\nScripts on device:')
    console.log('==================')

    if (scripts.length === 0) {
      console.log(chalk.gray('No scripts found'))
      return
    }

    for (const script of scripts) {
      const status = script.running ? chalk.green('[RUNNING]') : chalk.gray('[STOPPED]')
      const enabled = script.enable ? '' : chalk.red(' [DISABLED]')
      console.log(`${script.id}: ${script.name} ${status}${enabled}`)
    }
  }

  /**
   * Stop other running scripts (not ours)
   */
  private async stopOtherScripts(): Promise<void> {
    if (!this.config.stopExistingScripts) {
      return
    }

    const { scripts } = await this.client.listScripts()
    const runningOthers = scripts.filter(
      (s) => s.running && s.name !== this.config.scriptName,
    )

    if (runningOthers.length === 0) {
      return
    }

    for (const script of runningOthers) {
      try {
        await this.client.stopScript(script.id)
        this.actions.stoppedOthers.push(script.name)
      } catch (error) {
        console.warn(chalk.red(`[WARN] Failed to stop ${script.name}: ${error}`))
      }
    }
  }

  /**
   * Start the script only
   */
  private async startScriptOnly(): Promise<void> {
    const scriptId = await this.client.findScriptByName(this.config.scriptName)

    if (scriptId === null) {
      console.log(chalk.yellow(`Script "${this.config.scriptName}" not found on device`))
      return
    }

    await this.client.startScript(scriptId)
    const status = await this.client.getStatus(scriptId)
    if (!quiet) console.log(chalk.green(`✓ Started (mem: ${status.mem_used} bytes)`))
  }

  /**
   * Main execution
   */
  async run(): Promise<void> {
    try {
      // Handle different modes
      if (options.status) {
        await this.showStatus()
      } else if (options.stop) {
        await this.stopScript()
      } else if (options.delete) {
        await this.deleteScript()
      } else if (options.list) {
        await this.listScripts()
      } else if (options.startOnly) {
        await this.startScriptOnly()
      } else {
        // Default: deploy from pre-built file
        // Build is handled by `npm run build` (concat + minify)
        const outputPath = path.resolve(process.cwd(), this.config.outputPath)
        if (!fs.existsSync(outputPath)) {
          throw new Error(`Output file not found: ${outputPath}\nRun "npm run build" first.`)
        }
        const scriptCode = fs.readFileSync(outputPath, 'utf-8')
        if (!quiet) console.log(chalk.blue(`[BUILD] Using: ${outputPath} (${(scriptCode.length / 1024).toFixed(2)} KB)`))

        // Upload if requested
        if (options.upload !== false) {
          // Stop other running scripts first (if enabled)
          await this.stopOtherScripts()

          await this.deployScript(scriptCode)
        }
      }
    } catch (error: any) {
      console.error(chalk.red('\n✗ Error:'), error.message)
      if (this.config.enableDebug && !quiet) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  }
}

// Create .env.example if needed
ConfigManager.createEnvExample()

// Run the deployer
const deployer = new ShellyDeployer()
deployer.run()
