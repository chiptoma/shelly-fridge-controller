// ==============================================================================
// SHELLY DEPLOY TYPES
// Type definitions for the deployment tools.
// These types describe Shelly RPC API responses.
// ==============================================================================

// ----------------------------------------------------------
// JSON TYPES
// Internal types for JSON-RPC communication
// ----------------------------------------------------------

type JSONPrimitive = string | number | boolean | null
type JSONArray = JSONValue[]
interface JSONObject { [key: string]: JSONValue }

/** Any JSON-compatible value (used by RPC client) */
export type JSONValue = JSONPrimitive | JSONArray | JSONObject

// ----------------------------------------------------------
// SCRIPT API TYPES
// ----------------------------------------------------------

/**
 * Script configuration from Script.GetConfig
 */
export interface ScriptConfig {
  name: string
  enable: boolean
}

/**
 * Script status from Script.GetStatus
 */
export interface ScriptStatus {
  id: number
  running: boolean
  mem_used: number
  mem_peak: number
  mem_free: number
  cpu?: number
  errors?: string[]
}
