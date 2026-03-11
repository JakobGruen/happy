/**
 * Test for skill expansion message detection
 * 
 * This test verifies that skill expansion messages are correctly identified
 * and hidden from the main chat view.
 */

// Skill expansion content examples from the screenshot
const skillExpansionExamples = [
    `Base directory for this skill: /home/jakob/.claude/plugins/cache/claude-plugins-official/frontend-design/205b6e0b3036/skills/frontend-design

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics.

Design Thinking`,

    `Base directory: /some/path
    
This skill guides implementation of features with high design standards.`,

    `Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction.`
];

const nonSkillMessages = [
    "This is a regular agent response about something else.",
    "Let me redesign the machine/path selection using the frontend-design skill:",
    "The implementation is complete and ready for review."
];

/**
 * Helper to detect skill expansion messages.
 * Should be kept in sync with MessageView.tsx version.
 */
function isSkillExpansionMessage(text: string): boolean {
    if (!text) return false;
    // Check for skill-specific markers
    return (
        text.includes('Base directory for this skill:') ||
        text.includes('Base directory:') ||
        (text.includes('This skill guides') && text.includes('implementation')) ||
        (text.includes('Design Thinking') && text.length > 500) // Skill content is substantial
    );
}

// Test cases
console.log("Testing skill expansion detection:");
console.log("-----------------------------------");

skillExpansionExamples.forEach((example, i) => {
    const result = isSkillExpansionMessage(example);
    console.log(`✓ Skill example ${i + 1}: ${result ? 'DETECTED ✓' : 'FAILED ✗'}`);
});

console.log("\nTesting regular message detection:");
console.log("-----------------------------------");

nonSkillMessages.forEach((msg, i) => {
    const result = isSkillExpansionMessage(msg);
    console.log(`✓ Regular message ${i + 1}: ${!result ? 'NOT DETECTED ✓' : 'FAILED ✗'}`);
});
