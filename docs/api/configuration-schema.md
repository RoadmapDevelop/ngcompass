# Configuration Schema

## File Location

Configuration files are discovered in this order:
1. `.ngcompassrc.json`
2. `.ngcompassrc.js`
3. `ngcompass.config.json`
4. `"angularAnalyzer"` key in `package.json`

## Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "extends": {
      "description": "Preset configurations to extend",
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ],
      "examples": ["recommended", "@ngcompass/recommended"]
    },
    "rules": {
      "description": "Rule configurations",
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          { "enum": ["error", "warning", "suggestion", "off"] },
          {
            "type": "array",
            "minItems": 1,
            "maxItems": 2,
            "items": [
              { "enum": ["error", "warning", "suggestion", "off"] },
              { "type": "object" }
            ]
          }
        ]
      }
    },
    "include": {
      "description": "File patterns to include",
      "type": "array",
      "items": { "type": "string" },
      "default": ["**/*.ts", "**/*.html"]
    },
    "exclude": {
      "description": "File patterns to exclude",
      "type": "array",
      "items": { "type": "string" },
      "default": ["**/node_modules/**", "**/dist/**"]
    },
    "cache": {
      "description": "Enable result caching",
      "type": "boolean",
      "default": true
    },
    "cacheLocation": {
      "description": "Cache directory",
      "type": "string",
      "default": "node_modules/.cache/ngcompass"
    },
    "maxWorkers": {
      "description": "Maximum worker threads",
      "type": "number",
      "minimum": 1
    }
  }
}
```

## Example Configuration
```json
{
  "extends": ["recommended"],
  "rules": {
    "no-browser-apis": "error",
    "prefer-onpush": ["warning", { "checkInterfaces": true }],
    "component-selector-prefix": ["error", { "prefix": "app" }]
  },
  "overrides": [
    {
      "files": ["*.spec.ts"],
      "rules": {
        "no-browser-apis": "off"
      }
    }
  ]
}
```