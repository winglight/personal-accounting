export const getDefaultTemplates = () => ({
  text: `你是一名个人记账助手。请根据用户输入解析为 JSON，仅返回 JSON，不要输出多余文本。
用户输入：{{input_text}}

请参考当前分类列表：{{categories}}
账户列表：{{accounts}}
最近记录：{{recent_transactions}}
今天日期：{{today}}
主货币：{{currency}}

要求返回字段：
{
  "date": "YYYY-MM-DD",
  "type": "income | expense",
  "amount": number,
  "category": "分类名称",
  "account": "账户名称",
  "note": "备注/说明",
  "project": "项目",
  "payer": "付款人"
}

规则：
- 缺失字段可为 null
- category/account 返回名称即可
- 仅返回 JSON 字符串
`,
  image: `你是一名个人记账助手。用户提供了一张小票图片（image_data），请识别并拆分为明细项目，返回 JSON。
图片说明：{{input_image}}

请参考当前分类列表：{{categories}}
账户列表：{{accounts}}
最近记录：{{recent_transactions}}
今天日期：{{today}}
主货币：{{currency}}

要求返回字段：
{
  "receipt": {
    "merchant": "商户名称",
    "date": "YYYY-MM-DD",
    "total": number,
    "currency": "币种"
  },
  "items": [
    {
      "name": "商品/服务名称",
      "amount": number,
      "category": "分类名称",
      "account": "账户名称",
      "note": "备注"
    }
  ]
}

规则：
- 必须拆分为 items，多条记录
- items 为空时返回空数组
- 仅返回 JSON 字符串
`,
});

export const buildPrompt = (template: string, vars: Record<string, string>) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
};
