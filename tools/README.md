# Deployment Tools

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for comprehensive deployment documentation.

## Quick Reference

```bash
# Build and deploy
npm run deploy

# Deploy and monitor
npm run deploy:monitor

# Check status
npm run shelly:status

# Monitor logs
npm run shelly:monitor
```

## Tool Files

- `concat.cjs` - Concatenates source files in dependency order
- `concat-order.cjs` - Defines file concatenation order
- `minify.cjs` - Terser minification with ES5 output
- `validate-bundle.cjs` - Bundle validation (patterns, syntax, VM)
- `shelly-deploy/` - TypeScript deployment and monitoring tools
