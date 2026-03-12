/**
 * Adaptive Tool Display System
 * 
 * Smart, context-aware rendering of tool input/output with:
 * - Automatic content type detection (code, JSON, markdown, etc.)
 * - Intelligent layout selection based on context (chat vs. permission modal)
 * - Collapsible expandable sections for large content
 * - Responsive variable formatting and preview generation
 */

export { AdaptiveToolDisplay } from './AdaptiveToolDisplay';
export { ToolIOTabs } from './ToolIOTabs';
export { VariableFormatter } from './VariableFormatter';
export { ContentPreview } from './ContentPreview';
export { useAdaptiveToolLayout } from './useAdaptiveToolLayout';
export { analyzeContent, getContentBadge, formatSize } from './contentAnalyzer';

export type { LayoutConfig, ContextInfo } from './useAdaptiveToolLayout';
export type { ContentAnalysis, ContentType } from './contentAnalyzer';
