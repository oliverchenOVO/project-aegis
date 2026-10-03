export interface RadioMessage { source: string; subject: string; claim: string; observedTick: number }
export interface NarrativeProvider { render(message: Readonly<RadioMessage>): Promise<string> }
export class TemplateNarrative implements NarrativeProvider { async render(message: Readonly<RadioMessage>): Promise<string> { return `${message.source}：${message.subject}，${message.claim}。`; } }
