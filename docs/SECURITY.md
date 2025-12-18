# Security Model

This document describes the security architecture for the Shelly Fridge Controller, a local IoT application with no cloud dependencies.

## Overview

The controller operates in a **local-only security model**:

- No cloud connectivity required
- No external API endpoints exposed
- All communication within trusted LAN
- No user authentication (single-user device)

## Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Trusted LAN                             │
│                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐ │
│  │   Shelly     │────▶│    MQTT      │◀────│  Home       │ │
│  │   Plus 1PM   │     │   Broker     │     │  Assistant  │ │
│  └──────────────┘     └──────────────┘     └─────────────┘ │
│         │                                                   │
│         │ HTTP (config only)                                │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │  Admin       │                                          │
│  │  Workstation │                                          │
│  └──────────────┘                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Communication Channels

### MQTT (Primary)

| Aspect | Configuration |
|--------|---------------|
| Protocol | MQTT 3.1.1 or 5.0 |
| Port | 1883 (plain) or 8883 (TLS) |
| Authentication | Username/password (Shelly config) |
| Topics | `fridge/status`, `fridge/cmd` |

### HTTP (Configuration Only)

| Aspect | Configuration |
|--------|---------------|
| Protocol | HTTP (local network only) |
| Port | 80 |
| Authentication | Shelly web UI password |
| Purpose | Script deployment, device config |

## MQTT Hardening

### Mosquitto Broker Configuration

Recommended `/etc/mosquitto/mosquitto.conf`:

```conf
# Disable anonymous access
allow_anonymous false

# Password file
password_file /etc/mosquitto/passwd

# ACL file
acl_file /etc/mosquitto/acl

# Bind to local interface only
listener 1883 127.0.0.1
listener 1883 192.168.1.0/24

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type warning
log_type error
```

### ACL Configuration

Example `/etc/mosquitto/acl`:

```conf
# Shelly device - publish status, subscribe to commands
user shelly_fridge
topic write fridge/status
topic read fridge/cmd

# Home Assistant - read status, write commands
user homeassistant
topic read fridge/status
topic write fridge/cmd

# Admin - full access for debugging
user admin
topic readwrite fridge/#
```

### TLS Configuration (Optional)

For TLS-enabled MQTT:

```conf
listener 8883
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key
cafile /etc/mosquitto/certs/ca.crt
require_certificate false
```

Note: Shelly devices support TLS but have limited certificate validation capabilities.

## KVS Security

The Key-Value Store persists configuration and state:

| Data Type | Sensitivity | Storage |
|-----------|-------------|---------|
| Temperature targets | Low | KVS (plaintext) |
| Timing parameters | Low | KVS (plaintext) |
| Runtime statistics | Low | KVS (plaintext) |
| Fault history | Low | KVS (plaintext) |

### What NOT to Store

Never store in KVS:

- Passwords or credentials
- API keys or tokens
- Network credentials (use Shelly's built-in WiFi config)
- Personally identifiable information

### KVS Keys

All application keys use the `fridge_` prefix:

```
fridge_cfg_ctl    # Control parameters
fridge_cfg_trb    # Turbo mode config
fridge_st_core    # Core state
fridge_st_stats   # Statistics
```

## Network Isolation Recommendations

### VLAN Segmentation

Isolate IoT devices on a dedicated VLAN:

```
VLAN 10: Trusted devices (workstations, phones)
VLAN 20: IoT devices (Shelly, sensors)
VLAN 30: Servers (MQTT broker, Home Assistant)
```

### Firewall Rules

Recommended rules for IoT VLAN:

```
# Allow MQTT to broker
ALLOW IoT -> Server:1883 TCP

# Allow NTP for time sync
ALLOW IoT -> NTP_Server:123 UDP

# Allow mDNS for discovery
ALLOW IoT -> 224.0.0.251:5353 UDP

# Block all other outbound
DENY IoT -> ANY

# Block IoT to trusted network
DENY IoT -> Trusted
```

### DNS Considerations

- Use local DNS server
- Block IoT devices from external DNS
- Monitor for unexpected DNS queries

## Script Security

### Deployment

- Scripts deployed via HTTP to device
- Use Shelly web UI password
- Deploy only from trusted workstation

### Runtime

- Scripts run in sandboxed mJS environment
- No filesystem access beyond KVS
- No shell command execution
- Limited memory (25KB heap)

### Code Integrity

- Source code in version control
- Bundle built deterministically
- No dynamic code loading
- No eval() or similar

## Monitoring

### MQTT Status Messages

The controller publishes status every loop tick:

```json
{
  "ts": 1702900000,
  "status": "COOLING",
  "air": 4.2,
  "evap": -8.5,
  "relay": true,
  "alarm": "NONE"
}
```

### Anomaly Detection

Monitor for:

- Unexpected status values
- Rapid state changes
- Alarm conditions
- Communication gaps

### Logging

- Device logs via Shelly debug console
- MQTT messages can be logged at broker
- No sensitive data in logs

## Incident Response

### Sensor Failure

1. System enters LIMP mode (blind cycling)
2. ALARM status published via MQTT
3. Fault logged to KVS
4. Manual intervention required

### Communication Loss

1. Controller continues autonomous operation
2. Last known configuration persists
3. State saved to KVS every 15 minutes
4. Recovers automatically on reconnection

### Suspected Compromise

1. Disconnect device from network
2. Review Shelly device logs
3. Review MQTT broker logs
4. Factory reset if necessary
5. Redeploy from verified source

## Security Checklist

### Initial Setup

- [ ] Change default Shelly web UI password
- [ ] Configure MQTT authentication
- [ ] Enable MQTT ACLs
- [ ] Place device on IoT VLAN
- [ ] Configure firewall rules

### Ongoing

- [ ] Monitor MQTT broker logs
- [ ] Review device status regularly
- [ ] Keep Shelly firmware updated
- [ ] Audit KVS contents periodically

### Updates

- [ ] Review code changes before deployment
- [ ] Test on non-production device first
- [ ] Deploy from version-controlled source
- [ ] Verify deployment success
