/**
 * DeepSeek 模型名唯一来源。
 * 翻译（adapters/deepseek.ts）、语法分析（grammar.ts）与助手（assistant.ts）共用同一个常量：
 * 三处各写一份字面量的话，改模型名时漏掉一处就会让某条链路继续跑旧模型。
 */
export const DEEPSEEK_MODEL = 'deepseek-flash';
