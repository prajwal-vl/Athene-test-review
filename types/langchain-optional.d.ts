declare module "@langchain/anthropic" {
  export class ChatAnthropic {
    constructor(config: Record<string, unknown>);
  }
}

declare module "@langchain/google-genai" {
  export class ChatGoogleGenerativeAI {
    constructor(config: Record<string, unknown>);
  }
}
