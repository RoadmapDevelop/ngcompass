/**
 * no-output-native
 *
 * Disallows @Output() properties whose event names collide with native DOM events
 * (e.g., `click`, `change`, `blur`, `focus`, `input`, `submit`).
 *
 * When an Angular output shares a name with a native DOM event, the DOM event
 * can bubble up and trigger the Angular binding unexpectedly, causing hard-to-
 * debug double-firing or infinite loops.
 *
 * Tier P3 — Code Quality & Safety (Score: 12, Effort: 35hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { getDecoratorNameUnsafe, getLiteralStringValueUnsafe } from '../ast/matchers.js';
import type { PropertyDefinition, Identifier, CallExpression } from '../ast/types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Well-known native DOM events that Angular outputs must not shadow.
 * This list covers the most impactful collisions; expandable as needed.
 */
const NATIVE_EVENTS = new Set([
    'abort', 'animationend', 'animationiteration', 'animationstart',
    'auxclick', 'beforeinput', 'blur', 'cancel', 'canplay', 'canplaythrough',
    'change', 'click', 'close', 'compositionend', 'compositionstart',
    'compositionupdate', 'contextmenu', 'copy', 'cuechange', 'cut',
    'dblclick', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover',
    'dragstart', 'drop', 'durationchange', 'emptied', 'ended', 'error',
    'focus', 'focusin', 'focusout', 'fullscreenchange', 'fullscreenerror',
    'gotpointercapture', 'input', 'invalid', 'keydown', 'keypress', 'keyup',
    'load', 'loadeddata', 'loadedmetadata', 'loadstart', 'lostpointercapture',
    'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout',
    'mouseover', 'mouseup', 'paste', 'pause', 'play', 'playing',
    'pointercancel', 'pointerdown', 'pointerenter', 'pointerleave',
    'pointermove', 'pointerout', 'pointerover', 'pointerup', 'progress',
    'ratechange', 'reset', 'resize', 'scroll', 'securitypolicyviolation',
    'seeked', 'seeking', 'select', 'selectionchange', 'selectstart',
    'stalled', 'submit', 'suspend', 'timeupdate', 'toggle', 'touchcancel',
    'touchend', 'touchmove', 'touchstart', 'transitioncancel', 'transitionend',
    'transitionrun', 'transitionstart', 'volumechange', 'waiting',
    'webkitanimationend', 'webkitanimationiteration', 'webkitanimationstart',
    'webkittransitionend', 'wheel',
]);

export const noOutputNativeRule = createComponentRule(
    'no-output-native',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        const failures: RuleFailure[] = [];

        for (const member of body) {
            if (member.type !== 'PropertyDefinition') continue;
            const prop = member as PropertyDefinition;
            if (!prop.decorators || prop.decorators.length === 0) continue;

            for (const decorator of prop.decorators) {
                if (getDecoratorNameUnsafe(decorator) !== 'Output') continue;

                // Resolve the event name: alias from @Output('alias') or property name
                const propName = prop.key.type === 'Identifier'
                    ? (prop.key as Identifier).name
                    : undefined;

                let eventName = propName;

                // Check for @Output('alias')
                const expr = decorator.expression as any;
                if (expr?.type === 'CallExpression') {
                    const args = (expr as CallExpression).arguments;
                    if (args.length > 0) {
                        const alias = getLiteralStringValueUnsafe(args[0] as any);
                        if (alias) eventName = alias;
                    }
                }

                if (!eventName || !NATIVE_EVENTS.has(eventName.toLowerCase())) continue;

                const offset = decorator.start ?? decorator.span?.start ?? classNode.metadata.decoratorStart;
                const { line, column } = context.locator.location(offset);

                failures.push({
                    filePath: context.filePath,
                    message: `Output '${eventName}' collides with native DOM event. Rename it.`,
                    line,
                    column,
                    severity: 'high',
                    ruleName: 'no-output-native',
                    fix: RECOMMENDATIONS['no-output-native'],
                });
                break;
            }
        }

        return failures.length > 0 ? failures : null;
    }
);


