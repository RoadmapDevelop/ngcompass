# Rule Interface Design

## Overview

Rules are the core extension point of Angular Analyzer. Each rule is a pure function that analyzes TypeScript/Angular code and returns violations.

## Rule Structure
```typescript
interface Rule {
  metadata: RuleMetadata;
  analyze(context: RuleContext): Violation[];
}
```

## Metadata
```typescript
interface RuleMetadata {
  id: string;                    // 'no-browser-apis'
  name: string;                  // 'Detect browser-only APIs'
  description: string;           // Full description
  category: RuleCategory;        // Performance, SSR, etc.
  recommended: boolean;          // Include in recommended preset
  fixable: boolean;              // Can auto-fix violations
  requiresTypeInformation: boolean;
  requiresTemplateAnalysis: boolean;
  defaultSeverity: Severity;
  configSchema?: object;         // JSON Schema for options
}
```

## Context

The `RuleContext` provides everything a rule needs:
```typescript
interface RuleContext {
  sourceFile: SourceFile;        // TypeScript AST
  filePath: string;              // Absolute path
  program?: Program;             // For type information
  typeChecker?: TypeChecker;     // Type resolution
  configuration: object;         // Rule-specific config
  projectRoot: string;           // Project directory
  angularVersion?: string;       // Detected Angular version
}
```

## Return Value

Rules return an array of violations:
```typescript
interface Violation {
  ruleId: string;
  message: string;
  severity: Severity;
  location: Location;
  fix?: TextEdit[];
  relatedInformation?: RelatedInfo[];
}
```

## Example Rule
```typescript
export const noBrowserApis: Rule = {
  metadata: {
    id: 'no-browser-apis',
    name: 'No Browser APIs',
    description: 'Detects usage of browser-only APIs that break SSR',
    category: RuleCategory.SSR,
    recommended: true,
    fixable: false,
    requiresTypeInformation: false,
    requiresTemplateAnalysis: false,
    defaultSeverity: Severity.Error,
  },
  
  analyze(context: RuleContext): Violation[] {
    const violations: Violation[] = [];
    const { sourceFile, filePath } = context;
    
    // Analysis logic here
    // ...
    
    return violations;
  },
};
```

## Design Rationale

- **Pure functions**: Easy to test and parallelize
- **Rich context**: Rules have all information they need
- **Metadata-driven**: Enables dynamic rule loading and documentation
- **Flexible configuration**: Each rule can have custom options