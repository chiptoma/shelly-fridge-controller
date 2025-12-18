/**
 * Configuration Management
 * Handles environment variables and deployment settings
 */

import * as fs from 'fs'
import * as path from 'path'

import * as dotenv from 'dotenv'

// Suppress dotenv promotional messages
process.env.DOTENV_FLOW_SILENT = 'true'
process.env.SUPPRESS_NO_CONFIG_WARNING = 'true'

// Load .env file from project root
// ? Use override:true to ensure .env values take precedence over system env vars
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
})

export interface DeployConfig {
  // Shelly device settings
  shellyIp: string
  shellyAuth?: {
    user: string
    password: string
  }

  // Script settings
  scriptName: string
  scriptId?: number
  autoStart: boolean
  enableDebug: boolean

  // Build settings
  outputPath: string

  // Upload settings
  chunkSize: number
  uploadDelay: number

  // Monitor settings
  websocketReconnectInterval: number
  logToFile: boolean
  logFilePath?: string
  killExistingMonitors: boolean

  // Safety settings
  stopExistingScripts: boolean
}

class ConfigManager {
  private config: DeployConfig

  constructor() {
    this.config = this.loadConfig()
    this.validateConfig()
  }

  private loadConfig(): DeployConfig {
    return {
      // Shelly device settings
      shellyIp: process.env.SHELLY_IP || '',
      shellyAuth: this.loadAuth(),

      // Script settings
      scriptName: process.env.SCRIPT_NAME || 'fridge-controller',
      scriptId: process.env.SCRIPT_ID ? parseInt(process.env.SCRIPT_ID) : undefined,
      autoStart: process.env.AUTO_START !== 'false',
      enableDebug: process.env.ENABLE_DEBUG === 'true',

      // Build settings
      // ? Note: Build is handled by tools/*.cjs pipeline, deploy just reads OUTPUT_PATH
      outputPath: process.env.OUTPUT_PATH || 'dist/main.js',

      // Upload settings
      chunkSize: parseInt(process.env.CHUNK_SIZE || '1024'),
      uploadDelay: parseInt(process.env.UPLOAD_DELAY || '50'),

      // Monitor settings
      websocketReconnectInterval: parseInt(process.env.WS_RECONNECT_INTERVAL || '3000'),
      logToFile: process.env.LOG_TO_FILE === 'true',
      logFilePath: process.env.LOG_FILE_PATH || `logs/${Date.now()}.log`,
      killExistingMonitors: process.env.KILL_EXISTING_MONITORS !== 'false', // Default: true

      // Safety settings
      stopExistingScripts: process.env.STOP_EXISTING_SCRIPTS !== 'false', // Default: true
    }
  }

  private loadAuth(): DeployConfig['shellyAuth'] {
    const user = process.env.SHELLY_USER
    const password = process.env.SHELLY_PASSWORD

    if (user && password) {
      return { user, password }
    }
    return undefined
  }

  private validateConfig(): void {
    const errors: string[] = []

    if (!this.config.shellyIp) {
      errors.push('SHELLY_IP is required')
    }

    if (!this.isValidIp(this.config.shellyIp)) {
      errors.push('SHELLY_IP must be a valid IP address')
    }

    if (this.config.chunkSize < 100 || this.config.chunkSize > 16384) {
      errors.push('CHUNK_SIZE must be between 100 and 16384')
    }

    if (errors.length > 0) {
      console.error('Configuration errors:')
      errors.forEach((error) => console.error(`  - ${error}`))
      process.exit(1)
    }
  }

  private isValidIp(ip: string): boolean {
    const pattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!pattern.test(ip)) return false

    const parts = ip.split('.')
    return parts.every((part) => {
      const num = parseInt(part)
      return num >= 0 && num <= 255
    })
  }

  get(): DeployConfig {
    return { ...this.config }
  }

  /**
   * Create a configuration file if it doesn't exist
   */
  static createEnvExample(): void {
    const envExamplePath = path.resolve(__dirname, '../../.env.example')

    // Skip if .env.example already exists (manually maintained)
    if (fs.existsSync(envExamplePath)) {
      return
    }

    const envContent = `# Shelly Device Configuration
SHELLY_IP=192.168.1.100           # IP address of your Shelly device

# Authentication (optional, if device has authentication enabled)
# SHELLY_USER=admin
# SHELLY_PASSWORD=your-password

# Script Configuration
SCRIPT_NAME=fridge-controller     # Name of the script on the device
# SCRIPT_ID=1                     # Fixed script ID (optional, auto-detected by name)
AUTO_START=true                   # Start script automatically after upload
ENABLE_DEBUG=true                 # Enable debug logging

# Build Configuration
# Used by: concat.cjs, minify.cjs, validate-bundle.cjs, deploy.ts
BUNDLE_PATH=dist/bundle.js        # Intermediate concatenated bundle (unminified)
OUTPUT_PATH=dist/main.js          # Final minified output for deployment

# Upload Configuration
CHUNK_SIZE=1024                   # Size of chunks for uploading (bytes)
UPLOAD_DELAY=50                   # Delay between chunks (ms)

# Monitor Configuration
WS_RECONNECT_INTERVAL=3000        # WebSocket reconnect interval (ms)
LOG_TO_FILE=false                 # Save logs to file
# LOG_FILE_PATH=logs/script.log   # Path for log file

# Safety Settings
KILL_EXISTING_MONITORS=true       # Kill existing monitor processes on start
STOP_EXISTING_SCRIPTS=true        # Stop other running scripts on device before deploy
`

    fs.writeFileSync(envExamplePath, envContent)
    console.log('Created .env.example file')
  }
}

// Singleton instance
export const config = new ConfigManager()

// Export for convenience
export const getConfig = () => config.get()

// Export the class
export { ConfigManager }
