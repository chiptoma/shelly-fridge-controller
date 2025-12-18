# Deployment & Build Tools

A complete toolchain for building, deploying, and monitoring scripts on Shelly devices.

## Features

- **Automated Deployment**: Build and deploy scripts with a single command
- **Real-time Monitoring**: WebSocket-based log monitoring with color-coded output
- **Script Management**: Start, stop, delete, and check status of scripts
- **Smart Upload**: Automatic chunking for large scripts
- **Auto-reconnect**: Automatic reconnection for monitoring
- **Log Persistence**: Optional saving of logs to file

## Quick Start

### 1. Setup

Copy the example configuration:
```bash
cp .env.example .env
```

Edit `.env` with your Shelly device IP:
```env
SHELLY_IP=192.168.1.100  # Your Shelly device IP
SCRIPT_NAME=my-script    # Name for your script
```

### 2. Deploy and Monitor

Deploy your script and start monitoring:
```bash
npm run deploy:monitor
```

This will:
1. Build your JavaScript code (concat + minify)
2. Deploy it to the Shelly device
3. Start the script
4. Open real-time log monitoring

## Available Commands

### Main Commands

| Command | Description |
|---------|-------------|
| `npm run deploy` | Build and deploy script to device |
| `npm run deploy:upload` | Upload pre-built script (skip build) |
| `npm run deploy:monitor` | Deploy and immediately start monitoring |

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Concatenate and minify source files |
| `npm run build:concat` | Concatenate source files only |
| `npm run build:minify` | Minify and validate bundle |
| `npm run build:validate` | Validate bundle (patterns, syntax, VM test) |

### Device Commands

| Command | Description |
|---------|-------------|
| `npm run shelly:status` | Show script status and memory usage |
| `npm run shelly:status:watch` | Watch status continuously |
| `npm run shelly:monitor` | Monitor all device logs |
| `npm run shelly:monitor:app` | Monitor app logs only (filter system) |
| `npm run shelly:logs` | View recent error logs |
| `npm run shelly:start` | Start the script |
| `npm run shelly:stop` | Stop the running script |
| `npm run shelly:delete` | Delete script from device |
| `npm run shelly:list` | List all scripts on device |

### Quality Commands

| Command | Description |
|---------|-------------|
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm test` | Run unit tests |
| `npm test:coverage` | Run tests with coverage |

## Configuration

All settings are configured via environment variables in `.env`:

### Device Settings
- `SHELLY_IP`: IP address of your Shelly device (required)
- `SHELLY_USER`: Username for authentication (optional)
- `SHELLY_PASSWORD`: Password for authentication (optional)

### Script Settings
- `SCRIPT_NAME`: Name for the script on device
- `SCRIPT_ID`: Fixed script ID (optional, auto-detected)
- `AUTO_START`: Start script after upload (default: true)
- `ENABLE_DEBUG`: Enable debug websocket (default: true)

### Build Settings
- `BUNDLE_PATH`: Intermediate bundle path (default: dist/bundle.js)
- `OUTPUT_PATH`: Final minified output path (default: dist/main.js)

### Upload Settings
- `CHUNK_SIZE`: Size of upload chunks in bytes (default: 1024)
- `UPLOAD_DELAY`: Delay between chunks in ms (default: 50)

### Monitor Settings
- `WS_RECONNECT_INTERVAL`: WebSocket reconnect interval (default: 3000ms)
- `LOG_TO_FILE`: Save logs to file (default: false)
- `LOG_FILE_PATH`: Path for log file

## Build Pipeline

### How It Works

1. **Concatenation Phase** (`tools/concat.cjs`):
   - Source files concatenated in dependency order
   - Order defined in `FILE_ORDER` array within concat.cjs
   - ES module imports/exports stripped

2. **Minification Phase** (`tools/minify.cjs`):
   - Terser minifies bundle targeting ES5
   - Applies Shelly-safe transformations
   - Outputs to `dist/main.js`

3. **Validation Phase** (`tools/validate-bundle.cjs`):
   - Pattern validation (no forbidden syntax)
   - Syntax check (valid JavaScript)
   - VM execution test (runs without error)

### Concatenation Order

Files are concatenated in dependency order defined in `FILE_ORDER` within `tools/concat.cjs`. The order follows a tiered approach:

1. **Tier 0**: Pure data (constants)
2. **Tier 1**: Configuration
3. **Tier 2**: Utilities (math, KVS)
4. **Tier 3**: State management
5. **Tier 4**: Hardware (sensors)
6. **Tier 5**: Business logic (alarms, protection, features, metrics)
7. **Tier 6**: Reporting
8. **Tier 7**: Control logic
9. **Tier 8**: Main loop
10. **Tier 9**: External interfaces (MQTT)
11. **Tier 10**: Entry point (main)

## Development Workflow

### 1. Initial Setup
```bash
cp .env.example .env
# Edit .env with your device IP
```

### 2. Development Cycle
```bash
# Make code changes in src/
npm run deploy:monitor  # Deploy and monitor

# If script crashes
npm run shelly:status  # Check what happened
npm run shelly:stop    # Stop if needed

# Continue development...
npm run deploy:monitor  # Redeploy
```

### 3. Production Deployment
```bash
npm run build          # Build and validate
npm run deploy         # Deploy to device
npm run shelly:status  # Verify deployment
```

## Advanced Usage

### Deploy Options

```bash
ts-node tools/shelly-deploy/deploy.ts [options]

Options:
  -s, --status      Show script status
  -x, --stop        Stop the script
  -d, --delete      Delete the script
  -l, --list        List all scripts
  -b, --skip-build  Skip building, use existing file
  -u, --no-upload   Build only, don't upload
  --no-start        Don't start script after upload
  --start-only      Only start the script (no build/upload)
  -q, --quiet       Minimal output
```

### Monitor Options

```bash
ts-node tools/shelly-deploy/monitor.ts [options]

Options:
  -f, --filter <pattern>  Filter messages by regex pattern
  -l, --level <level>     Min log level (debug|info|warn|error)
  -s, --save              Save logs to file
  -t, --timestamp         Show timestamps
  -r, --raw               Show raw messages
```

### Examples

```bash
# Deploy without starting
npm run deploy -- --no-start

# Build only, no upload
npm run deploy -- --no-upload

# Filter for error messages
npm run shelly:monitor -- --filter "error" --level error

# Save logs with timestamps
npm run shelly:monitor -- --save --timestamp
```

## Architecture

```
tools/
├── concat.cjs           # Concatenates source files in dependency order
├── minify.cjs           # Terser minification with ES5 output
├── validate-bundle.cjs  # Bundle validation (patterns, syntax, VM)
└── shelly-deploy/
    ├── client.ts        # Shelly RPC client (HTTP API wrapper)
    ├── config.ts        # Configuration management
    ├── deploy.ts        # Deployment orchestrator
    ├── monitor.ts       # WebSocket log monitor
    ├── status.ts        # Device status display
    ├── logs.ts          # Error log viewer
    └── types.ts         # TypeScript type definitions
```

## API Reference

### ShellyRPCClient

Main client for communicating with Shelly devices:

```typescript
const client = new ShellyRPCClient({
  ip: '192.168.1.100',
  auth: { user: 'admin', password: 'pass' }
})

// Script management
await client.createScript(name)
await client.deleteScript(id)
await client.listScripts()
await client.startScript(id)
await client.stopScript(id)
await client.getStatus(id)

// Code upload
await client.putCode(id, code, append)
await client.uploadScript(id, code, chunkSize)
```

## Troubleshooting

### Connection Issues

If you can't connect to the device:
1. Check the IP address in `.env`
2. Ensure device is on the same network
3. Try pinging the device: `ping <SHELLY_IP>`
4. Check if authentication is required

### Script Not Running

If the script doesn't start:
1. Check memory usage: `npm run shelly:status`
2. Look for syntax errors in monitor output
3. Verify the script was uploaded: `npm run shelly:list`
4. Try manual start: `npm run shelly:start`

### WebSocket Connection Failed

If monitoring doesn't work:
1. Enable debug websocket: Set `ENABLE_DEBUG=true` in `.env`
2. Redeploy the script: `npm run deploy`
3. Check firewall settings
4. Verify WebSocket URL: `ws://<SHELLY_IP>/debug/log`

### Memory Issues

If device runs out of memory:
1. Check bundle size: `ls -la dist/main.js`
2. Review complex functions for optimization
3. Consider lazy initialization patterns
4. Check for memory leaks in callbacks
