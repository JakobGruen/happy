export function getToolDescriptor(toolName: string): { edit: boolean, exitPlan: boolean, askUserQuestion: boolean } {
    if (toolName === 'exit_plan_mode' || toolName === 'ExitPlanMode') {
        return { edit: false, exitPlan: true, askUserQuestion: false };
    }
    if (toolName === 'AskUserQuestion') {
        return { edit: false, exitPlan: false, askUserQuestion: true };
    }
    if (toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write' || toolName === 'NotebookEdit') {
        return { edit: true, exitPlan: false, askUserQuestion: false };
    }
    return { edit: false, exitPlan: false, askUserQuestion: false };
}