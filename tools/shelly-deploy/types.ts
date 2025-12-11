// ==============================================================================
// * SHELLY DEPLOY TYPES
// ? Type definitions for the deployment tools.
// ? These types describe Shelly RPC API responses.
// ==============================================================================

// ----------------------------------------------------------
// * JSON TYPES
// ----------------------------------------------------------

/**
 * JSON-compatible primitive types
 */
export type JSONPrimitive = string | number | boolean | null

/**
 * JSON-compatible array
 */
export type JSONArray = JSONValue[]

/**
 * JSON-compatible object
 */
export interface JSONObject { [key: string]: JSONValue }

/**
 * Any JSON-compatible value
 */
export type JSONValue = JSONPrimitive | JSONArray | JSONObject

// ----------------------------------------------------------
// * SCRIPT API TYPES
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
