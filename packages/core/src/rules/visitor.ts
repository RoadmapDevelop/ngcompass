/**
 * Shared recursive walker for Oxc AST.
 * 
 * @param node - The starting node
 * @param visitor - Callback for each node
 */
export function walkProgram(node: any, visitor: (node: any) => void | boolean): void {
    if (!node) return;

    // Call visitor. If it returns false, stop visiting children for this node.
    const shouldContinue = visitor(node);
    if (shouldContinue === false) return;

    // Recursively visit children based on Oxc AST structure
    for (const key of Object.keys(node)) {
        const val = node[key];
        if (Array.isArray(val)) {
            for (const child of val) {
                if (child && typeof child === 'object' && child.type) {
                    walkProgram(child, visitor);
                }
            }
        } else if (val && typeof val === 'object' && val.type) {
            walkProgram(val, visitor);
        }
    }
}
