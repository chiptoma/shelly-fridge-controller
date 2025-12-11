#!/usr/bin/env node
/**
 * Post-processor to unwrap IIFE bundle for Shelly compatibility
 * Shelly requires plain JavaScript with no module wrappers
 */

import * as fs from 'fs'

export function unwrapBundle(inputPath: string, outputPath: string): { success: boolean; size: number } {
  try {
    let code = fs.readFileSync(inputPath, 'utf8')

    // Extract sourcemap comment if present
    let sourcemapComment = ''
    const sourcemapMatch = code.match(/(\/\/# sourceMappingURL=.*)\s*$/)
    if (sourcemapMatch) {
      sourcemapComment = sourcemapMatch[1]
      code = code.replace(/(\/\/# sourceMappingURL=.*)\s*$/, '').trim()
    }

    const trimmed = code.trim()

    // Check for IIFE pattern with regex to handle variations
    // Match both arrow functions: (()=>{...})() and regular functions: (function(){...})()
    // Also handle "use strict"; prefix
    const patterns = [
      /^"use strict";\s*\(\s*function\s*\(\s*\)\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/,
      /^\(\s*\(\s*\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/,
      /^\(\s*function\s*\(\s*\)\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/,
      /^"use strict";\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/,
    ]

    let match = null
    for (const pattern of patterns) {
      match = trimmed.match(pattern)
      if (match) break
    }

    if (match) {
      code = match[1] // Extract the content between the IIFE wrapper
      // Re-add sourcemap comment if it was present
      if (sourcemapComment) {
        code = code + '\n' + sourcemapComment
      }
    }

    fs.writeFileSync(outputPath, code, 'utf8')
    const stats = fs.statSync(outputPath)

    return {
      success: true,
      size: stats.size,
    }
  } catch (error: any) {
    throw new Error(`Failed to unwrap bundle: ${error.message}`)
  }
}

// CLI mode
if (require.main === module) {
  const inputFile = process.argv[2]
  const outputFile = process.argv[3]

  if (!inputFile || !outputFile) {
    console.error('Usage: unwrap <input.js> <output.js>')
    process.exit(1)
  }

  try {
    const result = unwrapBundle(inputFile, outputFile)
    const sizeKB = (result.size / 1024).toFixed(2)
    console.log('✅ Unwrapped IIFE bundle')
    console.log(`📦 Output: ${outputFile} (${sizeKB}KB)`)
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }
}
